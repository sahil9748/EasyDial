import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Trash2 } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function QueuesPage() {
  const [queues, setQueues] = useState([]);
  const [agents, setAgents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name:'', strategy:'roundrobin', timeout:30, maxWait:300, wrapupTime:10 });
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [queueAgents, setQueueAgents] = useState([]);

  useEffect(() => { loadQueues(); loadAgents(); }, []);

  const loadQueues = async () => {
    try { const { data } = await api.get('/queues'); setQueues(data.queues); } catch {}
  };
  const loadAgents = async () => {
    try { const { data } = await api.get('/agents'); setAgents(data.agents); } catch {}
  };
  const loadQueueAgents = async (queueId) => {
    try { const { data } = await api.get(`/queues/${queueId}/agents`); setQueueAgents(data.agents); } catch {}
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try { await api.post('/queues', form); toast.success('Queue created'); setShowModal(false); loadQueues(); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleSelectQueue = (q) => {
    setSelectedQueue(q);
    loadQueueAgents(q.id);
  };

  const handleAddAgent = async (agentId) => {
    if (!selectedQueue) return;
    try { await api.post(`/queues/${selectedQueue.id}/agents`, { agentId }); toast.success('Agent added'); loadQueueAgents(selectedQueue.id); }
    catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleRemoveAgent = async (agentId) => {
    if (!selectedQueue) return;
    try { await api.delete(`/queues/${selectedQueue.id}/agents/${agentId}`); toast.success('Agent removed'); loadQueueAgents(selectedQueue.id); }
    catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Queues</h1>
          <p className="text-dark-400 text-sm mt-1">ACD queue management</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/>Add Queue</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue list */}
        <div className="space-y-3">
          {queues.map(q => (
            <button key={q.id} onClick={() => handleSelectQueue(q)}
              className={`w-full text-left glass-card p-4 transition-all ${selectedQueue?.id === q.id ? 'border-primary-500 bg-primary-500/5' : 'hover:bg-dark-800/80'}`}>
              <h3 className="font-semibold text-white">{q.name}</h3>
              <div className="flex gap-3 mt-1 text-xs text-dark-400">
                <span className="capitalize">{q.strategy}</span>
                <span>{q.agent_count || 0} agents</span>
                <span>{q.timeout}s timeout</span>
              </div>
            </button>
          ))}
        </div>

        {/* Queue detail */}
        {selectedQueue && (
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-card p-5">
              <h3 className="text-lg font-semibold text-white mb-3">Queue: {selectedQueue.name}</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-dark-500">Strategy:</span> <span className="text-dark-200 capitalize">{selectedQueue.strategy}</span></div>
                <div><span className="text-dark-500">Timeout:</span> <span className="text-dark-200">{selectedQueue.timeout}s</span></div>
                <div><span className="text-dark-500">Wrapup:</span> <span className="text-dark-200">{selectedQueue.wrapup_time}s</span></div>
              </div>
            </div>

            {/* Assigned agents */}
            <div className="glass-card p-5">
              <h4 className="font-semibold text-white mb-3">Assigned Agents</h4>
              <div className="space-y-2">
                {queueAgents.map(qa => (
                  <div key={qa.id} className="flex items-center justify-between p-2 rounded-lg bg-dark-800/40">
                    <div>
                      <span className="text-sm text-dark-200">{qa.username} ({qa.sip_username})</span>
                      <span className={`ml-2 badge ${qa.status === 'available' ? 'badge-success' : qa.status === 'busy' ? 'badge-danger' : 'badge-neutral'}`}>{qa.status}</span>
                    </div>
                    <button onClick={() => handleRemoveAgent(qa.agent_id)} className="text-dark-400 hover:text-danger"><Trash2 className="w-4 h-4"/></button>
                  </div>
                ))}
                {queueAgents.length === 0 && <p className="text-sm text-dark-500 text-center py-3">No agents assigned</p>}
              </div>

              {/* Add agent */}
              <div className="mt-3 pt-3 border-t border-dark-700/50">
                <select onChange={(e) => { if (e.target.value) handleAddAgent(e.target.value); e.target.value = ''; }} className="select-field text-sm">
                  <option value="">Add agent to queue...</option>
                  {agents.filter(a => !queueAgents.find(qa => qa.agent_id === a.id)).map(a => (
                    <option key={a.id} value={a.id}>{a.username} ({a.sip_username})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
            <motion.div initial={{ scale:0.95 }} animate={{ scale:1 }} className="glass-card p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Create Queue</h2>
                <button onClick={() => setShowModal(false)}><X className="w-5 h-5 text-dark-400"/></button>
              </div>
              <form onSubmit={handleCreate} className="space-y-3">
                <div><label className="label">Name</label><input className="input-field" value={form.name} onChange={e => setForm({...form,name:e.target.value})} required /></div>
                <div><label className="label">Strategy</label>
                  <select className="select-field" value={form.strategy} onChange={e => setForm({...form,strategy:e.target.value})}>
                    <option value="ringall">Ring All</option><option value="roundrobin">Round Robin</option>
                    <option value="leastrecent">Least Recent</option><option value="fewestcalls">Fewest Calls</option><option value="random">Random</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="label">Timeout</label><input type="number" className="input-field" value={form.timeout} onChange={e => setForm({...form,timeout:parseInt(e.target.value)})} /></div>
                  <div><label className="label">Max Wait</label><input type="number" className="input-field" value={form.maxWait} onChange={e => setForm({...form,maxWait:parseInt(e.target.value)})} /></div>
                  <div><label className="label">Wrapup</label><input type="number" className="input-field" value={form.wrapupTime} onChange={e => setForm({...form,wrapupTime:parseInt(e.target.value)})} /></div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1">Create</button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
