-- ISDM Data Table Creation Script
-- This table stores ISDM (Incentive Staff Data Management) data for tracking
-- current month targets vs actual, staff incentive eligibility, and progress analysis

CREATE TABLE IF NOT EXISTS isdm_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Date and Location Information
  date date,
  branch text,
  zone text,
  zone_manager text,
  
  -- Historical Data
  past_year numeric,
  last_month numeric,
  
  -- GA (Gross Ads) Metrics
  ga_tgt numeric,
  ga_mtd numeric,
  ga_ach numeric,
  ga_w numeric,
  
  -- UAO (Unique Active Outlets) Metrics
  uao_tgt numeric,
  uao_mtd numeric,
  uao_ach numeric,
  uao_w numeric,
  
  -- NA (New Outlets) Metrics
  na_tgt numeric,
  na_mtd numeric,
  na_ach numeric,
  na_w numeric,
  
  -- Run Rate and Progress Tracking
  ftd numeric,
  shortfall numeric,
  crr numeric,
  rrr numeric,
  
  -- Weightage and Incentive
  tot_w numeric,
  staff_incentive numeric,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_isdm_date ON isdm_data(date DESC);
CREATE INDEX IF NOT EXISTS idx_isdm_branch ON isdm_data(branch);
CREATE INDEX IF NOT EXISTS idx_isdm_zone ON isdm_data(zone);
CREATE INDEX IF NOT EXISTS idx_isdm_branch_zone ON isdm_data(branch, zone);
CREATE INDEX IF NOT EXISTS idx_isdm_date_branch_zone ON isdm_data(date DESC, branch, zone);

-- Enable RLS (Row Level Security) if desired
ALTER TABLE isdm_data ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow authenticated users to read ISDM data
CREATE POLICY "Allow authenticated users to read ISDM data" 
ON isdm_data 
FOR SELECT 
TO authenticated 
USING (true);

-- Create a policy to allow admins to insert/update/delete ISDM data
CREATE POLICY "Allow admins to manage ISDM data" 
ON isdm_data 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM rpa_users 
    WHERE auth_user_id = auth.uid() 
    AND role IN ('HS-ADMIN', 'COUNTRY-MANAGER')
  )
);

-- Optional: Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_isdm_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to call the function before any update
CREATE TRIGGER update_isdm_data_timestamp
  BEFORE UPDATE ON isdm_data
  FOR EACH ROW
  EXECUTE FUNCTION update_isdm_data_updated_at();

-- Sample data (uncomment to insert test data)
/*
INSERT INTO isdm_data (
  date, branch, zone, zone_manager,
  past_year, last_month,
  ga_tgt, ga_mtd, ga_ach, ga_w,
  uao_tgt, uao_mtd, uao_ach, uao_w,
  na_tgt, na_mtd, na_ach, na_w,
  ftd, shortfall, crr, rrr,
  tot_w, staff_incentive
) VALUES
  ('2026-04-10', 'LMIT-HS-NORTH1', 'North Zone 1', 'Zone Manager 1',
   1000, 950,
   500, 480, 96, 30,
   100, 95, 95, 30,
   20, 18, 90, 40,
   50, 20, 95, 100,
   100, 5000),
  ('2026-04-10', 'LMIT-HS-SOUTH1', 'South Zone 1', 'Zone Manager 2',
   1200, 1100,
   600, 620, 103.33, 35,
   120, 110, 91.67, 33,
   25, 22, 88, 32,
   60, -20, 110, 95,
   100, 6500),
  ('2026-04-10', 'LMIT-HS-NORTH2', 'North Zone 2', 'Zone Manager 3',
   900, 850,
   450, 400, 88.89, 25,
   90, 75, 83.33, 28,
   18, 14, 77.78, 47,
   40, 50, 85, 110,
   100, 3500);
*/
