#!/usr/bin/env python3
"""
Accuracy Evaluation Worker

This worker evaluates the accuracy of responses by comparing them against reference answers.
Uses BERTScore and semantic similarity for comparison when reference is available.
Falls back to consistency and factual verification when no reference is provided.

Scoring:
- 1.0: Perfect accuracy match with reference
- 0.8-0.9: High accuracy with minor differences
- 0.5-0.7: Moderate accuracy
- 0.0-0.4: Poor accuracy or major factual errors
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

class AccuracyEvaluator:
    """Evaluates response accuracy using multiple methods."""
    
    def __init__(self):
        self.sentence_model = None
        self.nli_model = None
        self.similarity_threshold = 0.7
        self.bert_score_threshold = 0.8
        self.models_initialized = False
        
    def initialize_models(self):
        """Initialize required models with fallback."""
        if not HAS_ML_MODELS:
            print("ML models not available, using fallback scoring", file=sys.stderr)
            self.models_initialized = False
            return False
            
        try:
            # Try to load sentence transformer for similarity
            print("Attempting to load sentence transformer...", file=sys.stderr)
            self.sentence_model = model_loader.get_sentence_transformer('all-MiniLM-L6-v2')
            
            # Try to load NLI model for entailment checking
            print("Attempting to load NLI model...", file=sys.stderr)
            self.nli_model = model_loader.get_nli_model('roberta-large-mnli')
            
            print("Accuracy evaluation models loaded successfully", file=sys.stderr)
            self.models_initialized = True
            return True
            
        except Exception as e:
            print(f"Failed to load accuracy models: {e}", file=sys.stderr)
            print("Will use fallback simple scoring", file=sys.stderr)
            self.models_initialized = False
            return False
    
    def calculate_text_similarity(self, text1: str, text2: str) -> float:
        """Simple text similarity fallback."""
        if not text1 or not text2:
            return 0.0
        
        words1 = set(clean_text(text1.lower()).split())
        words2 = set(clean_text(text2.lower()).split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union if union > 0 else 0.0
    
    def calculate_bert_score(self, response: str, reference: str) -> Dict[str, float]:
        """Calculate BERTScore between response and reference."""
        if not self.models_initialized:
            # Fallback to simple similarity
            similarity = self.calculate_text_similarity(response, reference)
            return {
                'precision': similarity,
                'recall': similarity,
                'f1': similarity,
                'fallback': True
            }
        
        try:
            # Use model loader's BERTScore function if available
            if hasattr(model_loader, 'calculate_bert_score'):
                bert_scores = model_loader.calculate_bert_score([response], [reference])
                
                return {
                    'precision': bert_scores.get('precision', 0.0),
                    'recall': bert_scores.get('recall', 0.0),
                    'f1': bert_scores.get('f1', 0.0)
                }
            else:
                # Fallback to simple similarity
                similarity = self.calculate_text_similarity(response, reference)
                return {
                    'precision': similarity,
                    'recall': similarity,
                    'f1': similarity,
                    'fallback': True
                }
                
        except Exception as e:
            print(f"BERTScore calculation error: {e}", file=sys.stderr)
            # Fallback to simple similarity
            similarity = self.calculate_text_similarity(response, reference)
            return {
                'precision': similarity,
                'recall': similarity,
                'f1': similarity,
                'fallback': True,
                'error': str(e)
            }
    
    def calculate_semantic_similarity(self, response: str, reference: str) -> Dict[str, float]:
        """Calculate semantic similarity using sentence embeddings."""
        if not self.models_initialized:
            # Fallback to simple similarity
            similarity = self.calculate_text_similarity(response, reference)
            return {
                'overall_similarity': similarity,
                'sentence_level_similarity': similarity,
                'combined_similarity': similarity,
                'fallback': True
            }
        
        try:
            # Get embeddings for both texts
            embeddings = model_loader.get_embeddings([response, reference])
            response_embed = embeddings[0]
            reference_embed = embeddings[1]
            
            # Calculate cosine similarity
            if HAS_NUMPY:
                cosine_sim = np.dot(response_embed, reference_embed) / (
                    np.linalg.norm(response_embed) * np.linalg.norm(reference_embed)
                )
            else:
                # Simple dot product fallback
                cosine_sim = sum(a * b for a, b in zip(response_embed, reference_embed))
                cosine_sim = max(0.0, min(1.0, cosine_sim))
            
            # Also calculate at sentence level
            response_sentences = extract_sentences(response)
            reference_sentences = extract_sentences(reference)
            
            sentence_similarities = []
            if response_sentences and reference_sentences:
                all_sentences = response_sentences + reference_sentences
                all_embeddings = model_loader.get_embeddings(all_sentences)
                
                resp_embeds = all_embeddings[:len(response_sentences)]
                ref_embeds = all_embeddings[len(response_sentences):]
                
                # Find best matches between response and reference sentences
                for resp_embed in resp_embeds:
                    max_sim = 0.0
                    for ref_embed in ref_embeds:
                        if HAS_NUMPY:
                            sim = np.dot(resp_embed, ref_embed) / (
                                np.linalg.norm(resp_embed) * np.linalg.norm(ref_embed)
                            )
                        else:
                            sim = sum(a * b for a, b in zip(resp_embed, ref_embed))
                            sim = max(0.0, min(1.0, sim))
                        max_sim = max(max_sim, sim)
                    sentence_similarities.append(max_sim)
            
            if sentence_similarities:
                avg_sentence_similarity = sum(sentence_similarities) / len(sentence_similarities)
            else:
                avg_sentence_similarity = cosine_sim
            
            result = {
                'overall_similarity': float(cosine_sim),
                'sentence_level_similarity': float(avg_sentence_similarity),
                'combined_similarity': float(0.6 * cosine_sim + 0.4 * avg_sentence_similarity)
            }
            
            return result
            
        except Exception as e:
            print(f"Semantic similarity error: {e}", file=sys.stderr)
            # Fallback to basic text similarity
            similarity = self.calculate_text_similarity(response, reference)
            return {
                'overall_similarity': similarity,
                'sentence_level_similarity': similarity,
                'combined_similarity': similarity,
                'fallback': True,
                'error': str(e)
            }
    
    def evaluate_factual_consistency(self, response: str, reference: str) -> Dict[str, Any]:
        """Evaluate factual consistency using key information extraction."""
        try:
            # Extract key information patterns
            key_patterns = [
                r'\b\d+(?:\.\d+)?%?\b',  # Numbers and percentages
                r'\b(?:19|20)\d{2}\b',   # Years
                r'\b[A-Z][a-z]+ [A-Z][a-z]+\b',  # Proper names (simplified)
                r'\$\d+(?:\.\d+)?[KMB]?\b',  # Money amounts
                r'\b\d+(?:\.\d+)?\s*(?:kg|lb|miles|km|meters|feet|inches|hours|minutes|days|years)\b'  # Units
            ]
            
            # Extract key info from reference
            reference_keys = set()
            for pattern in key_patterns:
                matches = re.findall(pattern, reference, re.IGNORECASE)
                reference_keys.update(match.lower() for match in matches)
            
            # Extract key info from response
            response_keys = set()
            for pattern in key_patterns:
                matches = re.findall(pattern, response, re.IGNORECASE)
                response_keys.update(match.lower() for match in matches)
            
            # Calculate coverage
            if not reference_keys:
                coverage_score = 1.0
                coverage_details = "No key information to verify"
            else:
                covered_keys = reference_keys.intersection(response_keys)
                coverage_score = len(covered_keys) / len(reference_keys)
                coverage_details = {
                    'total_key_info': len(reference_keys),
                    'covered_key_info': len(covered_keys),
                    'missed_key_info': list(reference_keys - covered_keys),
                    'extra_key_info': list(response_keys - reference_keys)
                }
            
            # Also check for key concepts using embeddings if available
            concept_coverage = 0.5  # Default
            if self.models_initialized:
                try:
                    reference_sentences = extract_sentences(reference)
                    response_sentences = extract_sentences(response)
                    
                    if reference_sentences and response_sentences:
                        # Get sentence embeddings
                        all_sentences = reference_sentences + response_sentences
                        embeddings = model_loader.get_embeddings(all_sentences)
                        
                        ref_embeds = embeddings[:len(reference_sentences)]
                        resp_embeds = embeddings[len(reference_sentences):]
                        
                        # For each reference sentence, find best match in response
                        concept_coverage_scores = []
                        for ref_embed in ref_embeds:
                            max_similarity = 0.0
                            for resp_embed in resp_embeds:
                                if HAS_NUMPY:
                                    similarity = np.dot(ref_embed, resp_embed) / (
                                        np.linalg.norm(ref_embed) * np.linalg.norm(resp_embed)
                                    )
                                else:
                                    similarity = sum(a * b for a, b in zip(ref_embed, resp_embed))
                                    similarity = max(0.0, min(1.0, similarity))
                                max_similarity = max(max_similarity, similarity)
                            concept_coverage_scores.append(max_similarity)
                        
                        concept_coverage = sum(concept_coverage_scores) / len(concept_coverage_scores) if concept_coverage_scores else 0.0
                        
                except Exception as e:
                    print(f"Concept coverage error: {e}", file=sys.stderr)
                    concept_coverage = 0.5
            
            return {
                'key_info_coverage': coverage_score,
                'concept_coverage': concept_coverage,
                'combined_coverage': 0.6 * coverage_score + 0.4 * concept_coverage,
                'coverage_details': coverage_details
            }
            
        except Exception as e:
            print(f"Key information coverage error: {e}", file=sys.stderr)
            return {
                'key_info_coverage': 0.5,
                'concept_coverage': 0.5,
                'combined_coverage': 0.5,
                'error': str(e)
            }
    
    def evaluate_without_reference(self, response: str, prompt: str, context: str) -> Tuple[float, Dict[str, Any]]:
        """Evaluate accuracy when no reference is available."""
        try:
            # Basic checks for factual consistency and reasonableness
            
            # Check for reasonable numerical claims
            numbers = re.findall(r'\b\d+(?:\.\d+)?%?\b', response)
            reasonable_numbers = 0
            total_numbers = len(numbers)
            
            for num_str in numbers:
                try:
                    if '%' in num_str:
                        num = float(num_str.replace('%', ''))
                        # Percentages should be 0-100
                        if 0 <= num <= 100:
                            reasonable_numbers += 1
                    else:
                        num = float(num_str)
                        # Basic reasonableness check
                        if 0 <= num <= 1000000:  # Arbitrary but reasonable upper bound
                            reasonable_numbers += 1
                except:
                    continue
            
            number_reasonableness = reasonable_numbers / max(total_numbers, 1)
            
            # Check for internal consistency using simple similarity
            sentences = extract_sentences(response)
            consistency_score = 1.0
            
            if len(sentences) > 1:
                # Simple consistency check using text similarity
                similarities = []
                for i in range(len(sentences)):
                    for j in range(i + 1, len(sentences)):
                        sim = self.calculate_text_similarity(sentences[i], sentences[j])
                        similarities.append(sim)
                
                consistency_score = sum(similarities) / len(similarities) if similarities else 1.0
            
            # Check relevance to prompt
            prompt_relevance = 1.0
            if prompt:
                prompt_response_similarity = self.calculate_text_similarity(prompt, response)
                prompt_relevance = max(0.3, prompt_response_similarity)  # Minimum baseline
            
            # Check for obvious factual errors (very basic)
            error_patterns = [
                r'(?:earth is flat|gravity doesn\'t exist|vaccines cause autism)',
                r'(?:2 \+ 2 = 5|1 \+ 1 = 3)',
                r'(?:water boils at 0|sun revolves around earth)'
            ]
            
            has_obvious_errors = any(re.search(pattern, response.lower()) for pattern in error_patterns)
            error_penalty = 0.3 if has_obvious_errors else 0.0
            
            # Check for factual claims
            claims = extract_claims(response)
            
            # Combine factors
            base_score = (
                0.3 * number_reasonableness +
                0.3 * consistency_score +
                0.3 * prompt_relevance +
                0.1 * (1.0 if claims else 0.5)  # Bonus for having verifiable claims
            )
            
            final_score = max(0.0, base_score - error_penalty)
            
            details = {
                'evaluation_method': 'no_reference_heuristic',
                'number_reasonableness': round(number_reasonableness, 3),
                'internal_consistency': round(consistency_score, 3),
                'prompt_relevance': round(prompt_relevance, 3),
                'has_obvious_errors': has_obvious_errors,
                'total_numbers_found': total_numbers,
                'reasonable_numbers': reasonable_numbers,
                'factual_claims_count': len(claims)
            }
            
            return final_score, details
            
        except Exception as e:
            print(f"No-reference evaluation error: {e}", file=sys.stderr)
            return 0.5, {'error': str(e), 'evaluation_method': 'fallback'}
    
    def calculate_overall_accuracy(self, bert_scores: Dict, semantic_scores: Dict, 
                                  consistency_scores: Dict) -> Tuple[float, Dict[str, Any]]:
        """Calculate overall accuracy score from component metrics."""
        
        # Extract component scores
        bert_f1 = bert_scores.get('f1', 0.0)
        semantic_sim = semantic_scores.get('combined_similarity', 0.0)
        info_coverage = consistency_scores.get('combined_coverage', 0.0)
        
        # Weights for different components
        weights = {
            'bert_score': 0.40,
            'semantic_similarity': 0.35,
            'information_coverage': 0.25
        }
        
        # Calculate weighted score
        weighted_score = (
            weights['bert_score'] * bert_f1 +
            weights['semantic_similarity'] * semantic_sim +
            weights['information_coverage'] * info_coverage
        )
        
        details = {
            'component_scores': {
                'bert_f1': round(bert_f1, 3),
                'semantic_similarity': round(semantic_sim, 3),
                'information_coverage': round(info_coverage, 3)
            },
            'component_weights': weights,
            'weighted_score': round(weighted_score, 3),
            'bert_details': bert_scores,
            'semantic_details': semantic_scores,
            'coverage_details': consistency_scores
        }
        
        return normalize_score(weighted_score), details
    
    def evaluate_accuracy(self, response: str, reference: str = "", prompt: str = "", context: str = "") -> Tuple[float, Dict[str, Any]]:
        """Main accuracy evaluation method."""
        start_time = time.time()
        
        # Try to initialize models if not done
        if not self.models_initialized and HAS_ML_MODELS:
            self.initialize_models()
        
        # Clean inputs
        response = clean_text(response)
        reference = clean_text(reference) if reference else ""
        prompt = clean_text(prompt) if prompt else ""
        context = clean_text(context) if context else ""
        
        if not response:
            return 0.0, {"error": "Empty response"}
        
        try:
            # If no reference is provided, use alternative evaluation
            if not reference:
                score, details = self.evaluate_without_reference(response, prompt, context)
                details.update({
                    "processing_time": time.time() - start_time,
                    "has_reference": False,
                    "method": "no_reference_heuristic",
                    "models_available": HAS_ML_MODELS,
                    "numpy_available": HAS_NUMPY
                })
                return score, details
            
            # Reference-based evaluation
            
            # Step 1: Calculate BERTScore or similarity
            bert_scores = self.calculate_bert_score(response, reference)
            
            # Step 2: Calculate semantic similarity
            semantic_scores = self.calculate_semantic_similarity(response, reference)
            
            # Step 3: Evaluate factual consistency and information coverage
            consistency_scores = self.evaluate_factual_consistency(response, reference)
            
            # Step 4: Calculate overall accuracy
            accuracy_score, details = self.calculate_overall_accuracy(
                bert_scores, semantic_scores, consistency_scores
            )
            
            # Add processing metadata
            details.update({
                "processing_time": time.time() - start_time,
                "has_reference": True,
                "reference_length": len(reference.split()),
                "method": "ml_enhanced" if self.models_initialized else "simple_fallback",
                "models_available": HAS_ML_MODELS,
                "numpy_available": HAS_NUMPY
            })
            
            return accuracy_score, details
            
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"Accuracy evaluation error: {e}", file=sys.stderr)
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
        print("Accuracy worker starting...", file=sys.stderr)
        
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
        reference = input_data.get('reference', '')
        
        print(f"Processing response_id: {response_id}", file=sys.stderr)
        print(f"Prompt length: {len(prompt)}", file=sys.stderr)
        print(f"Response length: {len(response_text)}", file=sys.stderr)
        print(f"Context length: {len(context)}", file=sys.stderr)
        print(f"Reference length: {len(reference)}", file=sys.stderr)
        
        if not response_text:
            return_error("Empty response text")
        
        # Initialize evaluator
        evaluator = AccuracyEvaluator()
        
        # Perform accuracy evaluation
        score, details = evaluator.evaluate_accuracy(response_text, reference, prompt, context)
        
        # Log processing info
        processing_time = details.get("processing_time", 0)
        log_processing_info("AccuracyWorker", response_id, processing_time, score)
        
        print(f"Returning score: {score}", file=sys.stderr)
        
        # Return result
        return_score(score, details)
        
    except Exception as e:
        print(f"Main function error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return_error(f"Accuracy evaluation failed: {str(e)}")

if __name__ == "__main__":
    main()