import { useNavigate } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';

const Icon = ({ d }) => (
  <svg className="w-[17px] h-[17px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const NAV = [
  {
    heading: 'Overview',
    items: [
      { 
        name: 'Dashboard', 
        label: 'Dashboard', 
        d: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z' 
      },
    ],
  },
  {
    heading: 'Monitoring',
    items: [
      { 
        name: 'Intern Monitor', 
        label: 'Intern Monitor', 
        d: 'M3 12h4l3-8 4 16 3-8h4' 
      },
      { 
        name: 'Journals', 
        label: 'Weekly Journals', 
        d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' 
      },
      { 
        name: 'Announcements', 
        label: 'Announcements', 
        d: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' 
      },
    ],
  },
  {
    heading: 'Management',
    items: [
      { 
        name: 'Companies', 
        label: 'Partner Companies', 
        d: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' 
      },
      { 
        name: 'List of Interns', 
        label: 'Assigned Interns', 
        d: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' 
      },
    ],
  },
  {
    heading: 'System',
    items: [
      { 
        name: 'Settings', 
        label: 'Settings', 
        d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' 
      },
    ],
  },
];

function Sidebar({ onSelectTab, activeTab, isOpen, onClose, profile = {} }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    localStorage.removeItem('rememberMe');
    await supabase.auth.signOut();
    navigate('/login');
  };

  const fullName = profile.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : 'OJT Coordinator';
  const initial = (profile.first_name || 'C').charAt(0).toUpperCase();

  return (
    <>
      {isOpen && (
        <div onClick={onClose} className="fixed inset-0 bg-slate-950/50 z-40 md:hidden" />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 w-60 h-screen z-50 flex flex-col bg-[#14532d] text-green-100 select-none transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/10 shrink-0 bg-[#14532d]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[17px] font-bold text-white tracking-tight">
              Intern<span className="text-[#facc15]">Track</span>
            </span>
          </div>
          <button onClick={onClose} className="md:hidden p-1.5 rounded-md text-green-200 hover:text-white hover:bg-white/10 cursor-pointer" aria-label="Close menu">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 sidebar-scroll">
          {NAV.map((section) => (
            <div key={section.heading}>
              <p className="px-3 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-green-300/70">
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = activeTab === item.name;
                  return (
                    <button
                      key={item.name}
                      onClick={() => {
                        onSelectTab && onSelectTab(item.name);
                        onClose && onClose();
                      }}
                      className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-white/[0.14] text-white font-medium'
                          : 'text-green-100/80 hover:bg-white/[0.07] hover:text-white'
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-emerald-300" />}
                      <span className={active ? 'text-emerald-300' : 'text-green-300/70'}>
                        <Icon d={item.d} />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile / Logout */}
        <div className="p-3 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-2">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-green-800 text-white text-xs font-semibold flex items-center justify-center">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-100 truncate">{fullName}</p>
              <p className="text-[11px] text-green-300/70">OJT Coordinator</p>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              className="p-1.5 rounded-md text-green-300/70 hover:text-white hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <style>{`
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 9999px; }
      `}</style>
    </>
  );
}

export default Sidebar;
