import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Contacts from '@/pages/Contacts';
import ServiceRequests from '@/pages/ServiceRequests';
import ServiceRequestDetail from '@/pages/ServiceRequestDetail';
import BotContent from '@/pages/BotContent';
import ServiceContentPage from '@/pages/ServiceContentPage';
import Lectures from '@/pages/Lectures';
import SystemSettings from '@/pages/SystemSettings';
import BotChat from '@/pages/BotChat';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      <Route element={<AppLayout />}>
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Contacts" element={<Contacts />} />
        <Route path="/ServiceRequests" element={<ServiceRequests />} />
        <Route path="/ServiceRequestDetail" element={<ServiceRequestDetail />} />
        <Route path="/BotChat" element={<BotChat />} />
        <Route path="/BotContent" element={<BotContent />} />
        <Route path="/ServiceContent" element={<ServiceContentPage />} />
        <Route path="/Lectures" element={<Lectures />} />
        <Route path="/SystemSettings" element={<SystemSettings />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App