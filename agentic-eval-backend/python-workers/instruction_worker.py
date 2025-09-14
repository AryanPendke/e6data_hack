#!/usr/bin/env python3
"""
Instruction Following Evaluation Worker

This worker evaluates how well an agent follows explicit instructions in the prompt.
Uses regex-based checks for format requirements and falls back to LLM judgment for complex cases.

Scoring:
- 1.0: Perfect instruction following
- 0.8-0.9: Minor deviations
- 0.5-0.7: Some requirements missed
- 0.0-0.4: Major instruction violations
"""

import re
import sys
import time
import os
import json
import traceback
from typing import Dict, List, Tuple, Any

# Add the current directory and shared directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
shared_dir = os.path.join(current_dir, 'shared')
sys.path.insert(0, current_dir)
sys.path.insert(0, shared_dir)

# Import shared utilities with error handling
try:
    from shared.utils import (
        load_json_input, return_score, return_error, clean_text,
        check_format_requirements, normalize_score, log_processing_info
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
    
    def normalize_score(score):
        return max(0.0, min(1.0, float(score)))
    
    def log_processing_info(worker, response_id, time_taken, score):
        print(f"[{worker}] {response_id}: {score:.3f} ({time_taken:.2f}s)", file=sys.stderr)
    
    def check_format_requirements(text, requirements):
        """Simple fallback format checking"""
        results = {}
        
        # Word count check
        if 'word_count' in requirements:
            words = len(clean_text(text).split())
            min_words = requirements['word_count'].get('min', 0)
            max_words = requirements['word_count'].get('max', float('inf'))
            meets_req = min_words <= words <= max_words
            results['word_count'] = {'meets_requirement': meets_req, 'count': words}
        
        # Bullet points check
        if 'bullet_points' in requirements:
            bullet_count = len(re.findall(r'^\s*[\-\*\•]\s', text, re.MULTILINE))
            bullet_count += len(re.findall(r'^\s*\d+\.\s', text, re.MULTILINE))
            required_count = requirements['bullet_points']
            meets_req = bullet_count >= required_count
            results['bullet_points'] = {'meets_requirement': meets_req, 'count': bullet_count}
        
        # Required terms check
        if 'required_terms' in requirements:
            terms = requirements['required_terms']
            found_terms = [term for term in terms if term.lower() in text.lower()]
            meets_req = len(found_terms) == len(terms)
            results['required_terms'] = {
                'meets_requirement': meets_req,
                'found': found_terms,
                'missing': [t for t in terms if t not in found_terms]
            }
        
        return results

# Try to import requests with fallback
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    print("Requests library not available, LLM fallback disabled", file=sys.stderr)
    HAS_REQUESTS = False

class InstructionFollowingEvaluator:
    """Evaluates instruction following using regex patterns and optional LLM fallback."""
    
    def __init__(self):
        self.openai_api_key = os.getenv('OPENAI_API_KEY')
        self.use_llm_fallback = bool(self.openai_api_key) and HAS_REQUESTS
        
    def extract_format_requirements(self, prompt: str) -> Dict[str, Any]:
        """Extract format requirements from the prompt using regex."""
        requirements = {}
        
        try:
            # Word count requirements
            word_patterns = [
                r'(?:in|write|use|exactly|at least|no more than|maximum|minimum)\s*(\d+)\s*words?',
                r'(\d+)\s*word\s*(?:limit|maximum|minimum)',
                r'(?:between|from)\s*(\d+)\s*(?:to|and|-)\s*(\d+)\s*words?'
            ]
            
            for pattern in word_patterns:
                matches = re.findall(pattern, prompt.lower())
                if matches:
                    if len(matches[0]) == 2 if isinstance(matches[0], tuple) else False:
                        # Range format
                        requirements['word_count'] = {
                            'min': int(matches[0][0]),
                            'max': int(matches[0][1])
                        }
                    else:
                        # Single number - interpret based on context
                        num = int(matches[0] if isinstance(matches[0], str) else matches[0][0])
                        if 'at least' in prompt.lower() or 'minimum' in prompt.lower():
                            requirements['word_count'] = {'min': num, 'max': float('inf')}
                        elif 'no more than' in prompt.lower() or 'maximum' in prompt.lower():
                            requirements['word_count'] = {'min': 0, 'max': num}
                        else:
                            # Assume exact or approximately
                            requirements['word_count'] = {'min': int(num * 0.9), 'max': int(num * 1.1)}
                    break
            
            # Bullet point requirements
            bullet_patterns = [
                r'(?:list|provide|include|use)\s*(\d+)\s*(?:bullet\s*points?|bullets?)',
                r'(\d+)\s*(?:bullet\s*points?|bullets?)',
                r'(?:in|as)\s*(?:bullet\s*points?|bullets?)'
            ]
            
            for pattern in bullet_patterns:
                matches = re.findall(pattern, prompt.lower())
                if matches:
                    if matches[0].isdigit():
                        requirements['bullet_points'] = int(matches[0])
                    else:
                        requirements['bullet_points'] = 3  # Default assumption
                    break
            
            # Required terms/keywords
            required_terms_patterns = [
                r'(?:include|mention|use|must contain)\s+(?:the\s+)?(?:word|term|phrase)s?\s+["\']([^"\']+)["\']',
                r'make sure to (?:include|mention|use)\s+["\']([^"\']+)["\']',
                r'(?:must|should) (?:include|mention|contain)\s+["\']([^"\']+)["\']'
            ]
            
            required_terms = []
            for pattern in required_terms_patterns:
                matches = re.findall(pattern, prompt.lower())
                required_terms.extend(matches)
            
            if required_terms:
                requirements['required_terms'] = required_terms
            
            # Forbidden terms
            forbidden_patterns = [
                r'(?:do not|don\'t|avoid|never)\s+(?:use|mention|include)\s+["\']([^"\']+)["\']',
                r'(?:without|excluding)\s+["\']([^"\']+)["\']'
            ]
            
            forbidden_terms = []
            for pattern in forbidden_patterns:
                matches = re.findall(pattern, prompt.lower())
                forbidden_terms.extend(matches)
            
            if forbidden_terms:
                requirements['forbidden_terms'] = forbidden_terms
            
            # Format requirements
            format_patterns = [
                (r'(?:write|format)\s+(?:as|in)\s+(?:a\s+)?paragraphs?', 'paragraph'),
                (r'(?:write|format)\s+(?:as|in)\s+(?:a\s+)?lists?', 'list'),
                (r'start\s+with\s+["\']([^"\']+)["\']', 'starts_with'),
                (r'end\s+with\s+["\']([^"\']+)["\']', 'ends_with'),
                (r'(?:in|use)\s+(?:a\s+)?formal\s+tone', 'formal_tone'),
                (r'(?:in|use)\s+(?:a\s+)?informal\s+tone', 'informal_tone')
            ]
            
            for pattern, req_type in format_patterns:
                if re.search(pattern, prompt.lower()):
                    if req_type in ['starts_with', 'ends_with']:
                        match = re.search(pattern, prompt.lower())
                        if match:
                            requirements[req_type] = match.group(1)
                    else:
                        requirements[req_type] = True
        
        except Exception as e:
            print(f"Error extracting requirements: {e}", file=sys.stderr)
        
        return requirements
    
    def evaluate_format_compliance(self, response: str, requirements: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
        """Evaluate format compliance using regex checks."""
        if not requirements:
            return 1.0, {"message": "No specific format requirements found"}
        
        try:
            results = check_format_requirements(response, requirements)
            
            # Calculate compliance score
            total_requirements = len(requirements)
            met_requirements = 0
            details = {}
            
            for req_type, result in results.items():
                if result['meets_requirement']:
                    met_requirements += 1
                details[req_type] = result
            
            # Check additional format requirements
            if 'starts_with' in requirements:
                starts_correctly = response.strip().lower().startswith(requirements['starts_with'].lower())
                met_requirements += 1 if starts_correctly else 0
                details['starts_with'] = {'meets_requirement': starts_correctly}
            
            if 'ends_with' in requirements:
                ends_correctly = response.strip().lower().endswith(requirements['ends_with'].lower())
                met_requirements += 1 if ends_correctly else 0
                details['ends_with'] = {'meets_requirement': ends_correctly}
            
            # Calculate final compliance score
            compliance_score = met_requirements / total_requirements if total_requirements > 0 else 1.0
            
            return compliance_score, details
        
        except Exception as e:
            print(f"Format compliance error: {e}", file=sys.stderr)
            return 0.5, {"error": str(e)}
    
    def evaluate_with_llm(self, prompt: str, response: str) -> Tuple[float, Dict[str, Any]]:
        """Evaluate instruction following using LLM (GPT-4o-mini)."""
        if not self.use_llm_fallback:
            return 0.5, {"message": "LLM evaluation not available"}
        
        evaluation_prompt = f"""
You are an expert evaluator assessing how well a response follows the given instructions.

PROMPT: {prompt}

RESPONSE: {response}

Please evaluate how well the response follows the instructions on a scale of 0.0 to 1.0:
- 1.0: Perfect instruction following
- 0.8-0.9: Minor deviations from instructions
- 0.5-0.7: Some requirements missed but generally follows intent
- 0.3-0.4: Major instruction violations
- 0.0-0.2: Completely ignores instructions

Consider:
1. Format requirements (word count, structure, style)
2. Content requirements (topics to cover, terms to include/avoid)
3. Tone and style requirements
4. Specific constraints or limitations

Respond with ONLY a JSON object in this format:
{{"score": 0.85, "reasoning": "Brief explanation of the score"}}
"""
        
        try:
            response_data = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": "You are a precise instruction-following evaluator. Always respond with valid JSON."},
                        {"role": "user", "content": evaluation_prompt}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 200
                },
                timeout=30
            )
            
            if response_data.status_code == 200:
                result = response_data.json()
                content = result['choices'][0]['message']['content'].strip()
                
                # Parse JSON response
                eval_result = json.loads(content)
                
                score = float(eval_result.get('score', 0.5))
                reasoning = eval_result.get('reasoning', 'No reasoning provided')
                
                return normalize_score(score), {"llm_reasoning": reasoning}
            else:
                print(f"LLM API error: {response_data.status_code}", file=sys.stderr)
                return 0.5, {"error": "LLM API request failed"}
                
        except Exception as e:
            print(f"LLM evaluation error: {e}", file=sys.stderr)
            return 0.5, {"error": str(e)}
    
    def simple_instruction_evaluation(self, prompt: str, response: str) -> Tuple[float, Dict[str, Any]]:
        """Simple fallback evaluation when LLM is not available."""
        try:
            # Basic heuristics for instruction following
            score_factors = []
            
            # Check if response addresses the prompt topic
            prompt_words = set(clean_text(prompt.lower()).split())
            response_words = set(clean_text(response.lower()).split())
            
            # Remove common words
            common_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were'}
            prompt_keywords = prompt_words - common_words
            response_keywords = response_words - common_words
            
            if prompt_keywords:
                overlap_ratio = len(prompt_keywords.intersection(response_keywords)) / len(prompt_keywords)
                score_factors.append(('topic_relevance', overlap_ratio))
            else:
                score_factors.append(('topic_relevance', 0.8))
            
            # Check response length appropriateness
            response_length = len(response.split())
            if response_length < 5:
                length_score = 0.2
            elif response_length < 20:
                length_score = 0.6
            else:
                length_score = 1.0
            score_factors.append(('length_appropriateness', length_score))
            
            # Check for question answering
            if '?' in prompt:
                if any(word in response.lower() for word in ['yes', 'no', 'because', 'due to', 'since', 'therefore']):
                    answer_score = 0.8
                else:
                    answer_score = 0.6
                score_factors.append(('question_answering', answer_score))
            
            # Calculate weighted average
            total_weight = len(score_factors)
            if total_weight > 0:
                final_score = sum(score for _, score in score_factors) / total_weight
            else:
                final_score = 0.7  # Default reasonable score
            
            details = {
                'evaluation_method': 'simple_heuristic',
                'score_factors': dict(score_factors),
                'prompt_keywords_count': len(prompt_keywords),
                'response_length': response_length
            }
            
            return final_score, details
            
        except Exception as e:
            print(f"Simple evaluation error: {e}", file=sys.stderr)
            return 0.5, {"error": str(e)}
    
    def evaluate_instruction_following(self, prompt: str, response: str) -> Tuple[float, Dict[str, Any]]:
        """Main evaluation method combining regex and LLM approaches."""
        start_time = time.time()
        
        # Clean inputs
        prompt = clean_text(prompt)
        response = clean_text(response)
        
        if not response:
            return 0.0, {"error": "Empty response"}
        
        try:
            # Extract format requirements
            requirements = self.extract_format_requirements(prompt)
            
            # Evaluate format compliance
            compliance_score, compliance_details = self.evaluate_format_compliance(response, requirements)
            
            details = {
                "requirements_found": requirements,
                "compliance_details": compliance_details,
                "compliance_score": compliance_score,
                "evaluation_method": "regex_only"
            }
            
            # If compliance is perfect or no requirements found, use LLM for nuanced evaluation
            if compliance_score >= 0.95 or not requirements:
                if self.use_llm_fallback:
                    llm_score, llm_details = self.evaluate_with_llm(prompt, response)
                    details["llm_details"] = llm_details
                    details["evaluation_method"] = "regex_and_llm"
                    
                    # Combine scores: 70% compliance, 30% LLM judgment
                    final_score = 0.7 * compliance_score + 0.3 * llm_score
                else:
                    # Use simple heuristic evaluation
                    simple_score, simple_details = self.simple_instruction_evaluation(prompt, response)
                    details["simple_details"] = simple_details
                    details["evaluation_method"] = "regex_and_heuristic"
                    
                    # Combine scores: 60% compliance, 40% heuristic
                    final_score = 0.6 * compliance_score + 0.4 * simple_score
            else:
                final_score = compliance_score
            
            # Add processing time
            processing_time = time.time() - start_time
            details["processing_time"] = processing_time
            
            return normalize_score(final_score), details
            
        except Exception as e:
            processing_time = time.time() - start_time
            print(f"Instruction evaluation error: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return 0.5, {
                "error": str(e),
                "processing_time": processing_time,
                "method": "error_fallback"
            }

def main():
    """Main execution function."""
    try:
        print("Instruction worker starting...", file=sys.stderr)
        
        # Load input data
        input_data = load_json_input()
        print(f"Loaded input data: {len(str(input_data))} chars", file=sys.stderr)
        
        if not input_data:
            return_error("No input data received")
        
        # Extract required fields
        response_id = input_data.get('response_id', 'unknown')
        prompt = input_data.get('prompt', '')
        response_text = input_data.get('response_text', '')
        
        print(f"Processing response_id: {response_id}", file=sys.stderr)
        print(f"Prompt length: {len(prompt)}", file=sys.stderr)
        print(f"Response length: {len(response_text)}", file=sys.stderr)
        
        if not response_text:
            return_error("Empty response text")
        
        if not prompt:
            return_error("Empty prompt")
        
        # Initialize evaluator
        evaluator = InstructionFollowingEvaluator()
        
        # Perform evaluation
        score, details = evaluator.evaluate_instruction_following(prompt, response_text)
        
        # Log processing info
        processing_time = details.get("processing_time", 0)
        log_processing_info("InstructionWorker", response_id, processing_time, score)
        
        print(f"Returning score: {score}", file=sys.stderr)
        
        # Return result
        return_score(score, details)
        
    except Exception as e:
        print(f"Main function error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return_error(f"Instruction evaluation failed: {str(e)}")

if __name__ == "__main__":
    main()