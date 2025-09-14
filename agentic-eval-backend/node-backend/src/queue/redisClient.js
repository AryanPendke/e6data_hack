//redisClient.js
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    if (!this.isConnected) {
      try {
        const redisConfig = {
          host: config.REDIS_HOST,
          port: config.REDIS_PORT,
          retry_strategy: (options) => {
            if (options.error && options.error.code === 'ECONNREFUSED') {
              console.error('Redis server connection refused');
              return new Error('Redis server connection refused');
            }
            if (options.total_retry_time > 1000 * 60 * 60) {
              return new Error('Retry time exhausted');
            }
            if (options.attempt > 10) {
              return undefined;
            }
            return Math.min(options.attempt * 100, 3000);
          }
        };

        if (config.REDIS_PASSWORD) {
          redisConfig.password = config.REDIS_PASSWORD;
        }

        this.client = redis.createClient(redisConfig);

        this.client.on('error', (err) => {
          console.error('Redis Client Error:', err);
          this.isConnected = false;
        });

        this.client.on('connect', () => {
          console.log('Connected to Redis successfully');
          this.isConnected = true;
        });

        this.client.on('ready', () => {
          console.log('Redis client ready');
        });

        this.client.on('end', () => {
          console.log('Redis connection ended');
          this.isConnected = false;
        });

        await this.client.connect();
        
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
      }
    }
    return this.client;
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      console.log('Disconnected from Redis');
    }
  }

  // Basic Queue operations - NO BLPOP USED
  async pushToQueue(queueName, data) {
    const client = await this.connect();
    const jsonData = JSON.stringify(data);
    return await client.rPush(queueName, jsonData);
  }

  async popFromQueue(queueName, timeout = 0) {
    const client = await this.connect();
    
    // Ensure queueName is defined and is a string
    if (!queueName || typeof queueName !== 'string') {
      console.error(`Invalid queue name: ${queueName}`);
      return null;
    }
    
    try {
      if (timeout === 0) {
        // Non-blocking pop - use LPOP only
        const result = await client.lPop(queueName);
        if (result) {
          return JSON.parse(result);
        }
        return null;
      } else {
        // Simulate blocking behavior with polling - NO BLPOP USED
        const startTime = Date.now();
        const timeoutMs = timeout * 1000;
        
        while (Date.now() - startTime < timeoutMs) {
          const result = await client.lPop(queueName);
          if (result) {
            return JSON.parse(result);
          }
          
          // Wait 100ms before checking again
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return null; // Timeout reached
      }
    } catch (error) {
      console.error(`Error popping from queue ${queueName}:`, error);
      return null;
    }
  }

  async getQueueLength(queueName) {
    const client = await this.connect();
    return await client.lLen(queueName);
  }

  async clearQueue(queueName) {
    const client = await this.connect();
    return await client.del(queueName);
  }

  // Main task queue operations (for master orchestrator)
  async getMainTask(timeout = 5) {
    if (!config.MAIN_QUEUE_NAME) {
      console.error('MAIN_QUEUE_NAME is not defined in config');
      return null;
    }
    
    return await this.popFromQueue(config.MAIN_QUEUE_NAME, timeout);
  }

  async addMainTask(taskData) {
    return await this.pushToQueue(config.MAIN_QUEUE_NAME, {
      ...taskData,
      task_id: taskData.task_id || uuidv4(),
      created_at: new Date().toISOString(),
      retry_count: 0
    });
  }

  async requeueMainTask(taskData) {
    const updatedTask = {
      ...taskData,
      retry_count: (taskData.retry_count || 0) + 1,
      last_retry_at: new Date().toISOString()
    };

    if (updatedTask.retry_count <= config.MAX_RETRIES) {
      return await this.addMainTask(updatedTask);
    } else {
      console.error(`Main task ${taskData.task_id} exceeded max retries`);
      return false;
    }
  }

  // Legacy task management (for backward compatibility)
  async addTask(taskData) {
    return await this.pushToQueue(config.TASK_QUEUE_NAME, {
      ...taskData,
      created_at: new Date().toISOString(),
      retry_count: 0
    });
  }

  async getTask(timeout = 5) {
    return await this.popFromQueue(config.TASK_QUEUE_NAME, timeout);
  }

  async requeueTask(taskData) {
    const updatedTask = {
      ...taskData,
      retry_count: (taskData.retry_count || 0) + 1,
      last_retry_at: new Date().toISOString()
    };

    if (updatedTask.retry_count <= config.MAX_RETRIES) {
      return await this.pushToQueue(config.TASK_QUEUE_NAME, updatedTask);
    } else {
      console.error(`Task ${taskData.response_id} exceeded max retries`);
      return false;
    }
  }

  // Dimension task operations
  async addDimensionTask(dimension, taskData) {
    const queueName = `${config.DIMENSION_QUEUE_PREFIX}:${dimension}`;
    return await this.pushToQueue(queueName, taskData);
  }

  async getDimensionTask(dimension, timeout = 30) {
    const queueName = `${config.DIMENSION_QUEUE_PREFIX}:${dimension}`;
    return await this.popFromQueue(queueName, timeout);
  }

  // Results operations
  async pushDimensionResult(resultData) {
    return await this.pushToQueue(config.RESULTS_QUEUE_NAME, resultData);
  }

  async popDimensionResult(timeout = 1) {
    // Ensure the results queue name is defined
    if (!config.RESULTS_QUEUE_NAME) {
      console.error('RESULTS_QUEUE_NAME is not defined in config');
      return null;
    }
    return await this.popFromQueue(config.RESULTS_QUEUE_NAME, timeout);
  }

  // Partial results tracking
  async setPartialResult(taskId, dimension, result) {
    const client = await this.connect();
    const key = `task:${taskId}:results`;
    
    // Store the result for this dimension
    await client.hSet(key, dimension, JSON.stringify(result));
    
    // Set expiry for cleanup
    await client.expire(key, 3600); // 1 hour
    
    // Return count of completed dimensions
    const completedCount = await client.hLen(key);
    return completedCount;
  }

  async getPartialResults(taskId) {
    const client = await this.connect();
    const key = `task:${taskId}:results`;
    const results = await client.hGetAll(key);
    
    // Parse JSON values
    const parsedResults = {};
    for (const [dimension, resultJson] of Object.entries(results)) {
      try {
        parsedResults[dimension] = JSON.parse(resultJson);
      } catch (error) {
        console.error(`Failed to parse result for ${dimension}:`, error);
        parsedResults[dimension] = null;
      }
    }
    
    return parsedResults;
  }

  async deletePartialResults(taskId) {
    const client = await this.connect();
    const key = `task:${taskId}:results`;
    return await client.del(key);
  }

  // Batch tracking
  async setBatchProgress(batchId, progress) {
    const client = await this.connect();
    const key = `batch:${batchId}:progress`;
    return await client.set(key, JSON.stringify(progress), {
      EX: 24 * 60 * 60 // Expire after 24 hours
    });
  }

  async getBatchProgress(batchId) {
    const client = await this.connect();
    const key = `batch:${batchId}:progress`;
    const result = await client.get(key);
    return result ? JSON.parse(result) : null;
  }

  // Worker status tracking
  async setWorkerStatus(workerId, status) {
    const client = await this.connect();
    const key = `worker:${workerId}:status`;
    return await client.set(key, JSON.stringify({
      status,
      last_updated: new Date().toISOString()
    }), {
      EX: 60 // Expire after 1 minute (workers should update frequently)
    });
  }

  async getWorkerStatus(workerId) {
    const client = await this.connect();
    const key = `worker:${workerId}:status`;
    const result = await client.get(key);
    return result ? JSON.parse(result) : null;
  }

  async getAllWorkerStatuses() {
    const client = await this.connect();
    const keys = await client.keys('worker:*:status');
    if (keys.length === 0) return {};

    const values = await client.mGet(keys);
    const statuses = {};
    
    keys.forEach((key, index) => {
      const workerId = key.split(':')[1];
      statuses[workerId] = values[index] ? JSON.parse(values[index]) : null;
    });
    
    return statuses;
  }

  // Caching for model results
  async cacheResult(key, result, ttlSeconds = 3600) {
    const client = await this.connect();
    return await client.set(key, JSON.stringify(result), {
      EX: ttlSeconds
    });
  }

  async getCachedResult(key) {
    const client = await this.connect();
    const result = await client.get(key);
    return result ? JSON.parse(result) : null;
  }

  // Health check
  async ping() {
    try {
      const client = await this.connect();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping failed:', error);
      return false;
    }
  }

  // Statistics
  async getQueueStats() {
    const client = await this.connect();
    const mainQueueLength = await this.getQueueLength(config.MAIN_QUEUE_NAME);
    const resultsQueueLength = await this.getQueueLength(config.RESULTS_QUEUE_NAME);
    
    // Get dimension queue lengths
    const dimensionQueueLengths = {};
    for (const dimension of config.DIMENSIONS) {
      const queueName = `${config.DIMENSION_QUEUE_PREFIX}:${dimension}`;
      dimensionQueueLengths[dimension] = await this.getQueueLength(queueName);
    }
    
    const workerStatuses = await this.getAllWorkerStatuses();
    
    return {
      main_queue_length: mainQueueLength,
      results_queue_length: resultsQueueLength,
      dimension_queue_lengths: dimensionQueueLengths,
      active_workers: Object.keys(workerStatuses).length,
      worker_statuses: workerStatuses,
      queue_length: mainQueueLength // For backward compatibility
    };
  }
}

// Export singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;