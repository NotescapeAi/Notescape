import express from "express";
import db from "../db.js";

const router = express.Router();

// list
router.get("/", async (_req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM classes ORDER BY id");
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch classes" });
  }
});

// create
router.post("/", async (req, res) => {
  try {
    const { name, subject } = req.body;
    const { rows } = await db.query(
      "INSERT INTO classes (name, subject) VALUES ($1,$2) RETURNING *",
      [name, subject]
    );
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to create class" });
  }
});

// update
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject } = req.body;
    const { rows } = await db.query(
      "UPDATE classes SET name=$1, subject=$2 WHERE id=$3 RETURNING *",
      [name, subject, id]
    );
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to update class" });
  }
});

// delete
router.delete("/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM classes WHERE id=$1", [req.params.id]);
    res.json({ message: "Class deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete class" });
  }
});

export default router;
