#!/usr/bin/env python3
"""
Simplified Instruction Following Worker
Uses basic regex patterns and heuristics instead of complex ML models
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
    """Clean text"""
    return re.sub(r'\s+', ' ', str(text).strip()) if text else ""


def evaluate_word_count(response, prompt):
    """Check word count requirements from prompt"""
    word_count = len(response.split())
    
    # Extract word count requirements
    patterns = [
        r'(\d+)\s+words?',
        r'at least (\d+) words?',
        r'maximum (\d+) words?',
        r'between (\d+) and (\d+) words?'
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, prompt.lower())
        if matches:
            if isinstance(matches[0], tuple) and len(matches[0]) == 2:  # Range format
                min_words, max_words = int(matches[0][0]), int(matches[0][1])
                if min_words <= word_count <= max_words:
                    return 1.0
                elif word_count < min_words:
                    return max(0.0, word_count / min_words)
                else:
                    return max(0.0, 1.0 - (word_count - max_words) / max_words)
            else:  # Single number
                target = int(matches[0] if isinstance(matches[0], str) else matches[0][0])
                if 'at least' in prompt.lower():
                    return 1.0 if word_count >= target else max(0.0, word_count / target)
                elif 'maximum' in prompt.lower():
                    return 1.0 if word_count <= target else max(0.0, 1.0 - (word_count - target) / target)
                else:  # Exact or approximate
                    deviation = abs(word_count - target) / target
                    return max(0.0, 1.0 - deviation)
    
    return 1.0  # No word count requirements found


def evaluate_format_requirements(response, prompt):
    """Check basic format requirements"""
    score = 1.0
    details = {}
    
    # Check bullet points
    if re.search(r'bullet\s*points?|list', prompt.lower()):
        bullet_patterns = [r'^\s*[-*•]\s', r'^\s*\d+\.\s']
        bullet_count = 0
        for pattern in bullet_patterns:
            bullet_count += len(re.findall(pattern, response, re.MULTILINE))
        
        if bullet_count >= 3:
            bullet_score = 1.0
        elif bullet_count >= 1:
            bullet_score = 0.7
        else:
            bullet_score = 0.3
        
        score *= bullet_score
        details['bullets'] = bullet_count
    
    # Check paragraph structure
    if 'paragraph' in prompt.lower():
        sentences = len(re.split(r'[.!?]+', response))
        if sentences >= 3:
            paragraph_score = 1.0
        elif sentences >= 2:
            paragraph_score = 0.8
        else:
            paragraph_score = 0.5
        
        score *= paragraph_score
        details['sentences'] = sentences
    
    return score, details


def evaluate_content_relevance(response, prompt):
    """Simple content relevance check"""
    prompt_words = set(clean_text(prompt.lower()).split())
    response_words = set(clean_text(response.lower()).split())
    
    # Remove common stop words
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
    prompt_keywords = prompt_words - stop_words
    response_keywords = response_words - stop_words
    
    if not prompt_keywords:
        return 0.8
    
    overlap = len(prompt_keywords.intersection(response_keywords))
    relevance_score = min(1.0, overlap / len(prompt_keywords) * 2)  # Scale up
    
    return relevance_score


def main():
    """Main execution function"""
    try:
        start_time = time.time()
        
        # Load input
        input_data = load_json_input()
        if not input_data:
            return_error("No input data")
        
        response_id = input_data.get('response_id', 'unknown')
        prompt = clean_text(input_data.get('prompt', ''))
        response_text = clean_text(input_data.get('response_text', ''))
        
        if not response_text:
            return_error("Empty response")
        
        if not prompt:
            return_error("Empty prompt")
        
        # Evaluate different aspects
        word_score = evaluate_word_count(response_text, prompt)
        format_score, format_details = evaluate_format_requirements(response_text, prompt)
        relevance_score = evaluate_content_relevance(response_text, prompt)
        
        # Combine scores (weighted average)
        final_score = (
            0.3 * word_score +
            0.4 * format_score +
            0.3 * relevance_score
        )
        
        details = {
            'word_count_score': round(word_score, 3),
            'format_score': round(format_score, 3),
            'relevance_score': round(relevance_score, 3),
            'format_details': format_details,
            'processing_time': round(time.time() - start_time, 3),
            'response_length': len(response_text.split())
        }
        
        print(f"[InstructionWorker] {response_id}: {final_score:.3f}", file=sys.stderr)
        return_score(final_score, details)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return_error(str(e))


if __name__ == "__main__":
    main()