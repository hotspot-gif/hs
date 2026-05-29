import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, PieChart, Pie, Cell } from 'recharts';
import type { ZoneCoverageSummary } from '@/types';

interface BranchCoverageChartProps {
  zoneSummaries: ZoneCoverageSummary[];
  selectedBranch?: string;
  selectedZone?: string;
}

export default function BranchCoverageChart({ zoneSummaries, selectedBranch, selectedZone }: BranchCoverageChartProps) {
  const showZoneWise = Boolean(selectedBranch && selectedBranch !== 'ALL');
  const showZoneDonut = Boolean(selectedZone && selectedZone !== 'ALL');
  const chartData = useMemo(() => {
    const map = new Map<string, { covered: number; notCovered: number; uao: number }>();

    zoneSummaries.forEach(summary => {
      const key = showZoneWise ? summary.zone : summary.branch.replace('LMIT-HS-', '');
      if (!map.has(key)) {
        map.set(key, { covered: 0, notCovered: 0, uao: 0 });
      }
      const current = map.get(key)!;
      current.covered += summary.covered_retailers;
      current.notCovered += summary.not_covered_retailers;
      current.uao += summary.uao;
    });

    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      covered: data.covered,
      notCovered: data.notCovered,
      uao: data.uao,
    }));
  }, [zoneSummaries, showZoneWise]);

  const donutData = useMemo(() => {
    const totals = zoneSummaries.reduce(
      (acc, s) => ({
        covered: acc.covered + s.covered_retailers,
        notCovered: acc.notCovered + s.not_covered_retailers,
        uao: acc.uao + s.uao,
      }),
      { covered: 0, notCovered: 0, uao: 0 }
    );

    return [
      { name: 'Covered', value: totals.covered, color: '#08a35e' },
      { name: 'Not Covered', value: totals.notCovered, color: '#FFD54F' },
    ];
  }, [zoneSummaries]);

  const coveragePct = useMemo(() => {
    const covered = donutData.find(d => d.name === 'Covered')?.value || 0;
    const total = donutData.reduce((s, d) => s + d.value, 0);
    return total > 0 ? (covered / total) * 100 : 0;
  }, [donutData]);

  const uaoDonutData = useMemo(() => {
    const totals = zoneSummaries.reduce(
      (acc, s) => ({
        totalRetailers: acc.totalRetailers + s.total_retailers,
        uao: acc.uao + s.uao,
      }),
      { totalRetailers: 0, uao: 0 }
    );

    const nonUao = Math.max(0, totals.totalRetailers - totals.uao);
    return [
      { name: 'UAO', value: totals.uao, color: '#006ae0' },
      { name: 'Non-UAO', value: nonUao, color: '#E5E7EB' },
    ];
  }, [zoneSummaries]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-[#21264E] mb-4">
        {showZoneDonut ? 'Zone-wise Coverage' : showZoneWise ? 'Zone-wise Coverage' : 'Branch-wise Coverage'}
      </h3>
      {showZoneDonut ? (
        <>
          <div className="relative w-full h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={120}
                  paddingAngle={3}
                  isAnimationActive={false}
                >
                  {donutData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Pie
                  data={uaoDonutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={68}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {uaoDonutData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[28px] font-bold text-[#21264E] leading-none">
                {coveragePct.toFixed(0)}%
              </div>
              <div className="text-[11px] font-semibold text-gray-500 mt-1">
                Coverage
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-4 text-xs flex-wrap text-[#21264E]">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#08a35e' }} />
              Covered
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FFD54F' }} />
              Not Covered
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#006ae0' }} />
              UAO
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#E5E7EB' }} />
              Non-UAO
            </span>
          </div>
        </>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="covered" stackId="a" fill="#08a35e" name="Covered" />
            <Bar dataKey="notCovered" stackId="a" fill="#FFD54F" name="Not Covered" />
            <Line type="monotone" dataKey="uao" stroke="#006ae0" strokeWidth={4} dot={false} name="UAO" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
