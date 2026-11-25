import { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/common/ToastProvider';

const Landing = lazy(() => import('./Pages/Landing'));
const Sign = lazy(() => import('./Pages/Sign'));
const Login = lazy(() => import('./Pages/Login'));
const Dashboard = lazy(() => import('./Pages/Dashboard'));
const DashAdmin = lazy(() => import('./components/admin/DashAdmin'));
const CoordinatorDash = lazy(() => import('./components/coordinator/CoordinatorDash'));

function RouteFallback() {
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/sign" element={<Sign />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin-dashboard" element={<DashAdmin />} />
            <Route path="/supervisor-dashboard" element={<CoordinatorDash />} />
            <Route path="/coordinator-dashboard" element={<CoordinatorDash />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ToastProvider>
  );
}

export default App;
