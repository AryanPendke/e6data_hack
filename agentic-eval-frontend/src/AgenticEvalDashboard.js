import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, BarChart3, Users, Activity, Download, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Play, Pause } from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';

// Utility function for API calls
const apiCall = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }
  
  return await response.json();
};

// Main Dashboard Component
const AgenticEvalDashboard = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSystemStatus();
    const interval = setInterval(fetchSystemStatus, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const status = await apiCall('/status/system');
      setSystemStatus(status);
    } catch (error) {
      console.error('Failed to fetch system status:', error);
    }
  };

  const tabs = [
    { id: 'upload', label: 'Upload & Validate', icon: Upload },
    { id: 'batches', label: 'Batch Status', icon: Activity },
    { id: 'results', label: 'Results & Leaderboard', icon: BarChart3 },
    { id: 'system', label: 'System Health', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900">Agentic Evaluation Platform</h1>
            </div>
            <div className="flex items-center space-x-4">
              {systemStatus && (
                <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  systemStatus.system_status.overall_health === 'healthy' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  <div className={`w-2 h-2 rounded-full mr-2 ${
                    systemStatus.system_status.overall_health === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  {systemStatus.system_status.overall_health === 'healthy' ? 'System Healthy' : 'System Issues'}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-3 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'upload' && <UploadSection />}
        {activeTab === 'batches' && <BatchStatusSection />}
        {activeTab === 'results' && <ResultsSection />}
        {activeTab === 'system' && <SystemHealthSection systemStatus={systemStatus} />}
      </main>
    </div>
  );
};

// Upload and Validation Section
const UploadSection = () => {
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [supportedFormats, setSupportedFormats] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSupportedFormats();
  }, []);

  const fetchSupportedFormats = async () => {
    try {
      const formats = await apiCall('/upload/formats');
      setSupportedFormats(formats);
    } catch (error) {
      console.error('Failed to fetch supported formats:', error);
    }
  };

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
    setValidationResult(null);
    setUploadResult(null);
  };

  const validateFile = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/upload/validate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Validation failed: ${response.statusText}`);
      }

      const result = await response.json();
      setValidationResult(result);
    } catch (error) {
      console.error('Validation error:', error);
      setValidationResult({ success: false, error: error.message });
    }
    setLoading(false);
  };

  const uploadFile = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/upload/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      setUploadResult(result);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadResult({ success: false, error: error.message });
    }
    setLoading(false);
  };

  const generateSampleData = async () => {
    setLoading(true);
    try {
      const result = await apiCall('/upload/sample-data', { method: 'POST' });
      
      // Create a downloadable file
      const blob = new Blob([JSON.stringify(result.sample_data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate sample data:', error);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* File Upload Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">File Upload & Validation</h2>
        
        <div className="space-y-4">
          {/* File Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select File (CSV or JSON)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={validateFile}
              disabled={!file || loading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Validate File
            </button>
            <button
              onClick={uploadFile}
              disabled={!file || loading || (validationResult && !validationResult.success)}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload & Process
            </button>
            <button
              onClick={generateSampleData}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4 mr-2" />
              Generate Sample Data
            </button>
          </div>
        </div>
      </div>

      {/* Supported Formats Info */}
      {supportedFormats && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-blue-900 mb-2">Supported Formats</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-blue-800">Required Fields:</h4>
              <ul className="list-disc list-inside text-blue-700">
                {supportedFormats.required_fields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-800">Optional Fields:</h4>
              <ul className="list-disc list-inside text-blue-700">
                {supportedFormats.optional_fields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Validation Results */}
      {validationResult && (
        <div className={`rounded-lg p-4 ${validationResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
          <h3 className={`text-lg font-medium mb-2 ${validationResult.success ? 'text-green-900' : 'text-red-900'}`}>
            Validation Results
          </h3>
          {validationResult.success ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Rows:</span> {validationResult.validation.total_rows}
                </div>
                <div>
                  <span className="font-medium">Valid Rows:</span> {validationResult.validation.valid_rows}
                </div>
                <div>
                  <span className="font-medium">File Size:</span> {Math.round(validationResult.validation.file_size / 1024)} KB
                </div>
                <div>
                  <span className="font-medium">Est. Processing:</span> {validationResult.validation.estimated_processing_time} min
                </div>
              </div>
              {validationResult.validation.errors.length > 0 && (
                <div className="mt-2">
                  <span className="font-medium text-red-600">Errors:</span>
                  <ul className="list-disc list-inside text-red-600 text-sm">
                    {validationResult.validation.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-red-700">{validationResult.error}</p>
          )}
        </div>
      )}

      {/* Upload Results */}
      {uploadResult && (
        <div className={`rounded-lg p-4 ${uploadResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
          <h3 className={`text-lg font-medium mb-2 ${uploadResult.success ? 'text-green-900' : 'text-red-900'}`}>
            Upload Results
          </h3>
          {uploadResult.success ? (
            <div className="space-y-2">
              <p className="text-green-700">
                Successfully uploaded and queued batch: <strong>{uploadResult.batch_id}</strong>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Responses:</span> {uploadResult.summary.total_responses}
                </div>
                <div>
                  <span className="font-medium">Agents:</span> {uploadResult.summary.agents}
                </div>
                <div>
                  <span className="font-medium">Status:</span> {uploadResult.summary.processing_status}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-red-700">{uploadResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
};

// Batch Status Section
const BatchStatusSection = () => {
  const [batchId, setBatchId] = useState('');
  const [batchStatus, setBatchStatus] = useState(null);
  const [workerStatus, setWorkerStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchBatchStatus = async () => {
    if (!batchId.trim()) return;

    setLoading(true);
    try {
      const status = await apiCall(`/status/batch/${batchId}`);
      setBatchStatus(status);
    } catch (error) {
      console.error('Failed to fetch batch status:', error);
      setBatchStatus({ success: false, error: error.message });
    }
    setLoading(false);
  };

  const fetchWorkerStatus = async () => {
    setLoading(true);
    try {
      const status = await apiCall('/status/workers');
      setWorkerStatus(status);
    } catch (error) {
      console.error('Failed to fetch worker status:', error);
    }
    setLoading(false);
  };

  const restartWorker = async (dimension) => {
    try {
      await apiCall(`/status/workers/restart/${dimension}`, { method: 'POST' });
      fetchWorkerStatus(); // Refresh worker status
    } catch (error) {
      console.error(`Failed to restart ${dimension} worker:`, error);
    }
  };

  useEffect(() => {
    fetchWorkerStatus();
  }, []);

  return (
    <div className="space-y-6">
      {/* Batch Status Query */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Batch Status</h2>
        
        <div className="flex space-x-4 mb-4">
          <input
            type="text"
            placeholder="Enter Batch ID"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchBatchStatus}
            disabled={loading || !batchId.trim()}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
            Check Status
          </button>
        </div>

        {batchStatus && (
          <div className={`rounded-lg p-4 ${batchStatus.success ? 'bg-blue-50' : 'bg-red-50'}`}>
            {batchStatus.success ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-blue-900">Batch: {batchStatus.batch_id}</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    batchStatus.status.current_status === 'completed' ? 'bg-green-100 text-green-800' :
                    batchStatus.status.current_status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                    batchStatus.status.current_status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {batchStatus.status.current_status}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${batchStatus.status.progress.completion_percentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div className="text-center">
                    <div className="font-medium text-gray-900">{batchStatus.status.progress.total}</div>
                    <div className="text-gray-500">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-green-600">{batchStatus.status.progress.completed}</div>
                    <div className="text-gray-500">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-yellow-600">{batchStatus.status.progress.processing}</div>
                    <div className="text-gray-500">Processing</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-gray-600">{batchStatus.status.progress.pending}</div>
                    <div className="text-gray-500">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-red-600">{batchStatus.status.progress.failed}</div>
                    <div className="text-gray-500">Failed</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-red-700">{batchStatus.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Worker Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Worker Status</h2>
          <button
            onClick={fetchWorkerStatus}
            disabled={loading}
            className="flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {workerStatus && workerStatus.success && (
          <div className="space-y-4">
            {/* Handle case where workers is an array or object */}
            {workerStatus.workers ? (
              // If workers is an object with worker details
              Object.entries(workerStatus.workers).map(([dimension, worker]) => (
                <div key={dimension} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${worker.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <div className="font-medium text-gray-900 capitalize">{dimension} Worker</div>
                      <div className="text-sm text-gray-500">
                        Status: {worker.status} | Queue: {worker.queue_length || 0} tasks
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => restartWorker(dimension)}
                    className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Restart
                  </button>
                </div>
              ))
            ) : workerStatus.dimensions ? (
              // If it's an array of dimension names or different structure
              workerStatus.dimensions.map((dimension) => (
                <div key={dimension} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 rounded-full bg-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900 capitalize">{dimension} Worker</div>
                      <div className="text-sm text-gray-500">Status: Unknown</div>
                    </div>
                  </div>
                  <button
                    onClick={() => restartWorker(dimension)}
                    className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Restart
                  </button>
                </div>
              ))
            ) : (
              // Fallback for unknown structure - show the 5 known dimensions
              ['instruction', 'hallucination', 'assumption', 'coherence', 'accuracy'].map((dimension) => (
                <div key={dimension} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div>
                      <div className="font-medium text-gray-900 capitalize">{dimension} Worker</div>
                      <div className="text-sm text-gray-500">Status: Unknown</div>
                    </div>
                  </div>
                  <button
                    onClick={() => restartWorker(dimension)}
                    className="flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Restart
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Results Section
const ResultsSection = () => {
  const [batchId, setBatchId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [results, setResults] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [agentResults, setAgentResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchResults = async () => {
    if (!batchId.trim()) return;

    setLoading(true);
    try {
      const [resultsData, leaderboardData] = await Promise.all([
        apiCall(`/results/batch/${batchId}`),
        apiCall(`/results/leaderboard/${batchId}`)
      ]);
      setResults(resultsData);
      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error('Failed to fetch results:', error);
    }
    setLoading(false);
  };

  const fetchAgentResults = async () => {
    if (!agentId.trim() || !batchId.trim()) return;

    setLoading(true);
    try {
      const agentData = await apiCall(`/results/agent/${agentId}?batchId=${batchId}`);
      setAgentResults(agentData);
    } catch (error) {
      console.error('Failed to fetch agent results:', error);
      setAgentResults({ success: false, error: error.message });
    }
    setLoading(false);
  };

  const exportResults = async (format = 'json') => {
    if (!batchId.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/results/export/${batchId}?format=${format}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `results-${batchId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Results Query */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Results & Leaderboard</h2>
        
        <div className="flex space-x-4 mb-4">
          <input
            type="text"
            placeholder="Enter Batch ID"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchResults}
            disabled={loading || !batchId.trim()}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
            Get Results
          </button>
          <button
            onClick={() => exportResults('json')}
            disabled={!results}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </button>
          <button
            onClick={() => exportResults('csv')}
            disabled={!results}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
        </div>

        {/* Agent-specific Results */}
        <div className="flex space-x-4 mt-4 pt-4 border-t">
          <input
            type="text"
            placeholder="Enter Agent ID (optional)"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={fetchAgentResults}
            disabled={loading || !agentId.trim() || !batchId.trim()}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="animate-spin h-4 w-4 mr-2" /> : <Users className="h-4 w-4 mr-2" />}
            Get Agent Results
          </button>
        </div>
      </div>

      {/* Agent-specific Results Display */}
      {agentResults && (
        <div className={`rounded-lg p-4 ${agentResults.success ? 'bg-green-50' : 'bg-red-50'}`}>
          {agentResults.success ? (
            <div>
              <h3 className="text-lg font-medium text-green-900 mb-2">
                Agent Results: {agentResults.agent_id}
              </h3>
              {/* Display agent-specific data based on your API response structure */}
              <pre className="text-sm text-green-700 whitespace-pre-wrap overflow-auto max-h-40">
                {JSON.stringify(agentResults, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-red-700">{agentResults.error}</p>
          )}
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard && leaderboard.success && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Leaderboard</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Instruction</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hallucination</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assumption</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coherence</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Accuracy</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Responses</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.leaderboard.map((agent) => (
                  <tr key={agent.agent_id} className={agent.rank <= 3 ? 'bg-yellow-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {agent.rank === 1 && <span className="text-yellow-500 mr-2">🥇</span>}
                        {agent.rank === 2 && <span className="text-gray-400 mr-2">🥈</span>}
                        {agent.rank === 3 && <span className="text-orange-600 mr-2">🥉</span>}
                        <span className="text-sm font-medium text-gray-900">#{agent.rank}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">{agent.agent_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-900">{agent.final_score.toFixed(3)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agent.scores.instruction.toFixed(3)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agent.scores.hallucination.toFixed(3)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agent.scores.assumption.toFixed(3)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agent.scores.coherence.toFixed(3)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agent.scores.accuracy.toFixed(3)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agent.total_responses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Results */}
      {results && results.success && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Detailed Results</h3>
          <div className="space-y-4">
            {results.results.map((result, index) => (
              <div key={result._id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-medium text-gray-900">Response #{index + 1}</h4>
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                      Score: {result.final_score.toFixed(3)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {result.processing_time_ms}ms
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prompt</label>
                    <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{result.prompt}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Agent ID</label>
                    <p className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded">{result.agent_id}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Response</label>
                  <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-wrap">{result.response_text}</p>
                </div>

                {result.context && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Context</label>
                    <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{result.context}</p>
                  </div>
                )}

                {result.reference && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                    <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{result.reference}</p>
                  </div>
                )}

                {/* Dimension Scores */}
                <div className="grid grid-cols-5 gap-4 mb-4">
                  {Object.entries(result.scores).map(([dimension, score]) => (
                    <div key={dimension} className="text-center">
                      <div className="text-xs font-medium text-gray-500 uppercase mb-1">{dimension}</div>
                      <div className={`text-lg font-semibold ${
                        score >= 0.8 ? 'text-green-600' :
                        score >= 0.6 ? 'text-yellow-600' :
                        score >= 0.4 ? 'text-orange-600' :
                        'text-red-600'
                      }`}>
                        {score.toFixed(3)}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                        <div
                          className={`h-1 rounded-full ${
                            score >= 0.8 ? 'bg-green-500' :
                            score >= 0.6 ? 'bg-yellow-500' :
                            score >= 0.4 ? 'bg-orange-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${score * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {result.processing_errors && result.processing_errors.length > 0 && (
                  <div className="mt-3 p-2 bg-red-50 rounded">
                    <h5 className="text-sm font-medium text-red-800 mb-1">Processing Errors:</h5>
                    <ul className="list-disc list-inside text-sm text-red-700">
                      {result.processing_errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// System Health Section
const SystemHealthSection = ({ systemStatus }) => {
  const [workerStatus, setWorkerStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWorkerStatus();
  }, []);

  const fetchWorkerStatus = async () => {
    setLoading(true);
    try {
      const status = await apiCall('/status/workers');
      setWorkerStatus(status);
    } catch (error) {
      console.error('Failed to fetch worker status:', error);
    }
    setLoading(false);
  };

  if (!systemStatus) {
    return (
      <div className="text-center py-8">
        <RefreshCw className="animate-spin h-8 w-8 mx-auto text-gray-400 mb-2" />
        <p className="text-gray-500">Loading system status...</p>
      </div>
    );
  }

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const formatBytes = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className={`w-4 h-4 rounded-full mr-3 ${
              systemStatus.system_status.overall_health === 'healthy' ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <h3 className="text-lg font-semibold text-gray-900">Overall Health</h3>
          </div>
          <p className={`text-2xl font-bold mt-2 ${
            systemStatus.system_status.overall_health === 'healthy' ? 'text-green-600' : 'text-red-600'
          }`}>
            {systemStatus.system_status.overall_health}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Clock className="h-4 w-4 text-gray-400 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">Uptime</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2">
            {formatUptime(systemStatus.system_status.uptime_seconds)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Activity className="h-4 w-4 text-gray-400 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">Active Workers</h3>
          </div>
          <p className="text-2xl font-bold text-green-600 mt-2">
            {systemStatus.statistics.queue.active_workers}
          </p>
        </div>
      </div>

      {/* Health Checks */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Health Checks</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(systemStatus.system_status.health_checks).map(([check, status]) => (
            <div key={check} className="flex items-center p-3 bg-gray-50 rounded-lg">
              {status ? (
                <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 mr-3" />
              )}
              <div>
                <div className="font-medium text-gray-900 capitalize">{check.replace('_', ' ')}</div>
                <div className={`text-sm ${status ? 'text-green-600' : 'text-red-600'}`}>
                  {status ? 'Healthy' : 'Unhealthy'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Batch Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch Statistics</h3>
          <div className="space-y-3">
            {Object.entries(systemStatus.statistics.batches).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <span className="text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                <span className={`font-semibold ${
                  status === 'completed' ? 'text-green-600' :
                  status === 'processing' ? 'text-yellow-600' :
                  status === 'failed' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Response Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Response Statistics</h3>
          <div className="space-y-3">
            {Object.entries(systemStatus.statistics.responses).map(([status, count]) => (
              <div key={status} className="flex justify-between items-center">
                <span className="text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                <span className={`font-semibold ${
                  status === 'completed' ? 'text-green-600' :
                  status === 'processing' ? 'text-yellow-600' :
                  status === 'failed' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-700 mb-3">Memory Usage</h4>
            <div className="space-y-2">
              {Object.entries(systemStatus.performance.memory_usage).map(([type, bytes]) => (
                <div key={type} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 capitalize">{type}</span>
                  <span className="font-mono text-gray-900">{formatBytes(bytes)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-3">CPU Usage</h4>
            <div className="space-y-2">
              {Object.entries(systemStatus.performance.cpu_usage).map(([type, microseconds]) => (
                <div key={type} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600 capitalize">{type}</span>
                  <span className="font-mono text-gray-900">{(microseconds / 1000).toFixed(2)}ms</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Worker Status */}
      {workerStatus && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Worker Status</h3>
            <button
              onClick={fetchWorkerStatus}
              disabled={loading}
              className="flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          
          {workerStatus.workers && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(workerStatus.workers).map(([dimension, worker]) => (
                <div key={dimension} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900 capitalize">{dimension}</h4>
                    <div className={`w-3 h-3 rounded-full ${
                      worker.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                  </div>
                  <div className="text-sm text-gray-600">
                    <div>Status: {worker.status}</div>
                    <div>Queue: {worker.queue_length || 0} tasks</div>
                    {worker.last_active && (
                      <div>Last Active: {new Date(worker.last_active).toLocaleTimeString()}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgenticEvalDashboard;