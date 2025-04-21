/**
 * StatsTracker Module
 * Calculates and stores averages, checkout percentages, and other statistics
 */

export interface PlayerStats {
  dartsThrown: number;
  pointsScored: number;
  legsWon: number;
  legDarts: number[];
  busts: number;
  checkoutAttempts: number;
  checkoutSuccesses: number;
  highestCheckout: number;
  tonPlus: number;
  tonFortyPlus: number;
  tonEightyPlus: number;
  averageThrow: number;
  checkoutPercentage: number;
  dartsPerLeg: number;
  bestLegDarts: number;
}

export interface MatchStats {
  players: Map<number, PlayerStats>;
  checkoutSuggestions: boolean;
  startTime: Date;
  endTime: Date | null;
  legsPlayed: number;
  currentLeg: number;
  legsToWin: number;
  legStarters: number[];
}

/**
 * Initialize empty player stats
 */
export function initPlayerStats(): PlayerStats {
  return {
    dartsThrown: 0,
    pointsScored: 0,
    legsWon: 0,
    legDarts: [],
    busts: 0,
    checkoutAttempts: 0,
    checkoutSuccesses: 0,
    highestCheckout: 0,
    tonPlus: 0,
    tonFortyPlus: 0,
    tonEightyPlus: 0,
    averageThrow: 0,
    checkoutPercentage: 0,
    dartsPerLeg: 0,
    bestLegDarts: 0
  };
}

/**
 * Initialize match stats
 */
export function initMatchStats(playerIds: number[], legsToWin: number): MatchStats {
  const players = new Map<number, PlayerStats>();
  playerIds.forEach(id => {
    players.set(id, initPlayerStats());
  });

  return {
    players,
    checkoutSuggestions: true,
    startTime: new Date(),
    endTime: null,
    legsPlayed: 0,
    currentLeg: 1,
    legsToWin,
    legStarters: []
  };
}

/**
 * Update player stats with a new throw
 * @param stats Current player stats
 * @param throwScore Score of the throw
 * @param isBust Whether the throw resulted in a bust
 * @param isCheckoutAttempt Whether the throw was a checkout attempt
 * @param isSuccessfulCheckout Whether the throw was a successful checkout
 * @param checkoutValue The checkout value if successful
 * @returns Updated player stats
 */
export function updatePlayerThrow(
  stats: PlayerStats,
  throwScore: number,
  isBust: boolean,
  isCheckoutAttempt: boolean,
  isSuccessfulCheckout: boolean,
  checkoutValue: number = 0
): PlayerStats {
  const updatedStats = { ...stats };
  
  // Track darts thrown
  updatedStats.dartsThrown += 1;
  
  // Add points if not a bust
  if (!isBust) {
    updatedStats.pointsScored += throwScore;
  }
  
  // Track busts
  if (isBust) {
    updatedStats.busts += 1;
  }
  
  // Track checkout attempts
  if (isCheckoutAttempt) {
    updatedStats.checkoutAttempts += 1;
  }
  
  // Track successful checkouts
  if (isSuccessfulCheckout) {
    updatedStats.checkoutSuccesses += 1;
    
    // Track highest checkout
    if (checkoutValue > updatedStats.highestCheckout) {
      updatedStats.highestCheckout = checkoutValue;
    }
  }
  
  // Track ton+ scores (for current turn)
  // Note: These are typically tracked per turn rather than per throw,
  // so this logic would need to be moved to the turn completion
  
  // Calculate averages
  updatedStats.averageThrow = 
    updatedStats.dartsThrown > 0 
      ? (updatedStats.pointsScored / updatedStats.dartsThrown) * 3 
      : 0;
  
  updatedStats.checkoutPercentage = 
    updatedStats.checkoutAttempts > 0 
      ? (updatedStats.checkoutSuccesses / updatedStats.checkoutAttempts) * 100 
      : 0;
  
  return updatedStats;
}

/**
 * Update turn stats (typically called after a player's turn is complete)
 * @param stats Current player stats
 * @param turnScore Total score for the turn
 * @returns Updated player stats
 */
export function updatePlayerTurn(
  stats: PlayerStats,
  turnScore: number
): PlayerStats {
  const updatedStats = { ...stats };
  
  // Track ton+ scores
  if (turnScore >= 100 && turnScore < 140) {
    updatedStats.tonPlus += 1;
  } else if (turnScore >= 140 && turnScore < 180) {
    updatedStats.tonFortyPlus += 1;
  } else if (turnScore === 180) {
    updatedStats.tonEightyPlus += 1;
  }
  
  return updatedStats;
}

/**
 * Update stats when a player wins a leg
 * @param stats Current player stats
 * @param dartsUsedInLeg Number of darts used to win the leg
 * @returns Updated player stats
 */
export function updateLegWin(
  stats: PlayerStats,
  dartsUsedInLeg: number
): PlayerStats {
  const updatedStats = { ...stats };
  
  // Increment legs won
  updatedStats.legsWon += 1;
  
  // Add to leg darts array
  updatedStats.legDarts.push(dartsUsedInLeg);
  
  // Update best leg darts
  if (updatedStats.bestLegDarts === 0 || dartsUsedInLeg < updatedStats.bestLegDarts) {
    updatedStats.bestLegDarts = dartsUsedInLeg;
  }
  
  // Calculate darts per leg
  updatedStats.dartsPerLeg = 
    updatedStats.legsWon > 0 
      ? updatedStats.legDarts.reduce((sum, darts) => sum + darts, 0) / updatedStats.legsWon 
      : 0;
  
  return updatedStats;
}

/**
 * Check if a player is in a checkout position
 * @param score Player's current score
 * @returns Whether the player can check out with 3 darts
 */
export function isCheckoutPosition(score: number): boolean {
  return score <= 170 && score !== 169 && score !== 168 && score !== 166 && score !== 165 && score !== 163 && score !== 162 && score !== 159;
}

/**
 * Format a player's stats for display
 * @param stats Player stats to format
 * @returns Formatted stats object with rounded values
 */
export function formatPlayerStats(stats: PlayerStats): any {
  return {
    average: Math.round(stats.averageThrow * 100) / 100,
    checkoutPercentage: Math.round(stats.checkoutPercentage),
    dartsPerLeg: Math.round(stats.dartsPerLeg * 100) / 100,
    highestCheckout: stats.highestCheckout,
    legsWon: stats.legsWon,
    busts: stats.busts,
    tonPlus: stats.tonPlus,
    tonFortyPlus: stats.tonFortyPlus,
    tonEightyPlus: stats.tonEightyPlus,
    bestLegDarts: stats.bestLegDarts
  };
}

/**
 * Serialize a match stats object for storage
 * @param matchStats Match stats to serialize
 * @returns JSON-serializable object
 */
export function serializeMatchStats(matchStats: MatchStats): any {
  const serializedPlayers: Record<string, PlayerStats> = {};
  matchStats.players.forEach((stats, playerId) => {
    serializedPlayers[playerId.toString()] = stats;
  });

  return {
    ...matchStats,
    players: serializedPlayers
  };
}

/**
 * Deserialize a stored match stats object
 * @param serializedStats Serialized match stats
 * @returns MatchStats object
 */
export function deserializeMatchStats(serializedStats: any): MatchStats {
  const players = new Map<number, PlayerStats>();
  
  if (serializedStats.players) {
    Object.entries(serializedStats.players).forEach(([playerId, stats]) => {
      players.set(parseInt(playerId), stats as PlayerStats);
    });
  }

  return {
    ...serializedStats,
    players,
    startTime: new Date(serializedStats.startTime),
    endTime: serializedStats.endTime ? new Date(serializedStats.endTime) : null
  };
}

export default {
  initPlayerStats,
  initMatchStats,
  updatePlayerThrow,
  updatePlayerTurn,
  updateLegWin,
  isCheckoutPosition,
  formatPlayerStats,
  serializeMatchStats,
  deserializeMatchStats
}; 