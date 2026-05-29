import { useEffect, useMemo, useState } from 'react';
import type { RetailerSummary, RetailerMonthly } from '@/types';
import { supabase } from '@/lib/supabase';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart,
} from 'recharts';
import {
  Activity, Target, AlertTriangle, BarChart3,
  Zap, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

interface Props {
  summary: RetailerSummary;
  monthlyData: RetailerMonthly[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_COLORS: Record<string, string> = { '2024': '#006AE0', '2025': '#08DC7D', '2026': '#FFD54F' };
const PLAN_COLORS = { pi_l6: '#46286E', pi_g6: '#00D7FF', np_l6: '#006AE0', np_g6: '#08DC7D' };
const DEDUCTION_RED = '#F04438';

const fmt = (v: number) => `€${v.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1000) return `€${(v / 1000).toFixed(1)}k`;
  return `€${v.toFixed(0)}`;
};
const fmtN = (v: number) => v.toLocaleString('en-IE');
const fmtP = (v: number) => `${v.toFixed(1)}%`;

function ChartCard({ title, children, className = '', id }: { title: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-[#21264E] mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-[#245bc1]" />
        {title}
      </h3>
      <div id={id} className="h-full w-full">
        {children}
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function CTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  
  const currencyFields = [
    'Total Incentive', 'PO Deduction', 'Clawback', 'Renewal Impact', 
    'Total Deductions', 'Port in Incentive', 'Gara bonus', 
    'Total Port in bonus', 'Total Incentive Paid', 'incentive',
    'po_deduction', 'clawback', 'renewal_impact', 'total_ded',
    'pi_raw', 'add_gara', 'pi_total'
  ];

  return (
    <div className="bg-white shadow-xl rounded-lg p-3 border border-gray-100 text-xs">
      <p className="font-semibold text-[#21264E] mb-1">{label}</p>
      {payload.map((p: any, i: number) => {
        const isCurrency = currencyFields.some(f => 
          p.name?.toLowerCase().includes(f.toLowerCase()) || 
          p.dataKey?.toString().toLowerCase().includes(f.toLowerCase())
        );
        
        return (
          <p key={i} style={{ color: p.color }} className="flex items-center justify-between gap-4">
            <span>{p.name}</span>
            <span className="font-medium">
              {isCurrency ? fmt(p.value) : fmtN(p.value)}
            </span>
          </p>
        );
      })}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function RetailerAnalysis({ summary, monthlyData }: Props) {
  const [stockRows, setStockRows] = useState<Record<string, any>[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockFilterYear, setStockFilterYear] = useState<string>('ALL');
  const [stockFilterMonth, setStockFilterMonth] = useState<string>('ALL');
  const [stockFilterFaceValue, setStockFilterFaceValue] = useState<string>('ALL');

  const sorted = useMemo(() => [...monthlyData].sort((a, b) => a.month.localeCompare(b.month)), [monthlyData]);
  const years = useMemo(() => [...new Set(sorted.map(m => m.month.substring(0, 4)))].sort(), [sorted]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStockLoading(true);
      setStockError(null);
      try {
        const { data, error } = await supabase
          .from('retailer_stock')
          .select('*')
          .eq('retailer_id', summary.retailer_id)
          .limit(5000);

        if (error) throw error;
        if (!cancelled) setStockRows((data as Record<string, any>[]) || []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load retailer stock';
        if (!cancelled) {
          setStockRows([]);
          setStockError(msg);
        }
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    };

    if (summary?.retailer_id) load();
    return () => { cancelled = true; };
  }, [summary?.retailer_id]);

  const stockInsights = useMemo(() => {
    const pickNum = (row: Record<string, any>, keys: string[]) => {
      for (const k of keys) {
        const v = row[k];
        if (v === 0) return 0;
        if (v === null || v === undefined) continue;
        const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
        if (!Number.isNaN(n)) return n;
      }
      return 0;
    };

    const pickStr = (row: Record<string, any>, keys: string[]) => {
      for (const k of keys) {
        const v = row[k];
        if (v === null || v === undefined) continue;
        const s = String(v).trim();
        if (s) return s;
      }
      return '';
    };

    const pickDate = (row: Record<string, any>) => {
      const keys = ['issued_date', 'issued_at', 'stock_issued_date', 'date', 'created_at', 'updated_at'];
      for (const k of keys) {
        const v = row[k];
        if (!v) continue;
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) return d;
      }
      return null;
    };

    const parseMonth = (row: Record<string, any>, d: Date | null) => {
      const raw = pickStr(row, ['month', 'stock_month', 'issued_month']);
      const fromDate = (date: Date) => {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        return {
          key: `${y}-${String(m).padStart(2, '0')}`,
          year: y,
          label: `${MONTH_NAMES[m - 1]} ${y}`,
        };
      };

      if (!raw) {
        return d ? fromDate(d) : null;
      }

      const trimmed = raw.trim();

      if (/^\d{4}-\d{2}$/.test(trimmed)) {
        const [y, m] = trimmed.split('-').map(Number);
        return { key: trimmed, year: y, label: `${MONTH_NAMES[Math.max(1, Math.min(12, m)) - 1]} ${y}` };
      }

      if (/^\d{4}\/\d{2}$/.test(trimmed)) {
        const normalized = trimmed.replace('/', '-');
        const [y, m] = normalized.split('-').map(Number);
        return { key: normalized, year: y, label: `${MONTH_NAMES[Math.max(1, Math.min(12, m)) - 1]} ${y}` };
      }

      const maybeDate = new Date(trimmed);
      if (!Number.isNaN(maybeDate.getTime())) {
        return fromDate(maybeDate);
      }

      return d ? fromDate(d) : null;
    };

    const rows = stockRows || [];
    let lastIssued: Date | null = null;
    const byYear = new Map<number, { year: number; distributed: number; used: number; remaining: number }>();
    const byFaceValueMonth = new Map<string, { monthKey: string; monthLabel: string; retailerId: string; simFaceValue: string; totalcards: number; used: number; unused: number; lastIssued: Date | null }>();
    const byMonth = new Map<string, { monthLabel: string; totalIssued: number; totalUnused: number }>();
    let mismatchCount = 0;

    for (const r of rows) {
      const d = pickDate(r);
      if (d && (!lastIssued || d.getTime() > lastIssued.getTime())) lastIssued = d;

      const monthInfo = parseMonth(r, d);
      const year = monthInfo?.year ?? null;
      const monthKey = monthInfo?.key || 'N/A';
      const monthLabel = monthInfo?.label || 'N/A';

      const totalcardsRaw = pickNum(r, ['totalcards', 'total_cards', 'distributed', 'stock_distributed', 'distributed_qty', 'qty_distributed', 'issued_qty', 'issued', 'total_distributed']);
      const usedRaw = pickNum(r, ['used', 'stock_used', 'used_qty', 'qty_used', 'consumed', 'total_used']);
      const unusedRaw = pickNum(r, ['unused', 'remaining', 'stock_remaining', 'remaining_qty', 'qty_remaining', 'balance', 'closing_balance', 'total_remaining']);

      const totalcards = Math.max(0, totalcardsRaw);
      const used = Math.max(0, Math.min(usedRaw, totalcards));
      const unused = Math.max(0, totalcards - used);
      if (Math.abs((used + unused) - totalcards) > 0.001) mismatchCount += 1;

      const retailerId = pickStr(r, ['retailer_id', 'retailerid', 'retailer_code']) || summary.retailer_id;
      const simFaceValue = pickStr(r, ['sim_facevalue', 'facevalue', 'face_value', 'face_value_eur', 'face_value_amount', 'denomination', 'faceValue']) || 'N/A';

      if (year !== null) {
        const existing = byYear.get(year);
        if (existing) {
          existing.distributed += totalcards;
          existing.used += used;
          existing.remaining += unused;
        } else {
          byYear.set(year, { year, distributed: totalcards, used, remaining: unused });
        }
      }

      const monthAgg = byMonth.get(monthKey);
      if (monthAgg) {
        monthAgg.totalIssued += totalcards;
        monthAgg.totalUnused += unused;
      } else {
        byMonth.set(monthKey, { monthLabel, totalIssued: totalcards, totalUnused: unused });
      }

      const faceKey = `${monthKey}__${retailerId}__${simFaceValue}`;
      const existingFV = byFaceValueMonth.get(faceKey);
      if (existingFV) {
        existingFV.totalcards += totalcards;
        existingFV.used += used;
        existingFV.unused += unused;
        if (d && (!existingFV.lastIssued || d.getTime() > existingFV.lastIssued.getTime())) existingFV.lastIssued = d;
      } else {
        byFaceValueMonth.set(faceKey, { monthKey, monthLabel, retailerId, simFaceValue, totalcards, used, unused, lastIssued: d || null });
      }
    }

    const yoy = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
    const faceValueRows = Array.from(byFaceValueMonth.values()).sort((a, b) => {
      if (a.monthKey !== b.monthKey) return b.monthKey.localeCompare(a.monthKey);
      return a.simFaceValue.localeCompare(b.simFaceValue, undefined, { numeric: true, sensitivity: 'base' });
    });

    const lastIssuedText = lastIssued
      ? lastIssued.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;

    const monthCount = byMonth.size;
    const latestMonthKey = Array.from(byMonth.keys()).sort().pop() || null;
    const latestMonthLabel = latestMonthKey ? byMonth.get(latestMonthKey)?.monthLabel || latestMonthKey : null;
    const lastMonthIssuedStock = latestMonthKey ? byMonth.get(latestMonthKey)?.totalIssued || 0 : 0;
    const lastMonthRemainingStock = latestMonthKey ? byMonth.get(latestMonthKey)?.totalUnused || 0 : 0;

    const allTimeTotals = faceValueRows.reduce(
      (acc, r) => ({
        total: acc.total + (r.totalcards || 0),
        used: acc.used + (r.used || 0),
        remaining: acc.remaining + (r.unused || 0),
      }),
      { total: 0, used: 0, remaining: 0 }
    );

    const allTimeAverages = monthCount > 0
      ? {
          total: allTimeTotals.total / monthCount,
          used: allTimeTotals.used / monthCount,
          remaining: allTimeTotals.remaining / monthCount,
        }
      : { total: 0, used: 0, remaining: 0 };

    return {
      yoy,
      faceValueRows,
      lastIssuedText,
      latestMonthLabel,
      lastMonthIssuedStock,
      lastMonthRemainingStock,
      mismatchCount,
      allTimeTotals,
      allTimeAverages,
      monthCount,
    };
  }, [stockRows]);

  const stockFilterOptions = useMemo(() => {
    const yearsSet = new Set<string>();
    const months = new Map<string, string>();
    const faceValuesSet = new Set<string>();

    for (const r of stockInsights.faceValueRows) {
      const y = r.monthKey && /^\d{4}-\d{2}$/.test(r.monthKey) ? r.monthKey.slice(0, 4) : '';
      if (y) yearsSet.add(y);
      if (r.monthKey && r.monthLabel) months.set(r.monthKey, r.monthLabel);
      if (r.simFaceValue) faceValuesSet.add(r.simFaceValue);
    }

    const years = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    const monthsList = Array.from(months.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, label]) => ({ key, label }));
    const faceValues = Array.from(faceValuesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return { years, months: monthsList, faceValues };
  }, [stockInsights.faceValueRows]);

  useEffect(() => {
    if (stockFilterYear === 'ALL') return;
    if (stockFilterMonth === 'ALL') return;
    if (stockFilterMonth.slice(0, 4) !== stockFilterYear) setStockFilterMonth('ALL');
  }, [stockFilterYear, stockFilterMonth]);

  const filteredStockRows = useMemo(() => {
    return stockInsights.faceValueRows.filter(r => {
      if (stockFilterYear !== 'ALL') {
        if (!r.monthKey || r.monthKey.slice(0, 4) !== stockFilterYear) return false;
      }
      if (stockFilterMonth !== 'ALL') {
        if (r.monthKey !== stockFilterMonth) return false;
      }
      if (stockFilterFaceValue !== 'ALL') {
        if (r.simFaceValue !== stockFilterFaceValue) return false;
      }
      return true;
    });
  }, [stockInsights.faceValueRows, stockFilterYear, stockFilterMonth, stockFilterFaceValue]);

  // Yearly totals
  const yearlyTotals = useMemo(() => years.map(yr => {
    const mos = sorted.filter(m => m.month.startsWith(yr));
    const activeMos = mos.filter(m => m.ga_cnt > 0);
    const sum = (fn: (m: RetailerMonthly) => number) => mos.reduce((s, m) => s + fn(m), 0);
    const totalGa = sum(m => m.ga_cnt);
    return {
      year: yr, monthCount: mos.length,
      activeMonthCount: activeMos.length,
      incentive: sum(m => m.incentive), ga_cnt: totalGa,
      pi_l6: sum(m => m.pi_l6), pi_g6: sum(m => m.pi_g6),
      np_l6: sum(m => m.np_l6), np_g6: sum(m => m.np_g6),
      port_in: sum(m => m.port_in), port_out: sum(m => m.port_out),
      po_deduction: sum(m => m.po_deduction), clawback: sum(m => m.clawback),
      renewal_impact: sum(m => m.renewal_impact), total_ded: sum(m => m.total_ded),
      pi_raw: sum(m => m.pi_raw), add_gara: sum(m => m.add_gara),
      pi_total: sum(m => m.pi_total),
      avg_ga_active: activeMos.length > 0 ? totalGa / activeMos.length : 0,
      renewal_rate: mos.length > 0 ? sum(m => m.renewal_rate) / mos.length : 0,
    };
  }), [years, sorted]);

  const allTimeTotals = useMemo(() => ({
    incentive: yearlyTotals.reduce((sum, y) => sum + y.incentive, 0),
    ga_cnt: yearlyTotals.reduce((sum, y) => sum + y.ga_cnt, 0),
    port_in: yearlyTotals.reduce((sum, y) => sum + y.port_in, 0),
    pi_raw: yearlyTotals.reduce((sum, y) => sum + y.pi_raw, 0),
    add_gara: yearlyTotals.reduce((sum, y) => sum + y.add_gara, 0),
    pi_total: yearlyTotals.reduce((sum, y) => sum + y.pi_total, 0),
    total_deductions: yearlyTotals.reduce((sum, y) => sum + y.total_ded, 0),
    po_deduction: yearlyTotals.reduce((sum, y) => sum + y.po_deduction, 0),
    clawback: yearlyTotals.reduce((sum, y) => sum + y.clawback, 0),
    renewal_impact: yearlyTotals.reduce((sum, y) => sum + y.renewal_impact, 0),
  }), [yearlyTotals]);

  // Calendar overlay data (months 1-12 with year columns)
  const calendarOverlay = useMemo(() => {
    return MONTH_NAMES.map((name, idx) => {
      const monthNum = idx + 1;
      const point: Record<string, number | string> = { monthName: name };
      years.forEach(yr => {
        const mo = sorted.find(m => m.month === `${yr}-${String(monthNum).padStart(2, '0')}`);
        point[`incentive_${yr}`] = mo?.incentive ?? 0;
        point[`ga_${yr}`] = mo?.ga_cnt ?? 0;
        point[`renewal_${yr}`] = mo?.renewal_rate ?? 0;
        point[`port_in_${yr}`] = mo?.port_in ?? 0;
        point[`gara_${yr}`] = mo?.add_gara ?? 0;
      });
      return point;
    });
  }, [years, sorted]);

  // Full monthly timeline
  const timeline = useMemo(() => sorted.map(m => {
    const [yr, mo] = m.month.split('-');
    return {
      ...m,
      label: `${MONTH_NAMES[parseInt(mo) - 1]} ${yr.slice(2)}`,
    };
  }), [sorted]);

  // Plan activation data per month
  const planTrends = useMemo(() => sorted.map(m => {
    const [yr, mo] = m.month.split('-');
    return {
      label: `${MONTH_NAMES[parseInt(mo) - 1]} ${yr.slice(2)}`,
      pi_l6: m.pi_l6, pi_g6: m.pi_g6,
      np_l6: m.np_l6, np_g6: m.np_g6,
    };
  }), [sorted]);

  // Plan mix by year (for donuts)
  const planMixByYear = useMemo(() => years.map(yr => {
    const mos = sorted.filter(m => m.month.startsWith(yr));
    const sum = (fn: (m: RetailerMonthly) => number) => mos.reduce((s, m) => s + fn(m), 0);
    return {
      year: yr,
      data: [
        { name: 'P-IN ≤€6.99', value: sum(m => m.pi_l6), color: PLAN_COLORS.pi_l6 },
        { name: 'P-IN >€6.99', value: sum(m => m.pi_g6), color: PLAN_COLORS.pi_g6 },
        { name: 'NEW ≤€6.99', value: sum(m => m.np_l6), color: PLAN_COLORS.np_l6 },
        { name: 'NEW >€6.99', value: sum(m => m.np_g6), color: PLAN_COLORS.np_g6 },
      ],
    };
  }), [years, sorted]);

  // Port-In Incentive + GARA Bonus monthly (stacked bar)
  const portInGaraMonthly = useMemo(() => sorted.map(m => {
    const [yr, mo] = m.month.split('-');
    return {
      label: `${MONTH_NAMES[parseInt(mo) - 1]} ${yr.slice(2)}`,
      pi_raw: m.pi_raw,
      add_gara: m.add_gara,
    };
  }), [sorted]);

  // Port-In vs Deductions annual
  const piVsDedAnnual = useMemo(() => yearlyTotals.map(yt => ({
    year: yt.year,
    pi_total: yt.pi_total,
    incentive: yt.incentive,
  })), [yearlyTotals]);

  // Deductions monthly
  const deductionsMonthly = useMemo(() => sorted.map(m => {
    const [yr, mo] = m.month.split('-');
    return {
      label: `${MONTH_NAMES[parseInt(mo) - 1]} ${yr.slice(2)}`,
      po_deduction: m.po_deduction,
      clawback: m.clawback,
      renewal_impact: m.renewal_impact,
    };
  }), [sorted]);

  // Deductions by year
  const deductionsByYear = useMemo(() => yearlyTotals.map(yt => ({
    year: yt.year,
    po_deduction: yt.po_deduction,
    clawback: yt.clawback,
    renewal_impact: yt.renewal_impact,
    total: yt.total_ded,
  })), [yearlyTotals]);

  // Renewal rate monthly
  const renewalMonthly = useMemo(() => sorted.map(m => {
    const [yr, mo] = m.month.split('-');
    return {
      label: `${MONTH_NAMES[parseInt(mo) - 1]} ${yr.slice(2)}`,
      renewal_rate: m.renewal_rate,
      year: yr,
    };
  }), [sorted]);

  // P-IN comparison monthly
  const piComparison = useMemo(() => sorted.map(m => {
    const [yr, mo] = m.month.split('-');
    return {
      label: `${MONTH_NAMES[parseInt(mo) - 1]} ${yr.slice(2)}`,
      pi_l6: m.pi_l6,
      pi_g6: m.pi_g6,
    };
  }), [sorted]);

  // NEW comparison monthly
  const newComparison = useMemo(() => sorted.map(m => {
    const [yr, mo] = m.month.split('-');
    return {
      label: `${MONTH_NAMES[parseInt(mo) - 1]} ${yr.slice(2)}`,
      np_l6: m.np_l6,
      np_g6: m.np_g6,
    };
  }), [sorted]);

  // Performance insights
  const latestMonth = sorted[sorted.length - 1];
  const prevMonth = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  const incentiveChange = prevMonth ? ((latestMonth.incentive - prevMonth.incentive) / Math.max(prevMonth.incentive, 1)) * 100 : 0;
  const gaChange = prevMonth ? latestMonth.ga_cnt - prevMonth.ga_cnt : 0;

  return (
    <div className="p-6 space-y-6">
      {/* 1. PERFORMANCE INSIGHTS */}
      <div>
        <h2 className="text-lg font-bold text-[#21264E] mb-4 flex items-center gap-2">
          <Zap size={20} className="text-[#FFD54F]" />
          Performance Insights
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Latest Incentive</p>
            <p className="text-xl font-bold text-[#21264E]">{fmt(latestMonth?.incentive ?? 0)}</p>
            {prevMonth && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${incentiveChange >= 0 ? 'text-[#08DC7D]' : 'text-[#F04438]'}`}>
                {incentiveChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(incentiveChange).toFixed(1)}% vs prev month
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Latest GA Count</p>
            <p className="text-xl font-bold text-[#21264E]">{fmtN(latestMonth?.ga_cnt ?? 0)}</p>
            {prevMonth && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${gaChange >= 0 ? 'text-[#08DC7D]' : 'text-[#F04438]'}`}>
                {gaChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(gaChange)} vs prev month
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Latest Renewal Rate</p>
            <p className="text-xl font-bold text-[#21264E]">{fmtP(latestMonth?.renewal_rate ?? 0)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Latest Deductions</p>
            <p className="text-xl font-bold text-[#F04438]">{fmt(latestMonth?.total_ded ?? 0)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Avg GA per Month</p>
            <p className="text-xl font-bold text-[#21264E]">{fmtN(yearlyTotals.length > 0 ? yearlyTotals.reduce((sum, y) => sum + y.ga_cnt, 0) / yearlyTotals.reduce((sum, y) => sum + y.monthCount, 0) : 0)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Avg Port-In per Month</p>
            <p className="text-xl font-bold text-[#21264E]">{fmtN(yearlyTotals.length > 0 ? yearlyTotals.reduce((sum, y) => sum + y.port_in, 0) / yearlyTotals.reduce((sum, y) => sum + y.monthCount, 0) : 0)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Avg New Activations</p>
            <p className="text-xl font-bold text-[#21264E]">{fmtN(yearlyTotals.length > 0 ? yearlyTotals.reduce((sum, y) => sum + (y.np_l6 + y.np_g6), 0) / yearlyTotals.reduce((sum, y) => sum + y.monthCount, 0) : 0)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">Avg Incentive per Month</p>
            <p className="text-xl font-bold text-[#21264E]">{fmt(yearlyTotals.length > 0 ? yearlyTotals.reduce((sum, y) => sum + y.incentive, 0) / yearlyTotals.reduce((sum, y) => sum + y.monthCount, 0) : 0)}</p>
          </div>
        </div>
      </div>

      {/* 2. YEAR-BY-YEAR OVERVIEW */}
      <ChartCard title="Year-by-Year Overview">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 px-3 text-[#21264E] font-semibold">Metric</th>
                {yearlyTotals.map(yt => (
                  <th key={yt.year} className="text-right py-2 px-3 font-semibold" style={{ color: YEAR_COLORS[yt.year] || '#21264E' }}>
                    {yt.year} ({yt.monthCount}mo)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-xs">
              {[
                { label: 'Total Incentive', key: 'incentive', format: fmt },
                { label: 'GA Activations', key: 'ga_cnt', format: fmtN },
                { label: 'P-IN ≤€6.99', key: 'pi_l6', format: fmtN },
                { label: 'P-IN >€6.99', key: 'pi_g6', format: fmtN },
                { label: 'NEW ≤€6.99', key: 'np_l6', format: fmtN },
                { label: 'NEW >€6.99', key: 'np_g6', format: fmtN },
                { label: 'Port-In', key: 'port_in', format: fmtN },
                { label: 'Port-Out', key: 'port_out', format: fmtN },
                { label: 'PO Deduction', key: 'po_deduction', format: fmt },
                { label: 'Clawback', key: 'clawback', format: fmt },
                { label: 'Renewal Impact', key: 'renewal_impact', format: fmt },
                { label: 'Total Deductions', key: 'total_ded', format: fmt },
                { label: 'Port in Incentive', key: 'pi_raw', format: fmt },
                { label: 'Gara bonus', key: 'add_gara', format: fmt },
                { label: 'Total Port in bonus', key: 'pi_total', format: fmt },
                { label: 'Avg Renewal Rate', key: 'renewal_rate', format: fmtP },
              ].map(row => (
                <tr key={row.key} className="border-b border-gray-50 hover:bg-[#fff7f2] transition">
                  <td className="py-2 px-3 text-[#21264E] font-medium">{row.label}</td>
                  {yearlyTotals.map(yt => {
                    const val = yt[row.key as keyof typeof yt] as number;
                    const isDeduction = ['po_deduction', 'clawback', 'renewal_impact', 'total_ded'].includes(row.key);
                    return (
                      <td key={yt.year} className={`text-right py-2 px-3 font-mono ${isDeduction ? 'text-[#F04438]' : 'text-[#21264E]'}`}>
                        {row.format(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* 3. ALL-TIME KPI SUMMARY */}
      <div>
        <h2 className="text-lg font-bold text-[#21264E] mb-4 flex items-center gap-2">
          <Target size={20} className="text-[#006AE0]" />
          All-Time KPI Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Incentive', value: fmt(allTimeTotals.incentive), color: '#006AE0' },
            { label: 'GA Activations', value: fmtN(allTimeTotals.ga_cnt), color: '#08DC7D' },
            { label: 'Port-In Total', value: fmtN(allTimeTotals.port_in), color: '#00D7FF' },
            { label: 'Port in Incentive', value: fmt(allTimeTotals.pi_raw), color: '#FFC8B2' },
            { label: 'Gara bonus', value: fmt(allTimeTotals.add_gara), color: '#FFD54F' },
            { label: 'Total Port in bonus', value: fmt(allTimeTotals.pi_total), color: '#46286E' },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: kpi.color }} />
              <p className="text-xs text-gray-500 mb-1 pl-2">{kpi.label}</p>
              <p className="text-lg font-bold pl-2" style={{ color: kpi.color === DEDUCTION_RED ? DEDUCTION_RED : '#21264E' }}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. ANNUAL INCENTIVE YoY */}
      <ChartCard title="Annual Incentive - YoY" id="cYB">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={yearlyTotals}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="year" tick={{ fill: '#21264E', fontSize: 12 }} />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Bar dataKey="incentive" name="Total Incentive" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {yearlyTotals.map(yt => (
                <Cell key={yt.year} fill={YEAR_COLORS[yt.year] || '#006AE0'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 5. MONTHLY INCENTIVE - CALENDAR OVERLAY */}
      <ChartCard title="Monthly Incentive - Calendar Overlay" id="cMO">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={calendarOverlay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="monthName" tick={{ fill: '#21264E', fontSize: 12 }} />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            {years.map(yr => (
              <Line key={yr} type="monotone" dataKey={`incentive_${yr}`} name={yr}
                stroke={YEAR_COLORS[yr] || '#006AE0'} strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 6. FULL MONTHLY INCENTIVE TIMELINE */}
      <ChartCard title="Full Monthly Incentive Timeline" id="cMF">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={timeline}>
            <defs>
              <linearGradient id="incentiveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#006AE0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#006AE0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Area type="monotone" dataKey="incentive" name="Incentive" stroke="#006AE0" fill="url(#incentiveGrad)" strokeWidth={2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 7. PLAN ACTIVATION TRENDS */}
      <ChartCard title="Plan Activation Trends">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={planTrends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Bar dataKey="pi_l6" name="P-IN ≤€6.99" stackId="a" fill={PLAN_COLORS.pi_l6} isAnimationActive={false} />
            <Bar dataKey="pi_g6" name="P-IN >€6.99" stackId="a" fill={PLAN_COLORS.pi_g6} isAnimationActive={false} />
            <Bar dataKey="np_l6" name="NEW ≤€6.99" stackId="a" fill={PLAN_COLORS.np_l6} isAnimationActive={false} />
            <Bar dataKey="np_g6" name="NEW >€6.99" stackId="a" fill={PLAN_COLORS.np_g6} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 8. P-IN ≤€6.99 vs P-IN >€6.99 */}
      <ChartCard title="P-IN ≤€6.99 vs P-IN >€6.99" id="cPI">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={piComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Bar dataKey="pi_l6" name="P-IN ≤€6.99" fill={PLAN_COLORS.pi_l6} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="pi_g6" name="P-IN >€6.99" fill={PLAN_COLORS.pi_g6} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 9. NEW ≤€6.99 vs NEW >€6.99 */}
      <ChartCard title="NEW ≤€6.99 vs NEW >€6.99" id="cNP">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={newComparison}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Bar dataKey="np_l6" name="NEW ≤€6.99" fill={PLAN_COLORS.np_l6} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="np_g6" name="NEW >€6.99" fill={PLAN_COLORS.np_g6} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 10. PLAN MIX BY YEAR */}
      <ChartCard title="Plan Mix by Year" id="cPY">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {planMixByYear.map(pm => (
            <div key={pm.year} className="text-center">
              <p className="text-sm font-semibold mb-2 pdf-planmix-year" style={{ color: YEAR_COLORS[pm.year] || '#21264E' }}>{pm.year}</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pm.data}
                    cx="50%" cy="50%"
                    innerRadius={45} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {pm.data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 flex-wrap pdf-planmix-legend">
          {planMixByYear[0]?.data.map((d, i) => (
            <span key={i} className="flex items-center gap-2 text-xs text-[#21264E]">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
              {d.name}
            </span>
          ))}
        </div>
      </ChartCard>

      {/* 11. GA ACTIVATIONS - CALENDAR OVERLAY */}
      <ChartCard title="GA Activations - Calendar Overlay" id="cGA">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4 pdf-ga-tiles">
          {yearlyTotals.map(yt => (
            <div key={yt.year} className="flex items-center gap-3 bg-[#fff7f2] rounded-lg p-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: YEAR_COLORS[yt.year] || '#006AE0' }} />
              <div>
                <p className="text-xs text-gray-500">{yt.year} Total GA</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-[#21264E]">{fmtN(yt.ga_cnt)}</p>
                  <p className="text-[10px] text-gray-400 font-medium">Avg: {fmtN(yt.avg_ga_active)}/mo</p>
                </div>
              </div>
              <div className="ml-auto text-xs text-gray-400">{yt.monthCount} months</div>
            </div>
          ))}
        </div>
        <div id="cGAC">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={calendarOverlay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="monthName" tick={{ fill: '#21264E', fontSize: 12 }} />
              <YAxis tick={{ fill: '#21264E', fontSize: 11 }} />
              <Tooltip content={<CTooltip />} />
              <Legend />
              {years.map(yr => (
                <Line key={yr} type="monotone" dataKey={`ga_${yr}`} name={`GA ${yr}`}
                  stroke={YEAR_COLORS[yr] || '#006AE0'} strokeWidth={2.5}
                  dot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 2 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 11b. GA ACTIVATIONS - FULL TIMELINE BAR CHART */}
      <ChartCard title="GA Activations - Full Timeline" id="cGT">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Bar dataKey="ga_cnt" name="GA Activations" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {timeline.map((entry, i) => {
                const yr = entry.month.substring(0, 4);
                return <Cell key={i} fill={YEAR_COLORS[yr] || '#006AE0'} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 12. PORT IN INCENTIVE + GARA BONUS MONTHLY */}
      <ChartCard title="Port in Incentive + Gara Bonus Monthly" id="cPII">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={portInGaraMonthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Bar dataKey="pi_raw" name="Port in Incentive" stackId="a" fill="#FFC8B2" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="add_gara" name="Gara bonus" stackId="a" fill="#FFD54F" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 12b. PORT-IN VS PORT-OUT MONTHLY */}
      <ChartCard title="Port-In vs Port-Out Monthly" id="cPF">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="port_in" name="Port-In" stroke="#08DC7D" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="port_out" name="Port-Out" stroke="#F04438" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 13. TOTAL PORT-IN BONUS VS TOTAL INCENTIVE PAID - ANNUAL */}
      <ChartCard title="Total Port-In Bonus vs Total Incentive Paid - Annual" id="cPD">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={piVsDedAnnual}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="year" tick={{ fill: '#21264E', fontSize: 12 }} />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Bar dataKey="pi_total" name="Total Port-In Bonus" fill="#006AE0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="incentive" name="Total Incentive Paid" fill="#08DC7D" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 14. DEDUCTIONS ANALYSIS */}
      <div>
        <h2 className="text-lg font-bold text-[#21264E] mb-4 flex items-center gap-2">
          <AlertTriangle size={20} className="text-[#F04438]" />
          Deductions Analysis
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Deductions', value: fmt(allTimeTotals.total_deductions) },
            { label: 'PO Deductions', value: fmt(allTimeTotals.po_deduction) },
            { label: 'Clawback', value: fmt(allTimeTotals.clawback) },
            { label: 'Renewal Impact', value: fmt(allTimeTotals.renewal_impact) },
          ].map((d, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-[#F04438]/20 p-4">
              <p className="text-xs text-gray-500 mb-1">{d.label}</p>
              <p className="text-xl font-bold text-[#F04438]">{d.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 15. DEDUCTIONS MONTHLY */}
      <ChartCard title="Deductions Monthly" id="cDM">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={deductionsMonthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} domain={[0, 'auto']} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Bar dataKey="po_deduction" name="PO Deduction" stackId="ded" fill="#F04438" isAnimationActive={false} />
            <Bar dataKey="clawback" name="Clawback" stackId="ded" fill="#D32F2F" isAnimationActive={false} />
            <Bar dataKey="renewal_impact" name="Renewal Impact" stackId="ded" fill="#B71C1C" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 16. DEDUCTIONS BY YEAR */}
      <ChartCard title="Deductions by Year" id="cDY">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={deductionsByYear}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="year" tick={{ fill: '#21264E', fontSize: 12 }} />
            <YAxis tickFormatter={fmtShort} tick={{ fill: '#21264E', fontSize: 11 }} domain={[0, 'auto']} />
            <Tooltip content={<CTooltip />} />
            <Legend />
            <Bar dataKey="po_deduction" name="PO Deduction" fill="#F04438" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="clawback" name="Clawback" fill="#D32F2F" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="renewal_impact" name="Renewal Impact" fill="#B71C1C" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 17. RENEWAL RATE MONTHLY */}
      <ChartCard title="Renewal Rate Monthly" id="cRN">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={renewalMonthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fill: '#21264E', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} tick={{ fill: '#21264E', fontSize: 11 }} />
            <Tooltip content={<CTooltip />} />
            <Line type="monotone" dataKey="renewal_rate" name="Renewal Rate %" stroke="#46286E" strokeWidth={2.5}
              isAnimationActive={false}
              dot={/* eslint-disable @typescript-eslint/no-explicit-any */
                ((props: any) => {
                  const { cx, cy, payload } = props;
                  if (cx == null || cy == null) return null;
                  return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={YEAR_COLORS[payload?.year] || '#46286E'} stroke="#fff" strokeWidth={2} />;
                }) as any
              /* eslint-enable @typescript-eslint/no-explicit-any */}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Stock Distribution (Year-over-Year)" id="cSTK">
        {stockLoading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading stock data...</div>
        ) : stockError ? (
          <div className="text-center py-10 text-red-600 text-sm">{stockError}</div>
        ) : stockInsights.yoy.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No stock data available</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg border border-blue-100 p-3">
                <p className="text-xs text-gray-500 mb-1">All Time Total Stock Given</p>
                <p className="text-xl font-bold text-[#21264E]">{fmtN(Math.round(stockInsights.allTimeTotals.total))}</p>
                <p className="text-xs text-gray-500 mt-1">Avg/mo: {fmtN(Math.round(stockInsights.allTimeAverages.total))}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-100 p-3">
                <p className="text-xs text-gray-500 mb-1">All Time Used</p>
                <p className="text-xl font-bold text-[#21264E]">{fmtN(Math.round(stockInsights.allTimeTotals.used))}</p>
                <p className="text-xs text-gray-500 mt-1">Avg/mo: {fmtN(Math.round(stockInsights.allTimeAverages.used))}</p>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-100 p-3">
                <p className="text-xs text-gray-500 mb-1">All Time Remaining</p>
                <p className="text-xl font-bold text-[#21264E]">{fmtN(Math.round(stockInsights.allTimeTotals.remaining))}</p>
                <p className="text-xs text-gray-500 mt-1">Avg/mo: {fmtN(Math.round(stockInsights.allTimeAverages.remaining))}</p>
              </div>
              <div className="bg-[#fff7f2] rounded-lg border border-orange-100 p-3">
                <p className="text-xs text-gray-500 mb-1">Last Month Issued Stock</p>
                <p className="text-xl font-bold text-[#21264E]">{fmtN(Math.round(stockInsights.lastMonthIssuedStock))}</p>
                <p className="text-xs text-gray-500 mt-1">{stockInsights.latestMonthLabel || '—'}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Remaining: <span className="font-semibold text-[#21264E]">{fmtN(Math.round(stockInsights.lastMonthRemainingStock))}</span>
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg border border-purple-100 p-3">
                <p className="text-xs text-gray-500 mb-1">Stock report updated Date</p>
                <p className="text-xl font-bold text-[#21264E]">{stockInsights.lastIssuedText || '—'}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Validation: {stockInsights.mismatchCount === 0 ? 'Used + Unused = Totalcards' : `${stockInsights.mismatchCount} mismatch rows`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs">
              <div className="text-gray-500">
                DB updated on: <span className="font-semibold text-[#21264E]">{stockInsights.lastIssuedText || '—'}</span>
              </div>
              <div className="text-gray-500">
                Last stock issued: <span className="font-semibold text-[#21264E]">{stockInsights.latestMonthLabel || '—'}</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stockInsights.yoy}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="year" tick={{ fill: '#21264E', fontSize: 12 }} />
                <YAxis tick={{ fill: '#21264E', fontSize: 11 }} domain={[0, 'auto']} />
                <Tooltip content={<CTooltip />} />
                <Legend />
                <Bar dataKey="distributed" name="Distributed" fill="#006AE0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="used" name="Used" fill="#08DC7D" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="remaining" name="Remaining" fill="#FFD54F" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </ChartCard>

      <ChartCard title="Face Value Stock Details" id="tSTK">
        {stockLoading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading stock data...</div>
        ) : stockError ? (
          <div className="text-center py-10 text-red-600 text-sm">{stockError}</div>
        ) : stockInsights.faceValueRows.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No stock data available</div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider">Year</label>
                <select
                  value={stockFilterYear}
                  onChange={(e) => setStockFilterYear(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#21264E] bg-white"
                >
                  <option value="ALL">All</option>
                  {stockFilterOptions.years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider">Month</label>
                <select
                  value={stockFilterMonth}
                  onChange={(e) => setStockFilterMonth(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#21264E] bg-white"
                >
                  <option value="ALL">All</option>
                  {stockFilterOptions.months
                    .filter(m => stockFilterYear === 'ALL' ? true : m.key.slice(0, 4) === stockFilterYear)
                    .map(m => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider">Face Value</label>
                <select
                  value={stockFilterFaceValue}
                  onChange={(e) => setStockFilterFaceValue(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#21264E] bg-white"
                >
                  <option value="ALL">All</option>
                  {stockFilterOptions.faceValues.map(fv => (
                    <option key={fv} value={fv}>{fv}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredStockRows.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No rows for selected filters</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2 px-3 text-[#21264E] font-semibold w-28">Month</th>
                      <th className="py-2 px-3 text-[#21264E] font-semibold w-40">Retailer ID</th>
                      <th className="py-2 px-3 text-[#21264E] font-semibold w-28">SIM Face Value</th>
                      <th className="py-2 px-3 text-[#21264E] font-semibold text-right w-24">Totalcards</th>
                      <th className="py-2 px-3 text-[#21264E] font-semibold text-right">Used</th>
                      <th className="py-2 px-3 text-[#21264E] font-semibold text-right">Unused</th>
                      <th className="py-2 px-3 text-[#21264E] font-semibold text-right">Using Rate</th>
                      <th className="py-2 px-3 text-[#21264E] font-semibold">Stock Using Analysis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStockRows.map((r, idx) => {
                      const usingRate = r.totalcards > 0 ? (r.used / r.totalcards) * 100 : 0;
                      const ok = Math.round(r.used + r.unused) === Math.round(r.totalcards);
                      const analysis =
                        !ok ? 'Data mismatch' :
                        r.totalcards === 0 ? 'No stock issued' :
                        usingRate >= 90 ? 'Fast moving' :
                        usingRate >= 50 ? 'Normal usage' :
                        usingRate >= 10 ? 'Slow moving' :
                        'Stagnant stock';
                      return (
                        <tr key={`${r.monthKey}-${r.retailerId}-${r.simFaceValue}-${idx}`} className="border-b border-gray-50 hover:bg-[#fff7f2] transition">
                          <td className="py-2.5 px-3 text-xs text-gray-600 whitespace-nowrap">{r.monthLabel}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-[#21264E] whitespace-nowrap overflow-hidden text-ellipsis">{r.retailerId}</td>
                          <td className="py-2.5 px-3 font-mono text-xs text-[#21264E] whitespace-nowrap">{r.simFaceValue}</td>
                          <td className="py-2.5 px-3 text-right text-xs text-gray-600">{fmtN(Math.round(r.totalcards))}</td>
                          <td className="py-2.5 px-3 text-right text-xs text-gray-600">{fmtN(Math.round(r.used))}</td>
                          <td className="py-2.5 px-3 text-right text-xs text-gray-600">{fmtN(Math.round(r.unused))}</td>
                          <td className="py-2.5 px-3 text-right text-xs text-gray-600">{usingRate.toFixed(1)}%</td>
                          <td className="py-2.5 px-3 text-xs">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-semibold ${
                              analysis === 'Data mismatch' ? 'bg-red-50 text-red-700 border-red-200' :
                              analysis === 'No stock issued' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                              analysis === 'Fast moving' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              analysis === 'Normal usage' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              analysis === 'Slow moving' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                              'bg-orange-50 text-orange-800 border-orange-200'
                            }`}>
                              {analysis}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </ChartCard>

      {/* Retailer details footer */}
      <div className="bg-[#21264E] rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={16} className="text-[#FFD54F]" />
          <h3 className="text-sm font-semibold">Retailer Details</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-white/50">Retailer ID</p>
            <p className="font-semibold">{summary.retailer_id}</p>
          </div>
          <div>
            <p className="text-white/50">Branch</p>
            <p className="font-semibold">{summary.branch}</p>
          </div>
          <div>
            <p className="text-white/50">Zone</p>
            <p className="font-semibold">{summary.zone}</p>
          </div>
          <div>
            <p className="text-white/50">Data Range</p>
            <p className="font-semibold">{sorted[0]?.month} → {sorted[sorted.length - 1]?.month}</p>
          </div>
        </div>
      </div>

      {/* Confidential footer */}
      <p className="text-center text-[10px] text-gray-400 pb-4">
        CONFIDENTIAL — Proprietary retailer performance data. For internal use only. Unauthorised distribution prohibited.
      </p>
    </div>
  );
}
