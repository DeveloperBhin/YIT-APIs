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
  getGameState
} = require('./routes/Services/functions/gameManager');

// ----------------------
// INITIALIZE SERVER
// ----------------------
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ----------------------
// SOCKET.IO EVENTS
// ----------------------
io.on('connection', (socket) => {
  console.log('🎮 Player connected:', socket.id);

  // CREATE GAME
  socket.on('create_game', async ({ playerName, maxPlayers }) => {
    const result = await createGame(socket.id, playerName, maxPlayers);
    if (!result.success) return socket.emit('game_error', { message: result.message });

    socket.join(result.gameId);

    socket.emit('game_room_created', {
      room: {
        gameId: result.gameId,
        code: result.gameId,
        players: result.game?.players || [],
        maxPlayers: result.game?.maxPlayers || maxPlayers || 6,
      },
      player: result.player || { id: socket.id, name: playerName },
      game: result.game || {},
    });
  });

  // JOIN GAME
  socket.on('join_game', async ({ gameId, playerName }) => {
    const result = await joinGame(gameId, socket.id, playerName);
    if (!result.success) return socket.emit('game_error', { message: result.message });

    socket.join(gameId);

    socket.emit('game_room_joined', {
      room: {
        gameId: result.gameId,
        code: result.gameId,
        players: result.game?.players || [],
        maxPlayers: result.game?.maxPlayers || 6,
      },
      player: result.player || { id: socket.id, name: playerName },
      game: result.game || {},
    });
  });

  // START GAME
 socket.on('start_game', async ({ gameId }) => {
  try {
    console.log('➡️ start_game received:', gameId);

    // Run game start logic
    const result = await startGame(gameId, socket.id);

    if (!result.success) {
      console.error('❌ startGame failed:', result.message);
      return socket.emit('game_error', { message: result.message });
    }

    console.log('✅ Game started successfully:', result);

    // ✅ Update database status to 'playing' just in case
    await db.execute(
      'UPDATE games SET status = ? WHERE id = ?',
      ['playing', gameId]
    );

    // ✅ Broadcast full state to all players
    io.to(gameId).emit('game_state', {
      game: {
        ...result.game,
        gameStatus: 'playing',
        discardPileTop: result.discardPileTop || null,
      },
    });

    // ✅ Send each player's hand privately
    const [players] = await db.execute(
      'SELECT player_id FROM game_players WHERE game_id = ?',
      [gameId]
    );

    for (const p of players) {
      const playerState = await getGameState(p.player_id, gameId);
      io.to(p.player_id).emit('playerCards', { cards: playerState.playerCards });
    }

    console.log(`🎮 Game ${gameId} started successfully with ${players.length} players.`);
  } catch (err) {
    console.error('❌ start_game socket error:', err.message);
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
      io.to(gameId).emit('game_state', {
        game: {
          ...result.game,
          gameStatus: gameData.status || 'waiting',
        },
      });

      // Broadcast each player's hand
      const [players] = await db.execute('SELECT player_id FROM game_players WHERE game_id = ?', [gameId]);
      for (const p of players) {
        const playerState = await getGameState(p.player_id, gameId);
        io.to(p.player_id).emit('playerCards', { cards: playerState.playerCards });
      }

      console.log(`🎴 Player ${playerId} played a card. Next turn: ${result.nextPlayer}`);
    } catch (err) {
      console.error('❌ play_card socket error:', err.message);
      socket.emit('game_error', { message: err.message });
    }
  });

  // DRAW CARD
 socket.on('draw_card', async ({ playerId, autoPlay = false, chosenColor = null }) => {
  try {
    const result = await drawCard(playerId, autoPlay, chosenColor);
    if (!result.success) return socket.emit('game_error', { message: result.message });

    const gameId = result.game.gameId || (await db.execute(
      'SELECT game_id FROM game_players WHERE player_id = ?',
      [playerId]
    ))[0][0].game_id;

    // ✅ Get latest state for frontend
    const state = await getGameState(playerId, gameId);

    io.to(gameId).emit('game_state', state.game);

    // Send each player's hand individually
    state.game.players.forEach(p => {
      if (p.cards) io.to(p.id).emit('playerCards', { cards: p.cards });
    });

    console.log(`🎴 Player ${playerId} drew a card. Next turn: ${state.game.currentPlayerId}`);
  } catch (err) {
    console.error('❌ draw_card socket error:', err.message);
    socket.emit('game_error', { message: err.message });
  }
});


  // LEAVE GAME
  socket.on('leave_game', async ({ playerId, gameId }) => {
    const result = await leaveGame(playerId, gameId);
    if (!result.success) return socket.emit('game_error', { message: result.message });

    socket.leave(gameId);
    socket.emit('game_room_left', result);

    const [gameRows] = await db.execute('SELECT * FROM games WHERE id = ?', [gameId]);
    const gameData = gameRows[0];

    io.to(gameId).emit('game_state', {
      game: {
        ...await getGameState(playerId, gameId),
        gameStatus: gameData.status || 'waiting',
      },
    });
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
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));
