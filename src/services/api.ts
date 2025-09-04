import axios, { AxiosError, AxiosResponse } from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_ENDPOINT || '';

// Custom error class for API errors
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Create axios instance with base configuration
export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const message = error.response?.data?.message || error.message || 'An error occurred';
    const status = error.response?.status;
    const code = error.code;
    
    throw new ApiError(message, status, code);
  }
);

export default apiClient;
