import { NavLink } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import {
  LayoutDashboard, Users, Phone, Radio, Headphones,
  GitBranch, ListOrdered, PhoneCall, Activity, Settings, LogOut
} from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isSupervisor = ['admin', 'supervisor'].includes(user?.role);
  const isAgent = user?.role === 'agent';

  const linkClass = ({ isActive }) =>
    isActive ? 'sidebar-link-active' : 'sidebar-link';

  return (
    <aside className="w-64 bg-dark-900/80 backdrop-blur-sm border-r border-dark-700/50 flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-dark-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">CallCenter</h1>
            <p className="text-xs text-dark-500">Pro Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {isAgent && (
          <>
            <p className="px-3 pt-3 pb-1 text-xs font-semibold text-dark-500 uppercase tracking-wider">Agent</p>
            <NavLink to="/agent" end className={linkClass}>
              <Headphones className="w-4 h-4" /> Agent Panel
            </NavLink>
          </>
        )}

        {isSupervisor && (
          <>
            <p className="px-3 pt-3 pb-1 text-xs font-semibold text-dark-500 uppercase tracking-wider">Monitor</p>
            <NavLink to="/dashboard" className={linkClass}>
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </NavLink>
            <NavLink to="/live" className={linkClass}>
              <Activity className="w-4 h-4" /> Live Monitor
            </NavLink>
          </>
        )}

        {isAdmin && (
          <>
            <p className="px-3 pt-4 pb-1 text-xs font-semibold text-dark-500 uppercase tracking-wider">Manage</p>
            <NavLink to="/users" className={linkClass}>
              <Users className="w-4 h-4" /> Users
            </NavLink>
            <NavLink to="/trunks" className={linkClass}>
              <Radio className="w-4 h-4" /> SIP Trunks
            </NavLink>
            <NavLink to="/campaigns" className={linkClass}>
              <Phone className="w-4 h-4" /> Campaigns
            </NavLink>
            <NavLink to="/queues" className={linkClass}>
              <ListOrdered className="w-4 h-4" /> Queues
            </NavLink>
            <NavLink to="/ivr" className={linkClass}>
              <GitBranch className="w-4 h-4" /> IVR Flows
            </NavLink>
            <NavLink to="/recordings" className={linkClass}>
              <Settings className="w-4 h-4" /> Recordings
            </NavLink>
          </>
        )}
      </nav>

      {/* User info */}
      <div className="p-3 border-t border-dark-700/50">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-accent flex items-center justify-center text-sm font-bold text-white">
            {user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dark-200 truncate">{user?.username}</p>
            <p className="text-xs text-dark-500 capitalize">{user?.role}</p>
          </div>
          <button onClick={logout} className="text-dark-500 hover:text-danger transition-colors" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
