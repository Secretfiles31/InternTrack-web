import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';
import { useToast } from '../common/ToastProvider';

const PRIORITY_STYLES = {
  urgent: { label: 'Urgent', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  important: { label: 'Important', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  normal: { label: 'Normal', badge: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const EMPTY_FORM = {
  title: '',
  body: '',
  priority: 'normal',
  target_scope: 'company',
  target_department: '',
  target_company_id: '',
  is_pinned: false,
  expires_at: '',
};

function AnnouncementsManager({ onNavigate, mode = 'supervisor' }) {
  const toast = useToast();
  const isAdmin = mode === 'admin';

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'pinned' | 'urgent'

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUser(user);

      const [{ data: profileData }, { data: companiesData }, { data: annData, error: annError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, role, department, company_id')
          .eq('id', user.id)
          .single(),
        supabase.from('companies').select('id, name, department').order('name', { ascending: true }),
        supabase
          .from('announcements')
          .select('*')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

      if (annError) {
        if (
          annError.message?.includes('schema cache') ||
          annError.code === '42P01' ||
          annError.code === 'PGRST205'
        ) {
          setSchemaMissing(true);
          setStaffProfile(profileData || null);
          setCompanies(companiesData || []);
          setAnnouncements([]);
          return;
        }
        throw annError;
      }

      setSchemaMissing(false);
      setStaffProfile(profileData || null);
      setCompanies(companiesData || []);
      setAnnouncements(annData || []);
    } catch (error) {
      toast.error(error?.message || 'Failed to load announcements.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingId(null);
    const defaultScope = isAdmin
      ? 'all'
      : staffProfile?.company_id
        ? 'company'
        : 'department';

    setFormData({
      ...EMPTY_FORM,
      target_scope: defaultScope,
      target_department: staffProfile?.department || DEPARTMENT_OPTIONS[0].value,
      target_company_id: staffProfile?.company_id ? String(staffProfile.company_id) : '',
    });
    setIsFormOpen(true);
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setFormData({
      title: item.title || '',
      body: item.body || '',
      priority: item.priority || 'normal',
      target_scope: item.target_scope || 'company',
      target_department: item.target_department || staffProfile?.department || '',
      target_company_id: item.target_company_id ? String(item.target_company_id) : '',
      is_pinned: Boolean(item.is_pinned),
      expires_at: item.expires_at ? item.expires_at.slice(0, 10) : '',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.body.trim()) {
      toast.error('Please enter both an announcement title and message.');
      return;
    }

    if (!currentUser) {
      toast.error('Session expired. Please log in again.');
      return;
    }

    let resolvedCompanyId = null;
    let resolvedDept = null;

    if (formData.target_scope === 'company') {
      const compId = isAdmin ? formData.target_company_id : staffProfile?.company_id;
      if (!compId) {
        toast.error('Please select a target partner company.');
        return;
      }
      resolvedCompanyId = Number(compId);
    } else if (formData.target_scope === 'department') {
      const dept = isAdmin ? formData.target_department : staffProfile?.department;
      if (!dept) {
        toast.error('Please select a target department.');
        return;
      }
      resolvedDept = dept;
    }

    const authorName = staffProfile?.first_name
      ? `${staffProfile.first_name} ${staffProfile.last_name || ''}`.trim()
      : isAdmin
        ? 'OJT Administrator'
        : 'OJT Coordinator';

    const payload = {
      author_id: currentUser.id,
      author_name: authorName,
      title: formData.title.trim(),
      body: formData.body.trim(),
      priority: formData.priority,
      target_scope: formData.target_scope,
      target_company_id: resolvedCompanyId,
      target_department: resolvedDept,
      is_pinned: formData.is_pinned,
      expires_at: formData.expires_at ? new Date(`${formData.expires_at}T23:59:59`).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        toast.success('Announcement updated.');
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert([payload]);
        if (error) throw error;
        toast.success('Announcement posted to students.');
      }
      setIsFormOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(error?.message || 'Unable to save announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTogglePin = async (item) => {
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_pinned: !item.is_pinned, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      setAnnouncements((prev) =>
        prev
          .map((a) => (a.id === item.id ? { ...a, is_pinned: !a.is_pinned } : a))
          .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at) - new Date(a.created_at))
      );
      toast.success(!item.is_pinned ? 'Announcement pinned to top.' : 'Announcement unpinned.');
    } catch (error) {
      toast.error(error?.message || 'Failed to update pin status.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      setAnnouncements((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Announcement deleted.');
    } catch (error) {
      toast.error(error?.message || 'Failed to delete announcement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCompanyName = (compId) => {
    if (!compId) return 'Assigned Company';
    return companies.find((c) => String(c.id) === String(compId))?.name || `Company #${compId}`;
  };

  const visibleAnnouncements = announcements.filter((item) => {
    if (filterMode === 'pinned') return item.is_pinned;
    if (filterMode === 'urgent') return item.priority === 'urgent';
    return true;
  });

  const canModifyItem = (item) => isAdmin || (currentUser && item.author_id === currentUser.id);

  return (
    <div className="p-5 md:p-6 flex flex-col gap-5 animate-fade-in max-w-7xl mx-auto w-full font-sans">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h1 className="text-2xl font-normal tracking-tight text-slate-900">
            Announcements
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Broadcast notices and reminders directly to students on web & mobile.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          {onNavigate && (
            <>
              <button onClick={() => onNavigate('Dashboard')} className="text-emerald-600 hover:underline cursor-pointer">
                Home
              </button>
              <span>/</span>
            </>
          )}
          <span className="text-slate-600 font-medium">Announcements</span>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-white border border-slate-200/90 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'all', label: `All (${announcements.length})` },
            { id: 'pinned', label: `Pinned (${announcements.filter((a) => a.is_pinned).length})` },
            { id: 'urgent', label: `Urgent (${announcements.filter((a) => a.priority === 'urgent').length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                filterMode === tab.id
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Post Announcement
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : schemaMissing ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h2 className="text-sm font-bold text-amber-900">Supabase Announcements Setup Required</h2>
          <p className="text-xs text-amber-800 mt-1">
            The <code className="font-mono font-semibold">public.announcements</code> table has not been created in your Supabase project yet. Run <code className="font-mono font-semibold">supabase_setup.sql</code> (or the Announcements SQL snippet) in your <strong>Supabase Dashboard &rarr; SQL Editor</strong>, then refresh this page.
          </p>
        </div>
      ) : visibleAnnouncements.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">No announcements yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Click &ldquo;Post Announcement&rdquo; above to send updates to your interns.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {visibleAnnouncements.map((item) => {
            const pStyle = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.normal;
            const isExpired = item.expires_at && new Date(item.expires_at) < new Date();
            const audienceLabel =
              item.target_scope === 'all'
                ? 'All Programs'
                : item.target_scope === 'department'
                  ? `${item.target_department || 'Department'} Interns`
                  : getCompanyName(item.target_company_id);

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-lg p-4 md:p-5 transition-colors ${
                  item.is_pinned ? 'border-emerald-300 ring-1 ring-emerald-500/15' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {item.is_pinned && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Pinned
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${pStyle.badge}`}>
                        {pStyle.label}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Audience: {audienceLabel}
                      </span>
                      {isExpired && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                          Expired
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-bold text-slate-900">{item.title}</h2>
                    <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-line leading-relaxed">
                      {item.body}
                    </p>

                    <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
                      <span>Posted by <strong className="text-slate-600">{item.author_name || 'OJT Staff'}</strong></span>
                      <span>&bull;</span>
                      <span>{new Date(item.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      {item.expires_at && (
                        <>
                          <span>&bull;</span>
                          <span>Expires {new Date(item.expires_at).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {canModifyItem(item) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleTogglePin(item)}
                        className="px-2.5 py-1.5 rounded border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        {item.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        onClick={() => openEditModal(item)}
                        className="px-2.5 py-1.5 rounded border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="px-2.5 py-1.5 rounded border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Compose / Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingId ? 'Edit Announcement' : 'New Announcement'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Weekly Report Deadline Reminder"
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Message *</label>
                <textarea
                  rows={4}
                  required
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  placeholder="Write your announcement for students here..."
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 focus:outline-none focus:border-emerald-600 resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Audience</label>
                  <select
                    value={formData.target_scope}
                    onChange={(e) => setFormData({ ...formData, target_scope: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="all">All Students</option>
                    {(isAdmin || staffProfile?.company_id) && (
                      <option value="company">
                        {isAdmin ? 'Specific Company' : `My Assigned Interns (${getCompanyName(staffProfile?.company_id)})`}
                      </option>
                    )}
                    <option value="department">
                      {isAdmin ? 'Specific Department' : `My Department (${staffProfile?.department || 'Program'})`}
                    </option>
                  </select>
                </div>
              </div>

              {isAdmin && formData.target_scope === 'department' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Program / Department</label>
                  <select
                    value={formData.target_department}
                    onChange={(e) => setFormData({ ...formData, target_department: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    {DEPARTMENT_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.value} &mdash; {d.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {isAdmin && formData.target_scope === 'company' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Partner Company</label>
                  <select
                    value={formData.target_company_id}
                    onChange={(e) => setFormData({ ...formData, target_company_id: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="">Select company...</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_pinned}
                    onChange={(e) => setFormData({ ...formData, is_pinned: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 accent-emerald-600"
                  />
                  Pin announcement to top
                </label>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expires On (optional)</label>
                  <input
                    type="date"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-md border border-slate-300 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingId ? 'Save Changes' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-base font-bold text-slate-900">Delete Announcement</h3>
            <p className="text-xs text-slate-600 mt-2">
              Are you sure you want to delete &ldquo;{deleteTarget.title}&rdquo;? Students will no longer see it.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 rounded-md border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {isSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnnouncementsManager;

