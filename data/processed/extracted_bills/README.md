# Energy Bill Dataset & Extracted Data Guide

This directory contains real German energy bills ([data/raw/energy_bills/](../../raw/energy_bills/)) and their machine-extracted structured representations for use in the **nuuEnergy Heat Pump Readiness Assessment Engine**.

---

## 1. Quick Start for Teammates

All extracted data is formatted in the official challenge 4-tuple schema:
`{"value": ..., "source": "...", "confidence": "high"|"medium"|"low", "evidence": "..."}`

### Summary Index:
- **Index File**: [`data/processed/extracted_bills/extracted_summary.json`](./extracted_summary.json)
- **High-Quality Gas & Heating Bills**:
  1. `swu_stadtwerke_ulm_strom_gas_abrechnung.json`: 31,008 kWh gas, customer reading, tariff breakdown
  2. `stadtwerke_heidenheim_jahresabrechnung.json`: 26,708 kWh gas, annual cost €840.09
  3. `gvg_rhein_erft_erdgas_jahresabrechnung_2025.json`: 24,858 kWh gas, Brennwert $H_s = 10.286$, Zustandszahl $z = 0.9645$
  4. `enbw_odr_gas_musterrechnung.json`: 16,928 kWh gas
  5. `swm_musterrechnung_strom_erdgas_original.json`: 11,941 kWh gas, €765.02
  6. `green_planet_energy_gas_musterrechnung.json`: 7,109 kWh gas, €1,165.41

---

## 2. Direct Mapping to Engine Inputs

When testing or running the assessment engine (`example_input_B-0X.json`), you can directly plug in these extracted fields:

| Extracted Field | Engine Input Field | Challenge Rule |
| :--- | :--- | :--- |
| `annual_consumption_kwh` | `fields.annual_consumption_kwh` | **Rule 1b**: $\text{Heat Load} = \frac{\text{kWh} \times 0.88 - 1,000 \times \text{occupants}}{2,000}$ |
| `energy_carrier` | `fields.energy_carrier` | Fixed price lookup (€0.11/kWh gas, €0.17/kWh oil) |
| `current_annual_cost_eur` | Baseline cost in Rule 3 | **Rule 3**: Current fuel spend vs. heat pump electricity cost |
| `meter_reading_type` | `confidence` rating | If `estimated`, engine flags `requires_confirmation = true` |
| `billing_period.days` | Plausibility check | Verifies full 365-day year; flags partial periods |

---

## 3. How to Rerun or Add New Bills

```bash
# 1. Place any new PDF in data/raw/energy_bills/
# 2. Run extractor:
python3 scripts/extract_energy_bills.py
```
Outputs will be automatically regenerated in `data/processed/extracted_bills/*.json`.
