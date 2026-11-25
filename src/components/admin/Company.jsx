import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { validateImageFile } from '../../utils/fileValidation';

function Company({ onNavigate }) {
  const [department, setDepartment] = useState('');
  const [companies, setCompanies] = useState([]);
  const [students, setStudents] = useState([]); 
  const [supervisors, setSupervisors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState(null); 
  const [viewMode, setViewMode] = useState('grid'); // 'grid' (cards like reference) or 'table'

  // Modal States
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [activeCompanyId, setActiveCompanyId] = useState(null);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCompanyForAssign, setSelectedCompanyForAssign] = useState(null);
  const [studentToAssign, setStudentToAssign] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState(null);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [companyToView, setCompanyToView] = useState(null);

  // Pending Requests Modal States
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterCapacity, setFilterCapacity] = useState('all'); // all, available, full

  // Photo Upload States
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  // Form & Feedback States
  const [formData, setFormData] = useState({
    name: '', address: '', capacity: '', required_hours: '', logo_url: '', department: 'BSIT'
  });
  const [feedback, setFeedback] = useState({ show: false, type: '', message: '' });

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // GLOBAL DARK MODE LISTENER
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    const handleThemeChange = () => setIsDarkMode(localStorage.getItem('theme') === 'dark');
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: adminProfile } = await supabase.from('profiles').select('department').eq('id', user.id).single();
        
      let adminDept = adminProfile ? adminProfile.department : '';
      setDepartment(adminDept);

      // Fetch all partner companies, students, and supervisors across all programs
      const { data: companiesData } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
      const { data: studentsData } = await supabase.from('profiles').select('id, first_name, last_name, company_id, avatar_url, company_status, department').eq('role', 'student');
      const { data: supervisorsData } = await supabase.from('profiles').select('id, first_name, last_name, company_id, avatar_url, department').eq('role', 'supervisor');

      setCompanies(companiesData || []);
      setStudents(studentsData || []);
      setSupervisors(supervisorsData || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const searchPHAddress = useCallback(async (query) => {
    setIsSearchingAddress(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=ph&format=json&addressdetails=1&limit=5`);
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        setAddressSuggestions([]);
        return;
      }

      const formattedSuggestions = data.map(item => {
        const addr = item.address || {};
        const parts = [addr.road, addr.neighbourhood, addr.village, addr.suburb, addr.city || addr.town || addr.municipality, addr.state || addr.province || addr.county];
        const cleanName = [...new Set(parts.filter(Boolean))].join(', ');
        return { ...item, clean_name: cleanName || item.display_name.split(',')[0] };
      });
      setAddressSuggestions(formattedSuggestions);
    } catch (error) {
      console.error("Error:", error);
      setAddressSuggestions([]);
    } finally {
      setIsSearchingAddress(false);
    }
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (formData.address && formData.address.length > 2 && showSuggestions) {
        searchPHAddress(formData.address);
      } else {
        setAddressSuggestions([]);
      }
    }, 600); 
    return () => clearTimeout(delayDebounceFn);
  }, [formData.address, showSuggestions, searchPHAddress]);

  const handleSelectAddress = (addressName) => {
    setFormData({ ...formData, address: addressName });
    setShowSuggestions(false);
    setAddressSuggestions([]);
  };

  const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const closeFeedbackModal = () => setFeedback({ show: false, type: '', message: '' });

  const bgCard = isDarkMode ? 'bg-[#121d17] border-emerald-900/30' : 'bg-white border-slate-200/90';
  const textMain = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const textMuted = isDarkMode ? 'text-emerald-200/60' : 'text-slate-500';

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
      const fileName = `company-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
    } catch (error) {
      setFeedback({ show: true, type: 'error', message: 'Error uploading image: ' + error.message });
    } finally {
      setIsUploading(false);
    }
  };

  const openCompanyModal = (mode, company = null) => {
    setModalMode(mode);
    setShowSuggestions(false);
    setAddressSuggestions([]);
    if (company) {
      setFormData({ 
        name: company.name || '', 
        address: company.address || '', 
        capacity: company.capacity ?? '', 
        required_hours: company.required_hours ?? '', 
        logo_url: company.logo_url || '',
        department: company.department || 'BSIT'
      });
      setActiveCompanyId(company.id);
    } else {
      setFormData({ 
        name: '', 
        address: '', 
        capacity: '', 
        required_hours: '', 
        logo_url: '',
        department: filterDept !== 'all' ? filterDept : (department || 'BSIT')
      });
      setActiveCompanyId(null);
    }
    setIsCompanyModalOpen(true);
  };

  const handleCompanySubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = { 
        name: formData.name, 
        address: formData.address, 
        capacity: parseInt(formData.capacity) || 0, 
        required_hours: parseInt(formData.required_hours) || 0, 
        department: formData.department || 'BSIT', 
        logo_url: formData.logo_url 
      };

      if (modalMode === 'add') {
        await supabase.from('companies').insert([payload]);
        setFeedback({ show: true, type: 'success', message: 'Company successfully added!' });
      } else {
        await supabase.from('companies').update(payload).eq('id', activeCompanyId);
        setFeedback({ show: true, type: 'success', message: 'Company successfully updated!' });
      }
      await fetchData();
      setIsCompanyModalOpen(false);
    } catch (error) { 
      setFeedback({ show: true, type: 'error', message: 'Failed to save: ' + error.message });
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleDeleteConfirm = async () => {
    if (!companyToDelete) return;
    setIsSubmitting(true);
    try {
      await supabase.from('companies').delete().eq('id', companyToDelete.id);
      setCompanies(companies.filter(c => c.id !== companyToDelete.id));
      setIsDeleteModalOpen(false);
      setFeedback({ show: true, type: 'success', message: 'Company removed from directory.' });
    } catch (error) { 
      setFeedback({ show: true, type: 'error', message: 'Failed to delete company: ' + error.message });
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const openAssignModal = (company) => { 
    setSelectedCompanyForAssign(company); 
    setStudentToAssign(''); 
    setIsAssignModalOpen(true); 
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!studentToAssign || !selectedCompanyForAssign) return;
    setIsSubmitting(true);
    try {
      await supabase.from('profiles').update({ company_id: selectedCompanyForAssign.id, company_status: 'active' }).eq('id', studentToAssign);
      await fetchData();
      setIsAssignModalOpen(false);
      setFeedback({ show: true, type: 'success', message: 'Student successfully assigned!' });
    } catch (error) { 
      setFeedback({ show: true, type: 'error', message: 'Failed to assign: ' + error.message });
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleAcceptRequest = async (studentId) => {
    setProcessingId(studentId);
    try {
      await supabase.from('profiles').update({ company_status: 'active' }).eq('id', studentId);
      await fetchData();
    } catch (error) {
      setFeedback({ show: true, type: 'error', message: "Failed to accept: " + error.message });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (studentId) => {
    setProcessingId(studentId);
    try {
      await supabase.from('profiles').update({ company_id: null, company_status: 'unassigned' }).eq('id', studentId);
      await fetchData();
    } catch (error) {
      setFeedback({ show: true, type: 'error', message: "Failed to decline: " + error.message });
    } finally {
      setProcessingId(null);
    }
  };

  const getAssignedStudents = (companyId) => students.filter(s => 
    String(s.company_id) === String(companyId) && (s.company_status === 'active' || !s.company_status)
  );
  
  const getPendingStudents = (companyId) => students.filter(s => 
    String(s.company_id) === String(companyId) && s.company_status === 'pending'
  );
  
  const getUnassignedStudents = () => students.filter(s => 
    !s.company_id || s.company_status === 'unassigned' || !s.company_status
  );
  
  const getCompanySupervisors = (companyId) => supervisors.filter(s => String(s.company_id) === String(companyId));
  const openViewModal = (company) => { setCompanyToView(company); setIsViewModalOpen(true); };

  const filteredCompanies = companies.filter(company => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (company.name || '').toLowerCase().includes(query) || (company.address || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;

    if (filterDept !== 'all' && company.department && company.department !== filterDept) return false;

    const assignedCount = getAssignedStudents(company.id).length;
    const isFull = assignedCount >= (company.capacity || 0);

    if (filterCapacity === 'available') return !isFull;
    if (filterCapacity === 'full') return isFull;
    return true;
  });

  const allPendingRequests = students.filter(s => s.company_status === 'pending');
  const filteredPendingRequests = allPendingRequests.filter(s => 
    `${s.first_name || ''} ${s.last_name || ''}`.toLowerCase().includes(pendingSearchQuery.toLowerCase())
  );

  return (
    <div className="p-5 md:p-6 flex flex-col gap-5 animate-fade-in max-w-7xl mx-auto w-full font-sans">
      
      {/* ADMINLTE 4 CONTENT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h1 className={`text-2xl font-normal tracking-tight ${textMain}`}>
            Partner Companies
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
          <span className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>Companies</span>
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
            placeholder="Search by company name or location..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className={`w-full pl-9 pr-3 py-1.5 rounded-md text-xs font-normal outline-none border transition-colors ${
              isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
            }`} 
          />
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-normal border outline-none ${
              isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <option value="all">All Programs</option>
            <option value="BSHM">BSHM (HM)</option>
            <option value="BSCRIM">BSCRIM (Crim)</option>
            <option value="BSIT">BSIT (IT)</option>
            <option value="BSAB">BSAB (Agre)</option>
          </select>

          <select
            value={filterCapacity}
            onChange={(e) => setFilterCapacity(e.target.value)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-normal border outline-none ${
              isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <option value="all">All Capacities</option>
            <option value="available">Open Slots Available</option>
            <option value="full">Full Capacity</option>
          </select>

          {/* View Toggle */}
          <div className={`p-0.5 rounded-md border flex items-center ${
            isDarkMode ? 'bg-[#15231b] border-emerald-900/30' : 'bg-slate-50 border-slate-200'
          }`}>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Cards View"
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'table'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Table View"
            >
              Table
            </button>
          </div>

          {/* Pending Approvals Button */}
          <button 
            onClick={() => setIsPendingModalOpen(true)}
            className={`relative px-2.5 py-1.5 rounded-md border transition-colors flex items-center gap-1.5 text-xs font-medium ${
              isDarkMode ? 'bg-[#15231b] border-emerald-900/30 text-slate-300' : 'bg-white border-slate-200 shadow-2xs text-slate-700'
            }`}
            title="Pending Placement Requests"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="hidden sm:inline">Pending</span>
            {allPendingRequests.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {allPendingRequests.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => openCompanyModal('add')} 
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md font-medium text-xs shadow-2xs transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4M4 12h16" />
            </svg>
            <span>Add Company</span>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT: CARDS VIEW (LIKE REFERENCE IMAGE) OR TABLE */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className={`p-12 rounded-2xl border text-center flex flex-col items-center justify-center ${bgCard}`}>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 flex items-center justify-center mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className={`text-base font-bold ${textMain}`}>No companies found</h3>
          <p className={`text-xs mt-1 max-w-sm ${textMuted}`}>
            {searchQuery ? 'Try adjusting your search query.' : 'Click "Add Company" above to register accredited industry partners.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* 1. GRID CARDS VIEW (MATCHING USER REFERENCE IMAGE) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCompanies.map((company) => {
            const assignedStudents = getAssignedStudents(company.id);
            const pendingStudents = getPendingStudents(company.id);
            const occupied = assignedStudents.length + pendingStudents.length;
            const isFull = occupied >= company.capacity;
            const companySups = getCompanySupervisors(company.id);

            return (
              <div 
                key={company.id} 
                className={`p-4 rounded-lg border ${bgCard} shadow-2xs flex flex-col justify-between transition-all ${isDarkMode ? 'hover:border-emerald-800' : 'hover:border-emerald-200'}`}
              >
                <div>
                  {/* Category Pill at top */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      isFull 
                        ? (isDarkMode ? 'bg-rose-500/15 text-rose-300 border-rose-500/20' : 'bg-rose-50 text-rose-700 border-rose-200')
                        : (isDarkMode ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-100')
                    }`}>
                      {occupied} / {company.capacity} Slots {isFull ? '(Full)' : 'Filled'}
                    </span>

                    <span className="text-[10px] font-semibold text-slate-400">
                      {company.required_hours ? `${company.required_hours} hrs` : 'Hours unset'}
                    </span>
                  </div>

                  {/* Company Info */}
                  <div className="flex items-start gap-3 my-2">
                    {company.logo_url ? (
                      <img 
                        src={company.logo_url} 
                        alt="Logo" 
                        className={`w-10 h-10 rounded-xl object-cover shrink-0 border ${isDarkMode ? 'border-emerald-900/40' : 'border-slate-200'}`} 
                      />
                    ) : (
                      <div style={{ backgroundColor: isDarkMode ? 'rgba(16,185,129,0.2)' : '#d1fae5', color: isDarkMode ? '#6ee7b7' : '#065f46', borderColor: isDarkMode ? 'rgba(16,185,129,0.3)' : '#a7f3d0' }} className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border">
                        {company.name?.charAt(0) || 'C'}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className={`text-sm font-bold truncate leading-tight ${textMain}`}>
                        {company.name}
                      </h3>
                      <p className={`text-xs mt-0.5 truncate text-slate-400`}>
                        {company.address || 'Location not specified'}
                      </p>
                    </div>
                  </div>

                  {/* Supervisors & Assigned Interns Info */}
                  <div className={`mt-3 p-2.5 rounded-xl border flex flex-col gap-2 text-xs ${
                    isDarkMode ? 'bg-[#0f1914] border-emerald-900/30' : 'bg-slate-50/70 border-slate-100'
                  }`}>
                    {/* Coordinator line */}
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] ${textMuted}`}>Coordinator:</span>
                      <span className={`font-semibold text-xs truncate max-w-[150px] ${companySups.length > 0 ? textMain : 'text-slate-400 italic'}`}>
                        {companySups.length > 0 ? `${companySups[0].first_name} ${companySups[0].last_name}` : 'Unassigned'}
                      </span>
                    </div>

                    {/* Interns Stack */}
                    <div className={`flex items-center justify-between pt-1 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-200/70'}`}>
                      <span className={`text-[11px] ${textMuted}`}>Assigned Interns:</span>
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {assignedStudents.slice(0, 3).map(st => (
                            st.avatar_url ? (
                              <img key={st.id} src={st.avatar_url} alt="" className="w-5 h-5 rounded-full ring-1 ring-white object-cover" />
                            ) : (
                              <div key={st.id} className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[8px] font-bold flex items-center justify-center ring-1 ring-white">
                                {st.first_name?.charAt(0)}
                              </div>
                            )
                          ))}
                        </div>
                        {assignedStudents.length > 3 && (
                          <span className="text-[10px] text-slate-400 font-bold">+{assignedStudents.length - 3}</span>
                        )}
                        {assignedStudents.length > 0 && (
                          <button onClick={() => openViewModal(company)} className="text-[11px] font-semibold text-emerald-600 hover:underline ml-1">
                            View
                          </button>
                        )}
                        {assignedStudents.length === 0 && (
                          <span className="text-[11px] text-slate-400 italic">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                <div className={`mt-5 pt-3 border-t flex items-center gap-2 ${isDarkMode ? 'border-emerald-900/30' : 'border-slate-100'}`}>
                  <button 
                    onClick={() => openAssignModal(company)}
                    disabled={isFull}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all text-center shadow-xs cursor-pointer flex items-center justify-center gap-1.5 ${
                      isFull 
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white'
                    }`}
                  >
                    {isFull ? 'Capacity Full' : 'Assign Intern'}
                  </button>
                  <button 
                    onClick={() => openCompanyModal('edit', company)}
                    className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors shadow-2xs cursor-pointer bg-white"
                    title="Edit Company"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => { setCompanyToDelete(company); setIsDeleteModalOpen(true); }}
                    className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-colors shadow-2xs cursor-pointer bg-white"
                    title="Remove Company"
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
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Company</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Coordinator</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Assigned Interns</th>
                  <th className={`py-3 px-4 font-semibold text-center ${textMuted}`}>Capacity</th>
                  <th className={`py-3 px-4 font-semibold text-center ${textMuted}`}>Req. Hours</th>
                  <th className={`py-3 px-4 font-semibold text-right ${textMuted}`}>Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-emerald-950/40' : 'divide-slate-100'}`}>
                {filteredCompanies.map((company) => {
                  const assigned = getAssignedStudents(company.id);
                  const isFull = assigned.length >= company.capacity;
                  const sups = getCompanySupervisors(company.id);

                  return (
                    <tr key={company.id} className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {company.logo_url ? (
                            <img src={company.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                              {company.name?.charAt(0)}
                            </div>
                          )}
                          <div>
                            <span className={`font-bold block ${textMain}`}>{company.name}</span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[200px] block">{company.address || 'No address'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-medium ${sups.length > 0 ? textMain : 'text-slate-400 italic'}`}>
                          {sups.length > 0 ? `${sups[0].first_name} ${sups[0].last_name}` : 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold">{assigned.length} students</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-semibold ${isFull ? 'text-rose-500' : textMain}`}>
                          {assigned.length} / {company.capacity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-medium text-slate-500">{company.required_hours || 0} hrs</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openAssignModal(company)} disabled={isFull} className="text-xs font-semibold text-emerald-700 hover:underline disabled:text-slate-400">
                            Assign
                          </button>
                          <button onClick={() => openCompanyModal('edit', company)} className="text-xs font-semibold text-slate-600 hover:underline">
                            Edit
                          </button>
                          <button onClick={() => { setCompanyToDelete(company); setIsDeleteModalOpen(true); }} className="text-xs font-semibold text-rose-600 hover:underline">
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

      {/* --- ADD / EDIT COMPANY MODAL --- */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className={`rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-visible border ${
            isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
          }`}>
            <div className={`px-6 py-4 flex justify-between items-center border-b ${
              isDarkMode ? 'border-emerald-900/30 bg-[#15231b]' : 'border-slate-100 bg-slate-50'
            }`}>
              <div>
                <h2 className={`text-base font-bold tracking-tight ${textMain}`}>
                  {modalMode === 'add' ? 'Register Company' : 'Edit Company'}
                </h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  Department: <span className="font-semibold text-emerald-600">{department}</span>
                </p>
              </div>
              <button onClick={() => setIsCompanyModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleCompanySubmit} className="p-6 flex flex-col gap-4">
              <div className="flex flex-col items-center justify-center mb-1">
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
                <div 
                  onClick={() => !isUploading && fileInputRef.current?.click()} 
                  className={`w-16 h-16 rounded-2xl border-2 border-dashed border-emerald-500/40 ${
                    isDarkMode ? 'bg-[#0f1914]' : 'bg-emerald-50/50'
                  } flex items-center justify-center cursor-pointer overflow-hidden relative group transition-colors`}
                  title="Upload company logo"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : formData.logo_url ? (
                    <>
                      <img src={formData.logo_url} alt="Logo" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-emerald-950/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-bold text-white">Change</span>
                      </div>
                    </>
                  ) : (
                    <svg className="w-6 h-6 text-emerald-600/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  )}
                </div>
                <span className={`text-[10px] font-medium mt-1.5 ${textMuted}`}>Click to add company logo</span>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Company Name</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleFormChange} required placeholder="Enter company name" className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
              </div>

              <div className="relative">
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Address / Location</label>
                <div className="relative">
                  <input type="text" name="address" value={formData.address || ''} onChange={handleFormChange} onFocus={() => setShowSuggestions(true)} placeholder="Enter full address" autoComplete="off" required className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
                  {isSearchingAddress && <div className="absolute right-3 top-1/2 -translate-y-1/2"><div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div></div>}
                </div>
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className={`absolute z-[100] w-full mt-1 border rounded-xl shadow-xl max-h-48 overflow-y-auto ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}>
                    {addressSuggestions.map((suggestion) => (
                      <div key={suggestion.place_id} onClick={() => handleSelectAddress(suggestion.clean_name)} className="px-3 py-2 text-xs cursor-pointer border-b last:border-0 hover:bg-emerald-50 hover:text-emerald-800 transition-colors">
                        {suggestion.clean_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Target Department / Program</label>
                <select 
                  name="department" 
                  value={formData.department || 'BSIT'} 
                  onChange={handleFormChange} 
                  className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                >
                  <option value="BSHM">BSHM - Hospitality Management (HM)</option>
                  <option value="BSCRIM">BSCRIM - Criminology (Crim)</option>
                  <option value="BSIT">BSIT - Information Technology (IT)</option>
                  <option value="BSAB">BSAB - Agribusiness / Agri (Agre)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Slot Capacity</label>
                  <input type="number" name="capacity" value={formData.capacity ?? ''} onChange={handleFormChange} min="1" required placeholder="Slots" className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Required Hours</label>
                  <input type="number" name="required_hours" value={formData.required_hours ?? ''} onChange={handleFormChange} min="1" required placeholder="Hours (e.g. 400)" className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
                </div>
              </div>

              <div className={`pt-3 flex justify-end gap-2 border-t mt-1 ${isDarkMode ? 'border-emerald-900/30' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold text-xs border transition-colors ${
                    isDarkMode
                      ? 'text-slate-200 bg-white/5 border-white/10 hover:bg-white/10'
                      : 'text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl font-semibold text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition-colors disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save Company'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ASSIGN STUDENT MODAL --- */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className={`rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden border ${
            isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
          }`}>
            <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-emerald-900/30 bg-[#15231b]' : 'border-slate-100 bg-slate-50'}`}>
              <h2 className={`text-base font-bold tracking-tight ${textMain}`}>Assign Intern</h2>
              <p className={`text-xs mt-0.5 ${textMuted}`}>Host: <strong className="text-emerald-600">{selectedCompanyForAssign?.name}</strong></p>
            </div>
            <form onSubmit={handleAssignStudent} className="p-6 flex flex-col gap-4">
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${textMuted}`}>Select Unassigned Student</label>
                <select value={studentToAssign} onChange={(e) => setStudentToAssign(e.target.value)} required className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/40 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
                  <option value="" disabled>Choose an intern...</option>
                  {getUnassignedStudents().map(st => <option key={st.id} value={st.id}>{st.first_name} {st.last_name}</option>)}
                </select>
                {getUnassignedStudents().length === 0 && <p className="text-xs text-rose-500 font-semibold mt-2">No unassigned interns available.</p>}
              </div>
              <div className={`pt-3 flex justify-end gap-2 border-t mt-1 ${isDarkMode ? 'border-emerald-900/30' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-semibold text-xs border transition-colors ${
                    isDarkMode
                      ? 'text-slate-200 bg-white/5 border-white/10 hover:bg-white/10'
                      : 'text-slate-700 bg-slate-100 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || !studentToAssign} className="px-5 py-2 rounded-xl font-semibold text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition-colors disabled:opacity-50">{isSubmitting ? 'Assigning...' : 'Confirm Assignment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- PENDING REQUESTS MODAL --- */}
      {isPendingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className={`rounded-2xl shadow-xl w-full max-w-xl flex flex-col overflow-hidden border ${
            isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
          }`}>
            <div className={`px-6 py-4 flex justify-between items-center border-b ${isDarkMode ? 'border-emerald-900/30 bg-[#15231b]' : 'border-slate-100 bg-slate-50'}`}>
              <div>
                <h2 className={`text-base font-bold tracking-tight ${textMain}`}>Pending Placement Approvals</h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>Review student requests for host company deployment</p>
              </div>
              <button onClick={() => setIsPendingModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 dark:border-white/5">
              <input 
                type="text" 
                placeholder="Search student..." 
                value={pendingSearchQuery} 
                onChange={(e) => setPendingSearchQuery(e.target.value)} 
                className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border ${isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} 
              />
            </div>

            <div className="p-4 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-2.5">
              {filteredPendingRequests.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No pending placement requests.
                </div>
              ) : (
                filteredPendingRequests.map(student => {
                  const reqCompany = companies.find(c => String(c.id) === String(student.company_id));
                  return (
                    <div key={student.id} className="p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                          {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${textMain}`}>{student.first_name} {student.last_name}</p>
                          <p className="text-[11px] text-emerald-600 font-medium">Requested: {reqCompany?.name || 'Company'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDeclineRequest(student.id)} disabled={processingId === student.id} className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                          Decline
                        </button>
                        <button onClick={() => handleAcceptRequest(student.id)} disabled={processingId === student.id} className="px-3.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-2xs">
                          {processingId === student.id ? '...' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- VIEW STUDENTS MODAL --- */}
      {isViewModalOpen && companyToView && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className={`rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden border ${
            isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
          }`}>
            <div className={`px-6 py-4 flex justify-between items-center border-b ${isDarkMode ? 'border-emerald-900/30 bg-[#15231b]' : 'border-slate-100 bg-slate-50'}`}>
              <div>
                <h2 className={`text-base font-bold tracking-tight ${textMain}`}>Assigned Interns</h2>
                <p className={`text-xs mt-0.5 ${textMuted}`}>{companyToView.name}</p>
              </div>
              <button onClick={() => setIsViewModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-2">
              {getAssignedStudents(companyToView.id).length === 0 ? (
                <p className="text-center text-xs text-slate-400 my-6">No interns assigned yet.</p>
              ) : (
                getAssignedStudents(companyToView.id).map(student => (
                  <div key={student.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-white/5">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                      {student.first_name?.charAt(0)}{student.last_name?.charAt(0)}
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${textMain}`}>{student.first_name} {student.last_name}</p>
                      <p className="text-[10px] text-slate-400">{department} Intern</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRM DELETE MODAL --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className={`rounded-2xl shadow-xl w-full max-w-[320px] flex flex-col p-6 text-center items-center border ${
            isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
          }`}>
            <h3 className={`text-base font-bold mb-1 ${textMain}`}>Remove Company?</h3>
            <p className={`text-xs mb-5 leading-relaxed ${textMuted}`}>
              Delete <strong className={textMain}>{companyToDelete?.name}</strong>? Assigned students will become unassigned.
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

      {/* --- FEEDBACK MODAL --- */}
      {feedback.show && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className={`rounded-2xl shadow-xl w-full max-w-[320px] flex flex-col p-6 text-center items-center border ${
            isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
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

export default Company;