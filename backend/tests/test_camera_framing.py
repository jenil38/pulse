"""
Guards the landing-page camera choreography.

The cinematic scene is scroll-driven WebGL, so a bad keyframe cannot be caught
by a normal unit test — and it could not be verified visually during
development. Instead we check the camera *geometrically*: project every node
through each keyframe's real perspective frustum and assert the scene's subject
is actually on screen.

If someone retunes CAMERA_KEYS in frontend/lib/story.ts, they must update
backend/tools/check_camera_framing.py to match — and this test will fail loudly
if the new path stops framing its subject.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.tools.check_camera_framing import main  # noqa: E402


def test_every_scene_frames_its_subject():
    """Exit code 0 means all scenes framed their subject correctly."""
    assert main() == 0
