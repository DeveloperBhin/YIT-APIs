const http = require('http');
const { Server } = require('socket.io');
const app = require('./app'); // Express app
const db = require('./database');

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
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'https://yit-web.deploy.tz/', // Set your frontend URL in production
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000, // prevent early disconnects
});

// ----------------------
// SOCKET.IO EVENTS
// ----------------------
io.on('connection', (socket) => {
  console.log('🎮 Player connected:', socket.id);

  // CREATE GAME
  socket.on('create_game', async ({ playerName, maxPlayers }) => {
  try {
    if (!playerName) {
      return socket.emit('game_error', { message: 'Player name is required' });
    }

    // Create the game and host player
    const result = await createGame(playerName, maxPlayers);

    if (!result.success) return socket.emit('game_error', { message: result.message });

    // Join the socket to the room
    socket.join(result.gameId);

    // Emit game info back to host
    socket.emit('game_room_created', { 
      room: result.room, 
      player: result.player, 
      game: result.game 
    });
  } catch (err) {
    console.error('❌ create_game error:', err.message);
    socket.emit('game_error', { message: err.message });
  }
});

// Listen for request from clients
socket.on('get_available_rooms', async () => {
  console.log('🔹 Socket received get_available_rooms');

  try {
    const result = await getAvailableGames(2); // 2-minute window
    console.log('🔹 getAvailableGames result:', result); // <-- check what it returns
    socket.emit('available_rooms', { rooms: result.rooms });
  } catch (err) {
    console.error('❌ get_available_rooms error:', err.message);
    socket.emit('available_rooms', { rooms: [] });
  }
});



  // JOIN GAME
socket.on('join_game', async ({ gameId, playerName }) => {
  try {
    const result = await joinGame(gameId, socket.id, playerName);
    if (!result.success) return socket.emit('game_error', { message: result.message });

    socket.join(gameId);

    // Send a payload that matches the frontend expectation
    socket.emit('game_room_joined', {
      room: {
        gameId: result.gameId,
        maxPlayers: result.room.maxPlayers,
        players: result.game.players, // optional if frontend uses room.players
      },
      player: result.player,
      game: result.game, // frontend expects this
    });
  } catch (err) {
    console.error('❌ join_game error:', err.message);
    socket.emit('game_error', { message: err.message });
  }
});


  // START GAME
  socket.on('start_game', async ({ gameId }) => {
    try {
      const result = await startGame(gameId, socket.id);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      await db.execute('UPDATE games SET status = ? WHERE id = ?', ['playing', gameId]);
      io.to(gameId).emit('game_state', { game: { ...result.game, gameStatus: 'playing' } });

      // Send each player's hand privately
      const [players] = await db.execute('SELECT player_id FROM game_players WHERE game_id = ?', [gameId]);
      for (const p of players) {
        const playerState = await getGameState(p.player_id, gameId);
        io.to(p.player_id).emit('playerCards', { cards: playerState.playerCards });
      }

      console.log(`🎮 Game ${gameId} started with ${players.length} players`);
    } catch (err) {
      console.error('❌ start_game error:', err.message);
      socket.emit('game_error', { message: err.message });
    }
  });

  // PLAY CARD
  socket.on('play_card', async ({ gameId, playerId, cardIndex, chosenColor }) => {
    try {
      const result = await playCard(gameId, playerId, cardIndex, chosenColor);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      const [gameRows] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
      const gameData = gameRows[0];

      // Broadcast updated game state
      io.to(gameId).emit('game_state', { game: { ...result.game, gameStatus: gameData.status || 'waiting' } });

      // Broadcast each player's hand
      const [players] = await db.execute('SELECT player_id FROM game_players WHERE game_id = ?', [gameId]);
      for (const p of players) {
        const playerState = await getGameState(p.player_id, gameId);
        io.to(p.player_id).emit('playerCards', { cards: playerState.playerCards });
      }

      console.log(`🎴 Player ${playerId} played a card. Next turn: ${result.nextPlayer}`);
    } catch (err) {
      console.error('❌ play_card error:', err.message);
      socket.emit('game_error', { message: err.message });
    }
  });

  // DRAW CARD
  socket.on('draw_card', async ({ playerId, autoPlay = false, chosenColor = null }) => {
    try {
      const result = await drawCard(playerId, autoPlay, chosenColor);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      const gameId = result.game?.gameId || (await db.execute('SELECT game_id FROM game_players WHERE player_id = ?', [playerId]))[0][0].game_id;
      const state = await getGameState(playerId, gameId);

      io.to(gameId).emit('game_state', state.game);

      state.game.players.forEach((p) => {
        if (p.cards) io.to(p.id).emit('playerCards', { cards: p.cards });
      });

      console.log(`🎴 Player ${playerId} drew a card. Next turn: ${state.game.currentPlayerId}`);
    } catch (err) {
      console.error('❌ draw_card error:', err.message);
      socket.emit('game_error', { message: err.message });
    }
  });

  // LEAVE GAME
  socket.on('leave_game', async ({ playerId, gameId }) => {
    try {
      const result = await leaveGame(playerId, gameId);
      if (!result.success) return socket.emit('game_error', { message: result.message });

      socket.leave(gameId);
      socket.emit('game_room_left', result);

      const [gameRows] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
      const gameData = gameRows[0];

      io.to(gameId).emit('game_state', { game: { ...(await getGameState(playerId, gameId)), gameStatus: gameData.status || 'waiting' } });
    } catch (err) {
      console.error('❌ leave_game error:', err.message);
      socket.emit('game_error', { message: err.message });
    }
  });

  // DISCONNECT
  socket.on('disconnect', async () => {
    console.log('Player disconnected:', socket.id);
    try {
      const [rows] = await db.execute('SELECT game_id FROM game_players WHERE player_id = ?', [socket.id]);
      if (rows.length > 0) {
        const gameId = rows[0].game_id;
        await leaveGame(socket.id, gameId);

        const state = await getGameState(socket.id, gameId);
        io.to(gameId).emit('game_state', state);
      }
    } catch (err) {
      console.warn('Error on disconnect leaveGame:', err.message);
    }
  });
});

// ----------------------
// START SERVER
// ----------------------
const PORT = process.env.PORT || 3002;
server.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on http://0.0.0.0:${PORT}`));
