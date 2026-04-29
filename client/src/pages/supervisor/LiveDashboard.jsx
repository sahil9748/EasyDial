import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Phone, Users, TrendingUp, Clock, Zap } from 'lucide-react';
import useRealtimeStore from '../../store/realtimeStore';
import api from '../../api/client';

export default function LiveDashboard() {
  const stats = useRealtimeStore((s) => s.stats);
  const connected = useRealtimeStore((s) => s.connected);
  const [agents, setAgents] = useState([]);
  const [activeCalls, setActiveCalls] = useState([]);

  useEffect(() => {
    loadAgents();
    loadActiveCalls();
    const interval = setInterval(() => {
      loadAgents();
      loadActiveCalls();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadAgents = async () => {
    try { const { data } = await api.get('/agents/status'); setAgents(data.agents); } catch {}
  };

  const loadActiveCalls = async () => {
    try { const { data } = await api.get('/calls/active'); setActiveCalls(data.calls); } catch {}
  };

  const statusColors = {
    available: { bg: 'bg-success/20', text: 'text-success', dot: 'bg-success' },
    busy: { bg: 'bg-danger/20', text: 'text-danger', dot: 'bg-danger' },
    paused: { bg: 'bg-warning/20', text: 'text-warning', dot: 'bg-warning' },
    wrapup: { bg: 'bg-primary-500/20', text: 'text-primary-400', dot: 'bg-primary-500' },
    offline: { bg: 'bg-dark-700', text: 'text-dark-500', dot: 'bg-dark-500' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Live Monitor</h1>
          {connected && (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Calls', value: stats.activeCalls, icon: Phone, gradient: 'from-primary-500 to-primary-700' },
          { label: 'Agents Online', value: (stats.agentStats?.available||0) + (stats.agentStats?.busy||0) + (stats.agentStats?.wrapup||0), icon: Users, gradient: 'from-accent-dark to-accent' },
          { label: 'ASR', value: `${stats.asr}%`, icon: TrendingUp, gradient: 'from-success to-emerald-600' },
          { label: 'AHT', value: `${stats.aht}s`, icon: Clock, gradient: 'from-warning to-amber-600' },
        ].map((m, i) => (
          <motion.div key={m.label} initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.05 }}
            className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center shadow-lg`}>
                <m.icon className="w-5 h-5 text-white" />
              </div>
              <Zap className="w-3 h-3 text-dark-600" />
            </div>
            <p className="stat-value">{m.value}</p>
            <p className="stat-label mt-1">{m.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Grid */}
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-400" /> Agent States
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {agents.map(a => {
              const sc = statusColors[a.status] || statusColors.offline;
              return (
                <div key={a.id} className={`p-3 rounded-lg ${sc.bg} border border-dark-700/30`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${sc.dot} ${a.status === 'busy' ? 'animate-pulse' : ''}`} />
                    <span className={`text-sm font-medium ${sc.text}`}>{a.username || a.sip_username}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dark-400">Ext {a.extension}</span>
                    <span className={`text-[10px] uppercase font-semibold ${sc.text}`}>{a.status}</span>
                  </div>
                </div>
              );
            })}
            {agents.length === 0 && <p className="col-span-3 text-sm text-dark-500 text-center py-6">No agents</p>}
          </div>
        </div>

        {/* Active Calls */}
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" /> Active Calls
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {activeCalls.map(c => (
              <motion.div key={c.id} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                className="flex items-center justify-between p-3 rounded-lg bg-dark-800/40 border border-dark-700/30">
                <div>
                  <p className="text-sm font-mono text-dark-200">{c.callee || c.caller_id}</p>
                  <p className="text-xs text-dark-400">{c.agent_name || 'Unassigned'} · {c.campaign_name || 'Direct'}</p>
                </div>
                <div className="text-right">
                  <span className={`badge ${c.status === 'bridged' ? 'badge-success' : c.status === 'ringing' ? 'badge-warning' : 'badge-info'}`}>
                    {c.status}
                  </span>
                </div>
              </motion.div>
            ))}
            {activeCalls.length === 0 && <p className="text-sm text-dark-500 text-center py-6">No active calls</p>}
          </div>
        </div>
      </div>

      {/* Today Summary */}
      <div className="glass-card p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Today's Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total Calls', value: stats.todayCalls },
            { label: 'Answered', value: stats.answeredCalls },
            { label: 'Answer Rate', value: `${stats.asr}%` },
            { label: 'Avg Handle Time', value: `${stats.aht}s` },
            { label: 'Connected Clients', value: stats.connectedClients },
          ].map(s => (
            <div key={s.label} className="text-center p-3 rounded-lg bg-dark-800/40">
              <p className="text-2xl font-bold text-primary-400">{s.value}</p>
              <p className="text-xs text-dark-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
