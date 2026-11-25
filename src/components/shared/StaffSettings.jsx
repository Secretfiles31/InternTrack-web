import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { DEPARTMENT_OPTIONS } from '../../constants/departments';
import { validateImageFile } from '../../utils/fileValidation';

function StaffSettings({ onNavigate, storageKey = 'adminTextSize', avatarPrefix = 'admin' }) {
  const [activeTab, setActiveTab] = useState('Profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [userId, setUserId] = useState(null);
  const [profileData, setProfileData] = useState({ first_name: '', last_name: '', department: '', avatar_url: '' });
  
  const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  
  const fileInputRef = useRef(null);

  // TEXT SIZE (applied across the whole dashboard by DashAdmin / CoordinatorDash)
  const TEXT_SIZES = [
    { key: 'small', label: 'Small', hint: 'Fits more on screen', sample: 'text-xs' },
    { key: 'normal', label: 'Normal', hint: 'Default size', sample: 'text-base' },
    { key: 'large', label: 'Large', hint: 'Easier to read', sample: 'text-xl' },
  ];
  const [textSize, setTextSize] = useState(
    localStorage.getItem(storageKey) || localStorage.getItem('adminTextSize') || 'normal'
  );

  const changeTextSize = (size) => {
    setTextSize(size);
    localStorage.setItem(storageKey, size);
    if (storageKey !== 'adminTextSize') {
      localStorage.setItem('adminTextSize', size);
    }
    window.dispatchEvent(new Event('textSizeChange'));
  };

  const showFeedback = useCallback((type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  }, []);

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, department, avatar_url')
          .eq('id', user.id)
          .single();
        if (profile) {
          setProfileData(profile);
        }
      } catch {
        showFeedback('error', 'Failed to load profile data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, [showFeedback]);

  const bgCard = 'bg-white border-slate-200/90';
  const textMain = 'text-slate-900';
  const textMuted = 'text-slate-500';

  const handleProfileChange = (e) => setProfileData({ ...profileData, [e.target.name]: e.target.value });
  const handlePasswordChange = (e) => setPasswordData({ ...passwordData, [e.target.name]: e.target.value });

  const handleAvatarUpload = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      const check = validateImageFile(file);
      if (!check.valid) {
        showFeedback('error', check.error);
        return;
      }
      setIsSaving(true);
      const fileName = `${userId}/${avatarPrefix}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
      if (updateError) throw updateError;
      setProfileData((prev) => ({ ...prev, avatar_url: publicUrl }));
      showFeedback('success', 'Avatar updated!');
    } catch { 
      showFeedback('error', 'Error uploading image.'); 
    } finally {
      setIsSaving(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        first_name: profileData.first_name,
        last_name: profileData.last_name,
        department: profileData.department
      }).eq('id', userId);
      if (error) throw error;
      showFeedback('success', 'Profile updated successfully!');
    } catch { 
      showFeedback('error', 'Failed to update profile.'); 
    } finally {
      setIsSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword.length < 8) return showFeedback('error', 'Password must be at least 8 characters.');
    if (passwordData.newPassword !== passwordData.confirmPassword) return showFeedback('error', 'Passwords do not match.');
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordData.newPassword });
      if (error) throw error;

      setPasswordData({ newPassword: '', confirmPassword: '' });
      showFeedback('success', 'Password updated successfully!');
    } catch { 
      showFeedback('error', 'Failed to update password.'); 
    } finally { 
      setIsSaving(false); 
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-6 flex flex-col gap-5 animate-fade-in max-w-5xl mx-auto w-full font-sans">
      
      {/* ADMINLTE 4 CONTENT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h1 className={`text-2xl font-normal tracking-tight ${textMain}`}>
            Account & Preferences
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
          <span className={'text-slate-600'}>Settings</span>
        </div>
      </div>

      {feedback.message && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
            : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* TABS CONTAINER */}
      <div className={`rounded-lg border p-5 ${bgCard} shadow-2xs`}>
        <div className="flex border-b border-slate-200/80 gap-6 mb-6">
          <button
            onClick={() => setActiveTab('Profile')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'Profile'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Public Profile
          </button>
          <button
            onClick={() => setActiveTab('Appearance')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'Appearance'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Appearance
          </button>
          <button
            onClick={() => setActiveTab('Security')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === 'Security'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Account Security
          </button>
        </div>

        {/* 1. PUBLIC PROFILE */}
        {activeTab === 'Profile' && (
          <div className="flex flex-col-reverse md:flex-row gap-8 max-w-2xl">
            <form onSubmit={saveProfile} className="flex-1 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>First Name</label>
                  <input type="text" name="first_name" value={profileData.first_name || ''} onChange={handleProfileChange} required className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border bg-slate-50 border-slate-200 text-slate-800`} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Last Name</label>
                  <input type="text" name="last_name" value={profileData.last_name || ''} onChange={handleProfileChange} required className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border bg-slate-50 border-slate-200 text-slate-800`} />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Department</label>
                <select name="department" value={profileData.department || ''} onChange={handleProfileChange} className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border bg-slate-50 border-slate-200 text-slate-800`}>
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <option key={dept.value} value={dept.value}>
                      {dept.value} - {dept.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button type="submit" disabled={isSaving} className="px-5 py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors disabled:opacity-50">
                  {isSaving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>

            <div className="flex flex-col items-center gap-2">
              <span className={`text-xs font-semibold ${textMuted}`}>Avatar</span>
              <div 
                onClick={() => !isSaving && fileInputRef.current?.click()}
                className="w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-emerald-500/40 cursor-pointer relative group flex items-center justify-center bg-slate-50"
                title="Change Avatar"
              >
                {profileData.avatar_url ? (
                  <img src={profileData.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-emerald-100 text-emerald-800 font-bold text-lg flex items-center justify-center">
                    {profileData.first_name?.charAt(0)}
                  </div>
                )}
                <div className="absolute inset-0 bg-emerald-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
                  Edit
                </div>
              </div>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleAvatarUpload} className="hidden" />
            </div>
          </div>
        )}

        {/* 2. APPEARANCE */}
        {activeTab === 'Appearance' && (
          <div className="max-w-xl flex flex-col gap-4">
            <div>
              <p className={`font-semibold text-xs ${textMain}`}>Text Size</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Choose how large text and spacing appear across the dashboard.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Text size">
              {TEXT_SIZES.map((opt) => {
                const selected = textSize === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => changeTextSize(opt.key)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-slate-50 hover:border-emerald-400'
                    }`}
                  >
                    <span className={`block font-bold leading-none ${opt.sample} ${selected ? 'text-emerald-700' : 'text-slate-700'}`}>Aa</span>
                    <span className={`block mt-3 text-xs font-semibold ${selected ? 'text-emerald-800' : textMain}`}>{opt.label}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">{opt.hint}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400">Your choice is saved on this device.</p>
          </div>
        )}

        {/* 3. SECURITY */}
        {activeTab === 'Security' && (
          <div className="max-w-md flex flex-col gap-5">
            <form onSubmit={savePassword} className="flex flex-col gap-4">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>New Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    name="newPassword" 
                    value={passwordData.newPassword} 
                    onChange={handlePasswordChange} 
                    required 
                    placeholder="Enter new password" 
                    className={`w-full px-3 py-2 pr-8 rounded-xl text-xs font-medium outline-none border bg-slate-50 border-slate-200 text-slate-800`} 
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPassword ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${textMuted}`}>Confirm New Password</label>
                <input 
                  type={showPassword ? "text" : "password"} 
                  name="confirmPassword" 
                  value={passwordData.confirmPassword} 
                  onChange={handlePasswordChange} 
                  required 
                  placeholder="Confirm new password" 
                  className={`w-full px-3 py-2 rounded-xl text-xs font-medium outline-none border bg-slate-50 border-slate-200 text-slate-800`} 
                />
              </div>

              <div className="pt-2">
                <button type="submit" disabled={isSaving || !passwordData.newPassword} className="px-5 py-2.5 rounded-xl font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors disabled:opacity-50">
                  {isSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

    </div>
  );
}

export default StaffSettings;