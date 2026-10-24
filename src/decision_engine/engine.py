"""Run all steps for one customer: processed step inputs -> outputs, same shapes as data/demo/<id>/output/."""
import decision
import heat_load
import operating_cost
import radiator_check


def run(building_id, steps):
    """steps: {"01a_heat_load_by_area": {...}, "01b_heat_load_by_consumption": {...}, "02_radiator_check": {...}, "03_operating_cost": {...}}"""
    head = {"schema_version": "0.1", "building_id": building_id}
    heat = {**head, "step": "01_heat_load", **heat_load.run(steps["01a_heat_load_by_area"], steps["01b_heat_load_by_consumption"])}
    rad = {**head, "step": "02_radiator_check", **radiator_check.run(steps["02_radiator_check"], heat)}
    cost = {**head, "step": "03_operating_cost", **operating_cost.run(steps["03_operating_cost"], rad)}
    dec = {**head, **decision.run(steps["02_radiator_check"], heat, rad, cost)}
    return {"01_heat_load": heat, "02_radiator_check": rad, "03_operating_cost": cost, "decision": dec}
