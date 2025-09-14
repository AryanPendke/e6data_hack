# Agentic Evaluation Framework

A scalable backend system for evaluating AI agent responses across 5 dimensions using a master-worker architecture with Redis queues and MongoDB storage.

## Overview

Evaluates AI responses on:
- **Accuracy**: Factual correctness against reference answers
- **Coherence**: Logical flow and readability
- **Hallucination**: Detection of unsupported claims
- **Assumption**: Identification of unwarranted assumptions
- **Instruction Following**: Compliance with prompt requirements

## Architecture

```
Upload → Redis Queue → Master Orchestrator → 5 Dimension Workers → Results Collection → MongoDB
```

- **Node.js Backend**: REST API with Express
- **Python Workers**: ML-based evaluation engines
- **Redis**: Task queue management
- **MongoDB**: Data persistence

## Quick Start

### Prerequisites

- Node.js 14+
- Python 3.x
- MongoDB
- Redis
- Docker (optional)

### Installation

1. **Clone and install dependencies**
```bash
git clone <repository>
cd agentic-eval-backend
npm install
pip install -r python-workers/requirements.txt
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your database URLs
```

3. **Start services**
```bash
# Start MongoDB and Redis
sudo systemctl start mongodb redis

# Start the application
npm start
```

**OR use Docker:**
```bash
docker-compose up -d
```

4. **Verify installation**
```bash
curl http://localhost:3001/api/status/system
```

## Usage

### 1. Prepare Data

Create JSON file with evaluation data:
```json
[
  {
    "prompt": "Explain machine learning in simple terms.",
    "agent_id": "gpt-4",
    "response_text": "Machine learning allows computers to learn patterns from data...",
    "context": "Educational explanation for beginners",
    "reference": "ML enables automated learning from data patterns."
  }
]
```

### 2. Upload and Process

```bash
# Validate data format
curl -X POST http://localhost:3001/api/upload/validate \
  -H "Content-Type: application/json" \
  -d @evaluation_data.json

# Upload for evaluation
curl -X POST http://localhost:3001/api/upload/upload \
  -H "Content-Type: application/json" \
  -d @evaluation_data.json
```

### 3. Monitor Progress

```bash
# Check batch status
curl http://localhost:3001/api/status/batch/{batch_id}

# Real-time updates via Server-Sent Events
curl http://localhost:3001/api/status/stream/{batch_id}
```

### 4. Retrieve Results

```bash
# Get detailed results
curl http://localhost:3001/api/results/batch/{batch_id}

# Get agent rankings
curl http://localhost:3001/api/results/leaderboard/{batch_id}

# Export results
curl http://localhost:3001/api/results/export/{batch_id}
```

## API Endpoints

### Upload
- `POST /api/upload/validate` - Validate data format
- `POST /api/upload/upload` - Upload for processing
- `GET /api/upload/formats` - Get supported formats

### Status
- `GET /api/status/system` - System health
- `GET /api/status/batch/:id` - Batch progress
- `GET /api/status/workers` - Worker status
- `GET /api/status/stream/:id` - Real-time updates

### Results
- `GET /api/results/batch/:id` - All batch results
- `GET /api/results/leaderboard/:id` - Agent rankings
- `GET /api/results/agent/:id` - Individual agent performance
- `GET /api/results/export/:id` - Export results

## Data Format

### Required Fields
- `prompt`: Question or instruction given to agent
- `agent_id`: Identifier for the AI agent
- `response_text`: Agent's response to evaluate

### Optional Fields
- `context`: Background information for evaluation
- `reference`: Reference answer for accuracy comparison
- `metadata`: Additional structured data

### Example Response
```json
{
  "agent_id": "gpt-4",
  "scores": {
    "instruction": 0.85,
    "hallucination": 0.90,
    "assumption": 0.95,
    "coherence": 0.80,
    "accuracy": 0.75
  },
  "final_score": 0.835,
  "processing_time_ms": 245
}
```

## Configuration

Key environment variables in `.env`:

```bash
# Database connections
MONGODB_URI=mongodb://localhost:27017/agentic_eval
REDIS_URL=redis://localhost:6379

# Server settings
PORT=3001
NODE_ENV=production

# Processing configuration
MAX_CONCURRENT_WORKERS=6
BATCH_SIZE=100
PROCESSING_TIMEOUT=30000

# Python executable path
PYTHON_EXECUTABLE_PATH=/usr/bin/python3
```

## Evaluation Dimensions

### Accuracy (Word overlap + N-gram + Fact extraction)
- Compares response against reference answer
- Extracts key facts using regex patterns
- Jaccard similarity for vocabulary overlap

### Coherence (Flow + Transitions + Repetition)
- Analyzes sentence connectivity
- Detects transition words and logical flow
- Penalizes excessive repetition

### Hallucination (Claim verification + Pattern detection)
- Extracts factual claims from text
- Verifies claims against provided context
- Detects suspicious precision and overconfidence

### Assumption (Pattern matching + Context verification)
- Identifies assumptive language patterns
- Checks assumptions against available context
- Flags unwarranted generalizations

### Instruction Following (Length + Format + Relevance)
- Evaluates word count compliance
- Checks format requirements (bullets, paragraphs)
- Measures content relevance to prompt

## Integration Example

```javascript
const axios = require('axios');

class EvaluationClient {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }
  
  async evaluate(responses) {
    // Upload data
    const upload = await axios.post(`${this.baseUrl}/api/upload/upload`, responses);
    const batchId = upload.data.batch_id;
    
    // Wait for completion
    await this.waitForCompletion(batchId);
    
    // Get results
    const results = await axios.get(`${this.baseUrl}/api/results/batch/${batchId}`);
    return results.data.results;
  }
  
  async waitForCompletion(batchId) {
    while (true) {
      const status = await axios.get(`${this.baseUrl}/api/status/batch/${batchId}`);
      if (status.data.status.current_status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Usage
const client = new EvaluationClient();
const results = await client.evaluate(evaluationData);
```

## Troubleshooting

### Common Issues

**Python workers not executing:**
```bash
# Check Python path
which python3
# Update PYTHON_EXECUTABLE_PATH in .env
```

**Redis connection failed:**
```bash
# Test Redis
redis-cli ping
# Restart if needed
sudo systemctl restart redis
```

**Queue backup:**
```bash
# Check queue status
curl http://localhost:3001/api/status/workers
# Restart workers
curl -X POST http://localhost:3001/api/status/workers/restart/all
```

**Database connection issues:**
```bash
# Check MongoDB
sudo systemctl status mongodb
# Test connection
mongo --eval "db.adminCommand('ismaster')"
```

### Performance Tuning

For high throughput:
```bash
MAX_CONCURRENT_WORKERS=10
BATCH_SIZE=200
PROCESSING_TIMEOUT=45000
```

For resource-constrained environments:
```bash
MAX_CONCURRENT_WORKERS=3
BATCH_SIZE=25
PROCESSING_TIMEOUT=90000
```

### Health Monitoring

```bash
# System health check
curl http://localhost:3001/api/status/system

# Worker status
curl http://localhost:3001/api/status/workers

# Queue depths
redis-cli llen main_evaluation_tasks
```

## File Limits

- **Max file size**: 50MB
- **Max responses per batch**: 10,000
- **Supported formats**: CSV, JSON
- **Processing timeout**: 30 seconds (configurable)

## Development

### Running Tests
```bash
npm test
python -m pytest python-workers/tests/
```

### Debug Mode
```bash
NODE_ENV=development DEBUG=evaluation:* npm start
```

### Adding Custom Workers
1. Create new Python worker in `python-workers/`
2. Follow existing worker interface pattern
3. Add worker configuration to `config.js`
4. Update dimension queue routing

## License

[License information]

## Support

- **Issues**: [GitHub Issues URL]
- **Documentation**: [Full documentation URL]
- **API Reference**: `GET /api/upload/formats` for current API spec
