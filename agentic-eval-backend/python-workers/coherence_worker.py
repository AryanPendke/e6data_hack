#!/usr/bin/env python3
"""
Coherence Evaluation Worker

This worker evaluates the internal coherence and logical consistency of responses.
Uses sentence embeddings to measure semantic flow and coherence patterns.

Scoring:
- 1.0: Highly coherent and logically consistent
- 0.8-0.9: Good coherence with minor inconsistencies
- 0.5-0.7: Moderate coherence issues
- 0.0-0.4: Poor coherence and logical flow
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
        extract_sentences, normalize_score, log_processing_info
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

class CoherenceEvaluator:
    """Evaluates text coherence using multiple metrics."""
    
    def __init__(self):
        self.sentence_model = None
        self.nli_model = None
        self.min_sentences = 2
        self.similarity_threshold = 0.2
        self.models_initialized = False
        
    def initialize_models(self):
        """Initialize required models with fallback."""
        if not HAS_ML_MODELS:
            print("ML models not available, using fallback scoring", file=sys.stderr)
            self.models_initialized = False
            return False
            
        try:
            # Try to load sentence transformer for embeddings
            print("Attempting to load sentence transformer...", file=sys.stderr)
            self.sentence_model = model_loader.get_sentence_transformer('all-MiniLM-L6-v2')
            
            # Try to load NLI model for contradiction detection
            print("Attempting to load NLI model...", file=sys.stderr)
            self.nli_model = model_loader.get_nli_model('roberta-large-mnli')
            
            print("Coherence evaluation models loaded successfully", file=sys.stderr)
            self.models_initialized = True
            return True
            
        except Exception as e:
            print(f"Failed to load coherence models: {e}", file=sys.stderr)
            print("Will use fallback simple scoring", file=sys.stderr)
            self.models_initialized = False
            return False
    
    def simple_sentence_flow(self, sentences: List[str]) -> Dict[str, float]:
        """Simple fallback sentence flow calculation."""
        if len(sentences) < 2:
            return {
                'flow_score': 1.0,
                'avg_similarity': 1.0,
                'min_similarity': 1.0,
                'similarity_variance': 0.0
            }
        
        # Simple keyword overlap between adjacent sentences
        similarities = []
        for i in range(len(sentences) - 1):
            sent1_words = set(clean_text(sentences[i].lower()).split())
            sent2_words = set(clean_text(sentences[i + 1].lower()).split())
            
            if sent1_words and sent2_words:
                overlap = len(sent1_words.intersection(sent2_words))
                similarity = overlap / max(len(sent1_words), len(sent2_words))
                similarities.append(similarity)
            else:
                similarities.append(0.0)
        
        if similarities:
            avg_sim = sum(similarities) / len(similarities)
            min_sim = min(similarities)
            # Simple variance calculation
            variance = sum((s - avg_sim) ** 2 for s in similarities) / len(similarities)
            flow_score = avg_sim * (1.0 - min(variance, 0.5))
        else:
            avg_sim = min_sim = flow_score = 0.5
            variance = 0.0
        
        return {
            'flow_score': flow_score,
            'avg_similarity': avg_sim,
            'min_similarity': min_sim,
            'similarity_variance': variance
        }
    
    def calculate_sentence_flow_coherence(self, sentences: List[str]) -> Dict[str, float]:
        """Calculate coherence based on sentence-to-sentence semantic flow."""
        if len(sentences) < 2:
            return {
                'flow_score': 1.0,
                'avg_similarity': 1.0,
                'min_similarity': 1.0,
                'similarity_variance': 0.0
            }
        
        # Use simple method if no ML models
        if not self.models_initialized:
            return self.simple_sentence_flow(sentences)
        
        try:
            # Get sentence embeddings
            embeddings = model_loader.get_embeddings(sentences)
            
            # Calculate pairwise similarities between adjacent sentences
            adjacent_similarities = []
            for i in range(len(embeddings) - 1):
                if HAS_NUMPY:
                    similarity = np.dot(embeddings[i], embeddings[i + 1]) / (
                        np.linalg.norm(embeddings[i]) * np.linalg.norm(embeddings[i + 1])
                    )
                else:
                    # Simple dot product fallback
                    similarity = sum(a * b for a, b in zip(embeddings[i], embeddings[i + 1]))
                    similarity = max(0.0, min(1.0, similarity))
                adjacent_similarities.append(max(0.0, similarity))
            
            # Calculate overall similarities (not just adjacent)
            all_similarities = []
            for i in range(len(embeddings)):
                for j in range(i + 1, len(embeddings)):
                    if HAS_NUMPY:
                        similarity = np.dot(embeddings[i], embeddings[j]) / (
                            np.linalg.norm(embeddings[i]) * np.linalg.norm(embeddings[j])
                        )
                    else:
                        similarity = sum(a * b for a, b in zip(embeddings[i], embeddings[j]))
                        similarity = max(0.0, min(1.0, similarity))
                    all_similarities.append(max(0.0, similarity))
            
            # Calculate metrics
            if adjacent_similarities:
                avg_adjacent_similarity = sum(adjacent_similarities) / len(adjacent_similarities)
                min_adjacent_similarity = min(adjacent_similarities)
                
                if HAS_NUMPY and len(adjacent_similarities) > 1:
                    similarity_variance = np.var(adjacent_similarities)
                else:
                    # Simple variance calculation
                    mean = avg_adjacent_similarity
                    variance = sum((s - mean) ** 2 for s in adjacent_similarities) / len(adjacent_similarities)
                    similarity_variance = variance
            else:
                avg_adjacent_similarity = min_adjacent_similarity = 0.0
                similarity_variance = 0.0
            
            # Flow score: higher for consistent similarity between adjacent sentences
            flow_score = avg_adjacent_similarity * (1.0 - min(similarity_variance, 0.5))
            
            result = {
                'flow_score': flow_score,
                'avg_similarity': avg_adjacent_similarity,
                'min_similarity': min_adjacent_similarity,
                'similarity_variance': similarity_variance,
                'all_similarities_avg': sum(all_similarities) / len(all_similarities) if all_similarities else 0.0
            }
            
            return result
            
        except Exception as e:
            print(f"Sentence flow coherence error: {e}", file=sys.stderr)
            # Fallback to simple method
            return self.simple_sentence_flow(sentences)
    
    def detect_contradictions(self, sentences: List[str]) -> Dict[str, Any]:
        """Detect potential contradictions between sentences."""
        if len(sentences) < 2:
            return {
                'contradiction_score': 1.0,
                'potential_contradictions': 0,
                'contradiction_pairs': []
            }
        
        try:
            contradiction_pairs = []
            contradiction_indicators = [
                # Direct contradictions
                (r'\b(?:not|never|no)\b', r'\b(?:always|yes|definitely)\b'),
                (r'\b(?:impossible|cannot|unable)\b', r'\b(?:possible|can|able)\b'),
                (r'\b(?:increase|more|higher|greater)\b', r'\b(?:decrease|less|lower|fewer)\b'),
                
                # Temporal contradictions
                (r'\b(?:before|earlier|previously)\b', r'\b(?:after|later|subsequently)\b'),
                (r'\b(?:past|historical|was|were)\b', r'\b(?:future|will be|upcoming)\b'),
                
                # Quantity contradictions
                (r'\b(?:all|every|always|never)\b', r'\b(?:some|few|sometimes|occasionally)\b'),
                (r'\b(?:large|big|huge|massive)\b', r'\b(?:small|tiny|minimal|negligible)\b'),
                
                # Quality contradictions
                (r'\b(?:good|excellent|positive|beneficial)\b', r'\b(?:bad|poor|negative|harmful)\b'),
                (r'\b(?:easy|simple|straightforward)\b', r'\b(?:difficult|complex|complicated)\b')
            ]
            
            # Check for contradictory patterns
            for i, sent1 in enumerate(sentences):
                for j, sent2 in enumerate(sentences[i + 1:], i + 1):
                    sent1_lower = sent1.lower()
                    sent2_lower = sent2.lower()
                    
                    # Check for contradictory indicators
                    for pattern1, pattern2 in contradiction_indicators:
                        if (re.search(pattern1, sent1_lower) and re.search(pattern2, sent2_lower)) or \
                           (re.search(pattern2, sent1_lower) and re.search(pattern1, sent2_lower)):
                            
                            # Additional check: ensure they're talking about similar topics
                            sent1_words = set(sent1_lower.split())
                            sent2_words = set(sent2_lower.split())
                            overlap = len(sent1_words.intersection(sent2_words))
                            
                            if overlap >= 2:  # At least 2 words in common
                                contradiction_pairs.append({
                                    'sentence1_idx': i,
                                    'sentence2_idx': j,
                                    'sentence1': sent1[:100] + "..." if len(sent1) > 100 else sent1,
                                    'sentence2': sent2[:100] + "..." if len(sent2) > 100 else sent2,
                                    'pattern_type': f"{pattern1} vs {pattern2}"
                                })
                            break
            
            # Use NLI to verify potential contradictions if models available
            verified_contradictions = []
            if self.models_initialized and HAS_ML_MODELS:
                for pair in contradiction_pairs[:5]:  # Limit to avoid too many calls
                    try:
                        sent1_idx = pair['sentence1_idx']
                        sent2_idx = pair['sentence2_idx']
                        
                        # Use NLI to check for contradiction
                        nli_result = model_loader.predict_nli(sentences[sent1_idx], sentences[sent2_idx])
                        contradiction_prob = nli_result.get('contradiction', 0.0)
                        
                        if contradiction_prob > 0.5:
                            pair['nli_contradiction_prob'] = contradiction_prob
                            verified_contradictions.append(pair)
                            
                    except Exception as e:
                        print(f"NLI contradiction check error: {e}", file=sys.stderr)
                        continue
            else:
                # Without NLI, consider pattern-based contradictions but be more conservative
                verified_contradictions = contradiction_pairs[:2]  # Limit to avoid false positives
            
            # Calculate contradiction score
            total_sentence_pairs = len(sentences) * (len(sentences) - 1) // 2
            contradiction_ratio = len(verified_contradictions) / max(total_sentence_pairs, 1)
            
            # Higher score = fewer contradictions
            contradiction_score = max(0.0, 1.0 - contradiction_ratio * 2)
            
            return {
                'contradiction_score': contradiction_score,
                'potential_contradictions': len(contradiction_pairs),
                'verified_contradictions': len(verified_contradictions),
                'contradiction_pairs': verified_contradictions
            }
            
        except Exception as e:
            print(f"Contradiction detection error: {e}", file=sys.stderr)
            return {
                'contradiction_score': 0.8,
                'potential_contradictions': 0,
                'contradiction_pairs': [],
                'error': str(e)
            }
    
    def evaluate_structural_coherence(self, text: str, sentences: List[str]) -> Dict[str, Any]:
        """Evaluate structural coherence patterns."""
        try:
            # Check for transition words/phrases
            transition_patterns = [
                r'\b(?:however|nevertheless|nonetheless|although|though)\b',
                r'\b(?:furthermore|moreover|additionally|also|likewise)\b',
                r'\b(?:therefore|thus|consequently|as a result|hence)\b',
                r'\b(?:for example|for instance|such as|specifically)\b',
                r'\b(?:first|second|third|finally|in conclusion|to summarize)\b',
                r'\b(?:in contrast|on the other hand|conversely|alternatively)\b'
            ]
            
            transition_count = 0
            for pattern in transition_patterns:
                transition_count += len(re.findall(pattern, text.lower()))
            
            # Transition score: good use of transitions improves coherence
            transition_density = transition_count / len(sentences) if sentences else 0
            transition_score = min(1.0, transition_density * 2)  # Cap at 1.0
            
            # Check for repetitive patterns (negative for coherence)
            word_counts = {}
            total_words = 0
            for sentence in sentences:
                words = clean_text(sentence.lower()).split()
                total_words += len(words)
                for word in words:
                    if len(word) > 3:  # Skip short words
                        word_counts[word] = word_counts.get(word, 0) + 1
            
            # Calculate repetition score
            if total_words > 0:
                max_repetition = max(word_counts.values()) if word_counts else 1
                repetition_ratio = max_repetition / total_words
                repetition_score = max(0.0, 1.0 - repetition_ratio * 10)  # Penalize excessive repetition
            else:
                repetition_score = 1.0
            
            # Check for logical flow indicators
            logical_indicators = [
                r'\b(?:because|since|as|due to|owing to)\b',  # Causal
                r'\b(?:if|when|while|unless|provided that)\b',  # Conditional
                r'\b(?:although|despite|in spite of|even though)\b',  # Contrast
                r'\b(?:similar to|like|unlike|compared to)\b'  # Comparison
            ]
            
            logical_count = 0
            for pattern in logical_indicators:
                logical_count += len(re.findall(pattern, text.lower()))
            
            logical_density = logical_count / len(sentences) if sentences else 0
            logical_score = min(1.0, logical_density * 1.5)
            
            return {
                'transition_score': transition_score,
                'repetition_score': repetition_score,
                'logical_flow_score': logical_score,
                'transition_count': transition_count,
                'unique_word_ratio': len(word_counts) / max(total_words, 1)
            }
            
        except Exception as e:
            print(f"Structural coherence error: {e}", file=sys.stderr)
            return {
                'transition_score': 0.5,
                'repetition_score': 0.5,
                'logical_flow_score': 0.5,
                'transition_count': 0,
                'unique_word_ratio': 0.5,
                'error': str(e)
            }
    
    def calculate_overall_coherence(self, flow_metrics: Dict, contradiction_metrics: Dict, 
                                   structural_metrics: Dict, sentences: List[str]) -> Tuple[float, Dict[str, Any]]:
        """Calculate overall coherence score."""
        
        # Extract individual scores
        flow_score = flow_metrics.get('flow_score', 0.5)
        contradiction_score = contradiction_metrics.get('contradiction_score', 0.8)
        transition_score = structural_metrics.get('transition_score', 0.5)
        repetition_score = structural_metrics.get('repetition_score', 0.5)
        logical_score = structural_metrics.get('logical_flow_score', 0.5)
        
        # Weighted combination
        weights = {
            'semantic_flow': 0.35,
            'contradiction_absence': 0.25,
            'structural_transitions': 0.20,
            'repetition_control': 0.10,
            'logical_indicators': 0.10
        }
        
        weighted_score = (
            weights['semantic_flow'] * flow_score +
            weights['contradiction_absence'] * contradiction_score +
            weights['structural_transitions'] * transition_score +
            weights['repetition_control'] * repetition_score +
            weights['logical_indicators'] * logical_score
        )
        
        # Length penalty for very short responses
        if len(sentences) < 2:
            length_penalty = 0.8
        elif len(sentences) < 3:
            length_penalty = 0.9
        else:
            length_penalty = 1.0
        
        final_score = weighted_score * length_penalty
        
        details = {
            'component_scores': {
                'semantic_flow': round(flow_score, 3),
                'contradiction_absence': round(contradiction_score, 3),
                'structural_transitions': round(transition_score, 3),
                'repetition_control': round(repetition_score, 3),
                'logical_indicators': round(logical_score, 3)
            },
            'weighted_score': round(weighted_score, 3),
            'length_penalty': length_penalty,
            'sentence_count': len(sentences),
            'flow_details': flow_metrics,
            'contradiction_details': contradiction_metrics,
            'structural_details': structural_metrics
        }
        
        return normalize_score(final_score), details
    
    def evaluate_coherence(self, response: str) -> Tuple[float, Dict[str, Any]]:
        """Main coherence evaluation method."""
        start_time = time.time()
        
        # Try to initialize models if not done
        if not self.models_initialized and HAS_ML_MODELS:
            self.initialize_models()
        
        # Clean input
        response = clean_text(response)
        
        if not response:
            return 0.0, {"error": "Empty response"}
        
        try:
            # Extract sentences
            sentences = extract_sentences(response)
            
            if not sentences:
                return 0.0, {"error": "No sentences found"}
            
            if len(sentences) == 1:
                # Single sentence - evaluate basic coherence
                return 0.8, {
                    "message": "Single sentence response",
                    "sentence_count": 1,
                    "processing_time": time.time() - start_time,
                    "method": "single_sentence"
                }
            
            # Step 1: Evaluate semantic flow coherence
            flow_metrics = self.calculate_sentence_flow_coherence(sentences)
            
            # Step 2: Detect contradictions
            contradiction_metrics = self.detect_contradictions(sentences)
            
            # Step 3: Evaluate structural coherence
            structural_metrics = self.evaluate_structural_coherence(response, sentences)
            
            # Step 4: Calculate overall coherence score
            coherence_score, details = self.calculate_overall_coherence(
                flow_metrics, contradiction_metrics, structural_metrics, sentences
            )
            
            # Add processing metadata
            details.update({
                "processing_time": time.time() - start_time,
                "sentence_count": len(sentences),
                "word_count": len(response.split()),
                "method": "ml_enhanced" if self.models_initialized else "simple_fallback",
                "models_available": HAS_ML_MODELS,
                "numpy_available": HAS_NUMPY
            })
            
            return coherence_score, details
            
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"Coherence evaluation error: {e}", file=sys.stderr)
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
        print("Coherence worker starting...", file=sys.stderr)
        
        # Load input data
        input_data = load_json_input()
        print(f"Loaded input data: {len(str(input_data))} chars", file=sys.stderr)
        
        if not input_data:
            return_error("No input data received")
        
        # Extract required fields
        response_id = input_data.get('response_id', 'unknown')
        response_text = input_data.get('response_text', '')
        
        print(f"Processing response_id: {response_id}", file=sys.stderr)
        print(f"Response length: {len(response_text)}", file=sys.stderr)
        
        if not response_text:
            return_error("Empty response text")
        
        # Initialize evaluator
        evaluator = CoherenceEvaluator()
        
        # Perform coherence evaluation
        score, details = evaluator.evaluate_coherence(response_text)
        
        # Log processing info
        processing_time = details.get("processing_time", 0)
        log_processing_info("CoherenceWorker", response_id, processing_time, score)
        
        print(f"Returning score: {score}", file=sys.stderr)
        
        # Return result
        return_score(score, details)
        
    except Exception as e:
        print(f"Main function error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return_error(f"Coherence evaluation failed: {str(e)}")

if __name__ == "__main__":
    main()