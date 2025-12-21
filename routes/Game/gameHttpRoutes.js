const express = require('express');
const router = express.Router();

const {
  createGame,
  joinGame,
  leaveGame,
  startGame,
  playCard,
  drawCard,
  getGameState,
  getAvailableGames
} = require('../Services/functions/gameManager'); // your existing functions

// Create game
router.post('/games', async (req, res) => {
  const {playerName, maxPlayers } = req.body;
  if(!playerName || !maxPlayers){
        return res.status(400).json({ success: false, message: "required maxPlayers or Players name" });

  }
  const result = await createGame(playerName, maxPlayers);
  res.json(result);
});

router.post('/getgames', async (req, res) => {
  try {
    const { minutesAgo } = req.body || {};
    const result = await getAvailableGames(minutesAgo = 2);

    res.status(200).json(result);
  } catch (err) {
    console.error('❌ /getgames error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Join game
router.post('/games/join', async (req, res) => {
  const { playerId,gameId, playerName } = req.body;
  if(!playerId || !playerName || !gameId){
        return res.status(400).json({ success: false, message: "mising some required " });

  }
  const result = await joinGame(gameId, playerId, playerName);
  res.json(result);
});

// Start game
// Start game
router.post('/games/start', async (req, res) => {
  const { gameId, playerId } = req.body;
  if(!playerId || !gameId){
        return res.status(400).json({ success: false, message: "mising some required " });

  }
  const result = await startGame(gameId, playerId);
  res.json(result);
});


// Play card
router.post('/games/play', async (req, res) => {
  const { gameId,playerId, cardIndex, chosenColor } = req.body;
  if(!playerId || !cardIndex || !gameId || !chosenColor){
        return res.status(400).json({ success: false, message: "mising some required " });

  }
  const result = await playCard(gameId,playerId, cardIndex, chosenColor);
  res.json(result);
});

// Draw card
router.post('/games/draw', async (req, res) => {
  const { playerId } = req.body;
  if(!playerId ){
        return res.status(400).json({ success: false, message: "mising some required " });

  }
  const result = await drawCard(playerId);
  res.json(result);
});

// Leave game
router.post('/games/leave', async (req, res) => {
  const { playerId ,gameId} = req.body;
  if(!playerId || !gameId){
        return res.status(400).json({ success: false, message: "required playerId or gameId" });

  }
  const result = await leaveGame(playerId,gameId);
  res.json(result);
});

// Get game state
router.post('/games/state', async (req, res) => {
  const { playerId,gameId} = req.body;
  if(!playerId || !gameId){
        return res.status(400).json({ success: false, message: "mising some required " });

  }
  const result = await getGameState(playerId,gameId);
  res.json(result);
});

module.exports = router;
