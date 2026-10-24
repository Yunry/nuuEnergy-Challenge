"""Engine behaviour through the same path as the browser: customer_input -> prepare -> engine.

run: python3 -m unittest discover -s tests -v   (or npm test)
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "src" / "decision_engine"), str(ROOT / "scripts")]

import engine  # noqa: E402
import prepare  # noqa: E402
import scenarios  # noqa: E402
from evaluate import evaluate  # noqa: E402

BASE = {"construction_year": 2005, "floor_area_m2": 180, "heat_distribution": "underfloor", "annual_consumption_kwh": 15500,
        "consumption_full_year": True, "energy_carrier": "gas", "persons_in_household": 3, "hot_water_via_heating": True, "solar_thermal": False}


def assess(**changes):
    return engine.run("TEST", prepare.run({**BASE, **changes}))


class Engine(unittest.TestCase):
    def test_underfloor_home_is_green_with_official_costs(self):
        o = assess()
        self.assertEqual(o["decision"]["verdict"], "green")
        self.assertEqual(o["01_heat_load"]["heating_load_kw"]["by_area"], [7.2, 10.8])
        self.assertEqual(o["03_operating_cost"]["cost_eur_per_year"]["today"], 1705)
        self.assertEqual(o["03_operating_cost"]["cost_eur_per_year"]["heat_pump"], [887, 887])

    def test_development_labels_never_reach_the_engine(self):
        steps = prepare.run({**BASE, "expected_verdict": "red", "reference_heating_load_kw": 999})
        for step in steps.values():
            self.assertNotIn("expected_verdict", step["fields"])
            self.assertNotIn("reference_heating_load_kw", step["fields"])

    def test_missing_answers_give_yellow_and_questions_not_zeros(self):
        o = engine.run("TEST", prepare.run({}))
        self.assertEqual(o["decision"]["verdict"], "yellow")
        self.assertIsNone(o["01_heat_load"]["heating_load_kw"]["by_consumption"])
        self.assertIsNone(o["03_operating_cost"]["cost_eur_per_year"]["heat_pump"])
        self.assertTrue(o["decision"]["homeowner_can_provide"])

    def test_partial_year_bill_is_not_used_as_annual(self):
        o = assess(consumption_full_year=False)
        self.assertIsNone(o["01_heat_load"]["heating_load_kw"]["by_consumption"])
        self.assertIsNone(o["03_operating_cost"]["cost_eur_per_year"]["today"])

    def test_lpg_is_priced_like_natural_gas_as_a_labelled_assumption(self):
        o = assess(energy_carrier="lpg")["03_operating_cost"]
        self.assertEqual(o["cost_eur_per_year"]["today"], assess()["03_operating_cost"]["cost_eur_per_year"]["today"])
        self.assertTrue(any("No official LPG price" in a for a in o["assumptions"]))

    def test_single_pipe_prevents_green(self):
        o = assess(heat_distribution="radiators", radiator_count=10, radiator_type="33", pipe_system="single-pipe")
        self.assertNotEqual(o["decision"]["verdict"], "green")
        self.assertTrue(any(r["source"] == "pipe_system" and r["type"] == "obstacle" for r in o["decision"]["reasons"]))

    def test_solar_hot_water_widens_the_consumption_estimate(self):
        lo, hi = assess(solar_thermal=True)["01_heat_load"]["heating_load_kw"]["by_consumption"]
        self.assertLess(lo, hi)

    def test_hot_water_larger_than_bill_gives_no_negative_load(self):
        self.assertIsNone(assess(annual_consumption_kwh=1000)["01_heat_load"]["heating_load_kw"]["by_consumption"])

    def test_unknown_radiator_type_lists_every_type(self):
        o = assess(heat_distribution="radiators", radiator_count=12)
        self.assertEqual(sorted(o["02_radiator_check"]["flow_temp_c"]["by_case"]), ["11", "22", "33"])


class Scenarios(unittest.TestCase):
    def setUp(self):
        self.steps = next(r for r in evaluate() if r["building_id"] == "B-03")["processed"]

    def test_every_uncertain_input_has_an_assumption_and_a_sweep(self):
        r = scenarios.run(self.steps)
        keys = [p["key"] for p in r["params"]]
        self.assertIn("radiator_type", keys)
        self.assertIn("heated_share", keys)
        for p in r["params"]:
            self.assertIn(p["assumed"], p["values"])
            self.assertTrue(p["rule"])
            self.assertEqual(len(r["sweeps"][p["key"]]), len(p["values"]))

    def test_pinned_inputs_give_a_single_load_and_radiator_type_decides(self):
        r = scenarios.run(self.steps)
        lo, hi = r["result"]["load_kw"]
        self.assertEqual(lo, hi)
        self.assertEqual([x["verdict"] for x in r["sweeps"]["radiator_type"]], ["red", "yellow", "green"])  # types 11, 22, 33

    def test_chosen_values_override_assumptions_and_unknown_values_are_ignored(self):
        r = scenarios.run(self.steps, {"radiator_type": "33", "full_load_hours": 12345})
        self.assertEqual(r["values"]["radiator_type"], "33")
        self.assertEqual(r["values"]["full_load_hours"], 2000)
        self.assertEqual(r["result"]["verdict"], "green")


class DemoCustomers(unittest.TestCase):
    def test_b03_reproduces_the_worked_example(self):
        b03 = next(r for r in evaluate() if r["building_id"] == "B-03")["outputs"]
        self.assertEqual(b03["01_heat_load"]["heating_load_kw"]["used"], [15.8, 18.4])
        self.assertEqual(b03["02_radiator_check"]["flow_temp_c"]["by_case"], {"11": [77, 84], "22": [58, 62], "33": [50, 53]})
        self.assertEqual(b03["03_operating_cost"]["cost_eur_per_year"]["heat_pump"], [2615, 3269])

    def test_known_label_matches_do_not_regress(self):
        rows = {r["building_id"]: r for r in evaluate()}
        self.assertEqual(len(rows), 5)
        for bid in ("B-02", "B-03"):  # B-01 is a known miss (expected green, engine yellow)
            self.assertTrue(rows[bid]["dev_check"]["verdict_match"], bid)


if __name__ == "__main__":
    unittest.main()
