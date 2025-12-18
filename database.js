const mysql = require('mysql2/promise');
require('dotenv').config(); // Correct way to load .env

const pool = mysql.createPool({
  host: process.env.MYSQL_DB_HOST,
  user: process.env.MYSQL_DB_USER,
//   password: process.env.MYSQL_DB_PASSWORD, // Make sure you include password
  database: process.env.MYSQL_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const database = {
  execute: async (query, paramsArray = [], retries = 10) => {
    let attempt = 0;

    while (attempt < retries) {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute(query, paramsArray);
        connection.release();
        return [rows];
      } catch (error) {
        connection.release();

        // Handle deadlock and retry
        if (error.code === 'ER_LOCK_DEADLOCK') {
          attempt++;
          console.warn(
            `⚠️ Deadlock detected (attempt ${attempt}/${retries}). Retrying query...`
          );
          await new Promise((res) => setTimeout(res, 100 * attempt));
          continue;
        }

        console.error(`❌ Database error:`, error.message);
        throw error;
      }
    }

    throw new Error(`Failed after ${retries} attempts due to repeated deadlocks`);
  }
};

/* ✅ Test Connection on Startup */
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Connected to MySQL database');
    connection.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
})();

module.exports = database; // Correct export
