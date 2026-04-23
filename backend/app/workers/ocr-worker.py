from app.workers.ocr_worker import run


if __name__ == "__main__":
    import asyncio

    asyncio.run(run())
