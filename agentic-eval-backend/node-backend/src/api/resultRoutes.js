const express = require('express');
const dbClient = require('../db/dbClient');
const config = require('../config');

const router = express.Router();

// GET /api/results/batch/:batchId - Get all results for a batch
router.get('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const { 
      page = 1, 
      limit = 100, 
      sort_by = 'final_score', 
      sort_order = 'desc',
      agent_id = null 
    } = req.query;

    const batch = await dbClient.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    const db = await dbClient.connect();
    
    // Build aggregation pipeline
    const pipeline = [
      { $match: { batch_id: batchId } }
    ];

    // Add agent filter if specified
    if (agent_id) {
      pipeline[0].$match.agent_id = agent_id;
    }

    // Add lookup to get response details
    pipeline.push({
      $lookup: {
        from: 'responses',
        localField: 'response_id',
        foreignField: '_id',
        as: 'response'
      }
    });

    // Unwind response array
    pipeline.push({ $unwind: '$response' });

    // Add sorting
    const sortField = sort_by === 'created_at' ? 'created_at' : `scores.${sort_by}` || 'final_score';
    const sortDirection = sort_order === 'asc' ? 1 : -1;
    pipeline.push({ $sort: { [sortField]: sortDirection } });

    // Add pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    // Project final structure
    pipeline.push({
      $project: {
        _id: 1,
        response_id: 1,
        agent_id: 1,
        scores: 1,
        final_score: 1,
        processing_errors: 1,
        processing_time_ms: 1,
        processed_at: 1,
        prompt: '$response.prompt',
        response_text: '$response.response_text',
        context: '$response.context',
        reference: '$response.reference'
      }
    });

    const results = await db.collection('evaluations').aggregate(pipeline).toArray();

    // Get total count for pagination
    const totalCount = await db.collection('evaluations').countDocuments({ 
      batch_id: batchId,
      ...(agent_id && { agent_id })
    });

    res.json({
      success: true,
      batch_id: batchId,
      results,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalCount / parseInt(limit)),
        total_results: totalCount,
        results_per_page: parseInt(limit)
      },
      batch_info: {
        status: batch.status,
        created_at: batch.created_at,
        total_responses: batch.total_responses
      }
    });

  } catch (error) {
    console.error('Get batch results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch results',
      details: error.message
    });
  }
});

// GET /api/results/leaderboard/:batchId - Get agent leaderboard
router.get('/leaderboard/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;

    const batch = await dbClient.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    const leaderboard = await dbClient.getAgentLeaderboard(batchId);

    // Add ranking
    const rankedLeaderboard = leaderboard.map((agent, index) => ({
      rank: index + 1,
      agent_id: agent._id,
      scores: {
        instruction: parseFloat(agent.avg_instruction?.toFixed(3)) || 0,
        hallucination: parseFloat(agent.avg_hallucination?.toFixed(3)) || 0,
        assumption: parseFloat(agent.avg_assumption?.toFixed(3)) || 0,
        coherence: parseFloat(agent.avg_coherence?.toFixed(3)) || 0,
        accuracy: parseFloat(agent.avg_accuracy?.toFixed(3)) || 0
      },
      final_score: parseFloat(agent.final_score?.toFixed(3)) || 0,
      total_responses: agent.total_responses
    }));

    res.json({
      success: true,
      batch_id: batchId,
      leaderboard: rankedLeaderboard,
      summary: {
        total_agents: rankedLeaderboard.length,
        best_agent: rankedLeaderboard[0]?.agent_id || null,
        best_score: rankedLeaderboard[0]?.final_score || 0,
        average_score: rankedLeaderboard.reduce((sum, agent) => sum + agent.final_score, 0) / rankedLeaderboard.length || 0
      }
    });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard',
      details: error.message
    });
  }
});

// GET /api/results/agent/:agentId - Get results for specific agent
router.get('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { batch_id = null } = req.query;

    const evaluations = await dbClient.getEvaluationsByAgent(agentId);
    
    if (evaluations.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No evaluations found for this agent'
      });
    }

    // Filter by batch if specified
    const filteredEvaluations = batch_id ? 
      evaluations.filter(evals=> eval.batch_id === batch_id) : 
      evaluations;

    // Calculate statistics
    const stats = {
      total_responses: filteredEvaluations.length,
      average_scores: {},
      score_distribution: {},
      performance_over_time: []
    };

    // Calculate averages
    config.DIMENSIONS.forEach(dimension => {
      const scores = filteredEvaluations.map(evals=> eval.scores[dimension] || 0);
      stats.average_scores[dimension] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      
      // Score distribution (bins: 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0)
      stats.score_distribution[dimension] = {
        '0.0-0.2': scores.filter(s => s >= 0 && s < 0.2).length,
        '0.2-0.4': scores.filter(s => s >= 0.2 && s < 0.4).length,
        '0.4-0.6': scores.filter(s => s >= 0.4 && s < 0.6).length,
        '0.6-0.8': scores.filter(s => s >= 0.6 && s < 0.8).length,
        '0.8-1.0': scores.filter(s => s >= 0.8 && s <= 1.0).length
      };
    });

    // Performance over time (group by date)
    const performanceByDate = {};
    filteredEvaluations.forEach(evals=> {
      const date = eval.processed_at.toISOString().split('T')[0];
      if (!performanceByDate[date]) {
        performanceByDate[date] = [];
      }
      performanceByDate[date].push(eval.final_score);
    });

    stats.performance_over_time = Object.entries(performanceByDate).map(([date, scores]) => ({
      date,
      average_score: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      response_count: scores.length
    })).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({
      success: true,
      agent_id: agentId,
      statistics: stats,
      recent_evaluations: filteredEvaluations
        .sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at))
        .slice(0, 10) // Last 10 evaluations
    });

  } catch (error) {
    console.error('Get agent results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent results',
      details: error.message
    });
  }
});

// GET /api/results/comparison - Compare multiple agents
router.get('/comparison', async (req, res) => {
  try {
    const { agent_ids, batch_id = null } = req.query;

    if (!agent_ids) {
      return res.status(400).json({
        success: false,
        error: 'agent_ids parameter is required'
      });
    }

    const agentIdList = Array.isArray(agent_ids) ? agent_ids : agent_ids.split(',');

    if (agentIdList.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 agents can be compared at once'
      });
    }

    const db = await dbClient.connect();
    
    // Build match criteria
    const matchCriteria = { agent_id: { $in: agentIdList } };
    if (batch_id) {
      matchCriteria.batch_id = batch_id;
    }

    // Get comparison data
    const comparisonData = await db.collection('evaluations').aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$agent_id',
          avg_instruction: { $avg: '$scores.instruction' },
          avg_hallucination: { $avg: '$scores.hallucination' },
          avg_assumption: { $avg: '$scores.assumption' },
          avg_coherence: { $avg: '$scores.coherence' },
          avg_accuracy: { $avg: '$scores.accuracy' },
          avg_final_score: { $avg: '$final_score' },
          total_responses: { $sum: 1 },
          best_score: { $max: '$final_score' },
          worst_score: { $min: '$final_score' }
        }
      }
    ]).toArray();

    // Format results
    const comparison = comparisonData.map(agent => ({
      agent_id: agent._id,
      scores: {
        instruction: parseFloat(agent.avg_instruction?.toFixed(3)) || 0,
        hallucination: parseFloat(agent.avg_hallucination?.toFixed(3)) || 0,
        assumption: parseFloat(agent.avg_assumption?.toFixed(3)) || 0,
        coherence: parseFloat(agent.avg_coherence?.toFixed(3)) || 0,
        accuracy: parseFloat(agent.avg_accuracy?.toFixed(3)) || 0
      },
      final_score: parseFloat(agent.avg_final_score?.toFixed(3)) || 0,
      total_responses: agent.total_responses,
      best_score: parseFloat(agent.best_score?.toFixed(3)) || 0,
      worst_score: parseFloat(agent.worst_score?.toFixed(3)) || 0
    })).sort((a, b) => b.final_score - a.final_score);

    // Calculate comparative insights
    const insights = {
      best_performer: comparison[0]?.agent_id || null,
      biggest_gap: comparison.length > 1 ? 
        parseFloat((comparison[0].final_score - comparison[comparison.length - 1].final_score).toFixed(3)) : 0,
      dimension_leaders: {}
    };

    // Find dimension leaders
    config.DIMENSIONS.forEach(dimension => {
      const leader = comparison.reduce((best, current) => 
        current.scores[dimension] > (best?.scores[dimension] || 0) ? current : best, null);
      insights.dimension_leaders[dimension] = leader?.agent_id || null;
    });

    res.json({
      success: true,
      comparison,
      insights,
      metadata: {
        compared_agents: agentIdList.length,
        batch_filter: batch_id,
        total_responses: comparison.reduce((sum, agent) => sum + agent.total_responses, 0)
      }
    });

  } catch (error) {
    console.error('Agent comparison error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare agents',
      details: error.message
    });
  }
});

// GET /api/results/export/:batchId - Export results to CSV
router.get('/export/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const { format = 'csv' } = req.query;

    const batch = await dbClient.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    const evaluations = await dbClient.getEvaluationsByBatch(batchId);
    
    if (format === 'csv') {
      // Generate CSV content
      const headers = [
        'response_id', 'agent_id', 'instruction_score', 'hallucination_score', 
        'assumption_score', 'coherence_score', 'accuracy_score', 'final_score',
        'processing_time_ms', 'processed_at', 'has_errors'
      ];

      const csvRows = evaluations.map(evals=> [
        eval.response_id,
        eval.agent_id,
        eval.scores.instruction || 0,
        eval.scores.hallucination || 0,
        eval.scores.assumption || 0,
        eval.scores.coherence || 0,
        eval.scores.accuracy || 0,
        eval.final_score || 0,
        eval.processing_time_ms || 0,
        eval.processed_at?.toISOString() || '',
        eval.processing_errors?.length > 0 ? 'Yes' : 'No'
      ]);

      const csvContent = [headers.join(','), ...csvRows.map(row => row.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="evaluation_results_${batchId}.csv"`);
      res.send(csvContent);

    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="evaluation_results_${batchId}.json"`);
      res.json({
        batch_id: batchId,
        exported_at: new Date().toISOString(),
        results: evaluations
      });

    } else {
      res.status(400).json({
        success: false,
        error: 'Unsupported export format',
        details: 'Supported formats: csv, json'
      });
    }

  } catch (error) {
    console.error('Export results error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export results',
      details: error.message
    });
  }
});

// GET /api/results/analytics/:batchId - Get detailed analytics
router.get('/analytics/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;

    const batch = await dbClient.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    const db = await dbClient.connect();

    // Get comprehensive analytics
    const analytics = await db.collection('evaluations').aggregate([
      { $match: { batch_id: batchId } },
      {
        $group: {
          _id: null,
          total_evaluations: { $sum: 1 },
          avg_scores: {
            $push: {
              instruction: '$scores.instruction',
              hallucination: '$scores.hallucination',
              assumption: '$scores.assumption',
              coherence: '$scores.coherence',
              accuracy: '$scores.accuracy',
              final_score: '$final_score'
            }
          },
          avg_processing_time: { $avg: '$processing_time_ms' },
          error_count: {
            $sum: {
              $cond: [{ $gt: [{ $size: { $ifNull: ['$processing_errors', []] } }, 0] }, 1, 0]
            }
          }
        }
      }
    ]).toArray();

    if (analytics.length === 0) {
      return res.json({
        success: true,
        batch_id: batchId,
        analytics: {
          message: 'No evaluations found for this batch'
        }
      });
    }

    const data = analytics[0];
    
    // Calculate dimension statistics
    const dimensionStats = {};
    config.DIMENSIONS.concat(['final_score']).forEach(dimension => {
      const scores = data.avg_scores.map(s => s[dimension] || 0).filter(s => s > 0);
      if (scores.length > 0) {
        scores.sort((a, b) => a - b);
        dimensionStats[dimension] = {
          mean: scores.reduce((sum, s) => sum + s, 0) / scores.length,
          median: scores[Math.floor(scores.length / 2)],
          min: scores[0],
          max: scores[scores.length - 1],
          std_dev: Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - (scores.reduce((sum, s) => sum + s, 0) / scores.length), 2), 0) / scores.length)
        };
      }
    });

    res.json({
      success: true,
      batch_id: batchId,
      analytics: {
        overview: {
          total_evaluations: data.total_evaluations,
          success_rate: ((data.total_evaluations - data.error_count) / data.total_evaluations * 100).toFixed(1) + '%',
          avg_processing_time_ms: Math.round(data.avg_processing_time || 0),
          errors: data.error_count
        },
        dimension_statistics: dimensionStats,
        batch_info: {
          created_at: batch.created_at,
          status: batch.status,
          total_responses: batch.total_responses
        }
      }
    });

  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      details: error.message
    });
  }
});

module.exports = router;