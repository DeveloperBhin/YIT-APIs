// 🎮 Game Socket.io Event Handlers for UNO Game
const { ValidationService, NotificationService, RoomService } = require('../Services');
const GameManager = require('../Services/functions/gameManager');

class GameSocketHandlers {
  constructor(io) {
    this.io = io;
    this.gameManager = new GameManager();
    this.roomService = new RoomService();
    this.notificationService = new NotificationService(io);

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Player connected: ${socket.id}`);

      // ➤ Create a new game room
      socket.on('create_game_room', (data) => this.handleCreateGameRoom(socket, data));

      // ➤ Join an existing game room
      socket.on('join_game_room', (data) => this.handleJoinGameRoom(socket, data));

      // ➤ Leave game room
      socket.on('leave_game_room', () => this.handleLeaveGameRoom(socket));

      // ➤ Start game (host only)
      socket.on('start_game', () => this.handleStartGame(socket));

      // ➤ Play a card
      socket.on('play_card', (data) => this.handlePlayCard(socket, data));

      // ➤ Draw a card
      socket.on('draw_card', () => this.handleDrawCard(socket));

      // ➤ Call UNO
      socket.on('call_uno', () => this.handleCallUno(socket));

      // ➤ Get current game state
      socket.on('get_game_state', () => this.handleGetGameState(socket));

      // ➤ Get available game rooms
      socket.on('get_available_rooms', () => this.handleGetAvailableRooms(socket));

      // ➤ Update room settings
      socket.on('update_room_settings', (data) => this.handleUpdateRoomSettings(socket, data));

      // ➤ Handle disconnection
      socket.on('disconnect', () => this.handleDisconnect(socket));
    });
  }

  // ===========================
  // 🟢 Event Handlers
  // ===========================

  async handleCreateGameRoom(socket, { playerName, maxPlayers = 6 }) {
    try {
      const validation = ValidationService.validatePlayerName(playerName);
      if (!validation.valid) {
        return this.notificationService.notifyError(socket.id, validation.message);
      }

      const roomResult = this.roomService.createRoom(socket.id, playerName, maxPlayers);
      if (!roomResult.success) {
        return this.notificationService.notifyError(socket.id, roomResult.message);
      }

      const gameResult = this.gameManager.createGame(socket.id, playerName);
      if (!gameResult.success) {
        return this.notificationService.notifyError(socket.id, gameResult.message);
      }

      // Link gameId to roomCode
      this.roomService.linkGameToRoom(roomResult.roomCode, gameResult.gameId);

      // Join socket to room and update state
      socket.join(roomResult.roomCode);
      this.roomService.setGameState(roomResult.roomCode, gameResult.game);

      socket.emit('game_room_created', {
        roomCode: roomResult.roomCode,
        game: gameResult.game,
        player: gameResult.player,
        room: roomResult.room
      });

      console.log(`Game room created: ${roomResult.roomCode} by ${playerName}`);
    } catch (err) {
      console.error('Error creating game room:', err);
      this.notificationService.notifyError(socket.id, 'Failed to create game room');
    }
  }

  async handleJoinGameRoom(socket, { roomCode, playerName }) {
    try {
      const validation = ValidationService.validateJoinGame(roomCode, socket.id, playerName);
      if (!validation.valid) {
        return this.notificationService.notifyError(socket.id, validation.message);
      }

      const roomResult = this.roomService.joinRoom(roomCode, socket.id, playerName);
      if (!roomResult.success) {
        return this.notificationService.notifyError(socket.id, roomResult.message);
      }

      const gameId = this.roomService.getGameId(roomCode);
      const gameResult = this.gameManager.joinGame(gameId, socket.id, playerName);
      if (!gameResult.success) {
        return this.notificationService.notifyError(socket.id, gameResult.message);
      }

      socket.join(roomCode);
      this.roomService.setGameState(roomCode, gameResult.game);

      socket.emit('game_room_joined', {
        roomCode,
        game: gameResult.game,
        player: gameResult.player,
        room: roomResult.room
      });

      this.notificationService.notifyPlayerJoined(roomCode, gameResult.player, gameResult.game);
      console.log(`${playerName} joined game room: ${roomCode}`);
    } catch (err) {
      console.error('Error joining game room:', err);
      this.notificationService.notifyError(socket.id, 'Failed to join game room');
    }
  }

  async handleLeaveGameRoom(socket) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return;

      const roomResult = this.roomService.leaveRoom(socket.id);
      const gameResult = this.gameManager.leaveGame(socket.id);

      if (roomResult.success && gameResult.success) {
        socket.leave(roomCode);
        this.notificationService.notifyPlayerLeft(roomCode, socket.id, gameResult.game);
      }

      socket.emit('game_room_left', { success: true });
      console.log(`Player ${socket.id} left game room`);
    } catch (err) {
      console.error('Error leaving game room:', err);
      this.notificationService.notifyError(socket.id, 'Failed to leave game room');
    }
  }

  async handleStartGame(socket) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return this.notificationService.notifyError(socket.id, 'Not in any room');

      const room = this.roomService.getRoom(roomCode);
      if (!room || room.hostId !== socket.id) {
        return this.notificationService.notifyError(socket.id, 'Only the host can start the game');
      }

      const result = this.gameManager.startGame(socket.id);
      if (!result.success) return this.notificationService.notifyError(socket.id, result.message);

      this.roomService.setGameState(roomCode, result.game);
      this.notificationService.notifyGameStarted(roomCode, result.game);

      console.log(`Game started in room: ${roomCode}`);
    } catch (err) {
      console.error('Error starting game:', err);
      this.notificationService.notifyError(socket.id, 'Failed to start game');
    }
  }

  async handlePlayCard(socket, { cardIndex, chosenColor }) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return this.notificationService.notifyError(socket.id, 'Not in any room');

      const gameState = this.gameManager.getGameState(socket.id);
      if (!gameState.success) return this.notificationService.notifyError(socket.id, gameState.message);

      const validation = ValidationService.validateCardIndex(cardIndex, gameState.playerCards);
      if (!validation.valid) return this.notificationService.notifyError(socket.id, validation.message);

      if (chosenColor) {
        const colorValidation = ValidationService.validateChosenColor(chosenColor);
        if (!colorValidation.valid) return this.notificationService.notifyError(socket.id, colorValidation.message);
      }

      const result = this.gameManager.playCard(socket.id, cardIndex, chosenColor);
      if (!result.success) return this.notificationService.notifyError(socket.id, result.message);

      const updatedGameState = this.gameManager.getGameState(socket.id);
      this.roomService.setGameState(roomCode, updatedGameState.game);

      this.notificationService.notifyCardPlayed(
        roomCode,
        socket.id,
        gameState.playerCards[cardIndex],
        updatedGameState.game,
        result.gameOver,
        result.winner
      );

      socket.emit('player_cards', { cards: updatedGameState.playerCards });
      console.log(`Card played by ${socket.id} in room ${roomCode}`);
    } catch (err) {
      console.error('Error playing card:', err);
      this.notificationService.notifyError(socket.id, 'Failed to play card');
    }
  }

  async handleDrawCard(socket) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return this.notificationService.notifyError(socket.id, 'Not in any room');

      const result = this.gameManager.drawCard(socket.id);
      if (!result.success) return this.notificationService.notifyError(socket.id, result.message);

      const updatedGameState = this.gameManager.getGameState(socket.id);
      this.roomService.setGameState(roomCode, updatedGameState.game);

      this.notificationService.notifyCardDrawn(roomCode, socket.id, updatedGameState.game);
      socket.emit('player_cards', { cards: updatedGameState.playerCards });

      console.log(`Card drawn by ${socket.id} in room ${roomCode}`);
    } catch (err) {
      console.error('Error drawing card:', err);
      this.notificationService.notifyError(socket.id, 'Failed to draw card');
    }
  }

  async handleCallUno(socket) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return this.notificationService.notifyError(socket.id, 'Not in any room');

      const gameState = this.gameManager.getGameState(socket.id);
      if (!gameState.success) return this.notificationService.notifyError(socket.id, gameState.message);

      const player = gameState.game.players.find(p => p.id === socket.id);
      if (!player) return this.notificationService.notifyError(socket.id, 'Player not found in game');

      const validation = ValidationService.validateUnoCall(player, gameState.game);
      if (!validation.valid) return this.notificationService.notifyError(socket.id, validation.message);

      player.hasUno = true;
      this.notificationService.notifyUnoCalled(roomCode, socket.id, player.name);

      console.log(`${player.name} called UNO in room ${roomCode}`);
    } catch (err) {
      console.error('Error calling UNO:', err);
      this.notificationService.notifyError(socket.id, 'Failed to call UNO');
    }
  }

  async handleGetGameState(socket) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return this.notificationService.notifyError(socket.id, 'Not in any room');

      const result = this.gameManager.getGameState(socket.id);
      if (!result.success) return this.notificationService.notifyError(socket.id, result.message);

      socket.emit('game_state', {
        game: result.game,
        playerCards: result.playerCards,
        room: this.roomService.getRoom(roomCode)
      });
    } catch (err) {
      console.error('Error getting game state:', err);
      this.notificationService.notifyError(socket.id, 'Failed to get game state');
    }
  }

  async handleGetAvailableRooms(socket) {
    try {
      const rooms = this.roomService.getPublicRooms();
      socket.emit('available_rooms', { rooms });
    } catch (err) {
      console.error('Error getting available rooms:', err);
      this.notificationService.notifyError(socket.id, 'Failed to get available rooms');
    }
  }

  async handleUpdateRoomSettings(socket, { settings }) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return this.notificationService.notifyError(socket.id, 'Not in any room');

      const result = this.roomService.updateRoomSettings(roomCode, socket.id, settings);
      if (!result.success) return this.notificationService.notifyError(socket.id, result.message);

      this.io.to(roomCode).emit('room_settings_updated', {
        settings: result.room.settings,
        updatedBy: socket.id
      });

      console.log(`Room settings updated in ${roomCode} by ${socket.id}`);
    } catch (err) {
      console.error('Error updating room settings:', err);
      this.notificationService.notifyError(socket.id, 'Failed to update room settings');
    }
  }

  async handleDisconnect(socket) {
    try {
      const roomCode = this.roomService.playerToRoom.get(socket.id);
      if (!roomCode) return;

      const roomResult = this.roomService.leaveRoom(socket.id);
      const gameResult = this.gameManager.leaveGame(socket.id);

      if (roomResult.success && gameResult.success) {
        this.notificationService.notifyPlayerDisconnected(roomCode, socket.id, gameResult.game);
      }

      console.log(`Player disconnected: ${socket.id}`);
    } catch (err) {
      console.error('Error handling disconnect:', err);
    }
  }

  // ===========================
  // 🟢 Getters
  // ===========================
  getGameManager() {
    return this.gameManager;
  }

  getRoomService() {
    return this.roomService;
  }
}

module.exports = GameSocketHandlers;
