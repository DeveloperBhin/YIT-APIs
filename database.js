const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool(process.env.DATABASE_URL);

db.getConnection()
  .then(() => console.log('✅ Connected to PlanetScale (MySQL)'))
  .catch((err) => console.error('❌ MySQL connection failed:', err.message));

module.exports = db;