import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PhoneCall, Users, TrendingUp, Clock, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import api from '../../api/client';
import useRealtimeStore from '../../store/realtimeStore';

export default function Dashboard() {
  const stats = useRealtimeStore((s) => s.stats);
  const [recentCalls, setRecentCalls] = useState([]);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    api.get('/calls?limit=10').then(r => setRecentCalls(r.data.calls)).catch(() => {});
    api.get('/campaigns').then(r => setCampaigns(r.data.campaigns)).catch(() => {});
  }, []);

  const statCards = [
    { label: 'Active Calls', value: stats.activeCalls, icon: PhoneCall, color: 'from-primary-500 to-primary-600' },
    { label: 'Today\'s Calls', value: stats.todayCalls, icon: PhoneOutgoing, color: 'from-accent-dark to-accent' },
    { label: 'Answer Rate', value: `${stats.asr}%`, icon: TrendingUp, color: 'from-success to-emerald-600' },
    { label: 'Avg Handle Time', value: `${stats.aht}s`, icon: Clock, color: 'from-warning to-amber-600' },
    { label: 'Agents Online', value: (stats.agentStats?.available || 0) + (stats.agentStats?.busy || 0), icon: Users, color: 'from-violet-500 to-purple-600' },
    { label: 'Answered', value: stats.answeredCalls, icon: PhoneIncoming, color: 'from-rose-500 to-pink-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-dark-400 text-sm mt-1">Real-time overview of your call center</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4"
          >
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center mb-3 shadow-lg`}>
              <card.icon className="w-4 h-4 text-white" />
            </div>
            <p className="stat-value text-2xl">{card.value}</p>
            <p className="stat-label mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Status */}
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Agent Status</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Available', value: stats.agentStats?.available || 0, color: 'bg-success' },
              { label: 'Busy', value: stats.agentStats?.busy || 0, color: 'bg-danger' },
              { label: 'Paused', value: stats.agentStats?.paused || 0, color: 'bg-warning' },
              { label: 'Offline', value: stats.agentStats?.offline || 0, color: 'bg-dark-500' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg bg-dark-800/40">
                <div className={`w-3 h-3 rounded-full ${s.color}`} />
                <div>
                  <p className="text-sm font-medium text-dark-200">{s.value}</p>
                  <p className="text-xs text-dark-400">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Campaigns</h3>
          <div className="space-y-3">
            {campaigns.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-dark-800/40">
                <div>
                  <p className="text-sm font-medium text-dark-200">{c.name}</p>
                  <p className="text-xs text-dark-400 capitalize">{c.type} · {c.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-dark-300">{c.completed_contacts || 0}/{c.total_contacts || 0}</p>
                  <div className="w-20 h-1.5 bg-dark-700 rounded-full mt-1">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${c.total_contacts > 0 ? (c.completed_contacts / c.total_contacts * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {campaigns.length === 0 && <p className="text-sm text-dark-500 text-center py-4">No campaigns yet</p>}
          </div>
        </div>
      </div>

      {/* Recent Calls */}
      <div className="glass-card p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Recent Calls</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-dark-400 text-xs uppercase tracking-wider border-b border-dark-700/50">
                <th className="text-left py-3 px-3">Direction</th>
                <th className="text-left py-3 px-3">Number</th>
                <th className="text-left py-3 px-3">Agent</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="text-left py-3 px-3">Duration</th>
                <th className="text-left py-3 px-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.map(call => (
                <tr key={call.id} className="table-row">
                  <td className="py-2.5 px-3">
                    {call.direction === 'outbound' ? (
                      <PhoneOutgoing className="w-4 h-4 text-primary-400" />
                    ) : (
                      <PhoneIncoming className="w-4 h-4 text-success" />
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-dark-200">{call.callee || call.caller_id}</td>
                  <td className="py-2.5 px-3 text-dark-300">{call.agent_name || '—'}</td>
                  <td className="py-2.5 px-3">
                    <span className={`badge ${call.status === 'completed' ? 'badge-success' : call.status === 'failed' ? 'badge-danger' : 'badge-info'}`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-dark-300">{call.duration || 0}s</td>
                  <td className="py-2.5 px-3 text-dark-400">{new Date(call.started_at).toLocaleTimeString()}</td>
                </tr>
              ))}
              {recentCalls.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-dark-500">No calls yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
