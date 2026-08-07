import axios from 'axios';
import router from '../router';
import { useAuthStore } from '../stores/auth';

export const http = axios.create({ baseURL: '/api' });

http.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers.set('Authorization', `Bearer ${auth.token}`);
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const auth = useAuthStore();
      auth.cerrarSesion();
      router.push('/login');
    }
    return Promise.reject(error);
  },
);
