#!/usr/bin/env python3
"""
Simplified Accuracy Worker
Compares response with reference answer using basic similarity
"""

import sys
import json
import re
import time


def load_json_input():
    """Load JSON input from stdin"""
    try:
        input_data = sys.stdin.read().strip()
        return json.loads(input_data) if input_data else {}
    except Exception as e:
        print(f"Input error: {e}", file=sys.stderr)
        return {}


def return_score(score, details=None):
    """Return score as JSON to stdout"""
    result = {
        "score": max(0.0, min(1.0, float(score))),
        "details": details or {}
    }
    print(json.dumps(result))
    sys.stdout.flush()


def return_error(error_message):
    """Return error and exit"""
    result = {"score": 0.0, "error": error_message, "details": {}}
    print(json.dumps(result))
    sys.exit(1)


def clean_text(text):
    """Clean and normalize text"""
    text = re.sub(r'[^\w\s]', ' ', text.lower())
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def calculate_word_overlap(text1, text2):
    """Calculate word overlap between two texts"""
    words1 = set(clean_text(text1).split())
    words2 = set(clean_text(text2).split())
    
    if not words1 or not words2:
        return 0.0
    
    intersection = len(words1.intersection(words2))
    union = len(words1.union(words2))
    
    return intersection / union if union > 0 else 0.0


def calculate_ngram_overlap(text1, text2, n=2):
    """Calculate n-gram overlap"""
    def get_ngrams(text, n):
        words = clean_text(text).split()
        return set(tuple(words[i:i+n]) for i in range(len(words)-n+1))
    
    ngrams1 = get_ngrams(text1, n)
    ngrams2 = get_ngrams(text2, n)
    
    if not ngrams1 or not ngrams2:
        return 0.0
    
    intersection = len(ngrams1.intersection(ngrams2))
    return intersection / max(len(ngrams1), len(ngrams2))


def extract_key_facts(text):
    """Extract key factual elements from text"""
    facts = []
    
    # Extract numbers, percentages, years
    numbers = re.findall(r'\b\d+(?:\.\d+)?%?\b', text)
    facts.extend(numbers)
    
    # Extract years
    years = re.findall(r'\b(?:19|20)\d{2}\b', text)
    facts.extend(years)
    
    # Extract proper nouns (capitalized words)
    proper_nouns = re.findall(r'\b[A-Z][a-z]+\b', text)
    facts.extend(proper_nouns)
    
    return list(set(facts))


def main():
    """Main execution function"""
    try:
        start_time = time.time()
        
        # Load input
        input_data = load_json_input()
        if not input_data:
            return_error("No input data")
        
        response_id = input_data.get('response_id', 'unknown')
        response_text = input_data.get('response_text', '').strip()
        reference_answer = input_data.get('reference_answer', '').strip()
        
        if not response_text:
            return_error("Empty response")
        
        if not reference_answer:
            # No reference answer provided, return moderate score
            score = 0.7
            details = {'message': 'No reference answer provided', 'default_score': True}
        else:
            # Calculate different similarity metrics
            word_overlap = calculate_word_overlap(response_text, reference_answer)
            bigram_overlap = calculate_ngram_overlap(response_text, reference_answer, 2)
            
            # Extract and compare key facts
            response_facts = extract_key_facts(response_text)
            reference_facts = extract_key_facts(reference_answer)
            
            if response_facts and reference_facts:
                fact_overlap = len(set(response_facts).intersection(set(reference_facts))) / len(set(reference_facts))
            else:
                fact_overlap = 0.5  # Neutral score if no facts found
            
            # Combine scores
            score = (
                0.4 * word_overlap +
                0.3 * bigram_overlap +
                0.3 * fact_overlap
            )
            
            details = {
                'word_overlap': round(word_overlap, 3),
                'bigram_overlap': round(bigram_overlap, 3),
                'fact_overlap': round(fact_overlap, 3),
                'response_facts': response_facts[:5],  # Show first 5 facts
                'reference_facts': reference_facts[:5],
                'response_length': len(response_text.split()),
                'reference_length': len(reference_answer.split())
            }
        
        details['processing_time'] = round(time.time() - start_time, 3)
        
        print(f"[AccuracyWorker] {response_id}: {score:.3f}", file=sys.stderr)
        return_score(score, details)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return_error(str(e))


if __name__ == "__main__":
    main()