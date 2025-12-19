// const mysql = require('mysql2/promise');
// require('dotenv').config();

// const db = mysql.createPool(process.env.DATABASE_URL);

// db.getConnection()
//   .then(() => console.log('✅ Connected to PlanetScale (MySQL)'))
//   .catch((err) => console.error('❌ MySQL connection failed:', err.message));

// module.exports = db;

const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: process.env.MYSQL_DB_HOST,
  user: process.env.MYSQL_DB_USER,
  password: process.env.MYSQL_DB_PASSWORD,
  database: process.env.MYSQL_DB_NAME,
  port: process.env.MYSQL_DB_PORT || 3306,
  ssl: {
    rejectUnauthorized: true, // required for PlanetScale
  },
});

db.getConnection()
  .then(() => console.log('✅ Connected to PlanetScale (MySQL)'))
  .catch((err) => console.error('❌ MySQL connection failed:', err.message));

module.exports = db;
