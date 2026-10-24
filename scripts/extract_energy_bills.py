#!/usr/bin/env python3
"""
Extract structured challenge-relevant data from German energy bills (PDF format).

Targets the exact inputs needed for the nuuEnergy Heat Pump Readiness Assessment Engine:
- annual_consumption_kwh (Rule 1b)
- energy_carrier (Erdgas, Strom, etc.)
- billing_period (start, end, days)
- current_annual_cost_eur (Rule 3)
- working_price_ct_per_kwh
- base_price_eur_per_year
- meter_reading_type (K=Customer, A=Grid, E=Estimated)
- volume_m3, calorific_value_hs, state_number_z (conversion tracking)

Outputs the schema defined in data/processed/01_pipeline_and_interface.md:
  {"value": ..., "source": "energy_bill.<field>", "confidence": "high"|"medium"|"low", "evidence": "..."}
"""

import os
import re
import json
import glob
from typing import Dict, Any, Optional, List
import pypdf

def clean_number(num_str: str) -> Optional[float]:
    """Parse German localized numbers like '24.858,50' or '24 858' into float."""
    if not num_str:
        return None
    cleaned = num_str.replace(" ", "").replace("\xa0", "")
    # Check if format is German: 1.234,56
    if "." in cleaned and "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        # e.g., 24532,00 or 12,5
        cleaned = cleaned.replace(",", ".")
    elif "." in cleaned:
        # Could be 24.858 (thousands) or 12.5 (decimal)
        parts = cleaned.split(".")
        if len(parts) == 2 and len(parts[1]) == 3: # likely thousands
            cleaned = cleaned.replace(".", "")
    try:
        return float(cleaned)
    except ValueError:
        return None

def extract_dates(text: str) -> Optional[Dict[str, str]]:
    """Extract start and end date of billing period."""
    # Common patterns:
    # 01.04.2024 - 31.03.2025 or 01.03.2020 bis 30.06.2021 or 15.04.2016 – 12.04.2017
    date_regex = r'(\d{2}\.\d{2}\.\d{4})\s*(?:bis|-|–)\s*(\d{2}\.\d{2}\.\d{4})'
    
    # Check lines near Abrechnungszeitraum or Zeitraum
    for line in text.split('\n'):
        if any(k in line.lower() for k in ['abrechnungszeitraum', 'zeitraum', 'berechnen wir ihnen', 'ihres verbrauchs vom']):
            m = re.search(date_regex, line)
            if m:
                return {"start": m.group(1), "end": m.group(2), "evidence": line.strip()}
    
    # Fallback to general first match
    m = re.search(date_regex, text)
    if m:
        return {"start": m.group(1), "end": m.group(2), "evidence": m.group(0)}
    return None

def extract_bill_data(pdf_path: str) -> Dict[str, Any]:
    """Extract energy carrier, consumption, costs, and reading method from a PDF bill."""
    reader = pypdf.PdfReader(pdf_path)
    full_text = "\n".join([page.extract_text() or "" for page in reader.pages])
    filename = os.path.basename(pdf_path)
    
    result = {
        "source_file": filename,
        "page_count": len(reader.pages),
        "fields": {}
    }

    # 1. Energy Carrier
    # Check if Erdgas, Gas, Strom, or both
    text_lower = full_text.lower()
    carrier = None
    carrier_ev = None
    if "erdgas" in text_lower or "gasabrechnung" in text_lower or "gasverbrauch" in text_lower or "schwabengas" in text_lower:
        carrier = "natural_gas"
        carrier_ev = "Bill references Erdgas / Gasabrechnung"
    elif "strom" in text_lower or "stromverbrauch" in text_lower:
        carrier = "electricity"
        carrier_ev = "Bill references Strom / Stromabrechnung"
    
    if carrier:
        result["fields"]["energy_carrier"] = {
            "value": carrier,
            "source": f"energy_bill.{filename}#carrier",
            "confidence": "high",
            "evidence": carrier_ev
        }

    # 2. Billing Period
    period = extract_dates(full_text)
    if period:
        # Calculate days if possible
        try:
            from datetime import datetime
            d1 = datetime.strptime(period["start"], "%d.%m.%Y")
            d2 = datetime.strptime(period["end"], "%d.%m.%Y")
            days = (d2 - d1).days
        except Exception:
            days = None
            
        result["fields"]["billing_period"] = {
            "value": {
                "start_date": period["start"],
                "end_date": period["end"],
                "days": days
            },
            "source": f"energy_bill.{filename}#period",
            "confidence": "high",
            "evidence": period["evidence"]
        }

    # 3. Annual Consumption (kWh)
    # Search patterns
    kwh_patterns = [
        # Dedicated gas line e.g., 'Gas 24.858 kWh (365)' or 'Gas 7 147,71 26.708 kWh'
        r'Gas\s+.*?([0-9\.\,]+)\s*kWh',
        # Dedicated consumption labels
        r'(?:Gasverbrauch|Stromverbrauch|Gesamtverbrauch|Abrechnungsmenge|Ihr Stromverbrauch|Ihr Gasverbrauch)\s*[:\s]*([0-9\.\,]+)\s*kWh',
        # e.g., 26.708 kWh abgelesen / Wirkarbeit
        r'([0-9\.\,]+)\s*kWh\s*(?:abgelesen|Wirkarbeit|Gesamt)',
        # general e.g., 26.708 kWh
        r'([0-9\.\,]+)\s*kWh'
    ]

    extracted_kwh = None
    kwh_ev = None

    for line in full_text.split('\n'):
        line_clean = line.strip()
        # Prefer lines mentioning gas if carrier is gas
        if carrier == "natural_gas" and "gas" in line_clean.lower() and "kwh" in line_clean.lower():
            for pat in kwh_patterns:
                m = re.search(pat, line_clean, re.IGNORECASE)
                if m:
                    val = clean_number(m.group(1))
                    if val and val > 500:
                        extracted_kwh = val
                        kwh_ev = line_clean
                        break
        elif any(k in line_clean.lower() for k in ['verbrauch', 'gasverbrauch', 'stromverbrauch', 'abrechnungsmenge', 'gesamtverbrauch']):
            for pat in kwh_patterns[1:]:
                m = re.search(pat, line_clean, re.IGNORECASE)
                if m:
                    val = clean_number(m.group(1))
                    if val and val > 100:
                        extracted_kwh = val
                        kwh_ev = line_clean
                        break
        if extracted_kwh:
            break

    # If not found yet, check lines with 'M-Erdgas' or 'M-Strom'
    if not extracted_kwh:
        for line in full_text.split('\n'):
            if 'm-erdgas' in line.lower() or 'm-strom' in line.lower():
                m = re.findall(r'([0-9\.\,]+)\s*kWh', line, re.IGNORECASE)
                if m:
                    val = clean_number(m[-1])
                    if val and val > 100:
                        extracted_kwh = val
                        kwh_ev = line.strip()
                        break

    if extracted_kwh:
        result["fields"]["annual_consumption_kwh"] = {
            "value": extracted_kwh,
            "source": f"energy_bill.{filename}#consumption",
            "confidence": "high",
            "evidence": kwh_ev
        }

    # 4. Total Cost (EUR Gross / Brutto)
    cost_patterns = [
        r'(?:Gesamtbetrag brutto|Gesamtbrutto|Gesamtbetrag|Rechnungsbetrag)\s*[:\s]*([0-9\.\,]+)\s*(?:EUR|Euro|€)',
        r'(?:Gesamt-Brutto|Bruttobetrag)\s*[:\s]*([0-9\.\,]+)\s*(?:EUR|Euro|€)'
    ]
    extracted_cost = None
    cost_ev = None

    for line in full_text.split('\n'):
        line_clean = line.strip()
        if any(k in line_clean.lower() for k in ['gesamtbrutto', 'gesamtbetrag brutto', 'rechnungsbetrag', 'gesamtbetrag', 'gesamt-brutto']):
            for pat in cost_patterns:
                m = re.search(pat, line_clean, re.IGNORECASE)
                if m:
                    val = clean_number(m.group(1))
                    if val and val > 50:
                        extracted_cost = val
                        cost_ev = line_clean
                        break
        if extracted_cost:
            break

    if extracted_cost:
        result["fields"]["current_annual_cost_eur"] = {
            "value": extracted_cost,
            "source": f"energy_bill.{filename}#cost",
            "confidence": "high",
            "evidence": cost_ev
        }

    # 5. Meter Reading Type (Ableseart)
    # K = Customer (Kundenablesung), A = Grid operator, E / S = Estimated, R = Calculated
    reading_type = None
    reading_ev = None
    if re.search(r'\b(Kundenablesung|Ablesung durch Kunde|\bK\b\s*=\s*Ablesung durch Kunde)\b', full_text, re.IGNORECASE):
        reading_type = "customer_reading"
        reading_ev = "Ablesung durch Kunde (Kundenablesung)"
    elif re.search(r'\b(Schätzung|Netzbetreiberschätzung|\bS\b\s*=\s*Netzbetreiberschätzung|\bE\b\s*=\s*Maschinell ermittelt)\b', full_text, re.IGNORECASE):
        reading_type = "estimated"
        reading_ev = "Rechnerische Schätzung / maschinell ermittelt"
    elif "rechnerisch ermittelt" in text_lower:
        reading_type = "calculated"
        reading_ev = "Rechnerisch ermittelt"

    if reading_type:
        result["fields"]["meter_reading_type"] = {
            "value": reading_type,
            "source": f"energy_bill.{filename}#reading_type",
            "confidence": "high" if reading_type == "customer_reading" else "medium",
            "evidence": reading_ev
        }

    # 6. Gas Specific Technical Factors (Brennwert Hs and Zustandszahl z)
    zzahl_m = re.search(r'Zustandszahl\s*[:\s]*([0-9\.\,]+)', full_text, re.IGNORECASE) or re.search(r'0,([0-9]{4})\s*x\s*([0-9\.\,]+)', full_text)
    if zzahl_m:
        val_z = clean_number(zzahl_m.group(1))
        if val_z and val_z < 1.0: # typically 0.90 to 0.96
            result["fields"]["zustandszahl_z"] = {
                "value": val_z,
                "source": f"energy_bill.{filename}#conversion",
                "confidence": "high",
                "evidence": zzahl_m.group(0)
            }

    brennwert_m = re.search(r'Brennwert\s*[:\s]*([0-9\.\,]+)', full_text, re.IGNORECASE) or re.search(r'x\s*([0-9\.\,]+)\s*(?:kWh)?', full_text)
    if brennwert_m:
        val_hs = clean_number(brennwert_m.group(1))
        if val_hs and 9.0 <= val_hs <= 13.0: # standard calorific value for H/L gas
            result["fields"]["brennwert_hs_kwh_per_m3"] = {
                "value": val_hs,
                "source": f"energy_bill.{filename}#conversion",
                "confidence": "high",
                "evidence": brennwert_m.group(0)
            }

    # 7. Unit Prices (Arbeitspreis, Grundpreis)
    ap_m = re.search(r'Arbeitspreis\s*.*?([0-9\.\,]+)\s*(?:Cent/kWh|ct/kWh|EUR)', full_text, re.IGNORECASE)
    if ap_m:
        val_ap = clean_number(ap_m.group(1))
        if val_ap:
            result["fields"]["working_price_ct_per_kwh"] = {
                "value": val_ap if val_ap < 100 else val_ap / 100,
                "source": f"energy_bill.{filename}#tariff",
                "confidence": "high",
                "evidence": ap_m.group(0)
            }

    gp_m = re.search(r'Grundpreis\s*.*?([0-9\.\,]+)\s*(?:EUR/Jahr|Euro/Jahr|EUR /|EUR)', full_text, re.IGNORECASE)
    if gp_m:
        val_gp = clean_number(gp_m.group(1))
        if val_gp and val_gp > 20:
            result["fields"]["base_price_eur_per_year"] = {
                "value": val_gp,
                "source": f"energy_bill.{filename}#tariff",
                "confidence": "high",
                "evidence": gp_m.group(0)
            }

    return result

def main():
    bills_dir = "data/raw/energy_bills"
    output_dir = "data/processed/extracted_bills"
    os.makedirs(output_dir, exist_ok=True)
    
    pdf_files = sorted(glob.glob(os.path.join(bills_dir, "*.pdf")))
    print(f"🔍 Found {len(pdf_files)} PDF bills to process...")
    
    summary = []
    
    for pdf_path in pdf_files:
        filename = os.path.basename(pdf_path)
        try:
            data = extract_bill_data(pdf_path)
            field_count = len(data.get("fields", {}))
            
            # Save individual JSON
            base_name = os.path.splitext(filename)[0]
            out_file = os.path.join(output_dir, f"{base_name}.json")
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                
            summary.append({
                "file": filename,
                "fields_extracted": field_count,
                "carrier": data["fields"].get("energy_carrier", {}).get("value"),
                "consumption_kwh": data["fields"].get("annual_consumption_kwh", {}).get("value"),
                "cost_eur": data["fields"].get("current_annual_cost_eur", {}).get("value"),
                "reading_type": data["fields"].get("meter_reading_type", {}).get("value")
            })
            print(f"  ✓ Processed: {filename} ({field_count} fields extracted)")
        except Exception as e:
            print(f"  ✗ Error processing {filename}: {e}")

    # Write summary index
    index_file = os.path.join(output_dir, "extracted_summary.json")
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
        
    print(f"\n✅ Extraction complete! Extracted files stored in: {output_dir}")
    print(f"📄 Summary saved to: {index_file}")

if __name__ == "__main__":
    main()
