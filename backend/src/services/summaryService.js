const { getDb } = require('../models/database');

/**
 * Build a match summary for a given match and player
 */
async function buildMatchSummary(matchId, playerId) {
  const db = getDb();
  
  // Get player information
  const player = await new Promise((resolve, reject) => {
    db.get(
      'SELECT id, name FROM players WHERE id = ?',
      [playerId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
  
  if (!player) {
    throw new Error(`Player with ID ${playerId} not found`);
  }
  
  // Get match information
  const match = await new Promise((resolve, reject) => {
    db.get(
      'SELECT id, created_at FROM games WHERE id = ?',
      [matchId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
  
  if (!match) {
    throw new Error(`Match with ID ${matchId} not found`);
  }
  
  // Get legs information
  const legs = await new Promise((resolve, reject) => {
    db.all(
      'SELECT id, winner_id FROM legs WHERE game_id = ?',
      [matchId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
  
  const legsPlayed = legs.length;
  const legsWon = legs.filter(leg => leg.winner_id === playerId).length;
  
  // Get all throws for this player in this match
  const throws = await new Promise((resolve, reject) => {
    db.all(
      `SELECT t.*, l.id as leg_id 
       FROM throws t
       JOIN legs l ON t.leg_id = l.id
       WHERE l.game_id = ? AND t.player_id = ?
       ORDER BY t.id`,
      [matchId, playerId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
  
  // Calculate statistics
  let totalScore = 0;
  let totalDarts = 0;
  let firstNineScore = 0;
  let firstNineDarts = 0;
  let highestCheckout = 0;
  let checkoutAttempts = 0;
  let checkoutSuccesses = 0;
  let tonPlus = 0;
  let tonFortyPlus = 0;
  let tonEighty = 0;
  
  // Group throws by leg
  const throwsByLeg = {};
  throws.forEach(t => {
    if (!throwsByLeg[t.leg_id]) {
      throwsByLeg[t.leg_id] = [];
    }
    throwsByLeg[t.leg_id].push(t);
  });
  
  // Process each leg
  Object.keys(throwsByLeg).forEach(legId => {
    const legThrows = throwsByLeg[legId];
    let legScore = 0;
    let legDarts = 0;
    let isLegWinner = legs.find(leg => leg.id === parseInt(legId))?.winner_id === playerId;
    
    legThrows.forEach((t, index) => {
      // Count darts used in this throw (1-3)
      const dartCount = [t.dart1, t.dart2, t.dart3].filter(d => d).length;
      totalDarts += dartCount;
      legDarts += dartCount;
      
      // Count score
      if (!t.is_bust) {
        legScore += t.score;
        totalScore += t.score;
        
        // First nine darts statistics
        if (firstNineDarts < 9) {
          const dartsToAdd = Math.min(9 - firstNineDarts, dartCount);
          firstNineDarts += dartsToAdd;
          // For simplicity, we'll approximate the first nine as a proportional part of this throw
          firstNineScore += Math.round((t.score / dartCount) * dartsToAdd);
        }
        
        // Count ton+ throws
        if (t.score >= 100 && t.score < 140) {
          tonPlus++;
        } else if (t.score >= 140 && t.score < 180) {
          tonFortyPlus++;
        } else if (t.score === 180) {
          tonEighty++;
        }
      }
      
      // Check for checkout attempts and successes
      const isLastThrow = index === legThrows.length - 1;
      if (t.remaining <= 170 && t.remaining > 0) {
        checkoutAttempts++;
        
        // If this is the last throw of a leg and player won, it's a successful checkout
        if (isLastThrow && isLegWinner) {
          checkoutSuccesses++;
          highestCheckout = Math.max(highestCheckout, t.score);
        }
      }
    });
  });
  
  // Calculate averages
  const average = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;
  const firstNineAverage = firstNineDarts > 0 ? (firstNineScore / firstNineDarts) * 3 : 0;
  const checkoutPercentage = checkoutAttempts > 0 ? (checkoutSuccesses / checkoutAttempts) * 100 : 0;
  const dartsPerLeg = legsWon > 0 ? totalDarts / legsWon : 0;
  
  return {
    matchId,
    playerId,
    playerName: player.name,
    legsPlayed,
    legsWon,
    average,
    firstNineAverage,
    checkoutPercentage,
    highestCheckout,
    checkoutAttempts,
    checkoutSuccesses,
    tonPlus,
    tonFortyPlus,
    tonEighty,
    totalDarts,
    dartsPerLeg,
    matchDate: new Date(match.created_at)
  };
}

/**
 * Save a match summary to the database
 */
async function saveMatchSummary(summary) {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO match_summaries (
        match_id, player_id, legs_played, legs_won, 
        average, first_nine_average, checkout_percentage, 
        highest_checkout, checkout_attempts, checkout_successes,
        ton_plus, ton_forty_plus, ton_eighty, 
        total_darts, darts_per_leg, match_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id, player_id) DO UPDATE SET
        legs_played = excluded.legs_played,
        legs_won = excluded.legs_won,
        average = excluded.average,
        first_nine_average = excluded.first_nine_average,
        checkout_percentage = excluded.checkout_percentage,
        highest_checkout = excluded.highest_checkout,
        checkout_attempts = excluded.checkout_attempts,
        checkout_successes = excluded.checkout_successes,
        ton_plus = excluded.ton_plus,
        ton_forty_plus = excluded.ton_forty_plus,
        ton_eighty = excluded.ton_eighty,
        total_darts = excluded.total_darts,
        darts_per_leg = excluded.darts_per_leg
      `,
      [
        summary.matchId,
        summary.playerId,
        summary.legsPlayed,
        summary.legsWon,
        summary.average,
        summary.firstNineAverage,
        summary.checkoutPercentage,
        summary.highestCheckout,
        summary.checkoutAttempts,
        summary.checkoutSuccesses,
        summary.tonPlus,
        summary.tonFortyPlus,
        summary.tonEighty,
        summary.totalDarts,
        summary.dartsPerLeg,
        summary.matchDate
      ],
      function(err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

/**
 * Generate and save match summaries for all players in a match
 */
async function generateMatchSummaries(matchId) {
  const db = getDb();
  
  try {
    // Get all players in the match
    const players = await new Promise((resolve, reject) => {
      db.all(
        `SELECT DISTINCT p.id, p.name
         FROM players p
         JOIN throws t ON t.player_id = p.id
         JOIN legs l ON t.leg_id = l.id
         WHERE l.game_id = ?`,
        [matchId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    if (!players || players.length === 0) {
      throw new Error(`No players found for match ${matchId}`);
    }
    
    const summaries = [];
    
    // Generate and save summary for each player
    for (const player of players) {
      const summary = await buildMatchSummary(matchId, player.id);
      await saveMatchSummary(summary);
      summaries.push(summary);
    }
    
    return summaries;
  } catch (error) {
    console.error(`Error generating match summaries for match ${matchId}:`, error);
    throw error;
  }
}

/**
 * Get match summaries for a specific match
 */
async function getMatchSummaries(matchId) {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT ms.*, p.name as player_name
       FROM match_summaries ms
       JOIN players p ON ms.player_id = p.id
       WHERE ms.match_id = ?
       ORDER BY ms.legs_won DESC, ms.average DESC`,
      [matchId],
      (err, rows) => {
        if (err) return reject(err);
        
        const summaries = rows.map(s => ({
          matchId: s.match_id,
          playerId: s.player_id,
          playerName: s.player_name,
          legsPlayed: s.legs_played,
          legsWon: s.legs_won,
          average: s.average,
          firstNineAverage: s.first_nine_average,
          checkoutPercentage: s.checkout_percentage,
          highestCheckout: s.highest_checkout,
          checkoutAttempts: s.checkout_attempts,
          checkoutSuccesses: s.checkout_successes,
          tonPlus: s.ton_plus,
          tonFortyPlus: s.ton_forty_plus,
          tonEighty: s.ton_eighty,
          totalDarts: s.total_darts,
          dartsPerLeg: s.darts_per_leg,
          matchDate: new Date(s.match_date)
        }));
        
        resolve(summaries);
      }
    );
  });
}

/**
 * Get player stats across multiple matches
 */
async function getPlayerStats(playerId, limit = 10) {
  const db = getDb();
  
  try {
    // Get recent matches for this player
    const recentMatches = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM match_summaries
         WHERE player_id = ?
         ORDER BY match_date DESC
         LIMIT ?`,
        [playerId, limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
    
    // Calculate aggregated statistics
    const totalMatches = recentMatches.length;
    
    if (totalMatches === 0) {
      return {
        playerId,
        totalMatches: 0,
        averageStats: null,
        recentMatches: []
      };
    }
    
    let totalLegsPlayed = 0;
    let totalLegsWon = 0;
    let totalAverage = 0;
    let totalCheckoutPercentage = 0;
    let highestCheckout = 0;
    let totalTonPlus = 0;
    let totalTonFortyPlus = 0;
    let totalTonEighty = 0;
    
    recentMatches.forEach(match => {
      totalLegsPlayed += match.legs_played;
      totalLegsWon += match.legs_won;
      totalAverage += match.average;
      totalCheckoutPercentage += match.checkout_percentage;
      highestCheckout = Math.max(highestCheckout, match.highest_checkout);
      totalTonPlus += match.ton_plus;
      totalTonFortyPlus += match.ton_forty_plus;
      totalTonEighty += match.ton_eighty;
    });
    
    // Get player details
    const player = await new Promise((resolve, reject) => {
      db.get(
        'SELECT name FROM players WHERE id = ?',
        [playerId],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });
    
    return {
      playerId,
      playerName: player.name,
      totalMatches,
      averageStats: {
        legsWonPercentage: totalLegsPlayed > 0 ? (totalLegsWon / totalLegsPlayed) * 100 : 0,
        average: totalMatches > 0 ? totalAverage / totalMatches : 0,
        checkoutPercentage: totalMatches > 0 ? totalCheckoutPercentage / totalMatches : 0,
        highestCheckout,
        tonPlusPerMatch: totalMatches > 0 ? totalTonPlus / totalMatches : 0,
        tonFortyPlusPerMatch: totalMatches > 0 ? totalTonFortyPlus / totalMatches : 0,
        tonEightyPerMatch: totalMatches > 0 ? totalTonEighty / totalMatches : 0
      },
      recentMatches: recentMatches.map(m => ({
        matchId: m.match_id,
        matchDate: new Date(m.match_date),
        legsPlayed: m.legs_played,
        legsWon: m.legs_won,
        average: m.average,
        checkoutPercentage: m.checkout_percentage,
        highestCheckout: m.highest_checkout
      }))
    };
  } catch (error) {
    console.error(`Error getting player stats for player ${playerId}:`, error);
    throw error;
  }
}

module.exports = {
  buildMatchSummary,
  saveMatchSummary,
  generateMatchSummaries,
  getMatchSummaries,
  getPlayerStats
}; 