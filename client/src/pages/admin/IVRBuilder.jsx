import { useState, useEffect } from 'react';
import { Plus, Save, Trash2, GitBranch } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

const NODE_TYPES = [
  { type: 'play', label: 'Play Audio', color: 'bg-primary-500' },
  { type: 'collect', label: 'Collect Digits', color: 'bg-accent' },
  { type: 'transfer_queue', label: 'Transfer to Queue', color: 'bg-success' },
  { type: 'transfer_ext', label: 'Transfer to Extension', color: 'bg-warning' },
  { type: 'hangup', label: 'Hangup', color: 'bg-danger' },
];

export default function IVRBuilder() {
  const [flows, setFlows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [flowName, setFlowName] = useState('');
  const [nodes, setNodes] = useState([]);

  useEffect(() => { loadFlows(); }, []);

  const loadFlows = async () => {
    try { const { data } = await api.get('/ivr'); setFlows(data.flows); } catch {}
  };

  const handleSelect = async (flow) => {
    setSelected(flow);
    setFlowName(flow.name);
    try {
      const { data } = await api.get(`/ivr/${flow.id}`);
      setNodes(data.flow.flow_json?.nodes || []);
    } catch {}
  };

  const handleCreate = async () => {
    try {
      const { data } = await api.post('/ivr', { name: 'New Flow', flowJson: { nodes: [] } });
      toast.success('Flow created');
      loadFlows();
      handleSelect(data.flow);
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const handleSave = async () => {
    if (!selected) return;
    try {
      await api.put(`/ivr/${selected.id}`, { name: flowName, flowJson: { nodes } });
      toast.success('Flow saved');
      loadFlows();
    } catch { toast.error('Save failed'); }
  };

  const addNode = (type) => {
    const nodeType = NODE_TYPES.find(n => n.type === type);
    setNodes([...nodes, {
      id: Date.now().toString(),
      type,
      label: nodeType.label,
      config: type === 'play' ? { file: '' } :
              type === 'collect' ? { maxDigits: 1, timeout: 5, actions: {} } :
              type === 'transfer_queue' ? { queueId: '' } :
              type === 'transfer_ext' ? { extension: '' } : {},
    }]);
  };

  const updateNode = (idx, config) => {
    const updated = [...nodes];
    updated[idx] = { ...updated[idx], config: { ...updated[idx].config, ...config } };
    setNodes(updated);
  };

  const removeNode = (idx) => { setNodes(nodes.filter((_, i) => i !== idx)); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">IVR Builder</h1>
          <p className="text-dark-400 text-sm mt-1">Create interactive voice response flows</p></div>
        <button onClick={handleCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4"/>New Flow</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Flow list */}
        <div className="space-y-2">
          {flows.map(f => (
            <button key={f.id} onClick={() => handleSelect(f)}
              className={`w-full text-left p-3 rounded-lg transition-all ${selected?.id === f.id ? 'bg-primary-500/10 border border-primary-500/30' : 'glass-card hover:bg-dark-800/80'}`}>
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary-400" />
                <span className="text-sm font-medium text-dark-200">{f.name}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Builder */}
        {selected && (
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center gap-4">
              <input className="input-field flex-1" value={flowName} onChange={e => setFlowName(e.target.value)} placeholder="Flow name" />
              <button onClick={handleSave} className="btn-primary flex items-center gap-2"><Save className="w-4 h-4"/>Save</button>
            </div>

            {/* Add node buttons */}
            <div className="flex flex-wrap gap-2">
              {NODE_TYPES.map(nt => (
                <button key={nt.type} onClick={() => addNode(nt.type)}
                  className="btn-secondary text-xs flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${nt.color}`} /> {nt.label}
                </button>
              ))}
            </div>

            {/* Node list */}
            <div className="space-y-3">
              {nodes.map((node, idx) => {
                const nt = NODE_TYPES.find(n => n.type === node.type);
                return (
                  <div key={node.id} className="glass-card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${nt?.color}`} />
                        <span className="font-medium text-dark-200 text-sm">{idx + 1}. {node.label}</span>
                      </div>
                      <button onClick={() => removeNode(idx)} className="text-dark-400 hover:text-danger"><Trash2 className="w-4 h-4"/></button>
                    </div>
                    <div className="space-y-2">
                      {node.type === 'play' && (
                        <input className="input-field text-sm" placeholder="Audio file path" value={node.config.file || ''} onChange={e => updateNode(idx, { file: e.target.value })} />
                      )}
                      {node.type === 'collect' && (
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" className="input-field text-sm" placeholder="Max digits" value={node.config.maxDigits || 1} onChange={e => updateNode(idx, { maxDigits: parseInt(e.target.value) })} />
                          <input type="number" className="input-field text-sm" placeholder="Timeout (s)" value={node.config.timeout || 5} onChange={e => updateNode(idx, { timeout: parseInt(e.target.value) })} />
                        </div>
                      )}
                      {node.type === 'transfer_queue' && (
                        <input className="input-field text-sm" placeholder="Queue ID" value={node.config.queueId || ''} onChange={e => updateNode(idx, { queueId: e.target.value })} />
                      )}
                      {node.type === 'transfer_ext' && (
                        <input className="input-field text-sm" placeholder="Extension" value={node.config.extension || ''} onChange={e => updateNode(idx, { extension: e.target.value })} />
                      )}
                    </div>
                  </div>
                );
              })}
              {nodes.length === 0 && <p className="text-center py-8 text-dark-500">Add nodes to build your IVR flow</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
