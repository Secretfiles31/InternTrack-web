import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { getDepartmentBadge as getDeptBadge } from '../../constants/departments';

function Company() {
  const [department, setDepartment] = useState('');
  const [companies, setCompanies] = useState([]);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [activeCompanyId, setActiveCompanyId] = useState(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedCompanyForAssign, setSelectedCompanyForAssign] = useState(null);
  const [studentToAssign, setStudentToAssign] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCapacity, setFilterCapacity] = useState('all'); // all, available, full

  // Address Autocomplete
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [, setIsSearchingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    capacity: '',
    required_hours: '486',
    department: 'BSIT',
    logo_url: '',
  });

  const [feedback, setFeedback] = useState({ show: false, type: '', message: '' });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: coordProfile } = await supabase
        .from('profiles')
        .select('department, company_id')
        .eq('id', user.id)
        .single();

      const coordDept = coordProfile?.department || 'BSIT';
      setDepartment(coordDept);

      // Fetch companies, students
      const [compRes, stuRes] = await Promise.all([
        supabase.from('companies').select('*').order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, first_name, last_name, company_id, avatar_url, company_status, department')
          .eq('role', 'student'),
      ]);

      setCompanies(compRes.data || []);
      setStudents(stuRes.data || []);
    } catch (err) {
      console.error('Error fetching companies:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const searchAddress = useCallback(async (query) => {
    setIsSearchingAddress(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=ph&format=json&addressdetails=1&limit=5`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const list = data.map((item) => {
          const addr = item.address || {};
          const parts = [addr.road, addr.village, addr.suburb, addr.city || addr.town || addr.municipality, addr.province || addr.state];
          const clean = [...new Set(parts.filter(Boolean))].join(', ');
          return { ...item, clean_name: clean || item.display_name.split(',')[0] };
        });
        setAddressSuggestions(list);
      }
    } catch {
      setAddressSuggestions([]);
    } finally {
      setIsSearchingAddress(false);
    }
  }, []);

  // Address search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.address && formData.address.length > 2 && showSuggestions) {
        searchAddress(formData.address);
      } else {
        setAddressSuggestions([]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.address, showSuggestions, searchAddress]);

  const showFeedbackMsg = (type, message) => {
    setFeedback({ show: true, type, message });
    setTimeout(() => setFeedback({ show: false, type: '', message: '' }), 4000);
  };

  const openAddModal = () => {
    setModalMode('add');
    setActiveCompanyId(null);
    setFormData({
      name: '',
      address: '',
      capacity: '10',
      required_hours: '486',
      department: department || 'BSIT',
      logo_url: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (comp) => {
    setModalMode('edit');
    setActiveCompanyId(comp.id);
    setFormData({
      name: comp.name || '',
      address: comp.address || '',
      capacity: comp.capacity ? String(comp.capacity) : '10',
      required_hours: comp.required_hours ? String(comp.required_hours) : '486',
      department: comp.department || department || 'BSIT',
      logo_url: comp.logo_url || '',
    });
    setIsModalOpen(true);
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (modalMode === 'add') {
        const { error } = await supabase.from('companies').insert([
          {
            name: formData.name,
            address: formData.address,
            capacity: parseInt(formData.capacity, 10) || 10,
            required_hours: parseInt(formData.required_hours, 10) || 486,
            department: formData.department || department || 'BSIT',
            logo_url: formData.logo_url,
          },
        ]);
        if (error) throw error;
        showFeedbackMsg('success', 'Partner company created successfully!');
      } else {
        const { error } = await supabase
          .from('companies')
          .update({
            name: formData.name,
            address: formData.address,
            capacity: parseInt(formData.capacity, 10) || 10,
            required_hours: parseInt(formData.required_hours, 10) || 486,
            department: formData.department || department || 'BSIT',
            logo_url: formData.logo_url,
          })
          .eq('id', activeCompanyId);
        if (error) throw error;
        showFeedbackMsg('success', 'Partner company updated successfully!');
      }
      setIsModalOpen(false);
      await fetchData();
    } catch (err) {
      showFeedbackMsg('error', 'Failed to save company: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompany = async (compId) => {
    if (!window.confirm('Are you sure you want to delete this partner company? Assigned students will become unassigned.')) return;
    try {
      await supabase.from('profiles').update({ company_id: null, company_status: 'unassigned' }).eq('company_id', compId);
      const { error } = await supabase.from('companies').delete().eq('id', compId);
      if (error) throw error;
      showFeedbackMsg('success', 'Company removed successfully.');
      await fetchData();
    } catch (err) {
      showFeedbackMsg('error', 'Failed to delete company: ' + err.message);
    }
  };

  const openAssignModal = (comp) => {
    setSelectedCompanyForAssign(comp);
    setStudentToAssign('');
    setIsAssignModalOpen(true);
  };

  const handleAssignStudent = async (e) => {
    e.preventDefault();
    if (!studentToAssign || !selectedCompanyForAssign) return;
    try {
      await supabase
        .from('profiles')
        .update({
          company_id: selectedCompanyForAssign.id,
          company_status: 'active',
        })
        .eq('id', studentToAssign);

      showFeedbackMsg('success', 'Intern assigned to company successfully!');
      setIsAssignModalOpen(false);
      await fetchData();
    } catch (err) {
      showFeedbackMsg('error', 'Failed to assign intern: ' + err.message);
    }
  };

  const filteredCompanies = companies.filter((comp) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      (comp.name || '').toLowerCase().includes(q) ||
      (comp.address || '').toLowerCase().includes(q);

    const assignedCount = students.filter((s) => String(s.company_id) === String(comp.id)).length;
    const isFull = assignedCount >= (comp.capacity || 10);

    if (filterCapacity === 'available') return matchesSearch && !isFull;
    if (filterCapacity === 'full') return matchesSearch && isFull;
    return matchesSearch;
  });

  const unassignedStudents = students.filter(
    (s) => !s.company_id || s.company_status === 'unassigned' || s.company_status === 'pending'
  );

  return (
    <div className="px-4 md:px-8 py-6 flex flex-col gap-6 animate-fade-in max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Partner Host Companies</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage partner companies, track placement capacity slots, and deploy interns.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

          <button
            onClick={openAddModal}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Company
          </button>
        </div>
      </div>

      {feedback.show && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search company by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium">
          <button
            onClick={() => setFilterCapacity('all')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              filterCapacity === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({companies.length})
          </button>
          <button
            onClick={() => setFilterCapacity('available')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              filterCapacity === 'available' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            With Slots
          </button>
          <button
            onClick={() => setFilterCapacity('full')}
            className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
              filterCapacity === 'full' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Full
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-24 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">No host companies found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? `No companies match "${searchQuery}".`
              : 'Click "Add Company" above to register the first partner company for your department.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((comp) => {
            const assignedCount = students.filter((s) => String(s.company_id) === String(comp.id)).length;
            const cap = comp.capacity || 10;
            const isFull = assignedCount >= cap;
            const pct = Math.min(100, Math.round((assignedCount / cap) * 100));

            return (
              <div
                key={comp.id}
                className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  {/* Top badges */}
                  <div className="flex items-center justify-between mb-4">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getDeptBadge(comp.department)}`}>
                      {comp.department || 'BSIT'}
                    </span>
                    {isFull ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                        Full Capacity
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {cap - assignedCount} Slots Open
                      </span>
                    )}
                  </div>

                  {/* Company Identity */}
                  <div className="flex items-center gap-3.5 mb-4">
                    {comp.logo_url ? (
                      <img src={comp.logo_url} alt="" className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-base flex items-center justify-center border border-emerald-200 shrink-0">
                        {comp.name?.charAt(0) || 'C'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">
                        {comp.name}
                      </h4>
                      <p className="text-xs text-slate-500 truncate" title={comp.address}>
                        {comp.address || 'No address set'}
                      </p>
                    </div>
                  </div>

                  {/* Slot progress bar */}
                  <div className="py-2.5 px-3 bg-slate-50 rounded-lg border border-slate-100 mb-4 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-medium">Intern Capacity:</span>
                      <span className="font-semibold text-slate-800">{assignedCount} / {cap} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isFull ? 'bg-rose-500' : 'bg-emerald-600'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => openAssignModal(comp)}
                    disabled={isFull}
                    className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer text-center"
                  >
                    Assign Intern
                  </button>
                  <button
                    onClick={() => openEditModal(comp)}
                    className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                    title="Edit company"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteCompany(comp.id)}
                    className="p-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                    title="Delete company"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Company</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Address</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Capacity Slots</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Required Hours</th>
                  <th className="py-3 px-4 text-[11px] font-semibold text-slate-600 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map((comp) => {
                  const assignedCount = students.filter((s) => String(s.company_id) === String(comp.id)).length;
                  const cap = comp.capacity || 10;
                  const isFull = assignedCount >= cap;

                  return (
                    <tr key={comp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {comp.logo_url ? (
                            <img src={comp.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center border border-emerald-200 shrink-0">
                              {comp.name?.charAt(0) || 'C'}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-semibold text-slate-900 leading-tight">{comp.name}</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${getDeptBadge(comp.department)}`}>
                              {comp.department || 'BSIT'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {comp.address || '—'}
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isFull ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {assignedCount} / {cap} {isFull ? '(Full)' : 'filled'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-600">
                        {comp.required_hours || 486} hrs
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openAssignModal(comp)}
                            disabled={isFull}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors shadow-xs cursor-pointer"
                          >
                            Assign
                          </button>
                          <button
                            onClick={() => openEditModal(comp)}
                            className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
                          >
                            Edit
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

      {/* ADD / EDIT COMPANY MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                {modalMode === 'add' ? 'Add Partner Company' : 'Edit Company Details'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Acme Tech Solutions"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Address with auto-complete */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company Address</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onFocus={() => setShowSuggestions(true)}
                  onChange={(e) => {
                    setFormData({ ...formData, address: e.target.value });
                    setShowSuggestions(true);
                  }}
                  placeholder="Street, City, Province"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {addressSuggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setFormData({ ...formData, address: s.clean_name || s.display_name });
                          setShowSuggestions(false);
                        }}
                        className="p-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                      >
                        {s.clean_name || s.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Intern Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Required Hours</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.required_hours}
                    onChange={(e) => setFormData({ ...formData, required_hours: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Program / Department</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="BSIT">BSIT - Information Technology</option>
                  <option value="BSHM">BSHM - Hospitality Management</option>
                  <option value="BSCRIM">BSCRIM - Criminology</option>
                  <option value="BSAB">BSAB - Agribusiness</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : modalMode === 'add' ? 'Create Company' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN INTERN MODAL */}
      {isAssignModalOpen && selectedCompanyForAssign && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                Assign Intern to {selectedCompanyForAssign.name}
              </h3>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAssignStudent} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Select Unassigned Intern</label>
                {unassignedStudents.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                    All interns in your department are currently assigned to a company.
                  </p>
                ) : (
                  <select
                    value={studentToAssign}
                    onChange={(e) => setStudentToAssign(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">-- Choose an intern --</option>
                    {unassignedStudents.map((stu) => (
                      <option key={stu.id} value={stu.id}>
                        {stu.first_name} {stu.last_name} ({stu.department || 'BSIT'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!studentToAssign || unassignedStudents.length === 0}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Company;

