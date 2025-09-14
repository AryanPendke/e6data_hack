const express = require('express');
const dbClient = require('../db/dbClient');
const redisClient = require('../queue/redisClient');
const taskEnqueue = require('../queue/enqueue');
const config = require('../config');

const router = express.Router();

/**
 * GET /api/status/batch/:batchId
 * Get status of a single batch
 */
router.get('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;

    const batch = await dbClient.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    const progress = await dbClient.getBatchProgress(batchId);
    const queueInfo = await taskEnqueue.getBatchQueueInfo(batchId);
    const queueStatus = await taskEnqueue.getQueueStatus();

    const completionPercentage = progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

    const remainingTasks = progress.pending + progress.processing;
    const estimatedMinutes = remainingTasks > 0 && queueStatus.active_workers > 0
      ? Math.ceil(remainingTasks / queueStatus.active_workers)
      : null;

    res.json({
      success: true,
      batch_id: batchId,
      status: {
        current_status: batch.status,
        progress: {
          total: progress.total,
          completed: progress.completed,
          processing: progress.processing,
          pending: progress.pending,
          failed: progress.failed,
          completion_percentage: completionPercentage
        },
        timing: {
          created_at: batch.created_at,
          updated_at: batch.updated_at,
          estimated_completion_minutes: estimatedMinutes,
          started_processing: progress.processing > 0 || progress.completed > 0
        },
        queue_info: {
          position_in_queue: queueInfo.queue_length,
          active_workers: queueStatus.active_workers
        }
      }
    });
  } catch (error) {
    console.error('Get batch status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch batch status', details: error.message });
  }
});

/**
 * GET /api/status/batches
 * Get status of all batches (paginated)
 */
router.get('/batches', async (req, res) => {
  try {
    const { status = null, limit = 50, page = 1 } = req.query;
    const db = await dbClient.connect();

    const query = {};
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const batches = await db.collection('batches')
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const batchStatuses = await Promise.all(
      batches.map(async (batch) => {
        const progress = await dbClient.getBatchProgress(batch.batch_id);
        const completionPercentage = progress.total > 0
          ? Math.round((progress.completed / progress.total) * 100)
          : 0;

        return {
          batch_id: batch.batch_id,
          status: batch.status,
          created_at: batch.created_at,
          updated_at: batch.updated_at,
          total_responses: batch.total_responses,
          agent_count: batch.agent_count,
          progress: {
            completed: progress.completed,
            total: progress.total,
            completion_percentage: completionPercentage
          }
        };
      })
    );

    const totalCount = await db.collection('batches').countDocuments(query);

    res.json({
      success: true,
      batches: batchStatuses,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalCount / parseInt(limit)),
        total_batches: totalCount,
        batches_per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get all batches status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch batches status', details: error.message });
  }
});

/**
 * GET /api/status/system
 * Get overall system status
 */
router.get('/system', async (req, res) => {
  try {
    const healthChecks = { database: false, redis: false, queue_accessible: false };

    try {
      await dbClient.connect();
      healthChecks.database = true;
    } catch (e) {
      console.error('Database health check failed:', e);
    }

    try {
      healthChecks.redis = await redisClient.ping();
    } catch (e) {
      console.error('Redis health check failed:', e);
    }

    try {
      await redisClient.getQueueStats();
      healthChecks.queue_accessible = true;
    } catch (e) {
      console.error('Queue health check failed:', e);
    }

    const db = await dbClient.connect();

    const systemStats = await db.collection('batches').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    const batchStats = { total: 0, processing: 0, completed: 0, failed: 0, pending: 0 };
    systemStats.forEach(stat => { batchStats[stat._id] = stat.count; batchStats.total += stat.count; });

    const queueStats = await redisClient.getQueueStats();

    const responseStats = await db.collection('responses').aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    const responseStatsSummary = { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
    responseStats.forEach(stat => { responseStatsSummary[stat._id] = stat.count; responseStatsSummary.total += stat.count; });

    res.json({
      success: true,
      system_status: {
        overall_health: Object.values(healthChecks).every(Boolean) ? 'healthy' : 'degraded',
        health_checks: healthChecks,
        uptime_seconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      },
      statistics: {
        batches: batchStats,
        responses: responseStatsSummary,
        queue: {
          pending_tasks: queueStats.queue_length || 0,
          active_workers: queueStats.active_workers || 0
        }
      },
      performance: {
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage()
      }
    });
  } catch (error) {
    console.error('Get system status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch system status', details: error.message });
  }
});

/**
 * GET /api/status/workers
 * Get current worker statuses
 */
router.get('/workers', async (req, res) => {
  try {
    const workerStatuses = await redisClient.getAllWorkerStatuses();
    const queueStats = await redisClient.getQueueStats();

    const workers = Object.entries(workerStatuses).map(([workerId, status]) => ({
      worker_id: workerId,
      status: status?.status || 'unknown',
      last_updated: status?.last_updated || null,
      is_active: status && new Date() - new Date(status.last_updated) < 120000
    }));

    const workerSummary = {
      total: workers.length,
      active: workers.filter(w => w.is_active).length,
      idle: workers.filter(w => w.is_active && w.status === 'idle').length,
      processing: workers.filter(w => w.is_active && w.status === 'processing').length,
      offline: workers.filter(w => !w.is_active).length
    };

    res.json({
      success: true,
      workers,
      summary: workerSummary,
      queue_info: {
        pending_tasks: queueStats.queue_length || 0,
        estimated_processing_time: workerSummary.active > 0
          ? Math.ceil((queueStats.queue_length || 0) / workerSummary.active)
          : null
      }
    });
  } catch (error) {
    console.error('Get workers status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch workers status', details: error.message });
  }
});

/**
 * POST /api/status/batch/:batchId/pause
 */
router.post('/batch/:batchId/pause', async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await dbClient.getBatchById(batchId);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    if (batch.status !== 'processing')
      return res.status(400).json({ success: false, error: 'Can only pause processing batches', current_status: batch.status });

    await taskEnqueue.pauseProcessing(batchId);
    res.json({ success: true, message: `Batch ${batchId} paused successfully`, new_status: 'paused' });
  } catch (error) {
    console.error('Pause batch error:', error);
    res.status(500).json({ success: false, error: 'Failed to pause batch', details: error.message });
  }
});

/**
 * POST /api/status/batch/:batchId/resume
 */
router.post('/batch/:batchId/resume', async (req, res) => {
  try {
    const { batchId } = req.params;
    const batch = await dbClient.getBatchById(batchId);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    if (batch.status !== 'paused')
      return res.status(400).json({ success: false, error: 'Can only resume paused batches', current_status: batch.status });

    await taskEnqueue.resumeProcessing(batchId);
    res.json({ success: true, message: `Batch ${batchId} resumed successfully`, new_status: 'processing' });
  } catch (error) {
    console.error('Resume batch error:', error);
    res.status(500).json({ success: false, error: 'Failed to resume batch', details: error.message });
  }
});

/**
 * GET /api/status/response/:responseId
 * Get individual response status
 */
router.get('/response/:responseId', async (req, res) => {
  try {
    const { responseId } = req.params;
    const response = await dbClient.getResponseById(responseId);
    if (!response) return res.status(404).json({ success: false, error: 'Response not found' });

    let evaluation = null;
    if (response.status === 'completed')
      evaluation = await dbClient.getEvaluationByResponseId(responseId);

    res.json({
      success: true,
      response_id: responseId,
      status: {
        current_status: response.status,
        batch_id: response.batch_id,
        agent_id: response.agent_id,
        created_at: response.created_at,
        updated_at: response.updated_at,
        has_evaluation: evaluation !== null
      },
      evaluation: evaluation ? {
        scores: evaluation.scores,
        final_score: evaluation.final_score,
        processing_time_ms: evaluation.processing_time_ms,
        processed_at: evaluation.processed_at,
        errors: evaluation.processing_errors || []
      } : null
    });
  } catch (error) {
    console.error('Get response status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch response status', details: error.message });
  }
});

module.exports = router;
