"""Run: python -m unittest discover -s scripts/geopdf (inside the venv)."""

import unittest

import cv2
import numpy as np

from huaraz import bearing, detect_arrows

# an arrow pointing right, ~25 x 20 px like the source map's
RIGHT = np.array([[0, 7], [14, 7], [14, 0], [25, 10], [14, 20], [14, 13], [0, 13]], dtype=np.int32)


def canvas_with(arrow: np.ndarray, at=(40, 40)) -> np.ndarray:
    img = np.full((120, 120, 3), 255, dtype=np.uint8)
    cv2.fillPoly(img, [arrow + np.array(at, dtype=np.int32)], (0, 0, 0))
    return img


def turned(points: np.ndarray, degrees: float) -> np.ndarray:
    """Rotate counter-clockwise on screen (image y grows downwards)."""
    a = np.radians(degrees)
    c = points.mean(axis=0)
    r = np.array([[np.cos(a), np.sin(a)], [-np.sin(a), np.cos(a)]])
    return np.round((points - c) @ r.T + c + 10).astype(np.int32)


def rotated(points: np.ndarray, quarter_turns: int) -> np.ndarray:
    pts = points.copy()
    for _ in range(quarter_turns):  # 90° clockwise in image coordinates (y down)
        pts = np.column_stack([pts[:, 1].max() - pts[:, 1], pts[:, 0]])
    return pts.astype(np.int32)


class ArrowTest(unittest.TestCase):
    def test_finds_the_direction_of_each_axis_arrow(self):
        expected = {0: (1.0, 0.0), 1: (0.0, 1.0), 2: (-1.0, 0.0), 3: (0.0, -1.0)}
        for turns, direction in expected.items():
            found = detect_arrows(canvas_with(rotated(RIGHT, turns)))
            self.assertEqual(len(found), 1, turns)
            self.assertAlmostEqual(found[0][2], direction[0], places=6)
            self.assertAlmostEqual(found[0][3], direction[1], places=6)

    def test_diagonal_arrows_keep_their_angle(self):
        found = detect_arrows(canvas_with(turned(RIGHT * 1.3, 45)))  # pointing up-right
        self.assertEqual(len(found), 1)
        self.assertAlmostEqual(found[0][2], np.sqrt(0.5), places=6)
        self.assertAlmostEqual(found[0][3], -np.sqrt(0.5), places=6)

    def test_street_angles_snap_to_15_degrees(self):
        found = detect_arrows(canvas_with(turned(RIGHT * 1.3, 32)))  # 32° counter-clockwise
        self.assertEqual(len(found), 1)
        self.assertAlmostEqual(found[0][2], np.cos(np.radians(30)), places=6)
        self.assertAlmostEqual(found[0][3], -np.sin(np.radians(30)), places=6)

    def test_ignores_ink_inside_a_pin(self):
        img = canvas_with(RIGHT)
        self.assertEqual(detect_arrows(img, exclude=[(40, 30, 80, 70)]), [])

    def test_ignores_solid_blocks_and_specks(self):
        img = np.full((120, 120, 3), 255, dtype=np.uint8)
        cv2.rectangle(img, (10, 10), (35, 35), (0, 0, 0), -1)  # solid square: too full
        cv2.rectangle(img, (60, 60), (64, 64), (0, 0, 0), -1)  # speck: too small
        self.assertEqual(detect_arrows(img), [])

    def test_bearing_is_clockwise_from_north(self):
        self.assertAlmostEqual(bearing((-77.5, -9.5), (-77.5, -9.4)), 0.0)
        self.assertAlmostEqual(bearing((-77.5, -9.5), (-77.4, -9.5)), 90.0)
        self.assertAlmostEqual(bearing((-77.5, -9.5), (-77.5, -9.6)), 180.0)
        self.assertAlmostEqual(bearing((-77.5, -9.5), (-77.6, -9.5)), 270.0)


if __name__ == "__main__":
    unittest.main()
