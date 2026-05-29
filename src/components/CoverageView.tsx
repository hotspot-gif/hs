import { useState, useEffect, useMemo, useCallback } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import { Filter, AlertTriangle, Eye, EyeOff, Map as MapIcon, Table, FileDown, FileSpreadsheet } from 'lucide-react';
import { normalizeBranch, NORTH_REGION, SOUTH_REGION } from '@/data/mockData';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import BranchCoverageChart from '@/components/BranchCoverageChart';
import CoverageMap from '@/components/CoverageMap';
import type { RetailerCoverage, RpaUser, ZoneCoverageSummary } from '@/types';

type ViewTab = 'all' | 'not-covered' | 'red-flagged' | 'inactive';

export default function CoverageView({ user }: { user: RpaUser }) {
  const [coverage, setCoverage] = useState<RetailerCoverage[]>([]);
  const [zoneSummaries, setZoneSummaries] = useState<ZoneCoverageSummary[]>([]);
  const [filteredCoverage, setFilteredCoverage] = useState<RetailerCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [showMap, setShowMap] = useState(false);

  const userRegion = (() => {
    const branch = user.branches?.[0] ? normalizeBranch(user.branches[0]) : '';
    if (NORTH_REGION.includes(branch)) return 'NORTH';
    if (SOUTH_REGION.includes(branch)) return 'SOUTH';
    return 'ALL ITALY';
  })();

  const isAsm = user.role === 'ASM';
  const isRsm = user.role === 'RSM';
  const isZoneManager = user.role === 'ZONE-MANAGER';
  const isUkAdmin = user.role === 'UK-ADMIN';
  const isTerritoryAdmin = user.role === 'ADMIN';
  const branchRestrictedRole = isAsm || isRsm || isZoneManager || isTerritoryAdmin;
  const canChangeRegion = !isAsm && !isRsm && !isZoneManager;
  const canChangeBranch = !isAsm && !isZoneManager;

  const [selectedRegion, setSelectedRegion] = useState<string>(() => (isAsm || isRsm || isZoneManager ? userRegion : 'ALL ITALY'));
  const [selectedBranch, setSelectedBranch] = useState<string>(() => ((isAsm || isZoneManager) ? normalizeBranch(user.branches?.[0] || 'ALL') : 'ALL'));
  const [selectedZone, setSelectedZone] = useState<string>(() => (isZoneManager ? (user.zone || user.branches?.[0] || 'ALL') : 'ALL'));
  const [expandedRetailer, setExpandedRetailer] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [overallStats, setOverallStats] = useState({
    total: 0,
    uao: 0,
    covered: 0,
    notCovered: 0,
    redFlagged: 0,
    coveragePercentage: 0,
  });

  const regions = useMemo(() => {
    return ['ALL ITALY', 'NORTH', 'SOUTH'];
  }, []);

  const branches = useMemo(() => {
    if (isZoneManager) {
      const b = normalizeBranch(user.branches?.[0] || '');
      return b ? [b] : [];
    }
    let filtered = zoneSummaries;
    if (selectedRegion !== 'ALL ITALY') {
      filtered = filtered.filter(z => z.region === selectedRegion);
    }
    const unique = new Set(filtered.map(z => z.branch));
    let branchList = Array.from(unique).sort();
    if (branchRestrictedRole && !isUkAdmin) {
      const allowedBranches = (user.branches || []).map(normalizeBranch);
      branchList = branchList.filter(branch => allowedBranches.includes(normalizeBranch(branch)));
    }
    return branchList;
  }, [zoneSummaries, selectedRegion, user.branches, branchRestrictedRole, isUkAdmin, isZoneManager]);

  const zones = useMemo(() => {
    if (isZoneManager) {
      const z = String(user.zone || '').trim();
      return z ? [z] : [];
    }
    let filtered = zoneSummaries;
    if (selectedRegion !== 'ALL ITALY') {
      filtered = filtered.filter(z => z.region === selectedRegion);
    }
    if (branchRestrictedRole && !isUkAdmin) {
      const allowedBranches = (user.branches || []).map(normalizeBranch);
      filtered = filtered.filter(z => allowedBranches.includes(normalizeBranch(z.branch)));
    }
    if (selectedBranch !== 'ALL') {
      filtered = filtered.filter(z => z.branch === selectedBranch);
    }
    const unique = new Set(filtered.map(z => z.zone));
    return Array.from(unique).sort();
  }, [zoneSummaries, selectedRegion, selectedBranch, user.branches, branchRestrictedRole, isUkAdmin, isZoneManager]);

  const filteredZoneSummaries = useMemo(() => {
    let filtered = zoneSummaries;
    if (selectedRegion !== 'ALL ITALY') {
      filtered = filtered.filter(summary => summary.region === selectedRegion);
    }
    if (selectedBranch !== 'ALL') {
      filtered = filtered.filter(summary => summary.branch === selectedBranch);
    }
    if (selectedZone !== 'ALL') {
      filtered = filtered.filter(summary => summary.zone === selectedZone);
    }
    return filtered;
  }, [zoneSummaries, selectedRegion, selectedBranch, selectedZone]);

  const filteredSummaryStats = useMemo(() => {
    const totalRetailers = filteredZoneSummaries.reduce((sum, summary) => sum + summary.total_retailers, 0);
    const uaoRetailers = filteredZoneSummaries.reduce((sum, summary) => sum + summary.uao, 0);
    const coveredRetailers = filteredZoneSummaries.reduce((sum, summary) => sum + summary.covered_retailers, 0);
    const notCoveredRetailers = filteredZoneSummaries.reduce((sum, summary) => sum + summary.not_covered_retailers, 0);
    const redFlaggedRetailers = filteredZoneSummaries.reduce((sum, summary) => sum + summary.red_flagged_retailers, 0);
    const logicFollowed = filteredZoneSummaries.reduce((sum, summary) => {
      const v = (summary as any).logic_followed ?? (summary as any).LOGIC_FOLLOWED ?? 0;
      return sum + (typeof v === 'number' ? v : Number(v) || 0);
    }, 0);
    const asmCovered = filteredZoneSummaries.reduce((sum, summary) => {
      const v = (summary as any).ASM_visits ?? (summary as any).asm_visits ?? 0;
      return sum + (typeof v === 'number' ? v : Number(v) || 0);
    }, 0);

    const uniqueBranches = new Set(filteredZoneSummaries.map(summary => summary.branch));
    const uniqueZones = new Set(filteredZoneSummaries.map(summary => summary.zone));

    const coveragePercent = totalRetailers > 0 ? (coveredRetailers / totalRetailers) * 100 : 0;
    const asmCoveragePercent = totalRetailers > 0 ? (asmCovered / totalRetailers) * 100 : 0;
    const logicFollowedPercent = totalRetailers > 0 ? (logicFollowed / totalRetailers) * 100 : 0;

    return {
      total: totalRetailers,
      uao: uaoRetailers,
      covered: coveredRetailers,
      notCovered: notCoveredRetailers,
      logicFollowed,
      logicFollowedPercent,
      asmCovered,
      asmCoveragePercent,
      redFlagged: redFlaggedRetailers,
      branches: uniqueBranches.size,
      zones: uniqueZones.size,
      coveragePercent: coveragePercent,
    };
  }, [filteredZoneSummaries]);

  const logicFollowedDonutData = useMemo(() => {
    const total = filteredSummaryStats.total;
    const followed = Math.min(filteredSummaryStats.logicFollowed, total);
    const notFollowed = Math.max(0, total - followed);
    return [
      { name: 'Logic Followed', value: followed, color: '#46286E' },
      { name: 'Not Followed', value: notFollowed, color: '#E5E7EB' },
    ];
  }, [filteredSummaryStats.total, filteredSummaryStats.logicFollowed]);

  const asmCoverageDonutData = useMemo(() => {
    const total = filteredSummaryStats.total;
    const covered = Math.min(filteredSummaryStats.asmCovered, total);
    const notCovered = Math.max(0, total - covered);
    return [
      { name: 'ASM Covered', value: covered, color: '#006AE0' },
      { name: 'Not Covered', value: notCovered, color: '#E5E7EB' },
    ];
  }, [filteredSummaryStats.total, filteredSummaryStats.asmCovered]);

  const lastUpdatedDate = useMemo(() => {
    if (zoneSummaries.length === 0) return null;
    const dates = zoneSummaries
      .map(summary => new Date(summary.last_updated))
      .filter(date => !isNaN(date.getTime()));
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates.map(d => d.getTime())));
  }, [zoneSummaries]);

  useEffect(() => {
    if (isAsm) {
      const b = normalizeBranch(user.branches?.[0] || 'ALL');
      setSelectedRegion(userRegion);
      if (selectedBranch !== b) {
        setSelectedBranch(b);
        setSelectedZone('ALL');
      }
    } else if (isRsm) {
      setSelectedRegion(userRegion);
      const allowedBranches = (user.branches || []).map(normalizeBranch);
      if (selectedBranch !== 'ALL' && !allowedBranches.includes(normalizeBranch(selectedBranch))) {
        setSelectedBranch('ALL');
      }
    } else if (isZoneManager) {
      setSelectedRegion(userRegion);
      setSelectedBranch(normalizeBranch(user.branches?.[0] || 'ALL'));
      setSelectedZone(user.zone || user.branches?.[0] || 'ALL');
    }
  }, [isAsm, isRsm, isZoneManager, userRegion, user.branches, user.zone, selectedBranch, selectedZone]);

  const handleRegionChange = useCallback((region: string) => {
    if (!canChangeRegion) return;
    setSelectedRegion(region);
    setSelectedBranch('ALL');
    setSelectedZone('ALL');
  }, [canChangeRegion]);

  const handleBranchChange = useCallback((branch: string) => {
    if (!canChangeBranch) return;
    setSelectedBranch(branch);
    setSelectedZone('ALL');
  }, [canChangeBranch]);

  const handleZoneChange = useCallback((zone: string) => {
    if (isZoneManager) return;
    setSelectedZone(zone);
  }, [isZoneManager]);

  const fetchZoneSummaries = useCallback(async () => {
    const { data } = await supabase
      .from('zone_coverage_summary')
      .select('*')
      .order('zone', { ascending: true });

    setZoneSummaries((data as ZoneCoverageSummary[]) || []);
  }, []);

  const fetchCoverage = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('retailer_coverage')
      .select('*')
      .order('retailer_id', { ascending: true });

    if (isZoneManager) {
      const assignedZone = String(user.zone || selectedZone || '').trim();
      if (assignedZone) {
        query = query.ilike('zone', `%${assignedZone}%`);
      }
    } else {
      if (selectedBranch && selectedBranch !== 'ALL') {
        query = query.eq('branch', selectedBranch);
      } else if (selectedRegion !== 'ALL ITALY') {
        const regionBranches = selectedRegion === 'NORTH' ? NORTH_REGION : SOUTH_REGION;
        const allowedBranchSet = new Set(
          (branchRestrictedRole && !isUkAdmin)
            ? (user.branches || []).map(normalizeBranch)
            : regionBranches
        );
        const branchFilter = regionBranches.filter(branch => allowedBranchSet.has(normalizeBranch(branch)));
        if (branchFilter.length > 0) {
          query = query.in('branch', branchFilter);
        }
      }
    }

    if (selectedZone && selectedZone !== 'ALL') {
      if (!isZoneManager) query = query.eq('zone', selectedZone);
    }

    if (activeTab === 'not-covered') {
      query = query.eq('coverage_status', 'no');
    } else if (activeTab === 'red-flagged') {
      query = query.eq('red_flag', true);
    } else if (activeTab === 'inactive') {
      let inactiveQuery = supabase
        .from('retailer_coverage')
        .select('*')
        .eq('status', 'inactive')
        .order('retailer_id', { ascending: true });
      if (isZoneManager) {
        const assignedZone = String(user.zone || selectedZone || '').trim();
        if (assignedZone) {
          inactiveQuery = inactiveQuery.ilike('zone', `%${assignedZone}%`);
        }
      } else {
        if (selectedBranch && selectedBranch !== 'ALL') {
          inactiveQuery = inactiveQuery.eq('branch', selectedBranch);
        } else if (selectedRegion !== 'ALL ITALY') {
          const regionBranches = selectedRegion === 'NORTH' ? NORTH_REGION : SOUTH_REGION;
          const allowedBranchSet = new Set(
            (branchRestrictedRole && !isUkAdmin)
              ? (user.branches || []).map(normalizeBranch)
              : regionBranches
          );
          const branchFilter = regionBranches.filter(branch => allowedBranchSet.has(normalizeBranch(branch)));
          if (branchFilter.length > 0) {
            inactiveQuery = inactiveQuery.in('branch', branchFilter);
          }
        }
      }
      if (selectedZone && selectedZone !== 'ALL') {
        if (!isZoneManager) inactiveQuery = inactiveQuery.eq('zone', selectedZone);
      }
      const { data } = await inactiveQuery;
      const result = (data as RetailerCoverage[]) || [];
      setCoverage(result);
      if (searchTerm) {
        setFilteredCoverage(result.filter(c => c.retailer_id.toLowerCase().includes(searchTerm.toLowerCase())));
      } else {
        setFilteredCoverage(result);
      }
      setLoading(false);
      return;
    }

    const { data } = await query;
    const result = (data as RetailerCoverage[]) || [];
    setCoverage(result);

    if (searchTerm) {
      setFilteredCoverage(result.filter(c => c.retailer_id.toLowerCase().includes(searchTerm.toLowerCase())));
    } else {
      setFilteredCoverage(result);
    }
    setLoading(false);
  }, [selectedBranch, selectedZone, selectedRegion, activeTab, searchTerm, user.branches, branchRestrictedRole, isUkAdmin, isZoneManager]);

  const handleExportTablePdf = useCallback(async () => {
    if (filteredCoverage.length === 0) return;

    setExportingPdf(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
      const W = 297;
      const H = 210;
      const M = 12;

      const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const branchLbl = (selectedBranch || 'ALL').replace('LMIT-HS-', '');
      const zoneLbl = selectedZone || 'ALL';
      const regionLbl = selectedRegion || 'ALL';
      const tabLbl =
        activeTab === 'all' ? 'All' :
        activeTab === 'not-covered' ? 'Not Covered' :
        activeTab === 'red-flagged' ? 'Red Flagged' :
        'Inactive';

      const total = filteredCoverage.length;
      const covered = filteredCoverage.filter(r => r.coverage_status === 'yes').length;
      const notCovered = filteredCoverage.filter(r => r.coverage_status !== 'yes').length;
      const redFlagged = filteredCoverage.filter(r => r.red_flag).length;
      const inactive = filteredCoverage.filter(r => r.status === 'inactive').length;
      const coveragePct = total > 0 ? Math.round((covered / total) * 100) : 0;

      pdf.setFillColor(33, 38, 78);
      pdf.rect(0, 0, W, 20, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Retailer Coverage Report', M, 12.5);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(190, 205, 235);
      pdf.text(`Branch: ${branchLbl} | Zone: ${zoneLbl} | Region: ${regionLbl} | View: ${tabLbl}`, M, 17);
      pdf.setTextColor(255, 213, 79);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${coveragePct}% Covered`, W - M, 12.5, { align: 'right' });
      pdf.setTextColor(190, 205, 235);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Exported: ${nowStr}`, W - M, 17, { align: 'right' });

      let y = 26;
      const tileH = 14;
      const tileW = (W - (M * 2) - 16) / 5;
      const tiles = [
        { label: 'Total', value: String(total), c: [0, 106, 224] as const },
        { label: 'Covered', value: String(covered), c: [8, 163, 93] as const },
        { label: 'Not Covered', value: String(notCovered), c: [255, 213, 79] as const },
        { label: 'Red Flagged', value: String(redFlagged), c: [240, 68, 56] as const },
        { label: 'Inactive', value: String(inactive), c: [107, 114, 128] as const },
      ];

      tiles.forEach((t, i) => {
        const x = M + i * (tileW + 4);
        pdf.setFillColor(250, 248, 245);
        pdf.setDrawColor(220, 215, 210);
        pdf.setLineWidth(0.25);
        pdf.roundedRect(x, y, tileW, tileH, 2, 2, 'FD');
        pdf.setFillColor(t.c[0], t.c[1], t.c[2]);
        pdf.circle(x + 6, y + 5.2, 2, 'F');
        pdf.setTextColor(100, 100, 120);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.text(t.label, x + 10, y + 6);
        pdf.setTextColor(33, 38, 78);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text(t.value, x + 10, y + 11.6);
      });

      y += tileH + 6;

      const headers = [['Retailer ID', 'Branch', 'Zone', 'Coverage', 'Red Flag', 'ASM Visit', 'Status', 'Remarks']];
      const rows = filteredCoverage.map((retailer) => [
        retailer.retailer_id,
        retailer.branch.replace('LMIT-HS-', ''),
        retailer.zone,
        retailer.coverage_status === 'yes' ? 'Covered' : 'Not Covered',
        retailer.red_flag ? 'Yes' : 'No',
        (retailer.asm_visits || 0) >= 1 ? 'Visited' : 'Not Visited',
        retailer.status,
        retailer.remarks || '-',
      ]);

      autoTable(pdf, {
        startY: y,
        head: headers,
        body: rows,
        styles: { fontSize: 8, cellPadding: 2, textColor: [33, 38, 78] },
        headStyles: { fillColor: [33, 38, 78], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [252, 250, 248] },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 30 },
          2: { cellWidth: 45 },
          3: { cellWidth: 25 },
          4: { cellWidth: 20 },
          5: { cellWidth: 22 },
          6: { cellWidth: 20 },
          7: { cellWidth: 60 },
        },
        didParseCell: (hook) => {
          if (hook.section !== 'body') return;
          const col = hook.column.index;
          if (col === 3) {
            const v = String(hook.cell.raw || '');
            if (v === 'Covered') {
              hook.cell.styles.fillColor = [232, 250, 242];
              hook.cell.styles.textColor = [5, 163, 93];
              hook.cell.styles.fontStyle = 'bold';
            } else {
              hook.cell.styles.fillColor = [255, 249, 230];
              hook.cell.styles.textColor = [161, 98, 7];
              hook.cell.styles.fontStyle = 'bold';
            }
          }
          if (col === 4) {
            const v = String(hook.cell.raw || '');
            if (v === 'Yes') {
              hook.cell.styles.fillColor = [254, 226, 226];
              hook.cell.styles.textColor = [185, 28, 28];
              hook.cell.styles.fontStyle = 'bold';
            }
          }
          if (col === 5) {
            const v = String(hook.cell.raw || '');
            if (v === 'Visited') {
              hook.cell.styles.fillColor = [219, 234, 254];
              hook.cell.styles.textColor = [30, 64, 175];
              hook.cell.styles.fontStyle = 'bold';
            } else {
              hook.cell.styles.fillColor = [243, 244, 246];
              hook.cell.styles.textColor = [75, 85, 99];
              hook.cell.styles.fontStyle = 'bold';
            }
          }
          if (col === 6) {
            const v = String(hook.cell.raw || '');
            if (v === 'inactive') {
              hook.cell.styles.textColor = [107, 114, 128];
              hook.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: (data) => {
          const pageCount = (pdf as any).internal.getNumberOfPages?.() || 1;
          const page = (pdf as any).internal.getCurrentPageInfo?.().pageNumber || 1;
          pdf.setDrawColor(220, 215, 210);
          pdf.setLineWidth(0.2);
          pdf.line(M, H - 10, W - M, H - 10);
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(140, 140, 150);
          pdf.text('CONFIDENTIAL — internal coverage data only.', M, H - 6);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`Page ${page} / ${pageCount}`, W - M, H - 6, { align: 'right' });
        },
      });

      const filename = `coverage-table-${selectedBranch === 'ALL' ? 'ALL' : selectedBranch}-${selectedZone === 'ALL' ? 'ALL' : selectedZone}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error('Export PDF failed:', error);
    }
    setExportingPdf(false);
  }, [filteredCoverage, selectedBranch, selectedZone, selectedRegion, activeTab]);

  const handleExportExcel = useCallback(async () => {
    if (filteredCoverage.length === 0) return;
    setExportingExcel(true);
    try {
      const XLSX: any = await import('xlsx');

      const branchLbl = (selectedBranch || 'ALL').replace('LMIT-HS-', '');
      const zoneLbl = selectedZone || 'ALL';
      const regionLbl = selectedRegion || 'ALL';
      const tabLbl =
        activeTab === 'all' ? 'All' :
        activeTab === 'not-covered' ? 'Not Covered' :
        activeTab === 'red-flagged' ? 'Red Flagged' :
        'Inactive';
      const nowStr = new Date().toLocaleString('en-GB');

      const total = filteredCoverage.length;
      const covered = filteredCoverage.filter(r => r.coverage_status === 'yes').length;
      const notCovered = filteredCoverage.filter(r => r.coverage_status !== 'yes').length;
      const redFlagged = filteredCoverage.filter(r => r.red_flag).length;
      const inactive = filteredCoverage.filter(r => r.status === 'inactive').length;
      const coveragePct = total > 0 ? Math.round((covered / total) * 100) : 0;

      const summarySheet = XLSX.utils.json_to_sheet([
        { Key: 'Exported At', Value: nowStr },
        { Key: 'Branch', Value: branchLbl },
        { Key: 'Zone', Value: zoneLbl },
        { Key: 'Region', Value: regionLbl },
        { Key: 'View', Value: tabLbl },
        { Key: 'Total', Value: total },
        { Key: 'Covered', Value: covered },
        { Key: 'Not Covered', Value: notCovered },
        { Key: 'Coverage %', Value: coveragePct },
        { Key: 'Red Flagged', Value: redFlagged },
        { Key: 'Inactive', Value: inactive },
      ]);

      const dataSheet = XLSX.utils.json_to_sheet(
        filteredCoverage.map(r => ({
          retailer_id: r.retailer_id,
          branch: r.branch.replace('LMIT-HS-', ''),
          zone: r.zone,
          coverage: r.coverage_status === 'yes' ? 'Covered' : 'Not Covered',
          red_flag: r.red_flag ? 'Yes' : 'No',
          asm_visit: (r.asm_visits || 0) >= 1 ? 'Visited' : 'Not Visited',
          red_flag_type: r.red_flag_type || '',
          status: r.status,
          remarks: r.remarks || '',
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
      XLSX.utils.book_append_sheet(wb, dataSheet, 'Coverage');

      const filename = `coverage-${branchLbl}-${zoneLbl}-${tabLbl}`.replace(/\s+/g, '_') + '.xlsx';
      XLSX.writeFile(wb, filename, { compression: true });
    } catch (e) {
      console.error('Export Excel failed:', e);
    } finally {
      setExportingExcel(false);
    }
  }, [filteredCoverage, selectedBranch, selectedZone, selectedRegion, activeTab]);

  useEffect(() => {
    fetchZoneSummaries();
  }, [fetchZoneSummaries]);

  useEffect(() => {
    fetchCoverage();
  }, [fetchCoverage]);

  useEffect(() => {
    if (zoneSummaries.length > 0) {
      const totalRetailers = zoneSummaries.reduce((sum, zone) => sum + zone.total_retailers, 0);
      const uaoRetailers = zoneSummaries.reduce((sum, zone) => sum + zone.uao, 0);
      const coveredRetailers = zoneSummaries.reduce((sum, zone) => sum + zone.covered_retailers, 0);
      const notCoveredRetailers = zoneSummaries.reduce((sum, zone) => sum + zone.not_covered_retailers, 0);
      const redFlaggedRetailers = zoneSummaries.reduce((sum, zone) => sum + zone.red_flagged_retailers, 0);

      const overallCoveragePercentage =
        totalRetailers > 0 ? Math.round((coveredRetailers / totalRetailers) * 100) : 0;

      setOverallStats({
        total: totalRetailers,
        uao: uaoRetailers,
        covered: coveredRetailers,
        notCovered: notCoveredRetailers,
        redFlagged: redFlaggedRetailers,
        coveragePercentage: overallCoveragePercentage,
      });
    }
  }, [zoneSummaries]);

  const stats = {
    total: coverage.length,
    covered: coverage.filter((c) => c.coverage_status === 'yes').length,
    notCovered: coverage.filter((c) => c.coverage_status === 'no').length,
    redFlagged: coverage.filter((c) => c.red_flag).length,
    inactive: coverage.filter((c) => c.status === 'inactive').length,
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Filters (moved to top - matching KPI page layout) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setShowMap(!showMap)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                showMap
                  ? 'bg-[#21264E] text-white shadow-md'
                  : 'bg-white text-[#21264E] border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {showMap ? <Table size={16} /> : <MapIcon size={16} />}
              {showMap ? 'Table View' : 'Map View'}
            </button>

            <div className="flex items-center gap-2 min-w-[140px]">
              <label className="text-sm font-semibold text-[#21264E]">Region</label>
            <select
              value={selectedRegion}
              onChange={(e) => handleRegionChange(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#21264E] font-medium"
              disabled={!canChangeRegion}
            >
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 min-w-[180px] max-w-[220px]">
            <label className="text-sm font-semibold text-[#21264E]">Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => handleBranchChange(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#21264E] font-medium"
              disabled={!canChangeBranch}
            >
              <option value="ALL">{selectedRegion === 'ALL ITALY' ? 'All Branches' : `All ${selectedRegion} Branches`}</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch.replace('LMIT-HS-', '')}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-[#21264E]">Zone</label>
            <select
              value={selectedZone}
              onChange={(e) => handleZoneChange(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#21264E] font-medium"
              disabled={isZoneManager || (!isAsm && selectedBranch === 'ALL')}
            >
              {isZoneManager ? (
                <option value={selectedZone}>{selectedZone}</option>
              ) : (
                <>
                  <option value="ALL">All Zones</option>
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
          {lastUpdatedDate && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg ml-auto">
              <span className="text-xs font-medium text-gray-600">Last Updated:</span>
              <span className="text-sm font-semibold text-[#21264E]">
                {lastUpdatedDate.toLocaleDateString()} {lastUpdatedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>

    {showMap ? (
      <div className="space-y-6">
        <CoverageMap
          zoneSummaries={zoneSummaries}
          selectedZone={selectedZone}
          selectedBranch={selectedBranch}
          onSelectBranch={handleBranchChange}
          onSelectZone={handleZoneChange}
          selectedRegion={selectedRegion}
        />
      </div>
    ) : (
      <>
        {/* Header & Stats */}
        <div>
          <h1 className="text-2xl font-bold text-[#21264E] mb-4">Retailer Coverage Analysis</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Total Retailers</p>
            <p className="text-2xl font-bold text-[#21264E]">{overallStats.total}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">UAO</p>
            <p className="text-2xl font-bold text-[#21264E]">{overallStats.uao}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Coverage Rate</p>
            <p className="text-2xl font-bold text-emerald-600">{overallStats.coveragePercentage}%</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Not Covered</p>
            <p className="text-2xl font-bold text-orange-600">{overallStats.notCovered}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Red Flagged</p>
            <p className="text-2xl font-bold text-red-600">{overallStats.redFlagged}</p>
          </div>
        </div>

      </div>

      {/* Summary Panel */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 h-fit">
        <h3 className="text-lg font-bold text-[#21264E] mb-4">Summary</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Total Retailers</p>
              <p className="text-xl font-bold text-[#21264E]">
                {filteredSummaryStats.total}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">UAO</p>
              <p className="text-xl font-bold text-blue-600">
                {filteredSummaryStats.uao}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Covered</p>
              <p className="text-xl font-bold text-emerald-600">
                {filteredSummaryStats.covered}
              </p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Not Covered</p>
              <p className="text-xl font-bold text-orange-600">
                {filteredSummaryStats.notCovered}
              </p>
            </div>
            <div className="bg-sky-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">ASM Covered</p>
              <p className="text-xl font-bold text-[#006AE0]">
                {filteredSummaryStats.asmCovered}
              </p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">ASM Coverage %</p>
              <p className="text-xl font-bold text-indigo-700">
                {Math.round(filteredSummaryStats.asmCoveragePercent)}%
              </p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-semibold mb-1">Red Flagged</p>
              <p className="text-xl font-bold text-red-600">
                {filteredSummaryStats.redFlagged}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 font-semibold mb-2">Coverage Rate</p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{
                  width: `${filteredSummaryStats.coveragePercent}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {Math.round(filteredSummaryStats.coveragePercent)}%
            </p>
          </div>
          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500 font-semibold">Branches</p>
                <p className="font-bold text-[#21264E]">{filteredSummaryStats.branches}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-semibold">Zones</p>
                <p className="font-bold text-[#21264E]">{filteredSummaryStats.zones}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branch-wise Coverage Chart */}
      <BranchCoverageChart zoneSummaries={filteredZoneSummaries} selectedBranch={selectedBranch} selectedZone={selectedZone} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-[#21264E] mb-4">Logic Followed</h3>
          <div className="relative w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={logicFollowedDonutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {logicFollowedDonutData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[28px] font-bold text-[#21264E] leading-none">
                {Math.round(filteredSummaryStats.logicFollowedPercent)}%
              </div>
              <div className="text-[11px] font-semibold text-gray-500 mt-1">
                {filteredSummaryStats.logicFollowed} / {filteredSummaryStats.total}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs flex-wrap text-[#21264E]">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#46286E' }} />
              Logic Followed
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#E5E7EB' }} />
              Not Followed
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-[#21264E] mb-4">ASM Coverage</h3>
          <div className="relative w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={asmCoverageDonutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {asmCoverageDonutData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[28px] font-bold text-[#21264E] leading-none">
                {Math.round(filteredSummaryStats.asmCoveragePercent)}%
              </div>
              <div className="text-[11px] font-semibold text-gray-500 mt-1">
                {filteredSummaryStats.asmCovered} / {filteredSummaryStats.total}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs flex-wrap text-[#21264E]">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#006AE0' }} />
              ASM Covered
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: '#E5E7EB' }} />
              Not Covered
            </span>
          </div>
        </div>
      </div>

      {/* Content based on zone selection */}
      {selectedZone === 'ALL' ? (
        /* Zone Summaries */
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-[#21264E] mb-4">Branch & Zone Coverage Summary</h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-[#21264E]">Branch</th>
                  <th className="text-left py-3 px-4 font-semibold text-[#21264E]">Zone</th>
                  <th className="text-left py-3 px-4 font-semibold text-[#21264E]">Region</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#21264E]">Total Retailers</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#21264E]">UAO</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#21264E]">Covered</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#21264E]">Not Covered</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#21264E]">Red Flagged</th>
                  <th className="text-right py-3 px-4 font-semibold text-[#21264E]">Coverage %</th>
                </tr>
              </thead>
              <tbody>
                {filteredZoneSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-gray-500">No data available</td>
                  </tr>
                ) : (
                  filteredZoneSummaries.map((summary, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-[#21264E] font-medium">
                        {summary.branch.replace('LMIT-HS-', '')}
                      </td>
                      <td className="py-3 px-4 text-[#21264E]">{summary.zone}</td>
                      <td className="py-3 px-4 text-[#21264E]">{summary.region}</td>
                      <td className="py-3 px-4 text-right text-[#21264E]">{summary.total_retailers}</td>
                      <td className="py-3 px-4 text-right text-[#21264E]">{summary.uao}</td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-medium">{summary.covered_retailers}</td>
                      <td className="py-3 px-4 text-right text-orange-600">{summary.not_covered_retailers}</td>
                      <td className="py-3 px-4 text-right text-red-600">{summary.red_flagged_retailers}</td>
                      <td className="py-3 px-4 text-right text-[#21264E] font-medium">
                        {summary.coverage_percentage.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Retailer Details for Selected Zone */
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <input
              type="text"
              placeholder="Search by Retailer ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#21264E] placeholder:text-gray-400"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportTablePdf}
                disabled={exportingPdf || filteredCoverage.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-[#F04438] text-white hover:bg-[#d93a30] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileDown size={16} />
                {exportingPdf ? 'Exporting...' : 'Export PDF'}
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={exportingExcel || filteredCoverage.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-[#16A34A] text-white hover:bg-[#12843d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet size={16} />
                {exportingExcel ? 'Exporting...' : 'Export Excel'}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 overflow-x-auto mb-6">
            {(['all', 'not-covered', 'red-flagged', 'inactive'] as ViewTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition ${
                  activeTab === tab
                    ? 'border-[#21264E] text-[#21264E]'
                    : 'border-transparent text-gray-600 hover:text-[#21264E]'
                }`}
              >
                {tab === 'all'
                  ? `All (${stats.total})`
                  : tab === 'not-covered'
                    ? `Not Covered (${stats.notCovered})`
                    : tab === 'red-flagged'
                      ? `Red Flagged (${stats.redFlagged})`
                      : `Inactive (${stats.inactive})`}
              </button>
            ))}
          </div>

          {/* Retailer Details Table */}
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading coverage data...</div>
          ) : filteredCoverage.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No records found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-[#21264E]">Retailer ID</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#21264E]">Branch</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#21264E]">Zone</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#21264E]">Coverage</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#21264E]">Red Flag</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#21264E]">ASM Visit</th>
                    <th className="text-left py-3 px-4 font-semibold text-[#21264E]">Remarks</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#21264E]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoverage.map((retailer) => (
                    <>
                      <tr key={retailer.retailer_id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-[#21264E] font-medium">{retailer.retailer_id}</td>
                        <td className="py-3 px-4 text-[#21264E]">{retailer.branch.replace('LMIT-HS-', '')}</td>
                        <td className="py-3 px-4 text-[#21264E]">{retailer.zone}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            retailer.coverage_status === 'yes'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {retailer.coverage_status === 'yes' ? 'Covered' : 'Not Covered'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {retailer.red_flag && (
                            <div className="relative inline-flex items-center justify-center group">
                              <AlertTriangle size={16} className="text-red-500" />
                              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full whitespace-nowrap rounded-md bg-[#21264E] px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100">
                                {retailer.red_flag_type || 'Red Flag'}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            (retailer.asm_visits || 0) >= 1
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {(retailer.asm_visits || 0) >= 1 ? 'Visited' : 'Not Visited'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#21264E] text-sm">{retailer.remarks || '-'}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setExpandedRetailer(
                              expandedRetailer === retailer.retailer_id ? null : retailer.retailer_id
                            )}
                            className="text-[#21264E] hover:text-blue-600 transition"
                          >
                            {expandedRetailer === retailer.retailer_id ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expandedRetailer === retailer.retailer_id && (
                        <tr key={`${retailer.retailer_id}-expanded`}>
                          <td colSpan={8} className="px-4 py-4 bg-gray-50">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-600">Planned Visits:</span>
                                <span className="ml-2 text-[#21264E]">{retailer.planned_visits_count}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-600">HS Visits:</span>
                                <span className="ml-2 text-[#21264E]">{retailer.hs_visits}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-600">ASM Visits:</span>
                                <span className="ml-2 text-[#21264E]">{retailer.asm_visits}</span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-600">Others:</span>
                                <span className="ml-2 text-[#21264E]">{retailer.others_visits}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
    )}
  </div>
);
}
