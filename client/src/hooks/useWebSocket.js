import { useEffect, useRef, useCallback } from 'react';
import useAuthStore from '../store/authStore';
import useRealtimeStore from '../store/realtimeStore';

export default function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const token = useAuthStore((s) => s.token);
  const setStats = useRealtimeStore((s) => s.setStats);
  const setConnected = useRealtimeStore((s) => s.setConnected);
  const addAgentUpdate = useRealtimeStore((s) => s.addAgentUpdate);
  const addCallEvent = useRealtimeStore((s) => s.addCallEvent);

  const connect = useCallback(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws?token=${token}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'stats':
            setStats(msg.data);
            break;
          case 'agent:status':
            addAgentUpdate(msg.data);
            break;
          case 'call:ended':
            addCallEvent(msg.data);
            break;
          default:
            break;
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, setStats, setConnected, addAgentUpdate, addCallEvent]);

  useEffect(() => {
    connect();
    // Keepalive ping every 30s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return wsRef;
}
