import requests
import json

r = requests.get('https://edunexus-krb1.onrender.com/api/v1/subjects')
data = r.json()
subjects = data.get('subjects', [])
print(f"Total global subjects: {len(subjects)}")
print("First 3 subjects:")
for s in subjects[:3]:
    print(s)
