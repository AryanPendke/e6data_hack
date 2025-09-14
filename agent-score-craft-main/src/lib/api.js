import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`❌ API Error: ${error.response?.status} ${error.config?.url}`, error.response?.data);
    return Promise.reject(error);
  }
);

// API Methods
export const apiService = {
  // System Status
  getSystemStatus: () => api.get('/status/system'),
  
  // Upload endpoints
  getUploadFormats: () => api.get('/upload/formats'),
  validateFile: (formData) => api.post('/upload/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadFile: (formData) => api.post('/upload/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getSampleData: () => api.get('/upload/sample-data'),
  
  // Batch Status
  getBatchStatus: (batchId) => api.get(`/status/batch/${batchId}`),
  
  // Results
  getBatchResults: (batchId, page = 1, limit = 100) => 
    api.get(`/results/batch/${batchId}?page=${page}&limit=${limit}`),
  getLeaderboard: (batchId) => api.get(`/results/leaderboard/${batchId}`),
  getAgentResults: (agentId, batchId) => 
    api.get(`/results/agent/${agentId}?batchId=${batchId}`),
  compareAgents: (batchId, agents) => 
    api.get(`/results/comparison?batchId=${batchId}&agents=${agents.join(',')}`),
  exportResults: (batchId, format = 'json') => 
    api.get(`/results/export/${batchId}?format=${format}`),
  
  // Workers
  getWorkerStatus: () => api.get('/status/workers'),
  restartWorker: (dimension) => api.post(`/status/workers/restart/${dimension}`),
  
  // Real-time status (Server-Sent Events)
  getBatchStream: (batchId) => `/status/stream/${batchId}`,
  
  // Helper method to get all completed batches from system data
  getCompletedBatches: async () => {
    const systemResponse = await api.get('/status/system');
    const stats = systemResponse.data.statistics;
    
    // Since your backend doesn't have a dedicated batches list endpoint,
    // we'll need to track batch IDs from uploads or system logs
    // For now, return empty array - you'll need to upload data first
    return {
      data: {
        batches: [],
        total: stats?.batches?.total || 0,
        completed: stats?.batches?.completed || 0
      }
    };
  }
};

export default api;