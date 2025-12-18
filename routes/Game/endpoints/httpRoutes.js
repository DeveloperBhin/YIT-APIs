// HTTP Routes for UNO Game

const express = require('express');
const app = express();
app.use(express.json());// Health check endpoint
app.post('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'UNO Game Server is running',
    timestamp: new Date().toISOString()
  });
});

// Get Server info
app.post('/info', (req, res) => {
  res.json({
    name: 'UNO Card Game Server',
    version: '1.0.0',
    description: 'Real-time UNO card game using Socket.io',
    endpoints: {
      websocket: '/socket.io/',
      health: '/api/health',
      info: '/api/info',
      games: '/api/games',
      players: '/api/players'
    }
  });
});
// Available Games Endpoint (Lobby)
app.post('/games', (req, res) => {
  // This would need access to the game manager
  // For now, return a placeholder
  res.json({
    message: 'Use WebSocket connection to get available games',
    websocketEndpoint: '/socket.io/'
  });
});

// Player Management Endpoints

// Temporary in-memory player list (replace with DB later)
let players = [];

// Create/Register a new player
app.post('/players', (req, res) => {
  const { username } = req.body;

  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }

  // Check if username already exists
  const existing = players.find(p => p.username.toLowerCase() === username.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const newPlayer = {
    id: players.length + 1,
    username,
    score: 0,
    joinedAt: new Date().toISOString()
  };

  players.push(newPlayer);
  res.status(201).json({ message: 'Player registered successfully', player: newPlayer });
});

// Get all players
app.post('/players', (req, res) => {
  res.json({ count: players.length, players });
});

// Get one player by ID
app.post('/players/:id', (req, res) => {
  const player = players.find(p => p.id === parseInt(req.params.id));

  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  res.json(player);
});

// Update a player's score (optional enhancement)
app.post('/players/:id/score', (req, res) => {
  const player = players.find(p => p.id === parseInt(req.params.id));
  const { score } = req.body;

  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (typeof score !== 'number') return res.status(400).json({ error: 'Score must be a number' });

  player.score = score;
  res.json({ message: 'Score updated successfully', player });
});

// Delete a player
app.delete('/players/:id', (req, res) => {
  const playerIndex = players.findIndex(p => p.id === parseInt(req.params.id));

  if (playerIndex === -1) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const removed = players.splice(playerIndex, 1);
  res.json({ message: 'Player removed successfully', removedPlayer: removed[0] });
});

module.exports = router;

