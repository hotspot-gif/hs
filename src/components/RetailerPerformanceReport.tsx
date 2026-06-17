import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RpaUser } from '@/types';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface RetailerPerformanceReportProps {
  user: RpaUser;
  region: string;
  branch: string;
  zone: string;
}

type PriorityLevel = {
  key: string;
  name: string;
  color: string;
  description: string;
  timeline: string;
};

type PriorityLevelData = PriorityLevel & { value: number };

const PRIORITY_LEVELS: PriorityLevel[] = [
  {
    key: 'p1_count',
    name: 'P1 - CRITICAL LOSS',
    color: '#D32F2F',
    description: 'TOP RETAILER DROPPING FAST. Immediate escalation to Zone Manager. Manager must visit personally.',
    timeline: 'Within 24 hours',
  },
  {
    key: 'p2_count',
    name: 'P2 - DORMANT',
    color: '#FF3B30',
    description: 'Field visit mandatory. Check if the store is still open and operational. If closed, update the database. If open, reactivate with training and promotional materials.',
    timeline: 'Within 48 hours',
  },
  {
    key: 'p3_count',
    name: 'P3 - CHURNED',
    color: '#FF6B35',
    description: 'Reactivation call followed by a visit. Offer incentives or special promotions to stimulate sales.',
    timeline: 'Within 1 week',
  },
  {
    key: 'p4_count',
    name: 'P4 - SHARP DECLINE',
    color: '#FF9800',
    description: 'Urgent push. Discuss incentive schemes, check product availability, provide local marketing support.',
    timeline: 'Within 1 week',
  },
  {
    key: 'p5_count',
    name: 'P5 - SPORADIC',
    color: '#FBC02D',
    description: 'Engagement plan. Provide product training, accompaniment, POP materials, and schedule regular visits.',
    timeline: 'Within 2 weeks',
  },
  {
    key: 'p6_count',
    name: 'P6 - BELOW AVERAGE',
    color: '#7CB342',
    description: 'Monitoring and support. Push to achieve monthly target with weekly follow-up calls.',
    timeline: 'Continuous monitoring',
  },
  {
    key: 'p7_count',
    name: 'P7 - ACTIVE',
    color: '#00C853',
    description: 'Maintain and grow. Propose upselling opportunities and reward performance with recognition.',
    timeline: 'Monthly review',
  },
];

type MonthInfo = {
  key: string;
  aliases: string[];
  label: string;
  offset: number;
};

const MONTH_KEYS: MonthInfo[] = [
  { key: 'm-3', aliases: ['m-3', 'm_3', 'm3', 'm_03'], label: '3 months ago', offset: -3 },
  { key: 'm-2', aliases: ['m-2', 'm_2', 'm2', 'm_02'], label: '2 months ago', offset: -2 },
  { key: 'm-1', aliases: ['m-1', 'm_1', 'm1', 'm_01'], label: '1 month ago', offset: -1 },
  { key: 'm0', aliases: ['m0', 'm_0', 'm00', 'current_mtd', 'current_month'], label: 'Current MTD', offset: 0 },
];

const getMonthLabel = (offset: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() + offset);
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const fieldValue = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null) {
      return toNumber(row[alias]);
    }
  }
  return 0;
};

const PRIORITY_LEVEL_MAP: Record<string, string> = {
  P1: '#D32F2F',
  P2: '#FF3B30',
  P3: '#FF6B35',
  P4: '#FF9800',
  P5: '#FBC02D',
  P6: '#7CB342',
  P7: '#00C853',
};

const getPriorityColor = (value?: string) => {
  if (!value) return '#94A3B8';
  const normalized = String(value).trim().toUpperCase();
  const matched = /^P[1-7]/.exec(normalized)?.[0];
  return matched ? PRIORITY_LEVEL_MAP[matched] : PRIORITY_LEVEL_MAP[normalized] ?? '#94A3B8';
};

const getRowPriority = (row: Record<string, unknown>) => {
  const raw = row['p_level'] ?? row['priority_level'] ?? row['priority'] ?? row['P_LEVEL'] ?? '';
  return String(raw).trim();
};

const calculateMtdVariance = (row: Record<string, unknown>, monthInfo: MonthInfo[]) => {
  const m0 = fieldValue(row, monthInfo.find(m => m.offset === 0)?.aliases || []);
  const m1 = fieldValue(row, monthInfo.find(m => m.offset === -1)?.aliases || []);
  const m2 = fieldValue(row, monthInfo.find(m => m.offset === -2)?.aliases || []);
  const m3 = fieldValue(row, monthInfo.find(m => m.offset === -3)?.aliases || []);

  const avgLast3 = (m1 + m2 + m3) / 3;

  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const expectedPerformance = (avgLast3 / daysInMonth) * (today - 1);
  return Math.round(m0 - expectedPerformance);
};

export default function RetailerPerformanceReport({ region, branch, zone, user }: RetailerPerformanceReportProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [retailerRows, setRetailerRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({
    key: 'avg_mtd',
    direction: 'desc',
  });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const isZoneSelected = Boolean(zone);
  const isBranchSelected = Boolean(branch);
  const isRegionSelected = Boolean(region);

  const branchWiseData = useMemo(() => {
    // Group rows by branch and aggregate all data
    const branchMap = new Map<string, Record<string, unknown>>();
    rows.forEach(row => {
      const branchName = (row['branch'] as string) || 'Unknown Branch';
      if (!branchMap.has(branchName)) {
        branchMap.set(branchName, {
          zone: branchName.replace('LMIT-HS-', ''), // Use zone field for branch name in table
          ...Object.fromEntries(MONTH_KEYS.map(m => [m.key, 0])),
          ...Object.fromEntries(PRIORITY_LEVELS.map(l => [l.key, 0]))
        });
      }
      const entry = branchMap.get(branchName)!;
      // Aggregate month keys
      MONTH_KEYS.forEach(m => {
        const val = fieldValue(row, m.aliases);
        entry[m.key] = (entry[m.key] as number) + val;
      });
      // Aggregate priority levels
      PRIORITY_LEVELS.forEach(l => {
        const val = fieldValue(row, [l.key]);
        entry[l.key] = (entry[l.key] as number) + val;
      });
    });
    return Array.from(branchMap.values());
  }, [rows]);

  const displayRows = useMemo(() => {
    if (isZoneSelected) return [];
    if (isRegionSelected && !isBranchSelected) return branchWiseData;
    return rows;
  }, [isZoneSelected, isRegionSelected, isBranchSelected, rows, branchWiseData]);

  useEffect(() => {
    setLoading(true);
    
    // Fetch last updated date
    supabase
      .from('zone_coverage_summary')
      .select('last_updated')
      .limit(1)
      .then(({ data: lastUpdatedData, error: lastUpdatedError }) => {
        if (!lastUpdatedError && lastUpdatedData && lastUpdatedData.length > 0) {
          const dateStr = lastUpdatedData[0].last_updated;
          if (dateStr) {
            const date = new Date(dateStr);
            // Subtract 1 day
            date.setDate(date.getDate() - 1);
            // Format as DD-MMM-YYYY
            const day = date.getDate().toString().padStart(2, '0');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = months[date.getMonth()];
            const year = date.getFullYear();
            setLastUpdated(`${day}-${month}-${year}`);
          }
        }
      });
    
    let summaryQuery = supabase.from('zone_coverage_summary').select('*');

    if (region && region !== 'ITALY') {
      summaryQuery = summaryQuery.eq('region', region);
    }
    if (branch) {
      summaryQuery = summaryQuery.eq('branch', branch);
    }
    if (zone) {
      summaryQuery = summaryQuery.eq('zone', zone);
    }

    summaryQuery.limit(5000).then(({ data, error }: { data: Record<string, unknown>[] | null; error: unknown }) => {
      if (error) {
        console.error('Retailer performance fetch error:', error);
        setRows([]);
      } else {
        setRows((data || []) as Record<string, unknown>[]);
      }
      setLoading(false);
    });

    if (isZoneSelected) {
      let retailerQuery = supabase.from('retailer_coverage').select('*');

      if (region && region !== 'ITALY') {
        retailerQuery = retailerQuery.eq('region', region);
      }
      if (branch) {
        retailerQuery = retailerQuery.eq('branch', branch);
      }
      if (zone) {
        retailerQuery = retailerQuery.eq('zone', zone);
      }

      retailerQuery.limit(5000).then(({ data, error }: { data: Record<string, unknown>[] | null; error: unknown }) => {
        if (error) {
          console.error('Retailer coverage fetch error:', error);
          setRetailerRows([]);
        } else {
          setRetailerRows((data || []) as Record<string, unknown>[]);
        }
      });
    } else {
      setRetailerRows([]);
    }
  }, [region, branch, zone, isZoneSelected]);

  const currentMonthLabel = useMemo(() => getMonthLabel(0), []);
  const monthInfo = useMemo<MonthInfo[]>(
    () => MONTH_KEYS.map((entry: MonthInfo) => ({
      ...entry,
      label: `${entry.label} (${getMonthLabel(entry.offset)})`,
      shortLabel: entry.offset === 0 ? 'MTD' : `M${entry.offset}`,
    })),
    [],
  );
  const retailerTableColumns = useMemo(
    () => [
      ...monthInfo.map((entry: MonthInfo & { shortLabel: string }) => ({
        key: entry.key,
        label: entry.label,
        shortLabel: entry.shortLabel,
        aliases: entry.aliases
      })),
    ],
    [monthInfo],
  );

  const normalizedPriority = (value: unknown) => String(value ?? '').trim().toUpperCase();
  const filteredRetailerRows = useMemo<Record<string, unknown>[]>(() => {
    let result = retailerRows.filter((row: Record<string, unknown>) => {
      const rowPriority = normalizedPriority(getRowPriority(row));
      return priorityFilter === 'ALL' || rowPriority.startsWith(priorityFilter);
    });

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortConfig.key === 'retailer_id') {
          aValue = String(a['retailer_id'] ?? a['id'] ?? a['retailer'] ?? '');
          bValue = String(b['retailer_id'] ?? b['id'] ?? b['retailer'] ?? '');
        } else if (sortConfig.key === 'avg_mtd') {
          aValue = calculateMtdVariance(a, monthInfo);
          bValue = calculateMtdVariance(b, monthInfo);
        } else if (sortConfig.key === 'priority_level') {
          aValue = getRowPriority(a);
          bValue = getRowPriority(b);
        } else {
          // Find the column by key to get aliases
          const col = retailerTableColumns.find(c => c.key === sortConfig.key);
          if (col) {
            aValue = fieldValue(a, col.aliases);
            bValue = fieldValue(b, col.aliases);
          } else {
            aValue = 0;
            bValue = 0;
          }
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [priorityFilter, retailerRows, sortConfig, retailerTableColumns]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const priorityFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'All Priorities' },
      ...PRIORITY_LEVELS.map((level: PriorityLevel) => ({ value: level.key.slice(0, 2).toUpperCase(), label: level.name })),
    ],
    [],
  );

  const handleExportExcel = useCallback(async () => {
    if (filteredRetailerRows.length === 0) return;
    setExportingExcel(true);
    try {
      const XLSX: any = await import('xlsx');
      const branchLbl = (branch || 'ALL').replace('LMIT-HS-', '') || 'ALL';
      const zoneLbl = zone || 'ALL';
      const regionLbl = region || 'ITALY';
      const filterLbl = priorityFilter === 'ALL' ? 'All' : priorityFilter;
      const nowStr = new Date().toLocaleString('en-GB');

      const summarySheet = XLSX.utils.json_to_sheet([
        { Key: 'Exported At', Value: nowStr },
        { Key: 'Region', Value: regionLbl },
        { Key: 'Branch', Value: branchLbl },
        { Key: 'Zone', Value: zoneLbl },
        { Key: 'Priority Filter', Value: filterLbl },
        { Key: 'Total Rows', Value: filteredRetailerRows.length },
        { Key: 'Exported By', Value: user?.full_name || user?.username || user?.email || '' },
      ]);

      const dataSheet = XLSX.utils.json_to_sheet(
        filteredRetailerRows.map((row: Record<string, unknown>) => ({
          retailer_id: row['retailer_id'] ?? row['id'] ?? '',
          ...Object.fromEntries(monthInfo.map((entry: MonthInfo) => [entry.key, fieldValue(row, entry.aliases)])),
          mtd_variance: calculateMtdVariance(row, monthInfo),
          p_level: getRowPriority(row),
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(wb, dataSheet, 'Retailer Coverage');

      const filename = `retailer-coverage-${branchLbl}-${zoneLbl}-${filterLbl}`.replace(/\s+/g, '_') + '.xlsx';
      XLSX.writeFile(wb, filename, { compression: true });
    } catch (e) {
      console.error('Export Excel failed:', e);
    } finally {
      setExportingExcel(false);
    }
  }, [branch, filteredRetailerRows, monthInfo, priorityFilter, region, user, zone]);

  const handleExportPdf = useCallback(async () => {
    if (filteredRetailerRows.length === 0) return;
    setExportingPdf(true);
    try {
      const jsPDFModule: any = await import('jspdf');
      const autoTableModule: any = await import('jspdf-autotable');
      const jsPDF = jsPDFModule.default;
      const autoTable = autoTableModule.default ?? autoTableModule;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const W = 297;
      const H = 210;
      const M = 10;
      const nowStr = new Date().toLocaleString('en-GB');
      const branchLbl = (branch || 'ALL').replace('LMIT-HS-', '') || 'ALL';
      const zoneLbl = zone || 'ALL';
      const regionLbl = region || 'ITALY';
      const filterLbl = priorityFilter === 'ALL' ? 'All' : priorityFilter;
      const footerHook = (_data: any) => {
        const pageCount = pdf.internal.getNumberOfPages();
        const page = pdf.internal.getCurrentPageInfo().pageNumber;
        pdf.setDrawColor(220, 215, 210);
        pdf.setLineWidth(0.2);
        pdf.line(M, H - 10, W - M, H - 10);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(140, 140, 150);
        pdf.text('CONFIDENTIAL — internal retailer coverage export.', M, H - 6);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Page ${page} / ${pageCount}`, W - M, H - 6, { align: 'right' });
      };

      pdf.setFillColor(33, 38, 78);
      pdf.rect(0, 0, W, 18, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Retailer Performance Details', M, 12.5);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Branch: ${branchLbl} | Zone: ${zoneLbl} | Region: ${regionLbl}`, M, 17);
      pdf.text(`Exported: ${nowStr}`, W - M, 17, { align: 'right' });

      autoTable(pdf, {
        head: [[
          'Retailer ID',
          ...monthInfo.map((entry: MonthInfo) => entry.label),
          'MTD Var',
          'Priority Level',
        ]],
        body: filteredRetailerRows.map((row: Record<string, unknown>) => [
          String(row['retailer_id'] ?? row['id'] ?? row['retailer'] ?? ''),
          ...monthInfo.map((entry: MonthInfo) => fieldValue(row, entry.aliases).toLocaleString()),
          calculateMtdVariance(row, monthInfo).toLocaleString(),
          getRowPriority(row),
        ]),
        startY: 24,
        theme: 'grid',
        headStyles: { fillColor: [33, 38, 78], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { textColor: [33, 38, 78], fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [250, 248, 245] },
        styles: { font: 'helvetica', overflow: 'linebreak' },
        tableWidth: 'auto',
        didDrawPage: footerHook,
        didParseCell: (hook: any) => {
          if (hook.section !== 'body') return;
          const priorityColIndex = 1 + monthInfo.length + 1; // RetailerID + months + Avg MTD => priority column
          if (hook.column.index !== priorityColIndex) return;

          const raw = String(hook.cell.raw || '').trim();
          const up = raw.toUpperCase();

          // Prefer direct P# match
          const pm = up.match(/^P([1-7])/);
          let hex = '#94A3B8';
          if (pm) {
            hex = PRIORITY_LEVEL_MAP[`P${pm[1]}`] || hex;
          } else {
            // fallback: check if the label contains known priority names
            const found = PRIORITY_LEVELS.find(l => up.includes(l.name.toUpperCase()) || up.includes(l.key.toUpperCase()));
            if (found) hex = found.color;
            // numeric fallback like '4' -> P4
            const nm = up.match(/^([1-7])$/);
            if (nm) hex = PRIORITY_LEVEL_MAP[`P${nm[1]}`] || hex;
          }

          const s = (hex || '#94A3B8').replace('#', '');
          const r = Number.isNaN(parseInt(s.substring(0, 2), 16)) ? 148 : parseInt(s.substring(0, 2), 16);
          const g = Number.isNaN(parseInt(s.substring(2, 4), 16)) ? 163 : parseInt(s.substring(2, 4), 16);
          const b = Number.isNaN(parseInt(s.substring(4, 6), 16)) ? 184 : parseInt(s.substring(4, 6), 16);

          hook.cell.styles.fillColor = [r, g, b];
          hook.cell.styles.textColor = [255, 255, 255];
          hook.cell.styles.fontStyle = 'bold';
        },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 30 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30 },
          6: { cellWidth: 42 },
        },
      });

      const filename = `retailer-coverage-${branchLbl}-${zoneLbl}-${filterLbl}`.replace(/\s+/g, '_') + '.pdf';
      pdf.save(filename);
    } catch (e) {
      console.error('Export PDF failed:', e);
    } finally {
      setExportingPdf(false);
    }
  }, [branch, filteredRetailerRows, monthInfo, priorityFilter, region, user, zone]);

  const trendData = useMemo(() => {
    const totals = monthInfo.map((entry: MonthInfo) => ({
      name: entry.label,
      value: rows.reduce((sum: number, row: Record<string, unknown>) => sum + fieldValue(row, entry.aliases), 0),
    }));
    return totals;
  }, [rows, monthInfo]);

  const currentMtd = useMemo(
    () => trendData.find((entry: { name: string; value: number }) => entry.name.includes('Current MTD'))?.value ?? 0,
    [trendData],
  );
  const last3Average = useMemo(() => {
    const previous = trendData.slice(0, 3).map((entry: { value: number }) => entry.value);
    return previous.length > 0 ? previous.reduce((sum: number, value: number) => sum + value, 0) / previous.length : 0;
  }, [trendData]);

  const avgMtd = useMemo(() => {
    const now = new Date();
    const today = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const expectedPerformance = (last3Average / daysInMonth) * (today - 1);
    return currentMtd - expectedPerformance;
  }, [currentMtd, last3Average]);

  const roundedAvgMtd = useMemo(() => Math.round(avgMtd), [avgMtd]);

  const priorityData = useMemo<PriorityLevelData[]>(
    () => PRIORITY_LEVELS.map((level: PriorityLevel) => ({
      ...level,
      value: rows.reduce((sum: number, row: Record<string, unknown>) => sum + fieldValue(row, [level.key]), 0),
    })),
    [rows],
  );
  const totalPriority = useMemo(
    () => priorityData.reduce((sum: number, item: PriorityLevelData) => sum + item.value, 0),
    [priorityData],
  );
  const priorityVisible = priorityData.filter((item: PriorityLevelData) => item.value > 0);
  const p7Share = useMemo(() => {
    const p7Value = priorityData.find((item: PriorityLevelData) => item.key === 'p7_count')?.value ?? 0;
    return totalPriority > 0 ? Math.round((p7Value / totalPriority) * 100) : 0;
  }, [priorityData, totalPriority]);

  const summaryCards = [
    {
      label: `Current MTD (${currentMonthLabel})`,
      value: currentMtd,
      color: '#245bc1',
    },
    {
      label: '3-Month Retailer Average',
      value: Math.round(last3Average),
      color: '#08dc7d',
    },
    {
      label: 'MTD Variance',
      value: roundedAvgMtd,
      color: avgMtd < 0 ? '#D32F2F' : '#00C853',
      suffix: avgMtd < 0 ? 'below expected' : 'above expected',
    },
    {
      label: 'Total Priority Retailers',
      value: totalPriority,
      color: '#46286E',
    },
  ];

  const comparisonData = [
    { name: '3-month average', value: last3Average, fill: '#08dc7d' },
    { name: 'Current MTD', value: currentMtd, fill: '#245bc1' },
  ];

  if (!loading && rows.length === 0) {
    return (
      <div className="flex min-h-[480px] items-center justify-center p-8">
        <div className="rounded-3xl border border-[#21264E]/10 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-[#21264E]">Retailer Performance</h2>
          <p className="mt-3 text-sm text-slate-500">
            No performance records found for the selected Region / Branch / Zone filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {lastUpdated && (
        <div className="flex justify-end">
          <div className="rounded-full border border-[#21264E]/10 bg-white px-4 py-1.5 text-xs font-semibold text-[#21264E] shadow-sm">
            Last Updated: {lastUpdated}
          </div>
        </div>
      )}
      <div className="rounded-3xl border border-[#21264E]/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#245bc1]">Retailer Performance Report</p>
            <h1 className="mt-2 text-2xl font-bold text-[#21264E]">Monthly Trend & Priority Classification</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Monitoring current MTD performance against the rolling 3-month retailer average using zone coverage summary data.
            </p>
          </div>
          <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
            <div className="rounded-2xl bg-[#21264E] px-4 py-3 text-white shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/70">Region</p>
              <p className="mt-2 text-sm font-semibold">{region || 'ITALY'}</p>
            </div>
            <div className="rounded-2xl bg-[#fff7f2] px-4 py-3 text-[#21264E] shadow-sm border border-[#21264E]/10">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#21264E]/70">Branch</p>
              <p className="mt-2 text-sm font-semibold">{branch || 'All Branches'}</p>
            </div>
            <div className="rounded-2xl bg-[#fff7f2] px-4 py-3 text-[#21264E] shadow-sm border border-[#21264E]/10">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#21264E]/70">Zone</p>
              <p className="mt-2 text-sm font-semibold">{zone || 'All Zones'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card: { label: string; value: number; color: string; suffix?: string }) => (
          <div
            key={card.label}
            className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm border-l-4"
            style={{ borderLeftColor: card.color }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21264E]/70">{card.label}</p>
            <p className="mt-4 text-3xl font-bold text-[#21264E]">{card.value.toLocaleString()}</p>
            {card.suffix && <p className="mt-2 text-sm text-slate-500">{card.suffix}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#21264E]">Monthly Performance Trend</h2>
              <p className="text-sm text-slate-500">Current month and prior three months updated automatically.</p>
            </div>
            <div className="rounded-full bg-[#245bc1]/10 px-3 py-1 text-sm font-semibold text-[#245bc1]">{currentMonthLabel} is m0</div>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} />
                <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="value" stroke="#245bc1" strokeWidth={4} dot={{ r: 4, fill: '#245bc1' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#21264E]">MTD vs 3-Month Average</h2>
            <p className="text-sm text-slate-500">Compare current retailer MTD performance to the trailing 3-month trend.</p>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} />
                <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                <Bar dataKey="value" fill="#245bc1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#21264E]">Priority Distribution</h2>
            <p className="text-sm text-slate-500">Priority status for the selected filter set.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityVisible.length > 0 ? priorityVisible : [{ name: 'No priority data', value: 1, color: '#CBD5E1' }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {(priorityVisible.length > 0 ? priorityVisible : [{ name: 'No priority data', value: 1, color: '#CBD5E1' }]).map((entry: { name: string; value: number; color?: string }, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color || '#CBD5E1'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              {totalPriority > 0 && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">P7 share</span>
                  <span className="mt-1 text-3xl font-bold text-[#00C853]">{p7Share}%</span>
                  <span className="text-xs text-slate-400">of priority retailers</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {priorityData.map((item: PriorityLevelData) => (
                <div key={item.key} className="flex items-center justify-between rounded-xl bg-[#f8fafc] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span style={{ background: item.color }} className="inline-flex h-3 w-3 rounded-full" />
                    <div>
                      <p className="text-xs font-semibold text-[#21264E]">{item.name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#21264E]">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {isZoneSelected ? (
          <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#21264E]">Retailer Performance Details</h2>
                <p className="text-sm text-slate-500">Retailer details allocated to the selected zone.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <label htmlFor="priority-filter" className="font-semibold text-slate-700">Filter:</label>
                  <select
                    id="priority-filter"
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 focus:border-[#245bc1] focus:outline-none"
                  >
                    {priorityFilterOptions.map((option: { value: string; label: string }) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={exportingPdf || filteredRetailerRows.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-[#F04438] text-white hover:bg-[#d93a30] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileDown size={16} />
                    {exportingPdf ? 'Exporting...' : 'PDF - Adobe Acrobat'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={exportingExcel || filteredRetailerRows.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-[#16A34A] text-white hover:bg-[#12843d] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileSpreadsheet size={16} />
                    {exportingExcel ? 'Exporting...' : 'Excel - MS Excel'}
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-x-hidden rounded-xl border border-slate-200">
              <table className="w-full divide-y divide-slate-200 text-left text-[10px] md:text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr className="divide-x divide-slate-200">
                    <th
                      className="cursor-pointer px-1 py-2 md:px-4 md:py-3 font-semibold hover:bg-slate-100"
                      onClick={() => handleSort('retailer_id')}
                    >
                      <div className="flex items-center gap-1">
                        <span className="hidden md:inline">Retailer ID</span>
                        <span className="md:hidden">ID</span>
                        {sortConfig?.key === 'retailer_id' && (
                          sortConfig.direction === 'asc' ? <ChevronUp size={12} className="md:w-3.5 md:h-3.5" /> : <ChevronDown size={12} className="md:w-3.5 md:h-3.5" />
                        )}
                      </div>
                    </th>
                    {retailerTableColumns.map((column: { key: string; label: string; shortLabel: string; aliases: string[] }) => (
                      <th
                        key={column.key}
                        className="cursor-pointer px-1 py-2 md:px-4 md:py-3 font-semibold hover:bg-slate-100 text-center"
                        onClick={() => handleSort(column.key)}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="hidden md:inline">{column.label}</span>
                          <span className="md:hidden">{column.shortLabel}</span>
                          {sortConfig?.key === column.key && (
                            sortConfig.direction === 'asc' ? <ChevronUp size={12} className="md:w-3.5 md:h-3.5" /> : <ChevronDown size={12} className="md:w-3.5 md:h-3.5" />
                          )}
                        </div>
                      </th>
                    ))}
                    <th
                      className="cursor-pointer px-1 py-2 md:px-4 md:py-3 font-semibold hover:bg-slate-100 text-center"
                      onClick={() => handleSort('avg_mtd')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className="hidden md:inline">MTD Variance</span>
                        <span className="md:hidden">Var</span>
                        {sortConfig?.key === 'avg_mtd' && (
                          sortConfig.direction === 'asc' ? <ChevronUp size={12} className="md:w-3.5 md:h-3.5" /> : <ChevronDown size={12} className="md:w-3.5 md:h-3.5" />
                        )}
                      </div>
                    </th>
                    <th
                      className="cursor-pointer px-1 py-2 md:px-4 md:py-3 font-semibold hover:bg-slate-100 text-center"
                      onClick={() => handleSort('priority_level')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className="hidden md:inline">Priority Level</span>
                        <span className="md:hidden">Pri</span>
                        {sortConfig?.key === 'priority_level' && (
                          sortConfig.direction === 'asc' ? <ChevronUp size={12} className="md:w-3.5 md:h-3.5" /> : <ChevronDown size={12} className="md:w-3.5 md:h-3.5" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRetailerRows.length > 0 ? (
                    filteredRetailerRows.map((row: Record<string, unknown>, index: number) => {
                      const priorityValue = getRowPriority(row);
                      const mtdVariance = calculateMtdVariance(row, monthInfo);

                      return (
                        <tr key={`${row['retailer_id'] || row['id'] || index}-${index}`} className="hover:bg-slate-50 divide-x divide-slate-100">
                          <td className="px-1 py-2 md:px-4 md:py-3 font-medium text-slate-900 break-all md:break-normal">
                            {String(row['retailer_id'] ?? row['id'] ?? row['retailer'] ?? '—')}
                          </td>
                          {retailerTableColumns.map((column: any) => (
                            <td key={column.key} className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">
                              {fieldValue(row, column.aliases).toLocaleString()}
                            </td>
                          ))}
                          <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{mtdVariance.toLocaleString()}</td>
                          <td className="px-1 py-2 md:px-4 md:py-3 text-center">
                            <span
                              className="inline-flex rounded-full px-1.5 py-0.5 md:px-3 md:py-1 text-[8px] md:text-xs font-semibold uppercase tracking-tight md:tracking-[0.18em] text-white"
                              style={{ backgroundColor: getPriorityColor(priorityValue) }}
                            >
                              {priorityValue.split('-')[0].trim() || 'Unknown'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={retailerTableColumns.length + 3} className="px-4 py-6 text-center text-xs md:text-sm text-slate-500">
                        No retailer details found for this zone.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <>
            {/* Zone-wise/Branch-wise summary table */}
            {(region || branch) && (
              <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[#21264E]">{(isRegionSelected && !isBranchSelected) ? "Branch-wise Summary" : "Zone-wise Summary"}</h2>
                  <p className="text-sm text-slate-500">{(isRegionSelected && !isBranchSelected) ? "Individual branch performance breakdown." : "Individual zone performance breakdown."}</p>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full divide-y divide-slate-200 text-left text-[10px] md:text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr className="divide-x divide-slate-200">
                        <th className="px-1 py-2 md:px-4 md:py-3 font-semibold text-center">{(isRegionSelected && !isBranchSelected) ? "Branch" : "Zone"}</th>
                        {monthInfo.map((entry: MonthInfo & { shortLabel: string }) => (
                          <th key={entry.key} className="px-1 py-2 md:px-4 md:py-3 font-semibold text-center">
                            <span className="hidden md:inline">{entry.label}</span>
                            <span className="md:hidden">{entry.shortLabel}</span>
                          </th>
                        ))}
                        {PRIORITY_LEVELS.map((level) => (
                          <th key={level.key} className="px-1 py-2 md:px-4 md:py-3 font-semibold text-center">
                            <span className="hidden md:inline">{level.name.split(' - ')[0]}</span>
                            <span className="md:hidden">{level.name.split(' - ')[0]}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {displayRows.map((row: Record<string, unknown>, index: number) => (
                        <tr key={`${row['zone'] || index}-${index}`} className="hover:bg-slate-50 divide-x divide-slate-100">
                          <td className="px-1 py-2 md:px-4 md:py-3 font-medium text-slate-900 text-center">{String(row['zone'] || '—')}</td>
                          {monthInfo.map((entry: MonthInfo & { shortLabel: string }) => (
                            <td key={entry.key} className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">
                              {fieldValue(row, entry.aliases).toLocaleString()}
                            </td>
                          ))}
                          {PRIORITY_LEVELS.map((level) => (
                            <td key={level.key} className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">
                              {fieldValue(row, [level.key]).toLocaleString()}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>

    </div>
  );
}
