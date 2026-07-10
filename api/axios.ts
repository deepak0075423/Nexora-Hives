import axios from 'axios';
import storage from '@/utils/storage';

// Use your machine's LAN IP so both emulator and physical devices can connect.
// Find yours with: ipconfig | findstr IPv4
// Override per-environment with EXPO_PUBLIC_API_URL (e.g. local testing).
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://35.154.216.100:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await storage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const status = err.response?.status;

    // Network error — no response received at all (server down, wrong IP, timeout)
    if (!err.response) {
      const networkMsg =
        err.code === 'ECONNABORTED'
          ? 'Request timed out. Is the backend running?'
          : `Cannot connect to server (${BASE_URL}). Check that the backend is running and reachable.`;
      return Promise.reject({ message: networkMsg, status: 0, data: null });
    }

    const message = err.response?.data?.message || 'Something went wrong';
    const url = err.config?.url || '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (status === 401 && !isAuthEndpoint && !err.config._retry) {
      err.config._retry = true;
      try {
        const refreshToken = await storage.getItem('refreshToken');
        if (refreshToken) {
          const data: any = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          await storage.setItem('token', data.data.token);
          err.config.headers.Authorization = `Bearer ${data.data.token}`;
          return api(err.config);
        }
      } catch {
        await storage.deleteItem('token');
        await storage.deleteItem('refreshToken');
      }
    }

    return Promise.reject({ message, status, data: err.response?.data });
  },
);

export default api;
