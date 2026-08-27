#!/usr/bin/env python3
"""Portable Skill wrapper for inkling's canonical run_short.py."""

from __future__ import annotations

import os
import runpy
from pathlib import Path


def find_project() -> Path:
    configured = os.environ.get("INKLING_PROJECT")
    if configured:
        return Path(configured).expanduser().resolve()

    candidates = [Path.cwd(), *Path(__file__).resolve().parents]
    for candidate in candidates:
        runner = candidate / "scripts/run_short.py"
        if (candidate / "package.json").exists() and runner.exists():
            return candidate

    raise SystemExit(
        "inkling project not found. Run inside the project or set "
        "INKLING_PROJECT=/absolute/path/to/project."
    )


if __name__ == "__main__":
    project = find_project()
    os.environ.setdefault("INKLING_PROJECT", str(project))
    runpy.run_path(str(project / "scripts/run_short.py"), run_name="__main__")
