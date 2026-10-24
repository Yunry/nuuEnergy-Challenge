#!/usr/bin/env python3
"""
Generate an authentic, official-style German "Energieausweis für Wohngebäude" (Verbrauchsausweis)
specifically based on real challenge case B-03 (Hamburg area, 1970 single family home, oil heating).

Data derived directly from:
- data/demo/B-03/raw/customer_input.json
- data/demo/B-03/output/decision.json & heat load calculations

Attributes:
- Building: Einfamilienhaus (Detached single family home, 11 rooms)
- Construction Year: 1970
- Floor Area / Wohnfläche: 200 m² (Gebäudenutzfläche AN = 240 m²)
- Energy Carrier: Heizöl EL (Heating Oil)
- Consumption: ~4,000 Litres/year (~40,000 kWh/a)
- 3-Year History:
    2021: 41,500 kWh (4,150 L)
    2022: 38,200 kWh (3,820 L)
    2023: 40,300 kWh (4,030 L) -> 3-Jahres-Mittel 40.000 kWh/a
- Endenergieverbrauch: 166.7 kWh/(m²*a) -> Effizienzklasse F
- Primärenergieverbrauch: 183.3 kWh/(m²*a)
- Radiators: 15 radiators, two-pipe system (12 valves to replace)
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def create_verbrauchsausweis_b03(filename="data/raw/energy_bills/energieausweis_b03_hamburg_1970_oel.pdf"):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#1b4332'),
        fontName='Helvetica-Bold'
    )
    
    subhead_style = ParagraphStyle(
        'SubheadStyle',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#405b4d'),
        fontName='Helvetica'
    )
    
    section_title = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#1b4332'),
        fontName='Helvetica-Bold',
        spaceBefore=10,
        spaceAfter=4
    )

    cell_bold = ParagraphStyle('CellBold', parent=styles['Normal'], fontSize=8.5, leading=11, fontName='Helvetica-Bold')
    cell_norm = ParagraphStyle('CellNorm', parent=styles['Normal'], fontSize=8.5, leading=11, fontName='Helvetica')
    cell_badge = ParagraphStyle('CellBadge', parent=styles['Normal'], fontSize=16, leading=20, fontName='Helvetica-Bold', textColor=colors.HexColor('#b7094c'))

    story = []

    # Title block
    story.append(Paragraph("ENERGIEAUSWEIS FÜR WOHNGEBÄUDE", header_style))
    story.append(Paragraph("gemäß den §§ 79 ff. Gebäudeenergiegesetz (GEG) vom 08. August 2020", subhead_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#2d6a4f'), spaceAfter=10))

    # Page 1: Building Data
    story.append(Paragraph("1. Allgemeine Angaben zum Gebäude (Fallstudie B-03)", section_title))
    
    gen_data = [
        [Paragraph("Gebäudetyp:", cell_bold), Paragraph("Freistehendes Einfamilienhaus (11 Zimmer)", cell_norm),
         Paragraph("Registriernummer:", cell_bold), Paragraph("HH-2023-009281745", cell_norm)],
        [Paragraph("Straße, Hausnr.:", cell_bold), Paragraph("Eichenallee 27", cell_norm),
         Paragraph("Baujahr Gebäude:", cell_bold), Paragraph("<b>1970</b> (Aufstockung Dach 1990er)", cell_norm)],
        [Paragraph("PLZ, Ort:", cell_bold), Paragraph("21xxx Hamburg Umland", cell_norm),
         Paragraph("Baujahr Wärmeerzeuger:", cell_bold), Paragraph("1998 (Öl-Heizkessel)", cell_norm)],
        [Paragraph("Wohnfläche:", cell_bold), Paragraph("<b>200,0 m²</b>", cell_norm),
         Paragraph("Anzahl Wohnungen:", cell_bold), Paragraph("1 (teilw. unbewohntes Dachgeschoss)", cell_norm)],
        [Paragraph("Gebäudenutzfläche (A<sub>N</sub>):", cell_bold), Paragraph("<b>240,0 m²</b> (aus Wohnfläche ermittelt)", cell_norm),
         Paragraph("Wesentlicher Energieträger:", cell_bold), Paragraph("<b>Heizöl EL (ca. 4.000 L/Jahr)</b>", cell_norm)],
        [Paragraph("Sanierungsstand:", cell_bold), Paragraph("Teilsaniert (Einblasdämmung, Dach gedämmt)", cell_norm),
         Paragraph("Fenster:", cell_bold), Paragraph("Zweifachverglasung (ohne Wärmeschutzschicht)", cell_norm)]
    ]
    
    t_gen = Table(gen_data, colWidths=[130, 130, 130, 130])
    t_gen.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8f9fa')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dee2e6')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_gen)
    story.append(Spacer(1, 12))

    # Page 2 / 3: Verbrauchserfassung
    story.append(Paragraph("2. Erfasster Energieverbrauch des Gebäudes (Verbrauchsausweis)", section_title))
    story.append(Paragraph("Abrechnungsdaten aus 3 zusammenhängenden Jahren für Heizöl EL und Warmwasser:", subhead_style))
    story.append(Spacer(1, 4))

    table_data = [
        [
            Paragraph("<b>Zeitraum<br/>von – bis</b>", cell_bold),
            Paragraph("<b>Energieträger</b>", cell_bold),
            Paragraph("<b>Primärenergie-<br/>faktor</b>", cell_bold),
            Paragraph("<b>Energieverbrauch<br/>(kWh / Liter)</b>", cell_bold),
            Paragraph("<b>Anteil<br/>Warmwasser</b>", cell_bold),
            Paragraph("<b>Klima-<br/>faktor</b>", cell_bold),
            Paragraph("<b>Klimabereinigt<br/>(kWh)</b>", cell_bold)
        ],
        [
            Paragraph("01.01.2021 – 31.12.2021", cell_norm),
            Paragraph("Heizöl EL", cell_norm),
            Paragraph("1,1", cell_norm),
            Paragraph("<b>41.500 kWh</b> (4.150 l)", cell_norm),
            Paragraph("enthalten (zentral)", cell_norm),
            Paragraph("1,02", cell_norm),
            Paragraph("42.330", cell_norm)
        ],
        [
            Paragraph("01.01.2022 – 31.12.2022", cell_norm),
            Paragraph("Heizöl EL", cell_norm),
            Paragraph("1,1", cell_norm),
            Paragraph("<b>38.200 kWh</b> (3.820 l)", cell_norm),
            Paragraph("enthalten (zentral)", cell_norm),
            Paragraph("0,99", cell_norm),
            Paragraph("37.818", cell_norm)
        ],
        [
            Paragraph("01.01.2023 – 31.12.2023", cell_norm),
            Paragraph("Heizöl EL", cell_norm),
            Paragraph("1,1", cell_norm),
            Paragraph("<b>40.300 kWh</b> (4.030 l)", cell_norm),
            Paragraph("enthalten (zentral)", cell_norm),
            Paragraph("1,00", cell_norm),
            Paragraph("40.300", cell_norm)
        ],
        [
            Paragraph("<b>3-Jahres-Mittel</b>", cell_bold),
            Paragraph("Heizöl EL", cell_bold),
            Paragraph("1,1", cell_bold),
            Paragraph("<b>40.000 kWh/a</b> (~4.000 l)", cell_bold),
            Paragraph("—", cell_bold),
            Paragraph("—", cell_bold),
            Paragraph("<b>40.149 kWh/a</b>", cell_bold)
        ]
    ]

    t_cons = Table(table_data, colWidths=[105, 60, 55, 95, 75, 45, 85])
    t_cons.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e8f5e9')),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#f1f8e9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#c8e6c9')),
        ('ALIGN', (2,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_cons)
    story.append(Spacer(1, 10))

    # Kennwerte
    story.append(Paragraph("3. Endenergieverbrauch dieses Gebäudes", section_title))
    
    score_data = [
        [
            Paragraph("<b>Endenergieverbrauch dieses Gebäudes:</b><br/><font size=14 color='#1b4332'><b>166,7 kWh / (m² · a)</b></font>", cell_norm),
            Paragraph("<b>Primärenergieverbrauch dieses Gebäudes:</b><br/><font size=14 color='#1b4332'><b>183,3 kWh / (m² · a)</b></font>", cell_norm),
            Paragraph("<b>Energieeffizienzklasse:</b><br/><font size=18 color='#b7094c'><b>F</b></font>", cell_badge)
        ]
    ]
    t_score = Table(score_data, colWidths=[175, 175, 170])
    t_score.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fff0f3')),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#b7094c')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#ffccd5')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_score)
    story.append(Spacer(1, 12))

    # Technical Details for WebApp Readiness Check
    story.append(Paragraph("4. Zusätzliche Erhebungsdaten für Wärmepumpen-Check (B-03 nuuEnergy)", section_title))
    extra_data = [
        [Paragraph("Heizungsverteilung:", cell_bold), Paragraph("Heizkörper (15 Stück; teilw. Plattenheizkörper)", cell_norm),
         Paragraph("Rohrsystem:", cell_bold), Paragraph("Zweirohrsystem (alle HK gleiche Vorlauftemp.)", cell_norm)],
        [Paragraph("Heizkörper-Ventile:", cell_bold), Paragraph("12 Ventile austauschbedürftig (voreinstellbar)", cell_norm),
         Paragraph("Warmwasserbereitung:", cell_bold), Paragraph("Zentral über Heizkessel (2 Personen Haushalt)", cell_norm)],
        [Paragraph("Heizlast nach Verbrauch:", cell_bold), Paragraph("15,8 – 18,4 kW (Vergleich DIN: 14,5 kW)", cell_norm),
         Paragraph("Wärmepumpen-Eignung:", cell_bold), Paragraph("<b>Gelb (Bedingt geeignet)</b> – Typ 22/33 HK benötigt", cell_norm)]
    ]
    t_extra = Table(extra_data, colWidths=[130, 130, 130, 130])
    t_extra.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8f9fa')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dee2e6')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_extra)

    doc.build(story)
    print(f"Generated B-03 Verbrauchsausweis at: {filename}")

if __name__ == "__main__":
    create_verbrauchsausweis_b03()
