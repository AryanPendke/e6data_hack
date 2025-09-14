//dimensionWorker.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const redisClient = require('./redisClient');
const dbClient = require('../db/dbClient');
const config = require('../config');

class DimensionWorker {
  constructor(dimension) {
    this.dimension = dimension;
    this.workerId = `${dimension}_worker_${Date.now()}`;
    this.isRunning = false;
    this.pythonPath = path.resolve(__dirname, '../../../python-workers');
    this.workerScript = `${dimension}_worker.py`;
    this.processingCount = 0;
    this.pythonExecutable = null;
  }

  /**
   * Find Python executable dynamically
   */
  findPythonExecutable() {
    if (this.pythonExecutable) {
      return this.pythonExecutable;
    }

    // Put simple commands first since they're most likely to work
    const possiblePaths = [
      'python',  // This is what your system uses
      'python3',
      'py',
      // Then try the full paths
      'C:\\Users\\acppe\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
      '/usr/bin/python3',
      '/usr/bin/python',
      '/usr/local/bin/python3',
      '/usr/local/bin/python',
      // Windows paths
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Python313\\python.exe',
      // Common Windows Python paths
      process.env.PYTHON_PATH,
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python39', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    ].filter(Boolean);

    for (const pythonPath of possiblePaths) {
      try {
        // Test if python executable exists and works
        if (this.testPythonExecutable(pythonPath)) {
          console.log(`Found working Python executable: ${pythonPath}`);
          this.pythonExecutable = pythonPath;
          return pythonPath;
        }
      } catch (error) {
        continue;
      }
    }

    // If no Python found, throw error with helpful message
    throw new Error(`No working Python executable found. Tried paths: ${possiblePaths.join(', ')}. Please install Python or set PYTHON_PATH environment variable.`);
  }

  /**
   * Test if a Python executable works
   */
  testPythonExecutable(pythonPath) {
    try {
      const { execSync } = require('child_process');
      
      console.log(`Testing Python executable: "${pythonPath}"`);
      
      // Try without quotes first for simple commands like 'python'
      let command;
      if (pythonPath.includes('\\') || pythonPath.includes(' ')) {
        command = `"${pythonPath}" --version`;
      } else {
        command = `${pythonPath} --version`;
      }
      
      const result = execSync(command, { 
        timeout: 5000,
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      const output = result.toString().trim();
      console.log(`Python test result: ${output}`);
      
      const isValid = output.toLowerCase().includes('python');
      console.log(`Python path ${pythonPath} is ${isValid ? 'valid' : 'invalid'}`);
      
      return isValid;
      
    } catch (error) {
      console.log(`Python path test failed for ${pythonPath}: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify Python worker script exists and has required dependencies
   */
  async verifyWorkerScript() {
    const workerPath = path.join(this.pythonPath, this.workerScript);
    
    if (!fs.existsSync(workerPath)) {
      throw new Error(`Python worker script not found: ${workerPath}`);
    }

    // Check if shared utilities exist
    const sharedPath = path.join(this.pythonPath, 'shared');
    if (!fs.existsSync(sharedPath)) {
      throw new Error(`Shared utilities directory not found: ${sharedPath}`);
    }

    const utilsPath = path.join(sharedPath, 'utils.py');
    const modelLoaderPath = path.join(sharedPath, 'model_loader.py');
    
    if (!fs.existsSync(utilsPath)) {
      throw new Error(`Shared utils.py not found: ${utilsPath}`);
    }
    
    if (!fs.existsSync(modelLoaderPath)) {
      throw new Error(`Shared model_loader.py not found: ${modelLoaderPath}`);
    }

    return true;
  }

  async start() {
    if (this.isRunning) {
      console.log(`${this.dimension} worker is already running`);
      return;
    }

    try {
      // Find Python executable
      this.findPythonExecutable();
      
      // Verify worker script exists
      await this.verifyWorkerScript();

      this.isRunning = true;
      console.log(`Starting ${this.dimension} worker (ID: ${this.workerId}) with Python: ${this.pythonExecutable}`);
      
      await redisClient.setWorkerStatus(this.workerId, 'active');
      
      // Start the processing loop for this dimension
      this.processLoop();

    } catch (error) {
      console.error(`Failed to start ${this.dimension} worker:`, error.message);
      throw error;
    }
  }

  async stop() {
    console.log(`Stopping ${this.dimension} worker...`);
    this.isRunning = false;
    
    // Wait for current processing to complete
    while (this.processingCount > 0) {
      console.log(`${this.dimension} worker waiting for ${this.processingCount} tasks to complete...`);
      await this.sleep(1000);
    }
    
    await redisClient.setWorkerStatus(this.workerId, 'stopped');
    console.log(`${this.dimension} worker stopped`);
  }

  async processLoop() {
    while (this.isRunning) {
      try {
        // Get a task from this dimension's queue
        const task = await redisClient.getDimensionTask(this.dimension, 30); // 30 second timeout
        
        if (task) {
          this.processTask(task);
        } else {
          // No tasks available, update status and wait
          await redisClient.setWorkerStatus(this.workerId, 'idle');
          await this.sleep(1000);
        }

      } catch (error) {
        console.error(`Error in ${this.dimension} worker process loop:`, error);
        await this.sleep(5000); // Wait 5 seconds before retrying
      }
    }
  }

  async processTask(task) {
    this.processingCount++;
    const startTime = Date.now();

    try {
      await redisClient.setWorkerStatus(this.workerId, 'processing');
      console.log(`${this.dimension} worker processing task ${task.task_id} for response ${task.response_id}`);

      // Run the Python worker script
      const result = await this.runPythonWorker(task);
      
      // Send result back to master orchestrator
      const resultData = {
        task_id: task.task_id,
        dimension: this.dimension,
        response_id: task.response_id,
        batch_id: task.batch_id,
        agent_id: task.agent_id,
        score: result.score,
        details: result.details,
        processing_time_ms: Date.now() - startTime,
        worker_id: this.workerId
      };

      await redisClient.pushDimensionResult(resultData);

      console.log(`${this.dimension} worker completed task ${task.task_id}: score=${result.score.toFixed(3)}`);

    } catch (error) {
      console.error(`${this.dimension} worker failed to process task ${task.task_id}:`, error);
      
      // Send error result back to master
      const errorResult = {
        task_id: task.task_id,
        dimension: this.dimension,
        response_id: task.response_id,
        batch_id: task.batch_id,
        agent_id: task.agent_id,
        score: 0.0,
        details: {},
        error: error.message,
        processing_time_ms: Date.now() - startTime,
        worker_id: this.workerId
      };

      await redisClient.pushDimensionResult(errorResult);

    } finally {
      this.processingCount--;
    }
  }

  async runPythonWorker(task) {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(this.pythonPath, this.workerScript);

      // Prepare input data for the Python worker
      const inputData = {
        response_id: task.response_id,
        prompt: task.prompt,
        response_text: task.response_text,
        context: task.context || '',
        reference: task.reference || '',
        metadata: task.metadata || {}
      };

      // Use the dynamically found Python executable
      const pythonExe = this.pythonExecutable;
      
      console.log(`Spawning Python worker: ${pythonExe} ${workerPath}`);

      const worker = spawn(pythonExe, [workerPath], {
        cwd: this.pythonPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONPATH: this.pythonPath,
          PYTHONUNBUFFERED: '1'
        }
      });

      let stdout = '';
      let stderr = '';

      worker.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      worker.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log stderr for debugging but don't treat as error
        console.log(`[${this.dimension} worker stderr]:`, data.toString().trim());
      });

      worker.on('close', (code) => {
        console.log(`${this.dimension} worker process closed with code ${code}`);
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            if (typeof result.score === 'number' && result.score >= 0 && result.score <= 1) {
              resolve({
                score: result.score,
                details: result.details || {}
              });
            } else {
              reject(new Error(`Invalid score format from ${this.dimension} worker: ${stdout}`));
            }
          } catch (error) {
            console.error(`Failed to parse ${this.dimension} worker output:`, stdout);
            console.error(`Stderr:`, stderr);
            reject(new Error(`Failed to parse ${this.dimension} worker output: ${error.message}`));
          }
        } else {
          reject(new Error(`${this.dimension} worker exited with code ${code}. Stderr: ${stderr}. Stdout: ${stdout}`));
        }
      });

      worker.on('error', (error) => {
        console.error(`Failed to spawn ${this.dimension} worker:`, error);
        reject(new Error(`Failed to spawn ${this.dimension} worker: ${error.message}`));
      });

      // Send input data to worker
      try {
        const inputJson = JSON.stringify(inputData);
        console.log(`Sending input to ${this.dimension} worker:`, inputJson.substring(0, 200) + '...');
        worker.stdin.write(inputJson);
        worker.stdin.end();
      } catch (error) {
        reject(new Error(`Failed to send input to ${this.dimension} worker: ${error.message}`));
      }

      // Set timeout for worker execution
      const timeout = setTimeout(() => {
        worker.kill('SIGTERM');
        reject(new Error(`${this.dimension} worker timed out after 2 minutes`));
      }, 120000); // 2 minute timeout

      worker.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  async getStatus() {
    return {
      worker_id: this.workerId,
      dimension: this.dimension,
      is_running: this.isRunning,
      processing_count: this.processingCount,
      python_path: this.pythonPath,
      python_executable: this.pythonExecutable,
      worker_script: this.workerScript
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Health check for this dimension worker
  async healthCheck() {
    const checks = {
      redis: false,
      python_executable: false,
      python_script: false,
      dimension_queue: 0
    };

    try {
      // Check Redis connection
      checks.redis = await redisClient.ping();
      
      // Check Python executable
      if (this.pythonExecutable) {
        checks.python_executable = this.testPythonExecutable(this.pythonExecutable);
      } else {
        try {
          this.findPythonExecutable();
          checks.python_executable = true;
        } catch (error) {
          checks.python_executable = false;
        }
      }
      
      // Check if Python script exists
      const workerPath = path.join(this.pythonPath, this.workerScript);
      checks.python_script = fs.existsSync(workerPath);
      
      // Check dimension queue length
      const queueName = `${config.DIMENSION_QUEUE_PREFIX}:${this.dimension}`;
      checks.dimension_queue = await redisClient.getQueueLength(queueName);

    } catch (error) {
      console.error(`${this.dimension} worker health check error:`, error);
    }

    return {
      status: checks.redis && checks.python_executable && checks.python_script ? 'healthy' : 'unhealthy',
      checks,
      python_executable: this.pythonExecutable,
      timestamp: new Date().toISOString()
    };
  }
}

class DimensionWorkerManager {
  constructor() {
    this.workers = new Map();
    this.isRunning = false;
  }

  async startAllWorkers() {
    if (this.isRunning) {
      console.log('Dimension workers are already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting all dimension workers...');

    // Start a worker for each dimension
    const workerPromises = [];
    for (const dimension of config.DIMENSIONS) {
      const worker = new DimensionWorker(dimension);
      this.workers.set(dimension, worker);
      workerPromises.push(worker.start().catch(error => {
        console.error(`Failed to start ${dimension} worker:`, error.message);
        // Don't let one worker failure stop others
        return null;
      }));
    }

    await Promise.allSettled(workerPromises);

    const successfulWorkers = Array.from(this.workers.values()).filter(worker => worker.isRunning).length;
    console.log(`Started ${successfulWorkers}/${this.workers.size} dimension workers`);
  }

  async stopAllWorkers() {
    console.log('Stopping all dimension workers...');
    this.isRunning = false;

    // Stop all workers
    const stopPromises = Array.from(this.workers.values()).map(worker => worker.stop());
    await Promise.all(stopPromises);

    this.workers.clear();
    console.log('All dimension workers stopped');
  }

  async getWorkersStatus() {
    const status = {};
    
    for (const [dimension, worker] of this.workers) {
      status[dimension] = await worker.getStatus();
    }

    return {
      manager_running: this.isRunning,
      workers: status,
      total_workers: this.workers.size
    };
  }

  async healthCheck() {
    const checks = {};
    
    for (const [dimension, worker] of this.workers) {
      checks[dimension] = await worker.healthCheck();
    }

    const allHealthy = Object.values(checks).every(check => check.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      dimension_checks: checks,
      manager_running: this.isRunning,
      timestamp: new Date().toISOString()
    };
  }

  // Start a specific dimension worker
  async startWorker(dimension) {
    if (!config.DIMENSIONS.includes(dimension)) {
      throw new Error(`Invalid dimension: ${dimension}`);
    }

    if (this.workers.has(dimension)) {
      console.log(`${dimension} worker is already running`);
      return;
    }

    const worker = new DimensionWorker(dimension);
    this.workers.set(dimension, worker);
    await worker.start();
    
    console.log(`Started ${dimension} worker`);
  }

  // Stop a specific dimension worker
  async stopWorker(dimension) {
    const worker = this.workers.get(dimension);
    if (!worker) {
      console.log(`${dimension} worker is not running`);
      return;
    }

    await worker.stop();
    this.workers.delete(dimension);
    
    console.log(`Stopped ${dimension} worker`);
  }

  // Graceful shutdown handler
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`Dimension Worker Manager received ${signal}, starting graceful shutdown...`);
      await this.stopAllWorkers();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

// Export singleton instance
const dimensionWorkerManager = new DimensionWorkerManager();

module.exports = { DimensionWorker, dimensionWorkerManager };