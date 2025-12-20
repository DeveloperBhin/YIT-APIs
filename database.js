// db.js
const { Pool } = require('pg'); // PostgreSQL client
require('dotenv').config();

// Create a connection pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Render PostgreSQL
});

// Test the connection
async function testConnection() {
  try {
    const client = await db.connect();
    console.log('✅ Connected to Render PostgreSQL successfully!');
    client.release();
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
  }
}

testConnection();

module.exports = db;
