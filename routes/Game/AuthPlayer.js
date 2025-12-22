// routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const db = require('../../database');
const getSession  = require('../../routes/middlewares/Sessions');

const redis = require('../../redis');
const { PlayerAuth } = require('../middlewares/PlayerAuth');



const router = express.Router();
// const redis = require('../services/redis');

const normalizePhone = (phone) => {
  if (!phone) return null;

  // Convert to string, remove spaces and non-digit/+ chars
  let normalized = phone.toString().trim().replace(/\s+/g, '');

  // If starts with 0 → replace with +255
  if (normalized.startsWith('0')) {
    normalized = '+255' + normalized.slice(1);
  }

  // If starts with 255 (but missing +) → add +
  else if (normalized.startsWith('255') && !normalized.startsWith('+255')) {
    normalized = '+' + normalized;
  }

  // If already starts with +255 → leave as is
  else if (!normalized.startsWith('+255')) {
    // Handle unexpected formats (like +1 or +254)
    console.warn(`⚠️ Unexpected phone format: ${normalized}`);
  }

  return normalized;
};



const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Try again later.'
});

const signupSchema = Joi.object({
  first_name: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name cannot exceed 50 characters',
      'string.pattern.base': 'First name can only contain letters and spaces',
      'any.required': 'First name is required'
    }),
  second_name: Joi.string()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.min': 'Second name must be at least 2 characters long',
      'string.max': 'Second name cannot exceed 50 characters',
      'string.pattern.base': 'Second name can only contain letters and spaces',
      'any.required': 'Second name is required'
    }),
  email: Joi.string()
    .email()
    .min(5)
    .max(100)
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'string.min': 'Email must be at least 5 characters long',
      'string.max': 'Email cannot exceed 100 characters',
      'any.required': 'Email is required'
    }),
  phone_number: Joi.string()
  .trim()
  .pattern(/^(?:\+?255|0)[67]\d{8}$/)
  .required()
  .messages({
    'string.pattern.base':
      'Please provide a valid Tanzanian mobile number (e.g., 0744798828, 255744798828, +255744798828)',
    'any.required': 'Phone number is required'
  }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
 
 
});



router.post('/signup', async (req, res) => {
  const { error, value } = signupSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const validationErrors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return res.status(400).json({
      message: 'Validation failed',
      errors: validationErrors
    });
  }

  const { first_name, second_name, email, phone_number, password } = value;

  // Normalize phone number
  const normalizePhone = (phone) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) return '255' + cleaned.slice(1);
    if (cleaned.startsWith('255')) return cleaned;
    return '255' + cleaned;
  };

  const normalizedPhone = normalizePhone(phone_number);

  if (!/^255\d{9}$/.test(normalizedPhone)) {
    return res.status(400).json({
      message: 'Invalid phone number format',
      error: 'Please provide a valid Tanzanian phone number starting with 255'
    });
  }

  try {
    // Check for existing user
    const result = await db.query(
      `SELECT id FROM player WHERE email = $1 OR phone_number = $2`,
      [email.toLowerCase(), normalizedPhone]
    );

    if (result.rows.length > 0) {
      return res.status(409).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into DB using normalized phone
    const insertResult = await db.query(
      `INSERT INTO player (first_name, second_name, email, phone_number, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [first_name, second_name, email.toLowerCase(), normalizedPhone, hashedPassword]
    );

    const user = insertResult.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: 'Signup successful',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        second_name: user.second_name,
        email: user.email,
        phone_number: user.phone_number
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Signup failed', error: 'Internal server error' });
  }
});






router.post('/login', loginLimiter, async (req, res) => {
  const { type, value, password } = req.body;

  try {
    if (!type || !value || !password) {
      return res.status(400).json({ message: 'Missing login fields' });
    }

    // Normalize phone numbers
    const normalizePhone = (phone) => {
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.startsWith('0')) return '255' + cleaned.slice(1);
      if (cleaned.startsWith('255')) return cleaned;
      return '255' + cleaned;
    };

    let query, identifier;
    if (type === 'phone') {
      identifier = normalizePhone(value);
      query = `SELECT * FROM player WHERE phone_number = $1 AND status = 'ACTIVE'`;
    } else if (type === 'email') {
      identifier = value.toLowerCase();
      query = `SELECT * FROM player WHERE email = $1 AND status = 'ACTIVE'`;
    } else {
      return res.status(400).json({ message: 'Invalid login type. Use "phone" or "email".' });
    }

    const result = await db.query(query, [identifier]);
    const players = result.rows;

    if (players.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const player = players[0];
    const isValid = await bcrypt.compare(password, player.password_hash);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ✅ Create Redis session
    const sessionId = uuidv4();
    const sessionData = {
      player_id: player.id,
      first_name: player.first_name,
      second_name: player.second_name,
      email: player.email,
      phone: player.phone_number,
      status: player.status,
      createdAt: Date.now()
    };

    // Save session in Redis (expire in 1 hour = 3600s)
await redis.set(`session:${sessionId}`, JSON.stringify(sessionData), { EX: 3600 });

    // Send response
    res.status(200).json({
      message: 'Login successful',
      sessionId,
      expires_in: 3600,
      player: {
        id: player.id,
        first_name: player.first_name,
        second_name: player.second_name,
        email: player.email,
        phone_number: player.phone_number,
        status: player.status
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed', error: 'Internal server error' });
  }
});





router.post('/logout',PlayerAuth, async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  
  if (sessionId) {
    await destroySession(sessionId);
  }

  // If you set a cookie for sessionId, clear it too:
  // res.clearCookie('sessionId', { httpOnly: true, sameSite: 'lax', secure: true });

  return res.json({ message: 'Logged out' });
});

router.post('/logout-all', PlayerAuth, async (req, res) => {
  const count = await destroyAllSessionsForUser(req.user.user_id);
  // res.clearCookie('sessionId', { httpOnly: true, sameSite: 'lax', secure: true });
  return res.json({ message: 'Logged out from all devices', count });
});









router.post('/request-password-reset', async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone && !email) {
      return res.status(400).json({ message: 'Please provide either phone or email.' });
    }

    let type, identifier;
    if (phone) {
      type = 'phone';
      identifier = normalizePhone(phone);
      if (!identifier) return res.status(400).json({ message: 'Invalid phone number format.' });
    } else {
      type = 'email';
      identifier = email.toLowerCase();
    }

    const [rows] = await db.execute(
      type === 'phone'
        ? `SELECT id, email, phone_number FROM users WHERE phone_number = ?`
        : `SELECT id, email FROM users WHERE email = ?`,
      [identifier]
    );

    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = rows[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = `reset:${type}:${identifier}`;

    await redis.setex(otpKey, 300, JSON.stringify({ code: otp, userId: user.id, attempts: 0 }));

    if (type === 'phone') {
      const phoneForSMS = identifier.startsWith('255') ? `+${identifier}` : identifier;
      await sendOtpSMS(phoneForSMS, otp);
    } else {
      await sendTemplatedEmail('otp', identifier, { otp, merchant_name: 'SenjaroPay' });
    }

    return res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Password reset request error:', err);
    return res.status(500).json({ message: 'Failed to process request', error: err.message });
  }
});



router.post('/reset-password', async (req, res) => {
  try {
    const { type, value, otp, new_password } = req.body;

    if (!['phone', 'email'].includes(type)) {
      return res.status(400).json({ message: 'Invalid type' });
    }

    if (!value || !new_password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const identifier = type === 'phone'
      ? normalizePhone(value) : value.toLowerCase();

    
    if (type === 'phone') {
      if (!otp) return res.status(400).json({ message: 'OTP is required for phone reset' });

      const otpKey = `reset:phone:${identifier}`;
      const storedRaw = await redis.get(otpKey);

      if (!storedRaw) {
        return res.status(400).json({ message: 'OTP not requested or expired' });
      }

      const stored = JSON.parse(storedRaw);

      stored.attempts = (stored.attempts || 0) + 1;
      if (stored.attempts > 3) {
        await redis.del(otpKey);
        return res.status(429).json({ message: 'Too many invalid attempts. Request a new OTP.' });
      }

      if (stored.code !== otp) {
        await redis.setex(otpKey, 300, JSON.stringify(stored)); 
        return res.status(401).json({ message: 'Invalid OTP' });
      }

      await redis.setex(`reset-verified:phone:${identifier}`, 600, stored.userId);
      await redis.del(otpKey);
    }

    
    const storeKey = type === 'phone'
      ? `reset-verified:phone:${identifier}`
      : `reset-link:${identifier}`;

    const userId = await redis.get(storeKey);
    if (!userId) {
      return res.status(400).json({ message: 'OTP or reset link not verified or expired' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db.execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashed, userId]);
    await redis.del(storeKey);

    return res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

router.post('/getPlayers', PlayerAuth, async (req, res) => {
  try {
    const merchant_id = req.user.merchant_id; 

    if (!merchant_id) {
      return res.status(401).json({ message: 'Unauthorized: no merchant in session' });
    }

    const query = `SELECT * FROM merchant WHERE id = ?`;
    const [rows] = await db.execute(query, [merchant_id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    res.status(200).json({ merchant: rows[0] });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to fetch merchant',
      error: error.message,
    });
  }
});


router.post('/change-password', PlayerAuth, async (req, res) => {
  try {
    const { current_password, new_password, phone_number } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'Missing current_password or new_password' });
    }

    // Use phone_number if provided, otherwise fallback to logged-in email
    const identifier = phone_number ? normalizePhone(phone_number) : req.user.email;

    // Fetch user by email or phone
    const [rows] = await db.execute(
      `SELECT um.merchant_id, m.email, u.phone_number, u.password_hash
       FROM user_merchants um
       JOIN merchant m ON m.id = um.merchant_id
       JOIN users u ON u.id = um.user_id
       WHERE u.phone_number = ? OR m.email = ?`,
      [identifier, identifier]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];

    // Verify current password
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP and new password
    otpStore.set(`change-password:${user.merchant_id}`, {
      otp: otpCode,
      new_password,
      attempts: 0,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
    });

    // Send OTP via phone or email
    if (user.phone_number) {
  // Africa's Talking requires '+' prefix
  const smsNumber =   normalizePhone(user.phone_number);
  await sendOtpSMS(smsNumber, otpCode);
} else {
  await sendTemplatedEmail('otp', user.email, { otp: otpCode, merchant_name: 'SenjaroPay' });
}

    return res.status(200).json({ message: 'OTP sent successfully. Please verify to complete password change.' });

  } catch (err) {
    console.error('Change password initiation error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});







// Merchant "me" route to get current merchant user details
router.post('/me', PlayerAuth, async (req, res) => {
  try {
    // Get session details
    const sessionId = req.headers['x-session-id'];
    const session = await getSession(sessionId);
    
    if (!session) {
      return res.status(401).json({
        message: 'Invalid or expired session',
        error: 'Please login again'
      });
    }

    // Get user details from database
    const [userRows] = await db.execute(
      `SELECT u.id, u.first_name, u.second_name, u.email, u.phone_number, u.status, u.created_at
       FROM users u
       WHERE u.id = ? AND u.status = 'ACTIVE'`,
      [session.user_id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        message: 'User not found or inactive',
        error: 'Please contact support'
      });
    }

    const user = userRows[0];

    // Get all merchants linked to this user
    const [merchantRows] = await db.execute(
      `SELECT m.id AS merchant_id, m.business_name, m.email, m.phone_number, m.status, 
              m.registration_number, m.business_type, um.role, m.created_at, m.updated_at
       FROM user_merchants um
       JOIN merchant m ON m.id = um.merchant_id
       WHERE um.user_id = ?
       ORDER BY m.business_name`,
      [session.user_id]
    );

    if (merchantRows.length === 0) {
      return res.status(403).json({
        message: 'No linked merchants found',
        error: 'Please contact support'
      });
    }

    // Get the current merchant (from session)
    const currentMerchant = merchantRows.find(m => m.merchant_id === session.merchant_id) || merchantRows[0];

    // Get session metadata (TTL if available)
    let expires_in_seconds = null;
    if (sessionId && typeof redis?.ttl === 'function') {
      try {
        const ttlSec = await redis.ttl(`session:${sessionId}`);
        if (ttlSec > 0) expires_in_seconds = ttlSec;
      } catch { /* ignore TTL errors */ }
    }

    return res.json({
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.second_name,
        email: user.email,
        phone_number: user.phone_number,
        status: user.status,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      current_merchant: {
        merchant_id: currentMerchant.merchant_id,
        business_name: currentMerchant.business_name,
        email: currentMerchant.email,
        phone_number: currentMerchant.phone_number,
        status: currentMerchant.status,
        registration_number: currentMerchant.registration_number,
        business_type: currentMerchant.business_type,
        role: currentMerchant.role,
        created_at: currentMerchant.created_at,
      },
      merchants: merchantRows.map(m => ({
        merchant_id: m.merchant_id,
        business_name: m.business_name,
        status: m.status,
        role: m.role
      })),
      session: {
        id: sessionId,
        type: session.type,
        issued_at: session.created_at,
        expires_in_seconds,
        ip: session.ip,
        device: session.device,
        role: session.role
      }
    });

  } catch (err) {
    console.error('Merchant /me error:', err);
    return res.status(500).json({
      message: 'Failed to get merchant details',
      error: 'Internal server error'
    });
  }
});



module.exports = router;
