const express = require('express');
const router = express.Router();

/**
 * GET /api/players
 * Get all players (with pagination and search)
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0, search } = req.query;
    
    let query = 'SELECT * FROM players';
    const params = [];
    
    // Add search if provided
    if (search) {
      query += ' WHERE name LIKE ? OR nickname LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    // Add order and pagination
    query += ' ORDER BY name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const players = await req.db.all(query, params);
    
    // Get the total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM players';
    const countParams = [];
    
    if (search) {
      countQuery += ' WHERE name LIKE ? OR nickname LIKE ?';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    const countResult = await req.db.get(countQuery, countParams);
    
    // Parse stats JSON
    const parsedPlayers = players.map(player => ({
      ...player,
      stats: player.stats ? JSON.parse(player.stats) : {}
    }));
    
    res.json({
      players: parsedPlayers,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error('Error fetching players:', err);
    res.status(500).json({ message: 'Failed to fetch players', error: err.message });
  }
});

/**
 * GET /api/players/:id
 * Get a specific player
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const player = await req.db.get('SELECT * FROM players WHERE id = ?', [id]);
    
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }
    
    // Get player match history
    const matches = await req.db.all(
      `SELECT m.id, m.mode, m.state, m.created_at, m.end_time, mp.is_winner,
              mp.starting_score, mp.current_score, b.name as board_name
       FROM match_players mp
       JOIN matches m ON mp.match_id = m.id
       JOIN boards b ON m.board_id = b.id
       WHERE mp.player_id = ?
       ORDER BY m.created_at DESC
       LIMIT 10`,
      [id]
    );
    
    // Get player statistics
    const stats = await calculatePlayerStats(req.db, id);
    
    // Parse stats JSON from database
    const parsedPlayer = {
      ...player,
      stats: player.stats ? JSON.parse(player.stats) : {},
      calculatedStats: stats,
      matches
    };
    
    res.json(parsedPlayer);
  } catch (err) {
    console.error(`Error fetching player ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to fetch player', error: err.message });
  }
});

/**
 * POST /api/players
 * Create a new player
 */
router.post('/', async (req, res) => {
  try {
    const { name, nickname, email, avatar } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Player name is required' });
    }
    
    // Insert new player
    const result = await req.db.run(
      'INSERT INTO players (name, nickname, email, avatar) VALUES (?, ?, ?, ?)',
      [name, nickname || null, email || null, avatar || null]
    );
    
    // Get the newly created player
    const newPlayer = await req.db.get('SELECT * FROM players WHERE id = ?', [result.lastID]);
    
    // Parse stats JSON
    const parsedPlayer = {
      ...newPlayer,
      stats: newPlayer.stats ? JSON.parse(newPlayer.stats) : {}
    };
    
    res.status(201).json(parsedPlayer);
  } catch (err) {
    console.error('Error creating player:', err);
    res.status(500).json({ message: 'Failed to create player', error: err.message });
  }
});

/**
 * PUT /api/players/:id
 * Update a player
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nickname, email, avatar } = req.body;
    
    // Get the current player
    const player = await req.db.get('SELECT * FROM players WHERE id = ?', [id]);
    
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }
    
    // Update player
    await req.db.run(
      'UPDATE players SET name = ?, nickname = ?, email = ?, avatar = ? WHERE id = ?',
      [
        name || player.name,
        nickname !== undefined ? nickname : player.nickname,
        email !== undefined ? email : player.email,
        avatar !== undefined ? avatar : player.avatar,
        id
      ]
    );
    
    // Get the updated player
    const updatedPlayer = await req.db.get('SELECT * FROM players WHERE id = ?', [id]);
    
    // Parse stats JSON
    const parsedPlayer = {
      ...updatedPlayer,
      stats: updatedPlayer.stats ? JSON.parse(updatedPlayer.stats) : {}
    };
    
    res.json(parsedPlayer);
  } catch (err) {
    console.error(`Error updating player ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to update player', error: err.message });
  }
});

/**
 * DELETE /api/players/:id
 * Delete a player
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the player to check if it exists
    const player = await req.db.get('SELECT * FROM players WHERE id = ?', [id]);
    
    if (!player) {
      return res.status(404).json({ message: 'Player not found' });
    }
    
    // Check if the player is in any active games
    const activeGame = await req.db.get(
      `SELECT m.id FROM match_players mp
       JOIN matches m ON mp.match_id = m.id
       WHERE mp.player_id = ? AND m.state IN ('pending', 'warmup', 'active')`,
      [id]
    );
    
    if (activeGame) {
      return res.status(400).json({ 
        message: 'Cannot delete player involved in active games. End all games first.' 
      });
    }
    
    // Delete the player
    await req.db.run('DELETE FROM players WHERE id = ?', [id]);
    
    res.json({ message: 'Player deleted successfully' });
  } catch (err) {
    console.error(`Error deleting player ${req.params.id}:`, err);
    res.status(500).json({ message: 'Failed to delete player', error: err.message });
  }
});

/**
 * Helper function to calculate player statistics
 */
async function calculatePlayerStats(db, playerId) {
  try {
    // Get total matches
    const totalMatches = await db.get(
      `SELECT COUNT(DISTINCT mp.match_id) as count 
       FROM match_players mp
       JOIN matches m ON mp.match_id = m.id
       WHERE mp.player_id = ?`,
      [playerId]
    );
    
    // Get wins
    const wins = await db.get(
      `SELECT COUNT(DISTINCT mp.match_id) as count 
       FROM match_players mp
       WHERE mp.player_id = ? AND mp.is_winner = 1`,
      [playerId]
    );
    
    // Get average score per match
    const avgScore = await db.get(
      `SELECT AVG(t.score) as avg_score 
       FROM throws t
       WHERE t.player_id = ?`,
      [playerId]
    );
    
    // Get highest score in a single throw
    const highestThrow = await db.get(
      `SELECT MAX(t.score) as highest_throw 
       FROM throws t
       WHERE t.player_id = ?`,
      [playerId]
    );
    
    // Get modes played
    const modes = await db.all(
      `SELECT m.mode, COUNT(DISTINCT mp.match_id) as count 
       FROM match_players mp
       JOIN matches m ON mp.match_id = m.id
       WHERE mp.player_id = ?
       GROUP BY m.mode`,
      [playerId]
    );
    
    return {
      totalMatches: totalMatches.count || 0,
      wins: wins.count || 0,
      winRate: totalMatches.count ? (wins.count / totalMatches.count) * 100 : 0,
      avgScore: avgScore.avg_score || 0,
      highestThrow: highestThrow.highest_throw || 0,
      modes: modes || []
    };
  } catch (err) {
    console.error('Error calculating player stats:', err);
    return {};
  }
}

module.exports = router; 