"""Self-test for scripts/check-migrations.py (stdlib unittest, no extra dependencies).

Run: python3 -m unittest discover -s scripts/tests -v

Fixture convention: every line the checker must report carries "# expect-unsafe"; a comment
"# expect-unsafe-next" marks the following line (used for invalid marker comments).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "check-migrations.py"
FIXTURES = HERE / "fixtures" / "migrations"
REAL_VERSIONS = HERE.parent.parent / "app" / "backend" / "alembic" / "versions"

SAFE = sorted(FIXTURES.glob("safe_*.py"))
UNSAFE = sorted(FIXTURES.glob("unsafe_*.py"))
REPORT_RE = re.compile(r"^(?P<path>\S+):(?P<line>\d+): UNSAFE (?P<op>\S+): ")

# Op name expected in the report for each unsafe fixture.
EXPECTED_OPS = {
    "unsafe_drop_column.py": {"drop_column"},
    "unsafe_drop_table.py": {"drop_table"},
    "unsafe_rename_column.py": {"alter_column"},
    "unsafe_not_null_existing.py": {"alter_column"},
    "unsafe_type_change.py": {"alter_column"},
    "unsafe_rename_table.py": {"rename_table"},
    "unsafe_drop_constraint.py": {"drop_constraint"},
    "unsafe_execute_drop.py": {"execute"},
    "unsafe_execute_rename.py": {"execute"},
    "unsafe_execute_alter_type.py": {"execute"},
    "unsafe_execute_set_not_null.py": {"execute"},
    "unsafe_execute_dynamic.py": {"execute"},
    "unsafe_execute_partial_dynamic.py": {"execute"},
    "unsafe_helper_drop.py": {"drop_table"},
    "unsafe_batch_drop_column.py": {"drop_column"},
    "unsafe_marker_too_short.py": {"marker", "drop_column"},
    "unsafe_marker_unknown_kind.py": {"marker", "drop_table"},
    "unsafe_marker_wrong_line.py": {"drop_column"},
}


def run(*paths: Path, github: bool = False) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if k != "GITHUB_ACTIONS"}
    if github:
        env["GITHUB_ACTIONS"] = "true"
    return subprocess.run(
        [sys.executable, str(SCRIPT), *map(str, paths)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )


def expected_lines(path: Path) -> set[int]:
    lines: set[int] = set()
    for number, text in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if "# expect-unsafe-next" in text:
            lines.add(number + 1)
        elif "# expect-unsafe" in text:
            lines.add(number)
    return lines


class FixtureCoverage(unittest.TestCase):
    def test_every_unsafe_fixture_has_expectations(self) -> None:
        self.assertEqual({p.name for p in UNSAFE}, set(EXPECTED_OPS))
        for path in UNSAFE:
            self.assertTrue(expected_lines(path), path.name)


class SafeFixtures(unittest.TestCase):
    def test_safe_fixtures_pass(self) -> None:
        for path in SAFE:
            with self.subTest(fixture=path.name):
                result = run(path)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertNotIn("UNSAFE", result.stdout)

    def test_ok_marker_is_reported_as_allowed(self) -> None:
        result = run(FIXTURES / "safe_marker_ok.py")
        self.assertEqual(result.stdout.count("allowed (ok)"), 2, result.stdout)

    def test_contract_markers_are_reported_as_allowed(self) -> None:
        for name, count in (
            ("safe_marker_contract.py", 1),
            ("safe_file_marker_contract.py", 2),
        ):
            with self.subTest(fixture=name):
                result = run(FIXTURES / name)
                self.assertEqual(
                    result.stdout.count("allowed (contract)"), count, result.stdout
                )

    def test_downgrade_is_ignored(self) -> None:
        # Every safe fixture drops something in downgrade(); none of it may be reported.
        result = run(FIXTURES / "safe_add_nullable_column.py")
        self.assertEqual(result.returncode, 0)
        self.assertNotIn("drop_column", result.stdout)


class UnsafeFixtures(unittest.TestCase):
    def test_unsafe_fixtures_fail_with_file_line_and_op(self) -> None:
        for path in UNSAFE:
            with self.subTest(fixture=path.name):
                result = run(path)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                reports = [
                    m for m in map(REPORT_RE.match, result.stdout.splitlines()) if m
                ]
                self.assertEqual(
                    {int(m["line"]) for m in reports}, expected_lines(path)
                )
                for match in reports:
                    self.assertTrue(match["path"].endswith(path.name), match.group(0))
                self.assertEqual({m["op"] for m in reports}, EXPECTED_OPS[path.name])

    def test_unsafe_message_has_hint(self) -> None:
        result = run(FIXTURES / "unsafe_drop_column.py")
        self.assertIn("# migration-safety: contract <reason>", result.stdout)

    def test_github_annotations(self) -> None:
        result = run(FIXTURES / "unsafe_drop_column.py", github=True)
        self.assertIn("::error file=", result.stdout)
        self.assertIn("unsafe_drop_column.py,line=8,", result.stdout)
        result = run(FIXTURES / "safe_marker_contract.py", github=True)
        self.assertIn("::warning file=", result.stdout)
        result = run(FIXTURES / "safe_marker_ok.py", github=True)
        self.assertIn("::notice file=", result.stdout)

    def test_one_bad_file_fails_the_whole_run(self) -> None:
        result = run(
            FIXTURES / "safe_add_nullable_column.py", FIXTURES / "unsafe_drop_table.py"
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("2 migration file(s) checked, 1 unsafe", result.stdout)


class Errors(unittest.TestCase):
    def test_parse_errors_exit_2(self) -> None:
        for name in ("broken_syntax.py.txt", "no_upgrade.py.txt", "does_not_exist.py"):
            with self.subTest(fixture=name):
                result = run(FIXTURES / name)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn("error:", result.stderr)


class RealMigrations(unittest.TestCase):
    def test_repository_migrations_pass(self) -> None:
        result = run(REAL_VERSIONS)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_default_path_is_the_repository_migrations(self) -> None:
        result = run()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("0 unsafe", result.stdout)


if __name__ == "__main__":
    unittest.main()
