// gameLogic.js
class UNOGame {
  constructor(maxPlayers = 6) {
    this.players = []; // {id, name, cards: [], score, hasUno, isHost}
    this.drawPile = [];
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.direction = 1; // 1 = clockwise, -1 = counter-clockwise
    this.gameStatus = 'waiting'; // 'waiting' | 'playing' | 'finished'
    this.maxPlayers = maxPlayers;
  }

  // Add a player
  addPlayer(id, name) {
    if (this.players.find(p => p.id === id)) {
      return { success: false, message: 'Player already in game' };
    }
    const player = { id, name, cards: [], score: 0, hasUno: false, isHost: this.players.length === 0 };
    this.players.push(player);
    return { success: true, player };
  }

  // Remove a player
  removePlayer(id) {
    const index = this.players.findIndex(p => p.id === id);
    if (index === -1) return { success: false, message: 'Player not found' };
    this.players.splice(index, 1);
    return { success: true };
  }

  // Initialize deck
  initDeck() {
    const colors = ['red', 'green', 'blue', 'yellow'];
    const values = ['0','1','2','3','4','5','6','7','8','9','skip','reverse','draw2'];
    this.drawPile = [];

    colors.forEach(color => {
      values.forEach(value => {
        this.drawPile.push({ color, value });
        if (value !== '0') this.drawPile.push({ color, value });
      });
    });

    // Add wild cards
    for (let i = 0; i < 4; i++) {
      this.drawPile.push({ color: 'wild', value: 'wild' });
      this.drawPile.push({ color: 'wild', value: 'wildDraw4' });
    }

    // Shuffle
    this.drawPile.sort(() => Math.random() - 0.5);
  }

  // Start game
// Start game
startGame() {
  if (this.gameStatus !== 'waiting') 
    return { success: false, message: 'Game already started' };
  if (this.players.length < 2) 
    return { success: false, message: 'Need at least 2 players' };

  this.gameStatus = 'playing';
  this.initDeck();

  // Deal 7 cards to each player
  this.players.forEach(player => {
    player.cards = [];
    for (let i = 0; i < 7; i++) {
      player.cards.push(this.drawPile.pop());
    }
  });

  // Initialize discard pile with first card
  const firstCard = this.drawPile.pop();
  this.discardPile.push(firstCard);

  // Set current player
  this.currentPlayerIndex = 0;

  // 🔹 Log each player's initial hand
  console.log('🃏 Initial hands:');
  this.players.forEach(p => {
    console.log(`Player ${p.id}:`, p.cards.map(c => `${c.color} ${c.value}`));
  });
  console.log('🃏 Discard pile top card:', firstCard);

  return { 
    success: true,
    initialHands: this.players.map(p => ({ id: p.id, cards: p.cards })),
    discardPileTop: firstCard
  };
}

// Play a card
playCard(playerId, cardIndex, chosenColor = null) {
  const player = this.players.find(p => p.id === playerId);
  if (!player) return { success: false, message: 'Player not found' };

  if (this.players[this.currentPlayerIndex].id !== playerId)
    return { success: false, message: 'Not your turn' };

  if (cardIndex < 0 || cardIndex >= player.cards.length)
    return { success: false, message: 'Invalid card index' };

  const card = player.cards[cardIndex];
  const topCard = this.discardPile[this.discardPile.length - 1];

  // Determine effective color of top card
  let currentColor = topCard?.color;
  if (topCard?.color === 'wild' && topCard.chosenColor) {
    currentColor = topCard.chosenColor;
  }

  console.log('➡️ Playing card:', card);
  console.log('🃏 Top card:', topCard);
  console.log('🎨 Top card effective color:', currentColor);
  console.log('🎨 Chosen color:', chosenColor);

  // Validate card play
  if (card.color !== currentColor && card.value !== topCard.value && card.color !== 'wild') {
    console.warn('❌ Cannot play this card: color/value mismatch');
    return { success: false, message: 'Cannot play this card' };
  }

  // Remove card from hand
  player.cards.splice(cardIndex, 1);

  // Handle wild cards
  if (card.color === 'wild') {
    if (!chosenColor) return { success: false, message: 'Must choose a color for wild card' };
    card.color = chosenColor;
    card.chosenColor = chosenColor; // track chosen color
    console.log(`🎨 Wild card color set to: ${chosenColor}`);
  }

  // Add card to discard pile
  this.discardPile.push(card);

  // Check UNO
  player.hasUno = player.cards.length === 1;

  // Move to next player
  this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.length) % this.players.length;

  // Check win
  if (player.cards.length === 0) this.gameStatus = 'finished';

  console.log('🃏 New top card:', this.discardPile[this.discardPile.length - 1]);
  console.log('👥 Next player:', this.players[this.currentPlayerIndex]?.id);
  console.log('🔹 Player hand after move:', player.cards.map(c => `${c.color} ${c.value}`));

  return { success: true, game: this.getGameState() };
}
 // Draw cards
  drawCards(playerId, count) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, message: 'Player not found' };

    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) {
        const top = this.discardPile.pop();
        this.drawPile = this.discardPile.sort(() => Math.random() - 0.5);
        this.discardPile = [top];
      }
      const card = this.drawPile.pop();
      if (card) player.cards.push(card);
    }

    return { success: true, playerCards: player.cards };
  }

  // Get player cards
  getPlayerCards(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return player ? player.cards : [];
  }

  // Get game state
 // UNOGame.js

// gameLogic.js (inside UNOGame)
getGameState(forPlayerId = null) {
  return {
    players: this.players.map(p => {
      const isCurrent = p.id === forPlayerId;
      return {
        id: p.id,
        name: p.name,
        cards: isCurrent ? p.cards : undefined, // Only show full hand for requesting player
        cardsCount: p.cards.length,
        hasUno: p.hasUno,
        isHost: p.isHost,
        score: p.score
      };
    }),
    drawPileCount: this.drawPile.length,
    discardPileTop: this.discardPile[this.discardPile.length - 1] || null,
    currentPlayerId: this.players[this.currentPlayerIndex]?.id || null,
    direction: this.direction,
    gameStatus: this.gameStatus
  };
}


  // Restore cards for a player (used when loading game from DB)
  setPlayerCards(playerId, cards) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      console.warn(`⚠️ setPlayerCards: Player ${playerId} not found`);
      return { success: false, message: 'Player not found' };
    }
    if (!Array.isArray(cards)) {
      console.warn(`⚠️ Invalid cards for player ${playerId}:`, cards);
      player.cards = [];
      return { success: false, message: 'Invalid card format' };
    }
    player.cards = cards;
    console.log(`✅ Restored hand for ${playerId}:`, player.cards);
    return { success: true };
  }
}

module.exports = UNOGame;
