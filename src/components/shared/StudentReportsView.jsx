import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import {
  buildWeeklyReportDocxBlob,
  parseJournalContent,
  renderDocxPreview,
  triggerBlobDownload,
} from '../../utils/docxGenerator';
import { useToast } from '../common/ToastProvider';

function StudentReportsView({ onNavigate, initialSearch = '' }) {
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filters State
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [filterDept, setFilterDept] = useState('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('');

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    setSearchQuery(initialSearch || '');
  }

  // Modal States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState(null);

  // View Document States
  const [isFetchingFile, setIsFetchingFile] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [viewingJournal, setViewingJournal] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const previewRef = useRef(null);
  const [zoom, setZoom] = useState(100);
  const [generatedReport, setGeneratedReport] = useState({
    weekNumber: '',
    inclusiveDates: '',
    activities: '',
    learnings: ''
  });

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

      // Fetch students across all departments
      const { data: studentsData, error: studentsError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, department')
        .eq('role', 'student');

      if (studentsError) throw studentsError;

      if (!studentsData || studentsData.length === 0) {
        setReports([]);
        setIsLoading(false);
        return;
      }

      const studentIds = studentsData.map(student => student.id);

      const { data: journalsData, error: journalsError } = await supabase
        .from('saved_journals')
        .select('*')
        .in('user_id', studentIds) 
        .order('created_at', { ascending: false });

      if (journalsError) throw journalsError;

      const combinedData = (journalsData || []).map(journal => {
        const studentProfile = studentsData.find(s => s.id === journal.user_id);
        return {
          ...journal,
          profiles: studentProfile || {} 
        };
      });

      setReports(combinedData);

    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const bgCard = isDarkMode ? 'bg-[#121d17] border-emerald-900/30' : 'bg-white border-slate-200/90';
  const textMain = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const textMuted = isDarkMode ? 'text-emerald-200/60' : 'text-slate-500';

  const getDepartmentBadge = (dept) => {
    const d = (dept || 'BSIT').toUpperCase();
    if (d.includes('IT')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (d.includes('HM')) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (d.includes('CRIM')) return 'bg-rose-100 text-rose-800 border-rose-200';
    if (d.includes('AB') || d.includes('AGRI') || d.includes('AGRE')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    return 'bg-purple-100 text-purple-800 border-purple-200';
  };

  const filteredReports = reports.filter(report => {
    const studentName = `${report.profiles?.first_name || ''} ${report.profiles?.last_name || ''}`.toLowerCase();
    const fileName = (report.file_name || '').toLowerCase();
    const searchMatch = studentName.includes(searchQuery.toLowerCase()) || fileName.includes(searchQuery.toLowerCase());
    
    if (filterDept !== 'all' && report.profiles?.department !== filterDept) return false;

    let reportMonth = null;
    if (report.created_at) {
      reportMonth = new Date(report.created_at).getMonth() + 1;
    }
    
    const monthMatch = monthFilter && reportMonth ? reportMonth.toString() === monthFilter : true;
    const weekMatch = weekFilter ? String(report.week_number) === String(weekFilter) : true;
    
    return searchMatch && monthMatch && weekMatch;
  });

  const buildReportDocx = async (journal) => {
    const { data, error } = await supabase.storage.from('journals').download(journal.file_path);
    if (error) throw error;

    const text = await data.text();
    const reportData = parseJournalContent(text, {
      weekNumber: journal.week_number,
      inclusiveDates: journal.inclusive_dates,
      fileName: journal.file_name,
      firstName: journal.profiles?.first_name || '',
      lastName: journal.profiles?.last_name || '',
    });

    return buildWeeklyReportDocxBlob(reportData);
  };

  const handleViewDocument = async (journal) => {
    setIsFetchingFile(true);
    try {
      const blob = await buildReportDocx(journal);
      setGeneratedReport({
        weekNumber: journal.week_number,
        inclusiveDates: journal.inclusive_dates,
        activities: '',
        learnings: ''
      });
      setViewingProfile(journal.profiles);
      setViewingJournal(journal);
      setPreviewBlob(blob);
      setZoom(100);
      setIsResultModalOpen(true);
    } catch {
      toast.error("Failed to load document.");
    } finally {
      setIsFetchingFile(false);
    }
  };

  // Render the .docx inside the modal so it looks like it does in Microsoft Word
  useEffect(() => {
    if (!isResultModalOpen || !previewBlob || !previewRef.current) return;
    const container = previewRef.current;
    renderDocxPreview(previewBlob, container).catch(() => {
      container.innerHTML = '<p style="padding:24px;text-align:center;color:#64748b;font-size:12px">Could not display this document.</p>';
    });
  }, [isResultModalOpen, previewBlob]);

  const handleDownload = async (journal) => {
    try {
      const blob = await buildReportDocx(journal);
      const dlName = journal.file_name.replace(/\.(json|doc|docx)$/i, '') + '.docx';
      triggerBlobDownload(blob, dlName);
    } catch {
      toast.error('Failed to download file.');
    }
  };

  const handleDeleteConfirm = async () => {
    setIsSubmitting(true);
    try {
      await supabase.storage.from('journals').remove([reportToDelete.file_path]);
      await supabase.from('saved_journals').delete().eq('id', reportToDelete.id);
      
      setReports(reports.filter(r => r.id !== reportToDelete.id));
      setIsDeleteModalOpen(false);
      toast.success('Report deleted.');
    } catch { 
      toast.error('Failed to delete report.'); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    return new Date(dateString).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="p-5 md:p-6 flex flex-col gap-5 animate-fade-in max-w-7xl mx-auto w-full font-sans">
      
      {/* ADMINLTE 4 CONTENT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h1 className={`text-2xl font-normal tracking-tight ${textMain}`}>
            Weekly Progress Reports
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
          <span className={isDarkMode ? 'text-slate-300' : 'text-slate-600'}>Reports</span>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className={`p-3.5 rounded-lg border flex flex-col sm:flex-row items-center justify-between gap-3 ${bgCard} shadow-2xs`}>
        <div className="relative flex-1 w-full max-w-md">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            placeholder="Search by student name or document file name..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className={`w-full pl-9 pr-3 py-1.5 rounded-md text-xs font-normal outline-none border transition-colors ${
              isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
            }`} 
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
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
            value={monthFilter} 
            onChange={(e) => setMonthFilter(e.target.value)} 
            className={`px-2.5 py-1.5 rounded-md text-xs font-normal border outline-none ${
              isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <option value="">All Months</option>
            <option value="1">January</option>
            <option value="2">February</option>
            <option value="3">March</option>
            <option value="4">April</option>
            <option value="5">May</option>
            <option value="6">June</option>
            <option value="7">July</option>
            <option value="8">August</option>
            <option value="9">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>

          <select 
            value={weekFilter} 
            onChange={(e) => setWeekFilter(e.target.value)} 
            className={`px-2.5 py-1.5 rounded-md text-xs font-normal border outline-none ${
              isDarkMode ? 'bg-[#0f1914] border-emerald-900/30 text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <option value="">All Weeks</option>
            <option value="1">Week 1</option>
            <option value="2">Week 2</option>
            <option value="3">Week 3</option>
            <option value="4">Week 4</option>
          </select>
        </div>
      </div>

      {/* REPORTS TABLE */}
      <div className={`rounded-lg border overflow-hidden ${bgCard} shadow-2xs`}>
        {(isLoading || isFetchingFile) && (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-2"></div>
            {isFetchingFile && <p className="text-xs text-slate-500 font-medium">Opening Document Preview...</p>}
          </div>
        )}

        {!isLoading && filteredReports.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className={`text-base font-bold ${textMain}`}>No reports found</h3>
            <p className={`text-xs mt-1 max-w-sm ${textMuted}`}>
              {searchQuery
                ? `Nothing matches "${searchQuery}". This intern may not have submitted a weekly report yet.`
                : 'Submitted weekly journals from student interns will appear here automatically.'}
            </p>
          </div>
        ) : !isLoading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-max text-xs">
              <thead className={`border-b ${isDarkMode ? 'bg-[#15231b] border-emerald-900/30' : 'bg-slate-50 border-slate-200/80'}`}>
                <tr>
                  <th className={`py-3 px-4 font-semibold w-16 text-center ${textMuted}`}>Week</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Student</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Document</th>
                  <th className={`py-3 px-4 font-semibold ${textMuted}`}>Inclusive Dates</th>
                  <th className={`py-3 px-4 font-semibold text-center ${textMuted}`}>Submitted</th>
                  <th className={`py-3 px-4 font-semibold text-right ${textMuted}`}>Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-emerald-950/40' : 'divide-slate-100'}`}>
                {filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {report.week_number}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {report.profiles.avatar_url ? (
                          <img src={report.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                            {report.profiles.first_name?.charAt(0)}{report.profiles.last_name?.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className={`font-bold ${textMain}`}>{report.profiles.first_name} {report.profiles.last_name}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase inline-block mt-0.5 ${getDepartmentBadge(report.profiles?.department)}`}>
                            {report.profiles?.department || 'BSIT'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className={`font-semibold ${textMain}`}>{report.file_name.replace(/\.json$/i, '.docx')}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-slate-600 font-medium">{report.inclusive_dates || 'N/A'}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-slate-500">{formatDate(report.created_at)}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewDocument(report)}
                          style={{ backgroundColor: '#ecfdf5', color: '#047857', borderColor: '#10b981', opacity: 1 }}
                          className="px-3 py-1 rounded-lg border text-xs font-semibold transition-all hover:brightness-95"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleDownload(report)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors"
                        >
                          Download
                        </button>
                        <button 
                          onClick={() => { setReportToDelete(report); setIsDeleteModalOpen(true); }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete Report"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- DOCUMENT VIEWER (Docs-style) --- */}
      {isResultModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#f1f3f4] animate-fade-in">
          {/* Top bar */}
          <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center gap-3 shrink-0">
            <button
              onClick={() => { setIsResultModalOpen(false); setPreviewBlob(null); setViewingJournal(null); }}
              title="Close"
              className="p-2 rounded-full text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">
                {(viewingJournal?.file_name || 'Document').replace(/\.json$/i, '.docx')}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {viewingProfile?.first_name} {viewingProfile?.last_name} &middot; Week {generatedReport.weekNumber} &middot; {generatedReport.inclusiveDates}
              </p>
            </div>
            <button
              onClick={() => viewingJournal && handleDownload(viewingJournal)}
              style={{ backgroundColor: '#059669', color: '#ffffff' }}
              className="px-4 py-2 rounded-full text-xs font-semibold shadow-2xs hover:brightness-95 transition-all shrink-0"
            >
              Download
            </button>
          </div>

          {/* Toolbar */}
          <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex items-center justify-center gap-1 shrink-0">
            <button
              onClick={() => setZoom((z) => Math.max(50, z - 10))}
              title="Zoom out"
              className="w-8 h-8 rounded-md text-slate-600 hover:bg-slate-100 text-lg leading-none"
            >&minus;</button>
            <button
              onClick={() => setZoom(100)}
              title="Reset zoom"
              className="min-w-[56px] h-8 px-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
            >{zoom}%</button>
            <button
              onClick={() => setZoom((z) => Math.min(200, z + 10))}
              title="Zoom in"
              className="w-8 h-8 rounded-md text-slate-600 hover:bg-slate-100 text-lg leading-none"
            >+</button>
          </div>

          {/* Page area */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <div ref={previewRef} className="word-preview" style={{ zoom: zoom / 100 }} />
            <style>{`
              .word-preview .docx-wrapper { background: #e2e8f0; padding: 32px 16px 48px; display: flex; flex-direction: column; align-items: center; }
              .word-preview .docx-wrapper > section.docx { margin-bottom: 24px; background: #ffffff; border: 1px solid #cbd5e1; box-shadow: 0 4px 16px rgba(15,23,42,0.12); border-radius: 4px; }
            `}</style>
          </div>
        </div>
      )}

      {/* --- CONFIRM DELETE MODAL --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className={`rounded-2xl shadow-xl w-full max-w-[320px] flex flex-col p-6 text-center items-center border ${
            isDarkMode ? 'bg-[#121d17] border-emerald-900/40' : 'bg-white border-slate-200'
          }`}>
            <h3 className={`text-base font-bold mb-1 ${textMain}`}>Delete Document?</h3>
            <p className={`text-xs mb-5 leading-relaxed ${textMuted}`}>
              Are you sure you want to remove <strong className={textMain}>{reportToDelete?.file_name}</strong> from storage?
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
              <button onClick={handleDeleteConfirm} disabled={isSubmitting} className="py-2 rounded-xl font-semibold text-xs text-white bg-rose-600 hover:bg-rose-700 shadow-2xs flex-1 transition-colors disabled:opacity-50">
                {isSubmitting ? '...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default StudentReportsView;