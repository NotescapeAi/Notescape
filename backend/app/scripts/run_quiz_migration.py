
import asyncio
import sys
import platform
from pathlib import Path
from app.core.db import db_conn

async def migrate():
    sql_path = Path("db/init/12_quiz_sections.sql")
    if not sql_path.exists():
        # Try absolute path based on known location
        sql_path = Path(r"c:\Users\Rabbiya\Desktop\Notescape\db\init\12_quiz_sections.sql")
    
    if not sql_path.exists():
        print(f"Migration file not found: {sql_path}")
        return

    sql = sql_path.read_text()
    print(f"Executing SQL from {sql_path}...")
    
    async with db_conn() as (conn, cur):
        await cur.execute(sql)
        await conn.commit()
    
    print("Migration completed successfully.")

if __name__ == "__main__":
    if platform.system() == "Windows":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(migrate())
