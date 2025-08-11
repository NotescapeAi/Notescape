from fastapi import FastAPI
<<<<<<< HEAD

app = FastAPI(title="Notescape API")

@app.get("/health")
def health():
    return {"status": "ok"}
=======
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Notescape API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/hello")
def hello():
    return {"message": "Hello from FastAPI"}
>>>>>>> 84ccc0e (Add backend FastAPI setup)
