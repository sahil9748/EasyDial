import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useWebSocket from './hooks/useWebSocket';
import useAuthStore from './store/authStore';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import UsersPage from './pages/admin/Users';
import TrunksPage from './pages/admin/Trunks';
import CampaignsPage from './pages/admin/Campaigns';
import CampaignDetail from './pages/admin/CampaignDetail';
import QueuesPage from './pages/admin/Queues';
import IVRBuilder from './pages/admin/IVRBuilder';
import RecordingsPage from './pages/admin/Recordings';
import AgentPanel from './pages/agent/AgentPanel';
import LiveDashboard from './pages/supervisor/LiveDashboard';

function AppContent() {
  const token = useAuthStore((s) => s.token);
  // Connect WebSocket when authenticated
  useWebSocket();
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute><Layout /></ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={
            <ProtectedRoute roles={['admin','supervisor']}><Dashboard /></ProtectedRoute>
          } />
          <Route path="live" element={
            <ProtectedRoute roles={['admin','supervisor']}><LiveDashboard /></ProtectedRoute>
          } />
          <Route path="users" element={
            <ProtectedRoute roles={['admin']}><UsersPage /></ProtectedRoute>
          } />
          <Route path="trunks" element={
            <ProtectedRoute roles={['admin']}><TrunksPage /></ProtectedRoute>
          } />
          <Route path="campaigns" element={
            <ProtectedRoute roles={['admin','supervisor']}><CampaignsPage /></ProtectedRoute>
          } />
          <Route path="campaigns/:id" element={
            <ProtectedRoute roles={['admin','supervisor']}><CampaignDetail /></ProtectedRoute>
          } />
          <Route path="queues" element={
            <ProtectedRoute roles={['admin']}><QueuesPage /></ProtectedRoute>
          } />
          <Route path="ivr" element={
            <ProtectedRoute roles={['admin']}><IVRBuilder /></ProtectedRoute>
          } />
          <Route path="recordings" element={
            <ProtectedRoute roles={['admin','supervisor']}><RecordingsPage /></ProtectedRoute>
          } />
          <Route path="agent" element={
            <ProtectedRoute roles={['agent']}><AgentPanel /></ProtectedRoute>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
