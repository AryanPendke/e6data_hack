//masterOrchestrator.js

const redisClient = require('./redisClient');
const dbClient = require('../db/dbClient');
const config = require('../config');

class MasterOrchestrator {
  constructor() {
    this.isRunning = false;
    this.workerId = `master_${Date.now()}`;
    this.maxConcurrentTasks = 10;
    this.runningTasks = 0;
    this.activeTasks = new Map(); // Track tasks and their completion status
    this.timeoutMonitorInterval = null;
    this.taskTimeout = 300000; // 5 minutes timeout per task
  }

  async start() {
    if (this.isRunning) {
      console.log('Master Orchestrator is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting Master Orchestrator (ID: ${this.workerId})`);
    
    await redisClient.setWorkerStatus(this.workerId, 'active');
    
    // Start the main processing loop
    this.processMainQueue();
    
    // Start the results collection loop
    this.collectResults();
    
    console.log('Master Orchestrator started successfully');
  }

  async stop() {
    console.log('Stopping Master Orchestrator...');
    this.isRunning = false;
    
    // Stop timeout monitoring
    if (this.timeoutMonitorInterval) {
      clearInterval(this.timeoutMonitorInterval);
      this.timeoutMonitorInterval = null;
    }
    
    // Wait for running tasks to complete
    while (this.runningTasks > 0) {
      console.log(`Waiting for ${this.runningTasks} tasks to complete...`);
      await this.sleep(1000);
    }
    
    await redisClient.setWorkerStatus(this.workerId, 'stopped');
    console.log('Master Orchestrator stopped');
  }

  async processMainQueue() {
    while (this.isRunning) {
      try {
        // Check if we can process more tasks
        if (this.runningTasks >= this.maxConcurrentTasks) {
          await this.sleep(100);
          continue;
        }

        // Get a main task from the queue
        const mainTask = await redisClient.getMainTask(5); // 5 second timeout
        
        if (mainTask) {
          this.processMainTask(mainTask);
        } else {
          // No tasks available, update status and wait
          await redisClient.setWorkerStatus(this.workerId, 'idle');
          await this.sleep(1000);
        }

      } catch (error) {
        console.error('Error in main queue processing:', error);
        await this.sleep(5000);
      }
    }
  }

  async processMainTask(mainTask) {
    this.runningTasks++;
    const taskId = mainTask.task_id;

    try {
      await redisClient.setWorkerStatus(this.workerId, 'processing');
      console.log(`Master processing task ${taskId} for response ${mainTask.response_id}`);

      // Update response status
      await dbClient.updateResponseStatus(mainTask.response_id, 'processing');

      // Initialize task tracking
      this.activeTasks.set(taskId, {
        mainTask: mainTask,
        startTime: Date.now(),
        completedDimensions: new Set(),
        totalDimensions: config.DIMENSIONS.length
      });

      // Create dimension tasks for each evaluation dimension
      for (const dimension of config.DIMENSIONS) {
        const dimensionTask = {
          task_id: taskId,
          dimension: dimension,
          response_id: mainTask.response_id,
          batch_id: mainTask.batch_id,
          agent_id: mainTask.agent_id,
          prompt: mainTask.prompt,
          response_text: mainTask.response_text,
          context: mainTask.context,
          reference: mainTask.reference,
          metadata: mainTask.metadata
        };

        // Add task to appropriate dimension queue
        await redisClient.addDimensionTask(dimension, dimensionTask);
      }

      console.log(`Distributed task ${taskId} to ${config.DIMENSIONS.length} dimension workers`);

    } catch (error) {
      console.error(`Failed to process main task ${taskId}:`, error);
      
      // Handle task failure
      await this.handleTaskFailure(mainTask, error);
      
      // Clean up tracking
      this.activeTasks.delete(taskId);
    } finally {
      this.runningTasks--;
    }
  }

  async collectResults() {
    while (this.isRunning) {
      try {
        // Get dimension results with short timeout to avoid blocking
        const result = await redisClient.popDimensionResult(1);
        
        if (result) {
          await this.processDimensionResult(result);
        }

      } catch (error) {
        console.error('Error in results collection:', error);
        await this.sleep(1000);
      }
    }
  }

  async processDimensionResult(result) {
    const { task_id, dimension, response_id, score, details, error } = result;

    try {
      console.log(`Received ${dimension} result for task ${task_id}: score=${score}`);

      // Store partial result in Redis
      const completedDimensions = await redisClient.setPartialResult(task_id, dimension, {
        score: score || 0.0,
        details: details || {},
        error: error || null,
        completed_at: new Date().toISOString()
      });

      // Update task tracking
      const taskInfo = this.activeTasks.get(task_id);
      if (taskInfo) {
        taskInfo.completedDimensions.add(dimension);

        // Check if all dimensions are completed
        if (completedDimensions >= config.DIMENSIONS.length) {
          await this.finalizeTask(task_id);
        }
      } else {
        // Task might have been completed by timeout or error handler
        console.warn(`Received result for unknown task ${task_id}`);
        
        // Still try to finalize if all dimensions are complete
        if (completedDimensions >= config.DIMENSIONS.length) {
          await this.finalizeTaskById(task_id);
        }
      }

    } catch (error) {
      console.error(`Error processing dimension result for task ${task_id}:`, error);
    }
  }

  async finalizeTask(taskId) {
    const taskInfo = this.activeTasks.get(taskId);
    if (!taskInfo) {
      console.warn(`Cannot finalize unknown task ${taskId}`);
      return;
    }

    await this.finalizeTaskWithInfo(taskId, taskInfo);
  }

  async finalizeTaskById(taskId) {
    // Get partial results to reconstruct task info
    const partialResults = await redisClient.getPartialResults(taskId);
    if (Object.keys(partialResults).length === 0) {
      console.warn(`No partial results found for task ${taskId}`);
      return;
    }

    // We don't have full task info, but we can still finalize
    await this.finalizeTaskWithInfo(taskId, null);
  }

  async finalizeTaskWithInfo(taskId, taskInfo) {
    try {
      console.log(`Finalizing task ${taskId}`);

      // Get all dimension results
      const dimensionResults = await redisClient.getPartialResults(taskId);
      
      if (Object.keys(dimensionResults).length < config.DIMENSIONS.length) {
        console.warn(`Task ${taskId} incomplete: ${Object.keys(dimensionResults).length}/${config.DIMENSIONS.length} dimensions`);
        return;
      }

      // Calculate final score using default weights
      let finalScore = 0;
      let totalWeight = 0;
      const scores = {};
      let hasErrors = false;
      const allErrors = [];

      for (const dimension of config.DIMENSIONS) {
        const result = dimensionResults[dimension];
        if (result) {
          const score = result.score || 0.0;
          const weight = config.DEFAULT_WEIGHTS[dimension] || 0.2;
          
          scores[dimension] = score;
          finalScore += score * weight;
          totalWeight += weight;
          
          if (result.error) {
            hasErrors = true;
            allErrors.push(`${dimension}: ${result.error}`);
          }
        } else {
          console.error(`Missing result for dimension ${dimension} in task ${taskId}`);
          scores[dimension] = 0.0;
          hasErrors = true;
          allErrors.push(`${dimension}: Missing result`);
        }
      }

      // Normalize final score
      finalScore = totalWeight > 0 ? finalScore / totalWeight : 0.0;

      // Get response ID (from task info or try to extract from partial results)
      let responseId = taskInfo?.mainTask?.response_id;
      let batchId = taskInfo?.mainTask?.batch_id;
      let agentId = taskInfo?.mainTask?.agent_id;

      if (!responseId) {
        // Try to get from one of the dimension results
        for (const result of Object.values(dimensionResults)) {
          if (result.details?.response_id) {
            responseId = result.details.response_id;
            break;
          }
        }
      }

      if (!responseId) {
        console.error(`Cannot determine response_id for task ${taskId}`);
        return;
      }

      // Get response details if missing
      if (!batchId || !agentId) {
        const response = await dbClient.getResponseById(responseId);
        if (response) {
          batchId = response.batch_id;
          agentId = response.agent_id;
        }
      }

      // Save evaluation results to database
      const evaluationData = {
        response_id: responseId,
        batch_id: batchId,
        agent_id: agentId,
        scores: scores,
        final_score: finalScore,
        processing_errors: hasErrors ? allErrors : [],
        processing_time_ms: taskInfo ? (Date.now() - taskInfo.startTime) : 0,
        processed_at: new Date(),
        processed_by: this.workerId,
        task_id: taskId
      };

      await dbClient.insertEvaluation(evaluationData);
      await dbClient.updateResponseStatus(responseId, 'completed');

      console.log(`Task ${taskId} completed: final_score=${finalScore.toFixed(3)}`);

      // Update batch progress
      await this.updateBatchProgress(batchId);

      // Clean up
      this.activeTasks.delete(taskId);
      await redisClient.deletePartialResults(taskId);

    } catch (error) {
      console.error(`Error finalizing task ${taskId}:`, error);
      
      if (taskInfo?.mainTask?.response_id) {
        await dbClient.updateResponseStatus(taskInfo.mainTask.response_id, 'failed');
      }
      
      this.activeTasks.delete(taskId);
      await redisClient.deletePartialResults(taskId);
    }
  }

  async handleTaskFailure(mainTask, error) {
    try {
      console.error(`Task ${mainTask.task_id} failed:`, error.message);

      // Try to requeue if retries available
      const success = await redisClient.requeueMainTask(mainTask);
      if (!success) {
        await dbClient.updateResponseStatus(mainTask.response_id, 'failed');
      }

    } catch (err) {
      console.error(`Error handling task failure:`, err);
      await dbClient.updateResponseStatus(mainTask.response_id, 'failed');
    }
  }

  async updateBatchProgress(batchId) {
    try {
      const progress = await dbClient.getBatchProgress(batchId);
      
      // Check if batch is completed
      if (progress.pending === 0 && progress.processing === 0) {
        await dbClient.updateBatchStatus(batchId, 'completed', progress);
        console.log(`Batch ${batchId} completed`);
      } else {
        await dbClient.updateBatchStatus(batchId, 'processing', progress);
      }

    } catch (error) {
      console.error(`Error updating batch progress for ${batchId}:`, error);
    }
  }

  // Missing method: Start timeout monitoring
  async startTimeoutMonitoring() {
    if (this.timeoutMonitorInterval) {
      clearInterval(this.timeoutMonitorInterval);
    }

    this.timeoutMonitorInterval = setInterval(() => {
      this.checkTaskTimeouts();
    }, 60000); // Check every minute

    console.log('Timeout monitoring started');
  }

  // Missing method: Check for timed out tasks
  async checkTaskTimeouts() {
    const now = Date.now();
    const timeoutTasks = [];

    for (const [taskId, taskInfo] of this.activeTasks.entries()) {
      if (now - taskInfo.startTime > this.taskTimeout) {
        timeoutTasks.push({ taskId, taskInfo });
      }
    }

    for (const { taskId, taskInfo } of timeoutTasks) {
      console.warn(`Task ${taskId} timed out after ${this.taskTimeout}ms`);
      
      try {
        // Mark as failed due to timeout
        if (taskInfo.mainTask?.response_id) {
          await dbClient.updateResponseStatus(taskInfo.mainTask.response_id, 'failed');
        }

        // Clean up
        this.activeTasks.delete(taskId);
        await redisClient.deletePartialResults(taskId);

      } catch (error) {
        console.error(`Error handling timeout for task ${taskId}:`, error);
      }
    }
  }

  // Missing method: Get status (called from orchestrator.js)
  async getStatus() {
    const workerStatus = await redisClient.getWorkerStatus(this.workerId);
    
    return {
      worker_id: this.workerId,
      is_running: this.isRunning,
      status: workerStatus?.status || 'unknown',
      running_tasks: this.runningTasks,
      max_concurrent_tasks: this.maxConcurrentTasks,
      active_tasks_count: this.activeTasks.size,
      last_updated: workerStatus?.last_updated || null,
      timeout_monitoring: this.timeoutMonitorInterval !== null
    };
  }

  // Missing method: Health check (called from orchestrator.js)
  async healthCheck() {
    const checks = {
      redis: false,
      database: false,
      queue_accessible: false,
      within_task_limits: true
    };

    try {
      // Check Redis connection
      checks.redis = await redisClient.ping();
      
      // Check database connection
      await dbClient.connect();
      checks.database = true;
      
      // Check if we can access queues
      await redisClient.getQueueStats();
      checks.queue_accessible = true;
      
      // Check if we're not overloaded
      checks.within_task_limits = this.runningTasks < this.maxConcurrentTasks * 1.2;

    } catch (error) {
      console.error('Master orchestrator health check error:', error);
    }

    const allHealthy = Object.values(checks).every(Boolean);

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      current_load: {
        running_tasks: this.runningTasks,
        max_tasks: this.maxConcurrentTasks,
        active_tasks: this.activeTasks.size
      },
      timestamp: new Date().toISOString()
    };
  }

  // Missing method: Setup graceful shutdown (called from orchestrator.js)
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`Master Orchestrator received ${signal}, starting graceful shutdown...`);
      await this.stop();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Master Orchestrator uncaught exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Master Orchestrator unhandled rejection at:', promise, 'reason:', reason);
    });
  }

  // Utility method
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
const masterOrchestrator = new MasterOrchestrator();

module.exports = masterOrchestrator;