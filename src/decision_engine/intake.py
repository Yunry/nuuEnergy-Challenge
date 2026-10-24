"""Intake rule: questionnaire -> customer folder -> uniform processed data -> decision engine.

Every customer case goes through the same steps, whatever the questionnaire looks like (docs/data-contract.md):

  1. questionnaire  the browser sends its answers as one JSON object with exactly QUESTIONNAIRE_KEYS
                    -> saved as data/demo/<customer>/raw/questionnaire.json
  2. files          uploaded documents and photos, unchanged -> raw/documents/, raw/photos/  (scripts/serve.py)
  3. extraction     questionnaire.json plus the customer's files go to the LLM (scripts/ai_extract.py), which returns
                    facts in the uniform field format {value, confidence, evidence, source_file}
                    -> saved as raw/extraction.json; the homeowner reviews them before they are used
  4. prepare        questionnaire answers + reviewed facts -> the four processed step files, every field in the
                    uniform format {value, source, confidence, evidence} -> processed/*.json   (prepare.py)
  5. decision       processed/ -> output/  (engine.py, unchanged by questionnaire changes)

A questionnaire change may add questions, but each answer must map to a key below (and be read in prepare.py);
the browser's list (src/browser/assessment.js INPUT_KEYS) must stay identical. tests/test_intake.py checks both.
"""
import json
from pathlib import Path

import engine
import prepare

# The questionnaire's output: dataset field names plus the structured answers the dataset keeps in free text.
QUESTIONNAIRE_KEYS = [
    "building_id", "construction_year", "floor_area_m2", "renovation_status", "heat_distribution",
    "annual_consumption_kwh", "consumption_full_year", "energy_carrier", "persons_in_household", "hot_water_via_heating",
    "flow_temperature_c", "pipe_system", "radiator_count", "radiator_type", "other_heat_source", "solar_thermal",
    "building_notes",
]
EVIDENCE_KEY = "extraction_evidence"  # facts from uploaded files that the homeowner reviewed and kept (step 3)
UNIFORM_FIELD_KEYS = {"value", "source", "confidence", "evidence"}


class IntakeError(ValueError):
    pass


def check_questionnaire(q):
    """The questionnaire JSON must use only the agreed keys; unknown keys are a contract break, not data."""
    if not isinstance(q, dict):
        raise IntakeError("questionnaire must be a JSON object")
    unknown = sorted(set(q) - set(QUESTIONNAIRE_KEYS) - {EVIDENCE_KEY})
    if unknown:
        raise IntakeError(f"questionnaire keys not in the data contract: {', '.join(unknown)} (see docs/data-contract.md)")
    return q


def check_uniform(steps):
    """Every processed field, from any source, has the same shape before it reaches the decision engine."""
    for name, step in steps.items():
        for key, f in {**step["fields"], **step["reference_data"]}.items():
            if not UNIFORM_FIELD_KEYS <= set(f):
                raise IntakeError(f"{name}.{key} is not in the uniform field format {sorted(UNIFORM_FIELD_KEYS)}")
    return steps


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def run(folder, questionnaire):
    """Steps 1, 4 and 5 for one customer: save the questionnaire, build uniform processed data, decide; all saved."""
    folder = Path(folder)
    check_questionnaire(questionnaire)
    write(folder / "raw" / "questionnaire.json", questionnaire)
    steps = check_uniform(prepare.run({**questionnaire, "building_id": folder.name}))
    for name, step in steps.items():
        step["raw_inputs"] = [{"id": "questionnaire", "type": "json", "ref": f"data/demo/{folder.name}/raw/questionnaire.json"}]
        write(folder / "processed" / f"{name}.json", step)
    outputs = engine.run(folder.name, steps)
    for name, obj in outputs.items():
        write(folder / "output" / f"{name}.json", obj)
    return {"processed": steps, "outputs": outputs}


def save_extraction(folder, result):
    """Step 3's raw LLM result, kept with the customer for traceability (the homeowner reviews it before use)."""
    write(Path(folder) / "raw" / "extraction.json", result)
