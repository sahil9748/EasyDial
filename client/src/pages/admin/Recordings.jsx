import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import api from '../../api/client';

export default function RecordingsPage() {
  const [calls, setCalls] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(new Audio());

  useEffect(() => { loadRecordings(); }, [page]);

  const loadRecordings = async () => {
    try {
      const { data } = await api.get(`/calls?page=${page}&limit=30`);
      setCalls(data.calls.filter(c => c.recording_path));
      setTotal(data.pagination.total);
    } catch {}
  };

  const playRecording = (callId) => {
    if (playing === callId) {
      audioRef.current.pause();
      setPlaying(null);
      return;
    }
    audioRef.current.src = `/api/v1/calls/${callId}/recording`;
    audioRef.current.play();
    setPlaying(callId);
    audioRef.current.onended = () => setPlaying(null);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Recordings</h1>
        <p className="text-dark-400 text-sm mt-1">Browse and play call recordings</p></div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-dark-400 text-xs uppercase tracking-wider border-b border-dark-700/50 bg-dark-800/40">
              <th className="text-left py-3 px-4">Date</th><th className="text-left py-3 px-4">Number</th>
              <th className="text-left py-3 px-4">Agent</th><th className="text-left py-3 px-4">Duration</th>
              <th className="text-left py-3 px-4">Disposition</th><th className="text-center py-3 px-4">Play</th>
            </tr>
          </thead>
          <tbody>
            {calls.map(c => (
              <tr key={c.id} className="table-row">
                <td className="py-2.5 px-4 text-dark-400">{new Date(c.started_at).toLocaleString()}</td>
                <td className="py-2.5 px-4 font-mono text-dark-200">{c.callee || c.caller_id}</td>
                <td className="py-2.5 px-4 text-dark-300">{c.agent_name || '—'}</td>
                <td className="py-2.5 px-4 font-mono text-dark-300">{c.billsec || 0}s</td>
                <td className="py-2.5 px-4 text-dark-300">{c.disposition || '—'}</td>
                <td className="py-2.5 px-4 text-center">
                  <button onClick={() => playRecording(c.id)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${playing === c.id ? 'bg-primary-500 text-white' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}>
                    {playing === c.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                </td>
              </tr>
            ))}
            {calls.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-dark-500">No recordings found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
