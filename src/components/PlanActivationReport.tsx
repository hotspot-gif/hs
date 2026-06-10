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

interface PlanActivationReportProps {
  user: RpaUser;
  region: string;
  branch: string;
  zone: string;
}

interface PlanData {
  zone: string;
  no_plan: number;
  plan_5_99: number;
  plan_6_99: number;
  plan_7_99: number;
  plan_9_99: number;
  plan_11_99: number;
  plan_14_99: number;
  group_a: number; // <= 6.99
  group_b: number; // > 6.99
  total: number;
}

interface RetailerPlanData {
  retailer_id: string;
  no_plan: number;
  plan_5_99: number;
  plan_6_99: number;
  plan_7_99: number;
  plan_9_99: number;
  plan_11_99: number;
  plan_14_99: number;
  group_a: number;
  group_b: number;
  total: number;
}

export default function PlanActivationReport({ region, branch, zone, user }: PlanActivationReportProps) {
  const [rows, setRows] = useState<PlanData[]>([]);
  const [retailerRows, setRetailerRows] = useState<RetailerPlanData[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof PlanData | keyof RetailerPlanData; direction: 'asc' | 'desc' } | null>({
    key: 'zone',
    direction: 'asc',
  });

  const isZoneSelected = Boolean(zone);

  useEffect(() => {
    setLoading(true);
    let query = supabase.from('zone_coverage_summary').select('*');

    if (region && region !== 'ITALY') {
      query = query.eq('region', region);
    }
    if (branch) {
      query = query.eq('branch', branch);
    }
    if (zone) {
      query = query.eq('zone', zone);
    }

    query.limit(5000).then(({ data, error }: { data: any[] | null; error: any }) => {
      if (error) {
        console.error('Plan activation fetch error:', error);
        setRows([]);
      } else {
        // Transform the data
        const transformed = (data || []).map((row: any) => {
          const no_plan = Number(row.no_plan || 0);
          const plan_5_99 = Number(row.plan_5_99 || 0);
          const plan_6_99 = Number(row.plan_6_99 || 0);
          const plan_7_99 = Number(row.plan_7_99 || 0);
          const plan_9_99 = Number(row.plan_9_99 || 0);
          const plan_11_99 = Number(row.plan_11_99 || 0);
          const plan_14_99 = Number(row.plan_14_99 || 0);
          
          const group_a = plan_5_99 + plan_6_99;
          const group_b = plan_7_99 + plan_9_99 + plan_11_99 + plan_14_99;
          const total = no_plan + group_a + group_b;

          return {
            zone: row.zone || '',
            no_plan,
            plan_5_99,
            plan_6_99,
            plan_7_99,
            plan_9_99,
            plan_11_99,
            plan_14_99,
            group_a,
            group_b,
            total,
          };
        });
        setRows(transformed);
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

      retailerQuery.limit(5000).then(({ data, error }: { data: any[] | null; error: any }) => {
        if (error) {
          console.error('Retailer plan fetch error:', error);
          setRetailerRows([]);
        } else {
          const transformed = (data || []).map((row: any) => {
            const no_plan = Number(row.no_plan || 0);
            const plan_5_99 = Number(row.plan_5_99 || 0);
            const plan_6_99 = Number(row.plan_6_99 || 0);
            const plan_7_99 = Number(row.plan_7_99 || 0);
            const plan_9_99 = Number(row.plan_9_99 || 0);
            const plan_11_99 = Number(row.plan_11_99 || 0);
            const plan_14_99 = Number(row.plan_14_99 || 0);
            
            const group_a = plan_5_99 + plan_6_99;
            const group_b = plan_7_99 + plan_9_99 + plan_11_99 + plan_14_99;
            const total = no_plan + group_a + group_b;

            return {
              retailer_id: row.retailer_id || '',
              no_plan,
              plan_5_99,
              plan_6_99,
              plan_7_99,
              plan_9_99,
              plan_11_99,
              plan_14_99,
              group_a,
              group_b,
              total,
            };
          });
          setRetailerRows(transformed);
        }
      });
    } else {
      setRetailerRows([]);
    }
  }, [region, branch, zone, isZoneSelected]);

  // Calculated totals
  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      return {
        total: acc.total + row.total,
        no_plan: acc.no_plan + row.no_plan,
        group_a: acc.group_a + row.group_a,
        group_b: acc.group_b + row.group_b,
        plan_5_99: acc.plan_5_99 + row.plan_5_99,
        plan_6_99: acc.plan_6_99 + row.plan_6_99,
        plan_7_99: acc.plan_7_99 + row.plan_7_99,
        plan_9_99: acc.plan_9_99 + row.plan_9_99,
        plan_11_99: acc.plan_11_99 + row.plan_11_99,
        plan_14_99: acc.plan_14_99 + row.plan_14_99,
      };
    }, {
      total: 0,
      no_plan: 0,
      group_a: 0,
      group_b: 0,
      plan_5_99: 0,
      plan_6_99: 0,
      plan_7_99: 0,
      plan_9_99: 0,
      plan_11_99: 0,
      plan_14_99: 0,
    });
  }, [rows]);

  // Find top plan
  const topPlan = useMemo(() => {
    const plans = [
      { name: '€5.99', value: totals.plan_5_99 },
      { name: '€6.99', value: totals.plan_6_99 },
      { name: '€7.99', value: totals.plan_7_99 },
      { name: '€9.99', value: totals.plan_9_99 },
      { name: '€11.99', value: totals.plan_11_99 },
      { name: '€14.99', value: totals.plan_14_99 },
    ];
    return plans.reduce((max, plan) => plan.value > max.value ? plan : max, plans[0]);
  }, [totals]);

  // Chart data
  const planDistributionChartData = useMemo(() => [
    { name: 'No Plan', value: totals.no_plan, color: '#FF0000' },
    { name: '€5.99', value: totals.plan_5_99, color: '#FFDD64' },
    { name: '€6.99', value: totals.plan_6_99, color: '#FFA500' },
    { name: '€7.99', value: totals.plan_7_99, color: '#08DC7D' },
    { name: '€9.99', value: totals.plan_9_99, color: '#00CED1' },
    { name: '€11.99', value: totals.plan_11_99, color: '#245BC1' },
    { name: '€14.99', value: totals.plan_14_99, color: '#46286E' },
  ], [totals]);

  const groupPieChartData = useMemo(() => [
    { name: 'Plan Less than €6.99', value: totals.group_a, color: '#08DC7D' },
    { name: 'Plans Greater than €6.99', value: totals.group_b, color: '#245BC1' },
  ], [totals]);

  const noPlanZoneChartData = useMemo(() => {
    return rows.map(row => ({
      zone: row.zone,
      no_plan: row.no_plan,
      with_plans: row.group_a + row.group_b,
    })).sort((a, b) => b.no_plan - a.no_plan).slice(0, 10);
  }, [rows]);

  const handleSort = (key: any) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const sortedRows = useMemo(() => {
    if (!sortConfig) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof PlanData];
      const bVal = b[sortConfig.key as keyof PlanData];
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortConfig.direction === 'asc' 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });
  }, [rows, sortConfig]);

  const sortedRetailerRows = useMemo(() => {
    if (!sortConfig) return retailerRows;
    return [...retailerRows].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof RetailerPlanData];
      const bVal = b[sortConfig.key as keyof RetailerPlanData];
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortConfig.direction === 'asc' 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });
  }, [retailerRows, sortConfig]);

  if (!loading && rows.length === 0) {
    return (
      <div className="flex min-h-[480px] items-center justify-center p-8">
        <div className="rounded-3xl border border-[#21264E]/10 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-[#21264E]">Plan Activation Report</h2>
          <p className="mt-3 text-sm text-slate-500">
            No data found for the selected Region / Branch / Zone filters.
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#245bc1]">Plan Activation Report</p>
            <h1 className="mt-2 text-2xl font-bold text-[#21264E]">Plan Distribution & Activation</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Overview of plan activation and distribution across zones.
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

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21264E]/70">Total Activations</p>
          <p className="mt-4 text-3xl font-bold text-[#21264E]">{(totals.group_a + totals.group_b).toLocaleString()}</p>
        </div>
        <div className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm" style={{ borderLeftColor: '#FF0000', borderLeftWidth: '4px' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21264E]/70">No Plan</p>
          <p className="mt-4 text-3xl font-bold text-[#21264E]">{totals.no_plan.toLocaleString()}</p>
        </div>
        <div className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm" style={{ borderLeftColor: '#08DC7D', borderLeftWidth: '4px' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21264E]/70">Plan Less than €6.99</p>
          <p className="mt-4 text-3xl font-bold text-[#21264E]">{totals.group_a.toLocaleString()}</p>
        </div>
        <div className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm" style={{ borderLeftColor: '#245BC1', borderLeftWidth: '4px' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21264E]/70">Plans Greater than €6.99</p>
          <p className="mt-4 text-3xl font-bold text-[#21264E]">{totals.group_b.toLocaleString()}</p>
        </div>
        <div className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm" style={{ borderLeftColor: '#245BC1', borderLeftWidth: '4px' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#21264E]/70">Top Plan</p>
          <p className="mt-4 text-3xl font-bold text-[#21264E]">{topPlan.name}</p>
          <p className="text-sm text-slate-500">{topPlan.value.toLocaleString()}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Plan Distribution Bar Chart */}
        <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#21264E]">Plan Distribution</h2>
            <p className="text-sm text-slate-500">Number of retailers per plan tier.</p>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planDistributionChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 12 }} />
                <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {planDistributionChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Group Pie Chart */}
        <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[#21264E]">Plan Less than €6.99 vs Greater than €6.99</h2>
            <p className="text-sm text-slate-500">Distribution of retailers by value group.</p>
          </div>
          <div className="relative h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={groupPieChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {groupPieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* No Plan by Zone - Only show if no zone selected */}
      {!isZoneSelected && (
        <div className="grid gap-4 grid-cols-1">
          <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[#21264E]">No Plan by Zone</h2>
              <p className="text-sm text-slate-500">Zones with the highest number of retailers without a plan (top 10).</p>
            </div>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={noPlanZoneChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }} stackOffset="expand">
                  <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                  <XAxis dataKey="zone" tick={{ fill: '#334155', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#334155', fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => value.toLocaleString()} />
                  <Legend />
                  <Bar dataKey="with_plans" name="With Plans" fill="#245BC1" stackId="a" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="no_plan" name="No Plans" fill="#FF0000" stackId="a" radius={[0, 0, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {/* Data Table */}
      <section className="rounded-3xl border border-[#21264E]/10 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[#21264E]">{isZoneSelected ? "Retailer-wise Breakdown" : "Zone-wise Breakdown"}</h2>
          <p className="text-sm text-slate-500">{isZoneSelected ? "Detailed plan activation data per retailer." : "Detailed plan activation data per zone."}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full divide-y divide-slate-200 text-left text-[10px] md:text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr className="divide-x divide-slate-200">
                {[
                  isZoneSelected ? { key: 'retailer_id', label: 'Retailer ID' } : { key: 'zone', label: 'Zone' },
                  { key: 'no_plan', label: 'No Plan' },
                  { key: 'plan_5_99', label: '€5.99' },
                  { key: 'plan_6_99', label: '€6.99' },
                  { key: 'plan_7_99', label: '€7.99' },
                  { key: 'plan_9_99', label: '€9.99' },
                  { key: 'plan_11_99', label: '€11.99' },
                  { key: 'plan_14_99', label: '€14.99' },
                  { key: 'group_a', label: 'Plan Less than €6.99' },
                  { key: 'group_b', label: 'Plans Greater than €6.99' },
                  { key: 'total', label: 'Total' },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="cursor-pointer px-1 py-2 md:px-4 md:py-3 font-semibold hover:bg-slate-100 text-center"
                    onClick={() => handleSort(col.key)}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{col.label}</span>
                      {sortConfig?.key === col.key && (
                        sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isZoneSelected ? (
                sortedRetailerRows.map((row, index) => (
                  <tr key={`${row.retailer_id}-${index}`} className="hover:bg-slate-50 divide-x divide-slate-100">
                    <td className="px-1 py-2 md:px-4 md:py-3 font-medium text-slate-900">{row.retailer_id}</td>
                    <td 
                      className="px-1 py-2 md:px-4 md:py-3 text-center"
                      style={{ backgroundColor: row.no_plan > 0 ? '#FFE4E1' : 'transparent' }}
                    >
                      {row.no_plan.toLocaleString()}
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_5_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_6_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_7_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_9_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_11_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_14_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.group_a.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.group_b.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center font-semibold">{row.total.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                sortedRows.map((row, index) => (
                  <tr key={`${row.zone}-${index}`} className="hover:bg-slate-50 divide-x divide-slate-100">
                    <td className="px-1 py-2 md:px-4 md:py-3 font-medium text-slate-900">{row.zone}</td>
                    <td 
                      className="px-1 py-2 md:px-4 md:py-3 text-center"
                      style={{ backgroundColor: row.no_plan > 0 ? '#FFE4E1' : 'transparent' }}
                    >
                      {row.no_plan.toLocaleString()}
                    </td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_5_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_6_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_7_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_9_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_11_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.plan_14_99.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.group_a.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center">{row.group_b.toLocaleString()}</td>
                    <td className="px-1 py-2 md:px-4 md:py-3 text-slate-700 text-center font-semibold">{row.total.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
