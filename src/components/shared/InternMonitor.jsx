import { useState, useEffect, useMemo, useCallback } from 'react';
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

const DEPT_COLORS = { BSIT: '#7c3aed', BSHM: '#eab308', BSCRIM: '#b45309', BSAB: '#059669' };
const deptColor = (code) => DEPT_COLORS[code] || '#059669';
const getDeptCode = (value) => Object.keys(DEPT_COLORS).find((c) => matchesDept(value, c)) || 'BSIT';

const getDeptBadge = (value) => {
  const code = getDeptCode(value);
  if (code === 'BSIT') return 'bg-purple-100 text-purple-800 border-purple-200';
  if (code === 'BSHM') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (code === 'BSCRIM') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
};

const INACTIVE_DAYS = 4;
const NEAR_DONE_PCT = 90;
const PAGE_SIZE = 20;

// daily_logs.hours is stored as text like "9h" or "9h 30m"
const parseHours = (s) => {
  if (!s) return 0;
  const h = String(s).match(/(\d+)\s*h/);
  const m = String(s).match(/(\d+)\s*m/);
  return (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) / 60 : 0);
};

const toDate = (d) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d);

const daysSince = (d) => {
  if (!d) return null;
  const t = toDate(d).getTime();
  return Number.isNaN(t) ? null : Math.max(Math.floor((Date.now() - t) / 86400000), 0);
};

const fmtShort = (d) => {
  if (!d) return '—';
  const dt = toDate(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'nologs', label: 'No logs' },
  { key: 'noreport', label: 'No report' },
  { key: 'pending', label: 'Pending' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'ontrack', label: 'On track' },
  { key: 'completed', label: 'Completed' },
];

const Chip = ({ tone = 'slate', children }) => (
  <span className={`inline-block whitespace-nowrap text-[11px] font-medium px-2 py-0.5 rounded-full border ${TONES[tone]}`}>
    {children}
  </span>
);

const Avatar = ({ person, size = 'w-8 h-8' }) =>
  person?.avatar_url ? (
    <img src={person.avatar_url} alt="" className={`${size} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0`}>
      {person?.first_name?.charAt(0)}{person?.last_name?.charAt(0)}
    </div>
  );

function InternMonitor({ onNavigate, initialFilter = 'all', reportsTab = 'Student Report' }) {
  // Open Progress Reports with this intern's name already typed into the search box
  const viewReports = (r) => onNavigate && onNavigate(reportsTab, { search: `${r.first_name} ${r.last_name}`.trim() });

  const [isLoading, setIsLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);

  const [search, setSearch] = useState('');
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  const [filter, setFilter] = useState(initialFilter);
  const [program, setProgram] = useState('ALL');
  const [sortBy, setSortBy] = useState('priority');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Jumping here from a dashboard shortcut should apply that filter
  if (initialFilter !== prevInitialFilter) {
    setPrevInitialFilter(initialFilter);
    setFilter(initialFilter);
    setVisibleCount(PAGE_SIZE);
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [stuRes, compRes, supRes, repRes, logRes] = await Promise.all([
        supabase.from('profiles').select('id, first_name, last_name, username, department, company_id, avatar_url, company_status, created_at').eq('role', 'student'),
        supabase.from('companies').select('*'),
        supabase.from('profiles').select('id, first_name, last_name, company_id').eq('role', 'supervisor'),
        supabase.from('saved_journals').select('id, user_id, week_number, created_at').order('created_at', { ascending: false }),
        supabase.from('daily_logs').select('user_id, date, hours, created_at'),
      ]);
      setStudents(stuRes.data || []);
      setCompanies(compRes.data || []);
      setSupervisors(supRes.data || []);
      setReports(repRes.data || []);
      setLogs(logRes.data || []);
    } catch (error) {
      console.error('Intern monitor fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Build one row per intern: hours, last activity, report weeks, status
  const rows = useMemo(() => {
    const logsByUser = {};
    logs.forEach((l) => {
      const u = (logsByUser[l.user_id] = logsByUser[l.user_id] || { hours: 0, count: 0, lastDate: null });
      u.hours += parseHours(l.hours);
      u.count += 1;
      const d = l.date || l.created_at;
      if (d && (!u.lastDate || String(d) > String(u.lastDate))) u.lastDate = d;
    });

    const lastReportByUser = {};
    const reportsByUser = {};
    reports.forEach((r) => {
      if (!lastReportByUser[r.user_id]) lastReportByUser[r.user_id] = r.created_at; // newest first
      const u = (reportsByUser[r.user_id] = reportsByUser[r.user_id] || { weeks: new Set(), count: 0 });
      const w = parseInt(String(r.week_number).replace(/\D/g, ''), 10);
      if (w) u.weeks.add(w);
      u.count += 1;
    });

    return students.map((s) => {
      const company = companies.find((c) => String(c.id) === String(s.company_id));
      const coord = supervisors.find((p) => s.company_id && String(p.company_id) === String(s.company_id));
      const lg = logsByUser[s.id] || { hours: 0, count: 0, lastDate: null };
      const required = company?.required_hours || 0;
      const pct = required ? Math.min(Math.round((lg.hours / required) * 100), 100) : 0;
      const idle = daysSince(lg.lastDate || s.created_at);
      const rep = reportsByUser[s.id] || { weeks: new Set(), count: 0 };

      let key = 'ontrack';
      if (!s.company_id || s.company_status === 'unassigned' || !s.company_status) key = 'unassigned';
      else if (s.company_status === 'pending') key = 'pending';
      else if (required && lg.hours >= required) key = 'completed';
      else if (idle !== null && idle >= INACTIVE_DAYS) key = 'inactive';
      else if (!lg.count) key = 'nologs';

      return {
        ...s, company, coord, hours: lg.hours, required, pct, lastLog: lg.lastDate, idle,
        lastReport: lastReportByUser[s.id] || null, statusKey: key,
        reportWeeks: rep.weeks, reportCount: rep.count,
        isDeployed: !!s.company_id && s.company_status === 'active',
        deptCode: getDeptCode(s.department),
      };
    });
  }, [students, companies, supervisors, reports, logs]);

  const reportWeekCount = useMemo(
    () => Math.min(Math.max(4, ...reports.map((r) => parseInt(String(r.week_number).replace(/\D/g, ''), 10) || 0)), 5),
    [reports]
  );

  // Rows that match the program + search, used for chip counts so they reflect what you typed
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (program !== 'ALL' && !matchesDept(r.department, program)) return false;
      if (!q) return true;
      const hay = `${r.first_name} ${r.last_name} ${r.username || ''} ${r.company?.name || ''} ${r.coord ? `${r.coord.first_name} ${r.coord.last_name}` : ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, program, search]);

  const counts = useMemo(() => {
    const c = { 
      all: scoped.length, 
      noreport: scoped.filter((r) => r.isDeployed && !r.reportCount).length,
      nologs: scoped.filter((r) => r.isDeployed && !r.lastLog).length,
    };
    Object.keys(STATUS).forEach((k) => { 
      if (k !== 'nologs') c[k] = scoped.filter((r) => r.statusKey === k).length; 
    });
    return c;
  }, [scoped]);

  const nearDone = scoped.filter((r) => r.statusKey === 'ontrack' && r.pct >= NEAR_DONE_PCT).length;

  const visible = useMemo(() => {
    const list = scoped.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 'noreport') return r.isDeployed && !r.reportCount;
      if (filter === 'nologs') return r.isDeployed && !r.lastLog;
      return r.statusKey === filter;
    });
    const byName = (a, b) => (a.last_name || '').localeCompare(b.last_name || '') || (a.first_name || '').localeCompare(b.first_name || '');
    if (sortBy === 'name') return [...list].sort(byName);
    if (sortBy === 'hours') return [...list].sort((a, b) => b.pct - a.pct || byName(a, b));
    if (sortBy === 'recent') return [...list].sort((a, b) => String(b.lastLog || '').localeCompare(String(a.lastLog || '')) || byName(a, b));
    return [...list].sort((a, b) => STATUS[a.statusKey].rank - STATUS[b.statusKey].rank || byName(a, b));
  }, [scoped, filter, sortBy]);

  const shown = visible.slice(0, visibleCount);
  const hasActiveFilters = search || filter !== 'all' || program !== 'ALL';
  const clearAll = () => { setSearch(''); setFilter('all'); setProgram('ALL'); setVisibleCount(PAGE_SIZE); };

  const kpis = [
    { label: 'Interns', value: counts.all },
    { label: 'Needs follow-up', value: counts.inactive + counts.nologs, warn: counts.inactive + counts.nologs > 0, note: 'Inactive or no logs' },
    { label: 'Near completion', value: nearDone, note: `${NEAR_DONE_PCT}%+ of hours rendered` },
    { label: 'Completed', value: counts.completed, note: 'Reached required hours' },
  ];

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-5 animate-fade-in max-w-7xl mx-auto w-full">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Intern monitor</h2>
          <p className="text-sm text-slate-500 mt-0.5">Hours, activity and report status for every intern.</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => onNavigate && onNavigate('Dashboard')} className="font-medium text-emerald-700 hover:underline">
            Back to dashboard
          </button>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500">{k.label}</p>
            <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${k.warn ? 'text-amber-600' : 'text-slate-900'}`}>{k.value}</p>
            {k.note && <p className="mt-0.5 text-xs text-slate-500">{k.note}</p>}
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white border border-slate-200 rounded-lg">
        {/* Search + program + sort */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 pt-4 pb-3">
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
              placeholder="Search by intern name, username, company or coordinator"
              autoFocus
              className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-md outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={program}
              onChange={(e) => { setProgram(e.target.value); setVisibleCount(PAGE_SIZE); }}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-emerald-600"
              aria-label="Filter by program"
            >
              <option value="ALL">All programs</option>
              {DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2.5 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 outline-none focus:border-emerald-600"
              aria-label="Sort interns"
            >
              <option value="priority">Sort: Needs attention first</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="hours">Sort: Most hours done</option>
              <option value="recent">Sort: Latest log</option>
            </select>
          </div>
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1.5 px-5 pb-3 border-b border-slate-100 overflow-x-auto hide-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setVisibleCount(PAGE_SIZE); }}
              className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                filter === f.key ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="font-medium px-5 py-2.5">Intern</th>
                <th className="font-medium px-3 py-2.5">Company / coordinator</th>
                <th className="font-medium px-3 py-2.5 w-52">Hours rendered</th>
                <th className="font-medium px-3 py-2.5">Last log</th>
                <th className="font-medium px-3 py-2.5">Weekly reports</th>
                <th className="font-medium px-3 py-2.5 text-right">Status</th>
                <th className="font-medium px-5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-14 text-center">
                  <div className="w-6 h-6 mx-auto border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
                </td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center">
                  <p className="text-sm text-slate-500">
                    {search ? <>No interns match “{search}”.</> : 'No interns match this view.'}
                  </p>
                  {hasActiveFilters && (
                    <button onClick={clearAll} className="mt-2 text-xs font-medium text-emerald-700 hover:underline">Clear search and filters</button>
                  )}
                </td></tr>
              ) : (
                shown.map((r) => {
                  const st = STATUS[r.statusKey];
                  const label = r.statusKey === 'inactive' ? `Inactive ${r.idle}d` : st.label;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar person={r} />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">{r.first_name} {r.last_name}</p>
                            <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getDeptBadge(r.deptCode)}`}>
                              {r.deptCode}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-slate-800 truncate max-w-[220px]">{r.company?.name || '—'}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[220px]">
                          {r.coord ? `${r.coord.first_name} ${r.coord.last_name}` : r.company ? 'No coordinator' : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {r.isDeployed ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${r.pct}%`, backgroundColor: deptColor(r.deptCode) }} />
                            </div>
                            <span className="text-xs tabular-nums text-slate-600 w-24 text-right">
                              {r.hours.toFixed(0)} / {r.required || '—'} h
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 tabular-nums">{fmtShort(r.lastLog)}</td>
                      <td className="px-3 py-3">
                        {r.isDeployed ? (
                          <button
                            onClick={() => viewReports(r)}
                            title="View this intern's reports"
                            className="text-left group"
                          >
                            <div className="flex items-center gap-1">
                              {Array.from({ length: reportWeekCount }, (_, i) => i + 1).map((w) => (
                                <span
                                  key={w}
                                  title={`Week ${w}: ${r.reportWeeks.has(w) ? 'submitted' : 'not submitted'}`}
                                  className={`w-6 h-5 rounded text-[10px] font-medium flex items-center justify-center border ${
                                    r.reportWeeks.has(w) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-300 border-slate-200'
                                  }`}
                                >
                                  W{w}
                                </span>
                              ))}
                            </div>
                            <p className={`mt-1 text-[11px] group-hover:underline ${r.reportCount ? 'text-slate-500' : 'text-rose-600 font-medium'}`}>
                              {r.reportCount ? `${r.reportCount} submitted · last ${fmtShort(r.lastReport)}` : 'No report yet'}
                            </p>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right"><Chip tone={st.tone}>{label}</Chip></td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => viewReports(r)}
                          className="px-3 py-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: count + pagination */}
        {!isLoading && visible.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
            <span className="tabular-nums">Showing {shown.length} of {visible.length} intern{visible.length === 1 ? '' : 's'}</span>
            {visible.length > shown.length && (
              <button onClick={() => setVisibleCount((n) => n + PAGE_SIZE)} className="font-medium text-emerald-700 hover:underline">
                Show {Math.min(PAGE_SIZE, visible.length - shown.length)} more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default InternMonitor;