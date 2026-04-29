import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, X, Phone, Monitor, Headphones, Wifi, WifiOff } from 'lucide-react';
import useRealtimeStore from '../../store/realtimeStore';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', email: '', firstName: '', lastName: '', role: 'agent' });
  const [agentForm, setAgentForm] = useState({ userId: '', extension: '', phoneType: 'webrtc', maxChannels: 1 });
  const [editingAgent, setEditingAgent] = useState(null);
  const sipAgents = useRealtimeStore((s) => s.stats.sipAgents || []);

  const getSipStatus = (sipUsername) => {
    const sa = sipAgents.find(a => a.sipUsername === sipUsername);
    return sa?.sipRegistered || false;
  };

  useEffect(() => { loadUsers(); loadAgents(); }, []);

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data.users);
    } catch { toast.error('Failed to load users'); }
  };

  const loadAgents = async () => {
    try {
      const { data } = await api.get('/agents');
      setAgents(data.agents);
    } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/users/${editing}`, form);
        toast.success('User updated');
      } else {
        await api.post('/users', form);
        toast.success('User created');
      }
      setShowModal(false);
      setEditing(null);
      setForm({ username: '', password: '', email: '', firstName: '', lastName: '', role: 'agent' });
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const handleAgentSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAgent) {
        await api.put(`/agents/${editingAgent}`, {
          phoneType: agentForm.phoneType,
          maxChannels: agentForm.maxChannels,
        });
        toast.success('Agent updated');
      } else {
        const res = await api.post('/agents', agentForm);
        toast.success(`Agent provisioned! SIP: ${res.data.agent.sip_username} / ${res.data.agent.sipPassword}`);
      }
      setShowAgentModal(false);
      setEditingAgent(null);
      loadAgents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    }
  };

  const handleEdit = (user) => {
    setForm({ username: user.username, password: '', email: user.email || '', firstName: user.first_name || '', lastName: user.last_name || '', role: user.role });
    setEditing(user.id);
    setShowModal(true);
  };

  const handleEditAgent = (agent) => {
    setAgentForm({
      userId: agent.user_id,
      extension: agent.extension,
      phoneType: agent.phone_type || 'webrtc',
      maxChannels: agent.max_channels || 1,
    });
    setEditingAgent(agent.id);
    setShowAgentModal(true);
  };

  const handleProvisionAgent = (user) => {
    setAgentForm({ userId: user.id, extension: '', phoneType: 'webrtc', maxChannels: 1 });
    setEditingAgent(null);
    setShowAgentModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User deleted');
      loadUsers();
      loadAgents();
    } catch { toast.error('Delete failed'); }
  };

  const roleBadge = (role) => {
    const map = { admin: 'badge-danger', supervisor: 'badge-warning', agent: 'badge-info' };
    return <span className={map[role] || 'badge-neutral'}>{role}</span>;
  };

  const getAgentForUser = (userId) => agents.find(a => a.user_id === userId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users & Agents</h1>
          <p className="text-dark-400 text-sm mt-1">Manage system users, roles, and SIP provisioning</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ username:'',password:'',email:'',firstName:'',lastName:'',role:'agent' }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-dark-400 text-xs uppercase tracking-wider border-b border-dark-700/50 bg-dark-800/40">
              <th className="text-left py-3 px-4">Username</th>
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Role</th>
              <th className="text-left py-3 px-4">Phone</th>
              <th className="text-left py-3 px-4">SIP / Extension</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-right py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const agent = getAgentForUser(u.id);
              return (
                <tr key={u.id} className="table-row">
                  <td className="py-3 px-4 font-medium text-dark-200">{u.username}</td>
                  <td className="py-3 px-4 text-dark-300">{u.first_name} {u.last_name}</td>
                  <td className="py-3 px-4">{roleBadge(u.role)}</td>
                  <td className="py-3 px-4">
                    {agent ? (
                      <span className={`badge ${agent.phone_type === 'external' ? 'badge-warning' : 'badge-info'}`}>
                        {agent.phone_type === 'external' ? (
                          <><Monitor className="w-3 h-3 mr-1 inline" />External</>
                        ) : (
                          <><Headphones className="w-3 h-3 mr-1 inline" />WebRTC</>
                        )}
                      </span>
                    ) : u.role === 'agent' ? (
                      <span className="badge-neutral">Not provisioned</span>
                    ) : (
                      <span className="text-dark-600">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-dark-400 text-xs">
                    {agent ? (
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getSipStatus(agent.sip_username) ? 'bg-success animate-pulse' : 'bg-dark-600'}`} />
                        <span>{agent.sip_username} · Ext {agent.extension}</span>
                        {getSipStatus(agent.sip_username) ? (
                          <Wifi className="w-3 h-3 text-success flex-shrink-0" />
                        ) : (
                          <WifiOff className="w-3 h-3 text-dark-600 flex-shrink-0" />
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="py-3 px-4">{u.active ? <span className="badge-success">Active</span> : <span className="badge-danger">Disabled</span>}</td>
                  <td className="py-3 px-4 text-right space-x-1">
                    {u.role === 'agent' && !agent && (
                      <button onClick={() => handleProvisionAgent(u)} className="text-success hover:text-success/80 transition-colors" title="Provision SIP">
                        <Phone className="w-4 h-4 inline" />
                      </button>
                    )}
                    {agent && (
                      <button onClick={() => handleEditAgent(agent)} className="text-primary-400 hover:text-primary-300 transition-colors" title="Edit Agent">
                        <Phone className="w-4 h-4 inline" />
                      </button>
                    )}
                    <button onClick={() => handleEdit(u)} className="text-dark-400 hover:text-primary-400 transition-colors">
                      <Pencil className="w-4 h-4 inline" />
                    </button>
                    <button onClick={() => handleDelete(u.id)} className="text-dark-400 hover:text-danger transition-colors">
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* User Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">{editing ? 'Edit User' : 'Create User'}</h2>
                <button onClick={() => setShowModal(false)} className="text-dark-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><label className="label">Username</label><input className="input-field" value={form.username} onChange={e => setForm({...form,username:e.target.value})} required disabled={!!editing} /></div>
                <div><label className="label">Password{editing ? ' (leave blank to keep)' : ''}</label><input type="password" className="input-field" value={form.password} onChange={e => setForm({...form,password:e.target.value})} required={!editing} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">First Name</label><input className="input-field" value={form.firstName} onChange={e => setForm({...form,firstName:e.target.value})} /></div>
                  <div><label className="label">Last Name</label><input className="input-field" value={form.lastName} onChange={e => setForm({...form,lastName:e.target.value})} /></div>
                </div>
                <div><label className="label">Email</label><input type="email" className="input-field" value={form.email} onChange={e => setForm({...form,email:e.target.value})} /></div>
                <div><label className="label">Role</label>
                  <select className="select-field" value={form.role} onChange={e => setForm({...form,role:e.target.value})}>
                    <option value="agent">Agent</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1">{editing ? 'Update' : 'Create'}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent Provisioning Modal */}
      <AnimatePresence>
        {showAgentModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAgentModal(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">{editingAgent ? 'Edit Agent Phone' : 'Provision Agent'}</h2>
                <button onClick={() => setShowAgentModal(false)} className="text-dark-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleAgentSubmit} className="space-y-4">
                {!editingAgent && (
                  <div>
                    <label className="label">Extension</label>
                    <input className="input-field" value={agentForm.extension} onChange={e => setAgentForm({...agentForm,extension:e.target.value})} placeholder="e.g., 101" required />
                    <p className="text-xs text-dark-500 mt-1">SIP username will be: agent_{agentForm.extension || '...'}</p>
                  </div>
                )}

                <div>
                  <label className="label">Phone Type</label>
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => setAgentForm({...agentForm, phoneType: 'webrtc'})}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        agentForm.phoneType === 'webrtc'
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-dark-600 hover:border-dark-500'
                      }`}
                    >
                      <Headphones className={`w-6 h-6 mx-auto mb-1 ${agentForm.phoneType === 'webrtc' ? 'text-primary-400' : 'text-dark-400'}`} />
                      <p className={`text-sm font-medium ${agentForm.phoneType === 'webrtc' ? 'text-primary-400' : 'text-dark-300'}`}>WebRTC</p>
                      <p className="text-[10px] text-dark-500 mt-0.5">Browser softphone</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgentForm({...agentForm, phoneType: 'external'})}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        agentForm.phoneType === 'external'
                          ? 'border-warning bg-warning/10'
                          : 'border-dark-600 hover:border-dark-500'
                      }`}
                    >
                      <Monitor className={`w-6 h-6 mx-auto mb-1 ${agentForm.phoneType === 'external' ? 'text-warning' : 'text-dark-400'}`} />
                      <p className={`text-sm font-medium ${agentForm.phoneType === 'external' ? 'text-warning' : 'text-dark-300'}`}>External</p>
                      <p className="text-[10px] text-dark-500 mt-0.5">Obeam, Zoiper, etc.</p>
                    </button>
                  </div>
                </div>

                {agentForm.phoneType === 'external' && (
                  <div className="p-3 rounded-lg bg-dark-800/60 border border-dark-700/50">
                    <p className="text-xs text-dark-400">
                      <strong className="text-dark-300">External mode:</strong> Agent will register via standard SIP (UDP:5060).
                      No WebRTC softphone — they'll use their own SIP client.
                    </p>
                  </div>
                )}

                {agentForm.phoneType === 'webrtc' && (
                  <div className="p-3 rounded-lg bg-dark-800/60 border border-dark-700/50">
                    <p className="text-xs text-dark-400">
                      <strong className="text-dark-300">WebRTC mode:</strong> Agent uses the built-in browser softphone (WSS:8089).
                      Requires HTTPS/SSL on the server.
                    </p>
                  </div>
                )}

                <div>
                  <label className="label">Max Concurrent Calls</label>
                  <input type="number" className="input-field" value={agentForm.maxChannels} min={1} max={5}
                    onChange={e => setAgentForm({...agentForm,maxChannels:parseInt(e.target.value)})} />
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAgentModal(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1">{editingAgent ? 'Update' : 'Provision'}</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
