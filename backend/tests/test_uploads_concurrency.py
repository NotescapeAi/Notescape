import asyncio
import httpx
import time
import os
import random

API_URL = "http://localhost:8000/api"
CONCURRENT_UPLOADS = 50
FILE_SIZE_MB = 1  # Using 1MB for speed, but code supports larger
TIMEOUT = 60.0

async def upload_single(client, class_id, index):
    filename = f"concurrent_test_{index}.pdf"
    # Create dummy PDF content
    content = b"%PDF-1.4\n" + os.urandom(int(FILE_SIZE_MB * 1024 * 1024)) + b"\n%%EOF"
    
    files = {"file": (filename, content, "application/pdf")}
    headers = {"X-User-Id": "dev-user"}
    
    try:
        start = time.time()
        resp = await client.post(f"/files/{class_id}", files=files, headers=headers, timeout=TIMEOUT)
        duration = time.time() - start
        return {
            "index": index,
            "status": resp.status_code,
            "time": duration,
            "error": None if resp.status_code == 200 else resp.text
        }
    except Exception as e:
        return {
            "index": index,
            "status": 0,
            "time": 0,
            "error": str(e)
        }

async def run_test():
    print(f"Starting {CONCURRENT_UPLOADS} concurrent uploads...")
    
    # 1. Get Class ID
    async with httpx.AsyncClient(base_url=API_URL) as client:
        headers = {"X-User-Id": "dev-user"}
        r = await client.get("/classes", headers=headers)
        classes = r.json()
        if not classes:
            r = await client.post("/classes", json={"name": "Concurrency Test"}, headers=headers)
            class_id = r.json()["id"]
        else:
            class_id = classes[0]["id"]
            
    print(f"Target Class ID: {class_id}")

    # 2. Run Concurrent Uploads
    async with httpx.AsyncClient(base_url=API_URL, limits=httpx.Limits(max_keepalive_connections=CONCURRENT_UPLOADS, max_connections=CONCURRENT_UPLOADS)) as client:
        tasks = [upload_single(client, class_id, i) for i in range(CONCURRENT_UPLOADS)]
        results = await asyncio.gather(*tasks)

    # 3. Analyze Results
    success = [r for r in results if r["status"] == 200]
    failed = [r for r in results if r["status"] != 200]
    
    print("\n--- Concurrency Test Results ---")
    print(f"Total: {len(results)}")
    print(f"Success: {len(success)}")
    print(f"Failed: {len(failed)}")
    
    if success:
        avg_time = sum(r["time"] for r in success) / len(success)
        max_time = max(r["time"] for r in success)
        print(f"Avg Time: {avg_time:.2f}s")
        print(f"Max Time: {max_time:.2f}s")
        
    if failed:
        print("\nFailures:")
        for f in failed[:5]:
            print(f"ID {f['index']}: Status {f['status']} - {f['error']}")
            
    if len(success) / len(results) >= 0.99:
        print("\nPASSED: >99% success rate")
    else:
        print("\nFAILED: <99% success rate")

if __name__ == "__main__":
    asyncio.run(run_test())
