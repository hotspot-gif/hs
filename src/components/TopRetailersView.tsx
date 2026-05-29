import { useMemo } from 'react';
import { RetailerSummary, RetailerMonthly } from '@/types';
import { TrendingUp, DollarSign, PhoneForwarded, Activity, Calendar } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_COLORS: Record<string, string> = {
  '2024': '#245bc1',
  '2025': '#08dc7d',
  '2026': '#FFDD64',
  '2023': '#ffc8b2',
  '2022': '#46286E'
};

interface TopRetailersViewProps {
  retailers: RetailerSummary[];
  branch: string;
  loading: boolean;
  branchMonthlyData?: RetailerMonthly[];
  yearlyZoneData?: any[];
  selectedZone?: string;
}

export default function TopRetailersView({ retailers, branch, loading, branchMonthlyData, yearlyZoneData, selectedZone }: TopRetailersViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-[#21264E]">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading retailers data...
        </div>
      </div>
    );
  }

  if (!retailers || retailers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500">No retailers available in {branch}</p>
        </div>
      </div>
    );
  }

  // Get top retailers by different criteria, excluding those with 0 for the metric
  const topByGA = [...retailers]
    .filter(r => r.ga_cnt > 0)
    .sort((a, b) => b.ga_cnt - a.ga_cnt)
    .slice(0, 5);

  const topByPortIn = [...retailers]
    .filter(r => r.port_in > 0)
    .sort((a, b) => b.port_in - a.port_in)
    .slice(0, 5);

  const topByIncentive = [...retailers]
    .filter(r => r.incentive > 0)
    .sort((a, b) => b.incentive - a.incentive)
    .slice(0, 5);

  const topByRenewalRate = [...retailers]
    .filter(r => r.renewal_rate > 0)
    .sort((a, b) => b.renewal_rate - a.renewal_rate)
    .slice(0, 5);

  // Chart data - use full retailer_id for name to avoid incomplete labels
  const gaChartData = topByGA.map(r => ({ name: r.retailer_id, value: r.ga_cnt, zone: r.zone }));
  const portInChartData = topByPortIn.map(r => ({ name: r.retailer_id, value: r.port_in, zone: r.zone }));
  const incentiveChartData = topByIncentive.map(r => ({ name: r.retailer_id, value: Math.round(r.incentive), zone: r.zone }));
  const renewalChartData = topByRenewalRate.map(r => ({ name: r.retailer_id, value: parseFloat(r.renewal_rate.toFixed(1)), zone: r.zone }));

  const FullRetailerTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0].payload;
    return (
      <div className="bg-[#21264E] text-white text-[10px] p-2 rounded shadow-lg border border-white/10 min-w-[120px]">
        <p className="font-bold border-b border-white/10 pb-1 mb-1">{data.name}</p>
        <div className="flex justify-between gap-4">
          <span className="opacity-70">Zone:</span>
          <span>{data.zone}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="opacity-70">Value:</span>
          <span className="font-bold text-[#08DC7D]">
            {payload[0].value?.toLocaleString('en-IE')}{label?.includes('%') || payload[0].unit === '%' ? '%' : ''}
          </span>
        </div>
      </div>
    );
  };

  const filteredRetailers = selectedZone ? retailers.filter(r => r.zone === selectedZone) : retailers;
  const zoneRetailerIds = new Set(filteredRetailers.map(r => r.retailer_id));

  // 1. Basic Helpers & Data Extraction
  const val = (r: any, keys: string[]) => {
    if (!r) return 0;
    for (const key of keys) {
      if (r[key] !== undefined && r[key] !== null) return Number(r[key]);
    }
    return 0;
  };

  const hasAggregatedData = !!(yearlyZoneData && yearlyZoneData.length > 0);

  const years = useMemo(() => {
    if (!hasAggregatedData || !yearlyZoneData) return [];
    return [...new Set(yearlyZoneData.map(r => r.month.split('-')[0]))].sort();
  }, [hasAggregatedData, yearlyZoneData]);

  const activeMonthsCount = useMemo(() => {
    if (hasAggregatedData && yearlyZoneData) {
      return [...new Set(yearlyZoneData.map(r => r.month))].length;
    }
    return 1; // Avoid division by zero
  }, [hasAggregatedData, yearlyZoneData]);

  // 2. Aggregated Monthly Data (for trends)
  const aggregatedMonthly = useMemo(() => {
    if (hasAggregatedData && yearlyZoneData) {
      const grouped = yearlyZoneData.reduce((acc, r) => {
        const m = r.month;
        if (!acc[m]) acc[m] = { month: m, ga_cnt: 0, port_in: 0 };
        acc[m].ga_cnt += val(r, ['ga_cnt', 'ga', 'total_ga']);
        acc[m].port_in += val(r, ['port_in', 'total_port_in', 'pi']);
        return acc;
      }, {} as Record<string, { month: string; ga_cnt: number; port_in: number }>);

      return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month));
    }
    
    const branchMonthly = (branchMonthlyData || [])
      .filter(m => !selectedZone || zoneRetailerIds.has(m.retailer_id))
      .reduce((acc, m) => {
        const key = m.month;
        if (!acc[key]) acc[key] = { month: key, ga_cnt: 0, port_in: 0, count: 0 };
        acc[key].ga_cnt += m.ga_cnt;
        acc[key].port_in += m.port_in;
        acc[key].count += 1;
        return acc;
      }, {} as Record<string, { month: string; ga_cnt: number; port_in: number; count: number }>);

    return Object.values(branchMonthly).sort((a, b) => a.month.localeCompare(b.month));
  }, [yearlyZoneData, branchMonthlyData, selectedZone, zoneRetailerIds, hasAggregatedData]);

  // 3. Performance Metrics
  const totalGA = hasAggregatedData && yearlyZoneData
    ? yearlyZoneData.reduce((sum, r) => sum + val(r, ['ga_cnt', 'ga', 'total_ga']), 0)
    : retailers.reduce((sum, r) => sum + r.ga_cnt, 0);

  const totalIncentive = hasAggregatedData && yearlyZoneData
    ? yearlyZoneData.reduce((sum, r) => sum + val(r, ['incentive', 'total_incentive', 'inc']), 0)
    : retailers.reduce((sum, r) => sum + r.incentive, 0);

  const totalPortIn = hasAggregatedData && yearlyZoneData
    ? yearlyZoneData.reduce((sum, r) => sum + val(r, ['port_in', 'total_port_in', 'pi']), 0)
    : retailers.reduce((sum, r) => sum + r.port_in, 0);

  const totalDeductions = hasAggregatedData && yearlyZoneData
    ? yearlyZoneData.reduce((sum, r) => sum + val(r, ['total_deductions', 'total_ded', 'deductions']), 0)
    : retailers.reduce((sum, r) => sum + r.total_deductions, 0);

const avgRenewalRate = hasAggregatedData && yearlyZoneData
  ? (yearlyZoneData.filter(r => val(r, ['renewal_rate', 'avg_renewal_rate', 'rr']) > 0)
      .reduce((sum, r) => sum + val(r, ['renewal_rate', 'avg_renewal_rate', 'rr']), 0) /
      Math.max(yearlyZoneData.filter(r => val(r, ['renewal_rate', 'avg_renewal_rate', 'rr']) > 0).length, 1))
  : (retailers.filter(r => !r.zone.toLowerCase().includes('shop closed') && r.renewal_rate > 0).length > 0
      ? retailers.filter(r => !r.zone.toLowerCase().includes('shop closed') && r.renewal_rate > 0)
          .reduce((sum, r) => sum + r.renewal_rate, 0) /
          retailers.filter(r => !r.zone.toLowerCase().includes('shop closed') && r.renewal_rate > 0).length
      : 0);

  // 4. Analysis Hooks
  const yearlyAnalysis = useMemo(() => {
    if (!hasAggregatedData || !yearlyZoneData || years.length === 0) return [];
    return years.map(yr => {
      const yearRecords = yearlyZoneData.filter(r => r.month.startsWith(yr));
      const monthCount = [...new Set(yearRecords.map(r => r.month))].length;
      const ga = yearRecords.reduce((s, r) => s + val(r, ['ga_cnt', 'ga', 'total_ga']), 0);
      const pi = yearRecords.reduce((s, r) => s + val(r, ['port_in', 'total_port_in', 'pi']), 0);
      const inc = yearRecords.reduce((s, r) => s + val(r, ['incentive', 'total_incentive', 'inc']), 0);
      
      return {
        year: yr,
        monthCount,
        ga,
        pi,
        inc,
        avgGa: monthCount > 0 ? ga / monthCount : 0,
        avgPi: monthCount > 0 ? pi / monthCount : 0,
        avgInc: monthCount > 0 ? inc / monthCount : 0
      };
    }).reverse();
  }, [years, yearlyZoneData, hasAggregatedData]);

  const latestMetrics = useMemo(() => {
    if (aggregatedMonthly.length === 0) return { month: 'N/A', ga: 0, pi: 0, inc: 0 };
    const latest = aggregatedMonthly[aggregatedMonthly.length - 1];
    
    const monthInc = hasAggregatedData && yearlyZoneData
      ? yearlyZoneData
          .filter(r => r.month === latest.month)
          .reduce((s, r) => s + val(r, ['incentive', 'total_incentive', 'inc']), 0)
      : 0;

    return {
      month: latest.month,
      ga: latest.ga_cnt,
      pi: latest.port_in,
      inc: monthInc
    };
  }, [aggregatedMonthly, yearlyZoneData, hasAggregatedData]);

  const overlayData = useMemo(() => {
    if (!hasAggregatedData || !yearlyZoneData || years.length === 0) return [];
    return MONTH_NAMES.map((name, idx) => {
      const monthNum = String(idx + 1).padStart(2, '0');
      const point: any = { month: name };
      years.forEach(yr => {
        const records = yearlyZoneData.filter(r => r.month === `${yr}-${monthNum}`);
        if (records.length > 0) {
          point[`ga_${yr}`] = records.reduce((s, r) => s + val(r, ['ga_cnt', 'ga', 'total_ga']), 0);
          point[`port_in_${yr}`] = records.reduce((s, r) => s + val(r, ['port_in', 'total_port_in', 'pi']), 0);
        }
      });
      return point;
    });
  }, [years, yearlyZoneData, hasAggregatedData]);

  const activeRetailersCount = useMemo(() => {
    if (hasAggregatedData && yearlyZoneData) {
      const availableMonths = [...new Set(yearlyZoneData.map(r => r.month))].sort((a, b) => a.localeCompare(b));
      if (availableMonths.length === 0) return 0;
      const latestMonth = availableMonths[availableMonths.length - 1];
      return yearlyZoneData
        .filter(r => r.month === latestMonth && !String(r.zone || '').toLowerCase().includes('shop closed'))
        .reduce((sum, r) => sum + val(r, ['retailer_count', 'active_retailers', 'count', 'active_count', 'retailers', 'retailer_cnt', 'total_active']), 0);
    }
    return retailers.filter(r => !r.zone.toLowerCase().includes('shop closed')).length;
  }, [hasAggregatedData, yearlyZoneData, retailers]);

  const displayedRetailersCount = useMemo(() => {
    if (hasAggregatedData && yearlyZoneData) {
       const availableMonths = [...new Set(yearlyZoneData.map(r => r.month))].sort((a, b) => a.localeCompare(b));
       if (availableMonths.length === 0) return 0;
       const latestMonth = availableMonths[availableMonths.length - 1];
       return yearlyZoneData
        .filter(r => r.month === latestMonth)
        .reduce((sum, r) => sum + val(r, ['retailer_count', 'active_retailers', 'total_retailers', 'count', 'retailers', 'retailer_cnt']), 0);
    }
    return retailers.length;
  }, [hasAggregatedData, yearlyZoneData, retailers]);

  const COLORS = ['#245bc1', '#08dc7d', '#ffc8b2', '#FFDD64', '#00D7FF', '#46286E'];

  const StatCard = ({ 
    icon: Icon, 
    title, 
    retailers: data, 
    formatter 
  }: { 
    icon: any; 
    title: string; 
    retailers: RetailerSummary[]; 
    formatter: (v: number) => string;
  }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={18} className="text-[#245bc1]" />
        <h3 className="font-semibold text-sm text-[#21264E]">{title}</h3>
      </div>
      <div className="space-y-2">
        {data.length > 0 ? (
          data.map((r, idx) => (
            <div key={r.retailer_id} className="flex items-center justify-between pb-2 border-b border-gray-100 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{backgroundColor: COLORS[idx], color: idx < 2 ? 'white' : 'black'}}>
                  #{idx + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-[#21264E]" title={r.retailer_id}>{r.retailer_id}</p>
                  <p className="text-xs text-gray-500">{r.zone}</p>
                  <p className={`text-[10px] font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded ${r.zone.toLowerCase().includes('shop closed') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {r.zone.toLowerCase().includes('shop closed') ? 'Inactive' : 'Active'}
                  </p>
                </div>
              </div>
              <p className="text-xs font-semibold text-[#245bc1]">{formatter(
                title.includes('GA') ? r.ga_cnt :
                title.includes('Port-In') ? r.port_in :
                title.includes('Paid') ? r.incentive :
                r.renewal_rate
              )}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-500">No data available</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 overflow-y-auto bg-[#fff7f2]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#21264E] mb-2">Retailer Performance Overview</h1>

        {yearlyAnalysis.length > 0 && (
          <div className="mt-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-[#245bc1]" />
              <p className="text-sm font-bold text-[#21264E]">Yearly Summary Analysis</p>
            </div>
            <div className="space-y-4">
              {yearlyAnalysis.map(ya => (
                <div key={ya.year} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 p-3 bg-[#fff7f2] rounded-lg border border-[#245bc1]/10">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{ya.year} Totals</span>
                    <span className="text-sm font-bold text-[#21264E]">{ya.monthCount} Months</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">GA</span>
                    <span className="text-sm font-bold text-[#245bc1]">{ya.ga.toLocaleString('en-IE')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Port-In</span>
                    <span className="text-sm font-bold text-[#06b6d4]">{ya.pi.toLocaleString('en-IE')}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Incentive</span>
                    <span className="text-sm font-bold text-[#08DC7D]">€{ya.inc.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex flex-col border-l border-gray-200 pl-4">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Avg GA/mo</span>
                    <span className="text-sm font-bold text-[#245bc1]">{ya.avgGa.toFixed(0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Avg PI/mo</span>
                    <span className="text-sm font-bold text-[#06b6d4]">{ya.avgPi.toFixed(0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-gray-500 uppercase font-medium">Avg Inc/mo</span>
                    <span className="text-sm font-bold text-[#08DC7D]">€{ya.avgInc.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Latest Metrics Row */}
        {latestMetrics.month !== 'N/A' && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Latest GA ({latestMetrics.month})</p>
                <p className="text-2xl font-black text-[#245bc1]">{latestMetrics.ga.toLocaleString('en-IE')}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#245bc1]/10 flex items-center justify-center text-[#245bc1]">
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Latest Port-In ({latestMetrics.month})</p>
                <p className="text-2xl font-black text-[#06b6d4]">{latestMetrics.pi.toLocaleString('en-IE')}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#06b6d4]/10 flex items-center justify-center text-[#06b6d4]">
                <PhoneForwarded size={20} />
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Latest Incentive ({latestMetrics.month})</p>
                <p className="text-2xl font-black text-[#08DC7D]">€{latestMetrics.inc.toLocaleString('en-IE', { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[#08DC7D]/10 flex items-center justify-center text-[#08DC7D]">
                <DollarSign size={20} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Total Incentive', value: `€${totalIncentive.toLocaleString('en-IE', { maximumFractionDigits: 0 })}`, color: '#006AE0', avg: `€${(totalIncentive / activeMonthsCount).toLocaleString('en-IE', { maximumFractionDigits: 0 })}/mo` },
          { label: 'Total GA Activations', value: totalGA.toLocaleString('en-IE'), color: '#08DC7D', avg: `${(totalGA / activeMonthsCount).toFixed(0)}/mo` },
          { label: 'Total Port-In', value: totalPortIn.toLocaleString('en-IE'), color: '#00D7FF', avg: `${(totalPortIn / activeMonthsCount).toFixed(0)}/mo` },
          { label: 'Avg Renewal Rate', value: `${avgRenewalRate.toFixed(1)}%`, color: '#FFD54F' },
          { label: 'Total Deductions', value: `€${totalDeductions.toLocaleString('en-IE', { maximumFractionDigits: 0 })}`, color: '#F04438', avg: `€${(totalDeductions / activeMonthsCount).toLocaleString('en-IE', { maximumFractionDigits: 0 })}/mo` },
          { label: 'Active Retailers', value: activeRetailersCount.toString(), color: '#08DC7D' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: kpi.color }} />
            <div>
              <p className="text-[10px] text-gray-500 mb-1 pl-2 font-medium uppercase tracking-wider">{kpi.label}</p>
              <p className="text-lg font-bold pl-2 truncate" style={{ color: '#21264E' }}>{kpi.value}</p>
            </div>
            {kpi.avg && (
              <p className="text-[9px] text-gray-400 pl-2 mt-2 font-medium">Avg: {kpi.avg}</p>
            )}
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* GA Activations Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-[#245bc1]" />
            <h3 className="font-semibold text-[#21264E]">Top GA Activations</h3>
          </div>
          {gaChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={gaChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  fontSize={10} 
                  tick={{ fill: '#6b7280' }}
                  tickFormatter={(value) => value.length > 8 ? `...${value.slice(-6)}` : value}
                />
                <YAxis fontSize={10} tick={{ fill: '#6b7280' }} />
                <Tooltip content={<FullRetailerTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="value" fill="#245bc1" radius={[4, 4, 0, 0]} barSize={30}>
                  {gaChartData.map((entry, idx) => (
                    <Cell key={`cell-ga-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">No data</div>
          )}
        </div>

        {/* Port-In Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <PhoneForwarded size={18} className="text-[#245bc1]" />
            <h3 className="font-semibold text-[#21264E]">Top Port-In Activations</h3>
          </div>
          {portInChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={portInChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  fontSize={10} 
                  tick={{ fill: '#6b7280' }}
                  tickFormatter={(value) => value.length > 8 ? `...${value.slice(-6)}` : value}
                />
                <YAxis fontSize={10} tick={{ fill: '#6b7280' }} />
                <Tooltip content={<FullRetailerTooltip />} />
                <Line type="monotone" dataKey="value" stroke="#00D7FF" strokeWidth={3} dot={{ fill: '#00D7FF', r: 5, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">No data</div>
          )}
        </div>

        {/* Incentive Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={18} className="text-[#245bc1]" />
            <h3 className="font-semibold text-[#21264E]">Top Incentive Paid</h3>
          </div>
          {incentiveChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={incentiveChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name.length > 8 ? `...${name.slice(-6)}` : name}: €${value.toLocaleString('en-IE')}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {incentiveChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<FullRetailerTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">No data</div>
          )}
        </div>

        {/* Renewal Rate Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-[#245bc1]" />
            <h3 className="font-semibold text-[#21264E]">Best Renewal Rate</h3>
          </div>
          {renewalChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={renewalChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  fontSize={10} 
                  tick={{ fill: '#6b7280' }}
                  tickFormatter={(value) => value.length > 8 ? `...${value.slice(-6)}` : value}
                />
                <YAxis fontSize={10} tick={{ fill: '#6b7280' }} label={{ value: '%', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280', fontSize: 10 } }} />
                <Tooltip content={<FullRetailerTooltip />} cursor={{ fill: '#f3f4f6' }} />
                <Bar dataKey="value" fill="#08dc7d" radius={[4, 4, 0, 0]} barSize={30} unit="%" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500">No data</div>
          )}
        </div>
      </div>

      {overlayData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={18} className="text-[#245bc1]" />
              <h3 className="font-semibold text-[#21264E]">GA Trend - Year Overlay</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={overlayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value) => value.toLocaleString('en-IE')} />
                <Legend />
                {years.map(yr => (
                  <Line 
                    key={`ga_${yr}`} 
                    type="monotone" 
                    dataKey={`ga_${yr}`} 
                    name={`GA ${yr}`} 
                    stroke={YEAR_COLORS[yr] || '#245bc1'} 
                    strokeWidth={2} 
                    dot={{ fill: YEAR_COLORS[yr] || '#245bc1', r: 4 }} 
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <PhoneForwarded size={18} className="text-[#06b6d4]" />
              <h3 className="font-semibold text-[#21264E]">Port-In Trend - Year Overlay</h3>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={overlayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value) => value.toLocaleString('en-IE')} />
                <Legend />
                {years.map(yr => (
                  <Line 
                    key={`pi_${yr}`} 
                    type="monotone" 
                    dataKey={`port_in_${yr}`} 
                    name={`Port-In ${yr}`} 
                    stroke={YEAR_COLORS[yr] || '#06b6d4'} 
                    strokeWidth={2} 
                    dot={{ fill: YEAR_COLORS[yr] || '#06b6d4', r: 4 }} 
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detailed Rankings */}
      <h2 className="text-xl font-bold text-[#21264E] mb-4">Detailed Rankings</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard
          icon={TrendingUp}
          title="Top GA Activations"
          retailers={topByGA}
          formatter={(v) => v.toLocaleString('en-IE')}
        />
        <StatCard
          icon={PhoneForwarded}
          title="Top Port-In Activations"
          retailers={topByPortIn}
          formatter={(v) => v.toLocaleString('en-IE')}
        />
        <StatCard
          icon={DollarSign}
          title="Highest Paid (Incentive)"
          retailers={topByIncentive}
          formatter={(v) => `€${v.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <StatCard
          icon={Activity}
          title="Best Renewal Rate"
          retailers={topByRenewalRate}
          formatter={(v) => `${v.toFixed(1)}%`}
        />
      </div>
    </div>
  );
}
