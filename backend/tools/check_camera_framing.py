"""
Landing camera framing check.

The cinematic scene could not be verified visually during development (the
browser pane was not compositing, which pauses requestAnimationFrame). This
script verifies the camera path *geometrically* instead: for every scene
keyframe it builds the real perspective frustum and asks

    "is the subject this scene is about actually on screen, and how much of
     the frame does it fill?"

Run:  python backend/tools/check_camera_framing.py
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.engine import build_topology  # noqa: E402
from backend.app.engine.layout import compute_layout  # noqa: E402
from backend.app.engine.states import NodeType  # noqa: E402

# Must mirror frontend/lib/story.ts CAMERA_KEYS and the Canvas fov.
FOV_DEG = 45.0
ASPECT = 16 / 9

CAMERA_KEYS = [
    (0.00, (0, 0, 26), (0, 0, 0), "1 pinhole"),
    (0.12, (-40, 14, 90), (-30, 4, 0), "2 sources appear"),
    (0.26, (-14, 20, 96), (-6, 0, 0), "3 flow along the pipe"),
    (0.38, (-6, 62, 196), (10, 0, 0), "4 healthy whole system"),
    (0.50, (-46, 24, 74), (-42, 8, -34), "5 failure at the source"),
    (0.64, (0, 78, 232), (10, 0, 0), "6 blast radius pull-back"),
    (0.76, (30, 34, 130), (52, 0, -10), "7 business impact"),
    (0.88, (-10, 56, 186), (10, 0, 0), "8 recovery"),
    (1.00, (-6, 66, 210), (10, 0, 0), "9 settle wide"),
]

# What each scene is *about* — the nodes that must be visible.
SUBJECTS = {
    "2 sources appear": lambda g, i: g.node(i).type is NodeType.SOURCE,
    "5 failure at the source": lambda g, i: i == "src_payments",
    "7 business impact": lambda g, i: g.node(i).type in (NodeType.DASHBOARD,
                                                         NodeType.TEAM,
                                                         NodeType.BUSINESS_PROCESS),
}
# Scenes that should frame essentially the entire system.
WHOLE_SYSTEM = {"4 healthy whole system", "6 blast radius pull-back",
                "8 recovery", "9 settle wide"}


def story_reveal(p: float) -> float:
    """Mirrors storyState().reveal in frontend/lib/story.ts."""
    if p <= 0.08:
        return 0.0
    if p >= 0.34:
        return 1.0
    return (p - 0.08) / (0.34 - 0.08)


def appear(reveal: float, reveal_at: float) -> float:
    """Mirrors the per-node appearance ramp in CinematicScene.StoryNode."""
    return max(0.0, min((reveal - reveal_at * 0.85) * 6.0, 1.0))


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _norm(v):
    m = math.sqrt(_dot(v, v)) or 1.0
    return (v[0] / m, v[1] / m, v[2] / m)


def view_basis(eye, target, up=(0, 1, 0)):
    """Right-handed camera basis, matching three.js lookAt (-Z forward)."""
    fwd = _norm(_sub(target, eye))       # direction camera looks
    right = _norm(_cross(fwd, up))
    true_up = _cross(right, fwd)
    return right, true_up, fwd


def to_camera_space(p, eye, basis):
    right, true_up, fwd = basis
    d = _sub(p, eye)
    # depth is positive in front of the camera
    return (_dot(d, right), _dot(d, true_up), _dot(d, fwd))


def in_frustum(cam_pt, tan_v, tan_h):
    x, y, depth = cam_pt
    if depth <= 0.1:
        return False
    return abs(x) <= depth * tan_h and abs(y) <= depth * tan_v


def main() -> int:
    g = build_topology()
    pos = compute_layout(g)
    points = {i: (p.x, p.y, p.z) for i, p in pos.items()}

    tan_v = math.tan(math.radians(FOV_DEG) / 2)
    tan_h = tan_v * ASPECT

    total = len(points)
    failures: list[str] = []

    # Nodes materialise left-to-right, in the direction data flows.
    xs = [p[0] for p in points.values()]
    x_min, x_span = min(xs), (max(xs) - min(xs)) or 1.0
    reveal_at = {i: (p[0] - x_min) / x_span for i, p in points.items()}

    print(f"Camera framing check — {total} nodes, fov {FOV_DEG}deg, aspect {ASPECT:.2f}")
    print("(counts only nodes that have actually materialised at that scroll point)\n")
    print(f"{'scene':<28}{'on screen':>11}{'subject':>22}  verdict")
    print("-" * 79)

    for at, eye, look, label in CAMERA_KEYS:
        basis = view_basis(eye, look)
        reveal = story_reveal(at)
        # A node is on screen only if it has appeared AND is inside the frustum.
        visible = {
            i for i, p in points.items()
            if appear(reveal, reveal_at[i]) > 0.5
            and in_frustum(to_camera_space(p, eye, basis), tan_v, tan_h)
        }
        pct = 100.0 * len(visible) / total

        verdict = "ok"
        subject_txt = "-"

        if label in SUBJECTS:
            pred = SUBJECTS[label]
            subject = {i for i in points if pred(g, i)}
            seen = subject & visible
            subject_txt = f"{len(seen)}/{len(subject)}"
            # The scene's subject must be substantially on screen.
            if len(seen) < max(1, int(0.6 * len(subject))):
                verdict = "SUBJECT NOT FRAMED"
                failures.append(f"{label}: only {len(seen)}/{len(subject)} subject nodes in frame")

        if label in WHOLE_SYSTEM:
            subject_txt = f"{len(visible)}/{total}"
            if pct < 85:
                verdict = "SYSTEM CROPPED"
                failures.append(f"{label}: only {pct:.0f}% of the system in frame")

        if label == "1 pinhole":
            # The opening is deliberately intimate — it must NOT show everything.
            subject_txt = f"{len(visible)}/{total}"
            if pct > 25:
                verdict = "OPENING TOO WIDE"
                failures.append(f"{label}: {pct:.0f}% visible, opening should be intimate")

        print(f"{label:<28}{pct:>9.0f}%{subject_txt:>22}  {verdict}")

    print()
    if failures:
        print("FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("All scenes frame their subject correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
