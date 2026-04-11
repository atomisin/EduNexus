"""E2E integration test for Mock Exam API endpoints."""
import requests
import sys
import time

BASE_URL = "http://127.0.0.1:8000/api/v1"
session = requests.Session()


def login_student():
    """Login as test student using cookie-based auth."""
    print("1. Testing Login...")
    res = session.post(
        f"{BASE_URL}/auth/login",
        data={
            "username": "primarystudent@example.com",
            "password": "TestPassword123!",
        },
        timeout=10,
    )
    if res.status_code != 200:
        print(f"   FAIL — status {res.status_code}: {res.text[:200]}")
        sys.exit(1)
    data = res.json()
    print(f"   OK — logged in as {data.get('role')} (user_id={data.get('user_id')})")
    return data


def test_get_series():
    print("\n2. Getting mock exam series...")
    res = session.get(f"{BASE_URL}/mock-exams/series", timeout=10)
    if res.status_code != 200:
        print(f"   FAIL — status {res.status_code}: {res.text[:200]}")
        sys.exit(1)
    series = res.json()
    print(f"   OK — found {len(series)} series")
    if not series:
        print("   WARN — no series returned (seeder may not have run)")
        sys.exit(1)
    for s in series:
        print(f"   - {s['name']} ({s['exam_type']}) — {s['total_questions']} questions")
    return series


def test_start_attempt(series_id):
    print(f"\n3. Starting attempt for series {series_id}...")
    res = session.post(f"{BASE_URL}/mock-exams/series/{series_id}/attempt", timeout=10)
    if res.status_code != 200:
        print(f"   FAIL — status {res.status_code}: {res.text[:200]}")
        sys.exit(1)
    data = res.json()
    attempt_id = data["attempt_id"]
    print(f"   OK — attempt_id={attempt_id}")
    return attempt_id


def test_get_attempt(attempt_id):
    print(f"\n4. Getting attempt details for {attempt_id}...")
    res = session.get(f"{BASE_URL}/mock-exams/attempts/{attempt_id}", timeout=10)
    if res.status_code != 200:
        print(f"   FAIL — status {res.status_code}: {res.text[:200]}")
        sys.exit(1)
    data = res.json()
    questions = data.get("questions", [])
    print(f"   OK — {len(questions)} questions loaded, time_limit={data.get('time_limit_minutes')}min")
    return data


def test_submit_attempt(attempt_id, questions):
    print(f"\n5. Submitting attempt {attempt_id}...")
    # Answer first two questions with "A" for testing
    answers = {}
    for q in questions[:2]:
        answers[str(q["id"])] = "A"
    res = session.post(
        f"{BASE_URL}/mock-exams/attempts/{attempt_id}/submit",
        json={"answers": answers},
        timeout=10,
    )
    if res.status_code != 200:
        print(f"   FAIL — status {res.status_code}: {res.text[:200]}")
        sys.exit(1)
    result = res.json()
    print(f"   OK — Score: {result['score']}/{result['total_questions']}")
    print(f"   Time: {result.get('time_spent_seconds', 0)}s")
    return result


def test_history():
    print("\n6. Getting history...")
    res = session.get(f"{BASE_URL}/mock-exams/history", timeout=10)
    if res.status_code != 200:
        print(f"   FAIL — status {res.status_code}: {res.text[:200]}")
        sys.exit(1)
    history = res.json()
    print(f"   OK — {len(history)} completed attempts")
    for h in history:
        print(f"   - {h['series_name']}: {h['score']}/{h['total_questions']}")
    return history


if __name__ == "__main__":
    print("=" * 50)
    print("  EduNexus Mock Exam E2E Integration Test")
    print("=" * 50)

    login_student()
    series = test_get_series()

    target = series[0]
    attempt_id = test_start_attempt(target["id"])

    details = test_get_attempt(attempt_id)
    questions = details.get("questions", [])

    if questions:
        test_submit_attempt(attempt_id, questions)
    else:
        print("\n   SKIP — no questions to submit")

    test_history()

    print("\n" + "=" * 50)
    print("  ✅ ALL MOCK EXAM E2E TESTS PASSED")
    print("=" * 50)
