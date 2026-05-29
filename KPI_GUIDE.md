# KPI Dashboard Feature Guide

## Overview
The KPI Dashboard provides comprehensive performance tracking for three key metrics:
- **GA (Gross Ads)** - Total advertising gross ads count
- **UAO (Unique Active Outlets)** - Number of unique, active outlets
- **NA (New Outlets)** - Count of newly opened outlets

## Accessing the KPI Dashboard

1. **Log in** to the application with any role (admin, RSM, or ASM)
2. **Navigate** to the "KPI" section from the left sidebar (visible to all users)
3. **Select** a Branch from the top filter
4. **Optionally select** a Zone from the top filter
5. **Choose** a Year from the year selector

## Features

### 1. Branch & Zone Filtering
- **Branch Filter**: Required filter to select which branch to analyze
- **Zone Filter**: Optional filter to drill down to specific zone data within a branch
- When no zone is selected, data is aggregated for the entire branch

### 2. Year Selection & Year-over-Year Comparison
- **Year Selector**: Dropdown to choose which year to analyze
- Available years are automatically populated from database
- Shows current year data and compares trends with previous year
- Auto-detects available years from imported data

### 3. KPI Cards (Summary Metrics)
Four responsive cards display key metrics for the selected period:
- **Actual vs Target**: Current period values vs targets
- **Achievement %**: Visual progress bar showing % of target achieved
- **Average**: Average value across the period
- **Highest/Lowest**: Peak and minimum values recorded

Color coding for achievement:
- 🟢 **Green**: ≥100% achieved
- 🟡 **Yellow**: 80-99% achieved
- 🔴 **Red**: <80% achieved

### 4. Three Interactive Charts

#### GA - Gross Ads Chart
- Bar chart showing monthly Gross Ads
- Blue bars = Actual achieved
- Orange bars = Target
- Clear visualization of target hit/miss

#### UAO - Unique Active Outlets Chart
- Bar chart showing monthly UAO values
- Blue bars = Actual outlets
- Orange bars = Target
- Tracks outlet sustainability

#### NA - New Outlets Chart
- Bar chart showing monthly New Outlets
- Blue bars = New outlets added
- Orange bars = Target new outlets
- Tracks growth performance

#### Year-over-Year Trend Chart
- Line chart comparing current year vs previous year
- Solid line = Current year (2024)
- Dashed line = Previous year (2023)
- Helps identify seasonal patterns and trends

### 5. Analysis Cards
Detailed breakdown cards show:
- **Achievement %**: Percentage of target achieved
- **Average**: Mean performance across period
- **Highest**: Best monthly performance
- **Lowest**: Worst monthly performance
- **Target Met**: Count of months where target was achieved
- **Trend Indicator**: Shows positive/negative % change vs target

## Data Management

### Importing KPI Data

1. Go to **Data Import** (Admin only)
2. Click the **"KPI Data"** tab
3. **Upload a CSV file** with the following columns:

| Column | Format | Example | Required |
|--------|--------|---------|----------|
| branch | Text | MUMBAI | ✓ |
| zone | Text | Mumbai North | ✓ |
| month | YYYY-MM | 2024-01 | ✓ |
| year | YYYY | 2024 | ✓ |
| ga | Number | 3473 | ✓ |
| ga_target | Number | 3500 | ✓ |
| uao | Number | 14627 | ✓ |
| uao_target | Number | 15000 | ✓ |
| na | Number | 2 | ✓ |
| na_target | Number | 5 | ✓ |

### CSV Format Example
```csv
branch,zone,month,year,ga,ga_target,uao,uao_target,na,na_target
MUMBAI,Mumbai North,2024-01,2024,3473,3500,14627,15000,2,5
MUMBAI,Mumbai North,2024-02,2024,3904,3500,12274,15000,4,5
DELHI,Delhi North,2024-01,2024,3052,3200,18256,18000,3,4
```

### Sample Data
A sample CSV file is available at: `public/kpi_sample_data.csv`

### Database Setup
Run the SQL script at: `public/kpi-setup.sql` to create the KPI data table

## User Access Control

**KPI Dashboard**: Available to all logged-in users
- View KPI data for assigned branches
- Filter by zone and year
- Access charts and analysis metrics

**KPI Data Import**: Admin (HS-ADMIN) only
- Import KPI data via CSV
- Update existing KPI records
- View import history and logs

## Responsive Design

The KPI Dashboard is fully responsive and optimized for:
- **Desktop**: Full multi-column layout with all charts visible
- **Tablet**: 2-column grid for charts
- **Mobile**: Single-column layout with horizontal chart scrolling

### Breakpoints
- Mobile: < 768px (single column)
- Tablet: 768px - 1024px (2 columns)
- Desktop: > 1024px (full grid layout)

## Performance Notes

- Charts use optimized Recharts library for smooth rendering
- Data is fetched from Supabase on demand
- Year filtering reduces data payload
- Maximum 12 months of data per year shown

## Troubleshooting

### No Data Displayed
1. Verify data has been imported via Data Import > KPI Data
2. Check that branch name matches exactly (case-sensitive)
3. Ensure month format is YYYY-MM and year is 4-digit
4. Verify zone values match what's in the database

### Charts Not Rendering
1. Check browser console for errors
2. Ensure recharts library is properly installed
3. Try selecting a different year/branch
4. Refresh the page

### Year Selector Empty
1. Ensure KPI data exists in the database
2. Run kpi-setup.sql to create sample data
3. Verify import was successful (check Data Import history)

## Tips for Best Usage

1. **Monthly updates**: Import KPI data monthly to track trends
2. **Consistent naming**: Use consistent branch/zone names across all imports
3. **Target planning**: Update targets based on strategic goals
4. **Regular reviews**: Check KPI dashboard weekly for performance tracking
5. **Zone analysis**: Use zone filtering for detailed area-level analysis

## Data Retention

- KPI data is stored permanently in the database
- Historical data supports year-over-year comparisons
- No automatic purging of old data
- Manual deletion available through database admin tools

## Future Enhancements

Potential features for future iterations:
- Export KPI reports as PDF
- Custom date range selections
- Trend forecasting
- Email alerts for target misses
- KPI comparison between branches/zones
- Custom metric calculations
