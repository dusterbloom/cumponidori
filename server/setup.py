# server/setup.py
import subprocess
import sys
import os

def setup_environment():
    print("Setting up Python environment...")
    
    # Install requirements
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    
    # Download spaCy model
    print("Downloading spaCy Italian model...")
    subprocess.check_call([sys.executable, "-m", "spacy", "download", "it_core_news_lg"])
    
    print("Setup complete!")

if __name__ == "__main__":
    setup_environment()