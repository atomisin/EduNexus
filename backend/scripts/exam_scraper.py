import requests
from bs4 import BeautifulSoup
import json
import os
import re
import time

BASE_URL = "https://syllabus.ng"

EXAMS = {
    "jamb": "/jamb/",
    "waec": "/waec/",
    "neco": "/neco/"
}

def get_subjects(exam_type):
    url = f"{BASE_URL}{EXAMS[exam_type]}"
    print(f"Fetching subjects for {exam_type} from {url}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Link pattern: /exam_type/subject-slug/
        links = soup.find_all('a', href=re.compile(f"/{exam_type}/[^/]+/"))
        subjects = []
        for link in links:
            name = link.get_text(strip=True)
            href = link['href']
            # Sometimes href is absolute, sometimes relative
            if href.startswith('http'):
                full_url = href
            else:
                full_url = f"{BASE_URL}{href}"
                
            slug = href.strip('/').split('/')[-1]
            if name and slug not in ['jamb', 'waec', 'neco']:
                subjects.append({"name": name, "url": full_url, "slug": slug})
        
        # Deduplicate
        seen = set()
        unique_subjects = []
        for s in subjects:
            if s['slug'] not in seen:
                unique_subjects.append(s)
                seen.add(s['slug'])
        
        print(f"  Found {len(unique_subjects)} subjects.")
        return unique_subjects
    except Exception as e:
        print(f"  Error fetching subjects: {e}")
        return []

def scrape_syllabus(exam_type, subject_url):
    print(f"    Scraping syllabus: {subject_url}")
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(subject_url, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        topics = []
        tables = soup.find_all('table')
        
        for table in tables:
            rows = table.find_all('tr')[1:] # Skip header
            for row in rows:
                cols = row.find_all('td')
                if not cols: continue
                
                if exam_type == "jamb" and len(cols) >= 3:
                    # JAMB: No, Topic, Content (Sub-topics), Objectives
                    topic_name = cols[1].get_text(strip=True)
                    # Content often has <br> or list
                    content_cell = cols[2]
                    subtopics = [li.get_text(strip=True) for li in content_cell.find_all('li')]
                    if not subtopics:
                        subtopics = [t.strip() for t in content_cell.get_text(separator='|').split('|') if t.strip()]
                    
                    topics.append({
                        "topic": topic_name,
                        "subtopics": subtopics[:10] # Cap for testing
                    })
                elif (exam_type in ["waec", "neco"]) and len(cols) >= 2:
                    # WAEC/NECO: No, Topics, Notes
                    # Sometimes Topic column is 1 (index), Topic is 2
                    if len(cols) == 2:
                        topic_name = cols[0].get_text(strip=True)
                        notes_cell = cols[1]
                    else:
                        topic_name = cols[1].get_text(strip=True)
                        notes_cell = cols[2]
                    
                    subtopics = [li.get_text(strip=True) for li in notes_cell.find_all('li')]
                    if not subtopics:
                        subtopics = [t.strip() for t in notes_cell.get_text(separator='|').split('|') if t.strip()]
                    
                    topics.append({
                        "topic": topic_name,
                        "subtopics": subtopics[:10]
                    })
        
        return topics
    except Exception as e:
        print(f"      Error: {e}")
        return []

def main():
    data = {}
    for exam_type in EXAMS:
        subjects = get_subjects(exam_type)
        exam_data = []
        # Limit to 5 subjects per exam for first pass to avoid ban/timeout
        for sub in subjects[:10]: 
            time.sleep(1) # Be nice
            sub_topics = scrape_syllabus(exam_type, sub['url'])
            if sub_topics:
                exam_data.append({
                    "subject": sub['name'],
                    "slug": sub['slug'],
                    "topics": sub_topics
                })
        data[exam_type] = exam_data

    os.makedirs("backend/data", exist_ok=True)
    with open("backend/data/exam_curriculum_data.json", "w") as f:
        json.dump(data, f, indent=2)
    print("Scraping complete. Data saved to backend/data/exam_curriculum_data.json")

if __name__ == "__main__":
    main()
