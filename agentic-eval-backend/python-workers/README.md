# Python Workers for Agentic Evaluation Framework

This directory contains the Python workers that perform ML-based evaluation across 5 dimensions:

## 📁 Worker Files

### Core Workers
- **`instruction_worker.py`** - Instruction following evaluation (regex + LLM fallback)
- **`hallucination_worker.py`** - Hallucination detection using HHEM 2.1 methodology  
- **`assumption_worker.py`** - Assumption control via NLI-based verification
- **`coherence_worker.py`** - Coherence evaluation using sentence embeddings
- **`accuracy_worker.py`** - Accuracy assessment via BERTScore and semantic similarity

### Shared Utilities
- **`shared/utils.py`** - Common text processing and evaluation utilities
- **`shared/model_loader.py`** - ML model loading and caching system

## 🚀 Setup Instructions

### 1. Install Dependencies
```bash
cd python-workers
pip install -r requirements.txt

# Download spaCy language model
python -m spacy download en_core_web_sm
```

### 2. Environment Setup
```bash
# Optional: Set OpenAI API key for instruction worker LLM fallback
export OPENAI_API_KEY="your_api_key_here"

# Optional: Configure cache directory
export CACHE_DIR="./cache"
```

### 3. Test Worker
```bash
# Test individual worker
echo '{"response_id": "test_1", "prompt": "What is AI?", "response_text": "AI is artificial intelligence."}' | python instruction_worker.py
```

## 🔧 Worker Architecture

### Input Format
Each worker receives JSON via stdin:
```json
{
  "response_id": "r_123",
  "prompt": "The original question/instruction",
  "response_text": "The agent's response to evaluate", 
  "context": "Additional context (optional)",
  "reference": "Ground truth answer (optional)",
  "metadata": {"additional": "data"}
}
```

### Output Format
Each worker outputs JSON to stdout:
```json
{
  "score": 0.85,
  "details": {
    "processing_time": 1.23,
    "method": "evaluation_method_used",
    "component_scores": {...},
    "explanation": "Detailed evaluation results"
  }
}
```

## 📊 Evaluation Methods

### 1. Instruction Following (`instruction_worker.py`)
**Method**: Regex pattern matching + LLM judge fallback
- ✅ **Format Requirements**: Word count, bullet points, required terms
- ✅ **Structure Checks**: Start/end patterns, formatting constraints  
- ✅ **LLM Fallback**: GPT-4o-mini for complex instruction evaluation
- 🎯 **Scoring**: 1.0 = perfect compliance, 0.0 = ignores instructions

### 2. Hallucination Detection (`hallucination_worker.py`) 
**Method**: HHEM 2.1-inspired pipeline
- ✅ **Claim Extraction**: Identify factual statements using patterns
- ✅ **Evidence Retrieval**: Find supporting context via embeddings
- ✅ **NLI Verification**: Use RoBERTa-large-MNLI for entailment checking
- 🎯 **Scoring**: 1.0 = no hallucinations, 0.0 = major fabrications

### 3. Assumption Control (`assumption_worker.py`)
**Method**: NLI-based assumption detection  
- ✅ **Assumption Detection**: Pattern matching for unsupported claims
- ✅ **Evidence Search**: Retrieve supporting evidence from prompt/context
- ✅ **Support Verification**: NLI models check claim support
- 🎯 **Scoring**: 1.0 = no unwarranted assumptions, 0.0 = many assumptions

### 4. Coherence (`coherence_worker.py`)
**Method**: Multi-metric coherence analysis
- ✅ **Semantic Flow**: Sentence embedding similarity between adjacent sentences
- ✅ **Contradiction Detection**: NLI-based contradiction identification  
- ✅ **Structural Analysis**: Transition words, logical indicators, repetition
- 🎯 **Scoring**: 1.0 = highly coherent, 0.0 = incoherent/contradictory

### 5. Accuracy (`accuracy_worker.py`)
**Method**: Reference comparison + heuristics
- ✅ **BERTScore**: Semantic similarity with reference answer
- ✅ **Factual Consistency**: NLI verification of claims vs reference
- ✅ **Information Coverage**: Key information matching  
- ✅ **No-Reference Mode**: Consistency and reasonableness checks
- 🎯 **Scoring**: 1.0 = perfectly accurate, 0.0 = factually incorrect

## 🤖 Model Dependencies

### Required Models
- **Sentence Transformers**: `all-MiniLM-L6-v2` (embeddings)
- **NLI Model**: `roberta-large-mnli` (entailment checking)  
- **BERTScore**: `bert-base-uncased` (semantic similarity)
- **spaCy**: `en_core_web_sm` (NLP preprocessing)

### Optional Models
- **GPT-4o-mini**: For instruction following LLM fallback (requires API key)

### Model Caching
- Models are loaded once and cached in memory
- Evaluation results are cached to disk for 1 hour
- Cache keys based on input content hashes

## ⚡ Performance Optimization

### Batch Processing
Workers process inputs individually but models support batching:
```python
# Example: batch sentence embeddings  
embeddings = model_loader.get_embeddings(sentence_list)
```

### Caching Strategy
- **Model Cache**: In-memory model storage (shared/model_loader.py)
- **Result Cache**: Disk-based evaluation caching (shared/utils.py)
- **TTL**: Results cached for 1 hour, models cached until restart

### Memory Management
```python
# Clear model cache if needed
model_loader.clear_cache()

# Check model memory usage
info = model_loader.get_model_info()
```

## 🐛 Troubleshooting

### Common Issues

**"Model not found" Error**
```bash
# Download required models
python -c "from transformers import AutoModel; AutoModel.from_pretrained('roberta-large-mnli')"
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
```

**CUDA Out of Memory**
```bash
# Force CPU usage
export CUDA_VISIBLE_DEVICES=""

# Or reduce batch sizes in model_loader.py
```

**Import Errors**
```bash
# Ensure all dependencies installed
pip install -r requirements.txt

# Check Python path
export PYTHONPATH="/path/to/python-workers:$PYTHONPATH"
```

**Cache Permission Issues**
```bash
# Set cache directory permissions
mkdir -p ./cache
chmod 755 ./cache
```

### Performance Issues

**Slow Model Loading**
- Models download on first use
- Use local model cache: `export TRANSFORMERS_CACHE=/path/to/cache`
- Pre-download models in Docker image

**High Memory Usage**
- Use smaller models: `all-MiniLM-L12-v2` → `all-MiniLM-L6-v2`
- Enable model sharing between workers
- Add memory limits in Docker

**Slow Evaluation**
- Enable result caching (default: enabled)
- Reduce max claims/assumptions processed
- Use GPU acceleration if available

## 🧪 Testing Workers

### Unit Testing
```bash
# Test individual worker
echo '{"response_id": "test", "prompt": "List 3 items", "response_text": "1. Item A\n2. Item B\n3. Item C"}' | python instruction_worker.py

# Expected output:
# {"score": 1.0, "details": {...}}
```

### Integration Testing  
```bash
# Test all workers
for worker in *_worker.py; do
    echo "Testing $worker..."
    echo '{"response_id": "test", "prompt": "Test prompt", "response_text": "Test response"}' | python $worker
done
```

### Load Testing
```bash
# Test with multiple inputs
for i in {1..10}; do
    echo '{"response_id": "'$i'", "prompt": "Test", "response_text": "Response '$i'"}' | python instruction_worker.py
done
```

## 🔧 Configuration

### Worker Tuning
Edit worker files to adjust thresholds:

```python
# instruction_worker.py
class InstructionFollowingEvaluator:
    def __init__(self):
        self.use_llm_fallback = True  # Enable/disable LLM
        
# hallucination_worker.py  
class HallucinationDetector:
    def __init__(self):
        self.confidence_threshold = 0.5  # Adjust sensitivity
        self.entailment_threshold = 0.4
        
# coherence_worker.py
class CoherenceEvaluator:
    def __init__(self):
        self.similarity_threshold = 0.2  # Sentence similarity threshold
```

### Model Configuration
Edit `shared/model_loader.py`:
```python
# Use different models
def get_sentence_transformer(self, model_name='all-MiniLM-L6-v2'):
    # Change to: 'all-distilroberta-v1' for better performance
    # Change to: 'all-MiniLM-L12-v2' for higher accuracy

def get_nli_model(self, model_name='roberta-large-mnli'):
    # Change to: 'microsoft/deberta-base-mnli' for lighter model
```

## 📈 Monitoring

### Performance Metrics
Workers log to stderr:
```
[InstructionWorker] Response r_123: score=0.850, time=1.23s
[HallucinationWorker] Response r_124: score=0.920, time=2.45s
```

### Health Checks
```bash
# Check worker functionality
echo '{"response_id": "health", "prompt": "test", "response_text": "test"}' | python instruction_worker.py
```

## 🔄 Integration with Node Backend

Workers are called by the Node.js orchestrator:
1. **Task Received**: Orchestrator gets evaluation task from Redis
2. **Worker Spawned**: `child_process.spawn()` starts Python worker  
3. **Data Sent**: JSON input piped to worker stdin
4. **Results Parsed**: Worker JSON output captured and stored
5. **Cleanup**: Worker process terminated after completion

See `node-backend/src/queue/orchestrator.js` for integration details.

---

🎯 **Ready to evaluate AI agents with state-of-the-art ML models!**