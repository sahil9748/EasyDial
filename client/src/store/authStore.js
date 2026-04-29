import { create } from 'zustand';
import api from '../api/client';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  agent: JSON.parse(localStorage.getItem('agent') || 'null'),
  token: localStorage.getItem('token') || null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.agent) localStorage.setItem('agent', JSON.stringify(data.agent));
      set({ user: data.user, agent: data.agent, token: data.token, loading: false });
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed';
      set({ loading: false, error: msg });
      throw new Error(msg);
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('agent');
    set({ user: null, agent: null, token: null });
  },

  isAuthenticated: () => !!get().token,
  isAdmin: () => get().user?.role === 'admin',
  isSupervisor: () => ['admin', 'supervisor'].includes(get().user?.role),
  isAgent: () => get().user?.role === 'agent',
}));

export default useAuthStore;
