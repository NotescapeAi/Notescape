# app/routers/classes.py
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.core.db import db_conn

router = APIRouter(prefix="/api", tags=["classes"])

class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None

class ClassOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

@router.get("/classes", response_model=List[ClassOut])
async def list_classes():
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT id, name, description FROM classes ORDER BY id")
        rows = await cur.fetchall()
    return [{"id": r[0], "name": r[1], "description": r[2]} for r in rows]

@router.post("/classes", response_model=ClassOut, status_code=201)
async def create_class(body: ClassCreate):
    name = body.name.strip()
    desc = body.description.strip() if body.description else None
    if not name:
        raise HTTPException(status_code=422, detail="name cannot be empty")
    async with db_conn() as (conn, cur):
        await cur.execute(
            "INSERT INTO classes (name, description) VALUES (%s, %s) RETURNING id",
            (name, desc),
        )
        row = await cur.fetchone()
        await conn.commit()
    return {"id": row[0], "name": name, "description": desc}

@router.put("/classes/{class_id}", response_model=ClassOut)
async def update_class(class_id: int, body: ClassCreate):
    name = body.name.strip()
    desc = body.description.strip() if body.description else None
    if not name:
        raise HTTPException(status_code=422, detail="name cannot be empty")
    async with db_conn() as (conn, cur):
        await cur.execute(
            "UPDATE classes SET name=%s, description=%s WHERE id=%s RETURNING id, name, description",
            (name, desc, class_id),
        )
        row = await cur.fetchone()
        await conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="class not found")
    return {"id": row[0], "name": row[1], "description": row[2]}

@router.delete("/classes/{class_id}", status_code=204)
async def delete_class(class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
        await conn.commit()
    return
