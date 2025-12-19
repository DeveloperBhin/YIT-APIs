const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.MYSQL_DB_HOST,
  user: process.env.MYSQL_DB_USER,
  password: process.env.MYSQL_DB_PASSWORD,
  database: process.env.MYSQL_DB_NAME,
  port: process.env.MYSQL_DB_PORT || 3306,
  ssl: { rejectUnauthorized: true },
});

(async () => {
  try {
    const conn = await db.getConnection();
    console.log('✅ Connected to PlanetScale');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1); // fail fast if DB is unreachable
  }
})();

module.exports = db;