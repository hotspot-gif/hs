import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { ISDMData, RpaUser } from '@/types';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, Calendar, AlertCircle, CheckCircle2, Trophy, Settings } from 'lucide-react';
import { NORTH_REGION, SOUTH_REGION, normalizeBranch } from '@/data/mockData';
import ISDMSettings from './ISDMSettings';

interface ISDMProps {
  user?: RpaUser;
  branch: string;
  zone: string;
  region?: string;
}

interface ISDMMetrics {
  ga: { target: number; actual: number; achievement: number; weightage: number };
  uao: { target: number; actual: number; achievement: number; weightage: number };
  na: { target: number; actual: number; achievement: number; weightage: number };
  staffIncentiveEligible: boolean;
  totalWeightage: number;
  incentiveEarningPercent: number;
  incentiveAmount: number;
}

interface ChartDataPoint {
  date: string;
  zone: string;
  ga_mtd: number;
  ga_tgt: number;
  ga_shortfall: number;
  ga_over_achievement: number;
  ga_ach: number;
  ga_proj: number;
  uao_mtd: number;
  uao_tgt: number;
  uao_shortfall: number;
  uao_over_achievement: number;
  uao_ach: number;
  na_mtd: number;
  na_tgt: number;
  na_shortfall: number;
  na_over_achievement: number;
  na_ach: number;
  crr: number;
  rrr: number;
}

interface GAComparisonDataPoint {
  zone: string;
  ga_current: number;
  ga_last_month: number;
  ga_past_year: number;
  ga_target: number;
  ga_current_ach: number;
}

interface MetricCard {
  title: string;
  target: number;
  actual: number;
  achievement: number;
  weightage?: number;
  color: string;
}

const MetricCard = ({ title, target, actual, achievement, weightage, color }: MetricCard) => {
  return (
    <div className="p-4 md:p-6 bg-white rounded-lg border border-gray-200 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-bold text-[#21264E] text-sm md:text-base">{title}</h3>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Target</p>
          <p className="text-lg md:text-2xl font-bold text-[#21264E]">{Math.round(target)}</p>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Actual</p>
            <p className="text-lg md:text-xl font-bold text-blue-600">{Math.round(actual)}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Achievement %</p>
            <p className="text-lg md:text-xl font-bold text-[#21264E]">{achievement.toFixed(1)}%</p>
          </div>
        </div>

        {weightage !== undefined && (
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Weightage</p>
            <p className="text-base font-bold text-purple-600">{weightage.toFixed(1)}%</p>
          </div>
        )}

        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full transition-all ${color}`}
            style={{ width: `${Math.min(achievement, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const ChartCard = ({ title, children }: { title: string; children: any }) => (
  <div className="p-4 md:p-6 bg-white rounded-lg border border-gray-200">
    <h3 className="font-bold text-[#21264E] text-sm md:text-base mb-4">{title}</h3>
    {children}
  </div>
);

interface ISDMSettingsData {
  ga_weightage: number;
  uao_weightage: number;
  na_weightage: number;
  zone_manager_slab: number;
  asm_slab: number;
  rsm_slab: number;
  bracket_90_95_percent: number;
  bracket_95_100_percent: number;
  bracket_100_105_percent: number;
  bracket_106_119_percent: number;
  bracket_120_above_percent: number;
}

interface GAProjection {
  currentGA: number;
  totalCRR: number;
  requiredRRR: number;
  remainingDays: number;
  projectedGA: number;
  target: number;
  shortfall: number;
  isOnTrack: boolean;
}

export default function ISDM({ user, branch, zone, region }: ISDMProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [metrics, setMetrics] = useState<ISDMMetrics | null>(null);
  const [gaProjection, setGAProjection] = useState<GAProjection | null>(null);
  const [gaComparisonData, setGAComparisonData] = useState<GAComparisonDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ISDMSettingsData | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      fetchISDMData();
    }
  }, [branch, zone, region, settings]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('isdm_settings')
        .select('*')
        .single();

      if (error) {
        console.error('Error fetching ISDM settings:', error);
        // Use defaults if fetch fails
        setSettings({
          ga_weightage: 75,
          uao_weightage: 25,
          na_weightage: 0,
          zone_manager_slab: 700,
          asm_slab: 1000,
          rsm_slab: 1500,
          bracket_90_95_percent: 50,
          bracket_95_100_percent: 80,
          bracket_100_105_percent: 100,
          bracket_106_119_percent: 110,
          bracket_120_above_percent: 120,
        });
        return;
      }

      setSettings(data as ISDMSettingsData);
    } catch (err) {
      console.error('Error in fetchSettings:', err);
    }
  };

  const fetchISDMData = async () => {
    setLoading(true);
    try {
      const normalizedBranch = branch?.trim() || '';
      const normalizedZone = zone?.trim() || '';
      const isBranchSelected = Boolean(normalizedBranch);

      console.log('Fetching ISDM data for:', { normalizedBranch, normalizedZone, region });

      // Fetch all ISDM data from Supabase
      const { data, error } = await supabase
        .from('isdm_data')
        .select('*')
        .order('date', { ascending: false })
        .limit(1500);

      if (error) {
        console.error('Error fetching ISDM data:', error);
        console.error('Table might not exist or you might not have permission to access it');
        setLoading(false);
        return;
      }

      console.log('Total ISDM records fetched:', data?.length || 0);

      let isdmRecords = (data as ISDMData[]) || [];

      // Filter by region first (if specified)
      if (region && region !== 'ITALY') {
        isdmRecords = isdmRecords.filter(r => {
          const recordBranch = normalizeBranch(r.branch || '');
          if (region === 'NORTH') {
            return NORTH_REGION.includes(recordBranch);
          } else if (region === 'SOUTH') {
            return SOUTH_REGION.includes(recordBranch);
          }
          return true;
        });
      }

      // Filter by branch and zone
      if (normalizedBranch) {
        isdmRecords = isdmRecords.filter(r => r.branch?.toLowerCase().trim() === normalizedBranch.toLowerCase().trim());

        if (normalizedZone) {
          isdmRecords = isdmRecords.filter(r => r.zone?.toLowerCase().trim() === normalizedZone.toLowerCase().trim());
        }
      }

      console.log('Filtered ISDM records after region/branch/zone filtering:', isdmRecords.length);

      if (isdmRecords.length === 0) {
        setChartData([]);
        setGAComparisonData([]);
        setMetrics(null);
        setLoading(false);
        return;
      }

      // Get the most recent date (current month)
      const mostRecentDate = isdmRecords[0]?.date;

      // Filter for current month data
      const currentMonthData = isdmRecords.filter(r => r.date === mostRecentDate);

      if (isBranchSelected) {
        setGAComparisonData(
          currentMonthData.map((item) => {
            const current = item.ga_mtd || 0;
            const target = item.ga_tgt || 0;
            return {
              zone: item.zone || 'N/A',
              ga_current: current,
              ga_last_month: item.last_month || 0,
              ga_past_year: item.past_year || 0,
              ga_target: target,
              ga_current_ach: target > 0 ? (current / target) * 100 : 0,
            };
          })
        );
      } else {
        const byBranch = new Map<string, Omit<GAComparisonDataPoint, 'ga_current_ach'>>();

        for (const item of currentMonthData) {
          const key = normalizeBranch(item.branch || '') || 'N/A';
          const label = (item.branch || 'N/A').replace('LMIT-HS-', '');

          const current = item.ga_mtd || 0;
          const target = item.ga_tgt || 0;
          const lastMonth = item.last_month || 0;
          const pastYear = item.past_year || 0;

          const existing = byBranch.get(key);
          if (existing) {
            byBranch.set(key, {
              zone: existing.zone,
              ga_current: existing.ga_current + current,
              ga_last_month: existing.ga_last_month + lastMonth,
              ga_past_year: existing.ga_past_year + pastYear,
              ga_target: existing.ga_target + target,
            });
          } else {
            byBranch.set(key, {
              zone: label,
              ga_current: current,
              ga_last_month: lastMonth,
              ga_past_year: pastYear,
              ga_target: target,
            });
          }
        }

        setGAComparisonData(
          Array.from(byBranch.values()).map((v) => ({
            ...v,
            ga_current_ach: v.ga_target > 0 ? (v.ga_current / v.ga_target) * 100 : 0,
          }))
        );
      }

      // Create chart data points (all records for the current month)
      let chartDataPoints: ChartDataPoint[] = [];
      const parseDays = (dateStr: string | undefined | null) => {
        const d = dateStr ? new Date(dateStr) : new Date();
        if (Number.isNaN(d.getTime())) return { daysElapsed: 1, daysRemaining: 0 };
        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysElapsed = Math.min(Math.max(day, 1), daysInMonth);
        const daysRemaining = Math.max(daysInMonth - daysElapsed, 0);
        return { daysElapsed, daysRemaining };
      };

      const computeRunRates = (dateStr: string | undefined | null, mtd: number, target: number) => {
        const { daysElapsed, daysRemaining } = parseDays(dateStr);
        const current = daysElapsed > 0 ? mtd / daysElapsed : 0;
        const remainingQty = Math.max(target - mtd, 0);
        const required = daysRemaining > 0 ? remainingQty / daysRemaining : 0;
        return { crr: Number.isFinite(current) ? current : 0, rrr: Number.isFinite(required) ? required : 0 };
      };

      const computeProjection = (dateStr: string | undefined | null, mtd: number) => {
        const { daysElapsed, daysRemaining } = parseDays(dateStr);
        if (daysElapsed <= 0) return 0;
        const projected = mtd + (mtd / daysElapsed) * daysRemaining;
        return Number.isFinite(projected) ? projected : 0;
      };

      if (isBranchSelected) {
        chartDataPoints = currentMonthData.map(item => {
          const gaOverAchievement = item.ga_mtd && item.ga_tgt && item.ga_mtd > item.ga_tgt ? item.ga_mtd - item.ga_tgt : 0;
          const gaShortfall = item.ga_mtd && item.ga_tgt && item.ga_mtd < item.ga_tgt ? item.ga_tgt - item.ga_mtd : 0;
          const gaBaseActual = (item.ga_mtd || 0) - gaOverAchievement;

          const uaoOverAchievement = item.uao_mtd && item.uao_tgt && item.uao_mtd > item.uao_tgt ? item.uao_mtd - item.uao_tgt : 0;
          const uaoShortfall = item.uao_mtd && item.uao_tgt && item.uao_mtd < item.uao_tgt ? item.uao_tgt - item.uao_mtd : 0;
          const uaoBaseActual = (item.uao_mtd || 0) - uaoOverAchievement;

          const naOverAchievement = item.na_mtd && item.na_tgt && item.na_mtd > item.na_tgt ? item.na_mtd - item.na_tgt : 0;
          const naShortfall = item.na_mtd && item.na_tgt && item.na_mtd < item.na_tgt ? item.na_tgt - item.na_mtd : 0;
          const naBaseActual = (item.na_mtd || 0) - naOverAchievement;

          const gaAchPercent = item.ga_tgt && item.ga_tgt > 0 ? (item.ga_mtd / item.ga_tgt) * 100 : 0;
          const uaoAchPercent = item.uao_tgt && item.uao_tgt > 0 ? (item.uao_mtd / item.uao_tgt) * 100 : 0;
          const naAchPercent = item.na_tgt && item.na_tgt > 0 ? (item.na_mtd / item.na_tgt) * 100 : 0;

          const rawGaMtd = item.ga_mtd || 0;
          const rawGaTgt = item.ga_tgt || 0;
          const runRates = computeRunRates(item.date, rawGaMtd, rawGaTgt);
          const gaProj = computeProjection(item.date, rawGaMtd);
          return {
            date: item.date || 'Current',
            zone: item.zone || 'N/A',
            ga_mtd: gaBaseActual,
            ga_tgt: item.ga_tgt || 0,
            ga_shortfall: gaShortfall,
            ga_over_achievement: gaOverAchievement,
            ga_ach: gaAchPercent,
            ga_proj: gaProj,
            uao_mtd: uaoBaseActual,
            uao_tgt: item.uao_tgt || 0,
            uao_shortfall: uaoShortfall,
            uao_over_achievement: uaoOverAchievement,
            uao_ach: uaoAchPercent,
            na_mtd: naBaseActual,
            na_tgt: item.na_tgt || 0,
            na_shortfall: naShortfall,
            na_over_achievement: naOverAchievement,
            na_ach: naAchPercent,
            crr: runRates.crr,
            rrr: runRates.rrr,
          };
        });
      } else {
        const byBranch = new Map<string, {
          label: string;
          ga_tgt: number;
          ga_mtd: number;
          uao_tgt: number;
          uao_mtd: number;
          na_tgt: number;
          na_mtd: number;
          crr_sum: number;
          rrr_sum: number;
          count: number;
        }>();

        for (const item of currentMonthData) {
          const key = normalizeBranch(item.branch || '') || 'N/A';
          const label = (item.branch || 'N/A').replace('LMIT-HS-', '');
          const existing = byBranch.get(key);
          if (existing) {
            existing.ga_tgt += item.ga_tgt || 0;
            existing.ga_mtd += item.ga_mtd || 0;
            existing.uao_tgt += item.uao_tgt || 0;
            existing.uao_mtd += item.uao_mtd || 0;
            existing.na_tgt += item.na_tgt || 0;
            existing.na_mtd += item.na_mtd || 0;
            existing.crr_sum += item.crr || 0;
            existing.rrr_sum += item.rrr || 0;
            existing.count += 1;
          } else {
            byBranch.set(key, {
              label,
              ga_tgt: item.ga_tgt || 0,
              ga_mtd: item.ga_mtd || 0,
              uao_tgt: item.uao_tgt || 0,
              uao_mtd: item.uao_mtd || 0,
              na_tgt: item.na_tgt || 0,
              na_mtd: item.na_mtd || 0,
              crr_sum: item.crr || 0,
              rrr_sum: item.rrr || 0,
              count: 1,
            });
          }
        }

        chartDataPoints = Array.from(byBranch.values()).map((b) => {
          const gaOverAchievement = b.ga_mtd > b.ga_tgt ? b.ga_mtd - b.ga_tgt : 0;
          const gaShortfall = b.ga_mtd < b.ga_tgt ? b.ga_tgt - b.ga_mtd : 0;
          const gaBaseActual = b.ga_mtd - gaOverAchievement;

          const uaoOverAchievement = b.uao_mtd > b.uao_tgt ? b.uao_mtd - b.uao_tgt : 0;
          const uaoShortfall = b.uao_mtd < b.uao_tgt ? b.uao_tgt - b.uao_mtd : 0;
          const uaoBaseActual = b.uao_mtd - uaoOverAchievement;

          const naOverAchievement = b.na_mtd > b.na_tgt ? b.na_mtd - b.na_tgt : 0;
          const naShortfall = b.na_mtd < b.na_tgt ? b.na_tgt - b.na_mtd : 0;
          const naBaseActual = b.na_mtd - naOverAchievement;

          const gaAchPercent = b.ga_tgt > 0 ? (b.ga_mtd / b.ga_tgt) * 100 : 0;
          const uaoAchPercent = b.uao_tgt > 0 ? (b.uao_mtd / b.uao_tgt) * 100 : 0;
          const naAchPercent = b.na_tgt > 0 ? (b.na_mtd / b.na_tgt) * 100 : 0;

          const crrAvg = b.count > 0 ? b.crr_sum / b.count : 0;
          const rrrAvg = b.count > 0 ? b.rrr_sum / b.count : 0;
          const runRates = computeRunRates(mostRecentDate, b.ga_mtd, b.ga_tgt);
          const gaProj = computeProjection(mostRecentDate, b.ga_mtd);

          return {
            date: mostRecentDate || 'Current',
            zone: b.label,
            ga_mtd: gaBaseActual,
            ga_tgt: b.ga_tgt,
            ga_shortfall: gaShortfall,
            ga_over_achievement: gaOverAchievement,
            ga_ach: gaAchPercent,
            ga_proj: gaProj,
            uao_mtd: uaoBaseActual,
            uao_tgt: b.uao_tgt,
            uao_shortfall: uaoShortfall,
            uao_over_achievement: uaoOverAchievement,
            uao_ach: uaoAchPercent,
            na_mtd: naBaseActual,
            na_tgt: b.na_tgt,
            na_shortfall: naShortfall,
            na_over_achievement: naOverAchievement,
            na_ach: naAchPercent,
            crr: runRates.crr,
            rrr: runRates.rrr,
          };
        });
      }

      setChartData(chartDataPoints);

      // Calculate aggregated metrics
      const aggregated = currentMonthData.reduce(
        (acc, item) => ({
          ga_tgt: acc.ga_tgt + (item.ga_tgt || 0),
          ga_mtd: acc.ga_mtd + (item.ga_mtd || 0),
          ga_w: acc.ga_w + (item.ga_w || 0),
          uao_tgt: acc.uao_tgt + (item.uao_tgt || 0),
          uao_mtd: acc.uao_mtd + (item.uao_mtd || 0),
          uao_w: acc.uao_w + (item.uao_w || 0),
          na_tgt: acc.na_tgt + (item.na_tgt || 0),
          na_mtd: acc.na_mtd + (item.na_mtd || 0),
          na_w: acc.na_w + (item.na_w || 0),
          tot_w: acc.tot_w + (item.tot_w || 0),
          staff_incentive: acc.staff_incentive + (item.staff_incentive || 0),
          count: acc.count + 1,
        }),
        { ga_tgt: 0, ga_mtd: 0, ga_w: 0, uao_tgt: 0, uao_mtd: 0, uao_w: 0, na_tgt: 0, na_mtd: 0, na_w: 0, tot_w: 0, staff_incentive: 0, count: 0 }
      );

      // Calculate achievement percentages
      const gaAchPercent = aggregated.ga_tgt > 0 ? (aggregated.ga_mtd / aggregated.ga_tgt) * 100 : 0;
      const uaoAchPercent = aggregated.uao_tgt > 0 ? (aggregated.uao_mtd / aggregated.uao_tgt) * 100 : 0;
      const naAchPercent = aggregated.na_tgt > 0 ? (aggregated.na_mtd / aggregated.na_tgt) * 100 : 0;

      // Calculate weighted total weightage using settings values
      const gaWeight = (settings?.ga_weightage || 75) / 100;
      const uaoWeight = (settings?.uao_weightage || 25) / 100;
      const naWeight = (settings?.na_weightage || 0) / 100;

      const weightedTotal = (gaAchPercent * gaWeight) + (uaoAchPercent * uaoWeight) + (naAchPercent * naWeight);

      // Determine incentive earning percentage based on weighted total weightage
      let incentiveEarningPercent = 0;
      if (weightedTotal >= 90 && weightedTotal < 95) {
        incentiveEarningPercent = settings?.bracket_90_95_percent || 50;
      } else if (weightedTotal >= 95 && weightedTotal < 100) {
        incentiveEarningPercent = settings?.bracket_95_100_percent || 80;
      } else if (weightedTotal >= 100 && weightedTotal <= 105) {
        incentiveEarningPercent = settings?.bracket_100_105_percent || 100;
      } else if (weightedTotal > 105 && weightedTotal < 120) {
        incentiveEarningPercent = settings?.bracket_106_119_percent || 110;
      } else if (weightedTotal >= 120) {
        incentiveEarningPercent = settings?.bracket_120_above_percent || 120;
      }

      // Determine commission slab based on filter level and settings
      let commissionSlab = settings?.rsm_slab || 1500; // Default: Country Manager / RSM
      if (zone) {
        commissionSlab = settings?.zone_manager_slab || 700; // Zone Manager level
      } else if (branch) {
        commissionSlab = settings?.asm_slab || 1000; // ASM level
      }

      // Calculate actual incentive amount
      const calculatedIncentiveAmount = commissionSlab * (incentiveEarningPercent / 100);

      // Calculate weighted contributions for each metric
      const gaWeightage = gaAchPercent * gaWeight;
      const uaoWeightage = uaoAchPercent * uaoWeight;
      const naWeightage = naAchPercent * naWeight;

      const calculatedMetrics: ISDMMetrics = {
        ga: {
          target: aggregated.ga_tgt,
          actual: aggregated.ga_mtd,
          achievement: gaAchPercent,
          weightage: gaWeightage,
        },
        uao: {
          target: aggregated.uao_tgt,
          actual: aggregated.uao_mtd,
          achievement: uaoAchPercent,
          weightage: uaoWeightage,
        },
        na: {
          target: aggregated.na_tgt,
          actual: aggregated.na_mtd,
          achievement: naAchPercent,
          weightage: naWeightage,
        },
        staffIncentiveEligible: weightedTotal >= 90,
        totalWeightage: weightedTotal,
        incentiveEarningPercent: incentiveEarningPercent,
        incentiveAmount: calculatedIncentiveAmount,
      };

      setMetrics(calculatedMetrics);

      // Calculate GA Projection
      if (chartDataPoints.length > 0) {
        // Find max date from chart data
        const dates = chartDataPoints.map(d => new Date(d.date));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        // Get current month and year from max date
        const currentMonth = maxDate.getMonth();
        const currentYear = maxDate.getFullYear();
        
        // Get last day of the month
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const remainingDays = lastDayOfMonth - maxDate.getDate();
        
        // Calculate total CRR from current month data (SUM - not average)
        const currentMonthCRRSum = currentMonthData.reduce((sum, item) => sum + (item.crr || 0), 0);
        
        // Calculate projection: (total_crr_since_month_start * remaining_days) + current_ga_mtd
        const projectedGA = (currentMonthCRRSum * remainingDays) + aggregated.ga_mtd;
        const gaTarget = aggregated.ga_tgt;
        const gaShortfall = Math.max(0, gaTarget - projectedGA);
        const requiredRRR = remainingDays > 0 ? Math.max(0, gaTarget - aggregated.ga_mtd) / remainingDays : Math.max(0, gaTarget - aggregated.ga_mtd);
        
        const gaProjectionData: GAProjection = {
          currentGA: aggregated.ga_mtd,
          totalCRR: currentMonthCRRSum,
          requiredRRR: requiredRRR,
          remainingDays: remainingDays,
          projectedGA: projectedGA,
          target: gaTarget,
          shortfall: gaShortfall,
          isOnTrack: projectedGA >= gaTarget,
        };
        
        setGAProjection(gaProjectionData);
      }
    } catch (err) {
      console.error('Error in fetchISDMData:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-[#21264E]">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading ISDM data...
        </div>
      </div>
    );
  }

  if (chartData.length === 0 || !metrics) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center text-gray-500 max-w-md">
          <TrendingUp size={40} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium mb-2">No ISDM data available</p>
          <p className="text-sm text-gray-400 mb-3">
            {branch ? `Branch: ${branch}` : 'All Branches'}
            {zone && `, Zone: ${zone}`}
          </p>
          <p className="text-xs text-gray-400">Try selecting a different branch or zone</p>
        </div>
      </div>
    );
  }

  // Determine which incentive label to show based on applied filters
  const getIncentiveLabel = (): string => {
    if (zone) {
      return "FSE's Incentive";
    } else if (branch) {
      return "ASM's Incentive";
    } else if (region && region !== 'ITALY') {
      return "RSM's Incentive";
    }
    return "Traditional Head's Incentive";
  };

  const dimensionLabel = branch ? 'Zone' : 'Branch';

  const gaComparisonTotals = gaComparisonData.reduce(
    (acc, item) => ({
      current: acc.current + (item.ga_current || 0),
      lastMonth: acc.lastMonth + (item.ga_last_month || 0),
      pastYear: acc.pastYear + (item.ga_past_year || 0),
      target: acc.target + (item.ga_target || 0),
    }),
    { current: 0, lastMonth: 0, pastYear: 0, target: 0 }
  );

  return (
    <div className="p-4 md:p-6 bg-gradient-to-br from-[#fff7f2] to-white min-h-[calc(100vh-120px)]">
      {/* Current Month Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-[#21264E]" />
            <h2 className="text-lg md:text-xl font-bold text-[#21264E]">
              Current Month Performance
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600">
              {chartData.length > 0 && chartData[0].date}
            </div>
            {user?.role === 'HS-ADMIN' && (
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition text-[#21264E]"
                title="ISDM Settings"
              >
                <Settings size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Staff Incentive Eligibility Alert */}
      <div className={`mb-6 p-4 rounded-lg border-2 flex items-start gap-3 ${
        metrics.staffIncentiveEligible
          ? 'bg-green-50 border-green-200'
          : 'bg-orange-50 border-orange-200'
      }`}>
        {metrics.staffIncentiveEligible ? (
          <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertCircle size={20} className="text-orange-600 flex-shrink-0 mt-0.5" />
        )}
        <div>
          <p className={`font-bold ${
            metrics.staffIncentiveEligible ? 'text-green-900' : 'text-orange-900'
          }`}>
            {getIncentiveLabel()}: {metrics.staffIncentiveEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}
          </p>
          <p className={`text-sm mt-1 ${
            metrics.staffIncentiveEligible ? 'text-green-700' : 'text-orange-700'
          }`}>
            Total Weightage: {metrics.totalWeightage.toFixed(2)}% {' '}
            {metrics.staffIncentiveEligible
              ? '(≥90% required)'
              : '(90% required for eligibility)'
            }
          </p>
          <p className={`text-sm mt-1 font-semibold ${
            metrics.staffIncentiveEligible ? 'text-green-700' : 'text-orange-700'
          }`}>
            Incentive Amount: €{metrics.incentiveAmount.toFixed(2)}
          </p>
        </div>
      </div>

      {/* KPI Cards - Targets vs Actual */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
        <MetricCard
          title="GA - Gross Ads"
          target={metrics.ga.target}
          actual={metrics.ga.actual}
          achievement={metrics.ga.achievement}
          color="bg-blue-600"
        />
        <MetricCard
          title="UAO - Unique Active Outlets"
          target={metrics.uao.target}
          actual={metrics.uao.actual}
          achievement={metrics.uao.achievement}
          color="bg-indigo-900"
        />
        <MetricCard
          title="NA - New Outlets"
          target={metrics.na.target}
          actual={metrics.na.actual}
          achievement={metrics.na.achievement}
          color="bg-green-600"
        />
      </div>

      {/* GA Projection Analysis */}
      {gaProjection && (
        <div className="p-4 md:p-6 bg-white rounded-lg border border-gray-200 mb-6">
          <h3 className="font-bold text-[#21264E] text-sm md:text-base mb-4 flex items-center gap-2">
            <TrendingUp size={18} />
            GA Projection Analysis
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold mb-2">Current GA (MTD)</p>
              <p className="text-2xl font-bold text-blue-900">{Math.round(gaProjection.currentGA)}</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
              <p className="text-xs text-purple-600 uppercase tracking-wider font-semibold mb-2">CURRENT RUN RATE - CRR (MTD)</p>
              <p className="text-2xl font-bold text-purple-900">{Math.round(gaProjection.totalCRR)}</p>
              <p className="text-xs text-purple-600 mt-1">{gaProjection.remainingDays} days remaining</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg">
              <p className="text-xs text-amber-700 uppercase tracking-wider font-semibold mb-2">Required Run Rate (RRR)</p>
              <p className="text-2xl font-bold text-amber-900">{Math.round(gaProjection.requiredRRR)}</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg">
              <p className="text-xs text-indigo-600 uppercase tracking-wider font-semibold mb-2">Projected GA (EOM)</p>
              <p className="text-2xl font-bold text-indigo-900">{Math.round(gaProjection.projectedGA)}</p>
            </div>
            <div className={`p-4 bg-gradient-to-br rounded-lg ${
              gaProjection.isOnTrack
                ? 'from-green-50 to-green-100'
                : 'from-red-50 to-red-100'
            }`}>
              <p className="text-xs uppercase tracking-wider font-semibold mb-2"
                style={{ color: gaProjection.isOnTrack ? '#166534' : '#7f1d1d' }}>
                {gaProjection.isOnTrack ? '✓ On Track' : '✗ Shortfall'}
              </p>
              <p className={`text-2xl font-bold ${gaProjection.isOnTrack ? 'text-green-900' : 'text-red-900'}`}>
                {gaProjection.isOnTrack ? '+' : '-'}{Math.round(Math.abs(gaProjection.shortfall))}
              </p>
              <p className={`text-xs mt-1 ${gaProjection.isOnTrack ? 'text-green-600' : 'text-red-600'}`}>
                vs Target: {Math.round(gaProjection.target)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="space-y-4 md:space-y-6">
        {/* GA Targets vs Actual */}
        <ChartCard title="GA - Targets vs Actual (MTD)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#21264E',
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
                itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div style={{ backgroundColor: '#21264E', padding: '8px 12px', borderRadius: '8px' }}>
                        <p style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                          {dimensionLabel}: {payload[0].payload.zone}
                        </p>
                        {payload.map((entry, index) => (
                          <p key={index} style={{ color: '#ffffff', margin: '4px 0' }}>
                            {entry.name}: {entry.value}
                          </p>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend formatter={(value) => <span className="font-bold">{value}</span>} />
              <Bar dataKey="ga_mtd" fill="#21264E" name="Actual" stackId="a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ga_shortfall" fill="#F04438" name="Shortfall" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="ga_over_achievement" fill="#08DC7D" name="Over-Achievement" stackId="a" radius={[0, 0, 0, 0]} />
              <Line
                type="monotone"
                dataKey="ga_proj"
                stroke="#FFD54F"
                strokeWidth={3}
                dot={false}
                name="GA Projection"
              />
              <ReferenceLine y={0} stroke="#e5e7eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* UAO and NA Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <ChartCard title="UAO - Targets vs Actual (MTD)">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#21264E',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div style={{ backgroundColor: '#21264E', padding: '8px 12px', borderRadius: '8px' }}>
                          <p style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                            {dimensionLabel}: {label}
                          </p>
                          {payload.map((entry, index) => {
                            const v = typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value;
                            return (
                              <p key={index} style={{ color: '#ffffff', margin: '4px 0' }}>
                                {entry.name}: {v}
                              </p>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend formatter={(value) => <span className="font-bold">{value}</span>} />
                <Bar dataKey="uao_mtd" fill="#1080fd" name="Actual" stackId="a" radius={[4,4,0,0]} />
                <Bar dataKey="uao_shortfall" fill="#D5E1F7" name="Shortfall" stackId="a" />
                <Bar dataKey="uao_over_achievement" fill="#004fa7" name="Over-Achievement" stackId="a" />
                <ReferenceLine y={0} stroke="#e5e7eb" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="NA - Targets vs Actual (MTD)">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#21264E',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div style={{ backgroundColor: '#21264E', padding: '8px 12px', borderRadius: '8px' }}>
                          <p style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                            {dimensionLabel}: {label}
                          </p>
                          {payload.map((entry, index) => (
                            <p key={index} style={{ color: '#ffffff', margin: '4px 0' }}>
                              {entry.name}: {entry.value}
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend formatter={(value) => <span className="font-bold">{value}</span>} />
                <Line type="monotone" dataKey="na_mtd" stroke="#06B6D4" strokeWidth={2} dot={false} name="Actual (MTD)" />
                <Line type="monotone" dataKey="na_tgt" stroke="#FFD54F" strokeWidth={2} dot={false} name="Target" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Achievement Percentage Comparison */}
        <ChartCard title="Achievement % Comparison">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[0, 120]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#21264E',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div style={{ backgroundColor: '#21264E', padding: '8px 12px', borderRadius: '8px' }}>
                          <p style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                            {dimensionLabel}: {label}
                          </p>
                          {payload.map((entry, index) => {
                            const v = typeof entry.value === 'number' ? `${entry.value.toFixed(1)}%` : `${entry.value}%`;
                            return (
                              <p key={index} style={{ color: '#ffffff', margin: '4px 0' }}>
                                {entry.name}: {v}
                              </p>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              <Legend formatter={(value) => <span className="font-bold">{value}</span>} />
              <Bar dataKey="ga_ach" fill="#1080FD" name="GA Achievement %" />
              <Bar dataKey="uao_ach" fill="#46286E" name="UAO Achievement %" />
              <Bar dataKey="na_ach" fill="#08DC7D" name="NA Achievement %" />
              <ReferenceLine y={100} stroke="#FFD54F" strokeWidth={2} label="Target (100%)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Progress Rate Analysis */}
        {chartData.some(d => d.crr > 0 || d.rrr > 0) && (
          <ChartCard title="Progress Rate Analysis">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#21264E',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div style={{ backgroundColor: '#21264E', padding: '8px 12px', borderRadius: '8px' }}>
                          <p style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                            {dimensionLabel}: {label}
                          </p>
                          {payload.map((entry, index) => (
                            <p key={index} style={{ color: '#ffffff', margin: '4px 0' }}>
                              {entry.name}: {entry.value}
                            </p>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend formatter={(value) => <span className="font-bold">{value}</span>} />
                <Line
                  type="monotone"
                  dataKey="crr"
                  stroke="#1080FD"
                  strokeWidth={2}
                  dot={{ fill: '#1080FD', r: 4 }}
                  name="Current Run Rate (CRR)"
                />
                <Line
                  type="monotone"
                  dataKey="rrr"
                  stroke="#FFD54F"
                  strokeWidth={2}
                  dot={{ fill: '#FFD54F', r: 4 }}
                  name="Required Run Rate (RRR)"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {gaComparisonData.length > 0 && (
          <ChartCard title="GA Progress Comparison (Current MTD vs Last Month vs Past Year)">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={gaComparisonData} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="zone" tick={{ fontSize: 12 }} interval={0} angle={-10} textAnchor="end" height={50} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax / 10) * 10)]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#21264E',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const p = payload[0]?.payload as GAComparisonDataPoint | undefined;
                      const target = p ? Math.round(p.ga_target) : 0;
                      const ach = p?.ga_current_ach ?? 0;
                      const achText = Number.isFinite(ach) ? `${ach.toFixed(1)}%` : '0%';

                      return (
                        <div style={{ backgroundColor: '#21264E', padding: '8px 12px', borderRadius: '8px' }}>
                          <p style={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px' }}>
                            {dimensionLabel}: {label}
                          </p>
                          {target > 0 && (
                            <p style={{ color: '#ffffff', margin: '4px 0' }}>
                              Target: {target}
                            </p>
                          )}
                          {payload.map((entry, index) => {
                            const v = typeof entry.value === 'number' ? Math.round(entry.value) : entry.value;
                            if (entry.name === 'Current MTD') {
                              return (
                                <p key={index} style={{ color: '#ffffff', margin: '4px 0' }}>
                                  {entry.name}: {v} (Ach {achText})
                                </p>
                              );
                            }
                            return (
                              <p key={index} style={{ color: '#ffffff', margin: '4px 0' }}>
                                {entry.name}: {v}
                              </p>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend formatter={(value) => <span className="font-bold">{value}</span>} />
                <Bar dataKey="ga_past_year" fill="#46286E" name="Past Year" radius={[8, 8, 0, 0]} />
                <Bar dataKey="ga_last_month" fill="#1080fd" name="Last Month" radius={[8, 8, 0, 0]} />
                <Bar dataKey="ga_current" fill="#08DC7D" name="Current MTD" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {gaComparisonTotals.current > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-[#fff7f2] border border-gray-100">
                  <p className="text-xs text-gray-500 font-semibold">Month-over-month</p>
                  <p className="text-sm font-bold text-[#21264E]">
                    {gaComparisonTotals.lastMonth > 0
                      ? `${Math.round(gaComparisonTotals.current - gaComparisonTotals.lastMonth)} (${(((gaComparisonTotals.current - gaComparisonTotals.lastMonth) / gaComparisonTotals.lastMonth) * 100).toFixed(1)}%) vs last month`
                      : 'No last month data'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-[#fff7f2] border border-gray-100">
                  <p className="text-xs text-gray-500 font-semibold">Year-over-year</p>
                  <p className="text-sm font-bold text-[#21264E]">
                    {gaComparisonTotals.pastYear > 0
                      ? `${Math.round(gaComparisonTotals.current - gaComparisonTotals.pastYear)} (${(((gaComparisonTotals.current - gaComparisonTotals.pastYear) / gaComparisonTotals.pastYear) * 100).toFixed(1)}%) vs past year`
                      : 'No past year data'}
                  </p>
                </div>
              </div>
            )}
          </ChartCard>
        )}
      </div>

      {/* Detailed Metrics Summary */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weightage Summary */}
        <div className="p-6 bg-white rounded-lg border border-gray-200">
          <h3 className="font-bold text-[#21264E] mb-4 flex items-center gap-2">
            <TrendingUp size={18} />
            Weightage Summary
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <span className="text-gray-600">GA Weightage ({settings?.ga_weightage || 75}%)</span>
              <span className="font-bold text-[#21264E]">
                {metrics.ga.weightage.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <span className="text-gray-600">UAO Weightage ({settings?.uao_weightage || 25}%)</span>
              <span className="font-bold text-[#21264E]">
                {metrics.uao.weightage.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <span className="text-gray-600">NA Weightage ({settings?.na_weightage || 0}%)</span>
              <span className="font-bold text-[#21264E]">
                {metrics.na.weightage.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-600 font-semibold">Total Weightage</span>
              <span className={`font-bold text-lg ${metrics.totalWeightage >= 90 ? 'text-green-600' : 'text-orange-600'}`}>
                {metrics.totalWeightage.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Incentive Eligibility Summary */}
        <div className={`p-6 rounded-lg border-2 flex flex-col justify-between ${
          metrics.staffIncentiveEligible
            ? 'bg-green-50 border-green-200'
            : 'bg-orange-50 border-orange-200'
        }`}>
          <div>
            <h3 className={`font-bold mb-4 flex items-center gap-2 ${
              metrics.staffIncentiveEligible ? 'text-green-900' : 'text-orange-900'
            }`}>
              <Trophy size={18} />
              Incentive Status
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className={metrics.staffIncentiveEligible ? 'text-green-700' : 'text-orange-700'}>
                  Total Weightage
                </span>
                <span className={`font-bold ${metrics.staffIncentiveEligible ? 'text-green-900' : 'text-orange-900'}`}>
                  {metrics.totalWeightage.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={metrics.staffIncentiveEligible ? 'text-green-700' : 'text-orange-700'}>
                  Threshold Required
                </span>
                <span className={`font-bold ${metrics.staffIncentiveEligible ? 'text-green-900' : 'text-orange-900'}`}>
                  90%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className={metrics.staffIncentiveEligible ? 'text-green-700' : 'text-orange-700'}>
                  Earning Percentage
                </span>
                <span className={`font-bold ${metrics.staffIncentiveEligible ? 'text-green-900' : 'text-orange-900'}`}>
                  {metrics.incentiveEarningPercent}%
                </span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-300">
                <span className={`font-semibold ${metrics.staffIncentiveEligible ? 'text-green-900' : 'text-orange-900'}`}>
                  Status
                </span>
                <span className={`px-3 py-1 rounded-full font-bold text-xs ${
                  metrics.staffIncentiveEligible
                    ? 'bg-green-200 text-green-900'
                    : 'bg-orange-200 text-orange-900'
                }`}>
                  {metrics.staffIncentiveEligible ? '✓ ELIGIBLE' : '✗ NOT ELIGIBLE'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-300">
                <span className={`font-semibold ${metrics.staffIncentiveEligible ? 'text-green-900' : 'text-orange-900'}`}>
                  Incentive Amount
                </span>
                <span className={`font-bold text-lg ${metrics.staffIncentiveEligible && metrics.incentiveAmount > 0 ? 'text-green-900' : 'text-orange-900'}`}>
                  €{metrics.incentiveAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl px-4 md:px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#08DC7D] rounded-l-2xl" />
          <div className="flex items-center gap-4 pl-2">
            <div className="w-22 h-22 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg width="86" height="86" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 4H19V14C19 17.31 16.76 20 14 20C11.24 20 9 17.31 9 14V4Z" fill="#006AE0" opacity="0.9" />
                <path d="M9 6H6C6 6 5 6 5 9C5 11.5 7 12.5 9 12.5" stroke="#006AE0" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.7" />
                <path d="M19 6H22C22 6 23 6 23 9C23 11.5 21 12.5 19 12.5" stroke="#006AE0" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.7" />
                <rect x="12.5" y="20" width="3" height="3.5" rx="0.5" fill="#006AE0" opacity="0.8" />
                <rect x="10" y="23.5" width="8" height="1.5" rx="0.75" fill="#006AE0" opacity="0.8" />
                <path d="M14 8L14.6 9.8H16.5L15 10.9L15.6 12.7L14 11.6L12.4 12.7L13 10.9L11.5 9.8H13.4Z" fill="#FFD54F" />
                <path d="M21 3.5 L21.5 2 L22 3.5 L23.5 4 L22 4.5 L21.5 6 L21 4.5 L19.5 4Z" fill="#08DC7D" opacity="0.9" />
                <path d="M7 5 L7.3 4 L7.6 5 L8.6 5.3 L7.6 5.6 L7.3 6.6 L7 5.6 L6 5.3Z" fill="#FFD54F" opacity="0.7" />
              </svg>
            </div>

            <div>
              <div className="text-[20px] font-bold tracking-[0.06em] text-[#21254F] uppercase mb-0.5">
                Staff incentive scheme
              </div>
              <p className="text-[15px] font-medium text-[#21264E] leading-snug m-0">
                Your targets, payouts &amp; conditions
              </p>
              <p className="text-[13px] text-gray-500 mt-1 m-0">
                See how your performance translates to earnings.
              </p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {['Targets', 'Weightage', 'Payout slabs', 'Conditions'].map((t) => (
                  <span key={t} className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-red-50 bg-blue-900">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <a
            href="https://hotspot-gif.github.io/STAFF-INCENTIVE/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-[#08DC7D] hover:bg-[#08a35e] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl transition whitespace-nowrap"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            View scheme
          </a>
        </div>
      </div>
      
      {/* ISDM Settings Modal */}
      {showSettings && (
        <ISDMSettings 
          user={user} 
          onClose={() => setShowSettings(false)}
          onSettingsSaved={() => fetchSettings()}
        />
      )}
    </div>
  );
}
