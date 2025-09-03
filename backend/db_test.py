from dotenv import load_dotenv
import os
from sqlalchemy import create_engine, text

# load .env file
load_dotenv()
db_url = os.getenv("DATABASE_URL")

engine = create_engine(db_url, future=True)

with engine.connect() as conn:
    result = conn.execute(text("SELECT current_database(), current_user")).fetchone()
    print(result)
