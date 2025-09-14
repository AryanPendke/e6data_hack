"""
Model loading utilities for evaluation workers.
Handles loading and caching of ML models to avoid repeated loading.
"""

import os
import sys
from typing import Optional, Dict, Any
import torch
from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification, pipeline
from sentence_transformers import SentenceTransformer

class ModelLoader:
    """Singleton class for loading and caching ML models."""
    
    _instance = None
    _models = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelLoader, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.initialized = True
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
            print(f"ModelLoader initialized with device: {self.device}", file=sys.stderr)
    
    def get_sentence_transformer(self, model_name: str = 'all-MiniLM-L6-v2') -> SentenceTransformer:
        """Load sentence transformer model for embeddings."""
        cache_key = f"sentence_transformer_{model_name}"
        
        if cache_key not in self._models:
            try:
                print(f"Loading sentence transformer: {model_name}", file=sys.stderr)
                model = SentenceTransformer(model_name, device=self.device)
                self._models[cache_key] = model
                print(f"Successfully loaded {model_name}", file=sys.stderr)
            except Exception as e:
                print(f"Failed to load sentence transformer {model_name}: {e}", file=sys.stderr)
                # Fallback to smaller model
                try:
                    model = SentenceTransformer('all-MiniLM-L12-v2', device=self.device)
                    self._models[cache_key] = model
                    print("Loaded fallback sentence transformer", file=sys.stderr)
                except Exception as e2:
                    print(f"Failed to load fallback model: {e2}", file=sys.stderr)
                    raise e2
        
        return self._models[cache_key]
    
    def get_nli_model(self, model_name: str = 'roberta-large-mnli') -> tuple:
        """Load NLI model for entailment detection."""
        cache_key = f"nli_{model_name}"
        
        if cache_key not in self._models:
            try:
                print(f"Loading NLI model: {model_name}", file=sys.stderr)
                
                # Try to load the model
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                model = AutoModelForSequenceClassification.from_pretrained(model_name)
                model.to(self.device)
                model.eval()
                
                self._models[cache_key] = (tokenizer, model)
                print(f"Successfully loaded NLI model: {model_name}", file=sys.stderr)
                
            except Exception as e:
                print(f"Failed to load NLI model {model_name}: {e}", file=sys.stderr)
                # Try fallback models
                fallback_models = ['facebook/bart-large-mnli', 'microsoft/deberta-base-mnli']
                
                for fallback in fallback_models:
                    try:
                        print(f"Trying fallback NLI model: {fallback}", file=sys.stderr)
                        tokenizer = AutoTokenizer.from_pretrained(fallback)
                        model = AutoModelForSequenceClassification.from_pretrained(fallback)
                        model.to(self.device)
                        model.eval()
                        
                        self._models[cache_key] = (tokenizer, model)
                        print(f"Successfully loaded fallback NLI model: {fallback}", file=sys.stderr)
                        break
                    except Exception as e2:
                        print(f"Failed to load fallback {fallback}: {e2}", file=sys.stderr)
                        continue
                else:
                    raise Exception("Failed to load any NLI model")
        
        return self._models[cache_key]
    
    def get_bert_model(self, model_name: str = 'bert-base-uncased') -> tuple:
        """Load BERT model for embeddings or classification."""
        cache_key = f"bert_{model_name}"
        
        if cache_key not in self._models:
            try:
                print(f"Loading BERT model: {model_name}", file=sys.stderr)
                tokenizer = AutoTokenizer.from_pretrained(model_name)
                model = AutoModel.from_pretrained(model_name)
                model.to(self.device)
                model.eval()
                
                self._models[cache_key] = (tokenizer, model)
                print(f"Successfully loaded BERT model: {model_name}", file=sys.stderr)
                
            except Exception as e:
                print(f"Failed to load BERT model {model_name}: {e}", file=sys.stderr)
                raise e
        
        return self._models[cache_key]
    
    def get_classification_pipeline(self, task: str = 'text-classification', 
                                   model_name: Optional[str] = None) -> pipeline:
        """Get a Hugging Face pipeline for classification tasks."""
        cache_key = f"pipeline_{task}_{model_name or 'default'}"
        
        if cache_key not in self._models:
            try:
                print(f"Loading classification pipeline: {task}", file=sys.stderr)
                
                if model_name:
                    pipe = pipeline(task, model=model_name, device=0 if torch.cuda.is_available() else -1)
                else:
                    pipe = pipeline(task, device=0 if torch.cuda.is_available() else -1)
                
                self._models[cache_key] = pipe
                print(f"Successfully loaded pipeline: {task}", file=sys.stderr)
                
            except Exception as e:
                print(f"Failed to load pipeline {task}: {e}", file=sys.stderr)
                # Try CPU version
                try:
                    if model_name:
                        pipe = pipeline(task, model=model_name, device=-1)
                    else:
                        pipe = pipeline(task, device=-1)
                    
                    self._models[cache_key] = pipe
                    print(f"Successfully loaded CPU pipeline: {task}", file=sys.stderr)
                except Exception as e2:
                    print(f"Failed to load CPU pipeline: {e2}", file=sys.stderr)
                    raise e2
        
        return self._models[cache_key]
    
    def predict_nli(self, premise: str, hypothesis: str, model_name: str = 'roberta-large-mnli') -> Dict[str, float]:
        """Predict NLI relationship between premise and hypothesis."""
        try:
            tokenizer, model = self.get_nli_model(model_name)
            
            # Tokenize input
            inputs = tokenizer(premise, hypothesis, return_tensors="pt", 
                             truncation=True, padding=True, max_length=512)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            
            # Get prediction
            with torch.no_grad():
                outputs = model(**inputs)
                predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
            
            # Convert to probabilities
            probs = predictions.cpu().numpy()[0]
            
            # Map to labels (MNLI format: contradiction, neutral, entailment)
            labels = ['contradiction', 'neutral', 'entailment']
            result = {label: float(prob) for label, prob in zip(labels, probs)}
            
            return result
            
        except Exception as e:
            print(f"NLI prediction failed: {e}", file=sys.stderr)
            return {'contradiction': 0.33, 'neutral': 0.33, 'entailment': 0.33}
    
    def get_embeddings(self, texts: list, model_name: str = 'all-MiniLM-L6-v2') -> list:
        """Get sentence embeddings for a list of texts."""
        try:
            model = self.get_sentence_transformer(model_name)
            embeddings = model.encode(texts, convert_to_tensor=True)
            return embeddings.cpu().numpy()
        except Exception as e:
            print(f"Embedding generation failed: {e}", file=sys.stderr)
            # Return zero embeddings as fallback
            import numpy as np
            return np.zeros((len(texts), 384))  # Default MiniLM dimension
    
    def calculate_bert_score(self, candidates: list, references: list) -> Dict[str, float]:
        """Calculate BERTScore between candidates and references."""
        try:
            from bert_score import score
            
            # Calculate BERTScore
            P, R, F1 = score(candidates, references, lang="en", verbose=False)
            
            return {
                'precision': float(P.mean()),
                'recall': float(R.mean()),
                'f1': float(F1.mean())
            }
            
        except Exception as e:
            print(f"BERTScore calculation failed: {e}", file=sys.stderr)
            # Fallback to simple text similarity
            from ..shared.utils import calculate_text_similarity
            
            similarities = []
            for cand, ref in zip(candidates, references):
                sim = calculate_text_similarity(cand, ref)
                similarities.append(sim)
            
            avg_sim = sum(similarities) / len(similarities) if similarities else 0.0
            return {
                'precision': avg_sim,
                'recall': avg_sim,
                'f1': avg_sim
            }
    
    def clear_cache(self):
        """Clear model cache to free memory."""
        self._models.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("Model cache cleared", file=sys.stderr)
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about loaded models."""
        info = {
            'device': str(self.device),
            'loaded_models': list(self._models.keys()),
            'cuda_available': torch.cuda.is_available(),
            'memory_usage': {}
        }
        
        if torch.cuda.is_available():
            info['memory_usage']['gpu'] = {
                'allocated': torch.cuda.memory_allocated(),
                'reserved': torch.cuda.memory_reserved()
            }
        
        return info

# Helper functions for specific model operations

def load_hallucination_model():
    """Load model for hallucination detection (HHEM-style)."""
    loader = ModelLoader()
    
    # For HHEM, we need NLI model for entailment checking
    nli_model = loader.get_nli_model('roberta-large-mnli')
    sentence_model = loader.get_sentence_transformer('all-MiniLM-L6-v2')
    
    return {
        'nli': nli_model,
        'sentence_transformer': sentence_model
    }

def load_coherence_model():
    """Load model for coherence evaluation."""
    loader = ModelLoader()
    return loader.get_sentence_transformer('all-MiniLM-L6-v2')

def load_accuracy_model():
    """Load model for accuracy evaluation."""
    loader = ModelLoader()
    
    # For accuracy, we need both sentence similarity and potentially NLI
    sentence_model = loader.get_sentence_transformer('all-MiniLM-L6-v2')
    
    return {
        'sentence_transformer': sentence_model,
        'bert_score_func': loader.calculate_bert_score
    }

def load_assumption_model():
    """Load model for assumption detection."""
    loader = ModelLoader()
    
    # For assumption detection, we need NLI and named entity recognition
    nli_model = loader.get_nli_model('roberta-large-mnli')
    sentence_model = loader.get_sentence_transformer('all-MiniLM-L6-v2')
    
    return {
        'nli': nli_model,
        'sentence_transformer': sentence_model
    }

# Singleton instance
model_loader = ModelLoader()

# Export main functions
__all__ = [
    'ModelLoader', 'model_loader', 
    'load_hallucination_model', 'load_coherence_model', 
    'load_accuracy_model', 'load_assumption_model'
]