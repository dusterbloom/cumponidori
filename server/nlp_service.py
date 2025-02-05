
# server/nlp_service.py
import spacy
from spacy.matcher import Matcher
import json
import sys
import base64
import io
import pdfplumber


def log_message(message):
    print(json.dumps({"message": message}), flush=True)

def log_error(error):
    print(json.dumps({"error": str(error)}), flush=True)

class ItalianNLPService:
    def __init__(self):
        # Load Italian language model
        try:
            self.nlp = spacy.load("it_core_news_lg")
        except OSError:
            spacy.cli.download("it_core_news_lg")
            self.nlp = spacy.load("it_core_news_lg")
        
        self.matcher = self.setup_matcher()

    def setup_matcher(self):
        matcher = Matcher(self.nlp.vocab)
        
        # Coordinates patterns
        matcher.add("COORD", [
            [{"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[NS]"}},
             {"LOWER": {"IN": ["lat", "latitude", "latitudine"]}, "OP": "?"},
             {"TEXT": {"REGEX": r"\d{1,3}°\d{1,2}'\d{1,2}\"[EW]"}}],
        ])
        
        # Turbine patterns
        matcher.add("TURBINE", [
            [{"LOWER": {"IN": ["vestas", "siemens", "gamesa", "nordex"]}},
             {"TEXT": {"REGEX": r"[A-Z]\d+"}, "OP": "?"}],
            [{"TEXT": {"REGEX": r"\d+(?:\.\d+)?"}},
             {"LOWER": {"IN": ["mw", "kw"]}},
             {"LOWER": "turbine", "OP": "?"}],
        ])
        
        # Environmental patterns
        matcher.add("ENVIRONMENTAL", [
            [{"LOWER": {"IN": ["impatto", "ambientale", "mitigazione"]}},
             {"LOWER": {"IN": ["ambiente", "flora", "fauna", "acustico"]}, "OP": "?"}],
        ])
        
        return matcher

    def process_pdf(self, pdf_content):
        try:
            # Convert base64 to bytes
            pdf_bytes = base64.b64decode(pdf_content)
            
            # Extract text using pdfplumber
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() + "\n"

            # Process with spaCy
            doc = self.nlp(text)
            
            # Extract matches
            matches = self.matcher(doc)
            results = {
                'entities': [],
                'matches': [],
                'tables': []
            }
            
            # Add named entities
            for ent in doc.ents:
                if ent.label_ in ['LOC', 'GPE', 'ORG']:
                    results['entities'].append({
                        'text': ent.text,
                        'label': ent.label_,
                        'start': ent.start_char,
                        'end': ent.end_char
                    })
            
            # Add pattern matches
            for match_id, start, end in matches:
                results['matches'].append({
                    'pattern': self.nlp.vocab.strings[match_id],
                    'text': doc[start:end].text,
                    'start': start,
                    'end': end
                })

            # Extract tables using pdfplumber
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    tables = page.extract_tables()
                    if tables:
                        results['tables'].extend([{
                            'page': page_num + 1,
                            'data': table
                        } for table in tables])

            return results
            
        except Exception as e:
            return {'error': str(e)}

def main():
    service = ItalianNLPService()
    
    # Process input from Node.js
    for line in sys.stdin:
        try:
            data = json.loads(line)
            result = service.process_pdf(data['content'])
            print(json.dumps(result))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({'error': str(e)}))
            sys.stdout.flush()

# Update your main function to include better logging
if __name__ == "__main__":
    try:
        log_message("NLP service starting...")
        service = ItalianNLPService()
        log_message("NLP service ready")
        
        for line in sys.stdin:
            try:
                data = json.loads(line)
                result = service.process_pdf(data['content'])
                print(json.dumps(result), flush=True)
            except Exception as e:
                log_error(f"Error processing request: {str(e)}")
    except Exception as e:
        log_error(f"Error initializing service: {str(e)}")
        sys.exit(1)