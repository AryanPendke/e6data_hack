//config.js

require('dotenv').config();

const config = {
  // Server Configuration
  PORT: process.env.PORT || 3001,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database Configuration
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/agentic-eval',
  DB_NAME: process.env.DB_NAME || 'agentic-eval',

  // Redis Configuration
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: process.env.REDIS_PORT || 6379,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',

  // Queue Configuration
  MAIN_QUEUE_NAME: 'main_evaluation_tasks',
  DIMENSION_QUEUE_PREFIX: 'dimension_queue',
  RESULTS_QUEUE_NAME: 'dimension_results',
  TASK_QUEUE_NAME: 'evaluation_tasks', // Added this - used by redisClient.js
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE) || 32,
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,

  // Worker Configuration
  PYTHON_WORKERS_PATH: process.env.PYTHON_WORKERS_PATH || '../python-workers',
  
  // API Configuration
  MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || '10mb',
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,

  // External APIs (if needed)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  // Evaluation Dimensions
  DIMENSIONS: ['instruction', 'hallucination', 'assumption', 'coherence', 'accuracy'],
  
  // Default Weights for Final Score
  DEFAULT_WEIGHTS: {
    instruction: 0.2,
    hallucination: 0.25,
    assumption: 0.2,
    coherence: 0.15,
    accuracy: 0.2
  }
};

module.exports = config;