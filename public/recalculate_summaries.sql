-- Recalculate all zone coverage summaries to include inactive retailers
-- Run this after applying the updated coverage_setup.sql

-- First, let's see current summary data
SELECT branch, zone, total_retailers, last_updated
FROM zone_coverage_summary
ORDER BY branch, zone;

-- Recalculate all summaries
INSERT INTO zone_coverage_summary (
    branch, zone, region, total_retailers, uao, covered_retailers,
    not_covered_retailers, red_flagged_retailers, coverage_percentage, last_updated
)
SELECT
    rc.branch,
    COALESCE(rc.zone, '') as zone,
    CASE
        WHEN rc.branch = 'LMIT-HS-BARI' THEN 'SOUTH'
        WHEN rc.branch = 'LMIT-HS-BOLOGNA' THEN 'NORTH'
        WHEN rc.branch = 'LMIT-HS-MILAN' THEN 'NORTH'
        WHEN rc.branch = 'LMIT-HS-NAPLES' THEN 'SOUTH'
        WHEN rc.branch = 'LMIT-HS-PADOVA' THEN 'NORTH'
        WHEN rc.branch = 'LMIT-HS-PALERMO' THEN 'SOUTH'
        WHEN rc.branch = 'LMIT-HS-ROME' THEN 'SOUTH'
        WHEN rc.branch = 'LMIT-HS-TORINO' THEN 'NORTH'
        ELSE 'UNKNOWN'
    END as region,
    COUNT(*) as total_retailers,
    COUNT(CASE WHEN rc.status = 'active' THEN 1 END) as uao,
    COUNT(CASE WHEN rc.coverage_status = 'yes' THEN 1 END) as covered_retailers,
    COUNT(CASE WHEN rc.coverage_status = 'no' THEN 1 END) as not_covered_retailers,
    COUNT(CASE WHEN rc.red_flag = true THEN 1 END) as red_flagged_retailers,
    ROUND(
        (COUNT(CASE WHEN rc.coverage_status = 'yes' THEN 1 END)::DECIMAL /
         NULLIF(COUNT(*), 0) * 100)::DECIMAL, 2
    ) as coverage_percentage,
    CURRENT_TIMESTAMP as last_updated
FROM retailer_coverage rc
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

-- Verify the updated summaries
SELECT branch, zone, total_retailers, covered_retailers, not_covered_retailers,
       red_flagged_retailers, coverage_percentage, last_updated
FROM zone_coverage_summary
ORDER BY branch, zone;