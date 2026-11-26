import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { useToast } from '../common/ToastProvider';
import {
  getDepartmentBadge,
  getNormalizedDeptCode,
  matchesDepartment,
} from '../../constants/departments';

function Approvals({ onNavigate }) {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [department, setDepartment] = useState('');
  const [students, setStudents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [tab, setTab] = useState('pending'); // pending | approved
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: coordProfile } = await supabase
        .from('profiles')
        .select('department')
        .eq('id', user.id)
        .single();

      const dept = getNormalizedDeptCode(coordProfile?.department);
      setDepartment(dept);

      const [stuRes, compRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, username, avatar_url, department, company_id, company_status')
          .eq('role', 'student')
          .order('first_name', { ascending: true }),
        supabase.from('companies').select('id, name, department'),
      ]);

      setCompanies(compRes.data || []);
      setStudents(
        dept ? (stuRes.data || []).filter((s) => matchesDepartment(s.department, dept)) : []
      );
    } catch (error) {
      console.error('Approvals fetch error:', error);
      toast.error('Failed to load approvals.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const companyName = (id) =>
    companies.find((c) => String(c.id) === String(id))?.name || 'Partner Company';

  const updateStudent = async (studentId, updates, successMsg) => {
    setProcessingId(studentId);
    try {
      const { error } = await supabase.from('profiles').update(updates).eq('id', studentId);
      if (error) throw error;
      await fetchData();
      toast.success(successMsg);
    } catch (error) {
      toast.error('Action failed: ' + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprove = (s) =>
    updateStudent(s.id, { company_status: 'active' }, `${s.first_name} approved.`);

  const handleDecline = (s) => {
    if (!window.confirm(`Decline ${s.first_name} ${s.last_name}'s placement request?`)) return;
    return updateStudent(
      s.id,
      { company_id: null, company_status: 'unassigned' },
      `${s.first_name}'s request declined.`
    );
  };

  const handleUnapprove = (s) => {
    if (!window.confirm(`Unapprove ${s.first_name} ${s.last_name}? They will go back to pending.`)) return;
    return updateStudent(s.id, { company_status: 'pending' }, `${s.first_name} moved back to pending.`);
  };

  const pending = students.filter((s) => s.company_status === 'pending' && s.company_id);
  const approved = students.filter((s) => s.company_status === 'active' && s.company_id);
  const list = tab === 'pending' ? pending : approved;

  const q = searchQuery.trim().toLowerCase();
  const filtered = list.filter((s) => {
    if (!q) return true;
    const hay = `${s.first_name || ''} ${s.last_name || ''} ${s.username || ''} ${companyName(s.company_id)}`.toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 animate-fade-in max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Placement Approvals</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {department
              ? <>Approve or decline <span className="font-medium text-slate-800">{department}</span> interns' host company requests.</>
              : 'Set your department in Settings to review placement requests.'}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-xs disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              tab === 'pending' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending ({pending.length})
          </button>
          <button
            onClick={() => setTab('approved')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              tab === 'approved' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Approved ({approved.length})
          </button>
        </div>
        <input
          type="text"
          placeholder="Search intern or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:max-w-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
        />
      </div>

      {isLoading ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-xs">
          <h3 className="text-sm font-semibold text-slate-800 mb-1">
            {tab === 'pending' ? 'All caught up' : 'No approved interns yet'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {tab === 'pending'
              ? 'No placement requests are waiting for your approval.'
              : 'Approved interns will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Intern</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Program</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Requested Company</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const busy = processingId === s.id;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {s.avatar_url ? (
                            <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {s.first_name?.charAt(0)}{s.last_name?.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-slate-900 leading-tight">{s.first_name} {s.last_name}</p>
                            <p className="text-[11px] text-slate-400">{s.username ? `@${s.username}` : '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getDepartmentBadge(s.department)}`}>
                          {s.department || department}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">{companyName(s.company_id)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {tab === 'pending' ? (
                            <>
                              <button
                                onClick={() => handleDecline(s)}
                                disabled={busy}
                                className="px-3 py-1 rounded-md text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 cursor-pointer"
                              >
                                Decline
                              </button>
                              <button
                                onClick={() => handleApprove(s)}
                                disabled={busy}
                                className="px-3.5 py-1 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs disabled:opacity-50 cursor-pointer"
                              >
                                {busy ? '...' : 'Approve'}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleUnapprove(s)}
                              disabled={busy}
                              className="px-3 py-1 rounded-md text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-50 cursor-pointer"
                            >
                              {busy ? '...' : 'Unapprove'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {onNavigate && (
        <div>
          <button
            onClick={() => onNavigate('Dashboard')}
            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
          >
            ← Back to dashboard
          </button>
        </div>
      )}
    </div>
  );
}

export default Approvals;

