import httpx
from bs4 import BeautifulSoup
import json
import re
import os
import time

BASE_URL = "https://syllabus.ng"

GRADES = {
    "primary1": "primary1-scheme-of-work",
    "primary2": "primary2-scheme-of-work",
    "primary3": "primary3-scheme-of-work",
    "primary4": "primary4-scheme-of-work",
    "primary5": "primary5-scheme-of-work",
    "primary6": "primary6-scheme-of-work",
    "jss1": "jss1-scheme-of-work",
    "jss2": "jss2-scheme-of-work",
    "jss3": "jss3-scheme-of-work",
    "ss1": "ss1-scheme-of-work",
    "ss2": "ss2-scheme-of-work",
    "ss3": "ss3-scheme-of-work",
}

def clean_text(text):
    if not text:
        return ""
    # Remove multiple spaces, newlines, and trailing/leading whitespace
    return re.sub(r'\s+', ' ', text).strip()

def scrape_subject(grade, subject_slug, subject_url):
    print(f"  Scraping subject: {subject_slug} from {subject_url}...")
    try:
        response = httpx.get(subject_url, follow_redirects=True, timeout=30.0)
        if response.status_code != 200:
            print(f"    Failed to fetch {subject_url}: {response.status_code}")
            return None
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for the scheme of work table
        # syllabus.ng often uses tables for the scheme of work
        tables = soup.find_all('table')
        if not tables:
            print(f"    No tables found for {subject_slug}")
            return None
        
        curriculum = []
        current_term = "First Term" # Default
        
        for table in tables:
            # Check if this table belongs to a term
            prev_h2 = table.find_previous(['h2', 'h3'])
            if prev_h2 and ("Term" in prev_h2.text):
                current_term = clean_text(prev_h2.text)
            
            rows = table.find_all('tr')
            for row in rows[1:]: # Skip header
                cols = row.find_all(['td', 'th'])
                if len(cols) >= 3:
                    week = clean_text(cols[0].text)
                    topic = clean_text(cols[1].text)
                    breakdown = clean_text(cols[2].text)
                    
                    if not topic or topic.lower() in ["revision", "examination", "mid-term break"]:
                        continue
                    
                    # Extract subtopics from breakdown (usually numbered or bulleted)
                    # Example: "(i) Millions (ii) Billions"
                    subtopics = []
                    if breakdown:
                        # Split by common markers
                        parts = re.split(r'\s*\([i|v|x|a-z|0-9]+\)\s*', breakdown)
                        subtopics = [clean_text(p) for p in parts if clean_text(p)]
                    
                    curriculum.append({
                        "term": current_term,
                        "week": week,
                        "topic": topic,
                        "subtopics": subtopics,
                        "raw_breakdown": breakdown
                    })
        
        return curriculum
    except Exception as e:
        print(f"    Error scraping {subject_url}: {e}")
        return None

def scrape_grade(grade_key, grade_slug):
    url = f"{BASE_URL}/{grade_slug}/"
    print(f"Scraping grade: {grade_key} from {url}...")
    
    try:
        response = httpx.get(url, follow_redirects=True, timeout=30.0)
        if response.status_code != 200:
            print(f"  Failed to fetch grade page: {response.status_code}")
            return []
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract subject links
        # They are usually in <li> tags or a list of links
        subject_links = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            # Only include links that are children of the grade page
            if grade_slug in href and href != url and not href.endswith(".pdf") and "/product/" not in href:
                # Basic normalization
                full_url = href if href.startswith("http") else f"{BASE_URL}{href}"
                slug = href.strip('/').split('/')[-1]
                if slug not in [grade_slug, "shop", "contact"]:
                    subject_links.append((slug, full_url))
        
        # Unique links only
        subject_links = list(set(subject_links))
        print(f"  Found {len(subject_links)} subjects.")
        
        grade_data = []
        for slug, s_url in subject_links:
            # For proof of concept / speed, skip non-core if needed
            # For now, we scrape all we find
            curriculum = scrape_subject(grade_key, slug, s_url)
            if curriculum:
                grade_data.append({
                    "subject": slug.replace('-', ' ').title(),
                    "slug": slug,
                    "curriculum": curriculum
                })
            time.sleep(1) # Be nice
            
        return grade_data
    except Exception as e:
        print(f"  Error scraping grade {grade_key}: {e}")
        return []

def main():
    all_data = {}
    
    # Scrape all grades
    grades_to_scrape = list(GRADES.keys())
    
    for grade_key in grades_to_scrape:
        slug = GRADES[grade_key]
        all_data[grade_key] = scrape_grade(grade_key, slug)
    
    # Save to file
    data_dir = os.path.join("backend", "data")
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        
    output_file = os.path.join(data_dir, "curriculum_data.json")
    with open(output_file, "w") as f:
        json.dump(all_data, f, indent=2)
        
    print(f"\nScraping complete. Data saved to {output_file}")

if __name__ == "__main__":
    main()
