import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { RetailerSummary, RetailerMonthly } from '@/types';
import RetailerAnalysis from '@/components/RetailerAnalysis';
import TopRetailersView from '@/components/TopRetailersView';
import DataImport from '@/components/DataImport';
import UserManagement from '@/components/UserManagement';
import KPIAnalysis from '@/components/KPIAnalysis';
import ISDM from '@/components/ISDM';
import CoverageView from '@/components/CoverageView';
import RetailerPerformanceReport from '@/components/RetailerPerformanceReport';
import {
  LayoutDashboard, Upload, LogOut, Search, User, Building2, Shield, FileDown, ChevronLeft, ChevronRight, Users, TrendingUp, Globe, Menu, X, Trophy, Activity,
} from 'lucide-react';
import { generatePDF } from '@/utils/pdfExport';
import { ALL_BRANCHES, BRANCH_TO_ZONES, normalizeBranch, NORTH_REGION, SOUTH_REGION } from '@/data/mockData';

const VIEWS = { DASHBOARD: 'dashboard', KPI: 'kpi', ISDM: 'isdm', IMPORT: 'import', USERS: 'users', COVERAGE: 'coverage', RETAILER_PERFORMANCE: 'retailer_performance' } as const;
type View = (typeof VIEWS)[keyof typeof VIEWS];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState<View>(VIEWS.DASHBOARD);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [retailers, setRetailers] = useState<RetailerSummary[]>([]);
  const [selectedRetailerId, setSelectedRetailerId] = useState('');
  const [retailerSearch, setRetailerSearch] = useState('');
  const [monthlyData, setMonthlyData] = useState<RetailerMonthly[]>([]);
  const [branchMonthlyData, setBranchMonthlyData] = useState<RetailerMonthly[]>([]);
  const [yearlyZoneData, setYearlyZoneData] = useState<any[]>([]);
  const [loadingRetailers, setLoadingRetailers] = useState(false);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [showRetailerDropdown, setShowRetailerDropdown] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const hasAllBranchAccess = user?.role === 'HS-ADMIN' || user?.role === 'COUNTRY-MANAGER' || user?.role === 'UK-ADMIN';
  const isZoneManager = user?.role === 'ZONE-MANAGER';
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // KPI-specific filters (independent from dashboard)
  const [kpiBranch, setKpiBranch] = useState('');
  const [kpiRegion, setKpiRegion] = useState('ITALY');

  const handleChangePassword = async () => {
    setPasswordError('');

    if (!newPassword.trim()) {
      setPasswordError('New password is required');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(error.message || 'Failed to update password');
    } else {
      setPasswordSuccess('Password changed successfully');
      setShowPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPassword(false);
  };
  const [kpiZone, setKpiZone] = useState('');
  const [kpiZones, setKpiZones] = useState<string[]>([]);
  const [kpiBranches, setKpiBranches] = useState<string[]>([]);

  // ISDM-specific filters (independent from dashboard and KPI)
  const [isdmBranch, setIsdmBranch] = useState('');
  const [isdmRegion, setIsdmRegion] = useState('ITALY');
  const [isdmZone, setIsdmZone] = useState('');
  const [isdmZones, setIsdmZones] = useState<string[]>([]);
  const [isdmBranches, setIsdmBranches] = useState<string[]>([]);

  const [perfRegion, setPerfRegion] = useState('ITALY');
  const [perfBranch, setPerfBranch] = useState('');
  const [perfZone, setPerfZone] = useState('');
  const [perfBranches, setPerfBranches] = useState<string[]>([]);
  const [perfZones, setPerfZones] = useState<string[]>([]);

  useEffect(() => {
    if (!user || user.role !== 'ZONE-MANAGER') return;
    const assignedZone = String(user.zone || '').trim();
    const assignedBranch = normalizeBranch(user.branches?.[0] || '');

    const apply = (branch: string, zone: string, region: string) => {
      const b = normalizeBranch(branch);
      const z = String(zone || '').trim();
      if (!b || !z) return;
      const r = region === 'NORTH' || region === 'SOUTH' ? region : 'ITALY';

      setSelectedBranch(b);
      setSelectedZone(z);

      setKpiBranch(b);
      setKpiZone(z);
      setKpiRegion(r);

      setIsdmBranch(b);
      setIsdmZone(z);
      setIsdmRegion(r);
    };

    if (assignedZone && assignedBranch) {
      const region = NORTH_REGION.includes(assignedBranch)
        ? 'NORTH'
        : SOUTH_REGION.includes(assignedBranch)
          ? 'SOUTH'
          : 'ITALY';
      apply(assignedBranch, assignedZone, region);
      return;
    }

    const legacyZone = assignedZone || String(user.branches?.[0] || '').trim();
    if (!legacyZone) return;

    supabase
      .from('zone_coverage_summary')
      .select('zone, branch, region')
      .ilike('zone', `%${legacyZone}%`)
      .limit(1)
      .then(({ data }) => {
        const row: any = (data as any[] | null)?.[0];
        if (!row) return;
        apply(String(row.branch || ''), String(row.zone || legacyZone), String(row.region || '').toUpperCase());
      });
  }, [user]);

  // Determine available branches based on role
  useEffect(() => {
    if (!user) return;
    
    // Fetch branches that actually have retailers in the database
    supabase
      .from('retailer_summary')
      .select('branch, zone')
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error('Error fetching branches:', error);
          return;
        }
        
        if (data) {
          // Get unique branches from database
          const uniqueBranches = [...new Set(data.map((r: any) => r.branch))];
          
          // Filter based on user role
          let availableBranches: string[] = [];
          if (user.role === 'HS-ADMIN' || user.role === 'COUNTRY-MANAGER' || user.role === 'UK-ADMIN') {
            // Admin and Country Manager can see all standard branches.
            availableBranches = ALL_BRANCHES;
          } else if (user.role === 'RSM') {
            // RSM sees up to 4 assigned branches
            const userBranches = (user.branches || []).map(normalizeBranch);
            availableBranches = userBranches.filter((b: string) => ALL_BRANCHES.includes(b)).slice(0, 4);
          } else if (user.role === 'ASM') {
            // ASM sees only 1 assigned branch
            const userBranches = (user.branches || []).map(normalizeBranch);
            availableBranches = userBranches.filter((b: string) => ALL_BRANCHES.includes(b)).slice(0, 1);
          } else if (user.role === 'ZONE-MANAGER') {
            const b = normalizeBranch(user.branches?.[0] || '');
            availableBranches = b ? [b] : [];
          } else {
            // Other roles only see assigned branches that are present in retailer data
            const userBranches = (user.branches || []).map(normalizeBranch);
            availableBranches = (uniqueBranches as string[])
              .filter((b: string) => ALL_BRANCHES.includes(b))
              .filter((b: string) => userBranches.includes(normalizeBranch(b)));
          }
          
          setBranches(availableBranches);
          if (availableBranches.length > 0 && !selectedBranch) {
            setSelectedBranch(availableBranches[0]);
          }
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fetch available KPI branches from kpi_data table
  useEffect(() => {
    if (!user) return;
    
    supabase
      .from('kpi_data')
      .select('branch, zone')
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error('ERROR fetching KPI branches:', error.message, error);
          return;
        }
        
        if (data && data.length > 0) {
          // Get unique branches from kpi_data
          const uniqueKpiBranches = [...new Set(data.map((r: any) => r.branch))];
          
          // Filter based on user role and region
          let availableKpiBranches: string[] = [];
          if (user.role === 'HS-ADMIN' || user.role === 'COUNTRY-MANAGER' || user.role === 'UK-ADMIN') {
            availableKpiBranches = (uniqueKpiBranches as string[]);
          } else if (user.role === 'ZONE-MANAGER') {
            const b = normalizeBranch(user.branches?.[0] || '');
            availableKpiBranches = b ? [b] : [];
          } else {
            const userBranches = (user.branches || []).map(normalizeBranch);
            availableKpiBranches = (uniqueKpiBranches as string[])
              .filter((b: string) => userBranches.includes(normalizeBranch(b)));
          }

          // If kpiRegion is selected, filter the branch list further
          if (kpiRegion === 'NORTH') {
            availableKpiBranches = availableKpiBranches.filter(b => NORTH_REGION.includes(normalizeBranch(b)));
          } else if (kpiRegion === 'SOUTH') {
            availableKpiBranches = availableKpiBranches.filter(b => SOUTH_REGION.includes(normalizeBranch(b)));
          }
          
          setKpiBranches(availableKpiBranches);
          
          // If the current kpiBranch is not in the filtered list, reset it
          if (user.role !== 'ZONE-MANAGER' && kpiBranch && !availableKpiBranches.includes(kpiBranch)) {
            setKpiBranch('');
          }
          
          // Default region logic for ASM/RSM - open with region results
          if (user.role === 'ASM' || user.role === 'RSM') {
             const userBranch = user.branches?.[0] ? normalizeBranch(user.branches[0]) : '';
             let newRegion = 'ITALY';
             if (NORTH_REGION.includes(userBranch)) newRegion = 'NORTH';
             else if (SOUTH_REGION.includes(userBranch)) newRegion = 'SOUTH';
             
             if (newRegion !== kpiRegion) {
               setKpiRegion(newRegion);
               setKpiBranch(''); // Show all branches in that region by default
             }
          }
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, kpiRegion]);

  // Set ISDM default filters based on user role
  useEffect(() => {
    if (!user) return;

    // Set default ISDM filters based on user role and assigned branches
    if (user.role === 'RSM') {
      // RSM: Set region based on their first assigned branch
      const userBranch = user.branches?.[0] ? normalizeBranch(user.branches[0]) : '';
      let defaultRegion = 'ITALY';
      if (NORTH_REGION.includes(userBranch)) {
        defaultRegion = 'NORTH';
      } else if (SOUTH_REGION.includes(userBranch)) {
        defaultRegion = 'SOUTH';
      }
      setIsdmRegion(defaultRegion);
      setIsdmBranch(''); // Don't pre-select branch, show all in region
    } else if (user.role === 'ASM') {
      // ASM: Set branch as the default
      const userBranch = user.branches?.[0] ? normalizeBranch(user.branches[0]) : '';
      if (userBranch) {
        // Determine region from the branch
        let defaultRegion = 'ITALY';
        if (NORTH_REGION.includes(userBranch)) {
          defaultRegion = 'NORTH';
        } else if (SOUTH_REGION.includes(userBranch)) {
          defaultRegion = 'SOUTH';
        }
        setIsdmRegion(defaultRegion);
        setIsdmBranch(userBranch);
      }
    } else if (user.role === 'ZONE-MANAGER') {
      const b = user.branches?.[0] ? normalizeBranch(user.branches[0]) : '';
      const r = b && NORTH_REGION.includes(b) ? 'NORTH' : b && SOUTH_REGION.includes(b) ? 'SOUTH' : 'ITALY';
      setIsdmRegion(r);
      setIsdmBranch(b);
    } else {
      // Roles with broader access: Show all Italy by default
      setIsdmRegion('ITALY');
      setIsdmBranch('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Update zones when branch changes (and keep no-zone selected on login to show branch-level performance)
  useEffect(() => {
    if (!selectedBranch) {
      setZones([]);
      setSelectedZone('');
      return;
    }
    if (user?.role === 'ZONE-MANAGER') {
      const z = String(user.zone || '').trim();
      setZones(z ? [z] : []);
      setSelectedZone(z);
      return;
    }

    // First try the hardcoded mapping for known branches
    if (BRANCH_TO_ZONES[selectedBranch]) {
      const branchZones = BRANCH_TO_ZONES[selectedBranch];
      setZones(branchZones);
      setSelectedZone('');
      return;
    }

    // If not in hardcoded mapping, fetch zones from database for this branch
    setLoadingRetailers(true);
    supabase
      .from('retailer_summary')
      .select('zone')
      .eq('branch', selectedBranch)
      .limit(15000)
      .then(({ data, error }) => {
        if (!error && data) {
          // Get unique zones including shop closed for selection
          const uniqueZones = [...new Set(data.map((r: any) => r.zone))];
          setZones(uniqueZones);
          setSelectedZone('');
        }
        setLoadingRetailers(false);
      });
  }, [selectedBranch, user]);

  // Update KPI zones when KPI branch changes
  useEffect(() => {
    if (!kpiBranch) {
      setKpiZones([]);
      setKpiZone('');
      return;
    }
    if (user?.role === 'ZONE-MANAGER') {
      const z = String(user.zone || '').trim();
      setKpiZones(z ? [z] : []);
      setKpiZone(z);
      return;
    }

    // First try the hardcoded mapping for known branches
    if (BRANCH_TO_ZONES[kpiBranch]) {
      const branchZones = BRANCH_TO_ZONES[kpiBranch].filter(z => !z.toLowerCase().includes('shop closed'));
      setKpiZones(branchZones);
      setKpiZone('');
      return;
    }

    // If not in hardcoded mapping, fetch zones from kpi_data table for this branch
    supabase
      .from('kpi_data')
      .select('zone')
      .eq('branch', kpiBranch)
      .limit(5000)
      .then(({ data, error }) => {
        if (!error && data) {
          // Get unique zones from kpi_data, excluding shop closed
          const uniqueZones = [...new Set(data.map((r: any) => r.zone))]
            .filter(z => !z.toLowerCase().includes('shop closed'));
          setKpiZones(uniqueZones);
          setKpiZone('');
        }
      });
  }, [kpiBranch, user]);

  // Fetch ISDM branches on user change and region change
  useEffect(() => {
    if (!user) return;
    
    supabase
      .from('isdm_data')
      .select('branch, zone')
      .limit(5000)
      .then(({ data, error }: { data: any; error: any }) => {
        if (error) {
          console.error('ERROR fetching ISDM branches:', error.message, error);
          return;
        }
        
        if (data && data.length > 0) {
          // Get unique branches from isdm_data
          const uniqueIsdmBranches = [...new Set(data.map((r: any) => r.branch).filter(Boolean))];
          
          // Filter based on user role and region
          let availableIsdmBranches: string[] = [];
          if (user.role === 'HS-ADMIN' || user.role === 'COUNTRY-MANAGER' || user.role === 'UK-ADMIN') {
            availableIsdmBranches = (uniqueIsdmBranches as string[]);
          } else if (user.role === 'ZONE-MANAGER') {
            const b = normalizeBranch(user.branches?.[0] || '');
            availableIsdmBranches = b ? [b] : [];
          } else {
            const userBranches = (user.branches || []).map(normalizeBranch);
            availableIsdmBranches = (uniqueIsdmBranches as string[])
              .filter((b: string) => userBranches.includes(normalizeBranch(b)));
          }

          // If isdmRegion is selected, filter the branch list further
          if (isdmRegion === 'NORTH') {
            availableIsdmBranches = availableIsdmBranches.filter(b => NORTH_REGION.includes(normalizeBranch(b)));
          } else if (isdmRegion === 'SOUTH') {
            availableIsdmBranches = availableIsdmBranches.filter(b => SOUTH_REGION.includes(normalizeBranch(b)));
          }
          
          setIsdmBranches(availableIsdmBranches);
          
          // If the current isdmBranch is not in the filtered list, reset it
          if (user.role !== 'ZONE-MANAGER' && isdmBranch && !availableIsdmBranches.includes(isdmBranch)) {
            setIsdmBranch('');
          }
        } else {
          console.warn('No ISDM data found in database');
          setIsdmBranches([]);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isdmRegion]);

  // Update ISDM zones when ISDM branch changes
  useEffect(() => {
    if (!isdmBranch) {
      setIsdmZones([]);
      setIsdmZone('');
      return;
    }
    if (user?.role === 'ZONE-MANAGER') {
      const z = String(user.zone || '').trim();
      setIsdmZones(z ? [z] : []);
      setIsdmZone(z);
      return;
    }

    // Fetch zones from isdm_data table for this branch
    supabase
      .from('isdm_data')
      .select('zone')
      .eq('branch', isdmBranch)
      .limit(5000)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching ISDM zones:', error);
          return;
        }
        if (!error && data) {
          // Get unique zones from isdm_data
          const uniqueZones = [...new Set(data.map((r: any) => r.zone).filter(Boolean))];
          setIsdmZones(uniqueZones);
          setIsdmZone('');
        }
      });
  }, [isdmBranch, user]);

  // Fetch retailers when branch or zone changes
  const fetchRetailers = useCallback(async () => {
    if (!selectedBranch) return;
    setLoadingRetailers(true);

    const query = supabase.from('retailer_summary').select('*').eq('branch', selectedBranch);
    if (selectedZone) {
      if (user?.role === 'ZONE-MANAGER') {
        query.ilike('zone', `%${selectedZone}%`);
      } else {
        query.eq('zone', selectedZone);
      }
    }

    // Check up to 15000 rows to ensure we capture all active retailers
    const { data, error } = await query.order('retailer_id').limit(15000);
    if (!error && data) {
      let filtered = data as RetailerSummary[];
      // If no specific zone selected, show only active (exclude shop closed)
      if (!selectedZone) {
        filtered = filtered.filter(r => !r.zone.toLowerCase().includes('shop closed'));
      }
      // Remove duplicates by retailer_id to ensure accurate count
      const uniqueRetailers = Array.from(new Map(filtered.map(r => [r.retailer_id, r])).values());
      setRetailers(uniqueRetailers);
    }
    setLoadingRetailers(false);
  }, [selectedBranch, selectedZone, user]);

  useEffect(() => {
    fetchRetailers();
    setSelectedRetailerId('');
    setRetailerSearch('');
    setMonthlyData([]);
  }, [fetchRetailers]);

  // Fetch monthly data when retailer changes
  useEffect(() => {
    if (!selectedRetailerId) { setMonthlyData([]); return; }
    setLoadingMonthly(true);
    supabase
      .from('retailer_monthly')
      .select('*')
      .eq('retailer_id', selectedRetailerId)
      .order('month')
      .limit(10000)
      .then(({ data, error }: { data: any; error: any }) => {
        if (!error && data) setMonthlyData(data as RetailerMonthly[]);
        setLoadingMonthly(false);
      });
  }, [selectedRetailerId]);

  // Fetch branch-level monthly data when branch or zone changes
  useEffect(() => {
    if (!selectedBranch) { 
      setBranchMonthlyData([]); 
      setYearlyZoneData([]);
      return; 
    }

    // Fetch from new aggregated table (more reliable for sums/averages)
    // Try both with and without LMIT-HS- prefix to handle potential naming inconsistencies
    const branchShort = selectedBranch.replace('LMIT-HS-', '');
    const aggregatedQuery = supabase
      .from('monthly_zone_sum')
      .select('*')
      .or(`branch.eq."${selectedBranch}",branch.eq."${branchShort}",branch.ilike."%${branchShort}%"`);
    
    if (selectedZone) aggregatedQuery.eq('zone', selectedZone);
    
    aggregatedQuery.order('month').limit(5000).then(({ data, error }: { data: any; error: any }) => {
      if (!error && data && data.length > 0) {
        setYearlyZoneData(data);
        // Also set branchMonthlyData to an empty array or a minimal set to avoid TopRetailersView falling back to it
        setBranchMonthlyData([]);
      } else {
        if (error) console.error('Error fetching monthly_zone_sum:', error);
        
        // Fallback: only if monthly_zone_sum is empty, fetch from original table (limited rows)
        const query = supabase.from('retailer_monthly').select('*').eq('branch', selectedBranch);
        if (selectedZone) query.eq('zone', selectedZone);
        query.order('month').limit(100000).then(({ data: fallbackData, error: fallbackError }) => {
          if (!fallbackError && fallbackData) setBranchMonthlyData(fallbackData as RetailerMonthly[]);
        });
      }
    });
  }, [selectedBranch, selectedZone]);

  const selectedSummary = retailers.find((r: RetailerSummary) => r.retailer_id === selectedRetailerId);
  const filteredRetailers = retailers.filter((r: RetailerSummary) =>
    r.retailer_id.toLowerCase().includes(retailerSearch.toLowerCase())
  );

  const handleExportPDF = async () => {
    if (!selectedSummary || monthlyData.length === 0 || !user) return;
    setExportingPdf(true);
    setPdfProgress(0);
    try {
      setPdfProgress(25);
      await generatePDF(selectedSummary, monthlyData, user, setPdfProgress);
      setPdfProgress(100);
    } catch (e) {
      console.error('PDF export failed:', e);
    }
    setExportingPdf(false);
    setPdfProgress(0);
  };

  const roleLabel = 
    user?.role === 'HS-ADMIN' ? 'Admin' : 
    user?.role === 'COUNTRY-MANAGER' ? 'Country Manager' :
    user?.role === 'UK-ADMIN' ? 'UK Admin' :
    user?.role === 'ADMIN' ? 'Admin Italy' :
    user?.role === 'RSM' ? 'Regional Manager' : 
    user?.role === 'ZONE-MANAGER' ? 'Zone Manager' :
    'Area Manager';

  const roleBadgeColor = 
     user?.role === 'HS-ADMIN' ? 'bg-[#46286E]' : 
     user?.role === 'COUNTRY-MANAGER' ? 'bg-[#FFC8B2] text-[#21264E]' :
     user?.role === 'UK-ADMIN' ? 'bg-[#1E3A8A]' :
     user?.role === 'ADMIN' ? 'bg-[#0EA5E9]' :
     user?.role === 'RSM' ? 'bg-[#006AE0]' : 
     user?.role === 'ZONE-MANAGER' ? 'bg-[#0891B2]' :
     'bg-[#08DC7D]';

  return (
    <div className="flex h-screen bg-[#fff7f2] overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 md:relative 
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${sidebarCollapsed ? 'md:w-[72px]' : 'md:w-64 w-64'} 
        bg-[#21264E] text-white flex flex-col transition-all duration-300 flex-shrink-0
      `}>
        {/* Mobile Close Button */}
        <button 
          onClick={() => setMobileMenuOpen(false)}
          className="md:hidden absolute top-4 right-4 p-2 text-white/60 hover:text-white"
        >
          <X size={20} />
        </button>

        {/* Logo */}
        <div className={`px-4 py-4 border-b border-white/10 flex items-center gap-3 ${sidebarCollapsed && !mobileMenuOpen ? 'justify-center' : 'justify-start'}`}>
          <img
            src={sidebarCollapsed && !mobileMenuOpen 
              ? "https://cms-assets.ldsvcplatform.com/IT/s3fs-public/2023-09/MicrosoftTeams-image%20%2813%29.png"
              : "https://cms-assets.ldsvcplatform.com/IT/s3fs-public/inline-images/logo_new1.png"
            }
            alt="Logo"
            className={`flex-shrink-0 transition-all duration-300 ${sidebarCollapsed && !mobileMenuOpen ? 'md:h-8 md:w-8' : 'h-10 w-auto max-w-full'}`}
          />
          {(!sidebarCollapsed || mobileMenuOpen) && (
            <span className="font-bold text-lg leading-tight whitespace-nowrap">
              <span>Field&nbsp;</span>
              <span className="text-[#006ae0]">IQ</span>
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <button
            onClick={() => { setView(VIEWS.DASHBOARD); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              view === VIEWS.DASHBOARD ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <LayoutDashboard size={20} />
            {(!sidebarCollapsed || mobileMenuOpen) && 'Dashboard'}
          </button>
          <button
            onClick={() => { setView(VIEWS.KPI); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              view === VIEWS.KPI ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <TrendingUp size={20} />
            {(!sidebarCollapsed || mobileMenuOpen) && 'KPI'}
          </button>
          <button
            onClick={() => { setView(VIEWS.ISDM); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              view === VIEWS.ISDM ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Trophy size={20} />
            {(!sidebarCollapsed || mobileMenuOpen) && 'ISDM'}
          </button>
          <button
            onClick={() => { setView(VIEWS.COVERAGE); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              view === VIEWS.COVERAGE ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Globe size={20} />
            {(!sidebarCollapsed || mobileMenuOpen) && 'Coverage'}
          </button>
          <button
            onClick={() => { setView(VIEWS.RETAILER_PERFORMANCE); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              view === VIEWS.RETAILER_PERFORMANCE ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Activity size={20} />
            {(!sidebarCollapsed || mobileMenuOpen) && 'Retailer Performance'}
          </button>
          {user?.role === 'HS-ADMIN' && (
            <button
              onClick={() => { setView(VIEWS.IMPORT); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                view === VIEWS.IMPORT ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Upload size={20} />
              {(!sidebarCollapsed || mobileMenuOpen) && 'Data Import'}
            </button>
          )}
          {user?.role === 'HS-ADMIN' && (
            <button
              onClick={() => { setView(VIEWS.USERS); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                view === VIEWS.USERS ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Users size={20} />
              {(!sidebarCollapsed || mobileMenuOpen) && 'User Management'}
            </button>
          )}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/10">
          {(!sidebarCollapsed || mobileMenuOpen) && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <User size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.full_name}</p>
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${roleBadgeColor} mt-0.5`}>
                    {roleLabel}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-3">
                <Building2 size={12} />
                <span className="truncate">{user?.branches?.join(', ')}</span>
              </div>
            </>
          )}
           <button
             onClick={() => {
               setPasswordError('');
               setShowPasswordModal(true);
             }}
             className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition mb-1"
           >
             <User size={16} />
             {(!sidebarCollapsed || mobileMenuOpen) && 'Change Password'}
           </button>
           <button
             onClick={signOut}
             className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"
           >
             <LogOut size={16} />
             {(!sidebarCollapsed || mobileMenuOpen) && 'Sign Out'}
           </button>
         </div>

        {/* Collapse toggle (only on desktop) */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex p-2.5 text-white/40 hover:text-white text-center border-t border-white/10 items-center justify-center"
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Logo Stripe */}
        <div className="md:hidden bg-[#21264E] py-2 flex justify-center items-center flex-shrink-0">
          <img 
            src="https://cms-assets.ldsvcplatform.com/IT/s3fs-public/inline-images/logo_new1.png" 
            alt="Lyca Group" 
            className="h-8 object-contain"
          />
        </div>

        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:gap-4 flex-shrink-0">
          {/* Mobile Sidebar Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 text-[#21264E] hover:bg-gray-100 rounded-lg self-start"
          >
            <Menu size={20} />
          </button>

          {/* DASHBOARD - Branch selector */}
          {view === VIEWS.DASHBOARD && (
            <div className="w-full md:w-auto flex items-center gap-2">
              <Shield size={16} className="text-[#21264E]" />
              {isZoneManager ? (
                <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold">
                  {selectedBranch || '—'}
                </div>
              ) : (
                <select
                  value={selectedBranch}
                  onChange={e => setSelectedBranch(e.target.value)}
                  className="w-full md:w-auto text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                >
                  {branches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* KPI - Branch selector (independent, from kpi_data table) */}
          {view === VIEWS.KPI && (
            <div className="flex items-center gap-4">
              {/* Region filter */}
              <div className="flex items-center gap-2 min-w-[140px]">
                <Globe size={16} className="text-[#21264E]" />
                {isZoneManager ? (
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold min-w-[140px]">
                    {kpiRegion}
                  </div>
                ) : (
                  <select
                    value={kpiRegion}
                    onChange={e => setKpiRegion(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                  >
                    {hasAllBranchAccess ? (
                      <>
                        <option value="ITALY">ITALY (All)</option>
                        <option value="NORTH">NORTH</option>
                        <option value="SOUTH">SOUTH</option>
                      </>
                    ) : (
                      <option value={kpiRegion}>{kpiRegion}</option>
                    )}
                  </select>
                )}
              </div>

              {/* Branch selector */}
              <div className="flex items-center gap-2 min-w-[180px] max-w-[220px]">
                <Shield size={16} className="text-[#21264E]" />
                {isZoneManager ? (
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold min-w-[180px]">
                    {kpiBranch || '—'}
                  </div>
                ) : (
                  <select
                    value={kpiBranch}
                    onChange={e => setKpiBranch(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                  >
                    <option value="">{kpiRegion === 'ITALY' ? 'All Branches' : `All ${kpiRegion} Branches`}</option>
                    {kpiBranches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {view === VIEWS.RETAILER_PERFORMANCE && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 min-w-[140px]">
                <Globe size={16} className="text-[#21264E]" />
                {isZoneManager ? (
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold min-w-[140px]">
                    {perfRegion}
                  </div>
                ) : (
                  <select
                    value={perfRegion}
                    onChange={e => { setPerfRegion(e.target.value); setPerfBranch(''); setPerfZone(''); }}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                  >
                    {hasAllBranchAccess ? (
                      <>
                        <option value="ITALY">ITALY (All)</option>
                        <option value="NORTH">NORTH</option>
                        <option value="SOUTH">SOUTH</option>
                      </>
                    ) : (
                      <option value={perfRegion}>{perfRegion}</option>
                    )}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 min-w-[180px] max-w-[220px]">
                <Shield size={16} className="text-[#21264E]" />
                {isZoneManager ? (
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold min-w-[180px]">
                    {perfBranch || '—'}
                  </div>
                ) : (
                  <select
                    value={perfBranch}
                    onChange={e => { setPerfBranch(e.target.value); setPerfZone(''); }}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                  >
                    <option value="">{perfRegion === 'ITALY' ? 'All Branches' : `All ${perfRegion} Branches`}</option>
                    {perfBranches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* DASHBOARD - Zone selector */}
          {view === VIEWS.DASHBOARD && (
            <div className="w-full md:w-auto flex items-center gap-2">
              <Building2 size={16} className="text-[#21264E]" />
              {isZoneManager ? (
                <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold">
                  {selectedZone || '—'}
                </div>
              ) : (
                <select
                  value={selectedZone}
                  onChange={e => setSelectedZone(e.target.value)}
                  className="w-full md:w-auto text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                >
                  <option value="">All Zones</option>
                  {zones.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {view === VIEWS.RETAILER_PERFORMANCE && (
            <div className="w-full md:w-auto flex items-center gap-2">
              <Building2 size={16} className="text-[#21264E]" />
              {isZoneManager ? (
                <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold">
                  {perfZone || '—'}
                </div>
              ) : (
                <select
                  value={perfZone}
                  onChange={e => setPerfZone(e.target.value)}
                  className="w-full md:w-auto text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                >
                  <option value="">All Zones</option>
                  {perfZones.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* KPI - Zone selector (independent) */}
          {view === VIEWS.KPI && (
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-[#21264E]" />
              {isZoneManager ? (
                <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-[#21264E] font-semibold">
                  {kpiZone || '—'}
                </div>
              ) : (
                <select
                  value={kpiZone}
                  onChange={e => setKpiZone(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                >
                  <option value="">All Zones</option>
                  {kpiZones.map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* ISDM - Branch and Zone selector similar to KPI */}
          {view === VIEWS.ISDM && (
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              {/* Region filter */}
              <div className="flex items-center gap-2 min-w-max">
                <Globe size={16} className="text-[#21264E]" />
                {isZoneManager ? (
                  <div className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs md:text-sm text-[#21264E] font-semibold">
                    {isdmRegion}
                  </div>
                ) : (
                  <select
                    value={isdmRegion}
                    onChange={e => setIsdmRegion(e.target.value)}
                    className="text-xs md:text-sm border border-gray-200 rounded-lg px-2 md:px-3 py-1.5 md:py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                  >
                    {hasAllBranchAccess ? (
                      <>
                        <option value="ITALY">ITALY (All)</option>
                        <option value="NORTH">NORTH</option>
                        <option value="SOUTH">SOUTH</option>
                      </>
                    ) : (
                      <option value={isdmRegion}>{isdmRegion}</option>
                    )}
                  </select>
                )}
              </div>

              {/* Branch selector */}
              <div className="flex items-center gap-2 min-w-max">
                <Shield size={16} className="text-[#21264E]" />
                {isZoneManager ? (
                  <div className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs md:text-sm text-[#21264E] font-semibold">
                    {isdmBranch || '—'}
                  </div>
                ) : (
                  <select
                    value={isdmBranch}
                    onChange={e => setIsdmBranch(e.target.value)}
                    className="text-xs md:text-sm border border-gray-200 rounded-lg px-2 md:px-3 py-1.5 md:py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                  >
                    <option value="">{isdmRegion === 'ITALY' ? 'All Branches' : `All ${isdmRegion} Branches`}</option>
                    {isdmBranches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Zone selector */}
              <div className="flex items-center gap-2 min-w-max">
                <Building2 size={16} className="text-[#21264E]" />
                {isZoneManager ? (
                  <div className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs md:text-sm text-[#21264E] font-semibold">
                    {isdmZone || '—'}
                  </div>
                ) : (
                  <select
                    value={isdmZone}
                    onChange={e => setIsdmZone(e.target.value)}
                    className="text-xs md:text-sm border border-gray-200 rounded-lg px-2 md:px-3 py-1.5 md:py-2 bg-white text-[#21264E] focus:ring-2 focus:ring-[#245bc1] outline-none"
                  >
                    <option value="">All Zones</option>
                    {isdmZones.map(z => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* View Title for non-dashboard/kpi views */}
          {view === VIEWS.IMPORT && (
            <div className="flex items-center gap-2 text-[#21264E] font-bold">
              <Upload size={18} />
              <span>Data Import</span>
            </div>
          )}
          {view === VIEWS.USERS && (
            <div className="flex items-center gap-2 text-[#21264E] font-bold">
              <Users size={18} />
              <span>User Management</span>
            </div>
          )}
          {view === VIEWS.ISDM && (
            <div className="flex items-center gap-2 text-[#21264E] font-bold">
              <Trophy size={18} />
              <span>ISDM</span>
            </div>
          )}
          {view === VIEWS.COVERAGE && (
            <div className="flex items-center gap-2 text-[#21264E] font-bold">
              <Globe size={18} />
              <span>Coverage</span>
            </div>
          )}
          {view === VIEWS.RETAILER_PERFORMANCE && (
            <div className="flex items-center gap-2 text-[#21264E] font-bold">
              <Activity size={18} />
              <span>Retailer Performance</span>
            </div>
          )}

          {/* Retailer selector - only show for DASHBOARD */}
          {view === VIEWS.DASHBOARD && (
            <div className="relative w-full md:flex-1 md:max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={retailerSearch}
                onChange={e => { setRetailerSearch(e.target.value); setShowRetailerDropdown(true); }}
                onFocus={() => setShowRetailerDropdown(true)}
                placeholder={loadingRetailers ? 'Loading retailers...' : `Search retailers in ${selectedBranch}...`}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none"
              />
              {showRetailerDropdown && filteredRetailers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                  {filteredRetailers.map(r => (
                    <button
                      key={r.retailer_id}
                      onClick={() => {
                        setSelectedRetailerId(r.retailer_id);
                        setRetailerSearch(r.retailer_id);
                        setShowRetailerDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#fff7f2] transition flex items-center justify-between ${
                        r.retailer_id === selectedRetailerId ? 'bg-[#fff7f2] font-medium' : ''
                      }`}
                    >
                      <span className="text-[#21264E]">{r.retailer_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected retailer info - only show for DASHBOARD */}
          {view === VIEWS.DASHBOARD && selectedSummary && (
            <div className="flex items-center gap-2 text-sm">
              <span className={`text-[10px] font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded ${selectedSummary.zone.toLowerCase().includes('shop closed') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                {selectedSummary.zone.toLowerCase().includes('shop closed') ? 'Inactive' : 'Active'}
              </span>
            </div>
          )}

          {/* PDF Export - always on the right if in DASHBOARD view and user has permission */}
          {view === VIEWS.DASHBOARD && selectedSummary && monthlyData.length > 0 && 
           user?.pdf_export_enabled !== false && (
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="w-full md:w-auto md:ml-auto md:self-auto self-end flex items-center justify-center gap-2 px-4 py-2 bg-[#21264E] hover:bg-[#245bc1] text-white text-sm font-medium rounded-lg transition disabled:opacity-50 whitespace-nowrap"
            >
              <FileDown size={16} />
              {exportingPdf ? `Exporting... ${pdfProgress}%` : 'Export PDF'}
            </button>
          )}
         </header>

        {passwordSuccess && (
          <div className="mx-4 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {passwordSuccess}
          </div>
        )}

        {showPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#21264E]/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-bold text-[#21264E]">Change Password</h2>
                  <p className="text-sm text-gray-500 mt-1">Update the password for your account.</p>
                </div>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="p-2 text-gray-400 hover:text-[#21264E] rounded-full transition"
                >
                  <X size={20} />
                </button>
              </div>

              {passwordError && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {passwordError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#21264E]/70 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl text-[#21264E] placeholder:text-gray-400 focus:ring-2 focus:ring-[#245bc1] outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-3">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[#21264E] hover:bg-[#245bc1] text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {changingPassword ? 'Saving...' : 'Save Password'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Click-away listener for dropdown */}
        {showRetailerDropdown && (
          <div className="fixed inset-0 z-40" onClick={() => setShowRetailerDropdown(false)} />
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {view === VIEWS.USERS && user?.role === 'HS-ADMIN' ? (
            <UserManagement />
          ) : view === VIEWS.IMPORT && user?.role === 'HS-ADMIN' ? (
            <DataImport user={user} />
          ) : view === VIEWS.COVERAGE ? (
            <CoverageView user={user} />
          ) : view === VIEWS.RETAILER_PERFORMANCE ? (
            <RetailerPerformanceReport user={user} region={perfRegion} branch={perfBranch} zone={perfZone} />
          ) : view === VIEWS.KPI ? (
            <KPIAnalysis user={user} branch={kpiBranch} zone={kpiZone} region={kpiRegion} />
          ) : view === VIEWS.ISDM ? (
            <ISDM user={user} branch={isdmBranch} zone={isdmZone} region={isdmRegion} />
          ) : !selectedRetailerId ? (
            <TopRetailersView 
              retailers={retailers}
              branch={selectedBranch}
              loading={loadingRetailers}
              branchMonthlyData={branchMonthlyData}
              yearlyZoneData={yearlyZoneData}
              selectedZone={selectedZone}
            />
          ) : loadingMonthly ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-[#21264E]">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading retailer data...
              </div>
            </div>
          ) : selectedSummary ? (
            <RetailerAnalysis
              summary={selectedSummary}
              monthlyData={monthlyData}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
