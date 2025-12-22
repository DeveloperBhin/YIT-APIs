const  redis = require('../../redis');
const  { v4 : uuidv4 } = require( 'uuid');
const db  = require  ('../../database');
const crypto  = require ('crypto');

const REFRESH_TTL = 30 * 24 * 60 * 60; // 30 days

function newToken() {
  return uuidv4() + crypto.randomBytes(16).toString('hex');
}

// Issue one active refresh token per user (new login invalidates the previous)
 async function issueRefreshToken(userId) {
  const token = newToken();

  // If user had an old token, remove the reverse index
  const userKey = `refresh:user:${userId}`;
  const old = await redis.get(userKey);
  if (old) await redis.del(`refresh:token:${old}`);

  // Write both indexes
  await redis.setex(`refresh:token:${token}`, REFRESH_TTL, String(userId));
  await redis.setex(userKey, REFRESH_TTL, token);

  return token;
}

 async function getUserIdFromRefresh(token) {
  const v = await redis.get(`refresh:token:${token}`);
  return v ? parseInt(v, 10) : null;
}

 async function revokeRefreshToken(token) {
  const userId = await redis.get(`refresh:token:${token}`);
  await redis.del(`refresh:token:${token}`);
  if (userId) {
    const userKey = `refresh:user:${userId}`;
    const current = await redis.get(userKey);
    if (current === token) await redis.del(userKey);
  }
}

// Helper function to refresh access token using refresh token
 async function refreshAccessToken(refreshToken) {
  try {
    // 1. Validate refresh token and get user ID
    const userId = await getUserIdFromRefresh(refreshToken);
    if (!userId) {
      throw new Error('Invalid or expired refresh token');
    }

    // 2. Get user details from database
    const [userRows] = await db.execute(
      `SELECT u.id, u.first_name, u.second_name, u.email, u.phone_number, u.status,
              um.merchant_id, um.role
       FROM users u
       JOIN user_merchants um ON u.id = um.user_id
       WHERE u.id = ? AND u.status = 'ACTIVE'`,
      [userId]
    );

    if (userRows.length === 0) {
      throw new Error('User not found or inactive');
    }

    const user = userRows[0];

    // 3. Get merchant details
    const [merchantRows] = await db.execute(
      `SELECT id, business_name, email, phone_number, status
       FROM merchant 
       WHERE id = ?`,
      [user.merchant_id]
    );

    if (merchantRows.length === 0) {
      throw new Error('Merchant not found');
    }

    const merchant = merchantRows[0];

    // 4. Generate new access token
    const jwt = require('jsonwebtoken');
    const accessToken = jwt.sign(
      {
        user_id: user.id,
        merchant_id: user.merchant_id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 5. Create new session
    const sessionData = {
      user_id: user.id,
      merchant_id: user.merchant_id,
      email: user.email,
      role: user.role,
      created_at: new Date().toISOString()
    };

    const sessionId = await createSession(sessionData, 24 * 60 * 60); // 24 hours

    // 6. Issue new refresh token (this will invalidate the old one)
    const newRefreshToken = await issueRefreshToken(userId);

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      session_id: sessionId,
      token_type: 'Bearer',
      expires_in: 7200, // 2 hours in seconds
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.second_name,
        email: user.email,
        phone_number: user.phone_number,
        merchant_id: user.merchant_id,
        merchant_name: merchant.business_name,
        role: user.role
      }
    };
  } catch (error) {
    console.error('Refresh token error:', error);
    throw error;
  }
}

 async function createSession(data, ttlSeconds = 3600) {
  const sessionId = uuidv4();
  await redis.setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(data));
  return sessionId;
}

 async function getSession(sessionId) {
  const raw = await redis.get(`session:${sessionId}`);
  return raw ? JSON.parse(raw) : null;
}

 async function destroySession(sessionId) {
  const key = `session:${sessionId}`;
  const raw = await redis.get(key);
  if (raw) {
    const sess = JSON.parse(raw);
    if (sess?.user_id) {
      await redis.srem(`user_sessions:${sess.user_id}`, sessionId);
    }
  }
  await redis.del(key);
}

// NEW: destroy all sessions for a user (logout everywhere)
 async function destroyAllSessionsForUser(userId) {
  const setKey = `user_sessions:${userId}`;
  const ids = await redis.smembers(setKey);
  if (ids.length) {
    const keys = ids.map(id => `session:${id}`);
    await redis.del(...keys);
  }
  await redis.del(setKey);
  return ids.length;
}

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

 async function createCheckoutSession(data) {
  const {
    session_type = 'SECURE_CHECKOUT',
    merchant_id,
    amount,
    currency,
    customer_id,
    redirect_url,
    cancel_url,
    meta,
    one_time_use = 1,
    expires_in_minutes = 30
  } = data;

  const token = generateToken(32);
  const reference_id = `CHKOUT_${Date.now()}`;
  const slug = reference_id.slice(-6);
  const expiresAt = new Date(Date.now() + expires_in_minutes * 60000);

  const connection = await db.getConnection();
  try {
    console.log([
      session_type, slug, token, reference_id, merchant_id, amount, currency,
      customer_id, redirect_url, cancel_url, JSON.stringify(meta || {}), one_time_use, expiresAt
    ])
    await connection.execute(
      `INSERT INTO checkout_sessions (
        session_type, slug, token, reference_id, merchant_id, amount, currency,
        customer_id, redirect_url, cancel_url, meta, status, one_time_use, used, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, ?)`,
      [
        session_type, slug, token, reference_id, merchant_id, amount, currency,
        customer_id, redirect_url, cancel_url, JSON.stringify(meta || {}), one_time_use, expiresAt
      ]
    );

    

    await redis.set(`checkout:${token}`, reference_id, 'EX', expires_in_minutes * 60);

    return {
      token,
      slug,
      checkout_url: `https://yourdomain.com/checkout/${token}`,
      expires_at: expiresAt
    };
  } finally {
    connection.release();
  }
}

 async function markCheckoutAsUsed(token) {
  const connection = await db.getConnection();
  try {
    await connection.execute(
      `UPDATE checkout_sessions SET used = 1, status = 'PAID' WHERE token = ?`,
      [token]
    );
    await redis.del(`checkout:${token}`);
  } finally {
    connection.release();
  }
}

 async function getCheckoutSession(token) {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT * FROM checkout_sessions WHERE token = ? AND status = 'PENDING' AND used = 0 AND expires_at > NOW()`,
      [token]
    );
    return rows[0] || null;
  } finally {
    connection.release();
  }
}

module.exports = {
    getCheckoutSession,
    getSession,
    createCheckoutSession,
    createSession,
    markCheckoutAsUsed,
    destroyAllSessionsForUser,
    destroySession,
}

