import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { DEPARTMENT_OPTIONS, getDepartmentBadge } from '../../constants/departments';
import { validateImageFile } from '../../utils/fileValidation';

function AddSupervisor({ onNavigate }) {
  const [department, setDepartment] = useState('');
  const [supervisors, setSupervisors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('grid');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [supervisorToDelete, setSupervisorToDelete] = useState(null);
  const [activeSupervisorId, setActiveSupervisorId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [feedback, setFeedback] = useState({ show: false, type: '', message: '' });

  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    department: 'BSIT',
    password: '',
    confirm_password: '',
    avatar_url: ''
  });

  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    const handleThemeChange = () => setIsDarkMode(localStorage.getItem('theme') === 'dark');
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const fetchAdminAndSupervisors = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: adminProfile } = await supabase.from('profiles').select('department').eq('id', user.id).single();
      let adminDept = adminProfile ? adminProfile.department : '';
      setDepartment(adminDept);

      // Fetch all OJT coordinators across departments
      const { data: supsData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, username, department, role, avatar_url, created_at')
        .eq('role', 'supervisor')
        .order('created_at', { ascending: false });

      setSupervisors(supsData || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchAdminAndSupervisors(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchAdminAndSupervisors]);

  const bgCard = isDarkMode ? 'bg-[#121d17] border-emerald-900/30' : 'bg-white border-slate-200/90';
  const textMain = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const textMuted = isDarkMode ? 'text-emerald-200/60' : 'text-slate-500';

  const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const closeFeedbackModal = () => setFeedback({ show: false, type: '', message: '' });

  const handlePhotoUpload = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      const check = validateImageFile(file);
      if (!check.valid) {
        setFeedback({ show: true, type: 'error', message: check.error });
        return;
      }
      setIsUploading(true);
      const fileName = `sup-${Math.random()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, avatar_url: publicUrl }));
    } catch (error) {
      setFeedback({ show: true, type: 'error', message: 'Error uploading image: ' + error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const openModal = (mode, sup = null) => {
    setModalMode(mode);
    setShowModalPassword(false);
    if (sup) {
      setFormData({
        first_name: sup.first_name || '',
        last_name: sup.last_name || '',
        username: sup.username || '',
        department: sup.department || 'BSIT',
        password: '',
        confirm_password: '',
        avatar_url: sup.avatar_url || ''
      });
      setActiveSupervisorId(sup.id);
    } else {
      setFormData({
        first_name: '',
        last_name: '',
        username: '',
        department: filterDept !== 'all' ? filterDept : (department || 'BSIT'),
        password: '',
        confirm_password: '',
        avatar_url: ''
      });
      setActiveSupervisorId(null);
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setActiveSupervisorId(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password || formData.confirm_password) {
      if (formData.password.length < 6) {
        setFeedback({ show: true, type: 'error', message: 'Password must be at least 6 characters long.' });
        return;
      }
      if (formData.password !== formData.confirm_password) {
        setFeedback({ show: true, type: 'error', message: 'Passwords do not match!' });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { data: { session: adminSession } } = await supabase.auth.getSession();

      const payload = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        username: formData.username,
        department: formData.department || 'BSIT',
        role: 'supervisor',
        avatar_url: formData.avatar_url
      };

      if (modalMode === 'add') {
        if (!formData.password) throw new Error("Password is required for new supervisors.");
        const authEmail = formData.username.includes('@') ? formData.username : `${formData.username}@supervisor.com`;

        const { data: authData, error: authError } = await supabase.auth.signUp({ email: authEmail, password: formData.password });
        if (authError) throw authError;
        if (!authData?.user?.id) throw new Error("Failed to create OJT Coordinator auth account.");

        if (adminSession) {
          const { error: restoreError } = await supabase.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token
          });
          if (restoreError) throw restoreError;
        }

        const { error: profileError } = await supabase.from('profiles').upsert([{ id: authData.user.id, ...payload }]);
        if (profileError) throw profileError;

        setFeedback({ show: true, type: 'success', message: 'OJT Coordinator successfully registered!' });

      } else {
        if (formData.password) {
          const { error: rpcError } = await supabase.rpc('admin_update_user_password', {
            target_user_id: activeSupervisorId,
            new_password: formData.password
          });
          if (rpcError) throw rpcError;
        }

        const { error: updateError } = await supabase.from('profiles').update(payload).eq('id', activeSupervisorId);
        if (updateError) throw updateError;

        setFeedback({ show: true, type: 'success', message: 'OJT Coordinator updated successfully!' });
      }

      await fetchAdminAndSupervisors();
      closeModal();
    } catch (error) {
      let errorMsg = error.message;
      if (errorMsg.includes('User already registered')) errorMsg = 'This username is already taken. Please choose another.';
      setFeedback({ show: true, type: 'error', message: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!supervisorToDelete) return;
    setIsSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_user', {
        target_user_id: supervisorToDelete.id
      });
      if (rpcError) throw rpcError;

      // profiles has ON DELETE CASCADE on auth.users; delete safely in case cascade did not run
      await supabase.from('profiles').delete().eq('id', supervisorToDelete.id);

      setSupervisors(supervisors.filter(s => s.id !== supervisorToDelete.id));
      setIsDeleteModalOpen(false);
      setSupervisorToDelete(null);
      setFeedback({ show: true, type: 'success', message: 'OJT Coordinator deleted from directory.' });
    } catch (error) {
      setFeedback({ show: true, type: 'error', message: 'Failed to delete supervisor: ' + error.message });
      setIsDeleteModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDepartmentLabel = (deptCode) => {
    const code = (deptCode || '').trim().toUpperCase();
    return DEPARTMENT_OPTIONS.find((d) => d.value === code)?.label || deptCode || 'Unassigned';
  };

  const filteredSupervisors = supervisors.filter(sup => {
    const q = searchQuery.toLowerCase();
    const deptLabel = getDepartmentLabel(sup.department).toLowerCase();
    const matchesSearch =
      `${sup.first_name} ${sup.last_name}`.toLowerCase().includes(q) ||
      (sup.username || '').toLowerCase().includes(q) ||
      (sup.department || '').toLowerCase().includes(q) ||
      deptLabel.includes(q);

    if (!matchesSearch) return false;
    if (filterDept !== 'all' && sup.department !== filterDept) return false;
    return true;
  });

  return (
    <div className="p-5 md:p-6 flex flex-col gap-5 animate-fade-in max-w-7xl mx-auto w-full font-sans">

      {/* ADMINLTE 4 CONTENT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h1 className={`text-2xl font-normal tracking-tight ${textMain}`}>
            OJT Coordinators Directory
          </h1>
        </div>

        {/* AdminLTE 4 Breadcrumb: Right-aligned */}
        <div className="flex items-center gap-1.5 text-sm font-normal text-slate-500">
          <button
            onClick={() => onNavigate && onNavigate('Dashboard')}
            className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
          >
            Home
          </button>
          <span className="text-slate-400">/</span>
          <span className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>Coordinators</span>
        </div>
      </div>

      {/* FILTER & ACTIONS BAR */}
      <div className={`p-3.5 rounded-lg border flex flex-col sm:flex-row items-center justify-between gap-3 ${bgCard} shadow-2xs`}>
        <div className="relative flex-1 w-full max-w-md">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by coordinator name, username, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-1.5 rounded-md text-xs font-normal outline-none border transition-colors ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
              }`}
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-normal border outline-none ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
          >
            <option value="all">All Departments</option>
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.value} - {d.label}
              </option>
            ))}
          </select>

          {/* View Toggle */}
          <div className={`p-0.5 rounded-md border flex items-center ${isDarkMode ? 'bg-[#15231b] border-emerald-900/30' : 'bg-slate-50 border-slate-200'
            }`}>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${viewMode === 'grid'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-slate-600'
                }`}
              title="Cards View"
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${viewMode === 'table'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-slate-600'
                }`}
              title="Table View"
            >
              Table
            </button>
          </div>

          <button
            onClick={() => openModal('add')}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md font-medium text-xs shadow-2xs transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4M4 12h16" />
            </svg>
            <span>Register Coordinator</span>
          </button>
        </div>
      </div>

      {/* MAIN LIST: GRID CARDS (LIKE REFERENCE IMAGE) OR TABLE */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
        </div>
      ) : filteredSupervisors.length === 0 ? (
        <div className={`p-12 rounded-2xl border text-center flex flex-col items-center justify-center ${bgCard}`}>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 flex items-center justify-center mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className={`text-base font-bold ${textMain}`}>No coordinators found</h3>
          <p className={`text-xs mt-1 max-w-sm ${textMuted}`}>
            {searchQuery ? 'Try adjusting your search criteria.' : 'Click "Register Coordinator" above to add new OJT coordinators.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* 1. GRID CARDS VIEW (MATCHING USER REFERENCE IMAGE) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSupervisors.map((sup) => {
            const deptCode = sup.department || 'BSIT';
            const deptLabel = getDepartmentLabel(deptCode);

            return (
              <div
                key={sup.id}
                className={`p-4 rounded-lg border ${bgCard} shadow-2xs flex flex-col justify-between transition-all ${isDarkMode ? 'hover:border-emerald-800' : 'hover:border-emerald-200'}`}
              >
                <div>
                  {/* Department Header */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase shrink-0 ${getDepartmentBadge(deptCode)}`}>
                      {deptCode}
                    </span>
                    <span className={`text-[11px] font-medium truncate ${textMuted}`} title={deptLabel}>
                      {deptLabel}
                    </span>
                  </div>

                  {/* Coordinator Title + Avatar */}
                  <div className="flex items-start gap-3 my-2">
                    {sup.avatar_url ? (
                      <img
                        src={sup.avatar_url}
                        alt="Coordinator"
                        className={`w-10 h-10 rounded-md object-cover shrink-0 border ${isDarkMode ? 'border-emerald-900/40' : 'border-slate-200'}`}
                      />
                    ) : (
                      <div style={{ backgroundColor: isDarkMode ? 'rgba(16,185,129,0.2)' : '#d1fae5', color: isDarkMode ? '#6ee7b7' : '#065f46' }} className="w-10 h-10 rounded-md flex items-center justify-center font-bold text-sm shrink-0">
                        {sup.first_name?.charAt(0)}{sup.last_name?.charAt(0)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className={`text-sm font-semibold truncate leading-tight ${textMain}`}>
                        {sup.first_name} {sup.last_name}
                      </h3>
                      <p className={`text-xs mt-0.5 truncate text-slate-400 font-normal`}>
                        @{sup.username || 'supervisor'}
                      </p>
                    </div>
                  </div>

                  {/* Credentials / Status */}
                  <div className={`mt-3 p-2 rounded-md border flex items-center justify-between text-xs ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/30' : 'bg-slate-50/70 border-slate-100'
                    }`}>
                    <span className={`text-[11px] font-normal ${textMuted}`}>Password:</span>
                    <span className="text-[11px] font-medium text-emerald-700">Encrypted (reset in Edit)</span>
                  </div>
                </div>

                {/* Bottom Outlined Action Button */}
                <div className={`mt-4 pt-3 border-t flex items-center gap-2 ${isDarkMode ? 'border-emerald-900/30' : 'border-slate-100'}`}>
                  <button
                    onClick={() => openModal('edit', sup)}
                    style={{
                      backgroundColor: isDarkMode ? 'transparent' : '#ffffff',
                      color: isDarkMode ? '#e2e8f0' : '#047857',
                      borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#10b981',
                      opacity: 1
                    }}
                    className="flex-1 py-1.5 rounded-md border text-xs font-semibold transition-all text-center shadow-2xs hover:brightness-95"
                  >
                    Manage Profile
                  </button>
                  <button
                    onClick={() => { setSupervisorToDelete(sup); setIsDeleteModalOpen(true); }}
                    className={`p-1.5 rounded-md border text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-2xs ${isDarkMode ? 'border-white/10 bg-transparent' : 'border-slate-300 bg-white'}`}
                    title="Remove Coordinator"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 2. TABLE VIEW */
        <div className={`rounded-lg border overflow-hidden ${bgCard} shadow-2xs`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max text-xs">
              <thead className={`border-b ${isDarkMode ? 'bg-[#15231b] border-emerald-900/30' : 'bg-slate-50 border-slate-200/80'}`}>
                <tr>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>OJT Coordinator</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Department</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Username</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Password</th>
                  <th className={`py-3 px-4 font-semibold text-right ${textMuted}`}>Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-emerald-950/40' : 'divide-slate-100'}`}>
                {filteredSupervisors.map((sup) => {
                  const deptCode = sup.department || 'BSIT';
                  const deptLabel = getDepartmentLabel(deptCode);
                  return (
                  <tr key={sup.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {sup.avatar_url ? (
                          <img src={sup.avatar_url} alt="Coordinator" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                            {sup.first_name?.charAt(0)}{sup.last_name?.charAt(0)}
                          </div>
                        )}
                        <div>
                          <span className={`font-bold block ${textMain}`}>{sup.first_name} {sup.last_name}</span>
                          <span className="text-[11px] text-slate-400">OJT Coordinator</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${getDepartmentBadge(deptCode)}`}>
                          {deptCode}
                        </span>
                        <span className={`font-medium ${textMain}`}>{deptLabel}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono">{sup.username}</td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-medium text-emerald-700">Encrypted</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openModal('edit', sup)} className="text-xs font-semibold text-emerald-700 hover:underline">
                          Edit
                        </button>
                        <button onClick={() => { setSupervisorToDelete(sup); setIsDeleteModalOpen(true); }} className="text-xs font-semibold text-rose-600 hover:underline">
                          Delete
                        </button>
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

      {/* OJT COORDINATOR REGISTRATION / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className={`rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden border ${isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
            }`}>
            <div className={`px-6 py-4 flex justify-between items-center border-b ${isDarkMode ? 'border-emerald-900/30 bg-[#15231b]' : 'border-slate-100 bg-slate-50'
              }`}>
              <div>
                <h2 className={`text-base font-bold tracking-tight ${textMain}`}>
                  {modalMode === 'add' ? 'Register OJT Coordinator' : 'Edit Coordinator Profile'}
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  Department: <span className="font-semibold text-emerald-600">{department}</span>
                </p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[72vh] custom-scrollbar">

              <div className="flex flex-col items-center justify-center mb-1">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
                <div
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`w-16 h-16 rounded-full border-2 border-dashed border-emerald-500/40 ${isDarkMode ? 'bg-[#0f1914]' : 'bg-emerald-50/50'
                    } flex items-center justify-center cursor-pointer overflow-hidden relative group transition-colors`}
                  title="Upload coordinator photo"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : formData.avatar_url ? (
                    <>
                      <img src={formData.avatar_url} alt="Uploaded" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-emerald-950/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-bold text-white">Change</span>
                      </div>
                    </>
                  ) : (
                    <svg className="w-6 h-6 text-emerald-600/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
                <span className={`text-[10px] font-medium mt-1.5 ${textMuted}`}>Click to add avatar</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>First Name</label>
                  <input type="text" name="first_name" value={formData.first_name} onChange={handleFormChange} required placeholder="First name" className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Last Name</label>
                  <input type="text" name="last_name" value={formData.last_name} onChange={handleFormChange} required placeholder="Last name" className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Department / Program</label>
                <select
                  name="department"
                  value={formData.department || 'BSIT'}
                  onChange={handleFormChange}
                  className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                >
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.value} - {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Username</label>
                <input type="text" name="username" value={formData.username} onChange={handleFormChange} required placeholder="e.g. jdelacruz" className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>
                    {modalMode === 'edit' ? 'Password (Optional)' : 'Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showModalPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleFormChange}
                      required={modalMode === 'add'}
                      placeholder={modalMode === 'edit' ? "Keep current" : "Password"}
                      className={`w-full px-3 py-2 pr-8 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                    />
                    <button type="button" onClick={() => setShowModalPassword(!showModalPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                      {showModalPassword ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Confirm</label>
                  <input
                    type={showModalPassword ? "text" : "password"}
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleFormChange}
                    required={modalMode === 'add'}
                    placeholder="Confirm"
                    className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                  />
                </div>
              </div>

              <div className={`pt-3 flex justify-end gap-2 border-t mt-1 ${isDarkMode ? 'border-emerald-900/30' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={closeModal}
                  className={`px-4 py-2 rounded-xl font-semibold text-xs border transition-colors ${
                    isDarkMode
                      ? 'text-slate-200 bg-white/5 border-white/10 hover:bg-white/10'
                      : 'text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl font-semibold text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition-colors disabled:opacity-50">
                  {isSubmitting ? 'Saving...' : 'Save Coordinator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className={`rounded-2xl shadow-xl w-full max-w-[320px] flex flex-col p-6 text-center items-center border ${isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
            }`}>
            <h3 className={`text-base font-bold mb-1 ${textMain}`}>Remove OJT Coordinator?</h3>
            <p className={`text-xs mb-5 leading-relaxed ${textMuted}`}>
              Are you sure you want to remove <strong className={textMain}>{supervisorToDelete?.first_name} {supervisorToDelete?.last_name}</strong>?
            </p>
            <div className="w-full flex gap-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className={`py-2 rounded-xl font-semibold text-xs border flex-1 transition-colors ${
                  isDarkMode
                    ? 'text-slate-200 bg-white/5 border-white/10 hover:bg-white/10'
                    : 'text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200'
                }`}
              >
                Cancel
              </button>
              <button onClick={handleDeleteConfirm} className="py-2 rounded-xl font-semibold text-xs text-white bg-rose-600 hover:bg-rose-700 shadow-2xs flex-1 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FEEDBACK MODAL */}
      {feedback.show && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className={`rounded-2xl shadow-xl w-full max-w-[320px] flex flex-col p-6 text-center items-center border ${isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
            }`}>
            <h3 className={`text-base font-bold mb-1 ${textMain}`}>
              {feedback.type === 'error' ? 'Notice' : 'Success'}
            </h3>
            <p className={`text-xs mb-5 leading-relaxed ${textMuted}`}>{feedback.message}</p>
            <button onClick={closeFeedbackModal} className="w-full py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors">
              Okay
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default AddSupervisor;