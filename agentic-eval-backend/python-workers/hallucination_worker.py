#!/usr/bin/env python3
"""
Hallucination Detection Evaluation Worker

This worker detects hallucinations using the HHEM 2.1 methodology:
1. Extract factual claims from the response
2. Retrieve supporting evidence from context
3. Use NLI model to verify claim entailment
4. Calculate hallucination score

Scoring:
- 1.0: No hallucinations detected
- 0.8-0.9: Minor unsupported claims
- 0.5-0.7: Some hallucinations present
- 0.0-0.4: Major hallucinations detected
"""

import sys
import time
import os
import re
import json
from typing import Dict, List, Tuple, Any
import traceback

# Add the current directory and shared directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
shared_dir = os.path.join(current_dir, 'shared')
sys.path.insert(0, current_dir)
sys.path.insert(0, shared_dir)

# Import shared utilities with error handling
try:
    from shared.utils import (
        load_json_input, return_score, return_error, clean_text,
        extract_claims, extract_sentences, normalize_score, log_processing_info,
        create_cache_key, get_cached_result, set_cached_result
    )
    print("Successfully imported shared utilities", file=sys.stderr)
except ImportError as e:
    print(f"Failed to import shared utilities: {e}", file=sys.stderr)
    # Fallback minimal implementations
    def load_json_input():
        try:
            input_data = sys.stdin.read().strip()
            return json.loads(input_data) if input_data else {}
        except:
            return {}
    
    def return_score(score, details=None):
        result = {"score": float(score), "details": details or {}}
        print(json.dumps(result))
        sys.stdout.flush()
    
    def return_error(error_message):
        result = {"score": 0.0, "error": error_message, "details": {}}
        print(json.dumps(result))
        sys.exit(1)
    
    def clean_text(text):
        return re.sub(r'\s+', ' ', str(text).strip()) if text else ""
    
    def extract_claims(text):
        if not text:
            return []
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 10][:5]
    
    def extract_sentences(text):
        if not text:
            return []
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def normalize_score(score):
        return max(0.0, min(1.0, float(score)))
    
    def log_processing_info(worker, response_id, time_taken, score):
        print(f"[{worker}] {response_id}: {score:.3f} ({time_taken:.2f}s)", file=sys.stderr)

# Try to import model loader with fallback
try:
    from shared.model_loader import model_loader
    print("Successfully imported model loader", file=sys.stderr)
    HAS_ML_MODELS = True
except ImportError as e:
    print(f"Failed to import model loader: {e}", file=sys.stderr)
    print("Will use fallback simple scoring", file=sys.stderr)
    HAS_ML_MODELS = False
    model_loader = None

# Try to import numpy with fallback
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    print("NumPy not available, using fallback math", file=sys.stderr)
    HAS_NUMPY = False

class HallucinationDetector:
    """HHEM 2.1-style hallucination detection with fallbacks."""
    
    def __init__(self):
        self.nli_model = None
        self.sentence_model = None
        self.confidence_threshold = 0.5
        self.entailment_threshold = 0.4
        self.models_initialized = False
        
    def initialize_models(self):
        """Initialize required models with fallback."""
        if not HAS_ML_MODELS:
            print("ML models not available, using fallback scoring", file=sys.stderr)
            self.models_initialized = False
            return False
            
        try:
            # Try to load NLI model
            print("Attempting to load NLI model...", file=sys.stderr)
            self.nli_model = model_loader.get_nli_model('roberta-large-mnli')
            
            # Try to load sentence transformer
            print("Attempting to load sentence transformer...", file=sys.stderr)
            self.sentence_model = model_loader.get_sentence_transformer('all-MiniLM-L6-v2')
            
            print("Hallucination detection models loaded successfully", file=sys.stderr)
            self.models_initialized = True
            return True
            
        except Exception as e:
            print(f"Failed to load hallucination models: {e}", file=sys.stderr)
            print("Will use fallback simple scoring", file=sys.stderr)
            self.models_initialized = False
            return False
    
    def extract_factual_claims(self, text: str) -> List[str]:
        """Extract factual claims that can be verified."""
        if not text:
            return []
        
        # Get base claims using utility function
        base_claims = extract_claims(text)
        
        # Enhanced claim extraction with specific patterns
        factual_patterns = [
            r'[A-Z][^.!?]*\b(?:is|are|was|were|will be|has|have|had|contains?|includes?|shows?|indicates?)\b[^.!?]*[.!?]',
            r'[A-Z][^.!?]*\b(?:according to|based on|research shows|studies indicate|data suggests)\b[^.!?]*[.!?]',
            r'[A-Z][^.!?]*\b(?:\d+%|\d+ percent|statistics|numbers|figures)\b[^.!?]*[.!?]',
            r'[A-Z][^.!?]*\b(?:in \d{4}|since \d{4}|by \d{4}|during \d{4})\b[^.!?]*[.!?]',
            r'[A-Z][^.!?]*\b(?:scientists|researchers|experts|studies)\b[^.!?]*\b(?:found|discovered|concluded|showed)\b[^.!?]*[.!?]'
        ]
        
        enhanced_claims = []
        for pattern in factual_patterns:
            try:
                matches = re.findall(pattern, text)
                enhanced_claims.extend(matches)
            except:
                continue
        
        # Combine and deduplicate
        all_claims = list(set(base_claims + enhanced_claims))
        
        # Filter claims that are too short or too generic
        filtered_claims = []
        for claim in all_claims:
            claim = claim.strip()
            if (len(claim.split()) >= 4 and 
                len(claim) >= 20 and
                not self.is_generic_claim(claim)):
                filtered_claims.append(claim)
        
        return filtered_claims[:10]  # Limit to top 10 claims for efficiency
    
    def is_generic_claim(self, claim: str) -> bool:
        """Check if claim is too generic to verify."""
        generic_patterns = [
            r'this is',
            r'it is',
            r'there are',
            r'you can',
            r'it depends',
            r'in general',
            r'typically',
            r'usually',
            r'often'
        ]
        
        claim_lower = claim.lower()
        return any(pattern in claim_lower for pattern in generic_patterns)
    
    def simple_context_matching(self, claims: List[str], context: str) -> Dict[str, List[str]]:
        """Simple keyword-based context matching fallback."""
        if not context or not claims:
            return {claim: [] for claim in claims}
        
        context_sentences = extract_sentences(context)
        if not context_sentences:
            return {claim: [] for claim in claims}
        
        claim_context_map = {}
        
        for claim in claims:
            claim_words = set(clean_text(claim.lower()).split())
            relevant_sentences = []
            
            for sentence in context_sentences:
                sentence_words = set(clean_text(sentence.lower()).split())
                overlap = len(claim_words.intersection(sentence_words))
                
                if overlap >= 2:  # At least 2 words in common
                    relevant_sentences.append(sentence)
            
            claim_context_map[claim] = relevant_sentences[:3]  # Top 3
        
        return claim_context_map
    
    def simple_entailment_check(self, claim: str, evidence_sentences: List[str]) -> Dict[str, float]:
        """Simple fallback entailment checking."""
        if not evidence_sentences:
            return {
                'entailment_score': 0.0,
                'confidence': 0.0,
                'evidence_count': 0
            }
        
        # Simple keyword overlap scoring
        claim_words = set(clean_text(claim.lower()).split())
        total_overlap = 0
        
        for evidence in evidence_sentences:
            evidence_words = set(clean_text(evidence.lower()).split())
            overlap = len(claim_words.intersection(evidence_words))
            overlap_ratio = overlap / len(claim_words) if claim_words else 0
            total_overlap += overlap_ratio
        
        # Average overlap ratio
        avg_overlap = total_overlap / len(evidence_sentences) if evidence_sentences else 0
        
        # Simple heuristic scoring
        if avg_overlap > 0.5:
            entailment_score = 0.8
        elif avg_overlap > 0.3:
            entailment_score = 0.6
        elif avg_overlap > 0.1:
            entailment_score = 0.4
        else:
            entailment_score = 0.2
        
        return {
            'entailment_score': entailment_score,
            'confidence': 0.7,  # Medium confidence for simple method
            'evidence_count': len(evidence_sentences)
        }
    
    def retrieve_relevant_context(self, claims: List[str], context: str, top_k: int = 3) -> Dict[str, List[str]]:
        """Retrieve relevant context sentences for each claim."""
        if not context or not claims:
            return {claim: [] for claim in claims}
        
        # Use simple matching if no ML models
        if not self.models_initialized:
            return self.simple_context_matching(claims, context)
        
        context_sentences = extract_sentences(context)
        if not context_sentences:
            return {claim: [] for claim in claims}
        
        claim_context_map = {}
        
        try:
            # Get embeddings for claims and context
            all_texts = claims + context_sentences
            embeddings = model_loader.get_embeddings(all_texts)
            
            claim_embeddings = embeddings[:len(claims)]
            context_embeddings = embeddings[len(claims):]
            
            # Find most relevant context for each claim
            for i, claim in enumerate(claims):
                claim_embed = claim_embeddings[i]
                
                # Calculate similarities
                similarities = []
                for j, context_embed in enumerate(context_embeddings):
                    if HAS_NUMPY:
                        similarity = np.dot(claim_embed, context_embed) / (
                            np.linalg.norm(claim_embed) * np.linalg.norm(context_embed)
                        )
                    else:
                        # Fallback to simple overlap
                        similarity = 0.5
                    similarities.append((similarity, context_sentences[j]))
                
                # Get top-k most similar context sentences
                similarities.sort(reverse=True, key=lambda x: x[0])
                relevant_context = [sent for score, sent in similarities[:top_k] if score > 0.3]
                
                claim_context_map[claim] = relevant_context
                
        except Exception as e:
            print(f"Context retrieval error: {e}", file=sys.stderr)
            # Fallback to simple matching
            return self.simple_context_matching(claims, context)
        
        return claim_context_map
    
    def verify_claim_entailment(self, claim: str, evidence_sentences: List[str]) -> Dict[str, float]:
        """Verify if claim is entailed by evidence using NLI."""
        if not evidence_sentences:
            return {
                'entailment_score': 0.0,
                'confidence': 0.0,
                'evidence_count': 0
            }
        
        # Use simple method if no ML models
        if not self.models_initialized:
            return self.simple_entailment_check(claim, evidence_sentences)
        
        # Create cache key
        cache_key = f"nli_verification_{hash(claim)}_{hash(str(evidence_sentences))}"
        
        try:
            entailment_scores = []
            
            for evidence in evidence_sentences:
                # Use NLI model to check entailment
                nli_result = model_loader.predict_nli(evidence, claim)
                
                # Get entailment probability
                entailment_prob = nli_result.get('entailment', 0.0)
                neutral_prob = nli_result.get('neutral', 0.0)
                contradiction_prob = nli_result.get('contradiction', 0.0)
                
                # Calculate support score (entailment + partial neutral)
                support_score = entailment_prob + 0.3 * neutral_prob
                entailment_scores.append(support_score)
            
            # Calculate final entailment score
            if entailment_scores:
                max_entailment = max(entailment_scores)
                avg_entailment = sum(entailment_scores) / len(entailment_scores)
                
                # Weighted combination: favor maximum support but consider average
                final_entailment = 0.7 * max_entailment + 0.3 * avg_entailment
                
                # Calculate confidence based on consistency
                if HAS_NUMPY and len(entailment_scores) > 1:
                    score_std = np.std(entailment_scores)
                    confidence = max(0.0, 1.0 - score_std)
                else:
                    confidence = 0.8
            else:
                final_entailment = 0.0
                confidence = 0.0
            
            result = {
                'entailment_score': final_entailment,
                'confidence': confidence,
                'evidence_count': len(evidence_sentences),
                'individual_scores': entailment_scores
            }
            
            return result
            
        except Exception as e:
            print(f"NLI verification error: {e}", file=sys.stderr)
            # Fallback to simple method
            return self.simple_entailment_check(claim, evidence_sentences)
    
    def calculate_hallucination_score(self, claims_verification: Dict[str, Dict]) -> Tuple[float, Dict[str, Any]]:
        """Calculate overall hallucination score from claim verifications."""
        if not claims_verification:
            return 1.0, {"message": "No factual claims to verify"}
        
        total_claims = len(claims_verification)
        supported_claims = 0
        partially_supported_claims = 0
        unsupported_claims = 0
        
        claim_details = {}
        confidence_scores = []
        
        for claim, verification in claims_verification.items():
            entailment_score = verification.get('entailment_score', 0.0)
            confidence = verification.get('confidence', 0.0)
            evidence_count = verification.get('evidence_count', 0)
            
            confidence_scores.append(confidence)
            
            # Categorize claims
            if entailment_score >= self.entailment_threshold and evidence_count > 0:
                if entailment_score >= 0.7:
                    supported_claims += 1
                    support_level = "supported"
                else:
                    partially_supported_claims += 1
                    support_level = "partially_supported"
            else:
                unsupported_claims += 1
                support_level = "unsupported"
            
            claim_details[claim[:100] + "..." if len(claim) > 100 else claim] = {
                'support_level': support_level,
                'entailment_score': round(entailment_score, 3),
                'confidence': round(confidence, 3),
                'evidence_count': evidence_count
            }
        
        # Calculate hallucination score
        # Higher score = less hallucination
        support_ratio = supported_claims / total_claims
        partial_support_ratio = partially_supported_claims / total_claims
        
        # Weighted scoring: full support = 1.0, partial = 0.6, none = 0.0
        hallucination_score = support_ratio + 0.6 * partial_support_ratio
        
        # Apply confidence adjustment
        avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.5
        confidence_factor = 0.8 + 0.2 * avg_confidence  # Between 0.8 and 1.0
        
        final_score = hallucination_score * confidence_factor
        
        details = {
            'total_claims': total_claims,
            'supported_claims': supported_claims,
            'partially_supported_claims': partially_supported_claims,
            'unsupported_claims': unsupported_claims,
            'support_ratio': round(support_ratio, 3),
            'average_confidence': round(avg_confidence, 3),
            'claim_details': claim_details
        }
        
        return normalize_score(final_score), details
    
    def detect_hallucination(self, response: str, context: str = "") -> Tuple[float, Dict[str, Any]]:
        """Main hallucination detection method."""
        start_time = time.time()
        
        # Try to initialize models if not done
        if not self.models_initialized and HAS_ML_MODELS:
            self.initialize_models()
        
        # Clean inputs
        response = clean_text(response)
        context = clean_text(context) if context else ""
        
        if not response:
            return 0.0, {"error": "Empty response"}
        
        # If no context provided, we can't verify claims properly
        if not context:
            return 0.5, {
                "message": "No context provided for verification",
                "fallback_score": 0.5,
                "processing_time": time.time() - start_time,
                "method": "no_context_fallback"
            }
        
        try:
            # Step 1: Extract factual claims
            claims = self.extract_factual_claims(response)
            
            if not claims:
                return 0.8, {  # Give benefit of doubt if no claims
                    "message": "No factual claims detected",
                    "processing_time": time.time() - start_time,
                    "method": "no_claims"
                }
            
            # Step 2: Retrieve relevant context for each claim
            claim_context_map = self.retrieve_relevant_context(claims, context)
            
            # Step 3: Verify each claim using NLI or fallback
            claims_verification = {}
            for claim in claims:
                relevant_context = claim_context_map.get(claim, [])
                verification = self.verify_claim_entailment(claim, relevant_context)
                claims_verification[claim] = verification
            
            # Step 4: Calculate overall hallucination score
            hallucination_score, details = self.calculate_hallucination_score(claims_verification)
            
            # Add processing metadata
            details.update({
                "processing_time": time.time() - start_time,
                "claims_extracted": len(claims),
                "context_length": len(context.split()),
                "method": "ml_enhanced" if self.models_initialized else "simple_fallback",
                "models_available": HAS_ML_MODELS,
                "numpy_available": HAS_NUMPY
            })
            
            return hallucination_score, details
            
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"Hallucination detection error: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            
            # Return conservative score on error
            return 0.3, {
                "error": str(e),
                "processing_time": processing_time,
                "method": "error_fallback"
            }

def main():
    """Main execution function."""
    try:
        print("Hallucination worker starting...", file=sys.stderr)
        
        # Load input data
        input_data = load_json_input()
        print(f"Loaded input data: {len(str(input_data))} chars", file=sys.stderr)
        
        # Validate input
        if not input_data:
            return_error("No input data received")
        
        # Extract required fields
        response_id = input_data.get('response_id', 'unknown')
        response_text = input_data.get('response_text', '')
        context = input_data.get('context', '')
        
        print(f"Processing response_id: {response_id}", file=sys.stderr)
        print(f"Response length: {len(response_text)}", file=sys.stderr)
        print(f"Context length: {len(context)}", file=sys.stderr)
        
        if not response_text:
            return_error("Empty response text")
        
        # Initialize detector
        detector = HallucinationDetector()
        
        # Perform hallucination detection
        score, details = detector.detect_hallucination(response_text, context)
        
        # Log processing info
        processing_time = details.get("processing_time", 0)
        log_processing_info("HallucinationWorker", response_id, processing_time, score)
        
        print(f"Returning score: {score}", file=sys.stderr)
        
        # Return result
        return_score(score, details)
        
    except Exception as e:
        print(f"Main function error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return_error(f"Hallucination detection failed: {str(e)}")

if __name__ == "__main__":
    main()