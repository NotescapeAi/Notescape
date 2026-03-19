import requests
import os

API_URL = "http://localhost:8000/api"

def test_classes_no_auth():
    print("Testing /classes with NO auth (should fallback to dev-user or fail if strict)...")
    try:
        resp = requests.get(f"{API_URL}/classes")
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:100]}...")
    except Exception as e:
        print(f"Error: {e}")

def test_classes_dev_user():
    print("\nTesting /classes with X-User-Id: dev-user...")
    try:
        headers = {"X-User-Id": "dev-user"}
        resp = requests.get(f"{API_URL}/classes", headers=headers)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:100]}...")
    except Exception as e:
        print(f"Error: {e}")

def test_classes_invalid_token():
    print("\nTesting /classes with INVALID Bearer token...")
    try:
        headers = {"Authorization": "Bearer invalid_token_123"}
        resp = requests.get(f"{API_URL}/classes", headers=headers)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:100]}...")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_classes_no_auth()
    test_classes_dev_user()
    test_classes_invalid_token()
