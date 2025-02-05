import spacy
from spacy.matcher import Matcher
import json
import sys
import base64
import io
import pdfplumber
from typing import Dict, List, Any
import logging
from concurrent.futures import ThreadPoolExecutor
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('nlp_service.log'),
        logging.StreamHandler()
    ]
)

class EnhancedItalianNLPService:
    def __init__(self):
        self.initialize_nlp()
        self.matcher = self.setup_enhanced_matcher()
        self.max_workers = 4  # Adjust based on system capabilities
        
    def initialize_nlp(self):
        """Initialize spaCy with GPU support if available"""
        try:
            # Check for GPU
            if torch.cuda.is_available():
                logging.info("CUDA GPU detected. Using GPU acceleration.")
                spacy.require_gpu()
                device_info = torch.cuda.get_device_properties(0)
                logging.info(f"GPU: {device_info.name}, Memory: {device_info.total_memory / 1024**3:.1f}GB")
            else:
                logging.info("No GPU detected. Using CPU.")

            # Load Italian model
            try:
                self.nlp = spacy.load("it_core_news_lg")
            except OSError:
                logging.info("Downloading Italian language model...")
                spacy.cli.download("it_core_news_lg")
                self.nlp = spacy.load("it_core_news_lg")

            # Optimize pipeline
            if torch.cuda.is_available():
                self.nlp.to_disk("model_gpu")
                self.nlp = spacy.load("model_gpu")

        except Exception as e:
            logging.error(f"Failed to initialize NLP engine: {str(e)}")
            logging.info("Falling back to CPU-only mode")
            self.nlp = spacy.load("it_core_news_lg")

    def setup_enhanced_matcher(self) -> Matcher:
        """Setup enhanced pattern matching similar to imparis2.py"""
        matcher = Matcher(self.nlp.vocab)
        
        # Geographic coordinates patterns
        matcher.add("COORD", [
            [{"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[NS]"}},
             {"IS_SPACE": True, "OP": "?"},
             {"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[EW]"}}],
            [{"LOWER": "latitudine"},
             {"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[NS]"}},
             {"LOWER": "longitudine"},
             {"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[EW]"}}]
        ])
        
        # Cadastral references
        matcher.add("CADASTRAL", [
            [{"LOWER": {"IN": ["foglio", "particella", "mappale"]}},
             {"TEXT": {"REGEX": r"n\.?\s*\d+"}}],
            [{"LOWER": "mappali"},
             {"TEXT": {"REGEX": r"n\.?\s*\d+(?:\s*,\s*\d+)*"}}]
        ])
        
        # Wind turbine specifications
        matcher.add("TURBINE", [
            [{"LOWER": {"IN": ["vestas", "siemens", "gamesa", "nordex"]}},
             {"TEXT": {"REGEX": r"[A-Z]\d+"}, "OP": "?"}],
            [{"TEXT": {"REGEX": r"\d+(?:\.\d+)?"}},
             {"LOWER": {"IN": ["mw", "kw"]}},
             {"LOWER": "turbine", "OP": "?"}],
            [{"LOWER": {"IN": ["altezza", "hub", "tip"]}},
             {"LIKE_NUM": True},
             {"LOWER": {"IN": ["metri", "m", "mt"]}, "OP": "?"}]
        ])
        
        # Environmental impact keywords
        matcher.add("ENVIRONMENTAL", [
            [{"LOWER": {"IN": ["impatto", "mitigazione", "compensazione"]}},
             {"IS_PUNCT": True, "OP": "?"},
             {"LOWER": {"IN": ["ambientale", "acustico", "visivo", "paesaggistico"]}}]
        ])
        
        return matcher

    def process_page(self, page: Any, page_num: int) -> Dict[str, Any]:
        """Process a single PDF page with context extraction"""
        try:
            text = page.extract_text() or ""
            if not text.strip():
                return None
                
            doc = self.nlp(text)
            
            # Extract matches with context
            matches = []
            for match_id, start, end in self.matcher(doc):
                pattern_name = self.nlp.vocab.strings[match_id]
                span = doc[start:end]
                context_start = max(0, span.start_char - 100)
                context_end = min(len(text), span.end_char + 100)
                
                matches.append({
                    'pattern': pattern_name,
                    'text': span.text,
                    'start': span.start_char,
                    'end': span.end_char,
                    'context': text[context_start:context_end]
                })
            
            # Extract entities with context
            entities = []
            for ent in doc.ents:
                if ent.label_ in ['LOC', 'GPE', 'ORG']:
                    context_start = max(0, ent.start_char - 100)
                    context_end = min(len(text), ent.end_char + 100)
                    
                    entities.append({
                        'text': ent.text,
                        'label': ent.label_,
                        'start': ent.start_char,
                        'end': ent.end_char,
                        'context': text[context_start:context_end]
                    })
            
            # Extract tables
            tables = page.extract_tables()
            
            return {
                'page': page_num,
                'entities': entities,
                'matches': matches,
                'tables': [{'data': table} for table in tables if table]
            }
            
        except Exception as e:
            logging.error(f"Error processing page {page_num}: {str(e)}")
            return None

    def process_pdf(self, pdf_content: str) -> Dict[str, Any]:
        """Process PDF with parallel page processing"""
        try:
            # Convert base64 to bytes
            pdf_bytes = base64.b64decode(pdf_content)
            
            results = {
                'entities': [],
                'matches': [],
                'tables': [],
                'metadata': {}
            }
            
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                # Extract metadata
                results['metadata'] = {
                    'pages': len(pdf.pages),
                    'pdf_info': pdf.metadata
                }
                
                # Process pages in parallel
                with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                    future_to_page = {
                        executor.submit(self.process_page, page, i): i 
                        for i, page in enumerate(pdf.pages, 1)
                    }
                    
                    # Collect results
                    for future in future_to_page:
                        page_result = future.result()
                        if page_result:
                            results['entities'].extend(page_result['entities'])
                            results['matches'].extend(page_result['matches'])
                            if page_result['tables']:
                                results['tables'].extend([
                                    {'page': page_result['page'], 'data': table['data']}
                                    for table in page_result['tables']
                                ])
            
            # Add summary statistics
            results['statistics'] = {
                'total_entities': len(results['entities']),
                'total_matches': len(results['matches']),
                'total_tables': len(results['tables']),
                'entity_types': {
                    label: len([e for e in results['entities'] if e['label'] == label])
                    for label in ['LOC', 'GPE', 'ORG']
                },
                'pattern_types': {
                    pattern: len([m for m in results['matches'] if m['pattern'] == pattern])
                    for pattern in ['COORD', 'CADASTRAL', 'TURBINE', 'ENVIRONMENTAL']
                }
            }
            
            return results
            
        except Exception as e:
            logging.error(f"Error processing PDF: {str(e)}")
            return {'error': str(e)}

def main():
    service = EnhancedItalianNLPService()
    logging.info("NLP service initialized and ready")
    
    for line in sys.stdin:
        try:
            data = json.loads(line)
            result = service.process_pdf(data['content'])
            print(json.dumps(result), flush=True)
        except Exception as e:
            logging.error(f"Error processing request: {str(e)}")
            print(json.dumps({'error': str(e)}), flush=True)

if __name__ == "__main__":
    main()
# # server/nlp_service.py
# import spacy
# from spacy.matcher import Matcher
# import json
# import sys
# import base64
# import io
# import pdfplumber


# def log_message(message):
#     print(json.dumps({"message": message}), flush=True)

# def log_error(error):
#     print(json.dumps({"error": str(error)}), flush=True)

# class ItalianNLPService:
#     def __init__(self):
#         # Load Italian language model
#         try:
#             self.nlp = spacy.load("it_core_news_lg")
#         except OSError:
#             spacy.cli.download("it_core_news_lg")
#             self.nlp = spacy.load("it_core_news_lg")
        
#         self.matcher = self.setup_matcher()

#     def setup_matcher(self):
#         matcher = Matcher(self.nlp.vocab)
        
#         # Coordinates patterns
#         matcher.add("COORD", [
#             [{"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[NS]"}},
#              {"LOWER": {"IN": ["lat", "latitude", "latitudine"]}, "OP": "?"},
#              {"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[EW]"}}],
#         ])
        
#         # Turbine patterns
#         matcher.add("TURBINE", [
#             [{"LOWER": {"IN": ["vestas", "siemens", "gamesa", "nordex"]}},
#              {"TEXT": {"REGEX": r"[A-Z]\d+"}, "OP": "?"}],
#             [{"TEXT": {"REGEX": r"\d+(?:\.\d+)?"}},
#              {"LOWER": {"IN": ["mw", "kw"]}},
#              {"LOWER": "turbine", "OP": "?"}],
#         ])
        
#         # Environmental patterns
#         matcher.add("ENVIRONMENTAL", [
#             [{"LOWER": {"IN": ["impatto", "ambientale", "mitigazione"]}},
#              {"LOWER": {"IN": ["ambiente", "flora", "fauna", "acustico"]}, "OP": "?"}],
#         ])
        
#         return matcher

#     def process_pdf(self, pdf_content):
#         try:
#             # Convert base64 to bytes
#             pdf_bytes = base64.b64decode(pdf_content)
            
#             # Extract text using pdfplumber
#             with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
#                 text = ""
#                 for page in pdf.pages:
#                     text += page.extract_text() + "\n"

#             # Process with spaCy
#             doc = self.nlp(text)
            
#             # Extract matches
#             matches = self.matcher(doc)
#             results = {
#                 'entities': [],
#                 'matches': [],
#                 'tables': []
#             }
            
#             # Add named entities
#             for ent in doc.ents:
#                 if ent.label_ in ['LOC', 'GPE', 'ORG']:
#                     results['entities'].append({
#                         'text': ent.text,
#                         'label': ent.label_,
#                         'start': ent.start_char,
#                         'end': ent.end_char
#                     })
            
#             # Add pattern matches
#             for match_id, start, end in matches:
#                 results['matches'].append({
#                     'pattern': self.nlp.vocab.strings[match_id],
#                     'text': doc[start:end].text,
#                     'start': start,
#                     'end': end
#                 })

#             # Extract tables using pdfplumber
#             with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
#                 for page_num, page in enumerate(pdf.pages):
#                     tables = page.extract_tables()
#                     if tables:
#                         results['tables'].extend([{
#                             'page': page_num + 1,
#                             'data': table
#                         } for table in tables])

#             return results
            
#         except Exception as e:
#             return {'error': str(e)}

# def main():
#     service = ItalianNLPService()
    
#     # Process input from Node.js
#     for line in sys.stdin:
#         try:
#             data = json.loads(line)
#             result = service.process_pdf(data['content'])
#             print(json.dumps(result))
#             sys.stdout.flush()
#         except Exception as e:
#             print(json.dumps({'error': str(e)}))
#             sys.stdout.flush()

# # Update your main function to include better logging
# if __name__ == "__main__":
#     try:
#         log_message("NLP service starting...")
#         service = ItalianNLPService()
#         log_message("NLP service ready")
        
#         for line in sys.stdin:
#             try:
#                 data = json.loads(line)
#                 result = service.process_pdf(data['content'])
#                 print(json.dumps(result), flush=True)
#             except Exception as e:
#                 log_error(f"Error processing request: {str(e)}")
#     except Exception as e:
#         log_error(f"Error initializing service: {str(e)}")
#         sys.exit(1)