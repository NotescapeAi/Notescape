import requests

try:
    print("Testing /api/classes with X-User-Id: dev-user")
    headers = {"X-User-Id": "dev-user"}
    response = requests.get("http://localhost:8000/api/classes", headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    
    if response.status_code == 200:
        print("Success!")
    else:
        print("Failed!")

    print("\nTesting /api/classes with Invalid Bearer Token")
    headers = {"Authorization": "Bearer invalid_token"}
    response = requests.get("http://localhost:8000/api/classes", headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")

except Exception as e:
    print(f"Error: {e}")
