
// import jwt from 'jsonwebtoken';
const db = require('../../database');
const getSession  = require ('./Sessions');



/**
 * AttendeeAuth middleware
 * - Checks for valid sessionId (normal user login)
 * - Or valid API key (server-to-server requests)
 */

// export const AdminAuth = async (req, res, next) => {
//   const sessionId = req.headers['x-session-id'];
//   const apiKey = req.headers['x-api-key'];

//   try {
//     // 🟢 1️⃣ SESSION-BASED AUTH (normal users)
//     if (sessionId) {
//       const session = await getSession(sessionId); // from Redis

//       if (session && session.user_id) {
//         // Fetch user info from database
//         const [rows] = await db.execute(
//           `SELECT user_id, full_name, email, phone, role 
//            FROM users_admin WHERE user_id = ?`,
//           [session.user_id]
//         );

//         if (rows.length === 0) {
//           return res.status(403).json({ message: 'User not found' });
//         }

//         const user = rows[0];

//         req.user = {
//           user_id: user.user_id,
//           full_name: user.full_name,
//           email: user.email,
//           phone: user.phone,
//           role: user.role,
//           sessionId
//         };

//         return next();
//       } else {
//         return res.status(403).json({ message: 'Invalid or expired session' });
//       }
//     }

//     // 🟣 2️⃣ API KEY-BASED AUTH (for partner systems)
//     if (apiKey) {
//       const [rows] = await db.execute(
//         `SELECT m.id AS merchant_id, m.email AS merchant_email, 
//                 m.business_name AS merchant_name,
//                 k.id AS api_key_id, k.name AS api_key_name, 
//                 k.permissions, k.expires_at, k.status
//          FROM merchant_api_keys k
//          JOIN merchant m ON m.id = k.merchant_id
//          WHERE k.public_key = ? AND k.status = 'active'`,
//         [apiKey]
//       );

//       if (rows.length === 0) {
//         return res.status(401).json({ message: 'Invalid API key' });
//       }

//       const key = rows[0];
//       if (key.expires_at && new Date(key.expires_at) < new Date()) {
//         return res.status(403).json({ message: 'API key has expired' });
//       }

//       req.user = {
//         merchant_id: key.merchant_id,
//         email: key.merchant_email,
//         merchant_name: key.merchant_name,
//         sessionId: null,
//         apiKey: {
//           id: key.api_key_id,
//           name: key.api_key_name,
//           permissions: JSON.parse(key.permissions || '[]')
//         }
//       };

//       return next();
//     }

//     // 🚫 3️⃣ No auth provided
//     return res.status(401).json({ message: 'Unauthorized: session or API key required' });

//   } catch (err) {
//     console.error('AttendeeAuth error:', err);
//     return res.status(500).json({ message: 'Internal server error' });
//   }
// };

const PlayerAuth = async (req, res, next) => {
  const sessionId = req.headers['x-session-id'];

  try {
    // 🟢 1️⃣ SESSION-BASED AUTH (normal users)
    if (sessionId) {
      const session = await getSession(sessionId); // from Redis

      if (session && session.user_id) {
        // Fetch user info from database
        const [rows] = await db.query(
          `SELECT player_id, full_name, email, phone
           FROM player WHERE player_id = $1`,
          [session.player_id]
        );

        if (rows.length === 0) {
          return res.status(403).json({ message: 'User not found' });
        }

        const user = rows[0];

        req.user = {
          player_id: user.player_id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          sessionId
        };

        return next();
      } else {
        return res.status(403).json({ message: 'Invalid or expired session' });
      }
    }

    // 🟣 2️⃣ API KEY-BASED AUTH (for partner systems)
  
  } catch (err) {
    console.error('PlayerAuth error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
    PlayerAuth
}








