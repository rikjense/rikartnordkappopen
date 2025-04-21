const express = require('express');
const router = express.Router();

/**
 * GET /api/boards
 * Get all boards
 */
router.get('/', async (req, res) => {
  try {
    const boards = await req.db.all('SELECT * FROM boards ORDER BY id');
    
    // Format response to match frontend expectations
    const formattedBoards = boards.map(board => ({
      id: board.id,
      name: board.name,
      ip_address: board.ip_address,
      serial_number: board.serial_number,
      status: board.status,
      last_seen: board.last_seen,
      created_at: board.created_at,
      updated_at: board.updated_at
    }));
    
    res.json(formattedBoards);
  } catch (err) {
    console.error('Error fetching boards:', err);
    res.status(500).json({ message: 'Failed to fetch boards', error: err.message });
  }
});

/**
 * GET /api/boards/:id
 * Get a specific board
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const board = await req.db.get('SELECT * FROM boards WHERE id = ?', [id]);
    
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }
    
    res.json(board);
  } catch (err) {
    console.error(`Error fetching board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch board', error: err.message });
  }
});

/**
 * POST /api/boards
 * Create a new board
 */
router.post('/', async (req, res) => {
  try {
    const { name, ip_address, serial_number, access_token } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Board name is required' });
    }
    
    // Check if serial_number is unique if provided
    if (serial_number) {
      const existingBoard = await req.db.get(
        'SELECT id FROM boards WHERE serial_number = ?', 
        [serial_number]
      );
      
      if (existingBoard) {
        return res.status(400).json({ 
          message: 'A board with this serial number already exists' 
        });
      }
    }
    
    // Insert new board
    const result = await req.db.run(
      `INSERT INTO boards (name, ip_address, serial_number, access_token, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [name, ip_address, serial_number, access_token, 'offline']
    );
    
    // Get the newly created board
    const newBoard = await req.db.get('SELECT * FROM boards WHERE id = ?', [result.lastID]);
    
    // Create a board manager for the new board
    global.boardManagers.set(
      newBoard.id, 
      new (require('../managers/ScoliaBoardManager'))(newBoard, req.app.get('io'), req.db)
    );
    
    // Emit board created event
    req.app.get('io').emit('board:created', newBoard);
    
    res.status(201).json(newBoard);
  } catch (err) {
    console.error('Error creating board:', err);
    res.status(500).json({ message: 'Failed to create board', error: err.message });
  }
});

/**
 * PUT /api/boards/:id
 * Update a board
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ip_address, serial_number, access_token } = req.body;
    
    // Get the current board
    const board = await req.db.get('SELECT * FROM boards WHERE id = ?', [id]);
    
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }
    
    // Check if serial_number is unique if it's being changed
    if (serial_number && serial_number !== board.serial_number) {
      const existingBoard = await req.db.get(
        'SELECT id FROM boards WHERE serial_number = ? AND id != ?', 
        [serial_number, id]
      );
      
      if (existingBoard) {
        return res.status(400).json({ 
          message: 'A board with this serial number already exists' 
        });
      }
    }
    
    // Update board
    await req.db.run(
      `UPDATE boards 
       SET name = ?, ip_address = ?, serial_number = ?, access_token = ?
       WHERE id = ?`,
      [
        name || board.name, 
        ip_address || board.ip_address, 
        serial_number || board.serial_number, 
        access_token !== undefined ? access_token : board.access_token,
        id
      ]
    );
    
    // Get the updated board
    const updatedBoard = await req.db.get('SELECT * FROM boards WHERE id = ?', [id]);
    
    // Update the board manager
    const boardManager = global.boardManagers.get(parseInt(id));
    if (boardManager) {
      // Update the board data
      boardManager.board = updatedBoard;
      
      // If credentials have changed, reconnect
      if (
        (serial_number && serial_number !== board.serial_number) ||
        (access_token && access_token !== board.access_token)
      ) {
        // Disconnect first if connected
        if (boardManager.isConnected) {
          await boardManager.disconnect();
        }
        
        // Try to connect with new credentials if both are provided
        if (updatedBoard.serial_number && updatedBoard.access_token) {
          boardManager.connect();
        }
      }
    }
    
    // Emit board updated event
    req.app.get('io').emit('board:updated', updatedBoard);
    
    res.json(updatedBoard);
  } catch (err) {
    console.error(`Error updating board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to update board', error: err.message });
  }
});

/**
 * DELETE /api/boards/:id
 * Delete a board
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the board to check if it exists
    const board = await req.db.get('SELECT * FROM boards WHERE id = ?', [id]);
    
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }
    
    // Check if the board has active games
    const activeGame = await req.db.get(
      `SELECT id FROM matches 
       WHERE board_id = ? AND state IN ('pending', 'warmup', 'active')`,
      [id]
    );
    
    if (activeGame) {
      return res.status(400).json({ 
        message: 'Cannot delete board with active games. End all games first.' 
      });
    }
    
    // Get the board manager
    const boardManager = global.boardManagers.get(parseInt(id));
    
    // Disconnect if connected
    if (boardManager) {
      await boardManager.disconnect();
      global.boardManagers.delete(parseInt(id));
    }
    
    // Delete the board
    await req.db.run('DELETE FROM boards WHERE id = ?', [id]);
    
    // Emit board deleted event
    req.app.get('io').emit('board:deleted', parseInt(id));
    
    res.json({ message: 'Board deleted successfully' });
  } catch (err) {
    console.error(`Error deleting board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to delete board', error: err.message });
  }
});

/**
 * POST /api/boards/:id/connect
 * Connect to a board
 */
router.post('/:id/connect', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the board
    const board = await req.db.get('SELECT * FROM boards WHERE id = ?', [id]);
    
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }
    
    // Check if the board has credentials
    if (!board.serial_number || !board.access_token) {
      return res.status(400).json({ 
        message: 'Board is missing serial number or access token' 
      });
    }
    
    // Get the board manager
    const boardManager = global.boardManagers.get(parseInt(id));
    
    if (!boardManager) {
      return res.status(500).json({ message: 'Board manager not found' });
    }
    
    // Connect to the board
    await boardManager.connect();
    
    res.json({ message: 'Connection initiated', status: board.status });
  } catch (err) {
    console.error(`Error connecting to board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to connect to board', error: err.message });
  }
});

/**
 * POST /api/boards/:id/disconnect
 * Disconnect from a board
 */
router.post('/:id/disconnect', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the board
    const board = await req.db.get('SELECT * FROM boards WHERE id = ?', [id]);
    
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }
    
    // Get the board manager
    const boardManager = global.boardManagers.get(parseInt(id));
    
    if (!boardManager) {
      return res.status(500).json({ message: 'Board manager not found' });
    }
    
    // Disconnect from the board
    await boardManager.disconnect();
    
    res.json({ message: 'Disconnected from board' });
  } catch (err) {
    console.error(`Error disconnecting from board ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to disconnect from board', error: err.message });
  }
});

module.exports = router; 