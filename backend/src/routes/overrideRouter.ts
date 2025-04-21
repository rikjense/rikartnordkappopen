import express from 'express';
import { getDb } from '../models/database';
import { MatchManager } from '../modules/matchManager';
import { logGameAction } from '../utils/gameLogger';

const router = express.Router();
const matchManager = new MatchManager();

/**
 * Edit player score
 * PUT /api/override/match/:matchId/score
 */
router.put('/match/:matchId/score', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const { playerId, newScore, adminId } = req.body;
    
    if (!playerId || newScore === undefined) {
      return res.status(400).json({ 
        error: 'Player ID and new score are required' 
      });
    }
    
    // Load the match
    await matchManager.loadMatch(matchId);
    const match = matchManager.getMatch();
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Find the player
    const playerIndex = match.players.findIndex(p => p.id === parseInt(playerId));
    if (playerIndex === -1) {
      return res.status(404).json({ error: 'Player not found in match' });
    }

    // Get the current score
    const currentScore = match.players[playerIndex].score;
    
    // Update the player's score
    match.players[playerIndex].score = parseInt(newScore);
    
    // Save the match state
    await matchManager.saveMatchState();
    
    // Log the action
    await logGameAction(
      getDb(),
      matchId,
      'score_override',
      `Score override for player ${playerId}: ${currentScore} -> ${newScore} by admin ${adminId || 'unknown'}`,
      adminId
    );
    
    res.json({
      success: true,
      message: 'Score updated successfully',
      match: matchManager.getMatch()
    });
  } catch (err) {
    console.error('Error overriding score:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Error overriding score' 
    });
  }
});

/**
 * Remove a throw
 * DELETE /api/override/match/:matchId/throw/:throwId
 */
router.delete('/match/:matchId/throw/:throwId', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const throwId = parseInt(req.params.throwId);
    const { adminId } = req.body;
    
    const db = getDb();
    
    // First, get the throw details for logging
    const throwData = await db.get('SELECT * FROM throws WHERE id = ?', [throwId]);
    
    if (!throwData) {
      return res.status(404).json({ error: 'Throw not found' });
    }
    
    // Load the match
    await matchManager.loadMatch(matchId);
    const match = matchManager.getMatch();
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Delete the throw
    await db.run('DELETE FROM throws WHERE id = ?', [throwId]);
    
    // Recalculate match state by loading it again
    await matchManager.loadMatch(matchId);
    
    // Log the action
    await logGameAction(
      db,
      matchId,
      'throw_removed',
      `Throw ${throwId} removed by admin ${adminId || 'unknown'}: player ${throwData.player_id}, score ${throwData.score}`,
      adminId
    );
    
    res.json({
      success: true,
      message: 'Throw removed successfully',
      match: matchManager.getMatch()
    });
  } catch (err) {
    console.error('Error removing throw:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Error removing throw' 
    });
  }
});

/**
 * Force leg result
 * PUT /api/override/match/:matchId/leg
 */
router.put('/match/:matchId/leg', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const { winnerId, adminId } = req.body;
    
    if (!winnerId) {
      return res.status(400).json({ error: 'Winner ID is required' });
    }
    
    // Load the match
    await matchManager.loadMatch(matchId);
    const match = matchManager.getMatch();
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Find the player
    const playerIndex = match.players.findIndex(p => p.id === parseInt(winnerId));
    if (playerIndex === -1) {
      return res.status(404).json({ error: 'Player not found in match' });
    }
    
    // Update player stats
    const playerStats = match.stats.players.get(parseInt(winnerId));
    if (playerStats) {
      playerStats.legsWon += 1;
    }
    
    // Check if the match is won
    const legsWon = playerStats?.legsWon || 0;
    if (legsWon >= match.legsToWin) {
      // Match is won
      match.players[playerIndex].isWinner = true;
      match.state = 'completed';
      match.stats.endTime = new Date();
    } else {
      // Setup next leg
      match.currentLeg++;
      match.stats.currentLeg = match.currentLeg;
      match.stats.legsPlayed++;
      
      // Determine the next leg starter (alternating)
      const lastStarterIndex = match.players.findIndex(
        p => p.id === match.legStarters[match.currentLeg - 2]
      );
      const nextStarterIndex = (lastStarterIndex + 1) % match.players.length;
      const nextStarterId = match.players[nextStarterIndex].id;
      match.legStarters[match.currentLeg - 1] = nextStarterId;

      // Reset player scores
      match.players.forEach(player => {
        player.score = match.settings.startingScore;
        player.originalScore = match.settings.startingScore;
        player.isActive = player.id === nextStarterId;
        player.isWinner = false;
        player.currentTurn = [];
        player.dartsThrown = 0;
      });

      // Set active player
      match.activePlayerIndex = nextStarterIndex;
      
      // Reset round counter
      match.round = 1;
    }
    
    // Save the match state
    await matchManager.saveMatchState();
    
    // Log the action
    await logGameAction(
      getDb(),
      matchId,
      'leg_override',
      `Leg ${match.currentLeg - 1} force-completed with winner ${winnerId} by admin ${adminId || 'unknown'}`,
      adminId
    );
    
    res.json({
      success: true,
      message: 'Leg result forced successfully',
      match: matchManager.getMatch()
    });
  } catch (err) {
    console.error('Error forcing leg result:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Error forcing leg result' 
    });
  }
});

/**
 * Switch active player
 * PUT /api/override/match/:matchId/player
 */
router.put('/match/:matchId/player', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const { playerId, adminId } = req.body;
    
    if (!playerId) {
      return res.status(400).json({ error: 'Player ID is required' });
    }
    
    // Load the match
    await matchManager.loadMatch(matchId);
    const match = matchManager.getMatch();
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // Find the player
    const playerIndex = match.players.findIndex(p => p.id === parseInt(playerId));
    if (playerIndex === -1) {
      return res.status(404).json({ error: 'Player not found in match' });
    }
    
    // Set all players to inactive
    match.players.forEach(player => {
      player.isActive = false;
    });
    
    // Set the selected player to active
    match.players[playerIndex].isActive = true;
    match.activePlayerIndex = playerIndex;
    
    // Save the match state
    await matchManager.saveMatchState();
    
    // Log the action
    await logGameAction(
      getDb(),
      matchId,
      'player_switch_override',
      `Active player manually switched to ${playerId} by admin ${adminId || 'unknown'}`,
      adminId
    );
    
    res.json({
      success: true,
      message: 'Active player switched successfully',
      match: matchManager.getMatch()
    });
  } catch (err) {
    console.error('Error switching active player:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Error switching active player' 
    });
  }
});

export default router; 