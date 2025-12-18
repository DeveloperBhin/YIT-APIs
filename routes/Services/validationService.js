// Validation Service for UNO Game

class ValidationService {
  // Validate player name
  static validatePlayerName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, message: 'Player name is required' };
    }

    if (name.trim().length < 2) {
      return { valid: false, message: 'Player name must be at least 2 characters' };
    }

    if (name.trim().length > 20) {
      return { valid: false, message: 'Player name must be less than 20 characters' };
    }

    if (!/^[a-zA-Z0-9\s_-]+$/.test(name.trim())) {
      return { valid: false, message: 'Player name can only contain letters, numbers, spaces, hyphens, and underscores' };
    }

    return { valid: true };
  }

  // Validate game ID format
  static validateGameId(gameId) {
    if (!gameId || typeof gameId !== 'string') {
      return { valid: false, message: 'Game ID is required' };
    }

    // UUID v4 format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(gameId)) {
      return { valid: false, message: 'Invalid game ID format' };
    }

    return { valid: true };
  }

  // Validate card index
  static validateCardIndex(cardIndex, playerCards) {
    if (typeof cardIndex !== 'number' || !Number.isInteger(cardIndex)) {
      return { valid: false, message: 'Card index must be a number' };
    }

    if (cardIndex < 0 || cardIndex >= playerCards.length) {
      return { valid: false, message: 'Invalid card index' };
    }

    return { valid: true };
  }

  // Validate chosen color for wild cards
  static validateChosenColor(color) {
    const validColors = ['red', 'blue', 'green', 'yellow'];
    
    if (!color || typeof color !== 'string') {
      return { valid: false, message: 'Color is required for wild cards' };
    }

    if (!validColors.includes(color.toLowerCase())) {
      return { valid: false, message: 'Invalid color. Must be red, blue, green, or yellow' };
    }

    return { valid: true };
  }

  // Validate game state
  static validateGameState(gameState) {
    if (!gameState || typeof gameState !== 'object') {
      return { valid: false, message: 'Invalid game state' };
    }

    const requiredFields = ['players', 'currentPlayerIndex', 'gameStatus'];
    for (const field of requiredFields) {
      if (!(field in gameState)) {
        return { valid: false, message: `Missing required field: ${field}` };
      }
    }

    return { valid: true };
  }

  // Validate socket connection
  static validateSocketConnection(socket) {
    if (!socket || !socket.id) {
      return { valid: false, message: 'Invalid socket connection' };
    }

    return { valid: true };
  }

  // Validate game action timing
  static validateGameActionTiming(game, playerId, action) {
    if (game.gameStatus !== 'playing') {
      return { valid: false, message: 'Game is not in playing state' };
    }

    const currentPlayer = game.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { valid: false, message: 'Not your turn' };
    }

    return { valid: true };
  }

  // Validate card play legality
  static validateCardPlay(card, currentColor, currentValue) {
    if (!card || typeof card !== 'object') {
      return { valid: false, message: 'Invalid card' };
    }

    // Wild cards can always be played
    if (card.type === 'wild') {
      return { valid: true };
    }

    // Check if card matches current color or value
    if (card.color === currentColor || card.value === currentValue) {
      return { valid: true };
    }

    return { valid: false, message: 'Card does not match current play' };
  }

  // Validate UNO call
  static validateUnoCall(player, game) {
    if (player.cards.length !== 1) {
      return { valid: false, message: 'You can only call UNO when you have exactly 1 card' };
    }

    if (player.hasUno) {
      return { valid: false, message: 'You have already called UNO' };
    }

    return { valid: true };
  }

  // Validate game creation parameters
  static validateGameCreation(hostId, hostName) {
    const nameValidation = this.validatePlayerName(hostName);
    if (!nameValidation.valid) {
      return nameValidation;
    }

    if (!hostId || typeof hostId !== 'string') {
      return { valid: false, message: 'Invalid host ID' };
    }

    return { valid: true };
  }

  // Validate join game parameters
  static validateJoinGame(gameId, playerId, playerName) {
    const gameIdValidation = this.validateGameId(gameId);
    if (!gameIdValidation.valid) {
      return gameIdValidation;
    }

    const nameValidation = this.validatePlayerName(playerName);
    if (!nameValidation.valid) {
      return nameValidation;
    }

    if (!playerId || typeof playerId !== 'string') {
      return { valid: false, message: 'Invalid player ID' };
    }

    return { valid: true };
  }

  // Sanitize input data
  static sanitizeInput(data) {
    if (typeof data === 'string') {
      return data.trim();
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return data;
  }

  // Validate room capacity
  static validateRoomCapacity(currentPlayers, maxPlayers = 10) {
    if (currentPlayers >= maxPlayers) {
      return { valid: false, message: 'Room is full' };
    }

    return { valid: true };
  }

  // Validate game start conditions
  static validateGameStart(game) {
    if (game.players.length < 2) {
      return { valid: false, message: 'Need at least 2 players to start' };
    }

    if (game.players.length > 10) {
      return { valid: false, message: 'Too many players (max 10)' };
    }

    if (game.gameStatus !== 'waiting') {
      return { valid: false, message: 'Game has already started or finished' };
    }

    return { valid: true };
  }
}

module.exports = ValidationService;
