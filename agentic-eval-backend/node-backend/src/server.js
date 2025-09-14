//server.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import configuration and clients
const config = require('./config');
const dbClient = require('./db/dbClient');
const redisClient = require('./queue/redisClient');
const orchestrator = require('./queue/orchestrator');

// Import route handlers
const uploadRoutes = require('./api/uploadRoutes');
const resultRoutes = require('./api/resultRoutes');
const statusRoutes = require('./api/statusRoutes');

class AgenticEvalServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for development
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW,
      max: config.RATE_LIMIT_MAX,
      message: {
        success: false,
        error: 'Too many requests',
        details: 'Rate limit exceeded. Please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Request parsing
    this.app.use(express.json({ limit: config.MAX_FILE_SIZE }));
    this.app.use(express.urlencoded({ extended: true, limit: config.MAX_FILE_SIZE }));

    // Logging
    if (config.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Request metadata
    this.app.use((req, res, next) => {
      req.requestId = require('uuid').v4();
      req.startTime = Date.now();
      
      // Log request start
      console.log(`[${req.requestId}] ${req.method} ${req.path} - Started`);
      
      // Add request ID to response headers
      res.setHeader('X-Request-ID', req.requestId);
      
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint (before other routes)
    this.app.get('/health', async (req, res) => {
      const health = await this.performHealthCheck();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    });

    // API routes
    this.app.use('/api/upload', uploadRoutes);
    this.app.use('/api/results', resultRoutes);
    this.app.use('/api/status', statusRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        service: 'Agentic Evaluation Framework Backend',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          upload: '/api/upload',
          results: '/api/results',
          status: '/api/status',
          health: '/health',
          docs: '/api/docs'
        },
        timestamp: new Date().toISOString()
      });
    });

    // API documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      res.json({
        success: true,
        api_documentation: {
          upload_endpoints: {
            'POST /api/upload/upload': 'Upload CSV/JSON file for evaluation',
            'POST /api/upload/validate': 'Validate file without processing',
            'GET /api/upload/formats': 'Get supported file formats',
            'POST /api/upload/retry/:batchId': 'Retry failed batch processing',
            'DELETE /api/upload/batch/:batchId': 'Cancel/delete a batch',
            'POST /api/upload/sample-data': 'Generate sample data for testing'
          },
          result_endpoints: {
            'GET /api/results/batch/:batchId': 'Get all results for a batch',
            'GET /api/results/leaderboard/:batchId': 'Get agent leaderboard',
            'GET /api/results/agent/:agentId': 'Get results for specific agent',
            'GET /api/results/comparison': 'Compare multiple agents',
            'GET /api/results/export/:batchId': 'Export results to CSV/JSON',
            'GET /api/results/analytics/:batchId': 'Get detailed analytics'
          },
          status_endpoints: {
            'GET /api/status/batch/:batchId': 'Get batch processing status',
            'GET /api/status/batches': 'Get status of all batches',
            'GET /api/status/system': 'Get overall system status',
            'GET /api/status/workers': 'Get worker status information',
            'POST /api/status/batch/:batchId/pause': 'Pause batch processing',
            'POST /api/status/batch/:batchId/resume': 'Resume batch processing',
            'GET /api/status/response/:responseId': 'Get individual response status',
            'GET /api/status/queue': 'Get current queue status',
            'DELETE /api/status/queue/clear': 'Clear the entire queue',
            'GET /api/status/health': 'Simple health check',
            'GET /api/status/stream/:batchId': 'Real-time status updates (SSE)'
          }
        }
      });
    });

    // 404 handler for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        details: `${req.method} ${req.path} is not a valid API endpoint`,
        available_endpoints: '/api/docs'
      });
    });

    // Catch-all for non-API routes
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        details: 'This is a backend API server. Please use /api/* endpoints.',
        api_docs: '/api/docs'
      });
    });
  }

  setupErrorHandling() {
    // Request completion logging
    this.app.use((req, res, next) => {
      const originalSend = res.send;
      res.send = function(data) {
        const duration = Date.now() - req.startTime;
        console.log(`[${req.requestId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
        originalSend.call(this, data);
      };
      next();
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error(`[${req.requestId}] Error:`, error);

      // Handle specific error types
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.message,
          request_id: req.requestId
        });
      }

      if (error.name === 'MongoError' || error.name === 'MongoServerError') {
        return res.status(503).json({
          success: false,
          error: 'Database error',
          details: 'Please try again later',
          request_id: req.requestId
        });
      }

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          error: 'Service unavailable',
          details: 'External service connection failed',
          request_id: req.requestId
        });
      }

      // Generic server error
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: config.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        request_id: req.requestId
      });
    });
  }

  async performHealthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'agentic-eval-backend',
      version: '1.0.0',
      checks: {
        database: { status: 'unknown', message: '' },
        redis: { status: 'unknown', message: '' },
        orchestrator: { status: 'unknown', message: '' }
      }
    };

    // Database health check
    try {
      await dbClient.connect();
      health.checks.database = { status: 'healthy', message: 'Connected successfully' };
    } catch (error) {
      health.checks.database = { status: 'unhealthy', message: error.message };
      health.status = 'degraded';
    }

    // Redis health check
    try {
      const ping = await redisClient.ping();
      health.checks.redis = { 
        status: ping ? 'healthy' : 'unhealthy', 
        message: ping ? 'Connected successfully' : 'Ping failed' 
      };
      if (!ping) health.status = 'degraded';
    } catch (error) {
      health.checks.redis = { status: 'unhealthy', message: error.message };
      health.status = 'degraded';
    }

    // Orchestrator health check
    try {
      const orchestratorStatus = await orchestrator.getStatus();
      health.checks.orchestrator = { 
        status: orchestratorStatus.is_running ? 'healthy' : 'stopped',
        message: `Running: ${orchestratorStatus.is_running}, Tasks: ${orchestratorStatus.running_tasks}/${orchestratorStatus.max_concurrent_tasks}`
      };
      if (!orchestratorStatus.is_running) health.status = 'degraded';
    } catch (error) {
      health.checks.orchestrator = { status: 'unhealthy', message: error.message };
      health.status = 'degraded';
    }

    return health;
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      console.log(`\n[${signal}] Graceful shutdown initiated...`);

      // Stop accepting new requests
      if (this.server) {
        this.server.close(async () => {
          console.log('HTTP server closed');

          try {
            // Stop orchestrator
            console.log('Stopping orchestrator...');
            await orchestrator.stop();

            // Close database connection
            console.log('Closing database connection...');
            await dbClient.disconnect();

            // Close Redis connection
            console.log('Closing Redis connection...');
            await redisClient.disconnect();

            console.log('Graceful shutdown completed');
            process.exit(0);

          } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
          }
        });

        // Force shutdown after 30 seconds
        setTimeout(() => {
          console.error('Force shutdown after timeout');
          process.exit(1);
        }, 30000);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }

  async start() {
    try {
      console.log('Starting Agentic Evaluation Backend...');

      // Initialize database connection
      console.log('Connecting to database...');
      await dbClient.connect();

      // Initialize Redis connection
      console.log('Connecting to Redis...');
      await redisClient.connect();

      // Start orchestrator
      console.log('Starting task orchestrator...');
      await orchestrator.start();

      // Start HTTP server
      this.server = this.app.listen(config.PORT, () => {
        console.log('');
        console.log('🚀 Agentic Evaluation Backend Started Successfully!');
        console.log('='.repeat(50));
        console.log(`🌐 Server running on: http://localhost:${config.PORT}`);
        console.log(`📖 API Documentation: http://localhost:${config.PORT}/api/docs`);
        console.log(`❤️  Health Check: http://localhost:${config.PORT}/health`);
        console.log(`🔧 Environment: ${config.NODE_ENV}`);
        console.log(`📊 Database: ${config.DB_NAME}`);
        console.log(`⚡ Redis: ${config.REDIS_HOST}:${config.REDIS_PORT}`);
        console.log(`🏗️  Architecture: Master-Worker Pattern`);
        console.log(`👥 Workers: 1 Master + ${config.DIMENSIONS.length} Dimension Workers`);
        console.log(`📋 Dimensions: ${config.DIMENSIONS.join(', ')}`);
        console.log('='.repeat(50));
        console.log('Ready to process evaluation requests!');
        console.log('');
      });

      // Handle server errors
      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${config.PORT} is already in use`);
          process.exit(1);
        } else {
          console.error('Server error:', error);
          process.exit(1);
        }
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new AgenticEvalServer();
  server.start().catch(console.error);
}

module.exports = AgenticEvalServer;