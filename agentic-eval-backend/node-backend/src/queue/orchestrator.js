//orchestrator.js

const masterOrchestrator = require('./masterOrchestrator');
const { dimensionWorkerManager } = require('./dimensionWorker');

class WorkerOrchestrator {
  constructor() {
    this.isRunning = false;
    this.workerId = `orchestrator_${Date.now()}`;
  }

  async start() {
    if (this.isRunning) {
      console.log('Worker Orchestrator is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting Worker Orchestrator (ID: ${this.workerId})`);
    
    try {
      // Start the master orchestrator
      console.log('Starting Master Orchestrator...');
      await masterOrchestrator.start();
      
      // Start timeout monitoring for the master
      await masterOrchestrator.startTimeoutMonitoring();
      
      // Start all dimension workers
      console.log('Starting Dimension Workers...');
      await dimensionWorkerManager.startAllWorkers();
      
      // Setup graceful shutdown handlers
      masterOrchestrator.setupGracefulShutdown();
      dimensionWorkerManager.setupGracefulShutdown();
      
      console.log('✅ Worker Orchestrator fully started with Master-Worker pattern');
      
    } catch (error) {
      console.error('Failed to start Worker Orchestrator:', error);
      throw error;
    }
  }

  async stop() {
    console.log('Stopping Worker Orchestrator...');
    this.isRunning = false;
    
    try {
      // Stop dimension workers first
      console.log('Stopping Dimension Workers...');
      await dimensionWorkerManager.stopAllWorkers();
      
      // Stop master orchestrator
      console.log('Stopping Master Orchestrator...');
      await masterOrchestrator.stop();
      
      console.log('✅ Worker Orchestrator stopped');
      
    } catch (error) {
      console.error('Error stopping Worker Orchestrator:', error);
      throw error;
    }
  }

  async getStatus() {
    const masterStatus = await masterOrchestrator.getStatus();
    const workersStatus = await dimensionWorkerManager.getWorkersStatus();
    
    return {
      orchestrator_id: this.workerId,
      is_running: this.isRunning,
      master_orchestrator: masterStatus,
      dimension_workers: workersStatus,
      pattern: 'master_worker',
      total_components: 1 + workersStatus.total_workers // master + dimension workers
    };
  }

  async healthCheck() {
    const masterHealth = await masterOrchestrator.healthCheck();
    const workersHealth = await dimensionWorkerManager.healthCheck();
    
    const overallHealthy = masterHealth.status === 'healthy' && workersHealth.status === 'healthy';
    
    return {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      master_orchestrator: masterHealth,
      dimension_workers: workersHealth,
      timestamp: new Date().toISOString()
    };
  }

  // Method to restart a specific dimension worker
  async restartDimensionWorker(dimension) {
    try {
      console.log(`Restarting ${dimension} worker...`);
      await dimensionWorkerManager.stopWorker(dimension);
      await dimensionWorkerManager.startWorker(dimension);
      console.log(`✅ ${dimension} worker restarted`);
      
      return { success: true, message: `${dimension} worker restarted successfully` };
      
    } catch (error) {
      console.error(`Failed to restart ${dimension} worker:`, error);
      return { success: false, error: error.message };
    }
  }

  // Method to get queue statistics
  async getQueueStatistics() {
    try {
      const stats = await require('./redisClient').getQueueStats();
      return stats;
    } catch (error) {
      console.error('Failed to get queue statistics:', error);
      return {
        main_queue_length: 0,
        results_queue_length: 0,
        dimension_queue_lengths: {},
        active_workers: 0,
        error: error.message
      };
    }
  }

  // Method to clear all queues
  async clearAllQueues() {
    try {
      const result = await require('./enqueue').clearQueue();
      return result;
    } catch (error) {
      console.error('Failed to clear queues:', error);
      throw error;
    }
  }

  // Graceful shutdown handler
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`Worker Orchestrator received ${signal}, starting graceful shutdown...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

// Export singleton instance
const orchestrator = new WorkerOrchestrator();

module.exports = orchestrator;