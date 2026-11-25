import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';
import AdminSidebar from './AdminSidebar';

import Overview from './Overview';
import AddStudent from './AddStudent';
import AddSupervisor from './AddSupervisor';
import Company from './Company';
import StudentReports from './StudentReports';
import InternMonitor from './InternMonitor';
import AnnouncementsManager from '../shared/AnnouncementsManager';
import Settings from './Settings';

const PAGE_TITLES = {
  Dashboard: 'Dashboard',
  'Add Student': 'Students',
  'Add Supervisor': 'OJT Coordinators',
  'Add Company': 'Partner Companies',
  'Intern Monitor': 'Intern Monitor',
  'Student Report': 'Progress Reports',
  Announcements: 'Announcements',
  Settings: 'Settings',
};

function DashAdmin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = PAGE_TITLES[tabParam] ? tabParam : 'Dashboard';
  const setActiveTab = (tab) => {
    setSearchParams(tab === 'Dashboard' ? {} : { tab });
  };
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [monitorFilter, setMonitorFilter] = useState('all');
  const [reportSearch, setReportSearch] = useState('');

  // onNavigate(tab) or onNavigate(tab, { filter }) - used by dashboard shortcuts
  const handleNavigate = (tab, opts = {}) => {
    if (tab === 'Intern Monitor') setMonitorFilter(opts.filter || 'all');
    if (tab === 'Student Report') setReportSearch(opts.search || '');
    setActiveTab(tab);
  };
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState({ first_name: '', last_name: '', department: '', role: '', avatar_url: '' });

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Text size chosen in Settings > Appearance (small / normal / large)
  useEffect(() => {
    const SIZES = { small: '14px', normal: '16px', large: '18px' };
    const apply = () => {
      const size = localStorage.getItem('adminTextSize') || 'normal';
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
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (data) {
          if (data.role !== 'admin') { navigate('/dashboard'); return; }
          setProfile(data);
        }
      } else {
        navigate('/login');
      }
      setAuthLoading(false);
    };
    checkAuthAndFetchProfile();
  }, [navigate]);

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="w-screen h-screen overflow-hidden flex font-sans bg-slate-50 text-slate-900">
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={(t) => { setActiveTab(t); setIsMobileOpen(false); }}
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        profile={profile}
      />

      <div className="flex-1 h-screen flex flex-col overflow-hidden relative min-w-0">
        <header className="h-14 px-4 md:px-8 border-b border-slate-200 bg-white shrink-0 flex items-center justify-between z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="md:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-[15px] font-semibold text-slate-900">{PAGE_TITLES[activeTab] || activeTab}</h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden lg:inline text-xs text-slate-500">{today}</span>
            <button
              onClick={() => setActiveTab('Settings')}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-100 transition-colors"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center">
                  {(profile.first_name || 'A').charAt(0)}
                </div>
              )}
              <span className="hidden sm:inline text-[13px] font-medium text-slate-700">
                {profile.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'Administrator'}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          {authLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
              <div className="w-7 h-7 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          )}

          <div className="h-full w-full">
            {activeTab === 'Dashboard' && <Overview onNavigate={handleNavigate} />}
            {activeTab === 'Add Student' && <AddStudent onNavigate={setActiveTab} />}
            {activeTab === 'Add Supervisor' && <AddSupervisor onNavigate={setActiveTab} />}
            {activeTab === 'Add Company' && <Company onNavigate={setActiveTab} />}
            {activeTab === 'Intern Monitor' && <InternMonitor onNavigate={handleNavigate} initialFilter={monitorFilter} />}
            {activeTab === 'Student Report' && <StudentReports onNavigate={handleNavigate} initialSearch={reportSearch} />}
            {activeTab === 'Announcements' && <AnnouncementsManager onNavigate={handleNavigate} mode="admin" />}
            {activeTab === 'Settings' && <Settings onNavigate={setActiveTab} />}
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

export default DashAdmin;