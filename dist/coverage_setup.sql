-- Create retailer_coverage table
CREATE TABLE IF NOT EXISTS retailer_coverage (
  id BIGSERIAL PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  branch TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT '',
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('yes', 'no')) DEFAULT 'no',
  planned_visits_count INTEGER NOT NULL DEFAULT 0,
  hs_visits INTEGER NOT NULL DEFAULT 0,
  asm_visits INTEGER NOT NULL DEFAULT 0,
  others_visits INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  red_flag BOOLEAN NOT NULL DEFAULT FALSE,
  red_flag_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(retailer_id, branch)
);

-- Create coverage_import_logs table
CREATE TABLE IF NOT EXISTS coverage_import_logs (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  imported_by UUID,
  rows_processed INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')) DEFAULT 'success',
  error_msg TEXT,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (imported_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create zone_coverage_summary table for aggregated zone-wise data
CREATE TABLE IF NOT EXISTS zone_coverage_summary (
  id BIGSERIAL PRIMARY KEY,
  branch TEXT NOT NULL,
  zone TEXT NOT NULL,
  region TEXT NOT NULL,
  total_retailers INTEGER NOT NULL DEFAULT 0,
  uao INTEGER NOT NULL DEFAULT 0,
  covered_retailers INTEGER NOT NULL DEFAULT 0,
  not_covered_retailers INTEGER NOT NULL DEFAULT 0,
  red_flagged_retailers INTEGER NOT NULL DEFAULT 0,
  coverage_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch, zone)
);
ALTER TABLE zone_coverage_summary ADD COLUMN IF NOT EXISTS uao INTEGER NOT NULL DEFAULT 0;

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_retailer_coverage_branch ON retailer_coverage(branch);
CREATE INDEX IF NOT EXISTS idx_retailer_coverage_status ON retailer_coverage(status);
CREATE INDEX IF NOT EXISTS idx_retailer_coverage_red_flag ON retailer_coverage(red_flag);
CREATE INDEX IF NOT EXISTS idx_coverage_import_logs_imported_at ON coverage_import_logs(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_zone_coverage_summary_branch ON zone_coverage_summary(branch);
CREATE INDEX IF NOT EXISTS idx_zone_coverage_summary_region ON zone_coverage_summary(region);
CREATE INDEX IF NOT EXISTS idx_zone_coverage_summary_zone ON zone_coverage_summary(zone);

-- Enable RLS
ALTER TABLE retailer_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE zone_coverage_summary ENABLE ROW LEVEL SECURITY;

-- RLS Policy: HS-ADMIN can view and manage all coverage records
DROP POLICY IF EXISTS "HS-ADMIN manage coverage" ON retailer_coverage;
CREATE POLICY "HS-ADMIN manage coverage" ON retailer_coverage
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM rpa_users ru
      WHERE ru.auth_user_id = auth.uid()
      AND ru.role = 'HS-ADMIN'
    )
  );

-- RLS Policy: Managers can view coverage records for their branch
DROP POLICY IF EXISTS "Managers view own branch coverage" ON retailer_coverage;
CREATE POLICY "Managers view own branch coverage" ON retailer_coverage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rpa_users ru
      WHERE ru.auth_user_id = auth.uid()
      AND (retailer_coverage.branch = ANY(ru.branches) OR ru.role = 'HS-ADMIN')
    )
  );

-- RLS Policy: HS-ADMIN can manage import logs
DROP POLICY IF EXISTS "HS-ADMIN manage import logs" ON coverage_import_logs;
CREATE POLICY "HS-ADMIN manage import logs" ON coverage_import_logs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM rpa_users ru
      WHERE ru.auth_user_id = auth.uid()
      AND ru.role = 'HS-ADMIN'
    )
  );

-- RLS Policy: Users can view import logs (read-only)
DROP POLICY IF EXISTS "Users view import logs" ON coverage_import_logs;
CREATE POLICY "Users view import logs" ON coverage_import_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rpa_users ru
      WHERE ru.auth_user_id = auth.uid()
    )
  );

-- RLS Policy: Users can view zone coverage summary
DROP POLICY IF EXISTS "Users view zone coverage summary" ON zone_coverage_summary;
CREATE POLICY "Users view zone coverage summary" ON zone_coverage_summary
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM rpa_users ru
      WHERE ru.auth_user_id = auth.uid()
      AND (zone_coverage_summary.branch = ANY(ru.branches) OR ru.role = 'HS-ADMIN')
    )
  );

-- RLS Policy: HS-ADMIN can manage zone coverage summary
DROP POLICY IF EXISTS "HS-ADMIN manage zone coverage summary" ON zone_coverage_summary;
CREATE POLICY "HS-ADMIN manage zone coverage summary" ON zone_coverage_summary
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM rpa_users ru
      WHERE ru.auth_user_id = auth.uid()
      AND ru.role = 'HS-ADMIN'
    )
  );

-- Function to update zone coverage summary
CREATE OR REPLACE FUNCTION update_zone_coverage_summary()
RETURNS TRIGGER AS $$
DECLARE
    zone_region TEXT;
BEGIN
    -- Get region for the branch
    SELECT
        CASE
            WHEN NEW.branch = 'LMIT-HS-BARI' THEN 'SOUTH'
            WHEN NEW.branch = 'LMIT-HS-BOLOGNA' THEN 'NORTH'
            WHEN NEW.branch = 'LMIT-HS-MILAN' THEN 'NORTH'
            WHEN NEW.branch = 'LMIT-HS-NAPLES' THEN 'SOUTH'
            WHEN NEW.branch = 'LMIT-HS-PADOVA' THEN 'NORTH'
            WHEN NEW.branch = 'LMIT-HS-PALERMO' THEN 'SOUTH'
            WHEN NEW.branch = 'LMIT-HS-ROME' THEN 'SOUTH'
            WHEN NEW.branch = 'LMIT-HS-TORINO' THEN 'NORTH'
            ELSE 'UNKNOWN'
        END INTO zone_region;

    -- Insert or update zone coverage summary
    INSERT INTO zone_coverage_summary (
        branch, zone, region, total_retailers, uao, covered_retailers,
        not_covered_retailers, red_flagged_retailers, coverage_percentage, last_updated
    )
    SELECT
        rc.branch,
        COALESCE(rc.zone, ''),
        zone_region,
        COUNT(*) as total_retailers,
        COUNT(CASE WHEN rc.status = 'active' THEN 1 END) as uao,
        COUNT(CASE WHEN rc.coverage_status = 'yes' THEN 1 END) as covered_retailers,
        COUNT(CASE WHEN rc.coverage_status = 'no' THEN 1 END) as not_covered_retailers,
        COUNT(CASE WHEN rc.red_flag = true THEN 1 END) as red_flagged_retailers,
        ROUND(
            (COUNT(CASE WHEN rc.coverage_status = 'yes' THEN 1 END)::DECIMAL /
             NULLIF(COUNT(*), 0) * 100)::DECIMAL, 2
        ) as coverage_percentage,
        CURRENT_TIMESTAMP
    FROM retailer_coverage rc
    WHERE rc.branch = NEW.branch
    AND COALESCE(rc.zone, '') = COALESCE(NEW.zone, '')
    GROUP BY rc.branch, COALESCE(rc.zone, '')
    ON CONFLICT (branch, zone)
    DO UPDATE SET
        total_retailers = EXCLUDED.total_retailers,
        uao = EXCLUDED.uao,
        covered_retailers = EXCLUDED.covered_retailers,
        not_covered_retailers = EXCLUDED.not_covered_retailers,
        red_flagged_retailers = EXCLUDED.red_flagged_retailers,
        coverage_percentage = EXCLUDED.coverage_percentage,
        last_updated = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update zone coverage summary
CREATE OR REPLACE TRIGGER trigger_update_zone_coverage_summary
    AFTER INSERT OR UPDATE OR DELETE ON retailer_coverage
    FOR EACH ROW EXECUTE FUNCTION update_zone_coverage_summary();
