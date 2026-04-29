import { create } from 'zustand';
import api from '../api/client';

const useAgentStore = create((set) => ({
  agents: [],
  currentStatus: 'offline',
  loading: false,

  fetchAgents: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get('/agents');
      set({ agents: data.agents, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStatuses: async () => {
    try {
      const { data } = await api.get('/agents/status');
      set({ agents: data.agents });
    } catch { /* ignore */ }
  },

  setStatus: async (agentId, status) => {
    try {
      await api.post(`/agents/${agentId}/status`, { status });
      set({ currentStatus: status });
    } catch { /* ignore */ }
  },

  agentLogin: async (agentId) => {
    try {
      await api.post(`/agents/${agentId}/login`);
      set({ currentStatus: 'available' });
    } catch { /* ignore */ }
  },

  agentLogout: async (agentId) => {
    try {
      await api.post(`/agents/${agentId}/logout`);
      set({ currentStatus: 'offline' });
    } catch { /* ignore */ }
  },

  setCurrentStatus: (status) => set({ currentStatus: status }),
}));

export default useAgentStore;
