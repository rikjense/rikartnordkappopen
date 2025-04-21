const { getDb } = require('../models/database');
const scoringService = require('./scoringService');
const { logGameAction } = require('../utils/gameLogger');

// Map to track active socket connections
const activeConnections = new Map();

// Store recent events for reconnections
const recentEvents = [];
const MAX_STORED_EVENTS = 100;

/**
 * Add event to recent events storage
 * @param {string} type Event type
 * @param {object} data Event data
 */
const trackEvent = (type, data) => {
  const event = {
    type,
    data,
    timestamp: Date.now()
  };

  // Add to beginning of array
  recentEvents.unshift(event);

  // Trim array if needed
  if (recentEvents.length > MAX_STORED_EVENTS) {
    recentEvents.pop();
  }

  return event;
};

/**
 * Get events since a specific timestamp
 * @param {number} timestamp Timestamp to get events since
 * @returns {Array} Array of events
 */
const getEventsSince = (timestamp) => {
  return recentEvents.filter(event => event.timestamp > timestamp);
};

/**
 * Setup Socket.IO handlers
 * @param {SocketIO.Server} io The Socket.IO server instance
 */
const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`New socket connection: ${socket.id}`);
    
    // Store the socket connection
    activeConnections.set(socket.id, { socket, userId: null });
    
    // Handle authentication
    socket.on('authenticate', async (data) => {
      try {
        // In a real system, validate the user credentials
        // For simplicity, we'll just store the userId
        const userId = data.userId || 'admin';
        activeConnections.set(socket.id, { socket, userId });
        
        socket.emit('authenticated', { success: true, userId });
        console.log(`Socket ${socket.id} authenticated as ${userId}`);
      } catch (err) {
        console.error('Authentication error:', err);
        socket.emit('authenticated', { success: false, error: err.message });
      }
    });
    
    // Handle getting missed events
    socket.on('get_missed_events', async (data) => {
      try {
        const { since } = data;
        if (!since) throw new Error('Timestamp is required');
        
        const missedEvents = getEventsSince(since);
        socket.emit('missed_events', missedEvents);
      } catch (err) {
        console.error('Error getting missed events:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle getting game state manually
    socket.on('get_game_state', async (data) => {
      try {
        const { gameId } = data;
        if (!gameId) throw new Error('Game ID is required');
        
        // Get the current game state and send it to the client
        const gameState = await getGameState(gameId);
        socket.emit('game_state', gameState);
      } catch (err) {
        console.error('Error getting game state:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle joining a game room
    socket.on('join_game', async (data) => {
      try {
        const { gameId } = data;
        if (!gameId) throw new Error('Game ID is required');
        
        // Join the room for this game
        socket.join(`game:${gameId}`);
        console.log(`Socket ${socket.id} joined game room ${gameId}`);
        
        // Get the current game state and send it to the client
        const gameState = await getGameState(gameId);
        socket.emit('game_state', gameState);
      } catch (err) {
        console.error('Error joining game:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle processing a throw
    socket.on('process_throw', async (data) => {
      try {
        const { gameId, playerId, score, darts } = data;
        
        if (!gameId || !playerId || score === undefined || !darts) {
          throw new Error('Game ID, player ID, score, and darts are required');
        }
        
        // Process the throw
        const updatedGame = await scoringService.processThrow(gameId, playerId, score, darts);
        
        // Broadcast the updated game state
        const gameState = await getGameState(gameId);
        const eventData = { gameId, gameState };
        trackEvent('game_state', eventData);
        io.to(`game:${gameId}`).emit('game_state', gameState);
      } catch (err) {
        console.error('Error processing throw:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle starting a warmup
    socket.on('start_warmup', async (data) => {
      try {
        const { gameId } = data;
        if (!gameId) throw new Error('Game ID is required');
        
        // Start the warmup
        const updatedGame = await scoringService.startWarmup(gameId);
        
        // Broadcast the updated game state
        const gameState = await getGameState(gameId);
        const eventData = { gameId, gameState };
        trackEvent('game_state', eventData);
        io.to(`game:${gameId}`).emit('game_state', gameState);
      } catch (err) {
        console.error('Error starting warmup:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle completing a warmup
    socket.on('complete_warmup', async (data) => {
      try {
        const { gameId } = data;
        if (!gameId) throw new Error('Game ID is required');
        
        // Complete the warmup
        const updatedGame = await scoringService.completeWarmup(gameId);
        
        // Broadcast the updated game state
        const gameState = await getGameState(gameId);
        const eventData = { gameId, gameState };
        trackEvent('game_state', eventData);
        io.to(`game:${gameId}`).emit('game_state', gameState);
      } catch (err) {
        console.error('Error completing warmup:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle setting the bull winner
    socket.on('set_bull_winner', async (data) => {
      try {
        const { gameId, winnerId } = data;
        if (!gameId || !winnerId) throw new Error('Game ID and winner ID are required');
        
        // Set the bull winner
        const updatedGame = await scoringService.setBullWinner(gameId, winnerId);
        
        // Broadcast the updated game state
        const gameState = await getGameState(gameId);
        const eventData = { gameId, gameState };
        trackEvent('game_state', eventData);
        io.to(`game:${gameId}`).emit('game_state', gameState);
      } catch (err) {
        console.error('Error setting bull winner:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle manual override
    socket.on('override_throw', async (data) => {
      try {
        const { gameId, throwId, score, darts, adminId } = data;
        
        if (!gameId || !throwId || score === undefined || !darts || !adminId) {
          throw new Error('Game ID, throw ID, score, darts, and admin ID are required');
        }
        
        // Check if the current socket is authenticated as admin
        const connection = activeConnections.get(socket.id);
        if (connection.userId !== adminId && connection.userId !== 'admin') {
          throw new Error('Not authorized to perform override');
        }
        
        // Process the override
        const updatedGame = await scoringService.overrideThrow(gameId, throwId, score, darts, adminId);
        
        // Log the override action
        await logGameAction(getDb(), gameId, 'manual_override', 
          `Throw ${throwId} overridden by ${adminId}: score=${score}, darts=${JSON.stringify(darts)}`);
        
        // Broadcast the updated game state
        const gameState = await getGameState(gameId);
        const eventData = { gameId, gameState };
        trackEvent('game_state', eventData);
        io.to(`game:${gameId}`).emit('game_state', gameState);
      } catch (err) {
        console.error('Error overriding throw:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle getting player stats
    socket.on('get_player_stats', async (data) => {
      try {
        const { gameId, playerId } = data;
        
        if (!gameId || !playerId) {
          throw new Error('Game ID and player ID are required');
        }
        
        // Get the player stats
        const stats = await scoringService.getPlayerStats(gameId, playerId);
        
        // Send the stats to the requesting client
        socket.emit('player_stats', stats);
      } catch (err) {
        console.error('Error getting player stats:', err);
        socket.emit('error', { message: err.message });
      }
    });
    
    // Handle disconnections
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      activeConnections.delete(socket.id);
    });
  });
};

/**
 * Get the full game state
 * @param {number} gameId The game ID
 * @returns {object} The game state
 */
const getGameState = async (gameId) => {
  const db = getDb();
  
  try {
    // Get the game
    const game = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, row) => {
        if (err) return reject(err);
        if (!row) return reject(new Error('Game not found'));
        resolve(row);
      });
    });
    
    // Get the players
    const players = await new Promise((resolve, reject) => {
      db.all(
        `SELECT p.*, 
                (p.id = ?) as is_player1,
                (p.id = ?) as is_player2
         FROM players p
         WHERE p.id IN (?, ?)`,
        [game.player1_id, game.player2_id, game.player1_id, game.player2_id],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    // Get the legs
    const legs = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM legs WHERE game_id = ? ORDER BY leg_number',
        [gameId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    // Get the throws
    const throws = await new Promise((resolve, reject) => {
      let params = [];
      let query = 'SELECT * FROM throws WHERE ';
      
      if (legs.length > 0) {
        query += 'leg_id IN (';
        legs.forEach((leg, i) => {
          query += i > 0 ? ', ?' : '?';
          params.push(leg.id);
        });
        query += ') ORDER BY created_at';
      } else {
        query += '1 = 0'; // No legs yet, return empty
      }
      
      db.all(query, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    
    // Structure player data
    const player1 = players.find(p => p.id === game.player1_id);
    const player2 = players.find(p => p.id === game.player2_id);
    
    // Determine which player is active
    let activePlayerId = null;
    
    if (game.status === 'in_progress') {
      activePlayerId = game.current_player;
    }
    
    // Current leg
    const currentLeg = legs.find(l => l.leg_number === legs.length) || null;
    
    // Calculate stats
    const player1Stats = await scoringService.calculatePlayerStats(gameId, game.player1_id);
    const player2Stats = await scoringService.calculatePlayerStats(gameId, game.player2_id);
    
    // Return the full game state
    return {
      game,
      player1: {
        ...player1,
        score: game.current_leg_player1_score,
        dartsThrown: game.current_leg_player1_darts,
        isActive: activePlayerId === player1.id,
        stats: player1Stats
      },
      player2: {
        ...player2,
        score: game.current_leg_player2_score,
        dartsThrown: game.current_leg_player2_darts,
        isActive: activePlayerId === player2.id,
        stats: player2Stats
      },
      currentLeg,
      legs,
      throws,
      timestamp: Date.now()
    };
  } catch (err) {
    console.error(`Error getting game state for game ${gameId}:`, err);
    throw err;
  }
};

/**
 * Broadcast a game state update to all clients in a game room
 */
const broadcastGameUpdate = async (io, gameId) => {
  try {
    const gameState = await getGameState(gameId);
    const eventData = { gameId, gameState };
    trackEvent('game_state', eventData);
    io.to(`game:${gameId}`).emit('game_state', gameState);
  } catch (err) {
    console.error(`Error broadcasting game update for game ${gameId}:`, err);
  }
};

module.exports = {
  setupSocketHandlers,
  getGameState,
  broadcastGameUpdate,
  trackEvent
}; 