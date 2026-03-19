
import asyncio
import httpx

async def list_routes():
    async with httpx.AsyncClient() as client:
        resp = await client.get("http://localhost:8000/__routes")
        routes = resp.json()
        for r in routes:
            print(f"{r['methods']} {r['path']}")

if __name__ == "__main__":
    asyncio.run(list_routes())
