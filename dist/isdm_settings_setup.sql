-- ISDM Settings Table
-- This table stores configurable ISDM parameters like weightages, commission slabs, and earning brackets

CREATE TABLE IF NOT EXISTS isdm_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Weightage Percentages
  ga_weightage numeric DEFAULT 75,
  uao_weightage numeric DEFAULT 25,
  na_weightage numeric DEFAULT 0,
  
  -- Commission Slabs (€)
  zone_manager_slab numeric DEFAULT 700,
  asm_slab numeric DEFAULT 1000,
  rsm_slab numeric DEFAULT 1500,
  
  -- Incentive Earning Percentage Brackets
  bracket_90_95_percent numeric DEFAULT 50,
  bracket_95_100_percent numeric DEFAULT 80,
  bracket_100_105_percent numeric DEFAULT 100,
  bracket_106_119_percent numeric DEFAULT 110,
  bracket_120_above_percent numeric DEFAULT 120,
  
  -- Timestamps
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE isdm_settings ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow authenticated users to read settings
CREATE POLICY "Allow authenticated users to read ISDM settings" 
ON isdm_settings 
FOR SELECT 
TO authenticated 
USING (true);

-- Create a policy to allow only HS-ADMIN to update settings
CREATE POLICY "Allow HS-ADMIN to manage ISDM settings" 
ON isdm_settings 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM rpa_users 
    WHERE auth_user_id = auth.uid() 
    AND role = 'HS-ADMIN'
  )
);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_isdm_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to call the function before any update
DROP TRIGGER IF EXISTS update_isdm_settings_timestamp ON isdm_settings;
CREATE TRIGGER update_isdm_settings_timestamp
  BEFORE UPDATE ON isdm_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_isdm_settings_updated_at();

-- Insert default settings row if it doesn't exist
INSERT INTO isdm_settings (
  id, ga_weightage, uao_weightage, na_weightage,
  zone_manager_slab, asm_slab, rsm_slab,
  bracket_90_95_percent, bracket_95_100_percent, bracket_100_105_percent,
  bracket_106_119_percent, bracket_120_above_percent
)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  75, 25, 0,
  700, 1000, 1500,
  50, 80, 100,
  110, 120
WHERE NOT EXISTS (SELECT 1 FROM isdm_settings);
