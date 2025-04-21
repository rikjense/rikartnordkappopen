/**
 * Socket.IO event handlers
 */

function setupSocketHandlers(io, db) {
  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);
    
    // Join board-specific room for targeted updates
    socket.on('join:board', (boardId) => {
      socket.join(`board:${boardId}`);
      console.log(`Client ${socket.id} joined board:${boardId}`);
    });
    
    // Leave board-specific room
    socket.on('leave:board', (boardId) => {
      socket.leave(`board:${boardId}`);
      console.log(`Client ${socket.id} left board:${boardId}`);
    });
    
    // Join game-specific room for targeted updates
    socket.on('join:game', (gameId) => {
      socket.join(`game:${gameId}`);
      console.log(`Client ${socket.id} joined game:${gameId}`);
    });
    
    // Leave game-specific room
    socket.on('leave:game', (gameId) => {
      socket.leave(`game:${gameId}`);
      console.log(`Client ${socket.id} left game:${gameId}`);
    });
    
    // Start a new game on a board
    socket.on('game:start', async (data, callback) => {
      try {
        const { boardId, players, mode, settings } = data;
        
        // Validate input
        if (!boardId) {
          return callback({ success: false, error: 'Board ID is required' });
        }
        
        if (!players || players.length < 2) {
          return callback({ success: false, error: 'At least two players are required' });
        }
        
        if (!mode) {
          return callback({ success: false, error: 'Game mode is required' });
        }
        
        // Get board manager
        const manager = global.boardManagers.get(parseInt(boardId));
        
        if (!manager) {
          return callback({ success: false, error: 'Board not found' });
        }
        
        // Check if board is connected
        if (!manager.isConnected) {
          return callback({ success: false, error: 'Board is not connected' });
        }
        
        // Check if board already has an active game
        if (manager.currentMatch) {
          return callback({ success: false, error: 'Board already has an active game' });
        }
        
        // Start game
        const game = await manager.startMatch({ players, mode, settings });
        
        callback({ success: true, game });
      } catch (error) {
        console.error('Error starting game:', error);
        callback({ success: false, error: error.message });
      }
    });
    
    // End current game on a board
    socket.on('game:end', async (data, callback) => {
      try {
        const { boardId } = data;
        
        // Validate input
        if (!boardId) {
          return callback({ success: false, error: 'Board ID is required' });
        }
        
        // Get board manager
        const manager = global.boardManagers.get(parseInt(boardId));
        
        if (!manager) {
          return callback({ success: false, error: 'Board not found' });
        }
        
        // Check if board has an active game
        if (!manager.currentMatch) {
          return callback({ success: false, error: 'No active game on this board' });
        }
        
        // End game
        const result = await manager.endMatch();
        
        callback({ success: true, matchId: result.matchId });
      } catch (error) {
        console.error('Error ending game:', error);
        callback({ success: false, error: error.message });
      }
    });
    
    // Correct a throw
    socket.on('game:correctThrow', async (data, callback) => {
      try {
        const { boardId, throwId, segment, score } = data;
        
        // Validate input
        if (!boardId || !throwId || !segment) {
          return callback({ success: false, error: 'Board ID, throw ID, and segment are required' });
        }
        
        // Get board manager
        const manager = global.boardManagers.get(parseInt(boardId));
        
        if (!manager) {
          return callback({ success: false, error: 'Board not found' });
        }
        
        // Correct throw
        await manager.correctThrow({ throwId, segment, score });
        
        callback({ success: true });
      } catch (error) {
        console.error('Error correcting throw:', error);
        callback({ success: false, error: error.message });
      }
    });
    
    // Manually switch active player
    socket.on('game:switchPlayer', async (data, callback) => {
      try {
        const { boardId } = data;
        
        // Validate input
        if (!boardId) {
          return callback({ success: false, error: 'Board ID is required' });
        }
        
        // Get board manager
        const manager = global.boardManagers.get(parseInt(boardId));
        
        if (!manager) {
          return callback({ success: false, error: 'Board not found' });
        }
        
        // Switch player
        await manager.manualPlayerSwitch();
        
        callback({ success: true });
      } catch (error) {
        console.error('Error switching player:', error);
        callback({ success: false, error: error.message });
      }
    });
    
    // Connect or reconnect to a board
    socket.on('board:connect', async (data, callback) => {
      try {
        const { boardId } = data;
        
        // Validate input
        if (!boardId) {
          return callback({ success: false, error: 'Board ID is required' });
        }
        
        // Get board manager
        const manager = global.boardManagers.get(parseInt(boardId));
        
        if (!manager) {
          return callback({ success: false, error: 'Board not found' });
        }
        
        // Connect to board
        await manager.connect();
        
        callback({ success: true });
      } catch (error) {
        console.error('Error connecting to board:', error);
        callback({ success: false, error: error.message });
      }
    });
    
    // Disconnect from a board
    socket.on('board:disconnect', async (data, callback) => {
      try {
        const { boardId } = data;
        
        // Validate input
        if (!boardId) {
          return callback({ success: false, error: 'Board ID is required' });
        }
        
        // Get board manager
        const manager = global.boardManagers.get(parseInt(boardId));
        
        if (!manager) {
          return callback({ success: false, error: 'Board not found' });
        }
        
        // Disconnect from board
        await manager.disconnect();
        
        callback({ success: true });
      } catch (error) {
        console.error('Error disconnecting from board:', error);
        callback({ success: false, error: error.message });
      }
    });
    
    // Handle client disconnect
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = setupSocketHandlers; 