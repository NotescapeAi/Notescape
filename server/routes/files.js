import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import db from "../db.js";

const router = express.Router();

// disk layout: uploads/class_<id>/<timestamp>_<originalname>
const uploadRoot = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadRoot, `class_${req.params.classId}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const ok = ["application/pdf", "image/png", "image/jpeg"].includes(file.mimetype);
    cb(ok ? null : new Error("Unsupported type"));
  },
});

// sanity: ensure multipart
function ensureMultipart(req, res, next) {
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("multipart/form-data")) {
    return res.status(415).json({ error: "Expected multipart/form-data" });
  }
  next();
}

// POST /api/files/:classId
router.post(
  "/:classId",
  ensureMultipart,
  (req, _res, next) => {                // log headers before Multer
    console.log("UPLOAD CT:", req.headers["content-type"]);
    next();
  },
  multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }).any(), // accept ANY file field
  async (req, res) => {
    try {
      const classId = parseInt(req.params.classId, 10);

      // prefer key "file", else first file
      const file = (req.files || []).find(f => f.fieldname === "file") || (req.files || [])[0];
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      // type whitelist
      const ok = ["application/pdf", "image/png", "image/jpeg"].includes(file.mimetype);
      if (!ok) return res.status(415).json({ error: "Only PDF/PNG/JPEG allowed" });

      const storageUrl = `/uploads/class_${classId}/${file.filename}`;
      const { rows } = await db.query(
        `INSERT INTO files (class_id, filename, mime_type, storage_url, size_bytes)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [classId, file.originalname, file.mimetype, storageUrl, file.size]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);


/** GET /api/files/:classId */
router.get("/:classId", async (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const { rows } = await db.query(
      "SELECT * FROM files WHERE class_id = $1 ORDER BY uploaded_at DESC",
      [classId]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

export default router;
