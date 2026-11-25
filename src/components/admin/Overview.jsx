import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';

const DEPARTMENTS = [
  { code: 'BSIT', name: 'Information Technology' },
  { code: 'BSHM', name: 'Hospitality Management' },
  { code: 'BSCRIM', name: 'Criminology' },
  { code: 'BSAB', name: 'Agribusiness' },
];

const matchesDept = (value, code) => {
  const v = (value || '').trim().toUpperCase();
  if (code === 'BSAB') return ['BSAB', 'BSAGRI', 'AGRE', 'AGRI'].includes(v);
  if (code === 'BSIT') return ['BSIT', 'IT'].includes(v);
  if (code === 'BSHM') return ['BSHM', 'HM'].includes(v);
  if (code === 'BSCRIM') return ['BSCRIM', 'CRIM'].includes(v);
  return v === code;
};

const DEPT_COLORS = {
  BSIT: '#7c3aed',   // purple
  BSHM: '#eab308',   // yellow-gold
  BSCRIM: '#b45309', // deep gold
  BSAB: '#059669',   // green
};
const ALL_COLOR = '#059669';
const deptColor = (code) => DEPT_COLORS[code] || ALL_COLOR;
const getDeptCode = (value) => {
  const found = Object.keys(DEPT_COLORS).find((c) => matchesDept(value, c));
  return found || 'BSIT';
};

const getDeptBadge = (value) => {
  const code = getDeptCode(value);
  if (code === 'BSIT') return 'bg-purple-100 text-purple-800 border-purple-200';
  if (code === 'BSHM') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (code === 'BSCRIM') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
};

const getDeptRowClass = (code, selected) => {
  if (code === 'BSIT') {
    return selected
      ? 'bg-[#e9d5ff] font-semibold ring-1 ring-inset ring-purple-400'
      : 'bg-[#f3e8ff] hover:bg-[#e9d5ff]';
  }
  if (code === 'BSHM') {
    return selected
      ? 'bg-[#fef08a] font-semibold ring-1 ring-inset ring-amber-400'
      : 'bg-[#fef9c3] hover:bg-[#fef08a]';
  }
  if (code === 'BSCRIM') {
    return selected
      ? 'bg-[#fecdd3] font-semibold ring-1 ring-inset ring-rose-400'
      : 'bg-[#ffe4e6] hover:bg-[#fecdd3]';
  }
  return selected
    ? 'bg-[#bbf7d0] font-semibold ring-1 ring-inset ring-emerald-400'
    : 'bg-[#dcfce7] hover:bg-[#bbf7d0]';
};

// ---- Monitoring helpers ----
const INACTIVE_DAYS = 4; // an active intern with no log for 4+ days is flagged

// daily_logs.hours is stored as text like "9h" or "9h 30m"
const parseHours = (s) => {
  if (!s) return 0;
  const h = String(s).match(/(\d+)\s*h/);
  const m = String(s).match(/(\d+)\s*m/);
  return (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) / 60 : 0);
};

const daysSince = (d) => {
  if (!d) return null;
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(Math.floor((Date.now() - t) / 86400000), 0);
};

const STATUS = {
  inactive:   { label: 'Inactive',         tone: 'rose',    rank: 0 },
  nologs:     { label: 'No logs yet',      tone: 'amber',   rank: 1 },
  pending:    { label: 'Pending approval', tone: 'amber',   rank: 2 },
  unassigned: { label: 'Unassigned',       tone: 'slate',   rank: 3 },
  ontrack:    { label: 'On track',         tone: 'emerald', rank: 4 },
  completed:  { label: 'Completed',        tone: 'blue',    rank: 5 },
};

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
};

const Chip = ({ tone = 'slate', children }) => (
  <span className={`inline-block whitespace-nowrap text-[11px] font-medium px-2 py-0.5 rounded-full border ${TONES[tone]}`}>
    {children}
  </span>
);

const Card = ({ children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>{children}</div>
);

const CardHeader = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const LinkButton = ({ onClick, children }) => (
  <button onClick={onClick} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline">
    {children}
  </button>
);

const Avatar = ({ person, size = 'w-8 h-8' }) =>
  person?.avatar_url ? (
    <img src={person.avatar_url} alt="" className={`${size} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0`}>
      {person?.first_name?.charAt(0)}{person?.last_name?.charAt(0)}
    </div>
  );

function Overview({ onNavigate }) {
  const [isLoading, setIsLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');

  const [allStudents, setAllStudents] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [allReports, setAllReports] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [allLogs, setAllLogs] = useState([]);

  // Monitor table controls
  const [coordSearch, setCoordSearch] = useState('');

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: adminProfile } = await supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single();
        if (adminProfile?.first_name) setAdminName(adminProfile.first_name);
      }

      const [studentsRes, profilesRes, companiesRes, reportsRes, supsRes, logsRes] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, department, company_id, avatar_url, company_status, created_at').eq('role', 'student'),
        supabase.from('profiles').select('id, first_name, last_name, department, avatar_url'),
        supabase.from('companies').select('*'),
        supabase.from('saved_journals').select('id, user_id, week_number, file_name, created_at').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, first_name, last_name, department, company_id, avatar_url').eq('role', 'supervisor'),
        supabase.from('daily_logs').select('user_id, date, hours, created_at'),
      ]);

      setAllStudents(studentsRes.data || []);
      setAllProfiles(profilesRes.data || []);
      setAllCompanies(companiesRes.data || []);
      setAllReports(reportsRes.data || []);
      setSupervisors(supsRes.data || []);
      setAllLogs(logsRes.data || []);
    } catch (error) {
      console.error('Dashboard Fetch Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchDashboardData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchDashboardData]);

  // Per-department stats
  const deptStats = {};
  DEPARTMENTS.forEach((d) => {
    const list = allStudents.filter((s) => matchesDept(s.department, d.code));
    const active = list.filter((s) => s.company_status === 'active').length;
    const unassigned = list.filter((s) => !s.company_id || s.company_status === 'unassigned').length;
    deptStats[d.code] = { total: list.length, active, unassigned, rate: list.length ? Math.round((active / list.length) * 100) : 0 };
  });

  // Filtered data
  const displayedStudents = selectedDept === 'ALL' ? allStudents : allStudents.filter((s) => matchesDept(s.department, selectedDept));
  const displayedCompanies = selectedDept === 'ALL' ? allCompanies : allCompanies.filter((c) => !c.department || c.department === selectedDept);
  const displayedIds = new Set(displayedStudents.map((s) => s.id));
  const displayedReports = allReports.filter((r) => displayedIds.has(r.user_id));
  const displayedSupervisors = selectedDept === 'ALL' ? supervisors : supervisors.filter((s) => matchesDept(s.department, selectedDept));

  const totalInterns = displayedStudents.length;
  const activeCount = displayedStudents.filter((s) => s.company_status === 'active').length;
  const unassignedCount = displayedStudents.filter((s) => !s.company_id || s.company_status === 'unassigned').length;
  const placementRate = totalInterns ? Math.round((activeCount / totalInterns) * 100) : 0;

  // Weekly chart
  const weekCounts = {};
  displayedReports.forEach((r) => {
    const w = r.week_number || 'Other';
    const student = allStudents.find((s) => s.id === r.user_id);
    const code = getDeptCode(student?.department);
    if (!weekCounts[w]) weekCounts[w] = { total: 0, byDept: {} };
    weekCounts[w].total += 1;
    weekCounts[w].byDept[code] = (weekCounts[w].byDept[code] || 0) + 1;
  });
  const chartData = Object.keys(weekCounts).sort().map((w) => ({
    week: `Wk ${String(w).replace(/week/i, '').trim()}`,
    count: weekCounts[w].total,
    byDept: weekCounts[w].byDept,
  }));
  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  // Company capacity
  const companyStats = displayedCompanies
    .map((c) => {
      const assigned = displayedStudents.filter((s) => s.company_id === c.id && s.company_status === 'active').length;
      const percentage = c.capacity > 0 ? Math.round((assigned / c.capacity) * 100) : 0;
      return { ...c, assigned, percentage };
    })
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);

  const recentReports = displayedReports.slice(0, 5).map((r) => ({
    ...r,
    student: allProfiles.find((p) => p.id === r.user_id),
  }));

  // ---- Monitoring: what needs the admin's attention ----
  const reportedIds = new Set(allReports.map((r) => r.user_id));
  const noReportStudents = displayedStudents
    .filter((s) => s.company_status === 'active' && !reportedIds.has(s.id))
    .map((s) => ({ ...s, companyName: allCompanies.find((c) => String(c.id) === String(s.company_id))?.name || 'Partner company' }));
  const companiesNoCoord = displayedCompanies.filter(
    (c) => !supervisors.some((s) => String(s.company_id) === String(c.id))
  );

  const compliance = DEPARTMENTS.map((d) => {
    const deployed = allStudents.filter((s) => matchesDept(s.department, d.code) && s.company_status === 'active');
    const reported = deployed.filter((s) => reportedIds.has(s.id)).length;
    return { code: d.code, name: d.name, deployed: deployed.length, reported, rate: deployed.length ? Math.round((reported / deployed.length) * 100) : 0 };
  });

  // ---- Intern monitor: hours, last activity, status per intern ----
  const logsByUser = {};
  allLogs.forEach((l) => {
    const u = (logsByUser[l.user_id] = logsByUser[l.user_id] || { hours: 0, count: 0, lastDate: null });
    u.hours += parseHours(l.hours);
    u.count += 1;
    const d = l.date || l.created_at;
    if (d && (!u.lastDate || String(d) > String(u.lastDate))) u.lastDate = d;
  });

  const lastReportByUser = {};
  allReports.forEach((r) => { if (!lastReportByUser[r.user_id]) lastReportByUser[r.user_id] = r.created_at; }); // already newest-first

  const reportsByUser = {};
  allReports.forEach((r) => {
    const u = (reportsByUser[r.user_id] = reportsByUser[r.user_id] || { weeks: new Set(), count: 0 });
    const w = parseInt(String(r.week_number).replace(/\D/g, ''), 10);
    if (w) u.weeks.add(w);
    u.count += 1;
  });

  const internRows = displayedStudents.map((s) => {
    const company = allCompanies.find((c) => String(c.id) === String(s.company_id));
    const coord = supervisors.find((p) => s.company_id && String(p.company_id) === String(s.company_id));
    const lg = logsByUser[s.id] || { hours: 0, count: 0, lastDate: null };
    const required = company?.required_hours || 0;
    const pct = required ? Math.min(Math.round((lg.hours / required) * 100), 100) : 0;
    const idle = daysSince(lg.lastDate || s.created_at);

    let key = 'ontrack';
    if (!s.company_id || s.company_status === 'unassigned' || !s.company_status) key = 'unassigned';
    else if (s.company_status === 'pending') key = 'pending';
    else if (required && lg.hours >= required) key = 'completed';
    else if (idle !== null && idle >= INACTIVE_DAYS) key = 'inactive';
    else if (!lg.count) key = 'nologs';

    return {
      ...s, company, coord, hours: lg.hours, required, pct, lastLog: lg.lastDate, idle,
      lastReport: lastReportByUser[s.id] || null, statusKey: key,
      reportWeeks: reportsByUser[s.id]?.weeks || new Set(), reportCount: reportsByUser[s.id]?.count || 0,
    };
  });

  const internCounts = { 
    all: internRows.length,
    nologs: internRows.filter((r) => r.company_status === 'active' && !r.hours).length,
  };
  Object.keys(STATUS).forEach((k) => { 
    if (k !== 'nologs') internCounts[k] = internRows.filter((r) => r.statusKey === k).length; 
  });
  internCounts.noreport = internRows.filter((r) => r.company_status === 'active' && !r.reportCount).length;
  // ---- Coordinator monitor ----
  const coordRows = displayedSupervisors.map((c) => {
    const company = allCompanies.find((x) => String(x.id) === String(c.company_id));
    const interns = c.company_id ? allStudents.filter((s) => String(s.company_id) === String(c.company_id)) : [];
    const internIds = new Set(interns.map((i) => i.id));
    const active = interns.filter((i) => i.company_status === 'active');
    const pending = interns.filter((i) => i.company_status === 'pending').length;
    const reports = allReports.filter((r) => internIds.has(r.user_id)).length;
    const noReport = active.filter((i) => !reportedIds.has(i.id)).length;
    const inactive = internRows.filter((r) => r.statusKey === 'inactive' && String(r.company_id) === String(c.company_id)).length;

    let label = 'All clear', tone = 'emerald', rank = 4;
    if (!c.company_id) { label = 'No company'; tone = 'amber'; rank = 1; }
    else if (pending > 0) { label = `${pending} pending`; tone = 'amber'; rank = 2; }
    if (c.company_id && (inactive > 0 || noReport > 0)) { label = inactive > 0 ? `${inactive} inactive` : `${noReport} no report`; tone = 'rose'; rank = 0; }
    else if (c.company_id && !pending && !active.length) { label = 'No interns yet'; tone = 'slate'; rank = 3; }

    return { ...c, company, active: active.length, pending, reports, noReport, inactive, label, tone, rank };
  })
    .filter((c) => `${c.first_name} ${c.last_name} ${c.company?.name || ''}`.toLowerCase().includes(coordSearch.trim().toLowerCase()))
    .sort((a, b) => a.rank - b.rank || (a.last_name || '').localeCompare(b.last_name || ''));

  const coordsWithPending = coordRows.filter((c) => c.pending > 0).length;

  // Placement donut: one coloured segment per program (or just the selected program)
  const DONUT_C = 263.9;
  const donutPrograms = selectedDept === 'ALL' ? DEPARTMENTS.map((d) => d.code) : [selectedDept];
  const { segments: rawDonutSegments } = donutPrograms.reduce(
    (acc, code) => {
      const deployed = displayedStudents.filter((s) => matchesDept(s.department, code) && s.company_status === 'active').length;
      const len = totalInterns ? (deployed / totalInterns) * DONUT_C : 0;
      const seg = { code, deployed, len, offset: acc.offset };
      return { offset: acc.offset + len, segments: [...acc.segments, seg] };
    },
    { offset: 0, segments: [] }
  );
  const donutSegments = rawDonutSegments.filter((seg) => seg.len > 0);

  const goToInterns = (filter = 'all') => onNavigate && onNavigate('Intern Monitor', { filter });

  const attention = [
    { label: 'Unassigned students', value: unassignedCount, hint: 'Still need a host company', cta: 'Open students', tab: 'Add Student' },
    { label: 'Inactive interns', value: internCounts.inactive, hint: `No log in ${INACTIVE_DAYS}+ days`, cta: 'See who', onClick: () => goToInterns('inactive') },
    { label: 'No time logs yet', value: internCounts.nologs, hint: 'Deployed, zero hours logged', cta: 'See who', onClick: () => goToInterns('nologs') },
    { label: 'No report yet', value: noReportStudents.length, hint: 'Deployed, nothing submitted', cta: 'See who', onClick: () => goToInterns('noreport') },
    { label: 'Companies without coordinator', value: companiesNoCoord.length, hint: 'No OJT coordinator linked', cta: 'Open coordinators', tab: 'Add Supervisor' },
    { label: 'Coordinators with a queue', value: coordsWithPending, hint: 'Have pending approvals', cta: 'See coordinators', onClick: () => document.getElementById('coordinator-monitor')?.scrollIntoView({ behavior: 'smooth' }) },
  ];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  const kpis = [
    { label: selectedDept === 'ALL' ? 'Total interns' : `${selectedDept} interns`, value: totalInterns, note: 'Enrolled this term' },
    { label: 'Deployed', value: activeCount, note: `${placementRate}% placement rate` },
    { label: 'Awaiting placement', value: unassignedCount, note: unassignedCount > 0 ? 'Needs a host company' : 'All students placed', warn: unassignedCount > 0 },
    { label: 'Reports submitted', value: displayedReports.length, note: 'Weekly progress journals' },
  ];

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 animate-fade-in max-w-7xl mx-auto w-full">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">
            {adminName ? `Welcome back, ${adminName}` : 'Internship overview'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Placement, activity and reporting status across all programs.</p>
        </div>

        {/* Program filter */}
        <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg overflow-x-auto hide-scrollbar">
          {[{ code: 'ALL', label: 'All' }, ...DEPARTMENTS.map((d) => ({ code: d.code, label: d.code }))].map((opt) => (
            <button
              key={opt.code}
              onClick={() => setSelectedDept(opt.code)}
              style={selectedDept === opt.code ? { backgroundColor: opt.code === 'ALL' ? ALL_COLOR : deptColor(opt.code), color: opt.code === 'BSHM' ? '#1c1917' : '#fff' } : undefined}
              className={`px-3 py-1.5 rounded-md text-xs font-medium shrink-0 transition-colors flex items-center gap-1.5 ${
                selectedDept === opt.code ? '' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {opt.code !== 'ALL' && selectedDept !== opt.code && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: deptColor(opt.code) }} />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <p className="text-xs font-medium text-slate-500">{k.label}</p>
            <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${k.warn ? 'text-amber-600' : 'text-slate-900'}`}>
              {k.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{k.note}</p>
          </Card>
        ))}
      </div>

      {/* Needs attention */}
      <Card>
        <CardHeader title="Needs attention" subtitle="Items that may be holding up OJT progress. Click one to jump to it." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 sm:p-5">
          {attention.map((a) => {
            const hasItems = a.value > 0;
            return (
              <div
                key={a.label}
                onClick={() => hasItems && (a.onClick ? a.onClick() : onNavigate && onNavigate(a.tab))}
                className={`text-left p-4 rounded-xl border flex flex-col justify-between transition-all ${
                  hasItems
                    ? 'bg-[#fef9c3] border-[#fde047] hover:bg-[#fef08a] hover:border-amber-400 hover:shadow-xs cursor-pointer'
                    : 'bg-[#dcfce7] border-[#86efac] cursor-default'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold ${hasItems ? 'text-amber-900' : 'text-emerald-900'}`}>
                      {a.label}
                    </span>
                  </div>
                  <p className={`mt-2 text-2xl font-bold tabular-nums ${hasItems ? 'text-amber-950' : 'text-emerald-950'}`}>
                    {a.value}
                  </p>
                  <p className={`mt-0.5 text-xs font-medium ${hasItems ? 'text-amber-800' : 'text-emerald-800'}`}>
                    {hasItems ? a.hint : 'All clear'}
                  </p>
                </div>
                {hasItems && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 text-amber-950 bg-white hover:bg-amber-50 text-xs font-semibold shadow-2xs transition-colors">
                      {a.cta}
                      <svg className="w-3 h-3 text-amber-700" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Coordinator monitor */}
      <Card className="scroll-mt-4">
        <div id="coordinator-monitor" />
        <CardHeader
          title="Coordinator monitor"
          subtitle="Workload and follow-through for each OJT coordinator"
          action={
            <div className="flex items-center gap-3">
              <input
                value={coordSearch}
                onChange={(e) => setCoordSearch(e.target.value)}
                placeholder="Search coordinator or company"
                className="w-full sm:w-56 px-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
              <LinkButton onClick={() => onNavigate && onNavigate('Add Supervisor')}>Manage</LinkButton>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="font-medium px-5 py-2.5">Coordinator</th>
                <th className="font-medium px-3 py-2.5">Company</th>
                <th className="font-medium px-3 py-2.5 text-right">Active interns</th>
                <th className="font-medium px-3 py-2.5 text-right">Pending</th>
                <th className="font-medium px-3 py-2.5 text-right">Reports</th>
                <th className="font-medium px-3 py-2.5 text-right">No report</th>
                <th className="font-medium px-5 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coordRows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">No coordinators to show.</td></tr>
              ) : (
                coordRows.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar person={c} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">{c.first_name} {c.last_name}</p>
                          <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getDeptBadge(c.department)}`}>
                            {getDeptCode(c.department)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {c.company ? <span className="truncate block max-w-[220px]">{c.company.name}</span> : <span className="text-amber-600">Unassigned</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {c.active}{c.company?.capacity ? <span className="text-slate-400"> / {c.company.capacity}</span> : null}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums ${c.pending > 0 ? 'text-amber-600 font-medium' : 'text-slate-700'}`}>{c.pending}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{c.reports}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${c.noReport > 0 ? 'text-rose-600 font-medium' : 'text-slate-700'}`}>{c.noReport}</td>
                    <td className="px-5 py-3 text-right"><Chip tone={c.tone}>{c.label}</Chip></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Programs table */}
      <Card>
        <CardHeader title="Placement by program" subtitle="Click a row to filter the dashboard" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="font-medium px-5 py-2.5">Program</th>
                <th className="font-medium px-3 py-2.5 text-right">Students</th>
                <th className="font-medium px-3 py-2.5 text-right">Deployed</th>
                <th className="font-medium px-3 py-2.5 text-right">Unassigned</th>
                <th className="font-medium px-5 py-2.5 w-56">Placement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {DEPARTMENTS.map((d) => {
                const s = deptStats[d.code];
                const selected = selectedDept === d.code;
                return (
                  <tr
                    key={d.code}
                    onClick={() => setSelectedDept(selected ? 'ALL' : d.code)}
                    className={`cursor-pointer transition-colors ${getDeptRowClass(d.code, selected)}`}
                  >
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-bold text-slate-900">{d.code}</p>
                        <p className="text-xs text-slate-600 font-medium">{d.name}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-800 font-medium">{s.total}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-800 font-medium">{s.active}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${s.unassigned > 0 ? 'text-amber-800 font-bold' : 'text-slate-800 font-medium'}`}>{s.unassigned}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-black/10 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.rate}%`, backgroundColor: deptColor(d.code) }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-800 font-semibold w-9 text-right">{s.rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Report monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Report compliance" subtitle="Deployed students who have submitted at least one report" />
          <div className="p-5 flex flex-col gap-4">
            {compliance.map((c) => (
              <div key={c.code}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: deptColor(c.code) }} />
                    {c.code}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {c.reported}/{c.deployed} reporting · {c.rate}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c.rate}%`, backgroundColor: deptColor(c.code) }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Deployed, no report yet"
            subtitle="Follow up with these students"
            action={noReportStudents.length > 0 ? (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{noReportStudents.length}</span>
            ) : null}
          />
          <div className="p-5 flex flex-col gap-3">
            {noReportStudents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Every deployed student has submitted a report.</p>
            ) : (
              noReportStudents.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <Avatar person={s} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.first_name} {s.last_name}</p>
                    <p className="text-xs text-slate-500 truncate">{s.companyName}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: deptColor(getDeptCode(s.department)) }} />
                    {getDeptCode(s.department)}
                  </span>
                </div>
              ))
            )}
            {noReportStudents.length > 5 && (
              <p className="text-xs text-slate-500 pt-1">+ {noReportStudents.length - 5} more</p>
            )}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="flex flex-col">
          <CardHeader title="Placement rate" subtitle={selectedDept === 'ALL' ? 'All programs' : selectedDept} />
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="9" />
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.code}
                    cx="50" cy="50" r="42" fill="none" stroke={deptColor(seg.code)} strokeWidth="9"
                    strokeDasharray={`${seg.len} ${DONUT_C - seg.len}`} strokeDashoffset={-seg.offset}
                    className="transition-all duration-700 ease-out"
                  >
                    <title>{`${seg.code}: ${seg.deployed} deployed`}</title>
                  </circle>
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold text-slate-900 tabular-nums">{placementRate}%</span>
                <span className="text-xs text-slate-500">placed</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 text-xs text-slate-600">
              {donutPrograms.map((code) => (
                <span key={code} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: deptColor(code) }} />
                  {code} {displayedStudents.filter((s) => matchesDept(s.department, code) && s.company_status === 'active').length}
                </span>
              ))}
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300" />Unassigned {unassignedCount}</span>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader
            title="Weekly report submissions"
            subtitle="Journals filed per week"
            action={
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500">
                  {Object.keys(DEPT_COLORS).map((c) => (
                    <span key={c} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: deptColor(c) }} />{c}
                    </span>
                  ))}
                </div>
                <LinkButton onClick={() => onNavigate && onNavigate('Student Report')}>View all</LinkButton>
              </div>
            }
          />
          <div className="flex-1 px-5 pt-5 pb-4">
            {chartData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-slate-400">No reports submitted yet.</div>
            ) : (
              <div className="h-44 flex items-end gap-3 border-b border-slate-200">
                {chartData.map((d) => (
                  <div key={d.week} className="flex-1 min-w-[36px] max-w-[72px] mx-auto flex flex-col items-center justify-end h-full group">
                    <span className="text-xs font-medium text-slate-700 tabular-nums mb-1">{d.count}</span>
                    <div
                      className="w-full rounded-t overflow-hidden flex flex-col-reverse"
                      style={{ height: `${Math.max((d.count / maxCount) * 80, 6)}%` }}
                    >
                      {Object.keys(DEPT_COLORS).filter((c) => d.byDept[c]).map((c) => (
                        <div
                          key={c}
                          title={`${c}: ${d.byDept[c]}`}
                          style={{ flex: d.byDept[c], backgroundColor: deptColor(c) }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {chartData.length > 0 && (
              <div className="flex gap-3 pt-2">
                {chartData.map((d) => (
                  <span key={d.week} className="flex-1 min-w-[36px] max-w-[72px] mx-auto text-center text-xs text-slate-500">{d.week}</span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Company capacity" action={<LinkButton onClick={() => onNavigate && onNavigate('Add Company')}>Manage</LinkButton>} />
          <div className="p-5 flex flex-col gap-4">
            {companyStats.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No partner companies yet.</p>
            ) : (
              companyStats.map((c) => {
                const full = c.percentage >= 100;
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-medium text-slate-800 truncate pr-3">{c.name}</span>
                      <span className={`text-xs tabular-nums shrink-0 ${full ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
                        {c.assigned}/{c.capacity}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(c.percentage, 100)}%`, backgroundColor: full ? '#f43f5e' : deptColor(getDeptCode(c.department)) }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Latest submissions" action={<LinkButton onClick={() => onNavigate && onNavigate('Student Report')}>View all</LinkButton>} />
          <div className="p-5 flex flex-col gap-3">
            {recentReports.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No reports submitted yet.</p>
            ) : (
              recentReports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onNavigate && onNavigate('Student Report')}
                  className="flex items-center gap-3 text-left rounded-md -mx-2 px-2 py-1 hover:bg-slate-50 transition-colors"
                >
                  <Avatar person={r.student} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.student?.first_name} {r.student?.last_name}</p>
                    <p className="text-xs text-slate-500 truncate">Week {r.week_number || '—'} · {r.file_name}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Overview;