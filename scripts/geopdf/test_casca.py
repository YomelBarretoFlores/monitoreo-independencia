"""Run: python -m unittest discover -s scripts/geopdf (inside the venv)."""

import unittest

from shapely.geometry import box

from casca import count_exposed, match_influence
from common import M_PER_DEG_LAT, M_PER_DEG_LON


def square(x: float, y: float, side_m: float):
    """A square of side_m metres (in the extractor's own scale) whose south-west corner is x, y metres away."""
    lon = lambda m: -77.5 + m / M_PER_DEG_LON
    lat = lambda m: -9.5 + m / M_PER_DEG_LAT
    return box(lon(x), lat(y), lon(x + side_m), lat(y + side_m))


class MatchInfluenceTest(unittest.TestCase):
    def test_best_fit_wins_over_table_order(self):
        # zone A comes first in the table, but the 100 m square fits zone B exactly
        rows = [{"id": "ZS-1", "influenceHa": 1.02}, {"id": "ZS-2", "influenceHa": 1.0}]
        zones = {"ZS-1": square(0, 0, 10), "ZS-2": square(0, 0, 10)}
        cands = [square(10, 0, 100), square(-101, 0, 101)]  # 1.00 ha and 1.02 ha, both touching
        self.assertEqual(match_influence(rows, zones, cands), {"ZS-2": 0, "ZS-1": 1})

    def test_rejects_areas_that_do_not_touch_their_zone_or_differ_too_much(self):
        rows = [{"id": "ZS-1", "influenceHa": 1.0}]
        zones = {"ZS-1": square(0, 0, 10)}
        far = square(200, 0, 100)  # right area, 190 m away
        wrong = square(10, 0, 120)  # touching, but 1.44 ha
        self.assertEqual(match_influence(rows, zones, [far, wrong]), {})


class CountExposedTest(unittest.TestCase):
    def test_each_parcel_counts_once_in_its_highest_level(self):
        hazard = {"medio": square(0, 0, 300), "muy-alto": square(0, 0, 100)}
        parcels = [square(10, 10, 5), square(150, 150, 5), square(500, 500, 5)]
        self.assertEqual(
            count_exposed(parcels, hazard),
            {"muy-alto": 1, "alto": 0, "medio": 1, "fuera": 1, "total": 3},
        )


if __name__ == "__main__":
    unittest.main()
