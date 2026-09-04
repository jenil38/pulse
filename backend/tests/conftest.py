"""
Test isolation.

`workspace` picks its data file up from PULSE_DATA_DIR at import time, so this
has to run before anything imports the app — which is what conftest is for.
Pointing it at a throwaway directory keeps a test run from writing over a
developer's own saved systems.
"""
from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

os.environ.setdefault(
    "PULSE_DATA_DIR", os.path.join(tempfile.gettempdir(), "pulse-test-workspace")
)
