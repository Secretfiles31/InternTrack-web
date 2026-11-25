import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../api/supabaseClient';
import { DEPARTMENT_OPTIONS, getDepartmentBadge } from '../../constants/departments';
import { validateImageFile } from '../../utils/fileValidation';

function ListStudents() {
  const [companyName, setCompanyName] = useState('');
  const [coordCompanyId, setCoordCompanyId] = useState(null);
  const [coordDepartment, setCoordDepartment] = useState('');
  const [hasCompany, setHasCompany] = useState(true);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, pending
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // View Profile Modal State
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Add Student Modal State (locked to supervisor's own department)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [copiedCreds, setCopiedCreds] = useState(false);
  const [feedback, setFeedback] = useState({ show: false, type: '', message: '', credentials: null });
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    password: '',
    confirm_password: '',
    avatar_url: '',
    assign_to_company: true,
  });

  const fetchCoordinatorAndInterns = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch the logged-in Coordinator's profile
      const { data: coordProfile } = await supabase
        .from('profiles')
        .select('department, company_id')
        .eq('id', user.id)
        .single();

      if (coordProfile) {
        const dept = (coordProfile.department || '').trim();
        setCoordDepartment(dept);
        setCoordCompanyId(coordProfile.company_id || null);

        if (!coordProfile.company_id) {
          setHasCompany(false);
          if (dept) {
            const { data: deptInterns } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, username, avatar_url, department, company_status, created_at')
              .eq('role', 'student')
              .eq('department', dept)
              .is('company_id', null)
              .order('first_name', { ascending: true });
            setStudents(deptInterns || []);
          } else {
            setStudents([]);
          }
          setIsLoading(false);
          return;
        }

        setHasCompany(true);

        // 2. Fetch company details
        const { data: compData } = await supabase
          .from('companies')
          .select('name')
          .eq('id', coordProfile.company_id)
          .single();

        if (compData) setCompanyName(compData.name);

        // 3. Fetch interns assigned to this company
        const { data: internsData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, username, avatar_url, department, company_status, created_at')
          .eq('role', 'student')
          .eq('company_id', coordProfile.company_id)
          .order('first_name', { ascending: true });

        setStudents(internsData || []);
      }
    } catch (error) {
      console.error('Error fetching interns:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchCoordinatorAndInterns(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchCoordinatorAndInterns]);

  const filteredStudents = students.filter((student) => {
    const query = searchQuery.toLowerCase();
    const fullName = `${student.first_name || ''} ${student.last_name || ''}`.toLowerCase();
    const username = (student.username || '').toLowerCase();
    const matchesSearch = fullName.includes(query) || username.includes(query);

    if (filterStatus === 'active') return matchesSearch && student.company_status === 'active';
    if (filterStatus === 'pending') return matchesSearch && student.company_status === 'pending';
    return matchesSearch;
  });

  const openViewModal = (student) => {
    setSelectedStudent(student);
    setIsViewModalOpen(true);
  };

  const openAddModal = () => {
    setShowModalPassword(false);
    setFormData({
      first_name: '',
      last_name: '',
      username: '',
      password: '',
      confirm_password: '',
      avatar_url: '',
      assign_to_company: Boolean(coordCompanyId),
    });
    setIsAddModalOpen(true);
  };

  const closeFeedbackModal = () => {
    setCopiedCreds(false);
    setFeedback({ show: false, type: '', message: '', credentials: null });
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handlePhotoUpload = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      const check = validateImageFile(file);
      if (!check.valid) {
        setFeedback({ show: true, type: 'error', message: check.error, credentials: null });
        return;
      }
      setIsUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split('.').pop();
      const fileName = `${user?.id || 'coord'}/stu-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      setFormData((prev) => ({ ...prev, avatar_url: publicUrl }));
    } catch (error) {
      setFeedback({ show: true, type: 'error', message: 'Error uploading image: ' + error.message, credentials: null });
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddStudentSubmit = async (e) => {
    e.preventDefault();
    if (!coordDepartment) {
      setFeedback({
        show: true,
        type: 'error',
        message: 'Your coordinator profile has no department assigned. Contact Admin first.',
        credentials: null,
      });
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      setFeedback({ show: true, type: 'error', message: 'Password must be at least 6 characters long.', credentials: null });
      return;
    }
    if (formData.password !== formData.confirm_password) {
      setFeedback({ show: true, type: 'error', message: 'Passwords do not match!', credentials: null });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { session: staffSession } } = await supabase.auth.getSession();
      const cleanUsername = formData.username.trim();
      const authEmail = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@student.com`;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: authEmail,
        password: formData.password,
        options: {
          data: {
            first_name: formData.first_name.trim(),
            last_name: formData.last_name.trim(),
            username: authEmail,
            department: coordDepartment,
          },
        },
      });
      if (authError) throw authError;
      if (!authData?.user?.id) throw new Error('Failed to create student auth account.');

      if (staffSession) {
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: staffSession.access_token,
          refresh_token: staffSession.refresh_token,
        });
        if (restoreError) throw restoreError;
      }

      const linkCompany = Boolean(coordCompanyId && formData.assign_to_company);
      const payload = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        username: authEmail,
        department: coordDepartment,
        role: 'student',
        company_id: linkCompany ? coordCompanyId : null,
        company_status: linkCompany ? 'active' : 'unassigned',
        avatar_url: formData.avatar_url || '',
      };

      const { error: profileError } = await supabase.from('profiles').upsert([{ id: authData.user.id, ...payload }]);
      if (profileError) throw profileError;

      await fetchCoordinatorAndInterns();
      setIsAddModalOpen(false);
      setFeedback({
        show: true,
        type: 'success',
        message: `Student added to ${coordDepartment}! Save or copy their login credentials now.`,
        credentials: { username: authEmail, password: formData.password },
      });
    } catch (error) {
      let msg = error.message;
      if (msg.includes('User already registered')) msg = 'This username is already taken. Please choose another.';
      setFeedback({ show: true, type: 'error', message: msg, credentials: null });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 animate-fade-in max-w-7xl mx-auto w-full">
      {!hasCompany && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-xs text-amber-900">
            <p className="font-semibold">No Host Company Linked</p>
            <p className="text-amber-800 mt-0.5">
              Showing unassigned students in your department ({coordDepartment || 'Unset'}). Students you register will belong to {coordDepartment || 'your department'} until linked to a partner company.
            </p>
          </div>
        </div>
      )}
      {/* Top Header / Subhead */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Interns Directory</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {hasCompany
              ? <>Manage and view interns deployed at <span className="font-medium text-slate-800">{companyName || 'your company'}</span>.</>
              : <>Department: <span className="font-medium text-slate-800">{coordDepartment || 'Unassigned'}</span></>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Student</span>
          </button>
          {/* View mode toggle */}
          <div className="flex items-center p-1 bg-white border border-slate-200 rounded-lg shadow-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
              title="Card grid view"
              aria-label="Card grid view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
              title="Table view"
              aria-label="Table view"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search intern by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filterStatus === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({students.length})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filterStatus === 'active' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({students.filter((s) => s.company_status === 'active').length})
            </button>
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                filterStatus === 'pending' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({students.filter((s) => s.company_status === 'pending').length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">No interns found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `No assigned interns match "${searchQuery}".`
              : `There are currently no interns assigned to ${companyName}.`}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW (matching Admin card styling) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStudents.map((student) => {
            const isPending = student.company_status === 'pending';
            return (
              <div
                key={student.id}
                className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {hasCompany ? (companyName || 'Assigned') : 'Unassigned'}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getDepartmentBadge(student.department)}`}>
                      {student.department || 'BSIT'}
                    </span>
                  </div>

                  {/* Intern Identity */}
                  <div className="flex items-center gap-3.5 mb-4">
                    {student.avatar_url ? (
                      <img
                        src={student.avatar_url}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-800 font-bold text-sm flex items-center justify-center border border-emerald-200 shrink-0">
                        {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">
                        {student.first_name} {student.last_name}
                      </h4>
                      <p className="text-xs text-slate-500 truncate">
                        {student.username ? `@${student.username}` : 'No username set'}
                      </p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center justify-between py-2.5 px-3 bg-slate-50 rounded-lg border border-slate-100 mb-4 text-xs">
                    <span className="text-slate-500 font-medium">Placement:</span>
                    {isPending ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Pending Approval
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Active Intern
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Action */}
                <button
                  onClick={() => openViewModal(student)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors cursor-pointer text-center"
                >
                  View Profile
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW (matching Admin table layout) */
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider w-12 text-center">No.</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Intern</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Username</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Program</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((student, idx) => {
                  const isPending = student.company_status === 'pending';
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {student.avatar_url ? (
                            <img src={student.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                              {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-slate-900 leading-tight">
                              {student.first_name} {student.last_name}
                            </p>
                            <p className="text-[11px] text-slate-400">{hasCompany ? companyName : 'Unassigned'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {student.username ? `@${student.username}` : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getDepartmentBadge(student.department)}`}>
                          {student.department || 'BSIT'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openViewModal(student)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW PROFILE MODAL */}
      {isViewModalOpen && selectedStudent && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">Intern Profile</h3>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center">
              {selectedStudent.avatar_url ? (
                <img
                  src={selectedStudent.avatar_url}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 shadow-xs mb-3"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-100 text-slate-700 font-bold text-xl flex items-center justify-center border-2 border-slate-200 shadow-xs mb-3">
                  {selectedStudent.first_name?.charAt(0)}{selectedStudent.last_name?.charAt(0)}
                </div>
              )}

              <h4 className="text-base font-semibold text-slate-900">
                {selectedStudent.first_name} {selectedStudent.last_name}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedStudent.username ? `@${selectedStudent.username}` : 'No username set'}
              </p>

              <div className="mt-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getDepartmentBadge(selectedStudent.department)}`}>
                  {selectedStudent.department || 'BSIT'} Program
                </span>
              </div>

              <div className="w-full mt-6 flex flex-col divide-y divide-slate-100 border-t border-b border-slate-100 text-xs text-left">
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-slate-500">Host Company</span>
                  <span className="font-semibold text-slate-800">{hasCompany ? companyName : 'Unassigned'}</span>
                </div>
                <div className="py-2.5 flex justify-between items-center">
                  <span className="text-slate-500">Placement Status</span>
                  {selectedStudent.company_status === 'pending' ? (
                    <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Pending Approval
                    </span>
                  ) : (
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Active
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD STUDENT MODAL (Department locked to coordinator's department) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Register Student</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Department: <span className="font-semibold text-emerald-600">{coordDepartment || 'Not Assigned'}</span>
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[75vh] custom-scrollbar">
              <div className="flex flex-col items-center justify-center">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
                <div
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-full border-2 border-dashed border-emerald-500/40 bg-emerald-50/50 flex items-center justify-center cursor-pointer overflow-hidden relative group"
                  title="Upload student photo"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  ) : formData.avatar_url ? (
                    <img src={formData.avatar_url} alt="Uploaded" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-emerald-600/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  )}
                </div>
                <span className="text-[10px] font-medium text-slate-500 mt-1.5">Click to add avatar</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleFormChange}
                    required
                    placeholder="First name"
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border border-slate-200 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleFormChange}
                    required
                    placeholder="Last name"
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border border-slate-200 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Department / Program</label>
                <div className="w-full px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 bg-slate-50 text-slate-700 flex items-center justify-between gap-2">
                  <span className="truncate">
                    {(() => {
                      const deptObj = DEPARTMENT_OPTIONS.find((d) => d.value === (coordDepartment || '').toUpperCase());
                      return deptObj ? `${deptObj.value} - ${deptObj.label}` : (coordDepartment || 'Not Assigned');
                    })()}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${getDepartmentBadge(coordDepartment)}`}>
                    Auto
                  </span>
                </div>
              </div>

              {hasCompany && (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="assign_to_company"
                    checked={formData.assign_to_company}
                    onChange={handleFormChange}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Assign directly to <strong className="text-slate-900">{companyName || 'your company'}</strong></span>
                </label>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Username</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleFormChange}
                  required
                  placeholder="e.g. jdelacruz"
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border border-slate-200 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showModalPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleFormChange}
                      required
                      placeholder="Min. 6 characters"
                      className="w-full px-3 py-2 pr-8 rounded-xl text-xs font-medium outline-none border border-slate-200 text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModalPassword(!showModalPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showModalPassword ? 'Hide password' : 'Show password'}
                    >
                      {showModalPassword ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Confirm</label>
                  <input
                    type={showModalPassword ? 'text' : 'password'}
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleFormChange}
                    required
                    placeholder="Confirm"
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border border-slate-200 text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 mt-1">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-xs text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !coordDepartment}
                  className="px-5 py-2 rounded-xl font-semibold text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FEEDBACK MODAL */}
      {feedback.show && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-[360px] flex flex-col p-6 text-center items-center">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {feedback.type === 'error' ? 'Notice' : 'Success'}
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">{feedback.message}</p>
            {feedback.credentials && (
              <div className="w-full mb-4 p-3 rounded-xl border border-slate-200 bg-slate-50 text-left text-xs flex flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Username:</span>
                  <span className="font-mono font-semibold text-slate-900 truncate">{feedback.credentials.username}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Password:</span>
                  <span className="font-mono font-semibold text-slate-900 break-all">{feedback.credentials.password}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`Username: ${feedback.credentials.username}\nPassword: ${feedback.credentials.password}`);
                    setCopiedCreds(true);
                  }}
                  className="mt-1 w-full py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                >
                  {copiedCreds ? 'Copied!' : 'Copy Credentials'}
                </button>
              </div>
            )}
            <button
              onClick={closeFeedbackModal}
              className="w-full py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ListStudents;

