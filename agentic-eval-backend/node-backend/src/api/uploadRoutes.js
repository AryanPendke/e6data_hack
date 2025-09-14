const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const DataParser = require('../utils/parser');
const dbClient = require('../db/dbClient');
const taskEnqueue = require('../queue/enqueue');
const config = require('../config');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/csv', 'application/json', 'text/plain'];
    const allowedExtensions = ['.csv', '.json', '.txt'];
    
    const fileExtension = '.' + file.originalname.toLowerCase().split('.').pop();
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and JSON files are allowed'), false);
    }
  }
});

// POST /api/upload - Upload and process evaluation data
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
        details: 'Please select a CSV or JSON file to upload'
      });
    }

    const batchId = uuidv4();
    console.log(`Processing upload for batch ${batchId}: ${req.file.originalname}`);

    // Parse the uploaded file
    const parseResult = await DataParser.parseFile(
      req.file.buffer, 
      req.file.originalname, 
      batchId
    );

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error,
        details: parseResult.details
      });
    }

    // Store batch information
    await dbClient.insertBatch(parseResult.batch_summary);

    // Store all responses
    await dbClient.insertManyResponses(parseResult.data);

    // Enqueue tasks for processing
    await taskEnqueue.enqueueBatch(batchId, parseResult.data);

    // Prepare response
    const response = {
      success: true,
      batch_id: batchId,
      summary: {
        filename: req.file.originalname,
        total_responses: parseResult.data.length,
        agents: parseResult.batch_summary.agent_count,
        agent_distribution: parseResult.batch_summary.agents,
        has_context: parseResult.batch_summary.has_context,
        has_reference: parseResult.batch_summary.has_reference,
        processing_status: 'queued'
      },
      parsing_result: parseResult.parsing_result
    };

    console.log(`Successfully queued batch ${batchId} with ${parseResult.data.length} responses`);
    res.json(response);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload processing failed',
      details: error.message
    });
  }
});

// POST /api/upload/validate - Validate file without processing
router.post('/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const tempBatchId = 'validation_' + uuidv4();
    const parseResult = await DataParser.parseFile(
      req.file.buffer, 
      req.file.originalname, 
      tempBatchId
    );

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: parseResult.error,
        details: parseResult.details
      });
    }

    res.json({
      success: true,
      validation: {
        filename: req.file.originalname,
        file_size: req.file.size,
        total_rows: parseResult.parsing_result.stats.total_rows,
        valid_rows: parseResult.parsing_result.stats.valid_rows,
        errors: parseResult.parsing_result.errors,
        warnings: parseResult.parsing_result.warnings,
        preview: parseResult.data.slice(0, 3), // Show first 3 rows as preview
        agent_distribution: parseResult.batch_summary.agents,
        estimated_processing_time: Math.ceil(parseResult.data.length / 10) // rough estimate
      }
    });

  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'File validation failed',
      details: error.message
    });
  }
});

// GET /api/upload/formats - Get supported file formats and examples
router.get('/formats', (req, res) => {
  res.json({
    supported_formats: ['CSV', 'JSON'],
    required_fields: ['prompt', 'agent_id', 'response_text'],
    optional_fields: ['context', 'reference', 'metadata'],
    examples: {
      csv: {
        headers: 'prompt,agent_id,response_text,context,reference',
        sample_row: '"What is AI?","agent_1","Artificial Intelligence is...","AI context","Reference answer"'
      },
      json: {
        structure: 'Array of objects or single object',
        sample: {
          prompt: "What is AI?",
          agent_id: "agent_1",
          response_text: "Artificial Intelligence is...",
          context: "AI context",
          reference: "Reference answer",
          metadata: { task_type: "QA", difficulty: "easy" }
        }
      }
    },
    limits: {
      max_file_size: '50MB',
      max_responses_per_batch: 10000,
      supported_mime_types: ['text/csv', 'application/json', 'text/plain']
    }
  });
});

// POST /api/upload/retry - Retry failed batch processing
router.post('/retry/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;
    const { limit } = req.body;

    const batch = await dbClient.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    const retryResult = await taskEnqueue.retryFailedTasks(batchId, limit);
    
    res.json({
      success: true,
      batch_id: batchId,
      retry_summary: retryResult
    });

  } catch (error) {
    console.error('Retry error:', error);
    res.status(500).json({
      success: false,
      error: 'Retry failed',
      details: error.message
    });
  }
});

// DELETE /api/upload/batch/:batchId - Cancel/delete a batch
router.delete('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params;

    const batch = await dbClient.getBatchById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    // Update batch status to cancelled
    await dbClient.updateBatchStatus(batchId, 'cancelled');

    // Update all pending responses to cancelled
    const db = await dbClient.connect();
    await db.collection('responses').updateMany(
      { batch_id: batchId, status: { $in: ['pending', 'queued'] } },
      { $set: { status: 'cancelled', updated_at: new Date() } }
    );

    res.json({
      success: true,
      message: `Batch ${batchId} cancelled successfully`
    });

  } catch (error) {
    console.error('Cancel batch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel batch',
      details: error.message
    });
  }
});

// POST /api/upload/sample-data - Generate sample data for testing
router.post('/sample-data', async (req, res) => {
  try {
    const { count = 10, agents = 3 } = req.body;
    
    if (count > 100) {
      return res.status(400).json({
        success: false,
        error: 'Sample data count cannot exceed 100'
      });
    }

    const samplePrompts = [
      "What is artificial intelligence?",
      "Explain machine learning in simple terms",
      "How does natural language processing work?",
      "What are the benefits of cloud computing?",
      "Describe the process of software development",
      "What is the difference between AI and ML?",
      "How can businesses use data analytics?",
      "Explain the concept of cybersecurity",
      "What is blockchain technology?",
      "How does the internet work?"
    ];

    const sampleData = [];
    for (let i = 0; i < count; i++) {
      const agentId = `agent_${(i % agents) + 1}`;
      const promptIndex = i % samplePrompts.length;
      
      sampleData.push({
        prompt: samplePrompts[promptIndex],
        agent_id: agentId,
        response_text: `This is a sample response from ${agentId} for prompt ${promptIndex + 1}. The response contains detailed information and explanations relevant to the question asked.`,
        context: `Sample context for ${agentId}`,
        reference: `Reference answer for prompt ${promptIndex + 1}`,
        metadata: {
          task_type: "QA",
          difficulty: ["easy", "medium", "hard"][i % 3],
          source: "sample_generator"
        }
      });
    }

    const batchId = uuidv4();
    
    // Process sample data
    const enhancedData = DataParser.enhanceDataForProcessing(sampleData, batchId);
    const batchSummary = DataParser.generateBatchSummary({ data: sampleData }, batchId);

    // Store in database
    await dbClient.insertBatch(batchSummary);
    await dbClient.insertManyResponses(enhancedData);
    await taskEnqueue.enqueueBatch(batchId, enhancedData);

    res.json({
      success: true,
      batch_id: batchId,
      summary: {
        total_responses: sampleData.length,
        agents: agents,
        processing_status: 'queued'
      },
      message: 'Sample data generated and queued for processing'
    });

  } catch (error) {
    console.error('Sample data generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate sample data',
      details: error.message
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large',
        details: 'File size must be less than 50MB'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Unexpected file',
        details: 'Only one file is allowed'
      });
    }
  }
  
  if (error.message === 'Only CSV and JSON files are allowed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type',
      details: 'Only CSV and JSON files are supported'
    });
  }

  next(error);
});

module.exports = router;