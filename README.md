# Agentic Evaluation Framework

A full-stack application for evaluating AI agent responses across 5 dimensions using a scalable master-worker architecture with React frontend, Node.js backend, and Python evaluation workers.

## Overview

Evaluates AI responses on:
- **Accuracy**: Factual correctness against reference answers
- **Coherence**: Logical flow and readability
- **Hallucination**: Detection of unsupported claims
- **Assumption**: Identification of unwarranted assumptions
- **Instruction Following**: Compliance with prompt requirements

## Architecture

```
React Frontend → Node.js API → Redis Queue → Master Orchestrator → 5 Python Workers → MongoDB
```

- **React Frontend**: User interface for file upload and results visualization
- **Node.js Backend**: REST API with Express
- **Python Workers**: ML-based evaluation engines
- **Redis**: Task queue management
- **MongoDB**: Data persistence

## Project Structure

```
project-root/
├── agentic-eval-frontend/          # React frontend application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
├── agentic-eval-backend/           # Backend services
│   ├── node-backend/               # Node.js API server
│   │   ├── src/
│   │   │   ├── api/
│   │   │   ├── db/
│   │   │   ├── queue/
│   │   │   └── utils/
│   │   ├── package.json
│   │   └── .env
│   ├── python-workers/             # Python evaluation workers
│   │   ├── shared/
│   │   ├── accuracy_worker.py
│   │   ├── coherence_worker.py
│   │   ├── hallucination_worker.py
│   │   ├── assumption_worker.py
│   │   ├── instruction_worker.py
│   │   └── requirements.txt
│   └── redis-windows.zip           # Redis for Windows
└── README.md
```

## Prerequisites

- Node.js 14+
- Python 3.x
- MongoDB (MongoDB Compass recommended, or MongoDB Atlas)
- Redis (included in repository for Windows users)

## Installation & Setup

### 1. Clone Repository
```bash
git clone <repository>
cd project-root
```

### 2. Install Frontend Dependencies
```bash
cd agentic-eval-frontend
npm install
cd ..
```

### 3. Install Backend Dependencies
```bash
cd agentic-eval-backend/node-backend
npm install
cd ..
```

### 4. Install Python Dependencies
```bash
cd python-workers
pip install -r requirements.txt
cd ..
```

### 5. Setup Database Services

#### MongoDB Setup
- **Option 1**: Install MongoDB Compass for local development
- **Option 2**: Create MongoDB Atlas account for cloud database

#### Redis Setup
- **Linux/Mac**: Install Redis via package manager
  ```bash
  # Ubuntu/Debian
  sudo apt install redis-server
  
  # macOS
  brew install redis
  ```

- **Windows**: Use the provided Redis in repository
  ```bash
  # Extract the redis-windows.zip file from agentic-eval-backend folder
  cd agentic-eval-backend
  # Extract redis-windows.zip to get redis-server.exe and redis-cli.exe
  # The zip contains a complete Redis installation for Windows
  ```

### 6. Configure Backend Environment
```bash
cd node-backend
cp .env.example .env
# Edit .env with your database URLs and settings
```

Example `.env` configuration:
```bash
# Database (using MongoDB Compass locally)
MONGODB_URI=mongodb://localhost:27017/agentic_eval
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/agentic_eval

# Redis (local installation)
REDIS_URL=redis://localhost:6379

# Server
PORT=3001
NODE_ENV=development

# Processing
MAX_CONCURRENT_WORKERS=6
BATCH_SIZE=100
PROCESSING_TIMEOUT=30000

# Python
PYTHON_EXECUTABLE_PATH=/usr/bin/python3
```

### 7. Start Database Services
```bash
# For Linux/Mac users:
sudo systemctl start mongodb redis
# Or: brew services start redis (macOS)

# For Windows users:
# 1. Start MongoDB Compass and connect to local instance
# 2. Navigate to extracted Redis folder and run: redis-server.exe
# 3. Or use MongoDB Atlas with appropriate connection string in .env
```

### 8. Start Backend Server
```bash
cd agentic-eval-backend/node-backend
npm start
```

### 9. Start Frontend (in a new terminal)
```bash
cd agentic-eval-frontend
npm start
```

### 10. Verify Installation
- Backend API: http://localhost:3001/api/status/system
- Frontend App: http://localhost:3000

## Usage

### Web Interface

1. Open http://localhost:3000 in your browser
2. Upload your evaluation data (JSON or CSV format)
3. Monitor processing progress in real-time
4. View results and agent rankings
5. Export results for further analysis

### API Usage

#### 1. Prepare Data

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

#### 2. Upload via API

```bash
curl -X POST http://localhost:3001/api/upload/upload \
  -H "Content-Type: application/json" \
  -d @evaluation_data.json
```

#### 3. Monitor Progress

```bash
curl http://localhost:3001/api/status/batch/{batch_id}
```

#### 4. Get Results

```bash
curl http://localhost:3001/api/results/batch/{batch_id}
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

## Configuration

### Backend Configuration (`.env`)

```bash
# Database connections (MongoDB Compass locally)
MONGODB_URI=mongodb://localhost:27017/agentic_eval
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/agentic_eval

# Redis (local installation from provided zip)
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

### Frontend Configuration

The frontend automatically connects to the backend API at `http://localhost:3001`. To change this:

1. Update the API base URL in your frontend configuration
2. Ensure CORS is properly configured in the backend

## Development

### Running in Development Mode

**Backend:**
```bash
cd agentic-eval-backend/node-backend
npm run dev
```

**Frontend:**
```bash
cd agentic-eval-frontend
npm start
```

### Building for Production

**Frontend:**
```bash
cd agentic-eval-frontend
npm run build
```

**Backend:**
```bash
cd agentic-eval-backend/node-backend
npm run build
```

## Evaluation Dimensions

### Accuracy
- Compares response against reference answer using word overlap, n-grams, and fact extraction
- Score: 0.0 - 1.0 (higher is better)

### Coherence
- Analyzes logical flow, transitions, and repetition
- Score: 0.0 - 1.0 (higher is better)

### Hallucination
- Detects unsupported claims and overconfident assertions
- Score: 0.0 - 1.0 (higher means less hallucination)

### Assumption
- Identifies unwarranted assumptions and generalizations
- Score: 0.0 - 1.0 (higher means fewer assumptions)

### Instruction Following
- Evaluates compliance with prompt requirements (length, format, relevance)
- Score: 0.0 - 1.0 (higher is better)

## File Limits

- **Max file size**: 50MB
- **Max responses per batch**: 10,000
- **Supported formats**: CSV, JSON
- **Processing timeout**: 30 seconds (configurable)

## Troubleshooting

### Backend won't start
- Check if MongoDB and Redis are running
  - **MongoDB**: Ensure MongoDB Compass is connected or Atlas URI is correct
  - **Redis**: Ensure redis-server.exe is running (Windows) or Redis service is active
- Verify Python path in `.env` file
- Check if port 3001 is available

### Frontend can't connect to backend
- Ensure backend is running on port 3001
- Check CORS configuration
- Verify API base URL in frontend config

### Workers not processing
- Check Python dependencies are installed
- Verify Redis connection
- Check worker status: `curl http://localhost:3001/api/status/workers`

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

## License

[License information]

## Support

- **Issues**: [GitHub Issues URL]
- **Documentation**: See documentation files for detailed technical reference
