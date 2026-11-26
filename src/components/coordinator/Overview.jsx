import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { useToast } from '../common/ToastProvider';
import {
  getDepartmentBadge as getDeptBadge,
  getNormalizedDeptCode,
  matchesDepartment,
} from '../../constants/departments';

function Overview({ onNavigate }) {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [coordinatorName, setCoordinatorName] = useState('');
  const [department, setDepartment] = useState('');
  const [hasDepartment, setHasDepartment] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Dashboard Data States
  const [metrics, setMetrics] = useState({
    totalInterns: 0,
    pendingInterns: 0,
    activeInterns: 0,
    totalReports: 0,
    totalCompanies: 0,
    totalCapacity: 0,
  });

  const [chartData, setChartData] = useState([]);
  const [activeRoster, setActiveRoster] = useState([]);
  const [recentReports, setRecentReports] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Get Coordinator Profile
      const { data: coordProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, department')
        .eq('id', user.id)
        .single();

      if (coordProfile) {
        if (coordProfile.first_name) {
          setCoordinatorName(`${coordProfile.first_name} ${coordProfile.last_name || ''}`.trim());
        }

        const coordDept = getNormalizedDeptCode(coordProfile.department);
        setDepartment(coordDept);

        if (!coordDept) {
          setHasDepartment(false);
          setIsLoading(false);
          return;
        }

        setHasDepartment(true);

        // 2. Fetch Data relevant to this coordinator's department
        const [studentsRes, companiesRes, reportsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, first_name, last_name, company_id, avatar_url, company_status, department')
            .eq('role', 'student'),
          supabase.from('companies').select('*'),
          supabase
            .from('saved_journals')
            .select('id, user_id, week_number, file_name, created_at')
            .order('created_at', { ascending: false }),
        ]);

        const allCompanies = companiesRes.data || [];
        const companyById = Object.fromEntries(allCompanies.map((c) => [String(c.id), c]));
        const deptCompanies = allCompanies.filter((c) => matchesDepartment(c.department, coordDept));
        const totalCapacity = deptCompanies.reduce((sum, c) => sum + (Number(c.capacity) || 0), 0);

        const students = (studentsRes.data || []).filter((s) => matchesDepartment(s.department, coordDept));
        const allReports = reportsRes.data || [];

        // Filter reports to only include this department's students
        const studentIds = new Set(students.map((s) => s.id));
        const deptReports = allReports.filter((r) => studentIds.has(r.user_id));

        // 3. Compute Metrics
        const pendingCount = students.filter((s) => s.company_status === 'pending').length;
        const activeCount = students.filter((s) => s.company_status === 'active').length;

        setMetrics({
          totalInterns: students.length,
          pendingInterns: pendingCount,
          activeInterns: activeCount,
          totalReports: deptReports.length,
          totalCompanies: deptCompanies.length,
          totalCapacity,
        });

        // 4. Compute Chart Data (Reports per week)
        const weekCounts = {};
        deptReports.forEach((r) => {
          const w = r.week_number ? `Week ${r.week_number}` : 'Other';
          weekCounts[w] = (weekCounts[w] || 0) + 1;
        });

        const sortedWeeks = Object.keys(weekCounts).sort((a, b) => {
          const na = parseInt(a.replace(/\D/g, ''), 10);
          const nb = parseInt(b.replace(/\D/g, ''), 10);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        });
        const formattedChartData = sortedWeeks.map((week) => ({
          week: week.replace('Week ', 'Wk '),
          count: weekCounts[week],
        }));
        setChartData(formattedChartData);

        // 5. Format Active Roster
        const activeStus = students
          .filter((s) => s.company_status === 'active')
          .slice(0, 6)
          .map((s) => ({
            ...s,
            companyName: companyById[String(s.company_id)]?.name || 'Partner Company',
          }));
        setActiveRoster(activeStus);

        // 6. Format Recent Reports
        const recent = deptReports.slice(0, 5).map((r) => {
          const student = students.find((s) => s.id === r.user_id);
          return { ...r, student };
        });
        setRecentReports(recent);

        // 7. Format Pending Requests
        const pending = students
          .filter((s) => s.company_status === 'pending')
          .map((s) => ({
            ...s,
            companyName: companyById[String(s.company_id)]?.name || 'Requested Company',
          }));
        setPendingRequests(pending);
      }
    } catch (error) {
      console.error('Coordinator Dashboard Fetch Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchDashboardData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchDashboardData]);

  // --- APPROVAL LOGIC ---
  const handleAcceptRequest = async (studentId) => {
    setProcessingId(studentId);
    try {
      await supabase.from('profiles').update({ company_status: 'active' }).eq('id', studentId);
      await fetchDashboardData();
      toast.success('Intern placement approved.');
    } catch (error) {
      toast.error('Failed to accept: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (studentId) => {
    if (!window.confirm('Are you sure you want to decline this intern placement?')) return;
    setProcessingId(studentId);
    try {
      await supabase.from('profiles').update({ company_id: null, company_status: 'unassigned' }).eq('id', studentId);
      await fetchDashboardData();
      toast.info('Intern placement declined.');
    } catch (error) {
      toast.error('Failed to decline: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Capacity calculations across partner companies in this department
  const totalSlots = metrics.totalCapacity;
  const assigned = metrics.activeInterns;
  const assignedPercentage = totalSlots > 0 ? Math.min(100, Math.round((assigned / totalSlots) * 100)) : 0;
  const strokeDasharray = 283;
  const strokeDashoffset = strokeDasharray - (strokeDasharray * assignedPercentage) / 100;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center py-24">
        <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasDepartment) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 animate-fade-in w-full">
        <div className="p-8 rounded-xl border border-slate-200 bg-white text-center max-w-md shadow-xs">
          <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900 mb-1.5">No Department Assigned</h2>
          <p className="text-xs text-slate-500 leading-relaxed mb-4">
            Your OJT coordinator account is not assigned to a department yet. Set your department in Settings or contact your school administrator.
          </p>
          <button
            onClick={() => onNavigate && onNavigate('Settings')}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  const kpis = [
    {
      label: 'Active Interns',
      value: metrics.activeInterns,
      note: totalSlots > 0 ? `${assignedPercentage}% of ${department} slots filled` : 'No partner companies yet',
      accent: 'emerald',
      onClick: () => onNavigate && onNavigate('Intern Monitor'),
      icon: (
        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Pending Approvals',
      value: metrics.pendingInterns,
      note: metrics.pendingInterns > 0 ? 'Action required in queue' : 'All applications reviewed',
      warn: metrics.pendingInterns > 0,
      icon: (
        <svg className={`w-4 h-4 ${metrics.pendingInterns > 0 ? 'text-amber-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Department Interns',
      value: metrics.totalInterns,
      note: `Across ${metrics.totalCompanies} partner ${metrics.totalCompanies === 1 ? 'company' : 'companies'}`,
      accent: 'slate',
      onClick: () => onNavigate && onNavigate('List of Interns'),
      icon: (
        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      label: 'Reports Submitted',
      value: metrics.totalReports,
      note: 'Weekly journals received',
      accent: 'slate',
      onClick: () => onNavigate && onNavigate('Journals'),
      icon: (
        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 animate-fade-in max-w-7xl mx-auto w-full">
      {/* Top Welcome Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
            {coordinatorName ? `Welcome back, ${coordinatorName}` : 'Coordinator Overview'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitoring <span className="font-medium text-slate-800">{department}</span> interns, partner placements, and weekly progress.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate && onNavigate('Intern Monitor')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
          >
            Intern Monitor
          </button>
          <button
            onClick={() => onNavigate && onNavigate('Companies')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
          >
            Partner Companies
          </button>
          <button
            onClick={() => onNavigate && onNavigate('Journals')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
          >
            Weekly Journals
          </button>
        </div>
      </div>

      {/* KPI Cards Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            onClick={kpi.onClick}
            className={`bg-white rounded-xl border p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-colors ${
              kpi.onClick ? 'cursor-pointer hover:border-slate-300' : ''
            } ${kpi.warn ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                {kpi.label}
              </span>
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                {kpi.icon}
              </div>
            </div>
            <div className="my-2">
              <span className={`text-2xl sm:text-3xl font-bold tracking-tight ${kpi.warn ? 'text-amber-700' : 'text-slate-900'}`}>
                {kpi.value}
              </span>
            </div>
            <p className={`text-xs ${kpi.warn ? 'text-amber-700 font-medium' : 'text-slate-500'}`}>
              {kpi.note}
            </p>
          </div>
        ))}
      </div>

      {/* 2-Column Analytics & Operational Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Capacity Donut */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Department Capacity</h3>
              <p className="text-xs text-slate-500">{department} placement slots utilization</p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
              {assigned} / {totalSlots} Slots
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-4">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="9" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#059669"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900">{assignedPercentage}%</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Filled</span>
              </div>
            </div>

            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span className="text-xs text-slate-600 font-medium">Active ({assigned})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span className="text-xs text-slate-600 font-medium">Available ({Math.max(0, totalSlots - assigned)})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Submissions Bar Chart */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Weekly Submissions</h3>
              <p className="text-xs text-slate-500">Distribution of submitted journals by week</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('Journals')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              View all &rarr;
            </button>
          </div>

          <div className="flex-1 flex items-end justify-around h-[180px] w-full pt-4 relative border-b border-slate-200">
            {chartData.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <svg className="w-8 h-8 mb-1.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs italic">No weekly reports submitted yet</span>
              </div>
            ) : (
              chartData.map((data, index) => {
                const maxCount = Math.max(...chartData.map((d) => d.count), 1);
                const heightPercentage = Math.max(12, (data.count / maxCount) * 100);
                return (
                  <div key={index} className="flex flex-col items-center group w-1/8 max-w-[50px]">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold mb-1 px-1.5 py-0.5 rounded bg-slate-800 text-white shadow-xs">
                      {data.count}
                    </span>
                    <div
                      className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-t-md transition-all duration-500 cursor-pointer"
                      style={{ height: `${heightPercentage}%` }}
                    />
                    <span className="text-[11px] font-medium text-slate-600 mt-2 whitespace-nowrap">
                      {data.week}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 3-Column Operational Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Pending Approvals Queue */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Pending Approvals</h3>
              {pendingRequests.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {pendingRequests.length}
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">Review queue</span>
          </div>

          <div className="flex flex-col gap-2.5 flex-1">
            {pendingRequests.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center text-slate-400">
                <svg className="w-8 h-8 mb-1.5 text-emerald-500/80" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs font-medium text-slate-600">All caught up</p>
                <p className="text-[11px] text-slate-400">No applications waiting for confirmation</p>
              </div>
            ) : (
              pendingRequests.slice(0, 4).map((req) => (
                <div key={req.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    {req.avatar_url ? (
                      <img src={req.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {req.first_name?.charAt(0)}{req.last_name?.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {req.first_name} {req.last_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 ${getDeptBadge(req.department)}`}>
                          {req.department || department}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate">{req.companyName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200/60">
                    <button
                      onClick={() => handleDeclineRequest(req.id)}
                      disabled={processingId === req.id}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleAcceptRequest(req.id)}
                      disabled={processingId === req.id}
                      className="px-3 py-1 rounded-md text-[11px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                    >
                      {processingId === req.id ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Approve'
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 2. Active Intern Roster */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Active Roster</h3>
            <button
              onClick={() => onNavigate && onNavigate('List of Interns')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              See all &rarr;
            </button>
          </div>

          <div className="flex flex-col divide-y divide-slate-100 flex-1">
            {activeRoster.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p className="text-xs italic">No active interns placed yet</p>
              </div>
            ) : (
              activeRoster.map((student) => (
                <div key={student.id} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {student.avatar_url ? (
                      <img src={student.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">
                        {student.first_name} {student.last_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 ${getDeptBadge(student.department)}`}>
                          {student.department || department}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate">{student.companyName}</span>
                      </div>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. Latest Submissions Feed */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent Journals</h3>
            <button
              onClick={() => onNavigate && onNavigate('Journals')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              See all &rarr;
            </button>
          </div>

          <div className="flex flex-col divide-y divide-slate-100 flex-1">
            {recentReports.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p className="text-xs italic">No weekly reports submitted yet</p>
              </div>
            ) : (
              recentReports.map((report) => (
                <div key={report.id} className="py-2.5 flex items-center justify-between gap-2 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">
                        {report.student?.first_name} {report.student?.last_name}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {report.file_name ? report.file_name.replace(/\.json$/i, '.docx') : 'Weekly Progress Report'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                    W{report.week_number}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Overview;

