import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, X, Activity } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function TrunksPage() {
  const [trunks, setTrunks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:'', host:'', port:5060, username:'', password:'', codecs:'ulaw,alaw,opus', transport:'udp', maxChannels:30 });

  useEffect(() => { loadTrunks(); }, []);

  const loadTrunks = async () => {
    try {
      const { data } = await api.get('/trunks');
      setTrunks(data.trunks);
    } catch { toast.error('Failed to load trunks'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/trunks/${editing}`, form);
        toast.success('Trunk updated');
      } else {
        await api.post('/trunks', form);
        toast.success('Trunk created');
      }
      setShowModal(false); setEditing(null); loadTrunks();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleHealthCheck = async (id) => {
    try {
      const { data } = await api.post(`/trunks/${id}/health-check`);
      toast.success(`Status: ${data.trunk.health_status}`);
      loadTrunks();
    } catch { toast.error('Health check failed'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this trunk?')) return;
    try { await api.delete(`/trunks/${id}`); toast.success('Deleted'); loadTrunks(); }
    catch { toast.error('Delete failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SIP Trunks</h1>
          <p className="text-dark-400 text-sm mt-1">Manage SIP trunk connections</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name:'',host:'',port:5060,username:'',password:'',codecs:'ulaw,alaw,opus',transport:'udp',maxChannels:30 }); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Trunk
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trunks.map(t => (
          <motion.div key={t.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="glass-card-hover p-5">
            <div className="flex justify-between mb-3">
              <h3 className="font-semibold text-white">{t.name}</h3>
              <span className={t.active ? 'badge-success' : 'badge-danger'}>{t.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="space-y-2 text-sm text-dark-400">
              <p><span className="text-dark-500">Host:</span> {t.host}:{t.port}</p>
              <p><span className="text-dark-500">Transport:</span> {t.transport?.toUpperCase()}</p>
              <p><span className="text-dark-500">Codecs:</span> {t.codecs}</p>
              <p><span className="text-dark-500">Max Ch:</span> {t.max_channels}</p>
              {t.health_status && (
                <p><span className="text-dark-500">Health:</span> <span className={t.health_status === 'reachable' ? 'text-success' : 'text-danger'}>{t.health_status}</span></p>
              )}
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-dark-700/50">
              <button onClick={() => handleHealthCheck(t.id)} className="btn-secondary text-xs flex items-center gap-1"><Activity className="w-3 h-3"/>Check</button>
              <button onClick={() => { setForm({ name:t.name, host:t.host, port:t.port, username:t.username||'', password:'', codecs:t.codecs, transport:t.transport, maxChannels:t.max_channels }); setEditing(t.id); setShowModal(true); }} className="text-dark-400 hover:text-primary-400 transition-colors p-1"><Pencil className="w-4 h-4"/></button>
              <button onClick={() => handleDelete(t.id)} className="text-dark-400 hover:text-danger transition-colors p-1"><Trash2 className="w-4 h-4"/></button>
            </div>
          </motion.div>
        ))}
        {trunks.length === 0 && <p className="col-span-3 text-center py-12 text-dark-500">No trunks configured</p>}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
            <motion.div initial={{ scale:0.95 }} animate={{ scale:1 }} exit={{ scale:0.95 }}
              className="glass-card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">{editing ? 'Edit Trunk' : 'Add Trunk'}</h2>
                <button onClick={() => setShowModal(false)} className="text-dark-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div><label className="label">Name</label><input className="input-field" value={form.name} onChange={e => setForm({...form,name:e.target.value})} required /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><label className="label">Host</label><input className="input-field" value={form.host} onChange={e => setForm({...form,host:e.target.value})} required /></div>
                  <div><label className="label">Port</label><input type="number" className="input-field" value={form.port} onChange={e => setForm({...form,port:parseInt(e.target.value)})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Username</label><input className="input-field" value={form.username} onChange={e => setForm({...form,username:e.target.value})} /></div>
                  <div><label className="label">Password</label><input type="password" className="input-field" value={form.password} onChange={e => setForm({...form,password:e.target.value})} /></div>
                </div>
                <div><label className="label">Codecs</label><input className="input-field" value={form.codecs} onChange={e => setForm({...form,codecs:e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Transport</label>
                    <select className="select-field" value={form.transport} onChange={e => setForm({...form,transport:e.target.value})}>
                      <option value="udp">UDP</option><option value="tcp">TCP</option><option value="tls">TLS</option>
                    </select>
                  </div>
                  <div><label className="label">Max Channels</label><input type="number" className="input-field" value={form.maxChannels} onChange={e => setForm({...form,maxChannels:parseInt(e.target.value)})} /></div>
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
    </div>
  );
}
