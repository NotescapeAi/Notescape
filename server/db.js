// server/db.js
import mysql from "mysql2/promise";

const db = mysql.createPool({
  host: "localhost",   // apna MySQL host
  user: "root",        // apna MySQL user
  password: "12345",   // apna password
  database: "notescape" // apna database name
});

export default db;
