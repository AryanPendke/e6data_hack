const { MongoClient, ObjectId } = require('mongodb');
const config = require('../config');

class DatabaseClient {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (!this.isConnected) {
        this.client = new MongoClient(config.MONGODB_URI, {
          useUnifiedTopology: true,
        });
        
        await this.client.connect();
        this.db = this.client.db(config.DB_NAME);
        this.isConnected = true;
        
        // Create indexes for better performance
        await this.createIndexes();
        
        console.log('Connected to MongoDB successfully');
      }
      return this.db;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      const collections = {
        responses: this.db.collection('responses'),
        evaluations: this.db.collection('evaluations'),
        agents: this.db.collection('agents'),
        batches: this.db.collection('batches')
      };

      // Responses collection indexes
      await collections.responses.createIndex({ agent_id: 1 });
      await collections.responses.createIndex({ batch_id: 1 });
      await collections.responses.createIndex({ status: 1 });
      await collections.responses.createIndex({ created_at: -1 });

      // Evaluations collection indexes
      await collections.evaluations.createIndex({ response_id: 1 }, { unique: true });
      await collections.evaluations.createIndex({ agent_id: 1 });
      await collections.evaluations.createIndex({ batch_id: 1 });

      // Agents collection indexes
      await collections.agents.createIndex({ agent_id: 1 }, { unique: true });

      // Batches collection indexes
      await collections.batches.createIndex({ batch_id: 1 }, { unique: true });
      await collections.batches.createIndex({ created_at: -1 });

      console.log('Database indexes created successfully');
    } catch (error) {
      console.error('Error creating indexes:', error);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('Disconnected from MongoDB');
    }
  }

  // Response operations
  async insertResponse(responseData) {
    const db = await this.connect();
    const result = await db.collection('responses').insertOne({
      ...responseData,
      created_at: new Date(),
      updated_at: new Date(),
      status: 'pending'
    });
    return result;
  }

  async insertManyResponses(responsesData) {
    const db = await this.connect();
    const responses = responsesData.map(response => ({
      ...response,
      created_at: new Date(),
      updated_at: new Date(),
      status: 'pending'
    }));
    
    const result = await db.collection('responses').insertMany(responses);
    return result;
  }

  async getResponseById(responseId) {
    const db = await this.connect();
    return await db.collection('responses').findOne({ _id: responseId });
  }

  async getResponsesByBatch(batchId, limit = 100, offset = 0) {
    const db = await this.connect();
    return await db.collection('responses')
      .find({ batch_id: batchId })
      .limit(limit)
      .skip(offset)
      .toArray();
  }

  async updateResponseStatus(responseId, status) {
    const db = await this.connect();
    await db.collection('responses').updateOne(
  { _id: responseId },
  { $set: { status: status, updated_at: new Date() } }
);
  }

  // Evaluation operations
  async insertEvaluation(evaluationData) {
    const db = await this.connect();
    const result = await db.collection('evaluations').insertOne({
      ...evaluationData,
      created_at: new Date()
    });
    return result;
  }

  async getEvaluationByResponseId(responseId) {
    const db = await this.connect();
    return await db.collection('evaluations').findOne({ response_id: responseId });
  }

  async getEvaluationsByBatch(batchId) {
    const db = await this.connect();
    return await db.collection('evaluations')
      .find({ batch_id: batchId })
      .toArray();
  }

  async getEvaluationsByAgent(agentId) {
    const db = await this.connect();
    return await db.collection('evaluations')
      .find({ agent_id: agentId })
      .toArray();
  }

  // Batch operations
  async insertBatch(batchData) {
    const db = await this.connect();
    const result = await db.collection('batches').insertOne({
      ...batchData,
      created_at: new Date(),
      updated_at: new Date()
    });
    return result;
  }

  async getBatchById(batchId) {
    const db = await this.connect();
    return await db.collection('batches').findOne({ batch_id: batchId });
  }

  async updateBatchStatus(batchId, status, progress = null) {
    const db = await this.connect();
    const updateData = { 
      status: status,
      updated_at: new Date()
    };
    if (progress !== null) {
      updateData.progress = progress;
    }
    
    return await db.collection('batches').updateOne(
      { batch_id: batchId },
      { $set: updateData }
    );
  }

  // Agent operations
  async upsertAgent(agentData) {
    const db = await this.connect();
    return await db.collection('agents').updateOne(
      { agent_id: agentData.agent_id },
      { 
        $set: {
          ...agentData,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    );
  }

  // Aggregation operations
  async getAgentLeaderboard(batchId = null) {
    const db = await this.connect();
    const matchStage = batchId ? { batch_id: batchId } : {};
    
    return await db.collection('evaluations').aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$agent_id',
          avg_instruction: { $avg: '$scores.instruction' },
          avg_hallucination: { $avg: '$scores.hallucination' },
          avg_assumption: { $avg: '$scores.assumption' },
          avg_coherence: { $avg: '$scores.coherence' },
          avg_accuracy: { $avg: '$scores.accuracy' },
          total_responses: { $sum: 1 }
        }
      },
      {
        $addFields: {
          final_score: {
            $add: [
              { $multiply: ['$avg_instruction', config.DEFAULT_WEIGHTS.instruction] },
              { $multiply: ['$avg_hallucination', config.DEFAULT_WEIGHTS.hallucination] },
              { $multiply: ['$avg_assumption', config.DEFAULT_WEIGHTS.assumption] },
              { $multiply: ['$avg_coherence', config.DEFAULT_WEIGHTS.coherence] },
              { $multiply: ['$avg_accuracy', config.DEFAULT_WEIGHTS.accuracy] }
            ]
          }
        }
      },
      { $sort: { final_score: -1 } }
    ]).toArray();
  }

  async getBatchProgress(batchId) {
    const db = await this.connect();
    const pipeline = [
      { $match: { batch_id: batchId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ];
    
    const results = await db.collection('responses').aggregate(pipeline).toArray();
    
    const progress = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: 0
    };
    
    results.forEach(result => {
      progress[result._id] = result.count;
      progress.total += result.count;
    });
    
    return progress;
  }
}

// Export singleton instance
const dbClient = new DatabaseClient();

module.exports = dbClient;