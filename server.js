const http = require('http');
const { Server } = require('socket.io');
const app = require('./app'); // Express app
const db = require('./database'); // PostgreSQL client (pg)
const jwt = require('jsonwebtoken');

const {
  createGame,
  joinGame,
  leaveGame,
  startGame,
  playCard,
  drawCard,
  getGameState,
  getAvailableGames,
} = require('./routes/Services/functions/gameManager');

// ----------------------
// INITIALIZE SERVER
// ----------------------
const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     methods: ['GET', 'POST'],
//     credentials: true,
//   },
//   pingTimeout: 60000,
// });

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://yit-web.onrender.com',
    methods: ["GET", "POST"],
  },
  // transports: ["polling"], // match client
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ----------------------
// SOCKET.IO EVENTS
// ----------------------
io.on('connection', (socket) => {
  console.log('🎮 Player connected:', socket.id);

  // ----------------------
  // CREATE GAME
  // ----------------------
  socket.on('create_game', async ({ maxPlayers, token }) => {
    try {
      if (!token) return socket.emit('game_error', { message: 'Token missing' });

      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const playerId = decoded.id;
      const playerName = `${decoded.first_name} ${decoded.second_name}`;

      // Create the game
      const result = await createGame(playerName, maxPlayers, playerId);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      // Join socket room
      socket.join(result.gameId);

      socket.emit('game_room_created', {
        room: result.room,
        player: result.player,
        game: result.game,
      });
    } catch (err) {
      console.error('❌ create_game error:', err.message);
      socket.emit('game_error', { message: 'Authentication failed' });
    }
  });

  // ----------------------
  // JOIN GAME
  // ----------------------
  // socket.on('join_game', async ({ gameId, token }) => {
  //   try {
  //     if (!token) return socket.emit('game_error', { message: 'Token missing' });

  //     const decoded = jwt.verify(token, process.env.JWT_SECRET);
  //     const playerId = decoded.id;
  //     const playerName = `${decoded.first_name} ${decoded.second_name}`;

  //     const result = await joinGame(gameId, socket.id, playerName, playerId);
  //     if (!result.success) return socket.emit('game_error', { message: result.message });

  //     socket.join(gameId);

  //     socket.emit('game_room_joined', {
  //       room: {
  //         gameId: result.gameId,
  //         maxPlayers: result.room.maxPlayers,
  //         players: result.game.players,
  //       },
  //       player: result.player,
  //       game: result.game,
  //     });
  //   } catch (err) {
  //     console.error('❌ join_game error:', err.message);
  //     socket.emit('game_error', { message: 'Authentication failed' });
  //   }
  // });

  socket.on('join_game', async ({ gameId, token }) => {
    try {
      // validate token
      const user = verifyToken(token); // implement your JWT verify

      const room = findRoomById(gameId); // get room
      if (!room) {
        return socket.emit('game_error', { message: 'Room not found' });
      }

      // add player to room
      const player = addPlayerToRoom(room, user);

      socket.join(gameId);

      // emit to the joining player
      socket.emit('game_room_joined', {
        room,
        player,
        game: room.gameState,
      });

      // optional: broadcast to others
      socket.to(gameId).emit('player_joined', player);

    } catch (err) {
      console.error(err);
      socket.emit('game_error', { message: 'Failed to join room' });
    }
  });

  // ----------------------
  // GET AVAILABLE ROOMS
  // ----------------------
  socket.on('get_available_rooms', async () => {
    try {
      const result = await getAvailableGames(2); // 2-minute window
      socket.emit('available_rooms', { rooms: result.rooms });
    } catch (err) {
      console.error('❌ get_available_rooms error:', err.message);
      socket.emit('available_rooms', { rooms: [] });
    }
  });

  // ----------------------
  // LEAVE GAME
  // ----------------------
  socket.on('leave_game', async ({ token, gameId }) => {
    try {
      if (!token) return socket.emit('game_error', { message: 'Token missing' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const playerId = decoded.id;

      const result = await leaveGame(playerId, gameId);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      socket.leave(gameId);
      socket.emit('game_room_left', result);

      const state = await getGameState(playerId, gameId);
      io.to(gameId).emit('game_state', state.game);
    } catch (err) {
      console.error('❌ leave_game error:', err.message);
      socket.emit('game_error', { message: 'Internal server error' });
    }
  });

  // ----------------------
  // DISCONNECT
  // ----------------------
  socket.on('disconnect', async () => {
    console.log('Player disconnected:', socket.id);
    try {
      const query = `SELECT game_id FROM game_players WHERE socket_id = $1`;
      const { rows } = await db.query(query, [socket.id]);
      if (rows.length > 0) {
        const gameId = rows[0].game_id;
        await leaveGame(socket.id, gameId);
        const state = await getGameState(socket.id, gameId);
        io.to(gameId).emit('game_state', state.game);
      }
    } catch (err) {
      console.warn('Error on disconnect leaveGame:', err.message);
    }
  });
});

// ----------------------
// START SERVER
// ----------------------
const PORT = process.env.PORT ;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`)
);
