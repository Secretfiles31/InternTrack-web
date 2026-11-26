import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient'; 
import Sidebar from './Sidebar'; 
import Overview from './Overview';
import InternMonitor from './InternMonitor';
import Company from './Company';
import ListStudents from './ListStudents';
import Approvals from './Approvals';
import InternJournals from './InternJournals'; 
import AnnouncementsManager from '../shared/AnnouncementsManager';
import Settings from './Settings'; 

const PAGE_TITLES = {
  Dashboard: 'Dashboard',
  'Intern Monitor': 'Intern Monitor',
  Companies: 'Partner Companies',
  Approvals: 'Placement Approvals',
  'List of Interns': 'Students',
  Journals: 'Progress Reports',
  'Student Report': 'Progress Reports',
  Announcements: 'Announcements',
  Settings: 'Settings',
};

function CoordinatorDash() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = PAGE_TITLES[tabParam] ? tabParam : 'Dashboard';
  const setActiveTab = (tab) => {
    const resolved = tab === 'Student Report' ? 'Journals' : tab;
    setSearchParams(resolved === 'Dashboard' ? {} : { tab: resolved });
  };
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [monitorFilter, setMonitorFilter] = useState('all');
  const [reportSearch, setReportSearch] = useState('');

  // onNavigate(tab) or onNavigate(tab, { filter, search })
  const handleNavigate = (tab, opts = {}) => {
    if (tab === 'Intern Monitor') setMonitorFilter(opts.filter || 'all');
    if (tab === 'Journals' || tab === 'Student Report') setReportSearch(opts.search || '');
    setActiveTab(tab === 'Student Report' ? 'Journals' : tab);
  };

  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState({ first_name: '', last_name: '', department: '', avatar_url: '' });

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Text size chosen in Settings > Appearance (small / normal / large)
  useEffect(() => {
    const SIZES = { small: '14px', normal: '16px', large: '18px' };
    const apply = () => {
      const size = localStorage.getItem('coordinatorTextSize') || localStorage.getItem('adminTextSize') || 'normal';
      document.documentElement.style.fontSize = SIZES[size] || SIZES.normal;
    };
    apply();
    window.addEventListener('textSizeChange', apply);
    return () => {
      window.removeEventListener('textSizeChange', apply);
      document.documentElement.style.fontSize = '';
    };
  }, []);

  useEffect(() => {
    const checkAuthAndFetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data } = await supabase
          .from('profiles')
          .select('first_name, last_name, department, role, avatar_url')
          .eq('id', session.user.id)
          .single();
        
        // Allow coordinator / supervisor / admin access
        const role = (data?.role || '').trim().toLowerCase();
        if (data && !['supervisor', 'coordinator', 'admin'].includes(role)) {
          navigate('/login');
          return;
        }
        
        if (data) setProfile(data);
      } else {
        navigate('/login');
      }
      setAuthLoading(false);
    };
    checkAuthAndFetchProfile();
  }, [navigate]);

  const today = new Date().toLocaleDateString(undefined, { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  return (
    <div className="w-screen h-screen overflow-hidden flex font-sans bg-slate-50 text-slate-900">
      
      {/* Sidebar matching Admin aesthetic */}
      <Sidebar 
        activeTab={activeTab === 'Student Report' ? 'Journals' : activeTab} 
        onSelectTab={(tabName) => { 
          handleNavigate(tabName); 
          setIsMobileOpen(false); 
        }} 
        isOpen={isMobileOpen} 
        onClose={() => setIsMobileOpen(false)} 
        profile={profile}
      />

      {/* Main Area */}
      <div className="flex-1 h-screen flex flex-col overflow-hidden relative min-w-0">
        
        {/* Top Header matching Admin */}
        <header className="h-14 px-4 md:px-8 border-b border-slate-200 bg-white shrink-0 flex items-center justify-between z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="md:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-[15px] font-semibold text-slate-900">
              {PAGE_TITLES[activeTab] || activeTab}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden lg:inline text-xs text-slate-500">{today}</span>
            <button
              onClick={() => handleNavigate('Settings')}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center">
                  {(profile.first_name || 'C').charAt(0)}
                </div>
              )}
              <span className="hidden sm:inline text-[13px] font-medium text-slate-700">
                {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'OJT Coordinator'}
              </span>
            </button>
          </div>
        </header>

        {/* Content Workspace */}
        <main className="flex-1 overflow-y-auto custom-scrollbar relative bg-slate-50">
          {authLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
              <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          )}

          <div className="h-full w-full">
            {activeTab === 'Dashboard' && <Overview onNavigate={handleNavigate} />}
            {activeTab === 'Intern Monitor' && <InternMonitor onNavigate={handleNavigate} initialFilter={monitorFilter} />}
            {activeTab === 'Companies' && <Company onNavigate={handleNavigate} />}
            {activeTab === 'Approvals' && <Approvals onNavigate={handleNavigate} />}
            {activeTab === 'List of Interns' && <ListStudents onNavigate={handleNavigate} />}
            {(activeTab === 'Journals' || activeTab === 'Student Report') && (
              <InternJournals onNavigate={handleNavigate} initialSearch={reportSearch} />
            )}
            {activeTab === 'Announcements' && (
              <AnnouncementsManager onNavigate={handleNavigate} mode="supervisor" />
            )}
            {activeTab === 'Settings' && <Settings onNavigate={handleNavigate} />}
          </div>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(100,116,139,0.25); border-radius: 9999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(100,116,139,0.45); }
        .animate-fade-in { animation: fadeIn 0.15s ease-out; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

export default CoordinatorDash;
