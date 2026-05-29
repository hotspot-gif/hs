# ISDM Table Setup Instructions

## Overview
This guide will help you set up the ISDM (Incentive Staff Data Management) data table in your Supabase database.

## Steps to Create the Table

### Option 1: Using Supabase Dashboard (Recommended)

1. **Open Supabase Console**
   - Go to https://app.supabase.com
   - Select your project
   - Navigate to the **SQL Editor** section

2. **Create the Table**
   - Click **New Query**
   - Copy the entire content from `public/isdm_setup.sql`
   - Paste it into the SQL editor
   - Click **Run**

3. **Verify the Table**
   - Navigate to **Database** → **Tables**
   - You should see a new table called `isdm_data`
   - Verify it has all the columns listed below

### Option 2: Using psql Command Line

If you have Supabase CLI installed:

```bash
# Login to Supabase
supabase login

# Run the SQL file
supabase db push --file public/isdm_setup.sql
```

## Table Structure

The `isdm_data` table includes the following columns:

### Identification Fields
- `id` (UUID) - Unique identifier, auto-generated
- `date` (date) - Report date
- `branch` (text) - Branch identifier
- `zone` (text) - Zone identifier
- `zone_manager` (text) - Zone manager name

### Historical Data
- `past_year` (numeric) - Past year same month actual
- `last_month` (numeric) - Last month actual

### GA Metrics (Gross Ads)
- `ga_tgt` (numeric) - GA target for current month
- `ga_mtd` (numeric) - GA actual (Month-to-Date)
- `ga_ach` (numeric) - GA achievement percentage
- `ga_w` (numeric) - GA weightage

### UAO Metrics (Unique Active Outlets)
- `uao_tgt` (numeric) - UAO target
- `uao_mtd` (numeric) - UAO actual (Month-to-Date)
- `uao_ach` (numeric) - UAO achievement percentage
- `uao_w` (numeric) - UAO weightage

### NA Metrics (New Outlets)
- `na_tgt` (numeric) - NA target
- `na_mtd` (numeric) - NA actual (Month-to-Date)
- `na_ach` (numeric) - NA achievement percentage
- `na_w` (numeric) - NA weightage

### Progress Tracking
- `ftd` (numeric) - Yesterday actual (FTD = First To Date)
- `shortfall` (numeric) - Gap to reach target
- `crr` (numeric) - Current Run Rate
- `rrr` (numeric) - Required Run Rate

### Incentive Information
- `tot_w` (numeric) - Total weightage (sum of ga_w + uao_w + na_w)
- `staff_incentive` (numeric) - Staff incentive approximate amount

### System Fields
- `created_at` (timestamp) - Automatically set when record is created
- `updated_at` (timestamp) - Automatically updated on any changes

## Indexes Created

The following indexes are automatically created for better query performance:
- `idx_isdm_date` - For sorting by date
- `idx_isdm_branch` - For filtering by branch
- `idx_isdm_zone` - For filtering by zone
- `idx_isdm_branch_zone` - For combined branch/zone queries
- `idx_isdm_date_branch_zone` - For comprehensive filtering

## Row Level Security (RLS) Policies

Two policies are created:

1. **Read Access**: All authenticated users can read ISDM data
2. **Write Access**: Only users with 'HS-ADMIN' or 'COUNTRY-MANAGER' role can insert/update/delete

## Inserting Sample Data

The SQL file includes commented-out sample data. To activate it:

1. Remove the `/*` at the beginning and `*/` at the end of the sample data section
2. Run the query again

Or manually insert data:

```sql
INSERT INTO isdm_data (
  date, branch, zone, zone_manager,
  past_year, last_month,
  ga_tgt, ga_mtd, ga_ach, ga_w,
  uao_tgt, uao_mtd, uao_ach, uao_w,
  na_tgt, na_mtd, na_ach, na_w,
  ftd, shortfall, crr, rrr,
  tot_w, staff_incentive
) VALUES (
  '2026-04-10', 'LMIT-HS-NORTH1', 'North Zone 1', 'Manager Name',
  1000, 950,
  500, 480, 96, 30,
  100, 95, 95, 30,
  20, 18, 90, 40,
  50, 20, 95, 100,
  100, 5000
);
```

## Troubleshooting

### Table Not Created
- Check if you have the correct Supabase project selected
- Verify your authentication credentials
- Check the SQL error message in the Supabase dashboard

### Insufficient Permissions
- Verify your Supabase account role is 'owner' or 'admin'
- Check that RLS policies are correctly configured

### Data Not Showing in Dashboard
- Ensure data exists in the table: `SELECT COUNT(*) FROM isdm_data;`
- Check browser console (F12) for JavaScript errors
- Verify the date values are in correct date format
- Check that branch names match exactly (case-sensitive)

## Updating Data

To update ISDM data:

```sql
UPDATE isdm_data
SET ga_mtd = 500, ga_ach = 100
WHERE date = '2026-04-10' AND branch = 'LMIT-HS-NORTH1' AND zone = 'North Zone 1';
```

The `updated_at` field will be automatically updated.

## Deleting Old Data

To archive or delete old data:

```sql
DELETE FROM isdm_data
WHERE date < '2026-01-01';
```

## Next Steps

1. Create the table using the SQL file
2. Insert sample data
3. Refresh the ISDM page in the dashboard
4. Check browser console for any errors
5. Verify data appears in the dashboard filters and charts
