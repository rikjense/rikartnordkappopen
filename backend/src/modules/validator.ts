/**
 * Validator module
 * Handles busts and double-out rules for dart games
 */

export interface ValidatorOptions {
  doubleIn: boolean;
  doubleOut: boolean;
  masterOut: boolean;
}

export interface ValidationResult {
  valid: boolean;
  bust: boolean;
  gameShot: boolean;
  reason?: string;
  newScore?: number;
}

/**
 * Checks if a segment is a double
 */
export function isDouble(segment: string): boolean {
  return segment.startsWith('D') || segment === 'DBULL';
}

/**
 * Checks if a segment is a triple
 */
export function isTriple(segment: string): boolean {
  return segment.startsWith('T');
}

/**
 * Checks if a segment is a master (double or triple)
 */
export function isMaster(segment: string): boolean {
  return isDouble(segment) || isTriple(segment);
}

/**
 * Validates a throw for X01 games
 * @param currentScore Current player score
 * @param segment Segment hit (e.g., 'S20', 'D16', 'T19')
 * @param throwScore Score value of the throw
 * @param dartsThrown Number of darts already thrown in this turn
 * @param options Game options (double in, double out)
 * @returns Validation result
 */
export function validateX01Throw(
  currentScore: number,
  segment: string,
  throwScore: number,
  dartsThrown: number,
  options: ValidatorOptions
): ValidationResult {
  // Invalid score
  if (throwScore < 0) {
    return {
      valid: false,
      bust: false,
      gameShot: false,
      reason: 'Invalid score'
    };
  }

  // Double-in rule check
  if (options.doubleIn && currentScore === 501 && !isDouble(segment)) {
    return {
      valid: true,
      bust: false,
      gameShot: false,
      newScore: currentScore,
      reason: 'Must start with a double'
    };
  }

  const newScore = currentScore - throwScore;

  // Check for bust
  if (newScore < 0) {
    return {
      valid: true,
      bust: true,
      gameShot: false,
      reason: 'Bust: score below 0'
    };
  }

  // Check for bust on 1
  if (newScore === 1 && options.doubleOut) {
    return {
      valid: true,
      bust: true,
      gameShot: false,
      reason: 'Bust: cannot finish on 1 with double out'
    };
  }

  // Check for game shot
  if (newScore === 0) {
    // For double out, last dart must be a double
    if (options.doubleOut && !isDouble(segment)) {
      return {
        valid: true,
        bust: true,
        gameShot: false,
        reason: 'Bust: must finish on a double'
      };
    }

    // For master out, last dart must be a double or triple
    if (options.masterOut && !isMaster(segment)) {
      return {
        valid: true,
        bust: true,
        gameShot: false,
        reason: 'Bust: must finish on a double or triple'
      };
    }

    return {
      valid: true,
      bust: false,
      gameShot: true,
      newScore: 0,
      reason: 'Game shot!'
    };
  }

  // Valid throw
  return {
    valid: true,
    bust: false,
    gameShot: false,
    newScore: newScore
  };
}

/**
 * Calculates distance from the bull
 * @param coordinates [x, y] coordinates on the board
 * @returns [number, string] - The distance value and formatted string
 */
export function calculateDistanceFromBull(coordinates: [number, number]): [number, string] {
  const [x, y] = coordinates;
  const distance = Math.round(Math.sqrt(x * x + y * y));
  return [distance, `${distance} mm`];
}

/**
 * Get suggested checkout for a given score
 * @param score Current score
 * @param dartsLeft Number of darts left in the current turn
 * @returns Array of segments to aim for, or null if not possible
 */
export function getCheckoutSuggestion(score: number, dartsLeft: number): string[] | null {
  // Not a possible checkout
  if (score > 170 || score <= 0 || score === 169 || score === 168 || score === 166 || score === 165 || score === 163 || score === 162 || score === 159) {
    return null;
  }

  // Not enough darts
  if ((score > 40 && dartsLeft < 2) || (score > 110 && dartsLeft < 3)) {
    return null;
  }

  // One dart checkouts (doubles)
  if (score <= 40 && score % 2 === 0) {
    return [`D${score / 2}`];
  }

  // Two dart checkouts
  if (dartsLeft >= 2) {
    // Special case for 50
    if (score === 50) {
      return ['BULL'];
    }

    // Check if we can do it with a single + double
    const remainder = score - 50;
    if (remainder > 0 && remainder <= 40 && remainder % 2 === 0) {
      return ['BULL', `D${remainder / 2}`];
    }

    // Try treble + double combinations
    for (let i = 1; i <= 20; i++) {
      const remainingAfterTreble = score - (i * 3);
      if (remainingAfterTreble > 0 && remainingAfterTreble <= 40 && remainingAfterTreble % 2 === 0) {
        return [`T${i}`, `D${remainingAfterTreble / 2}`];
      }
    }

    // Try single + double combinations
    for (let i = 1; i <= 20; i++) {
      const remainingAfterSingle = score - i;
      if (remainingAfterSingle > 0 && remainingAfterSingle <= 40 && remainingAfterSingle % 2 === 0) {
        return [`S${i}`, `D${remainingAfterSingle / 2}`];
      }
    }
  }

  // Three dart checkouts
  if (dartsLeft >= 3) {
    // Special cases
    if (score === 170) return ['T20', 'T20', 'BULL'];
    if (score === 167) return ['T20', 'T19', 'BULL'];
    if (score === 164) return ['T20', 'T18', 'BULL'];
    if (score === 161) return ['T20', 'T17', 'BULL'];
    if (score === 160) return ['T20', 'T20', 'D20'];
    if (score === 158) return ['T20', 'T20', 'D19'];
    if (score === 157) return ['T20', 'T19', 'D20'];
    if (score === 156) return ['T20', 'T20', 'D18'];
    if (score === 155) return ['T20', 'T19', 'D19'];
    if (score === 154) return ['T20', 'T18', 'D20'];
    if (score === 153) return ['T20', 'T19', 'D18'];
    if (score === 152) return ['T20', 'T20', 'D16'];
    if (score === 151) return ['T20', 'T17', 'D20'];
    if (score === 150) return ['T20', 'T18', 'D18'];

    // Generic approach for other scores
    for (let i = 20; i >= 1; i--) {
      const remainingAfterTreble = score - (i * 3);
      if (remainingAfterTreble > 60 && remainingAfterTreble <= 110) {
        for (let j = 20; j >= 1; j--) {
          const finalRemaining = remainingAfterTreble - (j * 3);
          if (finalRemaining > 0 && finalRemaining <= 40 && finalRemaining % 2 === 0) {
            return [`T${i}`, `T${j}`, `D${finalRemaining / 2}`];
          }
        }
      }
    }
  }

  // Fallback for odd cases
  if (score % 2 === 1) {
    // For odd scores, suggest hitting a single first
    return ['S1', ...getCheckoutSuggestion(score - 1, dartsLeft - 1) || []];
  }

  return null;
}

export default {
  validateX01Throw,
  isDouble,
  isTriple,
  isMaster,
  calculateDistanceFromBull,
  getCheckoutSuggestion
}; 