/**
 * MatchManager module
 * Drives leg state, tracks turns, and manages the overall game flow
 */

import { EventEmitter } from 'events';
import * as sqlite3 from 'sqlite3';
import validator, { ValidatorOptions, ValidationResult } from './validator';
import statsTracker, { MatchStats, PlayerStats } from './statsTracker';
import { ThrowData } from '../types/scolia';
import { PlayerModel } from '../types/models';
import { Database } from 'sqlite3';

// Define local PlayerStats interface without export
interface PlayerStats {
  avgScore: number;
  highScore: number;
  checkouts: number;
  checkoutPercentage: number;
  highCheckout: number;
  dartsPerLeg: number;
}

// Define the interface without using the same name as any import
interface PlayerGameStats {
  avgScore: number;
  highScore: number;
  checkouts: number;
  checkoutPercentage: number;
  highCheckout: number;
  dartsPerLeg: number;
}

// Ensure Player properly extends PlayerModel with compatible types
export interface Player extends Omit<PlayerModel, 'stats'> {
  position: number;
  score: number;
  isActive: boolean;
  isWinner: boolean;
  history: ThrowData[];
  currentTurn: ThrowData[];
  originalScore: number;
  dartsThrown: number;
  legsWon: number;
  stats: PlayerGameStats;
}

// Use Date type for timestamp to match ThrowData definition
export interface ExtendedThrowData extends ThrowData {
  playerId: number;
  leg: number;
  round: number;
  throwOrder?: number;
  isValid?: boolean;
  timestamp?: Date;
  coordinates?: [number, number];
}

export interface ValidatorSettingsOptions extends ValidatorOptions {
  startingScore: number;
  checkoutSuggestions: boolean;
}

export interface Match {
  id?: number;
  boardId: number | string;
  mode: string;
  players: Player[];
  legsToWin: number;
  currentLeg: number;
  legStarters: number[];
  activePlayerIndex: number;
  round: number;
  state: 'pending' | 'warmup' | 'bullshot' | 'active' | 'completed' | 'setup' | 'playing' | 'finished';
  settings: ValidatorSettingsOptions | any;
  timestamp: number;
  isAutosaved: boolean;
  stats: MatchStats;
}

export interface BullResult {
  playerId: number;
  segment: string;
  distance: number;
  formattedDistance: string;
}

export interface ThrowResults {
  throwData: ThrowData;
  validationResult: ValidationResult;
  bust: boolean;
  gameShot: boolean;
  legWon: boolean;
  matchWon: boolean;
  checkoutSuggestion: string[] | null;
}

export class MatchManager extends EventEmitter {
  private match: Match | null = null;
  private db: sqlite3.Database | null = null;
  private autosaveTimer: NodeJS.Timeout | null = null;
  private readonly AUTOSAVE_INTERVAL = 30000; // 30 seconds

  constructor(db: sqlite3.Database | null = null) {
    super();
    this.db = db;
  }

  /**
   * Create a new match
   */
  async createMatch(
    boardId: number,
    players: PlayerModel[],
    mode: string = 'x01',
    legsToWin: number = 3,
    settings: Partial<ValidatorSettingsOptions> = {}
  ): Promise<Match> {
    if (this.match) {
      throw new Error('Match already in progress');
    }

    // Determine starting score based on mode
    let startingScore = 501;
    if (mode === 'x01') {
      const x01Value = Number(settings.startingScore || 501);
      startingScore = [301, 501, 701, 901].includes(x01Value) ? x01Value : 501;
    }

    // Create validator options
    const validatorOptions: ValidatorSettingsOptions = {
      doubleIn: settings.doubleIn || false,
      doubleOut: settings.doubleOut === undefined ? true : !!settings.doubleOut,
      masterOut: settings.masterOut || false,
      startingScore,
      checkoutSuggestions: settings.checkoutSuggestions !== false
    };

    // Setup player objects
    const setupPlayers: Player[] = this.initializePlayers(players);

    // Create match object
    const match: Match = {
      id: 0, // Will be set after saving to DB
      boardId,
      players: setupPlayers,
      legsToWin,
      currentLeg: 1,
      activePlayerIndex: 0,
      mode,
      state: 'pending',
      settings: validatorOptions,
      stats: statsTracker.initMatchStats(
        setupPlayers.map(p => p.id),
        legsToWin
      ),
      legStarters: [setupPlayers[0].id], // First player starts first leg
      round: 1,
      timestamp: Date.now(),
      isAutosaved: false
    };

    this.match = match;

    // Save match to database if available
    if (this.db) {
      try {
        const { id } = await this.saveMatchToDb();
        this.match.id = id;
      } catch (error) {
        console.error('Error saving match to database:', error);
      }
    }

    // Start autosave timer
    this.startAutosaveTimer();

    return { ...this.match };
  }

  /**
   * Start the match
   */
  async startMatch(): Promise<Match> {
    if (!this.match) {
      throw new Error('No match to start');
    }

    if (this.match.state !== 'pending') {
      throw new Error(`Cannot start match in state: ${this.match.state}`);
    }

    this.match.state = 'warmup';
    await this.saveMatchState();

    this.emit('matchStateChanged', { ...this.match });
    return { ...this.match };
  }

  /**
   * Start the warmup period
   */
  async startWarmup(): Promise<Match> {
    if (!this.match) {
      throw new Error('No match to start warmup for');
    }

    if (this.match.state !== 'pending' && this.match.state !== 'warmup') {
      throw new Error(`Cannot start warmup in state: ${this.match.state}`);
    }

    this.match.state = 'warmup';
    await this.saveMatchState();

    this.emit('warmupStarted', { ...this.match });
    return { ...this.match };
  }

  /**
   * End the warmup period and start bull shooting
   */
  async endWarmup(): Promise<Match> {
    if (!this.match) {
      throw new Error('No match to end warmup for');
    }

    if (this.match.state !== 'warmup') {
      throw new Error(`Cannot end warmup in state: ${this.match.state}`);
    }

    this.match.state = 'bullshot';
    await this.saveMatchState();

    this.emit('bullshotStarted', { ...this.match });
    return { ...this.match };
  }

  /**
   * Record a bull shot and determine the closest player
   */
  async recordBullShot(
    playerId: number,
    segment: string,
    coordinates: [number, number]
  ): Promise<BullResult> {
    if (!this.match) {
      throw new Error('No match in progress');
    }

    if (this.match.state !== 'bullshot') {
      throw new Error(`Cannot record bull shot in state: ${this.match.state}`);
    }

    // Calculate distance from bull
    const [distance, formattedDistance] = validator.calculateDistanceFromBull(coordinates);

    const result: BullResult = {
      playerId,
      segment,
      distance,
      formattedDistance
    };

    this.emit('bullshotRecorded', result);
    return result;
  }

  /**
   * Set the bull winner and start the first leg
   */
  async setBullWinner(playerId: number): Promise<Match> {
    if (!this.match) {
      throw new Error('No match in progress');
    }

    if (this.match.state !== 'bullshot') {
      throw new Error(`Cannot set bull winner in state: ${this.match.state}`);
    }

    // Find the player
    const playerIndex = this.match.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error(`Player with id ${playerId} not found`);
    }

    // Set first leg starter
    this.match.legStarters[0] = playerId;

    // Set active player
    this.match.players.forEach(p => { p.isActive = p.id === playerId; });
    this.match.activePlayerIndex = playerIndex;

    // Start the match
    this.match.state = 'active';
    await this.saveMatchState();

    this.emit('matchStarted', { ...this.match });
    return { ...this.match };
  }

  /**
   * Process a dart throw
   */
  async processThrow(
    playerId: number,
    segment: string,
    score: number,
    coordinates?: [number, number]
  ): Promise<ThrowResults> {
    if (!this.match) {
      throw new Error('No match in progress');
    }

    if (this.match.state !== 'active') {
      throw new Error(`Cannot process throw in state: ${this.match.state}`);
    }

    // Find the player
    const playerIndex = this.match.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error(`Player with id ${playerId} not found`);
    }

    // Check if it's this player's turn
    if (playerIndex !== this.match.activePlayerIndex) {
      throw new Error(`Not player ${playerId}'s turn`);
    }

    const player = this.match.players[playerIndex];
    const dartsInTurn = player.currentTurn.length;

    // Check if player has already thrown 3 darts
    if (dartsInTurn >= 3) {
      throw new Error('Player has already thrown 3 darts');
    }

    // Validate the throw based on game rules
    const validationResult = validator.validateX01Throw(
      player.score,
      segment,
      score,
      dartsInTurn,
      this.match.settings
    );

    // Create throw data
    const throwData: ExtendedThrowData = {
      id: Date.now(), // Temporary ID for local tracking, will be replaced by DB
      matchId: this.match.id,
      playerId,
      round: this.match.round,
      throwIndex: dartsInTurn + 1,
      segment,
      score,
      timestamp: new Date(),
      coordinates
    };

    // Add throw to player's current turn
    player.currentTurn.push(throwData);
    player.dartsThrown++;

    let bust = false;
    let gameShot = false;
    let legWon = false;
    let matchWon = false;
    let checkoutSuggestion: string[] | null = null;

    // Update player's score if valid
    if (validationResult.valid && !validationResult.bust) {
      player.score = validationResult.newScore !== undefined ? validationResult.newScore : player.score;

      // Check for game shot
      if (validationResult.gameShot) {
        gameShot = true;
        legWon = true;

        // Update stats
        const playerStats = this.match.stats.players.get(playerId);
        if (playerStats) {
          const updatedStats = statsTracker.updateLegWin(playerStats, player.dartsThrown);
          this.match.stats.players.set(playerId, updatedStats);
        }

        // Check if player has won the match
        player.isWinner = true;
        const playerLegWins = this.getPlayerLegWins(playerId);
        if (playerLegWins >= this.match.legsToWin) {
          matchWon = true;
          this.match.state = 'completed';
        } else {
          // Setup next leg
          await this.setupNextLeg();
        }
      }
    } else if (validationResult.bust) {
      bust = true;
      // Reset player's score for the turn
      player.score = player.originalScore;

      // Update bust stats
      const playerStats = this.match.stats.players.get(playerId);
      if (playerStats) {
        playerStats.busts += 1;
      }
    }

    // If it's the third dart or a leg was won, move to the next player
    if (dartsInTurn === 2 || legWon) {
      if (!legWon) {
        await this.moveToNextPlayer();
      }
    } else {
      // Provide checkout suggestion if enabled and in checkout range
      if (this.match.settings.checkoutSuggestions &&
          statsTracker.isCheckoutPosition(player.score)) {
        checkoutSuggestion = validator.getCheckoutSuggestion(
          player.score,
          3 - (dartsInTurn + 1)
        );
      }
    }

    // Save throw to database
    if (this.db && this.match.id) {
      try {
        await this.saveThrowToDb(throwData);
      } catch (error) {
        console.error('Error saving throw to database:', error);
      }
    }

    // Save match state
    await this.saveMatchState();

    // Create result object
    const result: ThrowResults = {
      throwData,
      validationResult,
      bust,
      gameShot,
      legWon,
      matchWon,
      checkoutSuggestion
    };

    this.emit('throwProcessed', result);
    return result;
  }

  /**
   * Move to the next player
   */
  private async moveToNextPlayer(): Promise<void> {
    if (!this.match) return;

    const currentPlayer = this.match.players[this.match.activePlayerIndex];
    
    // Calculate turn score and update stats
    const turnScore = currentPlayer.currentTurn.reduce((sum, t) => sum + t.score, 0);
    const playerStats = this.match.stats.players.get(currentPlayer.id);
    if (playerStats) {
      const updatedStats = statsTracker.updatePlayerTurn(playerStats, turnScore);
      this.match.stats.players.set(currentPlayer.id, updatedStats);
    }

    // Move throws from current turn to history
    currentPlayer.history.push(...currentPlayer.currentTurn);
    currentPlayer.currentTurn = [];
    
    // Save the current score as the original score for the next turn
    currentPlayer.originalScore = currentPlayer.score;
    
    // Make current player inactive
    currentPlayer.isActive = false;
    
    // Move to the next player
    this.match.activePlayerIndex = (this.match.activePlayerIndex + 1) % this.match.players.length;
    
    // If we've completed a round, increment the round counter
    if (this.match.activePlayerIndex === 0) {
      this.match.round++;
    }
    
    // Make the next player active
    this.match.players[this.match.activePlayerIndex].isActive = true;
    
    // Save the match state
    await this.saveMatchState();
    
    this.emit('playerChanged', {
      previousPlayerId: currentPlayer.id,
      activePlayerId: this.match.players[this.match.activePlayerIndex].id,
      round: this.match.round
    });
  }

  /**
   * Setup the next leg
   */
  private async setupNextLeg(): Promise<void> {
    if (!this.match) return;

    // Increment leg counter
    this.match.currentLeg++;
    this.match.stats.currentLeg = this.match.currentLeg;
    this.match.stats.legsPlayed++;

    // Determine the next leg starter (alternating)
    const lastStarterIndex = this.match.players.findIndex(
      p => p.id === this.match.legStarters[this.match.currentLeg - 2]
    );
    const nextStarterIndex = (lastStarterIndex + 1) % this.match.players.length;
    const nextStarterId = this.match.players[nextStarterIndex].id;
    this.match.legStarters[this.match.currentLeg - 1] = nextStarterId;

    // Reset player scores
    this.match.players.forEach(player => {
      player.score = this.match.settings.startingScore;
      player.originalScore = this.match.settings.startingScore;
      player.isActive = player.id === nextStarterId;
      player.isWinner = false;
      player.currentTurn = [];
      player.dartsThrown = 0;
    });

    // Set active player
    this.match.activePlayerIndex = nextStarterIndex;
    
    // Reset round counter
    this.match.round = 1;

    await this.saveMatchState();
    
    this.emit('legChanged', {
      currentLeg: this.match.currentLeg,
      legStarter: nextStarterId
    });
  }

  /**
   * Manually correct a throw
   */
  async correctThrow(
    throwId: number | string,
    segment: string,
    score: number
  ): Promise<ThrowResults> {
    if (!this.match) {
      throw new Error('No match in progress');
    }

    // Find the throw in any player's history
    let playerIndex = -1;
    let throwIndex = -1;
    let throwData: ThrowData | null = null;

    for (let i = 0; i < this.match.players.length; i++) {
      const player = this.match.players[i];
      const index = player.history.findIndex(t => t.id === throwId);
      
      if (index !== -1) {
        playerIndex = i;
        throwIndex = index;
        throwData = player.history[index];
        break;
      }
    }

    if (!throwData) {
      throw new Error(`Throw with id ${throwId} not found`);
    }

    // Calculate score difference
    const scoreDifference = score - throwData.score;
    
    // Update the throw
    throwData.segment = segment;
    throwData.score = score;
    
    // Update player score
    const player = this.match.players[playerIndex];
    player.score -= scoreDifference;
    
    // Validate the updated throw
    const validationResult = validator.validateX01Throw(
      player.score + scoreDifference,
      segment,
      score,
      throwData.throwIndex - 1,
      this.match.settings
    );

    // Save correction to database
    if (this.db) {
      try {
        await this.updateThrowInDb(throwData);
      } catch (error) {
        console.error('Error updating throw in database:', error);
      }
    }

    // Save match state
    await this.saveMatchState();

    const result: ThrowResults = {
      throwData,
      validationResult,
      bust: false,
      gameShot: false,
      legWon: false,
      matchWon: false,
      checkoutSuggestion: null
    };

    this.emit('throwCorrected', result);
    return result;
  }

  /**
   * Manually switch to the next player
   */
  async manualPlayerSwitch(): Promise<void> {
    await this.moveToNextPlayer();
  }

  /**
   * End the match
   */
  async endMatch(winningPlayerId?: number): Promise<Match> {
    if (!this.match) {
      throw new Error('No match in progress');
    }

    // If a winning player is specified, mark them as the winner
    if (winningPlayerId) {
      const playerIndex = this.match.players.findIndex(p => p.id === winningPlayerId);
      if (playerIndex !== -1) {
        this.match.players[playerIndex].isWinner = true;
      }
    }

    this.match.state = 'completed';
    this.match.stats.endTime = new Date();
    
    // Stop autosave timer
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    
    await this.saveMatchState();
    
    // Generate match summaries if match has an ID
    if (this.match.id) {
      try {
        // We need to use require here as we can't import directly due to circular dependencies
        const summaryService = require('../services/summaryService');
        await summaryService.generateMatchSummaries(this.match.id);
      } catch (error) {
        console.error('Error generating match summaries:', error);
      }
    }
    
    this.emit('matchEnded', { ...this.match });
    return { ...this.match };
  }

  /**
   * Get the current match
   */
  getMatch(): Match | null {
    return this.match ? { ...this.match } : null;
  }

  /**
   * Get player leg wins
   */
  private getPlayerLegWins(playerId: number): number {
    if (!this.match) return 0;
    
    const playerStats = this.match.stats.players.get(playerId);
    return playerStats ? playerStats.legsWon : 0;
  }

  /**
   * Start the autosave timer
   */
  private startAutosaveTimer(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    
    this.autosaveTimer = setInterval(() => {
      this.saveMatchState(true);
    }, this.AUTOSAVE_INTERVAL);
  }

  /**
   * Save the match state
   */
  private async saveMatchState(isAutosave: boolean = false): Promise<void> {
    if (!this.match) return;
    
    this.match.timestamp = Date.now();
    this.match.isAutosaved = isAutosave;
    
    if (this.db && this.match.id) {
      try {
        await this.saveMatchToDb();
      } catch (error) {
        console.error('Error saving match state to database:', error);
      }
    }
    
    this.emit('matchStateAutosaved', {
      matchId: this.match.id,
      timestamp: this.match.timestamp,
      isAutosave
    });
  }

  /**
   * Helper method for database operations
   */
  private async dbRun(sql: string, params: any[] = []): Promise<{lastID: number, changes: number}> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not initialized'));
      }
      this.db.run(sql, params, function(err) {
        if (err) return reject(err);
        // Use nullish coalescing to handle undefined values
        resolve({ 
          lastID: this.lastID ?? 0, 
          changes: this.changes ?? 0 
        });
      });
    });
  }

  /**
   * Save match to database
   */
  private async saveMatchToDb(): Promise<{ id: number }> {
    if (!this.match || !this.db) {
      throw new Error('Match or database not available');
    }

    // Use the dbRun helper method instead of redefining it here
    try {
      const sql = `INSERT INTO matches (
        board_id, mode, legs_to_win, current_leg, active_player_index,
        state, settings, timestamp, is_autosaved
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const params = [
        this.match.boardId,
        this.match.mode,
        this.match.legsToWin,
        this.match.currentLeg,
        this.match.activePlayerIndex,
        this.match.state,
        JSON.stringify(this.match.settings),
        this.match.timestamp,
        this.match.isAutosaved ? 1 : 0
      ];

      const result = await this.dbRun(sql, params);
      const matchId = result.lastID;

      // Insert player-match relationships
      for (const player of this.match.players) {
        await this.dbRun(
          'INSERT INTO match_players (match_id, player_id, position, original_score) VALUES (?, ?, ?, ?)',
          [matchId, player.id, player.position, player.originalScore]
        );
      }

      // Insert leg starters
      for (let i = 0; i < this.match.legStarters.length; i++) {
        await this.dbRun(
          'INSERT INTO leg_starters (match_id, leg_number, player_id) VALUES (?, ?, ?)',
          [matchId, i + 1, this.match.legStarters[i]]
        );
      }

      return { id: matchId };
    } catch (error) {
      console.error('Error saving match to database:', error);
      throw error;
    }
  }

  /**
   * Save throw to database
   */
  private async saveThrowToDb(throwData: ExtendedThrowData): Promise<{ id: number }> {
    if (!this.match || !this.db) {
      throw new Error('Match or database not available');
    }

    // Use the existing dbRun method instead of redefining it
    try {
      const sql = `INSERT INTO throws (
        match_id, player_id, leg, round, throw_order, segment, score,
        is_valid, coordinates, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const params = [
        this.match.id,
        throwData.playerId,
        throwData.leg,
        throwData.round,
        throwData.throwOrder || 0,
        throwData.segment,
        throwData.score,
        throwData.isValid ? 1 : 0,
        throwData.coordinates ? JSON.stringify(throwData.coordinates) : null,
        throwData.timestamp || Date.now()
      ];

      const result = await this.dbRun(sql, params);
      return { id: result.lastID };
    } catch (error) {
      console.error('Error saving throw to database:', error);
      throw error;
    }
  }

  /**
   * Update throw in database
   */
  private async updateThrowInDb(throwData: ThrowData & { isValid?: boolean }): Promise<void> {
    if (!this.match || !this.db) {
      throw new Error('Match or database not available');
    }

    try {
      const sql = `UPDATE throws SET
        segment = ?,
        score = ?,
        is_valid = ?
        WHERE id = ?`;

      const params = [
        throwData.segment,
        throwData.score,
        throwData.isValid ? 1 : 0,
        throwData.id
      ];

      await this.dbRun(sql, params);
    } catch (error) {
      console.error('Error updating throw in database:', error);
      throw error;
    }
  }

  /**
   * Load a match from the database
   */
  async loadMatch(matchId: number): Promise<Match> {
    if (!this.db) {
      throw new Error('Database not available');
    }

    try {
      // Get match data
      const match = await this.db.get(
        'SELECT * FROM matches WHERE id = ?',
        [matchId]
      );
      
      if (!match) {
        throw new Error(`Match with id ${matchId} not found`);
      }
      
      // Get match players
      const matchPlayers = await this.db.all(
        `SELECT mp.*, p.name, p.nickname, p.avatar 
         FROM match_players mp
         JOIN players p ON mp.player_id = p.id
         WHERE mp.match_id = ?
         ORDER BY mp.position`,
        [matchId]
      );
      
      // Get throws
      const throws = await this.db.all(
        'SELECT * FROM throws WHERE match_id = ? ORDER BY round, player_id, throw_number',
        [matchId]
      );
      
      // Parse settings and scores
      const settings = JSON.parse(match.settings || '{}');
      const scores = JSON.parse(match.scores || '{}');
      
      // Create player objects
      const players: Player[] = matchPlayers.map(mp => {
        const playerScore = scores.players?.find((p: any) => p.id === mp.player_id);
        
        return {
          id: mp.player_id,
          name: mp.name,
          nickname: mp.nickname,
          avatar: mp.avatar,
          position: mp.position,
          score: playerScore?.score || settings.startingScore || 501,
          isActive: playerScore?.isActive || false,
          isWinner: playerScore?.isWinner || false,
          history: [],
          currentTurn: [],
          originalScore: playerScore?.score || settings.startingScore || 501,
          dartsThrown: 0
        };
      });
      
      // Populate throw history for each player
      throws.forEach(t => {
        const player = players.find(p => p.id === t.player_id);
        if (player) {
          const throwData: ThrowData = {
            id: t.id,
            matchId: t.match_id,
            playerId: t.player_id,
            round: t.round,
            throwIndex: t.throw_number,
            segment: t.segment,
            score: t.score,
            timestamp: new Date(t.timestamp)
          };
          
          player.history.push(throwData);
          player.dartsThrown++;
        }
      });
      
      // Create match object
      this.match = {
        id: matchId,
        boardId: match.board_id,
        players,
        legsToWin: settings.legsToWin || 3,
        currentLeg: scores.currentLeg || 1,
        activePlayerIndex: players.findIndex(p => p.isActive),
        mode: match.mode,
        state: match.state,
        settings: {
          doubleIn: settings.doubleIn || false,
          doubleOut: settings.doubleOut === undefined ? true : !!settings.doubleOut,
          masterOut: settings.masterOut || false,
          startingScore: settings.startingScore || 501,
          checkoutSuggestions: settings.checkoutSuggestions !== false
        },
        stats: scores.stats ? statsTracker.deserializeMatchStats(scores.stats) : 
          statsTracker.initMatchStats(players.map(p => p.id), settings.legsToWin || 3),
        legStarters: scores.legStarters || [players[0].id],
        round: scores.round || 1,
        timestamp: Date.now(),
        isAutosaved: false
      };
      
      // If no active player is set, default to the first player
      if (this.match.activePlayerIndex === -1) {
        this.match.activePlayerIndex = 0;
        this.match.players[0].isActive = true;
      }
      
      // Start autosave timer if match is active
      if (this.match.state === 'active') {
        this.startAutosaveTimer();
      }
      
      return { ...this.match };
    } catch (error) {
      console.error('Error loading match from database:', error);
      throw error;
    }
  }

  // Fix player initialization to properly convert stats from string to PlayerStats
  private initializePlayers(playerModels: PlayerModel[]): Player[] {
    return playerModels.map((player, index) => {
      let playerStats: PlayerGameStats;
      
      // Handle stats conversion from string to object
      if (player.stats) {
        if (typeof player.stats === 'string') {
          try {
            playerStats = JSON.parse(player.stats) as PlayerGameStats;
          } catch (e) {
            console.error('Error parsing player stats:', e);
            playerStats = this.createDefaultStats();
          }
        } else {
          // Assume it's already in the right format
          playerStats = player.stats as unknown as PlayerGameStats;
        }
      } else {
        playerStats = this.createDefaultStats();
      }
        
      return {
        ...player,
        position: index + 1,
        score: this.settings.startingScore,
        isActive: index === 0,
        isWinner: false,
        history: [],
        currentTurn: [],
        originalScore: this.settings.startingScore,
        dartsThrown: 0,
        legsWon: 0,
        stats: playerStats
      };
    });
  }

  // Helper method to create default stats
  private createDefaultStats(): PlayerGameStats {
    return {
      avgScore: 0,
      highScore: 0,
      checkouts: 0,
      checkoutPercentage: 0,
      highCheckout: 0,
      dartsPerLeg: 0
    };
  }

  // Fix database property access issues by using proper queries
  private async loadSettingsFromDB(): Promise<void> {
    if (!this.db) {
      console.error('Cannot load settings: Database is not initialized');
      return;
    }
    
    try {
      // Instead of direct database property access, use proper queries
      const getSettings = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          this.db?.get("SELECT * FROM settings LIMIT 1", (err, row) => {
            if (err) return reject(err);
            resolve(row || {});
          });
        });
      };
      
      const getScores = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          this.db?.get("SELECT * FROM defaultScores LIMIT 1", (err, row) => {
            if (err) return reject(err);
            resolve(row || {});
          });
        });
      };
      
      const settings = await getSettings();
      const scores = await getScores();
      
      // Process settings and scores here
      
      // If you need to map/forEach over collections, you should query them first
      const getGameModes = (): Promise<any[]> => {
        return new Promise((resolve, reject) => {
          this.db?.all("SELECT * FROM gameModes", (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
          });
        });
      };
      
      const gameModes = await getGameModes();
      gameModes.forEach(mode => {
        // Process mode
      });
      
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }
}

export default MatchManager; 