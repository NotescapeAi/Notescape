// backend/routes/classes.js
import express from "express";
import db from "../db.js";

const router = express.Router();

// ✅ Get all classes
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM classes");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch classes" });
  }
});

// ✅ Add a new class
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Class name required" });

    const [result] = await db.query("INSERT INTO classes (name) VALUES (?)", [
      name,
    ]);

    res.json({ id: result.insertId, name });
  } catch (err) {
    res.status(500).json({ error: "Failed to add class" });
  }
});

// ✅ Update a class
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    await db.query("UPDATE classes SET name = ? WHERE id = ?", [name, id]);

    res.json({ id, name });
  } catch (err) {
    res.status(500).json({ error: "Failed to update class" });
  }
});

// ✅ Delete a class
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM classes WHERE id = ?", [id]);
    res.json({ message: "Class deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete class" });
  }
});

export default router;
