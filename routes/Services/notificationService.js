// Notification Service for UNO Game Events

class NotificationService {
  constructor(io) {
    this.io = io;
  }

  // Send game state update to all players in a room
  broadcastGameState(code, gameState, playerCards = null) {
    this.io.to(code).emit('game_state_update', {
      game: gameState,
      timestamp: new Date().toISOString()
    });

    // Send individual player cards if provided
    if (playerCards) {
      Object.entries(playerCards).forEach(([playerId, cards]) => {
        this.io.to(playerId).emit('player_cards', { cards });
      });
    }
  }

  // Notify player joined
  notifyPlayerJoined(code, player, gameState) {
    this.io.to(code).emit('player_joined', {
      player: {
        id: player.id,
        name: player.name,
        cardCount: player.cards.length,
        hasUno: player.hasUno,
        isActive: player.isActive
      },
      game: gameState,
      timestamp: new Date().toISOString()
    });
  }

  // Notify player left
  notifyPlayerLeft(code, playerId, gameState) {
    this.io.to(code).emit('player_left', {
      playerId,
      game: gameState,
      timestamp: new Date().toISOString()
    });
  }

  // Notify game started
  notifyGameStarted(code, gameState) {
    this.io.to(code).emit('game_started', {
      game: gameState,
      message: 'Game has started! Good luck!',
      timestamp: new Date().toISOString()
    });
  }

  // Notify card played
  notifyCardPlayed(code, playerId, card, gameState, gameOver = false, winner = null) {
    this.io.to(code).emit('card_played', {
      playerId,
      card,
      game: gameState,
      gameOver,
      winner: winner ? {
        id: winner.id,
        name: winner.name
      } : null,
      timestamp: new Date().toISOString()
    });
  }

  // Notify card drawn
  notifyCardDrawn(code, playerId, gameState) {
    this.io.to(code).emit('card_drawn', {
      playerId,
      game: gameState,
      timestamp: new Date().toISOString()
    });
  }

  // Notify UNO called
  notifyUnoCalled(code, playerId, playerName) {
    this.io.to(code).emit('uno_called', {
      playerId,
      playerName,
      message: `${playerName} called UNO!`,
      timestamp: new Date().toISOString()
    });
  }

  // Notify turn change
  notifyTurnChange(code, currentPlayer, gameState) {
    this.io.to(code).emit('turn_change', {
      currentPlayer: {
        id: currentPlayer.id,
        name: currentPlayer.name
      },
      game: gameState,
      message: `It's ${currentPlayer.name}'s turn`,
      timestamp: new Date().toISOString()
    });
  }

  // Notify game over
  notifyGameOver(code, winner, gameState) {
    this.io.to(code).emit('game_over', {
      winner: {
        id: winner.id,
        name: winner.name
      },
      game: gameState,
      message: `🎉 ${winner.name} wins the game!`,
      timestamp: new Date().toISOString()
    });
  }

  // Notify error to specific player
  notifyError(playerId, message, code = 'GENERAL_ERROR') {
    this.io.to(playerId).emit('error', {
      message,
      code,
      timestamp: new Date().toISOString()
    });
  }

  // Notify success to specific player
  notifySuccess(playerId, message, data = null) {
    this.io.to(playerId).emit('success', {
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  // Notify room full
  notifyRoomFull(playerId) {
    this.notifyError(playerId, 'Room is full', 'ROOM_FULL');
  }

  // Notify invalid move
  notifyInvalidMove(playerId, reason) {
    this.notifyError(playerId, `Invalid move: ${reason}`, 'INVALID_MOVE');
  }

  // Notify not your turn
  notifyNotYourTurn(playerId) {
    this.notifyError(playerId, 'It\'s not your turn', 'NOT_YOUR_TURN');
  }

  // Notify game not found
  notifyGameNotFound(playerId) {
    this.notifyError(playerId, 'Game not found', 'GAME_NOT_FOUND');
  }

  // Notify player not in game
  notifyPlayerNotInGame(playerId) {
    this.notifyError(playerId, 'You are not in any game', 'NOT_IN_GAME');
  }

  // Notify special card effect
  notifySpecialCardEffect(code, card, effect, gameState) {
    let message = '';
    switch (card.value) {
      case 'skip':
        message = 'Skip turn!';
        break;
      case 'reverse':
        message = 'Direction reversed!';
        break;
      case 'draw2':
        message = 'Draw 2 cards!';
        break;
      case 'wild_draw4':
        message = 'Wild Draw 4!';
        break;
      case 'wild':
        message = `Wild card! Color changed to ${card.chosenColor}`;
        break;
    }

    this.io.to(code).emit('special_card_effect', {
      card,
      effect,
      message,
      game: gameState,
      timestamp: new Date().toISOString()
    });
  }

  // Notify color change
  notifyColorChange(code, newColor, gameState) {
    this.io.to(code).emit('color_change', {
      newColor,
      game: gameState,
      message: `Color changed to ${newColor}`,
      timestamp: new Date().toISOString()
    });
  }

  // Notify direction change
  notifyDirectionChange(code, newDirection, gameState) {
    this.io.to(code).emit('direction_change', {
      newDirection,
      game: gameState,
      message: `Direction changed to ${newDirection === 1 ? 'clockwise' : 'counter-clockwise'}`,
      timestamp: new Date().toISOString()
    });
  }

  // Notify available games update
  notifyAvailableGamesUpdate() {
    this.io.emit('available_games_update', {
      timestamp: new Date().toISOString()
    });
  }

  // Notify player disconnected
  notifyPlayerDisconnected(code, playerId, gameState) {
    this.io.to(code).emit('player_disconnected', {
      playerId,
      game: gameState,
      message: 'A player has disconnected',
      timestamp: new Date().toISOString()
    });
  }

  // Notify player reconnected
  notifyPlayerReconnected(code, playerId, playerName) {
    this.io.to(code).emit('player_reconnected', {
      playerId,
      playerName,
      message: `${playerName} has reconnected`,
      timestamp: new Date().toISOString()
    });
  }

  // Send private message to player
  sendPrivateMessage(playerId, message, type = 'info') {
    this.io.to(playerId).emit('private_message', {
      message,
      type,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast message to room
  broadcastMessage(code, message, type = 'info') {
    this.io.to(code).emit('room_message', {
      message,
      type,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = NotificationService;
