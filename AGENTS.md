# Notes for coding assistants and contributors

- **Data contract (must follow):** questionnaire → `data/demo/<customer>/raw/questionnaire.json` → LLM extraction
  with the customer's files → uniform processed data → decision engine. Any questionnaire change keeps this flow:
  one key per answer in `QUESTIONNAIRE_KEYS` (`src/decision_engine/intake.py`) and `INPUT_KEYS`
  (`src/browser/assessment.js`), read in `src/decision_engine/prepare.py`. Details: [docs/data-contract.md](docs/data-contract.md).
- The decision engine (`src/decision_engine/`) does not change for questionnaire changes.
- Run `python3 -m unittest discover -s tests -v` before pushing; `tests/test_intake.py` checks the contract.
- Start the app with `python3 scripts/serve.py` (http://127.0.0.1:4173).
