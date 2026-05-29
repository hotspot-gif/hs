import csv

# Read CSV file
with open('public/kpi_sample_data.csv', 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

# Generate SQL
sql_lines = [
    "-- KPI Data Bulk Insert from Real Data",
    "INSERT INTO kpi_data (branch, zone, month, year, ga, ga_target, uao, uao_target, na, na_target)",
    "VALUES"
]

# Add data rows
for i, row in enumerate(rows):
    value_str = f"  ('{row['branch']}', '{row['zone']}', '{row['month']}', {row['year']}, {row['ga']}, {row['ga_target']}, {row['uao']}, {row['uao_target']}, {row['na']}, {row['na_target']})"
    if i < len(rows) - 1:
        value_str += ","
    sql_lines.append(value_str)

sql_lines.extend([
    "ON CONFLICT (branch, zone, month, year) DO UPDATE SET",
    "  ga = EXCLUDED.ga,",
    "  ga_target = EXCLUDED.ga_target,",
    "  uao = EXCLUDED.uao,",
    "  uao_target = EXCLUDED.uao_target,",
    "  na = EXCLUDED.na,",
    "  na_target = EXCLUDED.na_target,",
    "  updated_at = NOW();"
])

# Write to file
with open('public/kpi_insert.sql', 'w') as f:
    f.write('\n'.join(sql_lines))

print(f"Generated SQL file with {len(rows)} records")
