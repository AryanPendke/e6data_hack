#!/usr/bin/env python3
"""
Simplified Hallucination Worker
Uses keyword matching and basic fact checking patterns
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


def extract_factual_claims(text):
    """Extract potential factual claims"""
    claims = []
    
    # Patterns for factual statements
    patterns = [
        r'[A-Z][^.!?]*(?:is|are|was|were|will be|has|have|had)[^.!?]*[.!?]',
        r'[A-Z][^.!?]*\b\d+%[^.!?]*[.!?]',  # Percentage claims
        r'[A-Z][^.!?]*\bin \d{4}[^.!?]*[.!?]',  # Year references
        r'[A-Z][^.!?]*(?:according to|research shows|studies)[^.!?]*[.!?]'
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        claims.extend(matches)
    
    return [claim.strip() for claim in claims[:5]]  # Limit to 5 claims


def check_context_support(claims, context):
    """Check if claims are supported by context"""
    if not context or not claims:
        return []
    
    supported_claims = []
    context_lower = context.lower()
    
    for claim in claims:
        claim_words = set(claim.lower().split())
        context_words = set(context_lower.split())
        
        # Remove common words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        claim_keywords = claim_words - stop_words
        
        if claim_keywords:
            overlap = len(claim_keywords.intersection(context_words))
            support_ratio = overlap / len(claim_keywords)
            
            if support_ratio >= 0.3:  # At least 30% overlap
                supported_claims.append(claim)
    
    return supported_claims


def detect_hallucination_indicators(text):
    """Detect patterns that might indicate hallucination"""
    hallucination_patterns = [
        r'\b(?:definitely|certainly|absolutely|clearly|obviously)\b.*\b(?:will|must|always)\b',
        r'\bexactly \d+%\b',  # Very specific percentages without source
        r'\b(?:all|every|never|always|no one|everyone)\b.*\b(?:agree|believe|know)\b',
        r'\b(?:recent studies|new research|experts)\b.*(?:without citing)',
    ]
    
    indicators = 0
    for pattern in hallucination_patterns:
        if re.search(pattern, text.lower()):
            indicators += 1
    
    return indicators


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
        context = input_data.get('context', '').strip()
        
        if not response_text:
            return_error("Empty response")
        
        # Extract and analyze claims
        claims = extract_factual_claims(response_text)
        
        if not claims:
            score = 0.9  # High score if no factual claims
            details = {'message': 'No factual claims detected', 'claims_count': 0}
        else:
            # Check context support
            supported_claims = check_context_support(claims, context)
            support_ratio = len(supported_claims) / len(claims) if claims else 1.0
            
            # Check for hallucination indicators
            hallucination_indicators = detect_hallucination_indicators(response_text)
            indicator_penalty = min(0.3, hallucination_indicators * 0.1)
            
            # Calculate final score
            base_score = support_ratio
            score = max(0.0, base_score - indicator_penalty)
            
            details = {
                'claims_count': len(claims),
                'supported_claims_count': len(supported_claims),
                'support_ratio': round(support_ratio, 3),
                'hallucination_indicators': hallucination_indicators,
                'context_available': bool(context),
                'claims_sample': claims[:3]  # Show first 3 claims
            }
        
        details['processing_time'] = round(time.time() - start_time, 3)
        
        print(f"[HallucinationWorker] {response_id}: {score:.3f}", file=sys.stderr)
        return_score(score, details)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return_error(str(e))


if __name__ == "__main__":
    main()