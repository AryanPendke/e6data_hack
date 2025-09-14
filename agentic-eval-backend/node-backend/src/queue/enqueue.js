//enqueue.js

const redisClient = require('./redisClient');
const dbClient = require('../db/dbClient');
const config = require('../config');

class TaskEnqueue {
  constructor() {
    this.batchSize = config.BATCH_SIZE;
  }

  async enqueueBatch(batchId, responses) {
    try {
      console.log(`Enqueueing batch ${batchId} with ${responses.length} responses`);
      
      // Create tasks for each response
      const tasks = responses.map(response => ({
        response_id: response._id,
        batch_id: batchId,
        agent_id: response.agent_id,
        prompt: response.prompt,
        response_text: response.response_text,
        context: response.context,
        reference: response.reference,
        metadata: response.metadata,
        dimensions: config.DIMENSIONS,
        created_at: new Date().toISOString()
      }));

      // Enqueue all tasks
      let enqueuedCount = 0;
      for (const task of tasks) {
        await redisClient.addMainTask({
          ...task,
          task_id: require('uuid').v4() // Generate unique task ID
        });
        enqueuedCount++;
        
        // Update response status to processing
        await dbClient.updateResponseStatus(task.response_id, 'queued');
      }

      // Update batch status
      await dbClient.updateBatchStatus(batchId, 'processing', {
        total: responses.length,
        queued: enqueuedCount,
        processing: 0,
        completed: 0,
        failed: 0
      });

      console.log(`Successfully enqueued ${enqueuedCount} tasks for batch ${batchId}`);
      return { success: true, enqueued: enqueuedCount };

    } catch (error) {
      console.error(`Failed to enqueue batch ${batchId}:`, error);
      
      // Update batch status to failed
      await dbClient.updateBatchStatus(batchId, 'failed');
      
      throw error;
    }
  }

  async enqueueResponse(responseId) {
    try {
      const response = await dbClient.getResponseById(responseId);
      if (!response) {
        throw new Error(`Response ${responseId} not found`);
      }

      const task = {
        response_id: response._id,
        batch_id: response.batch_id,
        agent_id: response.agent_id,
        prompt: response.prompt,
        response_text: response.response_text,
        context: response.context,
        reference: response.reference,
        metadata: response.metadata,
        dimensions: config.DIMENSIONS,
        created_at: new Date().toISOString()
      };

      await redisClient.addTask(task);
      await dbClient.updateResponseStatus(responseId, 'queued');

      console.log(`Successfully enqueued response ${responseId}`);
      return { success: true };

    } catch (error) {
      console.error(`Failed to enqueue response ${responseId}:`, error);
      throw error;
    }
  }

  async requeueFailedResponse(responseId, reason = 'retry') {
    try {
      const response = await dbClient.getResponseById(responseId);
      if (!response) {
        throw new Error(`Response ${responseId} not found`);
      }

      const task = {
        response_id: response._id,
        batch_id: response.batch_id,
        agent_id: response.agent_id,
        prompt: response.prompt,
        response_text: response.response_text,
        context: response.context,
        reference: response.reference,
        metadata: response.metadata,
        dimensions: config.DIMENSIONS,
        retry_reason: reason,
        created_at: new Date().toISOString()
      };

      const success = await redisClient.requeueTask(task);
      if (success) {
        await dbClient.updateResponseStatus(responseId, 'queued');
        console.log(`Successfully requeued response ${responseId}`);
        return { success: true };
      } else {
        await dbClient.updateResponseStatus(responseId, 'failed');
        console.log(`Failed to requeue response ${responseId} - max retries exceeded`);
        return { success: false, reason: 'max_retries_exceeded' };
      }

    } catch (error) {
      console.error(`Failed to requeue response ${responseId}:`, error);
      throw error;
    }
  }

  async getQueueStatus() {
    try {
      const stats = await redisClient.getQueueStats();
      return {
        queue_length: stats.queue_length,
        active_workers: stats.active_workers,
        worker_statuses: stats.worker_statuses
      };
    } catch (error) {
      console.error('Failed to get queue status:', error);
      return {
        queue_length: 0,
        active_workers: 0,
        worker_statuses: {}
      };
    }
  }

  async clearQueue() {
    try {
      // Clear main queue
      const mainCleared = await redisClient.clearQueue(config.MAIN_QUEUE_NAME);
      
      // Clear dimension queues
      let dimensionCleared = 0;
      for (const dimension of config.DIMENSIONS) {
        const queueName = `${config.DIMENSION_QUEUE_PREFIX}:${dimension}`;
        dimensionCleared += await redisClient.clearQueue(queueName);
      }
      
      // Clear results queue
      const resultsCleared = await redisClient.clearQueue(config.RESULTS_QUEUE_NAME);
      
      const totalCleared = mainCleared + dimensionCleared + resultsCleared;
      console.log(`Cleared all queues: ${totalCleared} items removed`);
      return { success: true, cleared: totalCleared };
    } catch (error) {
      console.error('Failed to clear queues:', error);
      throw error;
    }
  }

  async pauseProcessing(batchId) {
    try {
      await dbClient.updateBatchStatus(batchId, 'paused');
      console.log(`Paused processing for batch ${batchId}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to pause batch ${batchId}:`, error);
      throw error;
    }
  }

  async resumeProcessing(batchId) {
    try {
      await dbClient.updateBatchStatus(batchId, 'processing');
      console.log(`Resumed processing for batch ${batchId}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to resume batch ${batchId}:`, error);
      throw error;
    }
  }

  async getBatchQueueInfo(batchId) {
    try {
      const batchProgress = await dbClient.getBatchProgress(batchId);
      const queueStatus = await this.getQueueStatus();
      
      return {
        batch_id: batchId,
        progress: batchProgress,
        queue_length: queueStatus.queue_length,
        estimated_completion_minutes: this.estimateCompletionTime(
          batchProgress.pending + batchProgress.processing,
          queueStatus.active_workers
        )
      };
    } catch (error) {
      console.error(`Failed to get batch queue info for ${batchId}:`, error);
      throw error;
    }
  }

  estimateCompletionTime(remainingTasks, activeWorkers) {
    if (activeWorkers === 0) return null;
    
    // Assume each worker can process 1 task per minute (conservative estimate)
    const tasksPerMinute = activeWorkers * 1;
    const estimatedMinutes = Math.ceil(remainingTasks / tasksPerMinute);
    
    return estimatedMinutes;
  }

  async retryFailedTasks(batchId, limit = 100) {
    try {
      const db = await dbClient.connect();
      const failedResponses = await db.collection('responses')
        .find({ 
          batch_id: batchId, 
          status: 'failed' 
        })
        .limit(limit)
        .toArray();

      let retriedCount = 0;
      for (const response of failedResponses) {
        try {
          await this.requeueFailedResponse(response._id, 'manual_retry');
          retriedCount++;
        } catch (error) {
          console.error(`Failed to retry response ${response._id}:`, error);
        }
      }

      console.log(`Retried ${retriedCount} failed tasks for batch ${batchId}`);
      return { success: true, retried: retriedCount, total_failed: failedResponses.length };

    } catch (error) {
      console.error(`Failed to retry failed tasks for batch ${batchId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
const taskEnqueue = new TaskEnqueue();

module.exports = taskEnqueue;