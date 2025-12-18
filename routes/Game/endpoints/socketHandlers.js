// socketHandlers.js
const GameManager = require('./gameManager');
const gameManager = new GameManager();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create game
    socket.on('create_game', ({ playerName }) => {
      const result = gameManager.createGame(socket.id, playerName);
      if (result.success) {
        socket.join(result.gameId);
        io.to(socket.id).emit('game_created', { gameId: result.gameId, player: result.player });
        io.emit('available_rooms', { rooms: gameManager.getAllGames() });
      } else {
        io.to(socket.id).emit('error', { message: result.message });
      }
    });

    // Join game
    socket.on('join_game', ({ playerName, gameId }) => {
      const result = gameManager.joinGame(gameId, socket.id, playerName);
      if (result.success) {
        socket.join(gameId);
        io.to(gameId).emit('player_joined', { game: result.game });
      } else {
        io.to(socket.id).emit('error', { message: result.message });
      }
    });

    socket.on('start_game', () => {
      const room = this.gameManager.getRoomBySocket(socket.id);
      if (!room) return;
    
      const game = this.gameManager.startGame(room.id); // Should handle card dealing etc.
    
      // Broadcast updated room & game state to everyone
      this.io.to(room.id).emit('game_started', { room, game });
      this.io.to(room.id).emit('game_state', { room, game });
    
      console.log(`[DEBUG] Game started in room ${room.id} by ${socket.id}`);
    });
    

    // Play card
    socket.on('play_card', ({ cardIndex, chosenColor }) => {
      const result = gameManager.playCard(socket.id, cardIndex, chosenColor);
      const gameId = gameManager.playerToGame.get(socket.id);
      if (result.success) {
        io.to(gameId).emit('game_update', { game: gameManager.games.get(gameId).getGameState() });
      } else {
        io.to(socket.id).emit('error', { message: result.message });
      }
    });

    // Draw card
    socket.on('draw_card', () => {
      const result = gameManager.drawCard(socket.id);
      const gameId = gameManager.playerToGame.get(socket.id);
      if (result.success) {
        io.to(socket.id).emit('card_drawn', { cardsDrawn: result.cardsDrawn, yourCards: gameManager.getGameState(socket.id).playerCards });
      } else {
        io.to(socket.id).emit('error', { message: result.message });
      }
    });

    // Leave game
    socket.on('leave_game', () => {
      const result = gameManager.leaveGame(socket.id);
      if (result.success) {
        socket.leave(gameManager.playerToGame.get(socket.id));
        io.emit('available_rooms', { rooms: gameManager.getAllGames() });
      } else {
        io.to(socket.id).emit('error', { message: result.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
      gameManager.leaveGame(socket.id);
      io.emit('available_rooms', { rooms: gameManager.getAllGames() });
    });
  });
};
