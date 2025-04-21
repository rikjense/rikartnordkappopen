const express = require('express');
const router = express.Router();

/**
 * GET /api/games
 * Get all games (with pagination and filtering)
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0, state, boardId } = req.query;
    
    let query = 'SELECT * FROM matches';
    const params = [];
    
    // Add WHERE clause if filtering is requested
    if (state || boardId) {
      query += ' WHERE';
      
      if (state) {
        query += ' state = ?';
        params.push(state);
        
        if (boardId) {
          query += ' AND board_id = ?';
          params.push(boardId);
        }
      } else if (boardId) {
        query += ' board_id = ?';
        params.push(boardId);
      }
    }
    
    // Add order and pagination
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const matches = await req.db.all(query, params);
    
    // Get the total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM matches';
    const countParams = [];
    
    if (state || boardId) {
      countQuery += ' WHERE';
      
      if (state) {
        countQuery += ' state = ?';
        countParams.push(state);
        
        if (boardId) {
          countQuery += ' AND board_id = ?';
          countParams.push(boardId);
        }
      } else if (boardId) {
        countQuery += ' board_id = ?';
        countParams.push(boardId);
      }
    }
    
    const countResult = await req.db.get(countQuery, countParams);
    
    // Enhance matches with player information
    const enhancedMatches = await Promise.all(matches.map(async (match) => {
      // Get players for this match
      const players = await req.db.all(
        `SELECT mp.*, p.name, p.nickname, p.avatar 
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = ?
         ORDER BY mp.position`,
        [match.id]
      );
      
      // Parse JSON fields
      return {
        ...match,
        settings: match.settings ? JSON.parse(match.settings) : {},
        scores: match.scores ? JSON.parse(match.scores) : {},
        players,
        boardId: match.board_id
      };
    }));
    
    res.json({
      matches: enhancedMatches,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error('Error fetching games:', err);
    res.status(500).json({ message: 'Failed to fetch games', error: err.message });
  }
});

/**
 * GET /api/games/active
 * Get all active games
 */
router.get('/active', async (req, res) => {
  try {
    const matches = await req.db.all(
      `SELECT * FROM matches 
       WHERE state IN ('pending', 'warmup', 'active') 
       ORDER BY created_at DESC`
    );
    
    // Enhance matches with player information
    const enhancedMatches = await Promise.all(matches.map(async (match) => {
      // Get players for this match
      const players = await req.db.all(
        `SELECT mp.*, p.name, p.nickname, p.avatar 
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = ?
         ORDER BY mp.position`,
        [match.id]
      );
      
      // Get the board info
      const board = await req.db.get(
        'SELECT id, name, status FROM boards WHERE id = ?',
        [match.board_id]
      );
      
      // Parse JSON fields
      return {
        ...match,
        settings: match.settings ? JSON.parse(match.settings) : {},
        scores: match.scores ? JSON.parse(match.scores) : {},
        players,
        board,
        boardId: match.board_id
      };
    }));
    
    res.json(enhancedMatches);
  } catch (err) {
    console.error('Error fetching active games:', err);
    res.status(500).json({ message: 'Failed to fetch active games', error: err.message });
  }
});

/**
 * GET /api/games/:id
 * Get a specific game
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const match = await req.db.get('SELECT * FROM matches WHERE id = ?', [id]);
    
    if (!match) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Get players for this match
    const players = await req.db.all(
      `SELECT mp.*, p.name, p.nickname, p.avatar 
       FROM match_players mp
       JOIN players p ON mp.player_id = p.id
       WHERE mp.match_id = ?
       ORDER BY mp.position`,
      [id]
    );
    
    // Get the board info
    const board = await req.db.get(
      'SELECT id, name, status FROM boards WHERE id = ?',
      [match.board_id]
    );
    
    // Get throws for this match
    const throws = await req.db.all(
      'SELECT * FROM throws WHERE match_id = ? ORDER BY timestamp',
      [id]
    );
    
    // Parse JSON fields
    const enhancedMatch = {
      ...match,
      settings: match.settings ? JSON.parse(match.settings) : {},
      scores: match.scores ? JSON.parse(match.scores) : {},
      players,
      board,
      throws,
      boardId: match.board_id
    };
    
    res.json(enhancedMatch);
  } catch (err) {
    console.error(`Error fetching game ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch game', error: err.message });
  }
});

/**
 * POST /api/games
 * Create a new game
 */
router.post('/', async (req, res) => {
  try {
    const { boardId, players, mode, settings } = req.body;
    
    // Validate required fields
    if (!boardId) {
      return res.status(400).json({ message: 'Board ID is required' });
    }
    
    if (!players || players.length < 2) {
      return res.status(400).json({ message: 'At least two players are required' });
    }
    
    if (!mode) {
      return res.status(400).json({ message: 'Game mode is required' });
    }
    
    // Check if board exists
    const board = await req.db.get('SELECT * FROM boards WHERE id = ?', [boardId]);
    
    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }
    
    // Check if board is online
    if (board.status !== 'online') {
      return res.status(400).json({ message: 'Board is not online' });
    }
    
    // Check if board already has an active game
    const activeGame = await req.db.get(
      `SELECT id FROM matches 
       WHERE board_id = ? AND state IN ('pending', 'warmup', 'active')`,
      [boardId]
    );
    
    if (activeGame) {
      return res.status(400).json({ message: 'Board already has an active game' });
    }
    
    // Get the board manager
    const boardManager = global.boardManagers.get(parseInt(boardId));
    
    if (!boardManager) {
      return res.status(500).json({ message: 'Board manager not found' });
    }
    
    // Start the game on the board
    const game = await boardManager.startMatch({ players, mode, settings });
    
    res.status(201).json(game);
  } catch (err) {
    console.error('Error creating game:', err);
    res.status(500).json({ message: 'Failed to create game', error: err.message });
  }
});

/**
 * PUT /api/games/:id
 * Update a game (e.g., change state)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { state } = req.body;
    
    // Get the game
    const match = await req.db.get('SELECT * FROM matches WHERE id = ?', [id]);
    
    if (!match) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Update game state
    if (state) {
      await req.db.run(
        'UPDATE matches SET state = ? WHERE id = ?',
        [state, id]
      );
    }
    
    // Get the updated game
    const updatedMatch = await req.db.get('SELECT * FROM matches WHERE id = ?', [id]);
    
    // Get players for this match
    const players = await req.db.all(
      `SELECT mp.*, p.name, p.nickname, p.avatar 
       FROM match_players mp
       JOIN players p ON mp.player_id = p.id
       WHERE mp.match_id = ?
       ORDER BY mp.position`,
      [id]
    );
    
    // Parse JSON fields
    const enhancedMatch = {
      ...updatedMatch,
      settings: updatedMatch.settings ? JSON.parse(updatedMatch.settings) : {},
      scores: updatedMatch.scores ? JSON.parse(updatedMatch.scores) : {},
      players,
      boardId: updatedMatch.board_id
    };
    
    // Emit game updated event
    req.app.get('io').emit('game:updated', enhancedMatch);
    
    res.json(enhancedMatch);
  } catch (err) {
    console.error(`Error updating game ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to update game', error: err.message });
  }
});

/**
 * DELETE /api/games/:id
 * End a game
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the game
    const match = await req.db.get('SELECT * FROM matches WHERE id = ?', [id]);
    
    if (!match) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Check if game is active
    if (!['pending', 'warmup', 'active'].includes(match.state)) {
      return res.status(400).json({ message: 'Game is not active' });
    }
    
    // Get the board manager
    const boardManager = global.boardManagers.get(parseInt(match.board_id));
    
    if (!boardManager) {
      return res.status(500).json({ message: 'Board manager not found' });
    }
    
    // End the game on the board
    const result = await boardManager.endMatch();
    
    res.json({ message: 'Game ended successfully', matchId: result.matchId });
  } catch (err) {
    console.error(`Error ending game ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to end game', error: err.message });
  }
});

/**
 * POST /api/games/:id/throws/:throwId/correct
 * Correct a throw
 */
router.post('/:id/throws/:throwId/correct', async (req, res) => {
  try {
    const { id, throwId } = req.params;
    const { segment, score } = req.body;
    
    // Get the game
    const match = await req.db.get('SELECT * FROM matches WHERE id = ?', [id]);
    
    if (!match) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Check if game is active
    if (match.state !== 'active') {
      return res.status(400).json({ message: 'Game is not active' });
    }
    
    // Check if throw exists and belongs to this game
    const throwData = await req.db.get(
      'SELECT * FROM throws WHERE id = ? AND match_id = ?',
      [throwId, id]
    );
    
    if (!throwData) {
      return res.status(404).json({ message: 'Throw not found or does not belong to this game' });
    }
    
    // Get the board manager
    const boardManager = global.boardManagers.get(parseInt(match.board_id));
    
    if (!boardManager) {
      return res.status(500).json({ message: 'Board manager not found' });
    }
    
    // Correct the throw
    await boardManager.correctThrow({ throwId, segment, score });
    
    res.json({ message: 'Throw corrected successfully' });
  } catch (err) {
    console.error(`Error correcting throw:`, err);
    res.status(500).json({ message: 'Failed to correct throw', error: err.message });
  }
});

/**
 * POST /api/games/:id/switch-player
 * Manually switch the active player
 */
router.post('/:id/switch-player', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the game
    const match = await req.db.get('SELECT * FROM matches WHERE id = ?', [id]);
    
    if (!match) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Check if game is active
    if (match.state !== 'active') {
      return res.status(400).json({ message: 'Game is not active' });
    }
    
    // Get the board manager
    const boardManager = global.boardManagers.get(parseInt(match.board_id));
    
    if (!boardManager) {
      return res.status(500).json({ message: 'Board manager not found' });
    }
    
    // Switch player
    await boardManager.manualPlayerSwitch();
    
    res.json({ message: 'Player switched successfully' });
  } catch (err) {
    console.error(`Error switching player:`, err);
    res.status(500).json({ message: 'Failed to switch player', error: err.message });
  }
});

/**
 * GET /api/games/:id/throws
 * Get all throws for a game
 */
router.get('/:id/throws', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if game exists
    const match = await req.db.get('SELECT * FROM matches WHERE id = ?', [id]);
    
    if (!match) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Get throws
    const throws = await req.db.all(
      `SELECT t.*, p.name as player_name
       FROM throws t
       JOIN players p ON t.player_id = p.id
       WHERE t.match_id = ?
       ORDER BY t.timestamp`,
      [id]
    );
    
    res.json(throws);
  } catch (err) {
    console.error(`Error fetching throws for game ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch throws', error: err.message });
  }
});

module.exports = router; 