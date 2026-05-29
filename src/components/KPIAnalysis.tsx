import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { KPIData, RpaUser } from '@/types';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Globe } from 'lucide-react';
import { NORTH_REGION, SOUTH_REGION, normalizeBranch } from '@/data/mockData';

interface KPIAnalysisProps {
  user?: RpaUser;
  branch: string;
  zone: string;
  region?: string;
}

interface ChartData {
  month: string;
  ga: number;
  ga_actual: number;
  ga_target: number;
  ga_shortfall: number;
  ga_over_achievement: number;
  uao: number;
  uao_target: number;
  na: number;
  na_target: number;
}

interface KPIMetrics {
  actual: number;
  target: number;
  average: number;
  highest: number;
  lowest: number;
  targetMet: number;
  targetNotMet: number;
  percentageChange: number;
}

export default function KPIAnalysis({ branch, zone, region }: KPIAnalysisProps) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [kpiMetrics, setKpiMetrics] = useState<{ ga: KPIMetrics; uao: KPIMetrics; na: KPIMetrics } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [previousYearData, setPreviousYearData] = useState<ChartData[]>([]);

  useEffect(() => {
    fetchKPIData();
  }, [branch, zone, region, selectedYear]);

  const fetchKPIData = async () => {
    setLoading(true);
    try {
      // Normalize inputs (branch and zone are optional filters)
      const normalizedBranch = branch?.trim() || '';
      const normalizedZone = zone?.trim() || '';
      const currentRegion = region || 'ITALY';

      console.log('Fetching KPI data for:', { normalizedBranch, normalizedZone, currentRegion, selectedYear });

      // Fetch all KPI data from the table
      const { data, error } = await supabase
        .from('kpi_data')
        .select('*')
        .order('year', { ascending: false })
        .order('month')
        .limit(10000);

      if (error) {
        console.error('Error fetching KPI data:', error);
        setLoading(false);
        return;
      }

      let kpiRecords = (data as KPIData[]) || [];
      
      // Filter records based on selected region/branch/zone (if provided)
      // Always exclude 'shop closed' zones
      kpiRecords = kpiRecords.filter(record => {
        const isInactiveZone = record.zone?.toLowerCase().includes('shop closed');
        if (isInactiveZone) return false;

        // 1. Region Filter
        if (currentRegion !== 'ITALY') {
          const regionBranches = currentRegion === 'NORTH' ? NORTH_REGION : SOUTH_REGION;
          const recordBranch = normalizeBranch(record.branch || '');
          if (!regionBranches.includes(recordBranch)) return false;
        }
        
        // 2. Branch Filter
        if (normalizedBranch) {
          const branchMatch = record.branch?.toLowerCase().trim() === normalizedBranch.toLowerCase().trim();
          if (!branchMatch) return false;
          
          // 3. Zone Filter
          if (normalizedZone) {
            const zoneMatch = record.zone?.toLowerCase().trim() === normalizedZone.toLowerCase().trim();
            if (!zoneMatch) return false;
          }
        }
        
        return true;
      });

      console.log('Filtered KPI records:', { 
        region: currentRegion,
        branch: normalizedBranch || 'All', 
        zone: normalizedZone || 'All', 
        recordsCount: kpiRecords.length,
        yearsFound: [...new Set(kpiRecords.map(r => Number(r.year)))]
      });

      // Get available years (ensure numeric type comparison) - sorted descending
      const years = [...new Set(kpiRecords.map(r => Number(r.year)))].sort((a, b) => b - a);
      setAvailableYears(years);

      // If no years available, show empty state
      if (years.length === 0) {
        console.warn('No KPI data found for:', { branch: normalizedBranch || 'All', zone: normalizedZone || 'All' });
        setChartData([]);
        setKpiMetrics(null);
        setPreviousYearData([]);
        setLoading(false);
        return;
      }

      // Use MAX year available by default (years[0] since sorted descending), or selected year if it exists in data
      const maxAvailableYear = years[0];
      const yearToDisplay = years.includes(selectedYear) ? selectedYear : maxAvailableYear;
      console.log('Year to display:', yearToDisplay, 'Available years:', years, 'Max year:', maxAvailableYear);

      // If the selected year is not in available years, update to the max year
      if (yearToDisplay !== selectedYear && !years.includes(selectedYear)) {
        setSelectedYear(yearToDisplay);
      }

      // Process current year data (ensure numeric year comparison)
      const currentYearData = kpiRecords
        .filter(r => Number(r.year) === yearToDisplay)
        .sort((a, b) => a.month.localeCompare(b.month));

      console.log('Current year records:', currentYearData.length);

      // If still no data for this year, exit early
      if (currentYearData.length === 0) {
        console.warn('No records for year:', yearToDisplay);
        setChartData([]);
        setKpiMetrics(null);
        setPreviousYearData([]);
        setLoading(false);
        return;
      }

      // Aggregate data by month (sum all zones if no zone is selected)
      const monthlyAggregation = new Map<string, any>();
      
      currentYearData.forEach(item => {
        const existingMonth = monthlyAggregation.get(item.month);
        
        if (existingMonth) {
          // Sum the values if this month already exists
          existingMonth.ga += item.ga;
          existingMonth.ga_target += item.ga_target;
          existingMonth.uao += item.uao;
          existingMonth.uao_target += item.uao_target;
          existingMonth.na += item.na;
          existingMonth.na_target += item.na_target;
          existingMonth.count += 1;
        } else {
          // First occurrence of this month
          monthlyAggregation.set(item.month, {
            month: item.month,
            ga: item.ga,
            ga_target: item.ga_target,
            uao: item.uao,
            uao_target: item.uao_target,
            na: item.na,
            na_target: item.na_target,
            count: 1,
          });
        }
      });

      const processedData = Array.from(monthlyAggregation.values()).map(item => {
        // Calculate over-achievement (green) - only when actual > target
        const gaOverAchievement = item.ga > item.ga_target ? item.ga - item.ga_target : 0;
        
        // Calculate shortfall (red) - only when actual < target
        const gaShortfall = item.ga < item.ga_target ? item.ga_target - item.ga : 0;
        
        // Blue bar = Actual - Over-Achievement (shows base portion in stack)
        const gaBaseActual = item.ga - gaOverAchievement;

        return {
          month: new Date(`${item.month}-01`).toLocaleDateString('en-US', { month: 'short' }),
          ga: gaBaseActual,
          ga_actual: item.ga,
          ga_target: item.ga_target,
          ga_shortfall: gaShortfall,
          ga_over_achievement: gaOverAchievement,
          ga_completion: item.ga_target > 0 ? (item.ga / item.ga_target) * 100 : 0,
          uao: item.uao,
          uao_target: item.uao_target,
          uao_completion: item.uao_target > 0 ? (item.uao / item.uao_target) * 100 : 0,
          na: item.na,
          na_target: item.na_target,
          na_completion: item.na_target > 0 ? (item.na / item.na_target) * 100 : 0,
        };
      });

      setChartData(processedData);

      // Convert aggregated data back to KPIData format for metrics calculation (one record per month)
      const aggregatedForMetrics = Array.from(monthlyAggregation.values());

      // Process previous year data for comparison (ensure numeric year comparison)
      if (yearToDisplay > Math.min(...years)) {
        const prevYearRecords = kpiRecords
          .filter(r => Number(r.year) === yearToDisplay - 1)
          .sort((a, b) => a.month.localeCompare(b.month));

        // Aggregate previous year data by month as well
        const prevMonthlyAggregation = new Map<string, any>();
        
        prevYearRecords.forEach(item => {
          const existingMonth = prevMonthlyAggregation.get(item.month);
          
          if (existingMonth) {
            existingMonth.ga += item.ga;
            existingMonth.ga_target += item.ga_target;
            existingMonth.uao += item.uao;
            existingMonth.uao_target += item.uao_target;
            existingMonth.na += item.na;
            existingMonth.na_target += item.na_target;
          } else {
            prevMonthlyAggregation.set(item.month, {
              month: item.month,
              ga: item.ga,
              ga_target: item.ga_target,
              uao: item.uao,
              uao_target: item.uao_target,
              na: item.na,
              na_target: item.na_target,
            });
          }
        });

        const prevYearData = Array.from(prevMonthlyAggregation.values()).map(item => ({
          month: new Date(`${item.month}-01`).toLocaleDateString('en-US', { month: 'short' }),
          ga: item.ga,
          ga_actual: item.ga,
          ga_target: item.ga_target,
          ga_shortfall: 0,
          ga_over_achievement: 0,
          uao: item.uao,
          uao_target: item.uao_target,
          na: item.na,
          na_target: item.na_target,
        }));

        setPreviousYearData(prevYearData);
      }

      // Calculate metrics using aggregated data (one record per month, not per zone)
      calculateMetrics(aggregatedForMetrics);
    } catch (err) {
      console.error('Error in fetchKPIData:', err);
    }
    setLoading(false);
  };

  const calculateMetrics = (records: KPIData[]) => {
    if (records.length === 0) {
      setKpiMetrics(null);
      return;
    }

    const metrics: { ga: KPIMetrics; uao: KPIMetrics; na: KPIMetrics } = {
      ga: calculateKPIMetric(records.map(r => ({ actual: r.ga, target: r.ga_target }))),
      uao: calculateKPIMetric(records.map(r => ({ actual: r.uao, target: r.uao_target }))),
      na: calculateKPIMetric(records.map(r => ({ actual: r.na, target: r.na_target }))),
    };

    setKpiMetrics(metrics);
  };

  const calculateKPIMetric = (data: Array<{ actual: number; target: number }>): KPIMetrics => {
    const actuals = data.map(d => d.actual);
    const targets = data.map(d => d.target);
    const totalActual = actuals.reduce((a, b) => a + b, 0);
    const totalTarget = targets.reduce((a, b) => a + b, 0);

    const targetMet = data.filter(d => d.actual >= d.target).length;
    const targetNotMet = data.filter(d => d.actual < d.target).length;

    return {
      actual: totalActual,
      target: totalTarget,
      average: totalActual / data.length,
      highest: Math.max(...actuals),
      lowest: Math.min(...actuals),
      targetMet,
      targetNotMet,
      percentageChange: totalTarget > 0 ? ((totalActual - totalTarget) / totalTarget) * 100 : 0,
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-[#21264E]">
          <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading KPI data...
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center text-gray-500 max-w-md">
          <TrendingUp size={40} className="mx-auto mb-4 opacity-20" />
          <p className="font-medium mb-2">No KPI data available</p>
          <p className="text-sm text-gray-400 mb-3">
            {branch ? `Branch: ${branch}` : 'All Branches'}
            {zone && `, Zone: ${zone}`}
          </p>
          {availableYears.length > 0 && (
            <p className="text-xs text-gray-400">Available years: {availableYears.join(', ')}</p>
          )}
          {availableYears.length === 0 && (
            <p className="text-xs text-red-400">No data found in database for this selection</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gradient-to-br from-[#fff7f2] to-white min-h-[calc(100vh-120px)]">
      {/* Year filter */}
      <div className="mb-6 flex items-center gap-2 md:gap-4">
        <Calendar size={20} className="text-[#21264E]" />
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(parseInt(e.target.value))}
          className="px-3 py-2 md:px-4 md:py-2.5 border border-gray-200 rounded-lg text-sm md:text-base bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
        >
          {availableYears.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      {kpiMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
          {/* GA Card */}
          <KPICard
            title="GA - Gross Ads"
            actual={kpiMetrics.ga.actual}
            target={kpiMetrics.ga.target}
            average={kpiMetrics.ga.average}
            highest={kpiMetrics.ga.highest}
            lowest={kpiMetrics.ga.lowest}
            targetMet={kpiMetrics.ga.targetMet}
            targetNotMet={kpiMetrics.ga.targetNotMet}
            percentageChange={kpiMetrics.ga.percentageChange}
          />

          {/* UAO Card */}
          <KPICard
            title="UAO - Unique Active Outlets"
            actual={kpiMetrics.uao.actual}
            target={kpiMetrics.uao.target}
            average={kpiMetrics.uao.average}
            highest={kpiMetrics.uao.highest}
            lowest={kpiMetrics.uao.lowest}
            targetMet={kpiMetrics.uao.targetMet}
            targetNotMet={kpiMetrics.uao.targetNotMet}
            percentageChange={kpiMetrics.uao.percentageChange}
          />

          {/* NA Card */}
          <KPICard
            title="NA - New Outlets"
            actual={kpiMetrics.na.actual}
            target={kpiMetrics.na.target}
            average={kpiMetrics.na.average}
            highest={kpiMetrics.na.highest}
            lowest={kpiMetrics.na.lowest}
            targetMet={kpiMetrics.na.targetMet}
            targetNotMet={kpiMetrics.na.targetNotMet}
            percentageChange={kpiMetrics.na.percentageChange}
          />
        </div>
      )}

      {/* Charts Section */}
      <div className="space-y-4 md:space-y-6">
        {/* GA Chart - Full Width */}
        <ChartCard
          title="GA - Gross Ads"
          showTargets={true}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }} 
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#21264E', 
                  border: 'none', 
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}
                formatter={(value, name, props) => {
                  // Use real actual value for the 'Actual' label in GA chart
                  if (name === 'Actual' && props.payload?.ga_actual !== undefined) {
                    return [Math.round(props.payload.ga_actual * 100) / 100, 'Actual'];
                  }
                  
                  return [Math.round(value as number * 100) / 100, name];
                }}
              />
              <Legend formatter={(value) => <span className="font-bold text-[#21264E]">{value}</span>} />
              <Bar dataKey="ga" fill="#21264E" name="Actual" stackId="a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ga_shortfall" fill="#F04438" name="Shortfall" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="ga_over_achievement" fill="#08DC7D" name="Over-Achievement" stackId="a" radius={[0, 0, 0, 0]} />
              <Line 
                type="linear"
                dataKey="ga_target" 
                stroke="#FFD54F" 
                strokeWidth={2} 
                name="Target"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* UAO and NA Charts - 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* UAO Chart - Line with Markers */}
          <ChartCard
            title="UAO - Unique Active Outlets"
            showTargets={true}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }} 
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#21264E', 
                    border: 'none', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}
                  formatter={(value, name) => {
                    const nameMap: { [key: string]: string } = {
                      uao: 'Actual',
                      uao_target: 'Target'
                    };
                    return [Math.round(value as number * 100) / 100, nameMap[name] || name];
                  }}
                />
                <Legend formatter={(value) => <span className="font-bold text-[#21264E]">{value}</span>} />
                <Line 
                  type="linear"
                  dataKey="uao" 
                  stroke="#1080FD" 
                  strokeWidth={2}
                  name="Actual"
                  dot={{ fill: '#1080FD', r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="linear"
                  dataKey="uao_target" 
                  stroke="#FFD54F" 
                  strokeWidth={2}
                  name="Target"
                  dot={{ fill: '#FFD54F', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* NA Chart - Stacked Bar */}
          <ChartCard
            title="NA - New Outlets"
            showTargets={true}
          >
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }} 
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#21264E', 
                    border: 'none', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '12px' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}
                  formatter={(value, name) => {
                    const nameMap: { [key: string]: string } = {
                      na: 'Actual',
                      na_shortfall: 'Shortfall',
                      na_over_achievement: 'Over-Achievement',
                      na_target: 'Target'
                    };
                    return [Math.round(value as number * 100) / 100, nameMap[name] || name];
                  }}
                />
                <Legend formatter={(value) => <span className="font-bold text-[#21264E]">{value}</span>} />
                <Bar dataKey="na" fill="#46286E" name="Actual" stackId="a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="na_shortfall" fill="#F04438" name="Shortfall" stackId="a" radius={[0, 0, 0, 0]} legendType="none" />
                <Bar dataKey="na_over_achievement" fill="#08DC7D" name="Over-Achievement" stackId="a" radius={[0, 0, 0, 0]} legendType="none" />
                <Line 
                  type="linear"
                  dataKey="na_target" 
                  stroke="#FFD54F" 
                  strokeWidth={2} 
                  name="Target"
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Analysis Details */}
      {kpiMetrics && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnalysisCard
            title="GA Analysis"
            data={kpiMetrics.ga}
            color="bg-[#21264E]"
          />
          <AnalysisCard
            title="UAO Analysis"
            data={kpiMetrics.uao}
            color="bg-[#1080FD]"
          />
          <AnalysisCard
            title="NA Analysis"
            data={kpiMetrics.na}
            color="bg-[#46286E]"
          />
        </div>
      )}

      {/* Target Completion MoM Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <ChartCard title="GA Completion Rate MoM" showTargets={false}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 120]} />
              <Tooltip 
                  contentStyle={{ backgroundColor: '#21264E', border: 'none', borderRadius: '8px' }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                  formatter={(val: number) => [`${val.toFixed(1)}%`, 'Completion']}
                />
                <Legend formatter={(value) => <span className="font-bold text-[#21264E] text-[10px]">{value}</span>} />
                <ReferenceLine 
                  y={100} 
                  stroke="#F04438" 
                  strokeDasharray="3 3" 
                  label={{ value: '100%', position: 'right', fill: '#F04438', fontSize: 10, fontWeight: 'bold' }} 
                />
                <Bar 
                  dataKey="ga_completion" 
                  fill="#21264E" 
                  radius={[4, 4, 0, 0]}
                  name="GA Completion %"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
  
          <ChartCard title="UAO Completion Rate MoM" showTargets={false}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 120]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#21264E', border: 'none', borderRadius: '8px' }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                  formatter={(val: number) => [`${val.toFixed(1)}%`, 'Completion']}
                />
                <Legend formatter={(value) => <span className="font-bold text-[#21264E] text-[10px]">{value}</span>} />
                <ReferenceLine 
                  y={100} 
                  stroke="#F04438" 
                  strokeDasharray="3 3" 
                  label={{ value: '100%', position: 'right', fill: '#F04438', fontSize: 10, fontWeight: 'bold' }} 
                />
                <Bar 
                  dataKey="uao_completion" 
                  fill="#1080FD" 
                  radius={[4, 4, 0, 0]}
                  name="UAO Completion %"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
  
          <ChartCard title="NA Completion Rate MoM" showTargets={false}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 120]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#21264E', border: 'none', borderRadius: '8px' }}
                  itemStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                  labelStyle={{ color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
                  formatter={(val: number) => [`${val.toFixed(1)}%`, 'Completion']}
                />
                <Legend formatter={(value) => <span className="font-bold text-[#21264E] text-[10px]">{value}</span>} />
                <ReferenceLine 
                  y={100} 
                  stroke="#F04438" 
                  strokeDasharray="3 3" 
                  label={{ value: '100%', position: 'right', fill: '#F04438', fontSize: 10, fontWeight: 'bold' }} 
                />
                <Bar 
                  dataKey="na_completion" 
                  fill="#46286E" 
                  radius={[4, 4, 0, 0]}
                  name="NA Completion %"
                />
             </BarChart>
           </ResponsiveContainer>
         </ChartCard>
       </div>
     </div>
  );
}

function KPICard({
  title,
  actual,
  target,
  average,
  highest,
  lowest,
  targetMet,
  targetNotMet,
  percentageChange,
}: {
  title: string;
  actual: number;
  target: number;
  average: number;
  highest: number;
  lowest: number;
  targetMet: number;
  targetNotMet: number;
  percentageChange: number;
}) {
  const achievedPercentage = target > 0 ? (actual / target) * 100 : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <h3 className="text-xs md:text-sm font-semibold text-[#21264E] mb-3">{title}</h3>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Actual</span>
          <span className="font-bold text-sm text-[#21264E]">{actual.toFixed(0)}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">Target</span>
          <span className="font-bold text-sm text-gray-600">{target.toFixed(0)}</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full ${
                achievedPercentage >= 75 ? 'bg-[#08DC7D]' :
                achievedPercentage >= 50 ? 'bg-[#FFD54F]' : 'bg-[#F04438]'
              }`}
              style={{ width: `${Math.min(achievedPercentage, 100)}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {achievedPercentage.toFixed(0)}% of target
          </div>
        </div>

        <div className="border-t border-gray-100 pt-2 mt-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500 block">Avg</span>
              <span className="font-semibold text-[#21264E]">{average.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-gray-500 block">High/Low</span>
              <span className="font-semibold text-[#21264E]">{highest.toFixed(0)}/{lowest.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  showTargets,
}: {
  title: string;
  children: React.ReactNode;
  showTargets: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 md:p-6">
      <h3 className="text-sm md:text-base font-semibold text-[#21264E] mb-4 flex items-center gap-2">
        <TrendingUp size={16} className="text-[#245bc1]" />
        {title}
      </h3>
      <div className="w-full overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

function AnalysisCard({
  title,
  data,
  color,
}: {
  title: string;
  data: KPIMetrics;
  color: string;
}) {
  const achievedPercentage = data.target > 0 ? (data.actual / data.target) * 100 : 0;
  const isPositive = data.percentageChange >= 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`${color} w-3 h-8 rounded`}></div>
        <h3 className="text-sm md:text-base font-semibold text-[#21264E]">{title}</h3>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-500">Achievement</span>
            <span className="text-sm font-bold text-[#21264E]">{achievedPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-full rounded-full ${
                achievedPercentage >= 75 ? 'bg-[#08DC7D]' :
                achievedPercentage >= 50 ? 'bg-[#FFD54F]' : 'bg-[#F04438]'
              }`}
              style={{ width: `${Math.min(achievedPercentage, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500 block">Average</span>
            <span className="font-semibold text-[#21264E]">{data.average.toFixed(1)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Highest</span>
            <span className="font-semibold text-[#21264E]">{data.highest.toFixed(0)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500 block">Lowest</span>
            <span className="font-semibold text-[#21264E]">{data.lowest.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Target Met</span>
            <span className="font-semibold text-green-600">{data.targetMet}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPositive ? (
            <TrendingUp size={16} className="text-green-500" />
          ) : (
            <TrendingDown size={16} className="text-red-500" />
          )}
          <span className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{data.percentageChange.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-500">vs Target</span>
        </div>
      </div>
    </div>
  );
}
