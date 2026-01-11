const http = require('http');
const { Server } = require('socket.io');
const app = require('./app'); // Express app
const db = require('./database'); // PostgreSQL client
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

const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://yit-web.onrender.com';

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', (socket) => {
  console.log('🎮 Player connected:', socket.id);

  // ----------------------
  // CREATE GAME
  // ----------------------
  socket.on('create_game', async ({ maxPlayers, token }) => {
    try {
      if (!token) return socket.emit('game_error', { message: 'Token missing' });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const playerId = decoded.id;
      const playerName = `${decoded.first_name} ${decoded.second_name}`;

      const result = await createGame(playerName, maxPlayers, playerId);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      socket.join(result.gameId);

      // Send game state to creator
      const state = await getGameState(playerId, result.gameId);
      socket.emit('game_room_created', {
        room: result.room,
        player: result.player,
        game: state.game,
      });
    } catch (err) {
      console.error('❌ create_game error:', err.message);
      socket.emit('game_error', { message: 'Authentication failed' });
    }
  });

  // ----------------------
  // JOIN GAME
  // ----------------------

  socket.on('get_game_state', async ({ gameId, playerId }) => {
  try {
    const state = await getGameState(playerId, gameId);

    if (!state.success || !state.game) {
      return socket.emit('game_error', { message: state.message || 'Game not found' });
    }

    // ✅ Always wrap
    socket.emit('game_state', { game: state.game });

  } catch (err) {
    console.error('❌ get_game_state error:', err.message);
    socket.emit('game_error', { message: 'Internal server error' });
  }
});


  socket.on('join_game', async ({ gameId, token }) => {
    try {
      if (!token) return socket.emit('game_error', { message: 'Token missing' });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const playerId = decoded.id;
      const playerName = `${decoded.first_name} ${decoded.second_name}`;

      const result = await joinGame(gameId, socket.id, playerName, playerId);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      socket.join(gameId);

      // Send full game state to joining player
      const state = await getGameState(playerId, gameId);
      socket.emit('game_room_joined', {
        room: result.room,
        player: result.player,
        game: state.game,
      });

      // Notify others
      socket.to(gameId).emit('player_joined', result.player);

    } catch (err) {
      console.error('❌ join_game error:', err.message);
      socket.emit('game_error', { message: 'Authentication failed' });
    }
  });

  // ----------------------
  // GET AVAILABLE ROOMS
  // ----------------------
  socket.on('get_available_rooms', async () => {
    try {
      const result = await getAvailableGames(2);
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
  socket.on('disconnect', async (reason) => {
    console.log('Player disconnected:', socket.id, 'Reason:', reason);

    try {
      const { rows } = await db.query(
        'SELECT player_id, game_id FROM game_players WHERE socket_id = $1',
        [socket.id]
      );

      if (!rows.length) return;

      const { player_id, game_id } = rows[0];
      await leaveGame(player_id, game_id);

      const state = await getGameState(player_id, game_id);
      io.to(game_id).emit('game_state', state.game);

    } catch (err) {
      console.warn('Disconnect cleanup failed:', err.message);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on http://0.0.0.0:${PORT}`));
