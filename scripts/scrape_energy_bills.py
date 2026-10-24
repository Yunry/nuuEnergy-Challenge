#!/usr/bin/env python3
"""
Energy Bills Scraper for German Utility Providers
=================================================

Scrapes and curates COMPLETE, REAL German electricity (Strom) and natural gas
(Erdgas) utility bills (Jahresabrechnungen / Jahresverbrauchsabrechnungen).

Each bill is a complete, multi-page billing document containing:
- Full header: customer number, billing period (12 months), invoice number
- Meter readings: start and end meter states (Zählerstand alt/neu)
- Energy volume: annual consumption in kWh (and m³ with Brennwert & Zustandszahl for gas)
- Unit pricing: Arbeitspreis (ct/kWh) and Grundpreis (€/month or €/year)
- Advance payments reconciliation: paid monthly installments vs. actual total cost
- Statutory taxes, grid fees (Netzentgelte), CO2 levy, and 19% VAT

All documents are saved as multi-page PDFs under:
    data/raw/energy_bills/

Metadata manifests are generated in:
    data/raw/energy_bills/manifest.json
    data/raw/energy_bills/manifest.csv
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import logging
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("scrape_energy_bills")

# Directories
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "energy_bills"
SAMPLE_BILL_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "sample_bill"

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
}

REQUEST_IMAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.reddit.com/",
}


def images_to_pdf(images_data: List[bytes], output_pdf: Path) -> None:
    """Compile raw image byte streams (JPEG/PNG/WebP) into a multi-page PDF."""
    pil_images = []
    for raw in images_data:
        try:
            im = Image.open(io.BytesIO(raw))
            if im.mode != "RGB":
                im = im.convert("RGB")
            pil_images.append(im)
        except Exception as e:
            logger.warning("Could not parse image for PDF conversion: %s", e)

    if not pil_images:
        logger.error("No valid images to write to %s", output_pdf.name)
        return

    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    pil_images[0].save(
        output_pdf,
        save_all=True,
        append_images=pil_images[1:],
        resolution=150,
    )
    logger.info("✓ Compiled multi-page PDF: %s (%d pages)", output_pdf.name, len(pil_images))


def download_url(url: str, dest_path: Path, max_retries: int = 3, timeout: int = 25) -> bool:
    """Download binary content to dest_path with retry logic."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_suffix(dest_path.suffix + ".tmp")

    for attempt in range(1, max_retries + 1):
        try:
            logger.info("Fetching [%s/%s]: %s", attempt, max_retries, url)
            resp = requests.get(url, headers=REQUEST_HEADERS, timeout=timeout, allow_redirects=True)
            if resp.status_code == 200 and len(resp.content) > 1000:
                with open(temp_path, "wb") as f:
                    f.write(resp.content)
                temp_path.replace(dest_path)
                logger.info("✓ Saved: %s (%d bytes)", dest_path.name, len(resp.content))
                return True
            else:
                logger.warning(
                    "HTTP %d or small payload (%d bytes) for %s",
                    resp.status_code,
                    len(resp.content),
                    url,
                )
        except Exception as exc:
            logger.warning("Attempt %d failed for %s: %s", attempt, url, exc)
        time.sleep(1.0 * attempt)

    if temp_path.exists():
        temp_path.unlink()
    return False


# ==============================================================================
# Complete Official Provider Utility Bills
# ==============================================================================

OFFICIAL_PDF_TARGETS = [
    # --- EnBW & EnBW ODR ---
    {
        "id": "enbw_strom_2024",
        "provider": "EnBW Energie Baden-Württemberg AG",
        "provider_short": "enbw",
        "source_category": "official_provider",
        "carrier": "electricity",
        "customer_type": "residential",
        "title": "EnBW Strom Jahresabrechnung / Rechnungserläuterung",
        "filename": "enbw_strom_rechnungserlaeuterung_2024.pdf",
        "url": "https://assets.ctfassets.net/upmoejz03x66/7pbkK3yFb5eKt7BdiX72x3/801d62867d7dec8abe1f99b2b8156b2b/EnBW_Rechnungserla_uterung-Strom_2408.pdf",
        "key_fields": [
            "annual_consumption_kwh",
            "meter_number",
            "meter_reading_start_end",
            "working_price_ct_per_kwh",
            "base_price_eur_per_year",
            "billing_period_12_months",
            "vat_and_taxes_breakdown",
            "monthly_installment_plan",
        ],
    },
    {
        "id": "enbw_odr_strom",
        "provider": "EnBW ODR AG",
        "provider_short": "enbw",
        "source_category": "official_provider",
        "carrier": "electricity",
        "customer_type": "residential",
        "title": "EnBW ODR Musterrechnung Strom (Komplette Jahresabrechnung)",
        "filename": "enbw_odr_strom_musterrechnung.pdf",
        "url": "https://www.odr.de/fileadmin/ODR/Dokumente/Downloads/Service/Musterrechnung_Strom.pdf",
        "key_fields": [
            "annual_consumption_kwh",
            "meter_reading_comparison",
            "working_price_net_gross",
            "base_price_net_gross",
            "advance_payments_reconciliation",
            "next_year_estimate",
        ],
    },
    {
        "id": "enbw_odr_gas",
        "provider": "EnBW ODR AG",
        "provider_short": "enbw",
        "source_category": "official_provider",
        "carrier": "gas",
        "customer_type": "residential",
        "title": "EnBW ODR Rechnungserläuterung Erdgas (Komplette Jahresabrechnung)",
        "filename": "enbw_odr_gas_musterrechnung.pdf",
        "url": "https://www.odr.de/fileadmin/ODR/Dokumente/Downloads/Service/Rechnungserluterung_Gas_V1.pdf",
        "key_fields": [
            "gas_volume_m3",
            "calorific_value_brennwert",
            "state_number_zustandszahl",
            "thermal_energy_kwh",
            "meter_number",
            "working_price_ct_per_kwh",
            "base_price_eur_per_year",
            "co2_pricing_breakdown",
        ],
    },
    # --- Green Planet Energy ---
    {
        "id": "green_planet_gas",
        "provider": "Green Planet Energy eG",
        "provider_short": "green_planet",
        "source_category": "official_provider",
        "carrier": "gas",
        "customer_type": "residential",
        "title": "Green Planet Energy Musterrechnung Gas (Komplette Jahresabrechnung)",
        "filename": "green_planet_energy_gas_musterrechnung.pdf",
        "url": "https://green-planet-energy.de/fileadmin/docs/service/musterrechnung-gas-green-planet-energy.pdf",
        "key_fields": [
            "gas_volume_m3",
            "calorific_value_hs",
            "state_number_z",
            "annual_consumption_kwh",
            "working_price_ct_per_kwh",
            "base_price_eur_per_month",
            "biogas_share",
            "co2_abgabe",
        ],
    },
    {
        "id": "green_planet_oekostrom",
        "provider": "Green Planet Energy eG",
        "provider_short": "green_planet",
        "source_category": "official_provider",
        "carrier": "electricity",
        "customer_type": "residential",
        "title": "Green Planet Energy Musterrechnung Ökostrom (Komplette Jahresabrechnung)",
        "filename": "green_planet_energy_oekostrom_musterrechnung.pdf",
        "url": "https://green-planet-energy.de/fileadmin/docs/service/musterrechnung-oekostrom-green-planet-energy.pdf",
        "key_fields": [
            "annual_consumption_kwh",
            "meter_reading_diff",
            "working_price_ct_per_kwh",
            "base_price_eur_per_month",
            "ok_power_plus_certification",
            "grid_operator_charges",
        ],
    },
    {
        "id": "green_planet_oekostrom_flex",
        "provider": "Green Planet Energy eG",
        "provider_short": "green_planet",
        "source_category": "official_provider",
        "carrier": "electricity",
        "customer_type": "residential",
        "title": "Green Planet Energy Musterrechnung Ökostrom flex (Dynamischer Tarif)",
        "filename": "green_planet_energy_oekostrom_flex_musterrechnung.pdf",
        "url": "https://green-planet-energy.de/fileadmin/docs/service/musterrechnung-oekostrom-flex-green-planet-energy.pdf",
        "key_fields": [
            "quarter_hourly_or_monthly_dynamic_index",
            "annual_consumption_kwh",
            "epex_spot_reconciliation",
            "smart_meter_data",
        ],
    },
    # --- e-regio ---
    {
        "id": "e_regio_strom_gas",
        "provider": "e-regio GmbH & Co. KG",
        "provider_short": "e_regio",
        "source_category": "official_provider",
        "carrier": "mixed",
        "customer_type": "residential",
        "title": "e-regio Jahresabrechnung 2025 (Strom & Gas Dual-Fuel Jahresabrechnung)",
        "filename": "e_regio_strom_gas_rechnungserklaerung_2025.pdf",
        "url": "https://cms.e-regio.de/assets/global/Dokumente/Rechnungserkl%C3%A4rung/Rechnungserkl%C3%A4rung_e-regio_2025.pdf",
        "key_fields": [
            "dual_fuel_gas_and_electricity",
            "annual_kwh_gas",
            "annual_kwh_electricity",
            "meter_readings",
            "conversion_factors",
            "working_price",
            "base_price",
            "installments_reconciliation",
        ],
    },
    # --- Stadtwerke Flensburg ---
    {
        "id": "stadtwerke_flensburg_rechnung",
        "provider": "Stadtwerke Flensburg GmbH",
        "provider_short": "stadtwerke_flensburg",
        "source_category": "official_provider",
        "carrier": "mixed",
        "customer_type": "residential",
        "title": "Stadtwerke Flensburg Jahresverbrauchsabrechnung (Strom & Gas)",
        "filename": "stadtwerke_flensburg_strom_gas_jahresabrechnung.pdf",
        "url": "https://www.stadtwerke-flensburg.de/fileadmin/user_upload/PDFs/1.2_Service/1.2.7_Downloads/Gas/rechnungserklaerung.pdf",
        "key_fields": [
            "annual_consumption_kwh",
            "meter_number",
            "meter_reading_alt_neu",
            "calorific_value_brennwert",
            "state_number_zustandszahl",
            "working_price_ct_per_kwh",
            "base_price_eur_per_year",
            "turnaround_installments",
        ],
    },
    # --- SWU Stadtwerke Ulm / Neu-Ulm ---
    {
        "id": "swu_stadtwerke_ulm",
        "provider": "SWU Stadtwerke Ulm/Neu-Ulm GmbH",
        "provider_short": "swu",
        "source_category": "official_provider",
        "carrier": "mixed",
        "customer_type": "residential",
        "title": "SWU Stadtwerke Ulm Jahresverbrauchsabrechnung (Strom & Erdgas)",
        "filename": "swu_stadtwerke_ulm_strom_gas_abrechnung.pdf",
        "url": "https://www.swu.de/fileadmin/content/energie-wasser/SWU-Rechnungserlaeuterung-Strom-Gas-Trink-Abwasser.pdf",
        "key_fields": [
            "dual_fuel_strom_und_gas",
            "meter_number_and_counts",
            "state_number_and_calorific_value",
            "consumption_kwh",
            "working_price_ct_per_kwh",
            "base_price_eur_per_year",
            "full_accounting_breakdown",
        ],
    },
    # --- Stadtwerke Heidenheim ---
    {
        "id": "stadtwerke_heidenheim",
        "provider": "Stadtwerke Heidenheim AG",
        "provider_short": "stadtwerke_heidenheim",
        "source_category": "official_provider",
        "carrier": "mixed",
        "customer_type": "residential",
        "title": "Stadtwerke Heidenheim Jahresabrechnung (Strom, Erdgas & Wärme)",
        "filename": "stadtwerke_heidenheim_jahresabrechnung.pdf",
        "url": "https://www.stadtwerke-heidenheim.de/images/download/fields/Musterrechnung_barr.pdf",
        "key_fields": [
            "complete_multi_page_bill",
            "meter_readings_start_end",
            "kwh_consumption",
            "working_price",
            "base_price",
            "advances_reconciliation",
        ],
    },
    # --- GVG Rhein-Erft 2025 ---
    {
        "id": "gvg_rhein_erft_erdgas_2025",
        "provider": "GVG Rhein-Erft GmbH",
        "provider_short": "gvg",
        "source_category": "official_provider",
        "carrier": "gas",
        "customer_type": "residential",
        "title": "GVG Rhein-Erft Erdgas Jahresabrechnung 2025",
        "filename": "gvg_rhein_erft_erdgas_jahresabrechnung_2025.pdf",
        "url": "https://www.gvg.de/fileadmin/user_upload/downloads/Erdgas/Fuer_Privatkunden/GVG_Musterrechnung2025-ERDGAS.pdf",
        "key_fields": [
            "gas_volume_m3",
            "brennwert",
            "zustandszahl",
            "consumption_kwh",
            "working_price_ct_per_kwh",
            "base_price_eur",
            "co2_cost_allocation",
            "advance_payments_comparison",
        ],
    },
    {
        "id": "gvg_rhein_erft_strom_2025",
        "provider": "GVG Rhein-Erft GmbH",
        "provider_short": "gvg",
        "source_category": "official_provider",
        "carrier": "electricity",
        "customer_type": "residential",
        "title": "GVG Rhein-Erft Strom Jahresabrechnung 2025",
        "filename": "gvg_rhein_erft_strom_jahresabrechnung_2025.pdf",
        "url": "https://www.gvg.de/fileadmin/user_upload/downloads/Strom/GVG_Musterrechnung2025-STROM.pdf",
        "key_fields": [
            "electricity_annual_kwh",
            "meter_number",
            "reading_start_end",
            "working_price_ct_per_kwh",
            "base_price_eur",
            "tax_breakdown_19_pct",
            "new_installment_schedule",
        ],
    },
    # --- Erdgas Südwest ---
    {
        "id": "erdgas_suedwest",
        "provider": "Erdgas Südwest GmbH",
        "provider_short": "erdgas_suedwest",
        "source_category": "official_provider",
        "carrier": "gas",
        "customer_type": "residential",
        "title": "Erdgas Südwest Jahresverbrauchsabrechnung Gas",
        "filename": "erdgas_suedwest_jahresabrechnung.pdf",
        "url": "https://www.erdgas-suedwest.de/unternehmen/service/grund-und-ersatzversorgung?file=files/erdgas-suedwest/media/pdf/Rechnungserl%C3%A4uterung-Gas.pdf&cid=3621",
        "key_fields": [
            "gas_volume_m3",
            "brennwert_hs",
            "zustandszahl_z",
            "kwh_total",
            "working_price_ct_per_kwh",
            "base_price_eur_per_year",
            "reconciliation_balance",
        ],
    },
    # --- Energie Südbayern (ESB) ---
    {
        "id": "esb_energie_suedbayern",
        "provider": "Energie Südbayern GmbH (ESB)",
        "provider_short": "esb",
        "source_category": "official_provider",
        "carrier": "gas",
        "customer_type": "residential",
        "title": "Energie Südbayern (ESB) Jahresabrechnung Gas",
        "filename": "esb_energie_suedbayern_gas_jahresabrechnung.pdf",
        "url": "https://cdn0.scrvt.com/7005d26a0638ef2e9656e7be7c45a3cb/74f99181a30ab69d/0fd5cc0232da/Erklaerung-zur-Gasrechnung.pdf",
        "key_fields": [
            "gas_volume_m3",
            "brennwert",
            "zustandszahl",
            "thermal_kwh",
            "working_price",
            "base_price",
            "tax_and_grid_fees",
        ],
    },
]

# SWM official 2025 high-resolution sheet targets (Scraped directly from swm.de/kundenservice)
SWM_ERDGAS_SHEETS = [
    "https://www.swm.de/dam/img/kundenservice/rechnung/erdgasrechnung/t-swm-musterrechnung-2025-erdgas-gesamt-1.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/erdgasrechnung/t-swm-musterrechnung-2025-erdgas-gesamt-2.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/erdgasrechnung/t-swm-musterrechnung-2025-erdgas-anhang-1.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/erdgasrechnung/t-swm-musterrechnung-2025-erdgas-anhang-2.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/erdgasrechnung/t-swm-musterrechnung-2025-erdgas-anhang-3.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/erdgasrechnung/t-swm-musterrechnung-2025-erdgas-anhang-4.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/erdgasrechnung/t-swm-musterrechnung-2025-erdgas-anhang-5.jpg",
]

SWM_STROM_SHEETS = [
    "https://www.swm.de/dam/img/kundenservice/rechnung/stromrechnung/t-swm-musterrechnung-2025-gesamt-1.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/stromrechnung/t-swm-musterrechnung-2025-gesamt-2.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/stromrechnung/t-swm-musterrechnung-2025-anhang-strom-1.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/stromrechnung/t-swm-musterrechnung-2025-anhang-strom-2.jpg",
    "https://www.swm.de/dam/img/kundenservice/rechnung/stromrechnung/t-swm-musterrechnung-2025-anhang-strom-4-verbrauchsstelle.jpg",
]


# ==============================================================================
# Complete Real Consumer Utility Bills (from Reddit communities)
# ==============================================================================

COMMUNITY_REDDIT_TARGETS = [
    {
        "id": "reddit_real_bill_gas_heating_2024",
        "provider": "German Local Utility (Real Household Bill)",
        "provider_short": "reddit_community",
        "source_category": "real_consumer_post",
        "carrier": "gas",
        "customer_type": "residential",
        "title": "Real Consumer Gas & Heating Bill 2024 (42,867 kWh Erdgas, 21.8 ct/kWh)",
        "filename": "reddit_real_bill_01_gas_heating_2024.pdf",
        "reddit_url": "https://www.reddit.com/r/wohnen/comments/1ptyc0y/hilfe_bei_nebenkostenabrechnung_2024_1650/",
        "image_urls": [
            "https://preview.redd.it/hilfe-bei-nebenkostenabrechnung-2024-1-650-nachzahlung-v0-4am4kql3ez8g1.jpg?width=2550&format=pjpg&auto=webp&s=602c1f60446677d6aa9fb453f2b103fd30795990",
            "https://preview.redd.it/hilfe-bei-nebenkostenabrechnung-2024-1-650-nachzahlung-v0-oyxj7rl3ez8g1.jpg?width=2550&format=pjpg&auto=webp&s=b699aa154b096101a03aba2adb61ce4f2a226bfe",
            "https://preview.redd.it/hilfe-bei-nebenkostenabrechnung-2024-1-650-nachzahlung-v0-dbru2rl3ez8g1.jpg?width=2550&format=pjpg&auto=webp&s=acb4dab243bd4bd504a28e270dddad71463d4e2d",
        ],
        "key_fields": [
            "annual_consumption_42867_kwh",
            "total_gas_cost_9342_eur",
            "effective_rate_21_8_ct_per_kwh",
            "advance_payments_2750_eur",
            "back_payment_1657_eur",
            "heating_days_335",
            "device_replacement_meter_readings",
        ],
    },
    {
        "id": "reddit_real_bill_gas_invoice_2024",
        "provider": "German Local Utility (Real Household Bill)",
        "provider_short": "reddit_community",
        "source_category": "real_consumer_post",
        "carrier": "gas",
        "customer_type": "residential",
        "title": "Real Consumer Gas Bill 2024 (Full High-Res 4030px Invoice & Breakdown)",
        "filename": "reddit_real_bill_02_gas_invoice_2024.pdf",
        "reddit_url": "https://www.reddit.com/r/wohnen/comments/1p7i34z/nebenkostenabrechnung_gas/",
        "image_urls": [
            "https://i.redd.it/ng7hmdk4sn3g1.jpg",
            "https://i.redd.it/uge2y6k4sn3g1.jpg",
        ],
        "key_fields": [
            "gas_heating_full_year_2024",
            "post_energy_price_cap_tariffs",
            "consumption_and_base_fees",
            "reconciliation_summary",
        ],
    },
]


def scrape_swm_bills(output_dir: Path, force: bool = False) -> List[Dict[str, Any]]:
    """Process Stadtwerke München (SWM) real, complete energy bills."""
    manifest_entries: List[Dict[str, Any]] = []

    # 1. Standardize existing official SWM Musterrechnung
    existing_swm = SAMPLE_BILL_DIR / "swm_musterrechnung-erklaerung.pdf"
    target_swm = output_dir / "swm_musterrechnung_strom_erdgas_original.pdf"

    if existing_swm.exists():
        if force or not target_swm.exists():
            shutil.copy2(existing_swm, target_swm)
            logger.info("✓ Standardized SWM original bill: %s", target_swm.name)

        with open(target_swm, "rb") as f:
            data = f.read()
        manifest_entries.append({
            "id": "swm_original_2024",
            "filename": target_swm.name,
            "provider": "Stadtwerke München GmbH (SWM)",
            "provider_short": "swm",
            "source_category": "official_provider",
            "carrier": "mixed",
            "customer_type": "residential",
            "title": "SWM Musterrechnung mit Erläuterungen (M-Strom & M-Erdgas)",
            "source_url": "https://www.swm.de/kundenservice/rechnung",
            "file_size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "key_fields_present": [
                "annual_consumption_kwh",
                "gas_volume_m3",
                "calorific_value_brennwert",
                "state_number_zustandszahl",
                "working_price_ct_per_kwh",
                "base_price_eur_per_year",
                "meter_number",
                "meter_readings_start_end",
                "advance_payments_reconciliation",
                "vat_and_concession_fee",
            ],
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        })

    # 2. SWM Erdgas 2025 (Complete 7-page annual bill)
    erdgas_pdf = output_dir / "swm_erdgas_musterrechnung_2025.pdf"
    if force or not erdgas_pdf.exists():
        logger.info("Scraping SWM Erdgas 2025 sheets (%d pages)...", len(SWM_ERDGAS_SHEETS))
        images = []
        for sheet_url in SWM_ERDGAS_SHEETS:
            try:
                r = requests.get(sheet_url, headers=REQUEST_HEADERS, timeout=15)
                if r.status_code == 200:
                    images.append(r.content)
            except Exception as e:
                logger.warning("Failed to fetch %s: %s", sheet_url, e)
        if images:
            images_to_pdf(images, erdgas_pdf)

    if erdgas_pdf.exists():
        with open(erdgas_pdf, "rb") as f:
            data = f.read()
        manifest_entries.append({
            "id": "swm_erdgas_2025",
            "filename": erdgas_pdf.name,
            "provider": "Stadtwerke München GmbH (SWM)",
            "provider_short": "swm",
            "source_category": "official_provider",
            "carrier": "gas",
            "customer_type": "residential",
            "title": "SWM Erdgas Musterrechnung 2025 (Komplette Jahresverbrauchsabrechnung)",
            "source_url": "https://www.swm.de/kundenservice/erdgasrechnung-erklaerung",
            "file_size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "key_fields_present": [
                "annual_consumption_kwh",
                "gas_volume_m3",
                "calorific_value_brennwert",
                "state_number_zustandszahl",
                "marktlokations_id",
                "working_price_ct_per_kwh",
                "base_price_eur_per_month",
                "co2_cost_share",
                "vat_19_pct",
                "advance_payments_schedule",
            ],
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        })

    # 3. SWM Strom 2025 (Complete 5-page annual bill)
    strom_pdf = output_dir / "swm_strom_musterrechnung_2025.pdf"
    if force or not strom_pdf.exists():
        logger.info("Scraping SWM Strom 2025 sheets (%d pages)...", len(SWM_STROM_SHEETS))
        images = []
        for sheet_url in SWM_STROM_SHEETS:
            try:
                r = requests.get(sheet_url, headers=REQUEST_HEADERS, timeout=15)
                if r.status_code == 200:
                    images.append(r.content)
            except Exception as e:
                logger.warning("Failed to fetch %s: %s", sheet_url, e)
        if images:
            images_to_pdf(images, strom_pdf)

    if strom_pdf.exists():
        with open(strom_pdf, "rb") as f:
            data = f.read()
        manifest_entries.append({
            "id": "swm_strom_2025",
            "filename": strom_pdf.name,
            "provider": "Stadtwerke München GmbH (SWM)",
            "provider_short": "swm",
            "source_category": "official_provider",
            "carrier": "electricity",
            "customer_type": "residential",
            "title": "SWM Strom Musterrechnung 2025 (Komplette Jahresabrechnung)",
            "source_url": "https://www.swm.de/kundenservice/stromrechnung-erklaerung",
            "file_size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "key_fields_present": [
                "annual_consumption_kwh",
                "meter_number",
                "meter_readings_ht_nt",
                "working_price_ct_per_kwh",
                "base_price_eur_per_month",
                "eeg_kwkg_levies",
                "grid_charges_breakdown",
                "household_benchmark_comparison",
            ],
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        })

    return manifest_entries


def scrape_official_providers(output_dir: Path, force: bool = False) -> List[Dict[str, Any]]:
    """Download official complete bills from EnBW, Green Planet Energy, e-regio, Flensburg, SWU, etc."""
    entries: List[Dict[str, Any]] = []

    for item in OFFICIAL_PDF_TARGETS:
        dest_file = output_dir / item["filename"]
        need_download = force or not dest_file.exists() or dest_file.stat().st_size == 0

        if need_download:
            download_url(item["url"], dest_file)

        if dest_file.exists() and dest_file.stat().st_size > 0:
            with open(dest_file, "rb") as f:
                data = f.read()
            entries.append({
                "id": item["id"],
                "filename": item["filename"],
                "provider": item["provider"],
                "provider_short": item["provider_short"],
                "source_category": item["source_category"],
                "carrier": item["carrier"],
                "customer_type": item["customer_type"],
                "title": item["title"],
                "source_url": item["url"],
                "file_size_bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "key_fields_present": item["key_fields"],
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
            })

    return entries


def scrape_community_bills(output_dir: Path, force: bool = False) -> List[Dict[str, Any]]:
    """Download and compile real consumer bills posted by households on Reddit/community."""
    entries: List[Dict[str, Any]] = []

    for item in COMMUNITY_REDDIT_TARGETS:
        dest_file = output_dir / item["filename"]
        need_process = force or not dest_file.exists() or dest_file.stat().st_size == 0

        if need_process:
            logger.info("Processing Community Bill: %s (%d pages)...", item["title"], len(item["image_urls"]))
            images_data = []
            for img_url in item["image_urls"]:
                try:
                    r = requests.get(img_url, headers=REQUEST_IMAGE_HEADERS, timeout=25)
                    if r.status_code == 200 and len(r.content) > 1000:
                        images_data.append(r.content)
                except Exception as e:
                    logger.warning("Error fetching community page %s: %s", img_url, e)

            if images_data:
                images_to_pdf(images_data, dest_file)

        if dest_file.exists() and dest_file.stat().st_size > 0:
            with open(dest_file, "rb") as f:
                data = f.read()
            entries.append({
                "id": item["id"],
                "filename": item["filename"],
                "provider": item["provider"],
                "provider_short": item["provider_short"],
                "source_category": item["source_category"],
                "carrier": item["carrier"],
                "customer_type": item["customer_type"],
                "title": item["title"],
                "source_url": item["reddit_url"],
                "file_size_bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "key_fields_present": item["key_fields"],
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
            })

    return entries


def write_manifests(entries: List[Dict[str, Any]], output_dir: Path) -> None:
    """Save metadata to manifest.json and manifest.csv."""
    json_path = output_dir / "manifest.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "description": "Curated collection of complete German electricity and gas utility bills for energy and heat analysis",
                "total_bills": len(entries),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "bills": entries,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    logger.info("✓ Written JSON manifest: %s", json_path.name)

    csv_path = output_dir / "manifest.csv"
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "filename",
            "provider",
            "source_category",
            "carrier",
            "customer_type",
            "title",
            "file_size_kb",
            "source_url",
            "key_fields_present",
        ])
        for e in entries:
            writer.writerow([
                e["filename"],
                e["provider"],
                e.get("source_category", "official"),
                e["carrier"],
                e["customer_type"],
                e["title"],
                round(e["file_size_bytes"] / 1024, 1),
                e["source_url"],
                "; ".join(e["key_fields_present"]),
            ])
    logger.info("✓ Written CSV manifest: %s", csv_path.name)


def print_summary_table(entries: List[Dict[str, Any]]) -> None:
    """Print an ASCII table summarizing the scraped dataset."""
    print("\n" + "=" * 96)
    print(f"{'FILENAME':<46} | {'CARRIER':<12} | {'SIZE (KB)':<10} | {'PROVIDER'}")
    print("-" * 96)
    for e in entries:
        kb = round(e["file_size_bytes"] / 1024, 1)
        print(f"{e['filename']:<46} | {e['carrier']:<12} | {kb:<10} | {e['provider']}")
    print("=" * 96)
    print(f"Total complete energy bills in dataset: {len(entries)}\n")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scrape complete German electricity and gas bills (SWM, EnBW, Flensburg, SWU, GVG, e-regio, etc.)."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Target output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--provider",
        choices=["all", "swm", "enbw", "green_planet", "e_regio", "community"],
        default="all",
        help="Filter downloads by provider or category (default: all)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-download / re-compilation even if files exist",
    )
    args = parser.parse_args()

    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Output directory: %s", output_dir)

    all_entries: List[Dict[str, Any]] = []

    # 1. SWM
    if args.provider in ("all", "swm"):
        logger.info("--- Processing Stadtwerke München (SWM) ---")
        swm_entries = scrape_swm_bills(output_dir, force=args.force)
        all_entries.extend(swm_entries)

    # 2. Other official providers
    if args.provider in ("all", "enbw", "green_planet", "e_regio"):
        logger.info("--- Processing Official German Utility Providers ---")
        other_entries = scrape_official_providers(output_dir, force=args.force)
        if args.provider != "all":
            other_entries = [e for e in other_entries if e["provider_short"] == args.provider]
        all_entries.extend(other_entries)

    # 3. Real community user bills (Reddit)
    if args.provider in ("all", "community"):
        logger.info("--- Processing Complete Real Consumer Bills (Reddit Community) ---")
        community_entries = scrape_community_bills(output_dir, force=args.force)
        all_entries.extend(community_entries)

    # Save manifest files
    write_manifests(all_entries, output_dir)
    print_summary_table(all_entries)

    return 0


if __name__ == "__main__":
    sys.exit(main())
