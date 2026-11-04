import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Request Interceptor: Automatically attach JWT token from localStorage
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('gsmas_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Global handling for 401, 403, and 500 status codes
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;

      if (status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('gsmas_token');
          localStorage.removeItem('gsmas_user');
          if (window.location.pathname !== '/') {
            window.location.href = '/';
          }
        }
      } else if (status === 403) {
        console.error('Access Denied:', error.response.data?.message || 'Forbidden');
      } else if (status >= 500) {
        console.error('Server Error:', error.response.data?.message || 'Internal Server Error');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
