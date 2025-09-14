#!/usr/bin/env python3
"""
Simplified Coherence Worker
Uses basic text analysis instead of ML embeddings
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


def get_sentences(text):
    """Split text into sentences"""
    sentences = re.split(r'[.!?]+', text)
    return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 5]


def calculate_sentence_flow(sentences):
    """Calculate flow between adjacent sentences using word overlap"""
    if len(sentences) < 2:
        return 1.0
    
    similarities = []
    for i in range(len(sentences) - 1):
        words1 = set(sentences[i].lower().split())
        words2 = set(sentences[i + 1].lower().split())
        
        if words1 and words2:
            overlap = len(words1.intersection(words2))
            similarity = overlap / max(len(words1), len(words2))
            similarities.append(similarity)
    
    return sum(similarities) / len(similarities) if similarities else 0.0


def check_transition_words(text):
    """Check for transition words that improve coherence"""
    transitions = [
        'however', 'moreover', 'furthermore', 'therefore', 'consequently',
        'additionally', 'meanwhile', 'nevertheless', 'first', 'second',
        'finally', 'in conclusion', 'for example', 'in contrast'
    ]
    
    found_transitions = 0
    for transition in transitions:
        if transition in text.lower():
            found_transitions += 1
    
    return found_transitions


def detect_repetition(text):
    """Detect excessive word repetition"""
    words = text.lower().split()
    if not words:
        return 1.0
    
    word_counts = {}
    for word in words:
        if len(word) > 3:  # Skip short words
            word_counts[word] = word_counts.get(word, 0) + 1
    
    if not word_counts:
        return 1.0
    
    max_repetition = max(word_counts.values())
    repetition_ratio = max_repetition / len(words)
    
    # Lower score for higher repetition
    return max(0.0, 1.0 - repetition_ratio * 5)


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
        
        if not response_text:
            return_error("Empty response")
        
        sentences = get_sentences(response_text)
        
        if len(sentences) < 2:
            # Single sentence gets moderate score
            score = 0.7
            details = {'message': 'Single sentence response', 'sentence_count': len(sentences)}
        else:
            # Calculate coherence components
            flow_score = calculate_sentence_flow(sentences)
            transition_count = check_transition_words(response_text)
            repetition_score = detect_repetition(response_text)
            
            # Transition bonus (normalized)
            transition_score = min(1.0, transition_count / max(1, len(sentences) / 3))
            
            # Combine scores
            score = (
                0.4 * flow_score +
                0.3 * transition_score +
                0.3 * repetition_score
            )
            
            details = {
                'sentence_count': len(sentences),
                'flow_score': round(flow_score, 3),
                'transition_score': round(transition_score, 3),
                'repetition_score': round(repetition_score, 3),
                'transition_count': transition_count
            }
        
        details['processing_time'] = round(time.time() - start_time, 3)
        
        print(f"[CoherenceWorker] {response_id}: {score:.3f}", file=sys.stderr)
        return_score(score, details)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return_error(str(e))


if __name__ == "__main__":
    main()