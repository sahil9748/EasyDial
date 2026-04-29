import { create } from 'zustand';

const useRealtimeStore = create((set) => ({
  stats: {
    activeCalls: 0,
    agentStats: {},
    todayCalls: 0,
    answeredCalls: 0,
    asr: 0,
    aht: 0,
    avgDuration: 0,
    connectedClients: 0,
  },
  agentUpdates: [],
  callEvents: [],
  connected: false,

  setStats: (stats) => set({ stats }),
  setConnected: (connected) => set({ connected }),

  addAgentUpdate: (update) =>
    set((state) => ({
      agentUpdates: [update, ...state.agentUpdates].slice(0, 50),
    })),

  addCallEvent: (event) =>
    set((state) => ({
      callEvents: [event, ...state.callEvents].slice(0, 100),
    })),
}));

export default useRealtimeStore;
