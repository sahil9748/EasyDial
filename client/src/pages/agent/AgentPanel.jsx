import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Coffee, LogOut, Clock, Monitor, Copy, Check, Wifi, WifiOff } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useAgentStore from '../../store/agentStore';
import useRealtimeStore from '../../store/realtimeStore';
import Softphone from '../../components/phone/Softphone';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function AgentPanel() {
  const { agent } = useAuthStore();
  const { currentStatus, setStatus, agentLogin, agentLogout, setCurrentStatus } = useAgentStore();
  const stats = useRealtimeStore((s) => s.stats);
  const [recentCalls, setRecentCalls] = useState([]);
  const [dispositions, setDispositions] = useState([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [copied, setCopied] = useState(null);

  const isExternal = agent?.phoneType === 'external' || agent?.phone_type === 'external';

  // Get live SIP registration status from WebSocket stats
  const mySipUsername = agent?.sipUsername || agent?.sip_username;
  const sipAgent = stats.sipAgents?.find(a => a.sipUsername === mySipUsername);
  const sipRegistered = sipAgent?.sipRegistered || false;

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  useEffect(() => {
    loadCalls();
    loadDispositions();
  }, []);

  const loadCalls = async () => {
    try {
      const { data } = await api.get('/calls?limit=20');
      setRecentCalls(data.calls);
    } catch {}
  };

  const loadDispositions = async () => {
    try {
      const { data } = await api.get('/dispositions');
      setDispositions(data.dispositions);
    } catch {}
  };

  const handleLogin = async () => {
    if (!agent?.id) return;
    try {
      await agentLogin(agent.id);
      setLoggedIn(true);
      toast.success('Agent logged in');
    } catch { toast.error('Login failed'); }
  };

  const handleLogout = async () => {
    if (!agent?.id) return;
    try {
      await agentLogout(agent.id);
      setLoggedIn(false);
      toast.success('Agent logged out');
    } catch { toast.error('Logout failed'); }
  };

  const handlePause = async () => {
    if (!agent?.id) return;
    const newStatus = currentStatus === 'paused' ? 'available' : 'paused';
    await setStatus(agent.id, newStatus);
    toast.success(newStatus === 'paused' ? 'On break' : 'Available');
  };

  const statusColors = {
    available: 'bg-success', busy: 'bg-danger', paused: 'bg-warning',
    offline: 'bg-dark-500', wrapup: 'bg-primary-500',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Panel</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2.5 h-2.5 rounded-full ${statusColors[currentStatus]}`} />
            <span className="text-dark-400 text-sm capitalize">{currentStatus}</span>
            <span className="text-dark-600">·</span>
            <span className="text-dark-400 text-sm font-mono">{agent?.extension}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {!loggedIn ? (
            <button onClick={handleLogin} className="btn-primary flex items-center gap-2">
              <Phone className="w-4 h-4" /> Start Shift
            </button>
          ) : (
            <>
              <button onClick={handlePause}
                className={`flex items-center gap-2 ${currentStatus === 'paused' ? 'btn-success' : 'btn-secondary'}`}>
                <Coffee className="w-4 h-4" /> {currentStatus === 'paused' ? 'Resume' : 'Break'}
              </button>
              <button onClick={handleLogout} className="btn-danger flex items-center gap-2">
                <LogOut className="w-4 h-4" /> End Shift
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Softphone or External SIP Credentials */}
        <div>
          {isExternal ? (
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary-400" />
                  <h3 className="font-semibold text-white">External Softphone</h3>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  sipRegistered
                    ? 'bg-success/15 text-success border border-success/30'
                    : 'bg-danger/15 text-danger border border-danger/30'
                }`}>
                  {sipRegistered ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {sipRegistered ? 'Registered' : 'Not Registered'}
                </div>
              </div>
              <p className="text-xs text-dark-400">Configure your SIP client (Zoiper, MicroSIP, etc.) with these credentials:</p>

              <div className="space-y-3">
                {[
                  { label: 'SIP Server', value: window.location.hostname, field: 'server' },
                  { label: 'SIP Port', value: '5060 (UDP)', field: 'port' },
                  { label: 'Username', value: agent?.sipUsername || agent?.sip_username, field: 'user' },
                  { label: 'Password', value: agent?.sipPassword || agent?.sip_password || '••••••••', field: 'pass' },
                  { label: 'Extension', value: agent?.extension, field: 'ext' },
                ].map(cred => (
                  <div key={cred.field} className="flex items-center justify-between p-2.5 rounded-lg bg-dark-800/60">
                    <div>
                      <p className="text-[10px] text-dark-500 uppercase tracking-wider">{cred.label}</p>
                      <p className="text-sm font-mono text-dark-200">{cred.value}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(String(cred.value).replace(' (UDP)', ''), cred.field)}
                      className="text-dark-500 hover:text-primary-400 transition-colors p-1"
                    >
                      {copied === cred.field ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-dark-700/50">
                <p className="text-[10px] text-dark-500">Codec: ulaw, alaw, opus · Transport: UDP · DTMF: RFC4733</p>
              </div>
            </div>
          ) : (
            <Softphone />
          )}
        </div>

        {/* Stats & Dispositions */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <h3 className="font-semibold text-white mb-3">Session Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Calls Handled', value: recentCalls.length },
                { label: 'Avg Duration', value: `${stats.aht}s` },
              ].map(s => (
                <div key={s.label} className="p-3 rounded-lg bg-dark-800/40">
                  <p className="text-lg font-bold text-primary-400">{s.value}</p>
                  <p className="text-xs text-dark-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-semibold text-white mb-3">Quick Dispositions</h3>
            <div className="grid grid-cols-2 gap-2">
              {dispositions.slice(0, 8).map(d => (
                <button key={d.id}
                  className={`text-xs p-2 rounded-lg border transition-all hover:bg-dark-700/50 ${
                    d.category === 'sale' ? 'border-success/30 text-success' :
                    d.category === 'dnc' ? 'border-danger/30 text-danger' :
                    d.category === 'callback' ? 'border-warning/30 text-warning' :
                    'border-dark-600 text-dark-300'
                  }`}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent calls */}
        <div className="glass-card p-5">
          <h3 className="font-semibold text-white mb-3">Recent Calls</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recentCalls.map(c => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-dark-800/40">
                <div>
                  <p className="text-sm font-mono text-dark-200">{c.callee || c.caller_id}</p>
                  <p className="text-xs text-dark-400">{new Date(c.started_at).toLocaleTimeString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-dark-300">{c.billsec || 0}s</p>
                  <span className={`badge text-[10px] ${c.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>{c.disposition || c.status}</span>
                </div>
              </div>
            ))}
            {recentCalls.length === 0 && <p className="text-sm text-dark-500 text-center py-4">No calls yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
