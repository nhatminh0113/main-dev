"""Several replicas running `alembic upgrade head` at the same moment must not conflict.

Each upgrade runs in its own process, exactly like backend pods starting together
(Alembic's context is process-global, so threads would not be a realistic test).
"""

import os
import subprocess
import sys

from alembic import command

from tests.conftest import BACKEND_DIR, TEST_DATABASE_URL, alembic_config


def test_parallel_upgrades_are_serialised() -> None:
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    env = {**os.environ, "DATABASE_URL": TEST_DATABASE_URL}
    try:
        procs = [
            subprocess.Popen(  # noqa: S603 - fixed arguments, no shell
                [sys.executable, "-m", "alembic", "upgrade", "head"],
                cwd=BACKEND_DIR,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            for _ in range(3)
        ]
        outputs = [p.communicate(timeout=60)[0] for p in procs]
        failed = [out for p, out in zip(procs, outputs, strict=True) if p.returncode != 0]
        assert not failed, failed[0]
        # Exactly one process applied the migrations; the others found head already.
        applied = sum("Running upgrade  -> 0001" in out for out in outputs)
        assert applied == 1
    finally:
        command.upgrade(cfg, "head")
