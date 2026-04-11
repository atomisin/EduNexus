import requests
from bs4 import BeautifulSoup
import json
import re
import uuid
import time

def clean_text(text):
    return re.sub(r'\s+', ' ', text).strip()

def scrape_subject_questions(url, exam_type, subject_name):
    print(f"Scraping {exam_type} {subject_name} from {url}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    content = soup.find('div', class_='entry-content')
    if not content:
        print(f"No content found for {url}")
        return []

    questions = []
    
    # Pattern 1: Questions in <p> starting with numbers or "Qtn"
    # Patterns usually look like:
    # 1. Question text...?
    # A. Option 1
    # B. Option 2
    # C. Option 3
    # D. Option 4
    # Answer: A
    
    text_blocks = [p.get_text() for p in content.find_all(['p', 'li'])]
    
    current_q = None
    
    for i, text in enumerate(text_blocks):
        text = clean_text(text)
        
        # Detect Question
        # Match "1. " or "Q1." or "Qtn 1:"
        q_match = re.match(r'^(?:Qtn|Q|Question)?\s*(\d+)[\.:)]\s*(.+)', text, re.I)
        if q_match:
            if current_q and 'options' in current_q and len(current_q['options']) >= 2:
                questions.append(current_q)
            
            current_q = {
                'id': str(uuid.uuid4()),
                'question_text': q_match.group(2),
                'options': {},
                'correct_option': None,
                'explanation': None
            }
            continue
            
        if not current_q:
            continue
            
        # Detect Options
        # Match "A. Option" or "(a) Option"
        opt_match = re.match(r'^([A-D])[\.:)]\s*(.+)', text, re.I)
        if opt_match:
            label = opt_match.group(1).upper()
            current_q['options'][label] = opt_match.group(2)
            continue
        
        # Detect Answer
        ans_match = re.search(r'Answer:\s*([A-D])', text, re.I)
        if ans_match:
            current_q['correct_option'] = ans_match.group(1).upper()
            continue
            
        # Detect Explanation
        exp_match = re.search(r'Explanation:\s*(.+)', text, re.I)
        if exp_match:
            current_q['explanation'] = exp_match.group(1)
            continue

    if current_q and 'options' in current_q and len(current_q['options']) >= 2:
        questions.append(current_q)

    print(f"Extracted {len(questions)} questions for {subject_name}")
    return questions

def run_scraper():
    # Target URLs
    targets = [
        {
            "url": "https://myschoolgist.com/news/weac-biology-scheme-of-exam-and-sample-questions/",
            "exam_type": "WAEC",
            "subject": "Biology"
        },
        {
            "url": "https://myschoolgist.com/news/weac-physics-scheme-of-exam-and-sample-questions/",
            "exam_type": "WAEC",
            "subject": "Physics"
        },
        {
            "url": "https://myschoolgist.com/news/weac-chemistry-scheme-of-exam-and-sample-questions/",
            "exam_type": "WAEC",
            "subject": "Chemistry"
        },
        {
            "url": "https://myschoolgist.com/news/jamb-novel-the-life-changer-questions-answers/",
            "exam_type": "JAMB",
            "subject": "Use of English (Novel)"
        }
    ]
    
    all_data = {}
    
    for target in targets:
        qs = scrape_subject_questions(target['url'], target['exam_type'], target['subject'])
        if qs:
            key = f"{target['exam_type']}_{target['subject']}"
            all_data[key] = {
                "exam_type": target['exam_type'],
                "subject": target['subject'],
                "questions": qs
            }
        time.sleep(2) # Be polite
        
    with open('backend/data/past_questions.json', 'w') as f:
        json.dump(all_data, f, indent=2)
    
    print("Scraping complete. Data saved to backend/data/past_questions.json")

if __name__ == "__main__":
    run_scraper()
