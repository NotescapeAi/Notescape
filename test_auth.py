
import requests
import os

API_URL = "http://localhost:8000/api"

def test_auth():
    # 1. Test with X-User-Id (Should work)
    print("--- Testing X-User-Id ---")
    try:
        resp = requests.get(f"{API_URL}/classes", headers={"X-User-Id": "dev-user"})
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("Success (X-User-Id)")
        else:
            print(f"Failed: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

    # 2. Test with Invalid Bearer Token
    print("\n--- Testing Invalid Bearer Token ---")
    try:
        # This simulates a frontend sending a token that the backend cannot verify
        resp = requests.get(f"{API_URL}/classes", headers={"Authorization": "Bearer invalid.token.here"})
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        if resp.status_code == 401:
            print("Confirmed: Invalid token returns 401")
        elif resp.status_code == 200:
            print("Surprise: Invalid token fell back to dev-user (or worked?)")
        else:
            print(f"Other status: {resp.status_code}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_auth()
