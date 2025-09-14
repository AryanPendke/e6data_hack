#!/usr/bin/env python3
"""
Simplified Assumption Worker
Detects unsupported assumptions using pattern matching
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


def detect_assumption_patterns(text):
    """Detect patterns that indicate assumptions"""
    assumption_patterns = [
        r'\b(?:obviously|clearly|certainly|definitely|undoubtedly)\b',
        r'\b(?:all|every|never|always|no one|everyone)\b.*\b(?:are|is|will|would)\b',
        r'\b(?:most|many) (?:people|users|customers)\b.*\b(?:prefer|want|need|like)\b',
        r'\b(?:typically|usually|generally|commonly)\b',
        r'\bit is (?:clear|obvious|certain) that\b',
        r'\bwithout a doubt\b',
        r'\b(?:will|would|should|must) (?:be|have|result|lead)\b.*\b(?:because|since)\b'
    ]
    
    assumptions = []
    sentences = re.split(r'[.!?]+', text)
    
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 10:  # Skip very short sentences
            continue
            
        assumption_score = 0
        for pattern in assumption_patterns:
            if re.search(pattern, sentence.lower()):
                assumption_score += 1
        
        if assumption_score > 0:
            assumptions.append(sentence)
    
    return assumptions


def check_assumption_support(assumptions, prompt, context):
    """Check if assumptions are supported by provided context"""
    if not assumptions:
        return [], 1.0
    
    support_sources = []
    if prompt:
        support_sources.extend(re.split(r'[.!?]+', prompt))
    if context:
        support_sources.extend(re.split(r'[.!?]+', context))
    
    if not support_sources:
        return assumptions, 0.0  # All assumptions unsupported
    
    supported_assumptions = []
    
    for assumption in assumptions:
        assumption_words = set(assumption.lower().split())
        # Remove common words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        assumption_keywords = assumption_words - stop_words
        
        for source in support_sources:
            source_words = set(source.lower().split())
            if assumption_keywords:
                overlap = len(assumption_keywords.intersection(source_words))
                support_ratio = overlap / len(assumption_keywords)
                
                if support_ratio >= 0.4:  # 40% keyword overlap considered support
                    supported_assumptions.append(assumption)
                    break
    
    unsupported = [a for a in assumptions if a not in supported_assumptions]
    support_score = len(supported_assumptions) / len(assumptions) if assumptions else 1.0
    
    return unsupported, support_score


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
        prompt = input_data.get('prompt', '').strip()
        context = input_data.get('context', '').strip()
        
        if not response_text:
            return_error("Empty response")
        
        # Detect assumptions
        assumptions = detect_assumption_patterns(response_text)
        
        if not assumptions:
            score = 1.0
            details = {'message': 'No assumptions detected', 'assumptions_count': 0}
        else:
            # Check support for assumptions
            unsupported, support_score = check_assumption_support(assumptions, prompt, context)
            
            # Calculate final score (higher is better - fewer unsupported assumptions)
            score = support_score
            
            details = {
                'assumptions_count': len(assumptions),
                'supported_count': len(assumptions) - len(unsupported),
                'unsupported_count': len(unsupported),
                'support_ratio': round(support_score, 3),
                'assumptions_sample': assumptions[:3],  # Show first 3
                'unsupported_sample': unsupported[:2] if unsupported else []
            }
        
        details['processing_time'] = round(time.time() - start_time, 3)
        
        print(f"[AssumptionWorker] {response_id}: {score:.3f}", file=sys.stderr)
        return_score(score, details)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return_error(str(e))


if __name__ == "__main__":
    main()