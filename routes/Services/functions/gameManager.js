const { v4: uuidv4 } = require('uuid');
const db = require('../../../database');
const UNOGame = require('./gameLogic');

// 🔹 CREATE GAME
async function createGame(hostName, maxPlayers = 6) {
  const hostId = uuidv4();       // UUID for the host
  const gameId = uuidv4();       // UUID for the game
  const game = new UNOGame(maxPlayers);

  try {
    // Add host to game state
    const addResult = game.addPlayer(hostId, hostName);
    if (!addResult.success)
      return { success: false, message: addResult.message };

    // Insert new game
    await db.query(
      'INSERT INTO games (id, host_id, player_name, status, max_players) VALUES ($1, $2, $3, $4, $5)',
      [gameId, hostId, hostName, 'waiting', maxPlayers]
    );

    // Insert host player
    await db.query(
      'INSERT INTO game_players (game_id, player_id, hand, is_host) VALUES ($1, $2, $3, $4)',
      [gameId, hostId, JSON.stringify(game.getPlayerCards(hostId)), true]
    );

    const gameState = game.getGameState();

    return {
      success: true,
      gameId,
      room: {
        gameId,
        code: gameId,
        players: gameState.players,
        maxPlayers: maxPlayers,
      },
      player: addResult.player,
      game: gameState,
    };
  } catch (err) {
    console.error('❌ createGame error:', err.message);
    return { success: false, message: err.message };
  }
}

async function getAvailableGames() {
  try {
    const result = await db.query('SELECT * FROM games WHERE status = $1', ['waiting']);

    console.log('🔹 Available games:', result.rows);

    const rooms = result.rows.map(row => ({
  gameId: row.id,
  hostName: row.host_id,
  maxPlayers: row.max_players,
  currentPlayers: 1, // or count from game_players table
  status: row.status,
  createdAt: row.created_at
}));



    return { success: true, rooms };
  } catch (err) {
    console.error('❌ getAvailableGames error:', err.message);
    return { success: false, rooms: [] };
  }
}



// 🔹 JOIN GAME
async function joinGame(gameId, playerId, playerName) {
  try {
    // Check game exists
    const [gameRows] = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameRows.length === 0)
      return { success: false, message: 'Game not found' };
    if (gameRows[0].status !== 'waiting')
      return { success: false, message: 'Game already started' };

    const game = new UNOGame(gameRows[0].max_players);

    // Load existing players
    const [playerRows] = await db.query('SELECT * FROM game_players WHERE game_id = $1', [gameId]);
    playerRows.forEach((p) => {
      game.addPlayer(p.player_id, p.player_name || `Player-${p.player_id.slice(0, 5)}`);
    });

    // Add new player
    const addResult = game.addPlayer(playerId, playerName);
    if (!addResult.success)
      return { success: false, message: addResult.message };

    // Save player in DB
    await db.query(
      'INSERT INTO game_players (game_id, player_id, hand, is_host) VALUES ($1, $2, $3, $4)',
      [gameId, playerId, JSON.stringify(game.getPlayerCards(playerId)), false]
    );

    const gameState = game.getGameState();

    return {
      success: true,
      gameId,
      room: {
        gameId,
        code: gameId,
        players: gameState.players,
        maxPlayers: gameState.maxPlayers || gameRows[0].max_players,
      },
      player: addResult.player,
      game: gameState,
    };
  } catch (err) {
    console.error('❌ joinGame error:', err.message);
    return { success: false, message: err.message };
  }
}


// 🔹 LEAVE GAME
async function leaveGame(playerId, gameId) {
  try {
    // ✅ Ensure player exists in this game
    const [playerRows] = await db.query(
      'SELECT * FROM game_players WHERE game_id = $1 AND player_id = $1',
      [gameId, playerId]
    );
    if (playerRows.length === 0)
      return { success: false, message: 'Player not found in this game' };

    // ✅ Load game info
    const [gameRows] = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameRows.length === 0)
      return { success: false, message: 'Game not found' };

    const game = new UNOGame(gameRows[0].max_players);

    // ✅ Load all current players
    const [allPlayers] = await db.query('SELECT * FROM game_players WHERE game_id = $1', [gameId]);
    allPlayers.forEach((p) => game.addPlayer(p.player_id, p.player_name));

    // ✅ Remove player
    const removeResult = game.removePlayer(playerId);
    if (!removeResult.success)
      return { success: false, message: removeResult.message };

    // ✅ Delete player from DB
    await db.query('DELETE FROM game_players WHERE game_id = $1 AND player_id = $1', [
      gameId,
      playerId,
    ]);

    // ✅ If there are players left, check for new host
    if (game.players.length > 0) {
      const newHostId = game.players[0].id;

      // Ensure the first player becomes host if needed
      await db.query(
        'UPDATE game_players SET is_host = (player_id = $1) WHERE game_id = $1',
        [newHostId, gameId]
      );

      console.log(`👑 New host assigned: ${newHostId}`);

      // Update game state if needed
      await db.quey(
        'UPDATE games SET host_id = $1 WHERE id = $1',
        [newHostId, gameId]
      );
    } else {
      // ✅ If no players left, delete the game entirely
      await db.query('DELETE FROM games WHERE id = $1', [gameId]);
      console.log(`🗑️ Game ${gameId} deleted (no players left).`);

      return { success: true, message: 'Game deleted (no players left)', gameDeleted: true };
    }

    // ✅ Return updated state
    return {
      success: true,
      message: 'Player left the game successfully',
      remainingPlayers: game.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
      })),
      gameDeleted: false,
      game: game.getGameState(),
    };

  } catch (err) {
    console.error('❌ leaveGame error:', err.message);
    return { success: false, message: err.message };
  }
}

// startGame.js
// async function startGame(gameId, playerId) {
//   try {
//     // ✅ Verify the player is part of this game
//     const [playerRows] = await db.query(
//       'SELECT * FROM game_players WHERE game_id = $1 AND player_id = $1',
//       [gameId, playerId]
//     );
//     if (playerRows.length === 0)
//       return { success: false, message: 'Player not in this game' };

//     // ✅ Load game info
//     const [gameRows] = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
//     if (gameRows.length === 0)
//       return { success: false, message: 'Game not found' };

//     const gameData = gameRows[0];
//     const maxPlayers = gameData.max_players || 6;

//     // Initialize UNO game
//     const game = new UNOGame(maxPlayers);

//     // ✅ Load all players and restore hands if they exist
//     const [allPlayers] = await db.query(
//       'SELECT * FROM game_players WHERE game_id = $1',
//       [gameId]
//     );

//     allPlayers.forEach((p) => {
//       const playerName = p.player_name || p.player_id;
//       const added = game.addPlayer(p.player_id, playerName);

//       if (p.hand) {
//         try {
//           added.player.cards = JSON.parse(p.hand);
//         } catch {
//           console.warn(`⚠️ Could not parse hand for ${p.player_id}`);
//         }
//       }
//     });

//     // ✅ Start the game: generate deck, deal hands, create discard pile
//     const startResult = game.startGame();
//     if (!startResult.success)
//       return { success: false, message: startResult.message };

//     const firstCard = startResult.discardPileTop;
//     const firstPlayer = game.players[0]; // host starts

//     // ✅ Update DB: set game status, discard pile, and current player
//     await db.query(
//       'UPDATE games SET status = $1, discard_pile = $1, current_player_id = $1 WHERE id = $1',
//       ['started', JSON.stringify(game.discardPile), firstPlayer.id, gameId]
//     );

//     // ✅ Save each player’s hand
//     for (const p of game.players) {
//       const hand = JSON.stringify(p.cards || []);
//       await db.query(
//         'UPDATE game_players SET hand = $1 WHERE game_id = $1 AND player_id = $1',
//         [hand, gameId, p.id]
//       );
//     }

//     // ✅ Log for debugging
//     console.log('🃏 Initial hands:');
//     game.players.forEach((p) => {
//       console.log(`Player ${p.id}:`, p.cards.map(c => `${c.color} ${c.value}`));
//     });
//     console.log('🃏 Discard pile top card:', firstCard);
//     console.log('🎮 First player turn:', firstPlayer.id);

//     // ✅ Return game state: only show cards to requesting player
//     return {
//       success: true,
//       gameId,
//       currentTurn: firstPlayer.id,
//       discardPileTop: firstCard,
//       game: game.getGameState(playerId)
//     };

//   } catch (err) {
//     console.error('❌ startGame error:', err.message);
//     return { success: false, message: err.message };
//   }
// }

async function startGame(gameId, playerId) {
  try {
    // ✅ Check if player is in this game
    const playerResult = await db.query(
      'SELECT * FROM game_players WHERE game_id = $1 AND player_id = $2',
      [gameId, playerId]
    );
    const playerRows = playerResult.rows;
    if (!playerRows || playerRows.length === 0) {
      return { success: false, message: 'Player not in this game' };
    }

    // ✅ Load game info
    const gameResult = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    const gameRows = gameResult.rows;
    if (!gameRows || gameRows.length === 0) {
      return { success: false, message: 'Game not found' };
    }

    const gameData = gameRows[0];
    const maxPlayers = gameData.max_players || 6;

    // Initialize UNO game
    const game = new UNOGame(maxPlayers);

    // ✅ Load all players and restore hands if they exist
    const allPlayersResult = await db.query(
      'SELECT * FROM game_players WHERE game_id = $1',
      [gameId]
    );
    const allPlayers = allPlayersResult.rows;

    allPlayers.forEach((p) => {
      const playerName = p.player_name || `Player-${p.player_id.slice(0, 5)}`;
      const added = game.addPlayer(p.player_id, playerName);
      if (p.hand) {
        try {
          added.player.cards = JSON.parse(p.hand);
        } catch {
          console.warn(`⚠️ Could not parse hand for ${p.player_id}`);
        }
      }
    });

    // ✅ Start the game
    const startResult = game.startGame();
    if (!startResult.success) {
      return { success: false, message: startResult.message };
    }

    const firstCard = startResult.discardPileTop;
    const firstPlayer = game.players[0]; // host starts

    // ✅ Update game status, discard pile, current player
    await db.query(
      'UPDATE games SET status=$1, discard_pile=$2, current_player_id=$3 WHERE id=$4',
      ['playing', JSON.stringify(game.discardPile), firstPlayer.id, gameId]
    );

    // ✅ Save each player's hand
    for (const p of game.players) {
      const hand = JSON.stringify(p.cards || []);
      await db.query(
        'UPDATE game_players SET hand=$1 WHERE game_id=$2 AND player_id=$3',
        [hand, gameId, p.id]
      );
    }

    // ✅ Return game state
    return {
      success: true,
      gameId,
      currentTurn: firstPlayer.id,
      discardPileTop: firstCard,
      game: game.getGameState(playerId), // only show cards for requesting player
    };
  } catch (err) {
    console.error('❌ startGame error:', err.message);
    return { success: false, message: err.message };
  }
}

// playCard.js
// ----------------------
// PLAY CARD
// ----------------------
async function playCard(gameId, playerId, cardIndex, chosenColor = null) {
  try {
    // ✅ Load player
    const [playerRows] = await db.query(
      'SELECT * FROM game_players WHERE game_id = $1 AND player_id = $1',
      [gameId, playerId]
    );
    if (!playerRows.length) return { success: false, message: 'Player not in this game' };

    // ✅ Load game info
    const [gameRows] = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (!gameRows.length) return { success: false, message: 'Game not found' };

    const gameData = gameRows[0];
    const game = new UNOGame(gameData.max_players || 6);

    // ✅ Restore discard pile
    if (gameData.discard_pile) {
      try {
        game.discardPile = JSON.parse(gameData.discard_pile);
      } catch { console.warn('⚠️ Failed to parse discard pile'); }
    }

    // ✅ Restore players & hands
    const [allPlayers] = await db.query('SELECT * FROM game_players WHERE game_id = $1', [gameId]);
    allPlayers.forEach((p) => {
      const added = game.addPlayer(p.player_id, p.player_name || p.player_id);
      if (p.hand) {
        try { added.player.cards = JSON.parse(p.hand); } catch {}
      }
    });

    // ✅ Restore current turn
    if (gameData.current_player_id) {
      const idx = game.players.findIndex(p => p.id === gameData.current_player_id);
      if (idx >= 0) game.currentPlayerIndex = idx;
    }

    // ✅ Turn validation
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { success: false, message: `Not your turn. It’s ${currentPlayer?.id}'s turn.` };
    }

    // ✅ Play the card
    const result = game.playCard(playerId, cardIndex, chosenColor);
    if (!result.success) return result;

    // ✅ Save hand & discard pile
    await db.query(
      'UPDATE game_players SET hand = $1 WHERE game_id = $1 AND player_id = $1',
      [JSON.stringify(game.getPlayerCards(playerId)), gameId, playerId]
    );
    await db.query(
      'UPDATE games SET discard_pile = $1, current_player_id = $1 WHERE id = $1',
      [JSON.stringify(game.discardPile), game.players[game.currentPlayerIndex]?.id || null, gameId]
    );

    return {
      success: true,
      message: 'Card played successfully',
      nextPlayer: game.players[game.currentPlayerIndex]?.id || null,
      game: game.getGameState(playerId), // only show this player's cards
    };

  } catch (err) {
    console.error('❌ playCard error:', err.message);
    return { success: false, message: err.message };
  }
}

// ----------------------
// DRAW CARD
// ----------------------
async function drawCard(playerId,autoPlay = false, chosenColor= null) {
  try {
    // ✅ Find player's game
    const [playerRows] = await db.query(
      'SELECT * FROM game_players WHERE player_id = $1',
      [playerId]
    );
    if (!playerRows.length) return { success: false, message: 'Player not in any game' };

    const gameId = playerRows[0].game_id;

    // ✅ Load game
    const [gameRows] = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (!gameRows.length) return { success: false, message: 'Game not found' };

    const gameData = gameRows[0];
    const game = new UNOGame(gameData.max_players || 6);

    // ✅ Restore discard pile
    if (gameData.discard_pile) {
      try { game.discardPile = JSON.parse(gameData.discard_pile); } catch {}
    }

    // ✅ Restore all players and their hands
    const [allPlayers] = await db.query(
      'SELECT * FROM game_players WHERE game_id = $1',
      [gameId]
    );
    allPlayers.forEach((p) => {
      const added = game.addPlayer(p.player_id, p.player_name || p.player_id);
      if (p.hand) {
        try { added.player.cards = JSON.parse(p.hand); } catch {}
      }
      if (p.is_host) added.player.isHost = true;
    });

    // ✅ Restore current turn
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { success: false, message: `Not your turn. It’s ${currentPlayer?.id}'s turn.` };
    }

    // ✅ Reshuffle if draw pile is empty
    if (game.drawPile.length === 0 && game.discardPile.length > 1) {
      const topCard = game.discardPile.pop();
      game.drawPile = [...game.discardPile].sort(() => Math.random() - 0.5);
      game.discardPile = [topCard];
    }

    // ✅ Draw a card
    const beforeHand = [...game.getPlayerCards(playerId)];
    const drawResult = game.drawCards(playerId, 1);
    if (!drawResult.success) return { success: false, message: 'Failed to draw card' };

    const afterHand = game.getPlayerCards(playerId);

    // ✅ Safely find drawn card
    const drawnCard = afterHand.find(
      c => !beforeHand.some(b => b.color === c.color && b.value === c.value)
    ) || afterHand[afterHand.length - 1]; // fallback to last card

    // ✅ Determine if playable
    const topCard = game.discardPile[game.discardPile.length - 1];
    const topColor = topCard.color === 'wild' && topCard.chosenColor
      ? topCard.chosenColor
      : topCard.color;

    const isPlayable = drawnCard.color === 'wild' || drawnCard.color === topColor || drawnCard.value === topCard.value;

    // ✅ Save hand to DB
    await db.query(
      'UPDATE game_players SET hand = $1 WHERE game_id = $1 AND player_id = $1',
      [JSON.stringify(afterHand), gameId, playerId]
    );

    // ✅ Auto-play if requested
    if (autoPlay && isPlayable) {
      const cardIndex = afterHand.findIndex(c => c.color === drawnCard.color && c.value === drawnCard.value);
      const playResult = game.playCard(playerId, cardIndex, chosenColor);

      if (playResult.success) {
        await db.query(
          'UPDATE game_players SET hand = $1 WHERE game_id = $1 AND player_id = $1',
          [JSON.stringify(game.getPlayerCards(playerId)), gameId, playerId]
        );
        await db.query(
          'UPDATE games SET discard_pile = $1, current_player_id = $1 WHERE id = $1',
          [JSON.stringify(game.discardPile), game.players[game.currentPlayerIndex].id, gameId]
        );
      }

      return {
        success: true,
        message: 'Card drawn and auto-played successfully',
        autoPlayed: true,
        drawnCard,
        nextPlayer: game.players[game.currentPlayerIndex].id,
        game: game.getGameState(playerId),
      };
    }

    // ✅ Update turn if card not playable
    if (!isPlayable) {
      game.currentPlayerIndex = (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length;
    }

    const nextPlayerId = game.players[game.currentPlayerIndex].id;
    await db.query(
      'UPDATE games SET current_player_id = $1, discard_pile = $1 WHERE id = $1',
      [nextPlayerId, JSON.stringify(game.discardPile), gameId]
    );

    return {
      success: true,
      message: isPlayable
        ? 'You drew a playable card! Play it within 10 seconds or your turn will skip.'
        : 'Card drawn successfully.',
      drawnCard,
      playable: isPlayable,
      playerHand: afterHand,
      nextPlayer: isPlayable ? playerId : nextPlayerId,
      game: game.getGameState(playerId),
    };

  } catch (err) {
    console.error('❌ drawCard error:', err.message);
    return { success: false, message: err.message };
  }
}





// 🔹 GET GAME STATE
async function getGameState(playerId, gameId) {
  try {
    // ✅ Validate player belongs to this game
    const [playerRows] = await db.query(
      'SELECT * FROM game_players WHERE game_id = $1 AND player_id = $1',
      [gameId, playerId]
    );
    if (playerRows.length === 0)
      return { success: false, message: 'Player not found in this game' };

    // ✅ Load game data
    const [gameRows] = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameRows.length === 0)
      return { success: false, message: 'Game not found' };

    const gameData = gameRows[0];
    const game = new UNOGame(gameData.max_players || 6);

    // ✅ Restore discard pile
    if (gameData.discard_pile) {
      try { game.discardPile = JSON.parse(gameData.discard_pile); } catch (err) {
        console.warn('⚠️ Failed to parse discard pile:', err.message);
      }
    }

    // ✅ Restore all players + their hands
    const [allPlayers] = await db.query('SELECT * FROM game_players WHERE game_id = $1', [gameId]);
    allPlayers.forEach((p) => {
      const added = game.addPlayer(p.player_id, p.player_name || p.player_id);
      if (p.hand) {
        try { added.player.cards = JSON.parse(p.hand); } catch {}
      }
      if (p.is_host) added.player.isHost = true;
    });

    // ✅ Restore current turn
    if (gameData.current_player_id) {
      const currentIndex = game.players.findIndex(p => p.id === gameData.current_player_id);
      if (currentIndex >= 0) game.currentPlayerIndex = currentIndex;
    }

    // ✅ Prepare view for this specific player
    const fullState = game.getGameState();
    const playerHand = game.getPlayerCards(playerId);

    const visiblePlayers = fullState.players.map(p => ({
      id: p.id,
      name: p.name,
      cardsCount: p.cardsCount,
      hasUno: p.hasUno,
      isHost: p.isHost,
      score: p.score,
      ...(p.id === playerId ? { cards: playerHand } : {}) // only show own cards
    }));

    return {
      success: true,
      message: 'Game state loaded successfully',
      gameId,
      game: {
        ...fullState,
        players: visiblePlayers,
        currentPlayerId: game.players[game.currentPlayerIndex]?.id || null,
        discardPileTop: game.discardPile.at(-1) || null,
      },
      playerCards: playerHand,
      discardPileTop: game.discardPile.at(-1) || null,
      currentPlayer: game.players[game.currentPlayerIndex]?.id || null,
    };

  } catch (err) {
    console.error('❌ getGameState error:', err.message);
    return { success: false, message: err.message };
  }
}


module.exports = {
  createGame,
  joinGame,
  leaveGame,
  startGame,
  playCard,
  drawCard,
  getGameState,
getAvailableGames
};
