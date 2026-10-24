#!/usr/bin/env python3
"""
Generate an authentic, official-style German "Energieausweis für Wohngebäude" (Verbrauchsausweis)
according to the Gebäudeenergiegesetz (GEG).

This provides a complete, realistic test case for the nuuEnergy WebApp / decision engine:
- Building: Einfamilienhaus (Detached single family home)
- Construction Year: 1982
- Living Area / Gebäudenutzfläche: 165 m²
- Energy Carrier: Erdgas (Natural Gas)
- 3-Year Consumption History (with Klimafaktor & Warmwasseranteil):
    2021: 22,450 kWh
    2022: 19,800 kWh
    2023: 20,500 kWh (average ~20,916 kWh/a)
- Endenergieverbrauch: 126.8 kWh/(m²*a) -> Effizienzklasse D
- Primärenergieverbrauch: 139.5 kWh/(m²*a)
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def create_verbrauchsausweis(filename="data/customer/verbrauchsausweis/muster_energieausweis_verbrauchsausweis.pdf"):
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
    cell_green = ParagraphStyle('CellGreen', parent=styles['Normal'], fontSize=11, leading=14, fontName='Helvetica-Bold', textColor=colors.HexColor('#2d6a4f'))

    story = []

    # Title block
    story.append(Paragraph("ENERGIEAUSWEIS FÜR WOHNGEBÄUDE", header_style))
    story.append(Paragraph("gemäß den §§ 79 ff. Gebäudeenergiegesetz (GEG) vom 08. August 2020", subhead_style))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#2d6a4f'), spaceAfter=10))

    # Page 1: Building Data
    story.append(Paragraph("1. Allgemeine Angaben zum Gebäude", section_title))
    
    gen_data = [
        [Paragraph("Gebäudetyp:", cell_bold), Paragraph("Freistehendes Einfamilienhaus (EFH)", cell_norm),
         Paragraph("Registriernummer:", cell_bold), Paragraph("BY-2023-004819284", cell_norm)],
        [Paragraph("Straße, Hausnr.:", cell_bold), Paragraph("Ahornweg 14", cell_norm),
         Paragraph("Baujahr Gebäude:", cell_bold), Paragraph("<b>1982</b>", cell_norm)],
        [Paragraph("PLZ, Ort:", cell_bold), Paragraph("85521 Riemerling / München", cell_norm),
         Paragraph("Baujahr Wärmeerzeuger:", cell_bold), Paragraph("2008 (Niedertemperaturkessel)", cell_norm)],
        [Paragraph("Wohnfläche:", cell_bold), Paragraph("<b>165,0 m²</b>", cell_norm),
         Paragraph("Anzahl Wohnungen:", cell_bold), Paragraph("1", cell_norm)],
        [Paragraph("Gebäudenutzfläche (A<sub>N</sub>):", cell_bold), Paragraph("<b>198,0 m²</b> (aus Wohnfläche ermittelt)", cell_norm),
         Paragraph("Wesentlicher Energieträger:", cell_bold), Paragraph("<b>Erdgas E (Schwergas)</b>", cell_norm)],
        [Paragraph("Erneuerbare Energien:", cell_bold), Paragraph("Keine", cell_norm),
         Paragraph("Lüftungsart:", cell_bold), Paragraph("Fensterlüftung", cell_norm)]
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
    story.append(Paragraph("Abrechnungsdaten aus drei zusammenhängenden Jahren für Heizung und Warmwasser:", subhead_style))
    story.append(Spacer(1, 4))

    table_data = [
        [
            Paragraph("<b>Zeitraum<br/>von – bis</b>", cell_bold),
            Paragraph("<b>Energieträger</b>", cell_bold),
            Paragraph("<b>Primärenergie-<br/>faktor</b>", cell_bold),
            Paragraph("<b>Energieverbrauch<br/>(kWh)</b>", cell_bold),
            Paragraph("<b>Anteil<br/>Warmwasser</b>", cell_bold),
            Paragraph("<b>Klima-<br/>faktor</b>", cell_bold),
            Paragraph("<b>Klimabereinigt<br/>(kWh)</b>", cell_bold)
        ],
        [
            Paragraph("01.01.2021 – 31.12.2021", cell_norm),
            Paragraph("Erdgas", cell_norm),
            Paragraph("1,1", cell_norm),
            Paragraph("<b>22.450</b>", cell_norm),
            Paragraph("enthalten (zentral)", cell_norm),
            Paragraph("1,04", cell_norm),
            Paragraph("23.348", cell_norm)
        ],
        [
            Paragraph("01.01.2022 – 31.12.2022", cell_norm),
            Paragraph("Erdgas", cell_norm),
            Paragraph("1,1", cell_norm),
            Paragraph("<b>19.800</b>", cell_norm),
            Paragraph("enthalten (zentral)", cell_norm),
            Paragraph("0,98", cell_norm),
            Paragraph("19.404", cell_norm)
        ],
        [
            Paragraph("01.01.2023 – 31.12.2023", cell_norm),
            Paragraph("Erdgas", cell_norm),
            Paragraph("1,1", cell_norm),
            Paragraph("<b>20.500</b>", cell_norm),
            Paragraph("enthalten (zentral)", cell_norm),
            Paragraph("1,01", cell_norm),
            Paragraph("20.705", cell_norm)
        ],
        [
            Paragraph("<b>3-Jahres-Mittel</b>", cell_bold),
            Paragraph("Erdgas", cell_bold),
            Paragraph("1,1", cell_bold),
            Paragraph("<b>20.916 kWh/a</b>", cell_bold),
            Paragraph("—", cell_bold),
            Paragraph("—", cell_bold),
            Paragraph("<b>21.152 kWh/a</b>", cell_bold)
        ]
    ]

    t_cons = Table(table_data, colWidths=[105, 60, 55, 75, 80, 50, 95])
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
            Paragraph("<b>Endenergieverbrauch dieses Gebäudes:</b><br/><font size=14 color='#1b4332'><b>126,8 kWh / (m² · a)</b></font>", cell_norm),
            Paragraph("<b>Primärenergieverbrauch dieses Gebäudes:</b><br/><font size=14 color='#1b4332'><b>139,5 kWh / (m² · a)</b></font>", cell_norm),
            Paragraph("<b>Energieeffizienzklasse:</b><br/><font size=18 color='#2d6a4f'><b>D</b></font>", cell_green)
        ]
    ]
    t_score = Table(score_data, colWidths=[175, 175, 170])
    t_score.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#e8f5e9')),
        ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor('#2d6a4f')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#a5d6a7')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_score)
    story.append(Spacer(1, 12))

    # Technical Details for WebApp Readiness Check
    story.append(Paragraph("4. Zusätzliche Erhebungsdaten für Wärmepumpen-Check (nuuEnergy)", section_title))
    extra_data = [
        [Paragraph("Heizungsverteilung:", cell_bold), Paragraph("Heizkörper (14 Stück, Typ 22 & 33)", cell_norm),
         Paragraph("Rohrsystem:", cell_bold), Paragraph("Zweirohrsystem (hydraulisch abgleichbar)", cell_norm)],
        [Paragraph("Aktuelle Vorlauftemperatur:", cell_bold), Paragraph("ca. 65 °C bei -10 °C Normaußentemperatur", cell_norm),
         Paragraph("Warmwasserbereitung:", cell_bold), Paragraph("Zentral über Gas-Heizkessel (mit Speicher)", cell_norm)],
        [Paragraph("Personen im Haushalt:", cell_bold), Paragraph("3 Personen", cell_norm),
         Paragraph("Empfehlung Sanierungsfahrplan:", cell_bold), Paragraph("Wärmepumpenfähig bei Vorlauftemperatur <= 55 °C", cell_norm)]
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
    print(f"Generated complete Verbrauchsausweis at: {filename}")

if __name__ == "__main__":
    create_verbrauchsausweis()
