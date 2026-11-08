"""Run: python -m unittest discover -s scripts/geopdf (from the repo root, inside the venv)."""

import unittest

from georef import fit, parse_viewports, utm_to_lonlat

# Verbatim /VP entries of the two source PDFs (other keys trimmed)
CASCA_VP = (
    "[<</Type/Viewport/BBox[28.3464 28.3464 2746.766 2355.586]/Name<FEFF004D00610070>"
    "/Measure<</Type/Measure/Subtype/GEO/Bounds[0 0 0 1 1 1 1 0 0 0]"
    "/GPTS[-9.51557 -77.5446 -9.47477 -77.5443 -9.47512 -77.49629 -9.51592 -77.49659]"
    "/LPTS[0 0 0 1 1 1 1 0]>>>>"
    "<</Type/Viewport/BBox[2775.1126 1763.386 3342.0406 2355.586]/Measure<</Type/Measure"
    "/GPTS[-10.91394 -79.16991 -7.89854 -79.13388 -7.9 -76.0 -10.9 -76.0]/LPTS[0 0 0 1 1 1 1 0]>>>>]"
)
CASCA_HEIGHT = 2383.93212890625
HUARAZ_VP = (
    "[<</Type/Viewport/BBox[18.95837 1163.3593 1656.0972 18.55669]/Measure<</Type/Measure"
    "/Subtype/GEO/Bounds[1 1 0 1 0 0 1 0]"
    "/GPTS[-9.54828 -77.53841 -9.50392 -77.53808 -9.50414 -77.50683 -9.54851 -77.50715]"
    "/LPTS[1 1 0 1 0 0 1 0]>>>>]"
)
HUARAZ_HEIGHT = 1190.2393798828125


class GeorefTest(unittest.TestCase):
    def test_parses_every_viewport(self):
        vps = parse_viewports(CASCA_VP)
        self.assertEqual(len(vps), 2)
        self.assertEqual(vps[0].bbox, (28.3464, 28.3464, 2746.766, 2355.586))
        self.assertEqual(vps[0].gpts[0], (-9.51557, -77.5446))

    def test_fit_maps_the_frame_corners_within_two_metres(self):
        g = fit(parse_viewports(CASCA_VP)[0], CASCA_HEIGHT)
        self.assertLess(g.residual_m, 2)
        # bottom-left of the frame (page y grows downwards)
        lon, lat = g(28.3464, CASCA_HEIGHT - 28.3464)
        self.assertAlmostEqual(lon, -77.5446, places=4)
        self.assertAlmostEqual(lat, -9.51557, places=4)

    def test_rotated_frame_keeps_north_on_the_left(self):
        g = fit(parse_viewports(HUARAZ_VP)[0], HUARAZ_HEIGHT)
        self.assertLess(g.residual_m, 2)
        left = g(30, 600)
        right = g(1600, 600)
        top = g(800, 40)
        bottom = g(800, 1150)
        self.assertGreater(left[1], right[1])  # left is further north
        self.assertGreater(top[0], bottom[0])  # top is further east

    def test_utm_origin_and_symmetry(self):
        lon, lat = utm_to_lonlat(500_000, 10_000_000)
        self.assertAlmostEqual(lon, -75, places=9)
        self.assertAlmostEqual(lat, 0, places=9)
        east = utm_to_lonlat(600_000, 8_950_000)
        west = utm_to_lonlat(400_000, 8_950_000)
        self.assertAlmostEqual(east[0] + 75, -(west[0] + 75), places=9)
        self.assertAlmostEqual(east[1], west[1], places=9)

    def test_utm_matches_the_casca_frame(self):
        # Casca zone ZS-1 (table: E 225,654.82 N 8,949,151.12) lies inside the Casca frame
        lon, lat = utm_to_lonlat(225_654.82, 8_949_151.12)
        self.assertTrue(-77.5446 < lon < -77.49629)
        self.assertTrue(-9.51592 < lat < -9.47477)


if __name__ == "__main__":
    unittest.main()
