import httpx
import asyncio

async def verify_routes():
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        endpoints = [
            "/api/analytics/streaks",
            "/api/analytics/overview",
            "/api/analytics/trends",
            "/api/analytics/weak-cards",
            "/api/analytics/weak-topics",
            "/api/analytics/weak-tags",
        ]
        
        print(f"{'Endpoint':<40} | {'Status':<10}")
        print("-" * 55)
        
        for ep in endpoints:
            try:
                resp = await client.get(ep)
                status = resp.status_code
                print(f"{ep:<40} | {status:<10}")
            except Exception as e:
                print(f"{ep:<40} | Error: {e}")

if __name__ == "__main__":
    asyncio.run(verify_routes())
