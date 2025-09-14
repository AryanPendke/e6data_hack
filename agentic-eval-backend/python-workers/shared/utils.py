"""
Shared utilities for all evaluation workers.
Contains common functions for text processing, claim extraction, and caching.
"""

import re
import json
import hashlib
import sys
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from diskcache import Cache

# Initialize cache
cache = Cache('./cache', size_limit=1e9)  # 1GB cache

def load_json_input() -> Dict[str, Any]:
    """Load and parse JSON input from stdin."""
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            raise ValueError("No input data received")
        
        data = json.loads(input_data)
        
        # Validate required fields
        required_fields = ['response_id', 'prompt', 'response_text']
        for field in required_fields:
            if field not in data:
                raise ValueError(f"Missing required field: {field}")
        
        return data
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON input: {e}")
    except Exception as e:
        raise ValueError(f"Error processing input: {e}")

def return_score(score: float, details: Optional[Dict] = None) -> None:
    """Return score as JSON to stdout."""
    result = {
        "score": max(0.0, min(1.0, float(score))),  # Ensure score is between 0 and 1
        "details": details or {}
    }
    print(json.dumps(result))
    sys.stdout.flush()

def return_error(error_message: str) -> None:
    """Return error message and exit."""
    result = {
        "score": 0.0,
        "error": error_message,
        "details": {}
    }
    print(json.dumps(result))
    sys.exit(1)

def clean_text(text: str) -> str:
    """Clean and normalize text for processing."""
    if not isinstance(text, str):
        return ""
    
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text.strip())
    
    # Remove special characters but keep basic punctuation
    text = re.sub(r'[^\w\s.,!?;:()\'"/-]', ' ', text)
    
    # Remove extra spaces again
    text = re.sub(r'\s+', ' ', text.strip())
    
    return text

def extract_sentences(text: str) -> List[str]:
    """Extract sentences from text using simple regex."""
    if not text:
        return []
    
    # Simple sentence splitting on periods, exclamation marks, question marks
    sentences = re.split(r'[.!?]+', text)
    
    # Clean and filter sentences
    sentences = [s.strip() for s in sentences if s.strip()]
    sentences = [s for s in sentences if len(s) > 5]  # Filter very short sentences
    
    return sentences

def extract_claims(text: str) -> List[str]:
    """Extract factual claims from text."""
    sentences = extract_sentences(text)
    claims = []
    
    # Patterns that typically indicate factual claims
    factual_patterns = [
        r'\b(is|are|was|were|will be|has|have|had)\b',
        r'\b(according to|based on|research shows|studies indicate)\b',
        r'\b(\d+%|\d+ percent|statistics show)\b',
        r'\b(in \d{4}|since \d{4}|by \d{4})\b'  # Years
    ]
    
    for sentence in sentences:
        # Check if sentence contains factual indicators
        for pattern in factual_patterns:
            if re.search(pattern, sentence.lower()):
                claims.append(sentence)
                break
    
    return claims

def extract_named_entities(text: str) -> List[str]:
    """Extract named entities using simple pattern matching."""
    entities = []
    
    # Capitalized words (potential proper nouns)
    proper_nouns = re.findall(r'\b[A-Z][a-z]+\b', text)
    entities.extend(proper_nouns)
    
    # Numbers and dates
    numbers = re.findall(r'\b\d+\.?\d*\b', text)
    entities.extend(numbers)
    
    # Years
    years = re.findall(r'\b(19|20)\d{2}\b', text)
    entities.extend(years)
    
    # Remove duplicates and short entities
    entities = list(set([e for e in entities if len(e) > 2]))
    
    return entities

def calculate_text_similarity(text1: str, text2: str) -> float:
    """Calculate simple cosine similarity between two texts."""
    if not text1 or not text2:
        return 0.0
    
    # Simple word-based similarity
    words1 = set(clean_text(text1.lower()).split())
    words2 = set(clean_text(text2.lower()).split())
    
    if not words1 or not words2:
        return 0.0
    
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    
    return intersection / union if union > 0 else 0.0

def check_word_count(text: str, min_words: int, max_words: int) -> Tuple[bool, int]:
    """Check if text meets word count requirements."""
    words = clean_text(text).split()
    word_count = len(words)
    
    meets_requirement = min_words <= word_count <= max_words
    return meets_requirement, word_count

def check_bullet_points(text: str, required_count: int) -> Tuple[bool, int]:
    """Check if text contains required number of bullet points."""
    # Common bullet point patterns
    bullet_patterns = [
        r'^\s*[\-\*\•]\s',  # -, *, •
        r'^\s*\d+\.\s',      # 1., 2., etc.
        r'^\s*[a-zA-Z]\.\s', # a., b., etc.
        r'^\s*[ivx]+\.\s'    # i., ii., iii., etc.
    ]
    
    lines = text.split('\n')
    bullet_count = 0
    
    for line in lines:
        for pattern in bullet_patterns:
            if re.search(pattern, line, re.MULTILINE):
                bullet_count += 1
                break
    
    meets_requirement = bullet_count >= required_count
    return meets_requirement, bullet_count

def check_format_requirements(text: str, requirements: Dict[str, Any]) -> Dict[str, Any]:
    """Check various format requirements."""
    results = {}
    
    # Word count
    if 'word_count' in requirements:
        min_words = requirements['word_count'].get('min', 0)
        max_words = requirements['word_count'].get('max', float('inf'))
        meets_req, count = check_word_count(text, min_words, max_words)
        results['word_count'] = {'meets_requirement': meets_req, 'count': count}
    
    # Bullet points
    if 'bullet_points' in requirements:
        required_count = requirements['bullet_points']
        meets_req, count = check_bullet_points(text, required_count)
        results['bullet_points'] = {'meets_requirement': meets_req, 'count': count}
    
    # Required terms
    if 'required_terms' in requirements:
        terms = requirements['required_terms']
        found_terms = []
        for term in terms:
            if term.lower() in text.lower():
                found_terms.append(term)
        results['required_terms'] = {
            'meets_requirement': len(found_terms) == len(terms),
            'found': found_terms,
            'missing': [t for t in terms if t not in found_terms]
        }
    
    # Forbidden terms
    if 'forbidden_terms' in requirements:
        terms = requirements['forbidden_terms']
        found_forbidden = []
        for term in terms:
            if term.lower() in text.lower():
                found_forbidden.append(term)
        results['forbidden_terms'] = {
            'meets_requirement': len(found_forbidden) == 0,
            'found': found_forbidden
        }
    
    return results

def create_cache_key(*args) -> str:
    """Create a cache key from arguments."""
    key_string = json.dumps(args, sort_keys=True)
    return hashlib.md5(key_string.encode()).hexdigest()

def get_cached_result(cache_key: str) -> Optional[Any]:
    """Get cached result."""
    try:
        return cache.get(cache_key)
    except:
        return None

def set_cached_result(cache_key: str, result: Any, ttl: int = 3600) -> None:
    """Set cached result with TTL."""
    try:
        cache.set(cache_key, result, expire=ttl)
    except:
        pass  # Ignore cache errors

def batch_process(items: List[Any], batch_size: int = 32) -> List[List[Any]]:
    """Split items into batches for processing."""
    batches = []
    for i in range(0, len(items), batch_size):
        batches.append(items[i:i + batch_size])
    return batches

def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Safely divide two numbers, returning default if denominator is 0."""
    try:
        return numerator / denominator if denominator != 0 else default
    except:
        return default

def normalize_score(score: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    """Normalize score to be between min_val and max_val."""
    return max(min_val, min(max_val, score))

def calculate_confidence_interval(scores: List[float], confidence: float = 0.95) -> Tuple[float, float]:
    """Calculate confidence interval for a list of scores."""
    if not scores:
        return (0.0, 0.0)
    
    scores_array = np.array(scores)
    mean = np.mean(scores_array)
    std = np.std(scores_array)
    n = len(scores_array)
    
    # Simple approximation using normal distribution
    z_score = 1.96 if confidence == 0.95 else 2.58  # 95% or 99%
    margin_error = z_score * (std / np.sqrt(n))
    
    return (mean - margin_error, mean + margin_error)

def log_processing_info(worker_name: str, response_id: str, processing_time: float, score: float) -> None:
    """Log processing information to stderr (won't interfere with JSON output)."""
    log_message = f"[{worker_name}] Response {response_id}: score={score:.3f}, time={processing_time:.2f}s"
    print(log_message, file=sys.stderr)

def validate_input_data(data: Dict[str, Any], required_fields: List[str]) -> None:
    """Validate input data has all required fields."""
    for field in required_fields:
        if field not in data:
            return_error(f"Missing required field: {field}")
        
        if isinstance(data[field], str) and not data[field].strip():
            return_error(f"Empty field: {field}")

class TextProcessor:
    """Text processing utilities class."""
    
    @staticmethod
    def count_words(text: str) -> int:
        """Count words in text."""
        return len(clean_text(text).split())
    
    @staticmethod
    def count_sentences(text: str) -> int:
        """Count sentences in text."""
        return len(extract_sentences(text))
    
    @staticmethod
    def count_characters(text: str, include_spaces: bool = True) -> int:
        """Count characters in text."""
        if include_spaces:
            return len(text)
        else:
            return len(text.replace(' ', ''))
    
    @staticmethod
    def get_readability_score(text: str) -> float:
        """Simple readability score based on sentence and word length."""
        sentences = extract_sentences(text)
        if not sentences:
            return 0.0
        
        total_words = sum(len(sentence.split()) for sentence in sentences)
        avg_sentence_length = total_words / len(sentences)
        
        # Simple formula: shorter sentences = higher readability
        # Scale to 0-1 where 1 is most readable
        readability = 1.0 / (1.0 + avg_sentence_length / 10)
        return normalize_score(readability)

# Export main functions
__all__ = [
    'load_json_input', 'return_score', 'return_error', 'clean_text',
    'extract_sentences', 'extract_claims', 'extract_named_entities',
    'calculate_text_similarity', 'check_format_requirements',
    'create_cache_key', 'get_cached_result', 'set_cached_result',
    'batch_process', 'normalize_score', 'TextProcessor'
]