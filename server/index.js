import express from "express";
import cors from "cors";
import classesRouter from "./routes/classes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/classes", classesRouter);

app.get("/", (req, res) => {
  res.send("✅ Server running. Use /api/classes");
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
