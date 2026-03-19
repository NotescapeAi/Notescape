
import requests
import json

API_URL = "http://localhost:8000/api"

def test_analytics():
    print("--- Testing /api/analytics/overview ---")
    try:
        headers = {"X-User-Id": "dev-user"}
        resp = requests.get(f"{API_URL}/analytics/overview", headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print("Response keys:", data.keys())
            print("Total Study Time:", data.get("total_study_time"))
            print("Engagement Score:", data.get("engagement_score"))
        else:
            print(f"Failed: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    print("\n--- Testing /api/analytics/trends ---")
    try:
        headers = {"X-User-Id": "dev-user"}
        resp = requests.get(f"{API_URL}/analytics/trends", headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                print("First trend point keys:", data[0].keys())
                if "day" in data[0]:
                    print("SUCCESS: 'day' field present.")
                elif "date" in data[0]:
                    print("WARNING: 'date' field present instead of 'day'.")
                else:
                    print("FAIL: Neither 'day' nor 'date' present.")
                
                if "study_time" in data[0]:
                    print("SUCCESS: 'study_time' field present.")
                else:
                    print("FAIL: 'study_time' missing.")
            else:
                print("Trends list is empty (might be normal if no data).")
        else:
            print(f"Failed: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    print("\n--- Testing /api/analytics/weak-topics ---")
    try:
        headers = {"X-User-Id": "dev-user"}
        resp = requests.get(f"{API_URL}/analytics/weak-topics", headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("Success (weak-topics)")
        else:
            print(f"Failed: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    print("\n--- Testing /api/analytics/weak-cards ---")
    try:
        headers = {"X-User-Id": "dev-user"}
        resp = requests.get(f"{API_URL}/analytics/weak-cards", headers=headers)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("Success (weak-cards)")
        else:
            print(f"Failed: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analytics()
