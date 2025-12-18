// Utility Service for UNO Game

class UtilityService {
  // Generate unique player ID
  static generatePlayerId() {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Generate unique game ID
  static generateGameId() {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Shuffle array using Fisher-Yates algorithm
  static shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Deep clone object
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const cloned = {};
      Object.keys(obj).forEach(key => {
        cloned[key] = this.deepClone(obj[key]);
      });
      return cloned;
    }
  }

  // Format card for display
  static formatCard(card) {
    if (!card) return 'Unknown Card';
    
    if (card.type === 'wild') {
      return `Wild ${card.value === 'wild_draw4' ? 'Draw 4' : ''}`;
    }
    
    const color = card.color.charAt(0).toUpperCase() + card.color.slice(1);
    const value = card.value.charAt(0).toUpperCase() + card.value.slice(1);
    
    return `${color} ${value}`;
  }

  // Get card color emoji
  static getCardColorEmoji(color) {
    const colorEmojis = {
      red: '🔴',
      blue: '🔵',
      green: '🟢',
      yellow: '🟡',
      wild: '⚫'
    };
    return colorEmojis[color] || '⚫';
  }

  // Get card value emoji
  static getCardValueEmoji(value) {
    const valueEmojis = {
      '0': '0️⃣',
      '1': '1️⃣',
      '2': '2️⃣',
      '3': '3️⃣',
      '4': '4️⃣',
      '5': '5️⃣',
      '6': '6️⃣',
      '7': '7️⃣',
      '8': '8️⃣',
      '9': '9️⃣',
      'skip': '⏭️',
      'reverse': '🔄',
      'draw2': '➕2',
      'wild': '🎨',
      'wild_draw4': '🎨➕4'
    };
    return valueEmojis[value] || '❓';
  }

  // Format card with emojis
  static formatCardWithEmojis(card) {
    if (!card) return '❓ Unknown Card';
    
    const colorEmoji = this.getCardColorEmoji(card.color);
    const valueEmoji = this.getCardValueEmoji(card.value);
    
    if (card.type === 'wild') {
      return `${colorEmoji} ${valueEmoji}`;
    }
    
    return `${colorEmoji} ${valueEmoji}`;
  }

  // Calculate game statistics
  static calculateGameStats(game) {
    const stats = {
      totalPlayers: game.players.length,
      activePlayers: game.players.filter(p => p.isActive).length,
      totalCardsInPlay: game.players.reduce((sum, p) => sum + p.cards.length, 0),
      cardsInDeck: game.deck.length,
      cardsInDiscard: game.discardPile.length,
      gameDuration: game.startTime ? Date.now() - game.startTime : 0,
      currentTurn: game.currentPlayerIndex + 1,
      direction: game.direction === 1 ? 'clockwise' : 'counter-clockwise'
    };
    
    return stats;
  }

  // Get player statistics
  static getPlayerStats(player, game) {
    const stats = {
      name: player.name,
      cardCount: player.cards.length,
      hasUno: player.hasUno,
      isActive: player.isActive,
      isCurrentPlayer: game.getCurrentPlayer()?.id === player.id,
      position: game.players.findIndex(p => p.id === player.id) + 1
    };
    
    return stats;
  }

  // Format time duration
  static formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Generate game summary
  static generateGameSummary(game) {
    const summary = {
      gameId: game.gameId || 'unknown',
      status: game.gameStatus,
      players: game.players.map(p => ({
        name: p.name,
        cardCount: p.cards.length,
        hasUno: p.hasUno,
        isActive: p.isActive
      })),
      currentPlayer: game.getCurrentPlayer()?.name || 'Unknown',
      topCard: game.discardPile[game.discardPile.length - 1],
      currentColor: game.currentColor,
      direction: game.direction === 1 ? 'clockwise' : 'counter-clockwise',
      winner: game.winner?.name || null,
      stats: this.calculateGameStats(game)
    };
    
    return summary;
  }

  // Check if game is in valid state
  static isGameValid(game) {
    if (!game) return false;
    if (!game.players || game.players.length === 0) return false;
    if (game.currentPlayerIndex < 0 || game.currentPlayerIndex >= game.players.length) return false;
    if (!game.deck || !Array.isArray(game.deck)) return false;
    if (!game.discardPile || !Array.isArray(game.discardPile)) return false;
    
    return true;
  }

  // Get next player index
  static getNextPlayerIndex(currentIndex, direction, playerCount) {
    return (currentIndex + direction + playerCount) % playerCount;
  }

  // Check if card is playable
  static isCardPlayable(card, currentColor, currentValue) {
    if (!card) return false;
    
    // Wild cards can always be played
    if (card.type === 'wild') return true;
    
    // Check color or value match
    return card.color === currentColor || card.value === currentValue;
  }

  // Get playable cards from hand
  static getPlayableCards(hand, currentColor, currentValue) {
    return hand.filter(card => this.isCardPlayable(card, currentColor, currentValue));
  }

  // Sort cards by color and value
  static sortCards(cards) {
    const colorOrder = ['red', 'blue', 'green', 'yellow', 'wild'];
    const valueOrder = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild_draw4'];
    
    return cards.sort((a, b) => {
      const colorA = colorOrder.indexOf(a.color);
      const colorB = colorOrder.indexOf(b.color);
      
      if (colorA !== colorB) {
        return colorA - colorB;
      }
      
      const valueA = valueOrder.indexOf(a.value);
      const valueB = valueOrder.indexOf(b.value);
      
      return valueA - valueB;
    });
  }

  // Generate random color
  static getRandomColor() {
    const colors = ['red', 'blue', 'green', 'yellow'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // Create game log entry
  static createGameLogEntry(type, data) {
    return {
      type,
      data,
      timestamp: new Date().toISOString(),
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // Format error message
  static formatErrorMessage(error, context = '') {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` [${context}]` : '';
    return `[${timestamp}]${contextStr} ${error.message || error}`;
  }

  // Validate and sanitize game data
  static sanitizeGameData(data) {
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        sanitized[key] = value.trim();
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeGameData(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  // Get game difficulty level based on player count
  static getGameDifficulty(playerCount) {
    if (playerCount <= 2) return 'easy';
    if (playerCount <= 4) return 'medium';
    if (playerCount <= 6) return 'hard';
    return 'expert';
  }

  // Calculate estimated game duration
  static estimateGameDuration(playerCount) {
    // Rough estimation: 2-3 minutes per player
    const baseTime = playerCount * 2.5 * 60 * 1000; // in milliseconds
    const variance = 0.3; // 30% variance
    const randomFactor = 1 + (Math.random() - 0.5) * variance;
    
    return Math.floor(baseTime * randomFactor);
  }

  // Generate game room code
  static generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Check if room code is valid
  static isValidRoomCode(code) {
    return /^[A-Z0-9]{6}$/.test(code);
  }
}

module.exports = UtilityService;
