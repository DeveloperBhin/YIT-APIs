// Game Endpoints Index - Export all game endpoints

const gameSocketHandlers = require('./gameSocketHandlers');
const gameHttpRoutes = require('./gameHttpRoutes');

module.exports = {
  gameSocketHandlers,
  gameHttpRoutes
};
