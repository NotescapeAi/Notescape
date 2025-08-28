import 'dotenv/config';
import express from "express";
import cors from "cors";
import classesRouter from "./routes/classes.js";
import filesRouter from "./routes/files.js";

const app = express();
app.use(cors());
app.use(express.json());

// API
app.use("/api/classes", classesRouter);
app.use("/api/files", filesRouter);

// serve uploaded files
app.use("/uploads", express.static("uploads"));

// friendly errors from multer/validation
app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large (max 100MB)" });
  if (err?.message === "Unsupported type") return res.status(415).json({ error: "Only PDF/PNG/JPEG allowed" });
  console.error(err);
  res.status(500).json({ error: "Unexpected error" });
});


// simple contact endpoint (replace with EmailJS/SMTP later)
app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Missing fields" });
  }
  console.log("CONTACT FORM:", { name, email, message });
  // TODO: send email or store in DB
  return res.status(200).json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
