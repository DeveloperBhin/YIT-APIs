// const mysql = require('mysql2/promise');
// require('dotenv').config();

// const db = mysql.createPool({
//   host: process.env.MYSQLHOST,
//   user: process.env.MYSQLUSER,
//   password: process.env.MYSQL_ROOT_PASSWORD,
//   database: process.env.MYSQL_DATABASE,
//   port: process.env.MYSQLPORT,
// });


// // Test the connection
// async function testConnection() {
//   try {
//     const connection = await db.getConnection();
//     console.log('✅ Connected to MySQL successfully!');
//     connection.release(); // release the connection back to pool
//   } catch (err) {
//     console.error('❌ MySQL connection failed:', err.message);
//   }
// }

// testConnection();

// module.exports = db;


const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool(process.env.MYSQL_URL);

// Test the connection
async function testConnection() {
  try {
    const connection = await db.getConnection();
    console.log('✅ Connected to Railway MySQL successfully!');
    connection.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
}

testConnection();

module.exports = db;
