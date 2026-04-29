import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function CampaignDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const fileRef = useRef();

  useEffect(() => {
    loadCampaign();
    loadContacts();
    loadStats();
  }, [id, page]);

  const loadCampaign = async () => {
    try { const { data } = await api.get(`/campaigns/${id}`); setCampaign(data.campaign); }
    catch { toast.error('Failed to load campaign'); }
  };

  const loadContacts = async () => {
    try {
      const { data } = await api.get(`/campaigns/${id}/contacts?page=${page}&limit=50`);
      setContacts(data.contacts);
      setTotal(data.pagination.total);
    } catch {}
  };

  const loadStats = async () => {
    try { const { data } = await api.get(`/campaigns/${id}/stats`); setStats(data.stats); }
    catch {}
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post(`/campaigns/${id}/contacts/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`Imported ${data.imported} contacts (${data.dncFiltered} DNC filtered)`);
      loadContacts();
      loadStats();
    } catch { toast.error('Upload failed'); }
  };

  if (!campaign) return <div className="text-dark-500 text-center py-12">Loading...</div>;

  const totalContacts = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
          <p className="text-dark-400 text-sm mt-1 capitalize">{campaign.type} campaign · {campaign.status}</p>
        </div>
        <button onClick={() => fileRef.current?.click()} className="btn-primary flex items-center gap-2">
          <Upload className="w-4 h-4" /> Upload CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(stats).map(([status, count]) => (
          <div key={status} className="glass-card p-4 text-center">
            <p className="stat-value text-xl">{count}</p>
            <p className="stat-label capitalize">{status}</p>
          </div>
        ))}
        {totalContacts > 0 && (
          <div className="glass-card p-4 text-center">
            <p className="stat-value text-xl">{totalContacts}</p>
            <p className="stat-label">Total</p>
          </div>
        )}
      </div>

      {/* Contacts table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-dark-400 text-xs uppercase tracking-wider border-b border-dark-700/50 bg-dark-800/40">
              <th className="text-left py-3 px-4">Phone</th>
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Attempts</th>
              <th className="text-left py-3 px-4">Disposition</th>
              <th className="text-left py-3 px-4">Last Attempt</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} className="table-row">
                <td className="py-2.5 px-4 font-mono text-dark-200">{c.phone}</td>
                <td className="py-2.5 px-4 text-dark-300">{c.first_name} {c.last_name}</td>
                <td className="py-2.5 px-4"><span className={`badge ${c.status === 'completed' ? 'badge-success' : c.status === 'failed' ? 'badge-danger' : c.status === 'dialing' ? 'badge-warning' : 'badge-neutral'}`}>{c.status}</span></td>
                <td className="py-2.5 px-4 text-dark-400">{c.attempts}/{c.max_attempts}</td>
                <td className="py-2.5 px-4 text-dark-300">{c.disposition || '—'}</td>
                <td className="py-2.5 px-4 text-dark-400">{c.last_attempt ? new Date(c.last_attempt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > 50 && (
          <div className="flex justify-center gap-2 p-4 border-t border-dark-700/50">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-secondary text-xs">Prev</button>
            <span className="text-sm text-dark-400 py-2">Page {page} of {Math.ceil(total/50)}</span>
            <button onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/50)} className="btn-secondary text-xs">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
