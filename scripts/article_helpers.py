"""
Script para generar el artículo científico formal de nivel Q1 en formato Word (.docx) y Markdown (.md).
Incluye 6 Tablas completas, 6 Figuras detalladas y 42 referencias en formato APA v7.
"""

import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=80, bottom=80, left=100, right=100):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def format_table(table, col_widths, headers, rows_data):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for idx, width in enumerate(col_widths):
        for row in table.rows:
            row.cells[idx].width = width

    # Header Row
    for i, h in enumerate(headers):
        c = table.cell(0, i)
        set_cell_background(c, "1E293B") # slate-800
        set_cell_margins(c, top=90, bottom=90, left=90, right=90)
        p = c.paragraphs[0]
        r = p.add_run(h)
        r.font.name = "Times New Roman"
        r.font.size = Pt(9.5)
        r.font.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Data Rows
    for r_idx, row_values in enumerate(rows_data):
        row = table.rows[r_idx + 1]
        bg = "F8FAFC" if r_idx % 2 == 0 else "FFFFFF"
        for c_idx, val in enumerate(row_values):
            c = row.cells[c_idx]
            set_cell_background(c, bg)
            set_cell_margins(c, top=70, bottom=70, left=80, right=80)
            p = c.paragraphs[0]
            r = p.add_run(str(val))
            r.font.name = "Times New Roman"
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(30, 41, 59)
            if c_idx > 0 and any(char.isdigit() for char in str(val)):
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT

print("Helper definitions loaded.")
