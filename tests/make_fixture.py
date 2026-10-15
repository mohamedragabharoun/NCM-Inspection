"""Regenerates tests/fixtures/db.json from docs/NCM_Inspection_DB_Template.xlsx.
Run from the project folder: python -I tests/make_fixture.py"""
import datetime, json, sys
import openpyxl

wb = openpyxl.load_workbook('docs/NCM_Inspection_DB_Template.xlsx', data_only=True)
out = {}
for ws in wb.worksheets:
    if ws.title == 'README':
        continue
    rows = []
    for r in ws.iter_rows(values_only=True):
        row = []
        for v in r:
            if isinstance(v, (datetime.date, datetime.datetime)):
                v = v.strftime('%Y-%m-%d')
            row.append('' if v is None else v)
        rows.append(row)
    while rows and all(v == '' for v in rows[-1]):
        rows.pop()
    out[ws.title] = rows
json.dump(out, open('tests/fixtures/db.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in out.items()})
