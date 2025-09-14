# Agentic Evaluation Framework Backend

A scalable backend system for evaluating AI agents across multiple dimensions: instruction-following, hallucination detection, assumption control, coherence, and accuracy.

## 🏗️ Architecture

### System Components

- **Node.js Backend**: REST API server with Express.js
- **MongoDB**: Document database for storing responses and evaluations  
- **Redis**: Task queue and caching layer
- **Python Workers**: ML model workers for each evaluation dimension
- **Task Orchestrator**: Manages parallel processing of evaluation tasks

### Evaluation Dimensions

1. **Instruction Following** (Regex + LLM fallback)
2. **Hallucination Detection** (HHEM 2.1 pipeline)
3. **Assumption Control** (NLI-based detection)
4. **Coherence** (Sentence embeddings similarity)
5. **Accuracy** (BERTScore vs reference)

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- Python 3.8+
- MongoDB (local or Docker)
- Redis (local or Docker)

### Installation

1. **Clone and setup Node backend**:
```bash
git clone <repository-url>
cd agentic-eval-backend/node-backend
npm install
```

2. **Setup Python workers**:
```bash
cd ../python-workers
pip install -r requirements.txt
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start services**:

**Option A: Using Docker Compose (Recommended)**
```bash
docker-compose up -d mongodb redis
npm run dev
```

**Option B: Local installation**
```bash
# Start MongoDB and Redis locally
mongod --dbpath /your/db/path
redis-server

# Start the backend
npm start
```

### First Run

1. **Verify health**: `GET http://localhost:3001/health`
2. **Check API docs**: `GET http://localhost:3001/api/docs`
3. **Upload test data**: Use the sample data generator endpoint

## 📖 API Documentation

### Upload Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload/upload` | POST | Upload CSV/JSON file for evaluation |
| `/api/upload/validate` | POST | Validate file without processing |
| `/api/upload/formats` | GET | Get supported file formats |
| `/api/upload/sample-data` | POST | Generate sample data for testing |

### Results Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/results/batch/:batchId` | GET | Get all results for a batch |
| `/api/results/leaderboard/:batchId` | GET | Get agent leaderboard |
| `/api/results/agent/:agentId` | GET | Get results for specific agent |
| `/api/results/comparison` | GET | Compare multiple agents |
| `/api/results/export/:batchId` | GET | Export results to CSV/JSON |

### Status Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status/batch/:batchId` | GET | Get batch processing status |
| `/api/status/system` | GET | Get overall system status |
| `/api/status/workers` | GET | Get detailed worker status (master + dimension workers) |
| `/api/status/queues/detailed` | GET | Get detailed queue statistics and health |
| `/api/status/workers/restart/:dimension` | POST | Restart specific dimension worker |
| `/api/status/system/clear-all-queues` | POST | Emergency queue clearing |
| `/api/status/stream/:batchId` | GET | Real-time status updates (SSE) |

## 📁 File Structure

```
agentic-eval-backend/
│
├── node-backend/                 # Node.js orchestrator + REST API
│   ├── src/
│   │   ├── api/
│   │   │   ├── uploadRoutes.js       # CSV upload → stores in DB, pushes to Redis
│   │   │   ├── resultRoutes.js       # Fetch scored results for frontend
│   │   │   └── statusRoutes.js       # Progress status (completed / total)
│   │   │
│   │   ├── db/
│   │   │   └── dbClient.js            # MongoDB connection + operations
│   │   │
│   │   ├── queue/
│   │   │   ├── redisClient.js         # Redis connection
│   │   │   ├── enqueue.js             # Push tasks to queue
│   │   │   └── orchestrator.js        # Polls tasks and calls workers
│   │   │
│   │   ├── utils/
│   │   │   └── parser.js              # CSV → JSON parser
│   │   │
│   │   ├── server.js                  # Express entrypoint
│   │   └── config.js                  # ENV vars configuration
│   │
│   ├── package.json
│   └── README.md
│
├── python-workers/               # ML model workers (scoring services)
│   ├── shared/
│   │   ├── utils.py                   # shared helpers (batching, claim extraction)
│   │   └── model_loader.py            # loads all models once for reuse
│   │
│   ├── instruction_worker.py          # regex checks + optional LLM judge API
│   ├── hallucination_worker.py        # HHEM 2.1 pipeline
│   ├── assumption_worker.py           # NLI-based unsupported claim detector
│   ├── coherence_worker.py            # sentence embeddings cosine similarity
│   ├── accuracy_worker.py             # BERTScore or entailment vs reference
│   │
│   ├── requirements.txt
│   └── README.md
│
├── docker-compose.yml                 # for running Node + Python + Redis + DB
├── .env.example
└── README.md
```

## 💾 Data Format

### Input CSV Format
```csv
prompt,agent_id,response_text,context,reference
"What is AI?","agent_1","Artificial Intelligence is...","AI context","Reference answer"
```

### Input JSON Format
```json
[
  {
    "prompt": "What is AI?",
    "agent_id": "agent_1", 
    "response_text": "Artificial Intelligence is...",
    "context": "AI context",
    "reference": "Reference answer",
    "metadata": {"task_type": "QA", "difficulty": "easy"}
  }
]
```

### Required Fields
- `prompt`: The question/instruction given to the agent
- `agent_id`: Unique identifier for the agent
- `response_text`: The agent's response to evaluate

### Optional Fields
- `context`: Additional context for the prompt
- `reference`: Ground truth/reference answer
- `metadata`: Additional metadata (JSON object)

## 🔄 Processing Pipeline

1. **File Upload**: Parse CSV/JSON and validate data
2. **Database Storage**: Store responses with batch tracking
3. **Task Queueing**: Add evaluation tasks to Redis queue
4. **Worker Processing**: Python workers process each dimension:
   - Instruction following (regex + LLM fallback)
   - Hallucination detection (HHEM 2.1)
   - Assumption control (NLI-based)
   - Coherence (sentence embeddings)
   - Accuracy (BERTScore)
5. **Results Aggregation**: Combine scores and calculate final rating
6. **Storage**: Save evaluation results to database

## 🎯 Scoring System

Each dimension returns a score between 0.0 and 1.0:

- **Final Score**: Weighted average of all dimensions
- **Default Weights**:
  - Instruction: 20%
  - Hallucination: 25% 
  - Assumption: 20%
  - Coherence: 15%
  - Accuracy: 20%

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3001
NODE_ENV=development

# Database  
MONGODB_URI=mongodb://localhost:27017/agentic-eval
DB_NAME=agentic-eval

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Processing
BATCH_SIZE=32
MAX_RETRIES=3

# External APIs
OPENAI_API_KEY=your_openai_key_here
```

### Performance Tuning

- **Batch Size**: Adjust `BATCH_SIZE` for optimal throughput
- **Concurrency**: Modify `maxConcurrentTasks` in orchestrator
- **Memory**: Monitor Python worker memory usage
- **Redis**: Configure Redis memory limits for large datasets

## 🚀 Deployment

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Scale workers
docker-compose up -d --scale worker=3
```

### Production Considerations

1. **Database**: Use MongoDB Atlas or managed instance
2. **Redis**: Use Redis Cloud or managed instance  
3. **Monitoring**: Add application monitoring (New Relic, DataDog)
4. **Load Balancing**: Use nginx or cloud load balancer
5. **Security**: Enable authentication, HTTPS, rate limiting
6. **Backup**: Configure automated database backups

## 📊 Monitoring & Observability

### Health Checks

- **System Health**: `GET /health`
- **Detailed Status**: `GET /api/status/system`
- **Worker Status**: `GET /api/status/workers`

### Real-time Monitoring

- **Batch Progress**: `GET /api/status/stream/:batchId` (Server-Sent Events)
- **Queue Status**: `GET /api/status/queue`

### Key Metrics

- Queue length and processing rate
- Worker health and throughput
- Database connection status
- Memory and CPU usage
- Error rates by dimension

## 🐛 Troubleshooting

### Common Issues

**MongoDB Connection Failed**
```bash
# Check MongoDB is running
mongo --eval "db.adminCommand('ismaster')"

# Check connection string in .env
MONGODB_URI=mongodb://localhost:27017/agentic-eval
```

**Redis Connection Failed**
```bash
# Check Redis is running
redis-cli ping

# Should return PONG
```

**Python Workers Not Found**
```bash
# Ensure Python workers directory exists
ls -la python-workers/

# Check Python dependencies
cd python-workers && pip list
```

**High Memory Usage**
- Reduce `BATCH_SIZE` in configuration
- Monitor worker memory with `docker stats`
- Add memory limits to Docker containers

### Debug Mode

```bash
# Enable debug logging
NODE_ENV=development npm run dev

# View detailed logs
docker-compose logs -f backend worker
```

## 🧪 Testing

### Generate Sample Data

```bash
curl -X POST http://localhost:3001/api/upload/sample-data \
  -H "Content-Type: application/json" \
  -d '{"count": 50, "agents": 5}'
```

### API Testing

```bash
# Health check
curl http://localhost:3001/health

# Upload test file
curl -X POST http://localhost:3001/api/upload/upload \
  -F "file=@test_data.csv"

# Check batch status
curl http://localhost:3001/api/status/batch/YOUR_BATCH_ID
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Documentation**: Check `/api/docs` endpoint
- **Issues**: Create GitHub issues for bugs
- **Discussions**: Use GitHub discussions for questions

---

🎉 **Ready to evaluate AI agents at scale!**