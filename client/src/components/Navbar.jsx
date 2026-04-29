import useRealtimeStore from '../store/realtimeStore';
import { Wifi, WifiOff } from 'lucide-react';

export default function Navbar() {
  const connected = useRealtimeStore((s) => s.connected);
  const stats = useRealtimeStore((s) => s.stats);

  return (
    <header className="h-14 bg-dark-900/60 backdrop-blur-sm border-b border-dark-700/50 flex items-center justify-between px-6">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-dark-400">Active Calls:</span>
          <span className="font-semibold text-primary-400">{stats.activeCalls}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-dark-400">Today:</span>
          <span className="font-semibold text-dark-200">{stats.todayCalls}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-dark-400">ASR:</span>
          <span className="font-semibold text-success">{stats.asr}%</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {connected ? (
          <div className="flex items-center gap-1.5 text-success text-xs">
            <Wifi className="w-3.5 h-3.5" />
            <span>Live</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-danger text-xs">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Disconnected</span>
          </div>
        )}
      </div>
    </header>
  );
}
