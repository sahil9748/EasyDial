import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Play, Pause, Square, Eye, Upload } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [trunks, setTrunks] = useState([]);
  const [queues, setQueues] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:'', type:'progressive', trunkId:'', callerId:'', maxConcurrency:5, retryCount:3, amdEnabled:false, queueId:'' });
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [campRes, trunkRes, queueRes] = await Promise.all([
        api.get('/campaigns'), api.get('/trunks'), api.get('/queues'),
      ]);
      setCampaigns(campRes.data.campaigns);
      setTrunks(trunkRes.data.trunks);
      setQueues(queueRes.data.queues);
    } catch { toast.error('Failed to load data'); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/campaigns', form);
      toast.success('Campaign created');
      setShowCreate(false);
      loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleAction = async (id, action) => {
    try {
      await api.post(`/campaigns/${id}/${action}`);
      toast.success(`Campaign ${action}ed`);
      loadData();
    } catch { toast.error(`Failed to ${action} campaign`); }
  };

  const statusColor = (s) => {
    const map = { draft:'badge-neutral', active:'badge-success', paused:'badge-warning', completed:'badge-info', archived:'badge-neutral' };
    return map[s] || 'badge-neutral';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-dark-400 text-sm mt-1">Manage outbound calling campaigns</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} className="glass-card p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Create Campaign</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="label">Name</label><input className="input-field" value={form.name} onChange={e => setForm({...form,name:e.target.value})} required /></div>
            <div><label className="label">Type</label>
              <select className="select-field" value={form.type} onChange={e => setForm({...form,type:e.target.value})}>
                <option value="blast">Blast</option><option value="progressive">Progressive</option><option value="predictive">Predictive</option>
              </select>
            </div>
            <div><label className="label">Trunk</label>
              <select className="select-field" value={form.trunkId} onChange={e => setForm({...form,trunkId:e.target.value})}>
                <option value="">Select trunk...</option>
                {trunks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div><label className="label">Caller ID</label><input className="input-field" value={form.callerId} onChange={e => setForm({...form,callerId:e.target.value})} placeholder="+15551234567" /></div>
            <div><label className="label">Max Concurrency</label><input type="number" className="input-field" value={form.maxConcurrency} onChange={e => setForm({...form,maxConcurrency:parseInt(e.target.value)})} /></div>
            <div><label className="label">Queue</label>
              <select className="select-field" value={form.queueId} onChange={e => setForm({...form,queueId:e.target.value})}>
                <option value="">None (blast mode)</option>
                {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-3 col-span-full">
              <label className="flex items-center gap-2 text-sm text-dark-300">
                <input type="checkbox" checked={form.amdEnabled} onChange={e => setForm({...form,amdEnabled:e.target.checked})}
                  className="w-4 h-4 rounded bg-dark-800 border-dark-600" />
                Enable AMD
              </label>
              <div className="flex-1" />
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create Campaign</button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Campaign list */}
      <div className="space-y-3">
        {campaigns.map(c => (
          <motion.div key={c.id} initial={{ opacity:0 }} animate={{ opacity:1 }} className="glass-card-hover p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="font-semibold text-white text-lg">{c.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={statusColor(c.status)}>{c.status}</span>
                    <span className="text-xs text-dark-500 capitalize">{c.type}</span>
                    {c.trunk_name && <span className="text-xs text-dark-500">via {c.trunk_name}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right mr-4">
                  <p className="text-sm font-mono text-dark-200">{c.completed_contacts || 0} / {c.total_contacts || 0}</p>
                  <div className="w-32 h-1.5 bg-dark-700 rounded-full mt-1">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-accent rounded-full transition-all"
                      style={{ width: `${c.total_contacts > 0 ? Math.round(c.completed_contacts / c.total_contacts * 100) : 0}%` }} />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {c.status === 'draft' || c.status === 'paused' ? (
                    <button onClick={() => handleAction(c.id, 'start')} className="btn-success text-xs"><Play className="w-3 h-3" /></button>
                  ) : null}
                  {c.status === 'active' ? (
                    <button onClick={() => handleAction(c.id, 'pause')} className="btn-secondary text-xs"><Pause className="w-3 h-3" /></button>
                  ) : null}
                  {['active','paused'].includes(c.status) ? (
                    <button onClick={() => handleAction(c.id, 'stop')} className="btn-danger text-xs"><Square className="w-3 h-3" /></button>
                  ) : null}
                  <button onClick={() => navigate(`/campaigns/${c.id}`)} className="btn-secondary text-xs"><Eye className="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        {campaigns.length === 0 && <p className="text-center py-12 text-dark-500">No campaigns yet. Create one to get started.</p>}
      </div>
    </div>
  );
}
