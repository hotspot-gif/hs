import { useEffect, useMemo, useState } from 'react';
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

const PRIORITY_LEVELS = [
  { key: 'p1_count', name: 'P1 - CRITICAL LOSS', color: '#D32F2F', description: 'High performer gone inactive. Escalate to Zone Manager immediately.' },
  { key: 'p2_count', name: 'P2 - DORMANT', color: '#FF3B30', description: 'Zero activity for 4 months. Immediate field visit required.' },
  { key: 'p3_count', name: 'P3 - CHURNED', color: '#FF6B35', description: 'Was active, now inactive in MTD. Schedule reactivation visit.' },
  { key: 'p4_count', name: 'P4 - SHARP DECLINE', color: '#FF9800', description: 'Active but far below average. Urgent performance push needed.' },
  { key: 'p5_count', name: 'P5 - SPORADIC', color: '#FBC02D', description: 'Irregular low activity. Needs engagement plan.' },
  { key: 'p6_count', name: 'P6 - BELOW AVERAGE', color: '#7CB342', description: 'Active but declining. Monitor and improve performance.' },
  { key: 'p7_count', name: 'P7 - ACTIVE', color: '#00C853', description: 'On track or above target. Maintain and grow.' },
];

const MONTH_KEYS: { key: string; aliases: string[]; label: string; offset: number }[] = [
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

const AVERAGE_MTD_ALIASES = ['avg_mtd', 'avg_mtd_value', 'avgmtd', 'average_mtd'];

export default function RetailerPerformanceReport({ region, branch, zone }: RetailerPerformanceReportProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [retailerRows, setRetailerRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  const isZoneSelected = Boolean(zone);

  useEffect(() => {
    setLoading(true);
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
  const monthInfo = useMemo(() => MONTH_KEYS.map(entry => ({ ...entry, label: `${entry.label} (${getMonthLabel(entry.offset)})` })), []);
  const retailerTableColumns = useMemo(
    () => [
      ...monthInfo.map(entry => ({ key: entry.key, label: entry.label, aliases: entry.aliases })),
    ],
    [monthInfo],
  );

  const trendData = useMemo(() => {
    const totals = monthInfo.map(entry => ({
      name: entry.label,
      value: rows.reduce((sum, row) => sum + fieldValue(row, entry.aliases), 0),
    }));
    return totals;
  }, [rows, monthInfo]);

  const currentMtd = useMemo(() => trendData.find(entry => entry.name.includes('Current MTD'))?.value ?? 0, [trendData]);
  const last3Average = useMemo(() => {
    const previous = trendData.slice(0, 3).map(entry => entry.value);
    return previous.length > 0 ? previous.reduce((sum, value) => sum + value, 0) / previous.length : 0;
  }, [trendData]);
  const avgMtd = useMemo(() => currentMtd - last3Average, [currentMtd, last3Average]);

  const priorityData = useMemo(() => PRIORITY_LEVELS.map(level => ({
    ...level,
    value: rows.reduce((sum, row) => sum + fieldValue(row, [level.key]), 0),
  })), [rows]);
  const totalPriority = useMemo(() => priorityData.reduce((sum, item) => sum + item.value, 0), [priorityData]);
  const priorityVisible = priorityData.filter(item => item.value > 0);
  const p7Share = useMemo(() => {
    const p7Value = priorityData.find(item => item.key === 'p7_count')?.value ?? 0;
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
      label: 'MTD vs 3-Month Avg',
      value: avgMtd,
      color: avgMtd < 0 ? '#D32F2F' : '#00C853',
      suffix: avgMtd < 0 ? 'below avg' : 'above avg',
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
      <div className="rounded-3xl border border-[#21264E]/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#245bc1]">Retailer Performance Report</p>
            <h1 className="mt-2 text-2xl font-bold text-[#21264E]">Monthly Trend & Priority Classification</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Monitoring current MTD performance against the rolling 3-month retailer average using zone coverage summary data.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
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

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        {summaryCards.map(card => (
          <div key={card.label} className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21264E]/70">{card.label}</p>
            <p className="mt-4 text-3xl font-bold text-[#21264E]">{card.value.toLocaleString()}</p>
            {card.suffix && <p className="mt-2 text-sm text-slate-500">{card.suffix}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
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
            <h2 className="text-lg font-semibold text-[#21264E]">Priority Distribution</h2>
            <p className="text-sm text-slate-500">Priority status for the selected filter set.</p>
          </div>
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
                  {(priorityVisible.length > 0 ? priorityVisible : [{ name: 'No priority data', value: 1, color: '#CBD5E1' }]).map((entry, index) => (
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
          <div className="mt-4 grid gap-2">
            {priorityData.map(item => (
              <div key={item.key} className="flex items-center justify-between rounded-2xl bg-[#f8fafc] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span style={{ background: item.color }} className="inline-flex h-3 w-3 rounded-full" />
                  <div>
                    <p className="text-sm font-semibold text-[#21264E]">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-[#21264E]">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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

        {isZoneSelected ? (
          <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[#21264E]">Retailer Coverage Details</h2>
              <p className="text-sm text-slate-500">Retailer details allocated to the selected zone.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Retailer ID</th>
                    {retailerTableColumns.map(column => (
                      <th key={column.key} className="px-4 py-3 font-semibold">{column.label}</th>
                    ))}
                    <th className="px-4 py-3 font-semibold">Avg MTD</th>
                    <th className="px-4 py-3 font-semibold">Priority Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {retailerRows.length > 0 ? (
                    retailerRows.map((row, index) => {
                      const priorityValue = String(row['p_level'] ?? row['priority_level'] ?? row['priority'] ?? row['P_LEVEL'] ?? '').trim();
                      const averageMtd = fieldValue(row, AVERAGE_MTD_ALIASES);

                      return (
                        <tr key={`${row['retailer_id'] || row['id'] || index}-${index}`} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                            {String(row['retailer_id'] ?? row['id'] ?? row['retailer'] ?? '—')}
                          </td>
                          {retailerTableColumns.map(column => (
                            <td key={column.key} className="px-4 py-3 text-slate-700">
                              {fieldValue(row, column.aliases).toLocaleString()}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-slate-700">{averageMtd.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white"
                              style={{ backgroundColor: getPriorityColor(priorityValue) }}
                            >
                              {priorityValue || 'Unknown'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={retailerTableColumns.length + 3} className="px-4 py-6 text-center text-sm text-slate-500">
                        No retailer coverage details found for this zone.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[#21264E]">Priority Guide</h2>
              <p className="text-sm text-slate-500">Instantly identify risk categories and recommended action for retailers.</p>
            </div>
            <div className="space-y-3">
              {PRIORITY_LEVELS.map(level => (
                <div key={level.key} className="rounded-2xl border border-[#E2E8F0] bg-[#fff7f2] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span style={{ background: level.color }} className="inline-flex h-3 w-3 rounded-full" />
                      <p className="font-semibold text-[#21264E]">{level.name}</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{priorityData.find(item => item.key === level.key)?.value?.toLocaleString() ?? '0'}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{level.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
