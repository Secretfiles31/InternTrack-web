export const DEPARTMENT_OPTIONS = [
  { value: 'BSIT', shortLabel: 'BSIT', label: 'Bachelor of Science in Information Technology', logo: '/ccs.png' },
  { value: 'BSHM', shortLabel: 'BSHM', label: 'Bachelor of Science in Hospitality Management', logo: '/hm.png' },
  { value: 'BSCRIM', shortLabel: 'BSCRIM', label: 'Bachelor of Science in Criminology', logo: '/crim.png' },
  { value: 'BSAB', shortLabel: 'BSAB', label: 'Bachelor of Science in Agribusiness', logo: '/agri.png' },
  { value: 'COTED', shortLabel: 'COTED', label: 'College of Teacher Education', logo: '/educ.png' },
];

export const getDepartmentGradient = (deptCode) => {
  switch (deptCode) {
    case 'BSIT':
      return 'bg-gradient-to-br from-purple-600 to-purple-900';
    case 'BSAB':
      return 'bg-gradient-to-br from-green-600 to-green-900';
    case 'BSHM':
      return 'bg-gradient-to-br from-yellow-500 to-yellow-700';
    case 'BSCRIM':
      return 'bg-gradient-to-br from-rose-800 to-rose-950';
    case 'COTED':
      return 'bg-gradient-to-br from-blue-600 to-blue-900';
    default:
      return 'bg-gradient-to-br from-gray-700 to-gray-900';
  }
};

export const getStudentThemeColors = (deptCode) => {
  switch (deptCode) {
    case 'BSIT':
      return {
        primary: 'bg-purple-600',
        ring: 'focus:ring-purple-400 focus:border-purple-400',
        spinner: 'border-t-purple-500',
        text: 'text-purple-500',
        textSoft: 'text-purple-400',
        border: 'border-purple-500/50',
        borderSoft: 'border-purple-500/30',
        bgLight: 'bg-purple-500/20',
        activeTab: 'bg-purple-500/20 text-purple-400',
        ringColor: '#a855f7',
      };
    case 'BSAB':
      return {
        primary: 'bg-green-600',
        ring: 'focus:ring-green-400 focus:border-green-400',
        spinner: 'border-t-green-500',
        text: 'text-green-500',
        textSoft: 'text-green-400',
        border: 'border-green-500/50',
        borderSoft: 'border-green-500/30',
        bgLight: 'bg-green-500/20',
        activeTab: 'bg-green-500/20 text-green-400',
        ringColor: '#22c55e',
      };
    case 'BSHM':
      return {
        primary: 'bg-yellow-600',
        ring: 'focus:ring-yellow-400 focus:border-yellow-400',
        spinner: 'border-t-yellow-500',
        text: 'text-yellow-500',
        textSoft: 'text-yellow-400',
        border: 'border-yellow-500/50',
        borderSoft: 'border-yellow-500/30',
        bgLight: 'bg-yellow-500/20',
        activeTab: 'bg-yellow-500/20 text-yellow-400',
        ringColor: '#eab308',
      };
    case 'BSCRIM':
      return {
        primary: 'bg-rose-700',
        ring: 'focus:ring-rose-400 focus:border-rose-400',
        spinner: 'border-t-rose-500',
        text: 'text-rose-500',
        textSoft: 'text-rose-400',
        border: 'border-rose-500/50',
        borderSoft: 'border-rose-500/30',
        bgLight: 'bg-rose-500/20',
        activeTab: 'bg-rose-500/20 text-rose-400',
        ringColor: '#f43f5e',
      };
    case 'COTED':
      return {
        primary: 'bg-blue-600',
        ring: 'focus:ring-blue-400 focus:border-blue-400',
        spinner: 'border-t-blue-500',
        text: 'text-blue-500',
        textSoft: 'text-blue-400',
        border: 'border-blue-500/50',
        borderSoft: 'border-blue-500/30',
        bgLight: 'bg-blue-500/20',
        activeTab: 'bg-blue-500/20 text-blue-400',
        ringColor: '#3b82f6',
      };
    default:
      return {
        primary: 'bg-gray-700',
        ring: 'focus:ring-gray-400 focus:border-gray-400',
        spinner: 'border-t-gray-500',
        text: 'text-gray-400',
        textSoft: 'text-gray-400',
        border: 'border-gray-500/50',
        borderSoft: 'border-gray-500/30',
        bgLight: 'bg-gray-500/20',
        activeTab: 'bg-gray-500/20 text-gray-300',
        ringColor: '#6b7280',
      };
  }
};

export const getDepartmentBadge = (deptCode) => {
  switch (deptCode) {
    case 'BSIT':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'BSHM':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'BSCRIM':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'BSAB':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'COTED':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

