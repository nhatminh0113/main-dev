#!/usr/bin/env python3
"""Static expand-only check for Alembic migrations (run locally and in CI).

The backend runs `alembic upgrade head` in its entrypoint. If a release fails its readiness
probe, `helm --rollback-on-failure` restores the previous pods but NOT the schema, so every
`upgrade()` must stay compatible with the previous release (expand). Destructive "contract"
changes ship in a later release and must be marked explicitly.

Only `upgrade()` (and module-level helpers it calls) is scanned; `downgrade()` may drop things.
Reported as unsafe:
  - op.drop_column, op.drop_table, op.rename_table
  - op.drop_constraint not followed by re-creating the same constraint name on the same table
  - op.alter_column with new_column_name, type_, or nullable=False on a pre-existing column
  - op.execute with DROP / RENAME / ALTER ... TYPE / SET NOT NULL, or with dynamic SQL

Markers (reason of at least 10 characters):
  # migration-safety: ok <reason>            statement: trailing, or in the comment block above
  # migration-safety: contract <reason>      statement: intentional contract change
  # migration-safety-file: ok|contract <reason>   column 0, outside functions: whole file

Usage: scripts/check-migrations.py [PATH ...]   (default: app/backend/alembic/versions)
Exit codes: 0 clean, 1 unsafe finding or invalid marker, 2 usage or parse error.
"""

from __future__ import annotations

import ast
import io
import os
import re
import sys
import tokenize
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PATH = REPO_ROOT / "app" / "backend" / "alembic" / "versions"

MARKER_RE = re.compile(
    r"^#\s*migration-safety(?P<file>-file)?:\s*(?P<kind>ok|contract)\s+(?P<reason>\S.{9,})$"
)
HINT = (
    "make it expand-only, or mark an intentional contract migration with "
    "'# migration-safety: contract <reason>'"
)
ALWAYS_UNSAFE = {
    "drop_column": "drops a column the previous release may still read",
    "drop_table": "drops a table the previous release may still read",
    "rename_table": "renames a table the previous release still uses",
}
RECREATE_OPS = {
    "create_check_constraint",
    "create_foreign_key",
    "create_unique_constraint",
    "create_primary_key",
}
SQL_RULES = [
    (re.compile(r"\bDROP\b(?!\s+(?:NOT\s+NULL|INDEX)\b)", re.IGNORECASE), "DROP"),
    (re.compile(r"\bRENAME\b", re.IGNORECASE), "RENAME"),
    (re.compile(r"\bALTER\b[^;]*?\bTYPE\b", re.IGNORECASE), "ALTER ... TYPE"),
    (re.compile(r"\bSET\s+NOT\s+NULL\b", re.IGNORECASE), "SET NOT NULL"),
]


class CheckError(Exception):
    """Usage or parse error (exit code 2)."""


@dataclass
class Finding:
    line: int
    op: str
    message: str
    allowed: str | None = None  # "ok" / "contract" when a marker covers it
    reason: str = ""


@dataclass
class Marker:
    line: int
    kind: str
    reason: str
    file_level: bool
    used: bool = False


@dataclass
class OpCall:
    node: ast.Call
    method: str
    args: list[ast.expr]  # positional args, with the batch table literal prepended
    kwargs: dict[str, ast.expr]


def _literal(node: ast.expr | None) -> str | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _collect_scope(tree: ast.Module) -> list[ast.FunctionDef]:
    """upgrade() plus module-level helpers it calls by bare name (transitively)."""
    funcs = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    if "upgrade" not in funcs:
        raise CheckError("no top-level upgrade() function")
    scope, todo, seen = [], ["upgrade"], set()
    while todo:
        name = todo.pop()
        if name in seen or name == "downgrade" or name not in funcs:
            continue
        seen.add(name)
        scope.append(funcs[name])
        for node in ast.walk(funcs[name]):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                todo.append(node.func.id)
    return scope


def _batch_aliases(func: ast.FunctionDef) -> dict[str, str | None]:
    """`with op.batch_alter_table("t") as alias:` -> {alias: "t"}."""
    aliases: dict[str, str | None] = {}
    for node in ast.walk(func):
        if not isinstance(node, ast.With):
            continue
        for item in node.items:
            call = item.context_expr
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr == "batch_alter_table"
                and isinstance(item.optional_vars, ast.Name)
            ):
                table = _literal(call.args[0]) if call.args else None
                if table is None:
                    table = _literal(
                        next(
                            (k.value for k in call.keywords if k.arg == "table_name"),
                            None,
                        )
                    )
                aliases[item.optional_vars.id] = table
    return aliases


def _op_calls(scope: list[ast.FunctionDef]) -> list[OpCall]:
    calls: list[OpCall] = []
    for func in scope:
        aliases = _batch_aliases(func)
        for node in ast.walk(func):
            if not (
                isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            ):
                continue
            receiver = node.func.value
            if not isinstance(receiver, ast.Name):
                continue
            args = list(node.args)
            if receiver.id in aliases:
                args = [ast.Constant(aliases[receiver.id]), *args]
            elif receiver.id != "op":
                continue
            kwargs = {k.arg: k.value for k in node.keywords if k.arg}
            calls.append(OpCall(node, node.func.attr, args, kwargs))
    calls.sort(key=lambda c: (c.node.lineno, c.node.col_offset))
    return calls


def _arg(call: OpCall, index: int, name: str) -> ast.expr | None:
    if len(call.args) > index:
        return call.args[index]
    return call.kwargs.get(name)


def _column_name(node: ast.expr | None) -> str | None:
    """Name of `sa.Column("c", ...)` / `Column("c", ...)`."""
    if not isinstance(node, ast.Call):
        return None
    func = node.func
    name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
    if name != "Column" or not node.args:
        return None
    return _literal(node.args[0])


def _sql_strings(call: OpCall) -> list[str]:
    roots = [*call.node.args, *(k.value for k in call.node.keywords)]
    return [
        n.value
        for root in roots
        for n in ast.walk(root)
        if isinstance(n, ast.Constant) and isinstance(n.value, str)
    ]


def _is_static_str(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant):
        return isinstance(node.value, str)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _is_static_str(node.left) and _is_static_str(node.right)
    return False


def _has_partial_dynamic_sql(call: OpCall) -> bool:
    """SQL text built from a constant plus a runtime value (concat, %, f-string, .format)."""
    roots = [*call.node.args, *(k.value for k in call.node.keywords)]
    for root in roots:
        for n in ast.walk(root):
            if isinstance(n, ast.JoinedStr) and any(
                isinstance(v, ast.FormattedValue) for v in n.values
            ):
                return True
            if isinstance(n, ast.BinOp) and isinstance(n.op, (ast.Add, ast.Mod)):
                if not _is_static_str(n) and any(
                    isinstance(side, (ast.Constant, ast.JoinedStr))
                    for side in (n.left, n.right)
                ):
                    return True
            if (
                isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute)
                and n.func.attr == "format"
                and isinstance(n.func.value, ast.Constant)
            ):
                return True
    return False


def _analyse(calls: list[OpCall]) -> list[Finding]:
    findings: list[Finding] = []
    created_tables: set[str] = set()
    added_columns: set[tuple[str, str]] = set()
    for i, call in enumerate(calls):
        line, method = call.node.lineno, call.method
        if method == "create_table":
            table = _literal(_arg(call, 0, "table_name"))
            if table:
                created_tables.add(table)
        elif method == "add_column":
            table = _literal(_arg(call, 0, "table_name"))
            column = _column_name(_arg(call, 1, "column"))
            if table and column:
                added_columns.add((table, column))
        elif method in ALWAYS_UNSAFE:
            findings.append(Finding(line, method, ALWAYS_UNSAFE[method]))
        elif method == "drop_constraint":
            name = _literal(_arg(call, 0, "constraint_name"))
            table = _literal(_arg(call, 1, "table_name"))
            recreated = name is not None and any(
                later.method in RECREATE_OPS
                and _literal(_arg(later, 0, "constraint_name")) == name
                and _literal(
                    _arg(
                        later,
                        1,
                        "source_table"
                        if later.method == "create_foreign_key"
                        else "table_name",
                    )
                )
                == table
                for later in calls[i + 1 :]
            )
            if not recreated:
                findings.append(
                    Finding(
                        line,
                        method,
                        f"drops constraint {name or '<dynamic>'} without re-creating it",
                    )
                )
        elif method == "alter_column":
            table = _literal(_arg(call, 0, "table_name"))
            column = _literal(_arg(call, 1, "column_name"))
            target = f"{table}.{column}"
            if "new_column_name" in call.kwargs:
                findings.append(Finding(line, method, f"renames column {target}"))
            if "type_" in call.kwargs:
                findings.append(
                    Finding(
                        line,
                        method,
                        f"changes the type of {target} (may narrow or break reads)",
                    )
                )
            nullable = call.kwargs.get("nullable")
            if (
                isinstance(nullable, ast.Constant)
                and nullable.value is False
                and table not in created_tables
                and (table, column) not in added_columns
            ):
                findings.append(
                    Finding(
                        line, method, f"sets NOT NULL on pre-existing column {target}"
                    )
                )
        elif method == "execute":
            strings = _sql_strings(call)
            if not strings or _has_partial_dynamic_sql(call):
                findings.append(Finding(line, method, "dynamic SQL cannot be verified"))
                continue
            sql = " ".join(" ".join(strings).split())
            for pattern, keyword in SQL_RULES:
                if pattern.search(sql):
                    findings.append(
                        Finding(line, method, f"raw SQL contains {keyword}")
                    )
    return findings


def _markers(
    source: str, tree: ast.Module
) -> tuple[list[Marker], list[int], dict[int, bool]]:
    """Return markers, lines of invalid markers, and {line: is_comment_only}."""
    func_ranges = [
        (n.lineno, n.end_lineno or n.lineno)
        for n in tree.body
        if isinstance(n, ast.FunctionDef | ast.AsyncFunctionDef)
    ]
    markers: list[Marker] = []
    invalid: list[int] = []
    code_lines: set[int] = set()
    comment_lines: set[int] = set()
    skip = {
        tokenize.NL,
        tokenize.NEWLINE,
        tokenize.INDENT,
        tokenize.DEDENT,
        tokenize.ENDMARKER,
    }
    for tok in tokenize.generate_tokens(io.StringIO(source).readline):
        if tok.type == tokenize.COMMENT:
            line, col = tok.start
            comment_lines.add(line)
            if "migration-safety" not in tok.string:
                continue
            match = MARKER_RE.match(tok.string.strip())
            if not match:
                invalid.append(line)
                continue
            file_level = bool(match["file"])
            if file_level and (col != 0 or any(a <= line <= b for a, b in func_ranges)):
                invalid.append(line)
                continue
            markers.append(
                Marker(line, match["kind"], match["reason"].strip(), file_level)
            )
        elif tok.type not in skip:
            code_lines.update(range(tok.start[0], tok.end[0] + 1))
    comment_only = {line: line not in code_lines for line in comment_lines}
    return markers, invalid, comment_only


def _attach(
    findings: list[Finding],
    markers: list[Marker],
    comment_only: dict[int, bool],
    end_lines: dict[int, int],
) -> None:
    by_line = {m.line: m for m in markers if not m.file_level}
    file_marker = next((m for m in markers if m.file_level), None)
    for finding in findings:
        candidates = []
        # Trailing comment on any line of the call (formatters move it to the closing paren).
        for line in range(finding.line, end_lines.get(finding.line, finding.line) + 1):
            if line in by_line:
                candidates.append(by_line[line])
        line = finding.line - 1
        while comment_only.get(line):  # contiguous comment-only block above
            if line in by_line:
                candidates.append(by_line[line])
            line -= 1
        marker = candidates[0] if candidates else file_marker
        if marker:
            marker.used = True
            finding.allowed, finding.reason = marker.kind, marker.reason


def _display(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def check_file(path: Path) -> tuple[list[Finding], list[int], list[Marker]]:
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except (OSError, SyntaxError, ValueError) as exc:
        raise CheckError(f"{_display(path)}: cannot parse: {exc}") from exc
    try:
        scope = _collect_scope(tree)
    except CheckError as exc:
        raise CheckError(f"{_display(path)}: {exc}") from exc
    calls = _op_calls(scope)
    end_lines: dict[int, int] = {}
    for call in calls:
        start, end = call.node.lineno, call.node.end_lineno or call.node.lineno
        end_lines[start] = max(end_lines.get(start, start), end)
    findings = _analyse(calls)
    markers, invalid, comment_only = _markers(source, tree)
    _attach(findings, markers, comment_only, end_lines)
    return findings, invalid, markers


def _files(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw in paths:
        path = Path(raw)
        if path.is_dir():
            files.extend(
                p
                for p in sorted(path.glob("*.py"))
                if p.name != "__init__.py" and p.is_file()
            )
        elif path.is_file():
            files.append(path)
        else:
            raise CheckError(f"{raw}: no such file or directory")
    return files


def main(argv: list[str]) -> int:
    annotate = os.environ.get("GITHUB_ACTIONS") == "true"
    try:
        files = _files(argv or [str(DEFAULT_PATH)])
        results = [(path, *check_file(path)) for path in files]
    except CheckError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    unsafe = allowed = 0
    for path, findings, invalid, markers in results:
        shown = _display(path)
        for line in invalid:
            unsafe += 1
            msg = "invalid marker: expected '# migration-safety: ok|contract <reason of 10+ chars>'"
            print(f"{shown}:{line}: UNSAFE marker: {msg}")
            if annotate:
                print(f"::error file={shown},line={line},title=migration-safety::{msg}")
        for f in findings:
            if f.allowed:
                allowed += 1
                print(f"{shown}:{f.line}: allowed ({f.allowed}) {f.op}: {f.reason}")
                if annotate:
                    level = "warning" if f.allowed == "contract" else "notice"
                    print(
                        f"::{level} file={shown},line={f.line},title=migration-safety::"
                        f"{f.allowed} {f.op}: {f.reason}"
                    )
            else:
                unsafe += 1
                print(f"{shown}:{f.line}: UNSAFE {f.op}: {f.message}; {HINT}")
                if annotate:
                    print(
                        f"::error file={shown},line={f.line},title=migration-safety::"
                        f"{f.op}: {f.message}"
                    )
        for m in markers:
            if not m.used:
                print(f"{shown}:{m.line}: warning: unused marker")
    print(
        f"{len(results)} migration file(s) checked, {unsafe} unsafe, {allowed} allowed"
    )
    return 1 if unsafe else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
