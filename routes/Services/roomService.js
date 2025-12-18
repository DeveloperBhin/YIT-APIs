// Room Service for UNO Game Room Management

class RoomService {
  constructor() {
    this.rooms = new Map(); // roomCode -> room data
    this.playerToRoom = new Map(); // playerId -> roomCode
    this.roomCodes = new Set(); // active room codes
  }

  // Create a new room
  createRoom(hostId, hostName, maxPlayers = 10) {
    const roomCode = this.generateUniqueRoomCode();
    const room = {
      roomCode,
      hostId,
      players: [],
      maxPlayers,
      gameState: null,
      createdAt: new Date(),
      lastActivity: new Date(),
      settings: {
        maxPlayers,
        allowSpectators: true,
        privateRoom: false,
        autoStart: false,
        timeLimit: null // in seconds, null for no limit
      }
    };

    this.rooms.set(roomCode, room);
    this.roomCodes.add(roomCode);
    this.playerToRoom.set(hostId, roomCode);

    return { success: true, roomCode, room };
  }

  // Join a room
  joinRoom(roomCode, playerId, playerName) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, message: 'Room is full' };
    }

    if (room.players.find(p => p.id === playerId)) {
      return { success: false, message: 'Player already in room' };
    }

    const player = {
      id: playerId,
      name: playerName,
      joinedAt: new Date(),
      isActive: true,
      isSpectator: false
    };

    room.players.push(player);
    room.lastActivity = new Date();
    this.playerToRoom.set(playerId, roomCode);

    return { success: true, room, player };
  }

  // Leave a room
  leaveRoom(playerId) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) {
      return { success: false, message: 'Player not in any room' };
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return { success: false, message: 'Player not in room' };
    }

    room.players.splice(playerIndex, 1);
    room.lastActivity = new Date();
    this.playerToRoom.delete(playerId);

    // If no players left, delete the room
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      this.roomCodes.delete(roomCode);
      return { success: true, roomDeleted: true };
    }

    // If host left, assign new host
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
    }

    return { success: true, room, roomDeleted: false };
  }

  // Get room by code
  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  // Get player's room
  getPlayerRoom(playerId) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return null;
    return this.rooms.get(roomCode);
  }

  // Update room settings
  updateRoomSettings(roomCode, playerId, settings) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.hostId !== playerId) {
      return { success: false, message: 'Only host can update settings' };
    }

    room.settings = { ...room.settings, ...settings };
    room.lastActivity = new Date();

    return { success: true, room };
  }

  // Kick player from room
  kickPlayer(roomCode, hostId, targetPlayerId) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.hostId !== hostId) {
      return { success: false, message: 'Only host can kick players' };
    }

    if (targetPlayerId === hostId) {
      return { success: false, message: 'Host cannot kick themselves' };
    }

    const playerIndex = room.players.findIndex(p => p.id === targetPlayerId);
    if (playerIndex === -1) {
      return { success: false, message: 'Player not in room' };
    }

    const kickedPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    room.lastActivity = new Date();
    this.playerToRoom.delete(targetPlayerId);

    return { success: true, room, kickedPlayer };
  }

  // Get all public rooms
  getPublicRooms() {
    const publicRooms = [];
    this.rooms.forEach(room => {
      if (!room.settings.privateRoom && room.players.length < room.maxPlayers) {
        publicRooms.push({
          roomCode: room.roomCode,
          playerCount: room.players.length,
          maxPlayers: room.maxPlayers,
          host: room.players.find(p => p.id === room.hostId)?.name || 'Unknown',
          createdAt: room.createdAt,
          lastActivity: room.lastActivity,
          settings: room.settings
        });
      }
    });
    return publicRooms.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  // Get room statistics
  getRoomStats(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    return {
      roomCode,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      host: room.players.find(p => p.id === room.hostId)?.name || 'Unknown',
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      uptime: Date.now() - room.createdAt.getTime(),
      settings: room.settings,
      gameState: room.gameState ? 'playing' : 'waiting'
    };
  }

  // Clean up inactive rooms
  cleanupInactiveRooms(maxInactiveTime = 30 * 60 * 1000) { // 30 minutes
    const now = Date.now();
    const roomsToDelete = [];

    this.rooms.forEach((room, roomCode) => {
      if (now - room.lastActivity.getTime() > maxInactiveTime) {
        roomsToDelete.push(roomCode);
      }
    });

    roomsToDelete.forEach(roomCode => {
      const room = this.rooms.get(roomCode);
      if (room) {
        // Remove all players from playerToRoom mapping
        room.players.forEach(player => {
          this.playerToRoom.delete(player.id);
        });
      }
      this.rooms.delete(roomCode);
      this.roomCodes.delete(roomCode);
    });

    return roomsToDelete.length;
  }

  // Generate unique room code
  generateUniqueRoomCode() {
    let roomCode;
    do {
      roomCode = this.generateRoomCode();
    } while (this.roomCodes.has(roomCode));
    return roomCode;
  }

  // Generate room code
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Validate room code
  isValidRoomCode(roomCode) {
    return /^[A-Z0-9]{6}$/.test(roomCode);
  }

  // Set game state for room
  setGameState(roomCode, gameState) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    room.gameState = gameState;
    room.lastActivity = new Date();
    return true;
  }

  // Get game state for room
  getGameState(roomCode) {
    const room = this.rooms.get(roomCode);
    return room ? room.gameState : null;
  }

  // Check if player is in room
  isPlayerInRoom(playerId, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    return room.players.some(p => p.id === playerId);
  }

  // Check if player is host
  isPlayerHost(playerId, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    return room.hostId === playerId;
  }

  // Get room players
  getRoomPlayers(roomCode) {
    const room = this.rooms.get(roomCode);
    return room ? room.players : [];
  }

  // Update player activity
  updatePlayerActivity(playerId) {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return false;

    const room = this.rooms.get(roomCode);
    if (!room) return false;

    room.lastActivity = new Date();
    return true;
  }

  // Get total room count
  getTotalRoomCount() {
    return this.rooms.size;
  }

  // Get total player count
  getTotalPlayerCount() {
    let totalPlayers = 0;
    this.rooms.forEach(room => {
      totalPlayers += room.players.length;
    });
    return totalPlayers;
  }

  // Get room by host ID
  getRoomByHost(hostId) {
    for (const [roomCode, room] of this.rooms) {
      if (room.hostId === hostId) {
        return { roomCode, room };
      }
    }
    return null;
  }

  // Transfer host to another player
  transferHost(roomCode, currentHostId, newHostId) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.hostId !== currentHostId) {
      return { success: false, message: 'Only current host can transfer host' };
    }

    const newHost = room.players.find(p => p.id === newHostId);
    if (!newHost) {
      return { success: false, message: 'New host not in room' };
    }

    room.hostId = newHostId;
    room.lastActivity = new Date();

    return { success: true, room, newHost };
  }
}

module.exports = RoomService;
