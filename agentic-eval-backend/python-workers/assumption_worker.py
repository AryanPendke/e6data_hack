#!/usr/bin/env python3
"""
Assumption Control Evaluation Worker

This worker detects when an agent makes unwarranted assumptions not supported by the input.
Uses NLI models to verify if claims are supported by the given context/prompt.

Scoring:
- 1.0: No unsupported assumptions
- 0.8-0.9: Minor assumptions with partial support
- 0.5-0.7: Some unsupported assumptions
- 0.0-0.4: Major unsupported assumptions
"""

import sys
import time
import os
import re
import json
from typing import Dict, List, Tuple, Any, Set
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
        extract_sentences, extract_claims, normalize_score, log_processing_info
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
        return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 10][:10]
    
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

class AssumptionDetector:
    """Detects unwarranted assumptions in agent responses."""
    
    def __init__(self):
        self.nli_model = None
        self.sentence_model = None
        self.assumption_threshold = 0.3
        self.support_threshold = 0.4
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
            
            print("Assumption detection models loaded successfully", file=sys.stderr)
            self.models_initialized = True
            return True
            
        except Exception as e:
            print(f"Failed to load assumption models: {e}", file=sys.stderr)
            print("Will use fallback simple scoring", file=sys.stderr)
            self.models_initialized = False
            return False
    
    def extract_potential_assumptions(self, text: str) -> List[str]:
        """Extract statements that could be assumptions."""
        if not text:
            return []
        
        # Get all sentences first
        sentences = extract_sentences(text)
        
        potential_assumptions = []
        
        # Patterns that often indicate assumptions
        assumption_indicators = [
            # Definitive statements without evidence
            r'\b(?:clearly|obviously|certainly|definitely|undoubtedly)\b',
            r'\b(?:it is (?:clear|obvious|certain) that)\b',
            r'\b(?:without a doubt|there is no question)\b',
            
            # Causal assumptions
            r'\b(?:because of this|as a result|therefore|thus|consequently)\b',
            r'\b(?:this (?:means|implies|suggests) that)\b',
            r'\b(?:this (?:leads to|causes|results in))\b',
            
            # Generalizations
            r'\b(?:all|every|never|always|no one|everyone)\b',
            r'\b(?:most|many|few) (?:people|users|customers|studies)\b',
            r'\b(?:typically|usually|generally|commonly)\b',
            
            # Predictive assumptions
            r'\b(?:will|would|should|must) (?:be|have|do|result|lead)\b',
            r'\b(?:is likely to|are expected to|tends to)\b',
            
            # Comparative assumptions
            r'\b(?:better than|worse than|more than|less than)\b',
            r'\b(?:superior to|inferior to|compared to)\b'
        ]
        
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence.split()) < 4:  # Skip very short sentences
                continue
                
            # Check for assumption indicators
            assumption_score = 0
            for pattern in assumption_indicators:
                if re.search(pattern, sentence.lower()):
                    assumption_score += 1
            
            # Additional checks for specific assumption types
            
            # Check for specific numbers/statistics without source
            if re.search(r'\b\d+%|\d+\.\d+%|\d+ percent\b', sentence):
                if not re.search(r'\b(?:according to|study|research|data|survey)\b', sentence.lower()):
                    assumption_score += 1
            
            # Check for definitive statements about future
            if re.search(r'\b(?:will be|will have|will result|will lead)\b', sentence.lower()):
                assumption_score += 1
            
            # Check for statements about user behavior/preferences
            if re.search(r'\b(?:users|customers|people) (?:want|need|prefer|like|expect)\b', sentence.lower()):
                assumption_score += 1
            
            # Check for technical claims without qualification
            tech_terms = r'\b(?:algorithm|system|technology|software|hardware|network|database)\b'
            if re.search(tech_terms, sentence.lower()):
                if re.search(r'\b(?:is|are|will) (?:faster|slower|better|more efficient|secure)\b', sentence.lower()):
                    assumption_score += 1
            
            # If sentence has assumption indicators, add it
            if assumption_score > 0:
                potential_assumptions.append(sentence)
        
        # Remove duplicates and limit
        return list(set(potential_assumptions))[:15]  # Limit for efficiency
    
    def simple_evidence_matching(self, assumption: str, prompt: str, context: str) -> List[str]:
        """Simple keyword-based evidence matching fallback."""
        evidence_sources = []
        if prompt:
            evidence_sources.extend(extract_sentences(prompt))
        if context:
            evidence_sources.extend(extract_sentences(context))
        
        if not evidence_sources:
            return []
        
        assumption_words = set(clean_text(assumption.lower()).split())
        relevant_evidence = []
        
        for evidence in evidence_sources:
            evidence_words = set(clean_text(evidence.lower()).split())
            overlap = len(assumption_words.intersection(evidence_words))
            
            if overlap >= 2:  # At least 2 words in common
                relevant_evidence.append(evidence)
        
        return relevant_evidence[:5]
    
    def find_supporting_evidence(self, assumption: str, prompt: str, context: str) -> List[str]:
        """Find evidence in prompt/context that might support the assumption."""
        evidence_sources = []
        if prompt:
            evidence_sources.extend(extract_sentences(prompt))
        if context:
            evidence_sources.extend(extract_sentences(context))
        
        if not evidence_sources:
            return []
        
        # Use simple matching if no ML models
        if not self.models_initialized:
            return self.simple_evidence_matching(assumption, prompt, context)
        
        try:
            # Use embeddings to find most relevant evidence
            all_texts = [assumption] + evidence_sources
            embeddings = model_loader.get_embeddings(all_texts)
            
            assumption_embed = embeddings[0]
            evidence_embeds = embeddings[1:]
            
            # Calculate similarities
            similarities = []
            for i, evidence_embed in enumerate(evidence_embeds):
                if HAS_NUMPY:
                    similarity = np.dot(assumption_embed, evidence_embed) / (
                        np.linalg.norm(assumption_embed) * np.linalg.norm(evidence_embed)
                    )
                else:
                    similarity = 0.5  # Fallback
                similarities.append((similarity, evidence_sources[i]))
            
            # Sort by similarity and get top evidence
            similarities.sort(reverse=True, key=lambda x: x[0])
            
            # Filter for reasonable similarity threshold
            relevant_evidence = [
                evidence for similarity, evidence in similarities[:5] 
                if similarity > 0.3
            ]
            
            return relevant_evidence
            
        except Exception as e:
            print(f"Evidence finding error: {e}", file=sys.stderr)
            # Fallback to simple method
            return self.simple_evidence_matching(assumption, prompt, context)
    
    def simple_support_check(self, assumption: str, evidence_list: List[str]) -> Dict[str, Any]:
        """Simple fallback support checking."""
        if not evidence_list:
            return {
                'support_score': 0.0,
                'confidence': 1.0,
                'evidence_count': 0,
                'support_level': 'unsupported'
            }
        
        # Simple keyword overlap scoring
        assumption_words = set(clean_text(assumption.lower()).split())
        support_scores = []
        
        for evidence in evidence_list:
            evidence_words = set(clean_text(evidence.lower()).split())
            overlap = len(assumption_words.intersection(evidence_words))
            overlap_ratio = overlap / len(assumption_words) if assumption_words else 0
            support_scores.append(overlap_ratio)
        
        # Calculate final support score
        if support_scores:
            max_support = max(support_scores)
            avg_support = sum(support_scores) / len(support_scores)
            final_support = 0.7 * max_support + 0.3 * avg_support
            
            if final_support >= 0.6:
                support_level = 'supported'
            elif final_support >= 0.3:
                support_level = 'partially_supported'
            else:
                support_level = 'unsupported'
        else:
            final_support = 0.0
            support_level = 'unsupported'
        
        return {
            'support_score': final_support,
            'confidence': 0.7,  # Medium confidence for simple method
            'evidence_count': len(evidence_list),
            'support_level': support_level
        }
    
    def verify_assumption_support(self, assumption: str, evidence_list: List[str]) -> Dict[str, Any]:
        """Verify if assumption is supported by evidence using NLI."""
        if not evidence_list:
            return {
                'support_score': 0.0,
                'confidence': 1.0,
                'evidence_count': 0,
                'support_level': 'unsupported'
            }
        
        # Use simple method if no ML models
        if not self.models_initialized:
            return self.simple_support_check(assumption, evidence_list)
        
        try:
            support_scores = []
            contradiction_scores = []
            
            for evidence in evidence_list:
                # Use NLI to check if evidence supports assumption
                nli_result = model_loader.predict_nli(evidence, assumption)
                
                entailment_prob = nli_result.get('entailment', 0.0)
                neutral_prob = nli_result.get('neutral', 0.0)
                contradiction_prob = nli_result.get('contradiction', 0.0)
                
                # Calculate support (entailment + partial neutral)
                support_score = entailment_prob + 0.2 * neutral_prob
                support_scores.append(support_score)
                contradiction_scores.append(contradiction_prob)
            
            # Calculate overall support
            if support_scores:
                max_support = max(support_scores)
                avg_support = sum(support_scores) / len(support_scores)
                max_contradiction = max(contradiction_scores)
                
                # Weighted combination favoring maximum support
                final_support = 0.7 * max_support + 0.3 * avg_support
                
                # Penalize if there's strong contradiction
                if max_contradiction > 0.6:
                    final_support *= 0.5
                
                # Calculate confidence based on consistency
                if HAS_NUMPY and len(support_scores) > 1:
                    support_std = np.std(support_scores)
                    confidence = max(0.3, 1.0 - support_std)
                else:
                    confidence = 0.8
                
                # Determine support level
                if final_support >= 0.6:
                    support_level = 'supported'
                elif final_support >= 0.3:
                    support_level = 'partially_supported'
                else:
                    support_level = 'unsupported'
                
            else:
                final_support = 0.0
                confidence = 1.0
                support_level = 'unsupported'
            
            return {
                'support_score': final_support,
                'confidence': confidence,
                'evidence_count': len(evidence_list),
                'support_level': support_level,
                'individual_scores': support_scores,
                'max_contradiction': max(contradiction_scores) if contradiction_scores else 0.0
            }
            
        except Exception as e:
            print(f"Assumption verification error: {e}", file=sys.stderr)
            # Fallback to simple method
            return self.simple_support_check(assumption, evidence_list)
    
    def calculate_assumption_control_score(self, assumption_results: Dict[str, Dict]) -> Tuple[float, Dict[str, Any]]:
        """Calculate overall assumption control score."""
        if not assumption_results:
            return 1.0, {"message": "No potential assumptions detected"}
        
        total_assumptions = len(assumption_results)
        supported_assumptions = 0
        partially_supported_assumptions = 0
        unsupported_assumptions = 0
        
        assumption_details = {}
        confidence_scores = []
        support_scores = []
        
        for assumption, result in assumption_results.items():
            support_level = result.get('support_level', 'unsupported')
            support_score = result.get('support_score', 0.0)
            confidence = result.get('confidence', 0.5)
            evidence_count = result.get('evidence_count', 0)
            
            confidence_scores.append(confidence)
            support_scores.append(support_score)
            
            # Count by support level
            if support_level == 'supported':
                supported_assumptions += 1
            elif support_level == 'partially_supported':
                partially_supported_assumptions += 1
            else:
                unsupported_assumptions += 1
            
            # Store details (truncate long assumptions)
            assumption_key = assumption[:100] + "..." if len(assumption) > 100 else assumption
            assumption_details[assumption_key] = {
                'support_level': support_level,
                'support_score': round(support_score, 3),
                'confidence': round(confidence, 3),
                'evidence_count': evidence_count
            }
        
        # Calculate assumption control score
        # Higher score = fewer unsupported assumptions
        supported_ratio = supported_assumptions / total_assumptions
        partially_supported_ratio = partially_supported_assumptions / total_assumptions
        
        # Weighted scoring: supported = 1.0, partial = 0.7, unsupported = 0.0
        base_score = supported_ratio + 0.7 * partially_supported_ratio
        
        # Apply confidence weighting
        avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.5
        confidence_factor = 0.8 + 0.2 * avg_confidence
        
        final_score = base_score * confidence_factor
        
        details = {
            'total_assumptions': total_assumptions,
            'supported_assumptions': supported_assumptions,
            'partially_supported_assumptions': partially_supported_assumptions,
            'unsupported_assumptions': unsupported_assumptions,
            'supported_ratio': round(supported_ratio, 3),
            'average_confidence': round(avg_confidence, 3),
            'average_support_score': round(sum(support_scores) / len(support_scores), 3) if support_scores else 0.0,
            'assumption_details': assumption_details
        }
        
        return normalize_score(final_score), details
    
    def detect_assumptions(self, response: str, prompt: str = "", context: str = "") -> Tuple[float, Dict[str, Any]]:
        """Main assumption detection method."""
        start_time = time.time()
        
        # Try to initialize models if not done
        if not self.models_initialized and HAS_ML_MODELS:
            self.initialize_models()
        
        # Clean inputs
        response = clean_text(response)
        prompt = clean_text(prompt) if prompt else ""
        context = clean_text(context) if context else ""
        
        if not response:
            return 0.0, {"error": "Empty response"}
        
        try:
            # Step 1: Extract potential assumptions
            assumptions = self.extract_potential_assumptions(response)
            
            if not assumptions:
                return 1.0, {
                    "message": "No potential assumptions detected",
                    "processing_time": time.time() - start_time,
                    "method": "no_assumptions"
                }
            
            # Step 2: For each assumption, find supporting evidence and verify
            assumption_results = {}
            
            for assumption in assumptions:
                # Find supporting evidence in prompt and context
                evidence = self.find_supporting_evidence(assumption, prompt, context)
                
                # Verify if assumption is supported by evidence
                verification = self.verify_assumption_support(assumption, evidence)
                
                assumption_results[assumption] = verification
            
            # Step 3: Calculate overall assumption control score
            assumption_score, details = self.calculate_assumption_control_score(assumption_results)
            
            # Add processing metadata
            details.update({
                "processing_time": time.time() - start_time,
                "assumptions_extracted": len(assumptions),
                "prompt_length": len(prompt.split()) if prompt else 0,
                "context_length": len(context.split()) if context else 0,
                "method": "ml_enhanced" if self.models_initialized else "simple_fallback",
                "models_available": HAS_ML_MODELS,
                "numpy_available": HAS_NUMPY
            })
            
            return assumption_score, details
            
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"Assumption detection error: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            
            # Return conservative score on error
            return 0.5, {
                "error": str(e),
                "processing_time": processing_time,
                "method": "error_fallback"
            }

def main():
    """Main execution function."""
    try:
        print("Assumption worker starting...", file=sys.stderr)
        
        # Load input data
        input_data = load_json_input()
        print(f"Loaded input data: {len(str(input_data))} chars", file=sys.stderr)
        
        if not input_data:
            return_error("No input data received")
        
        # Extract required fields
        response_id = input_data.get('response_id', 'unknown')
        prompt = input_data.get('prompt', '')
        response_text = input_data.get('response_text', '')
        context = input_data.get('context', '')
        
        print(f"Processing response_id: {response_id}", file=sys.stderr)
        print(f"Prompt length: {len(prompt)}", file=sys.stderr)
        print(f"Response length: {len(response_text)}", file=sys.stderr)
        print(f"Context length: {len(context)}", file=sys.stderr)
        
        if not response_text:
            return_error("Empty response text")
        
        # Initialize detector
        detector = AssumptionDetector()
        
        # Perform assumption detection
        score, details = detector.detect_assumptions(response_text, prompt, context)
        
        # Log processing info
        processing_time = details.get("processing_time", 0)
        log_processing_info("AssumptionWorker", response_id, processing_time, score)
        
        print(f"Returning score: {score}", file=sys.stderr)
        
        # Return result
        return_score(score, details)
        
    except Exception as e:
        print(f"Main function error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return_error(f"Assumption detection failed: {str(e)}")

if __name__ == "__main__":
    main()