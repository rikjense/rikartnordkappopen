import { EventEmitter } from 'events';
import { ThrowData, ScoliaPlayer } from './types/scolia';
import { MatchModel } from './types/models';
import dbService from './database/db';

/**
 * GameState manages the state of an active game on a dart board
 */
export class GameState extends EventEmitter {
  private matchId: number | null = null;
  private boardId: number;
  private mode: string = '501';
  private state: string = 'pending';
  private players: ScoliaPlayer[] = [];
  private activePlayerIndex: number = 0;
  private scores: number[] = [];
  private rounds: number = 0;
  private currentRound: number = 0;
  private throwHistory: ThrowData[] = [];
  private settings: any = {};
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private winnerId: number | null = null;

  constructor(boardId: number) {
    super();
    this.boardId = boardId;
  }

  /**
   * Initialize a new game
   */
  public async initializeGame(
    matchId: number, 
    mode: string, 
    players: {id: number, name: string, position: number}[],
    settings: any = {}
  ): Promise<void> {
    this.matchId = matchId;
    this.mode = mode;
    this.state = 'pending';
    this.settings = settings;
    this.throwHistory = [];
    this.rounds = settings.maxRounds || 20;
    this.currentRound = 0;
    this.startTime = null;
    this.endTime = null;
    this.winnerId = null;
    
    // Set up players
    this.players = players.map(player => ({
      position: player.position,
      name: player.name,
      id: player.id,
      score: this.getInitialScore(mode),
      isActive: false,
      isWinner: false
    }));
    
    // Sort players by position
    this.players.sort((a, b) => a.position - b.position);
    
    // Set initial scores
    this.scores = this.players.map(() => this.getInitialScore(mode));
    
    // Set active player to the first player
    this.activePlayerIndex = 0;
    this.players[this.activePlayerIndex].isActive = true;
    
    await this.saveGameState();
  }

  /**
   * Start a game
   */
  public async startGame(): Promise<void> {
    if (this.state !== 'pending' && this.state !== 'warmup') {
      throw new Error(`Cannot start game in state: ${this.state}`);
    }
    
    this.state = 'active';
    this.startTime = new Date();
    
    await this.saveGameState();
    this.emit('gameStateChanged', this.getGameState());
  }

  /**
   * End a game
   */
  public async endGame(winnerId?: number): Promise<void> {
    if (this.state !== 'active') {
      throw new Error(`Cannot end game in state: ${this.state}`);
    }
    
    this.state = 'completed';
    this.endTime = new Date();
    
    if (winnerId) {
      this.winnerId = winnerId;
      const winnerPlayer = this.players.find(p => p.id === winnerId);
      if (winnerPlayer) {
        winnerPlayer.isWinner = true;
      }
    }
    
    await this.saveGameState();
    this.emit('gameStateChanged', this.getGameState());
  }

  /**
   * Process a new throw
   */
  public async processThrow(throwData: ThrowData): Promise<void> {
    if (this.state !== 'active') {
      throw new Error(`Cannot process throw in state: ${this.state}`);
    }
    
    const { playerId, segment, score } = throwData;
    
    // Find player
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error(`Player with id ${playerId} not found in game`);
    }
    
    // Update score based on game mode
    if (this.mode === '301' || this.mode === '501' || this.mode === '701') {
      this.processStraightOutThrow(playerIndex, score);
    } else if (this.mode === 'cricket') {
      this.processCricketThrow(playerIndex, segment, score);
    }
    
    // Add to throw history
    this.throwHistory.push(throwData);
    
    // Save throw to database
    await this.saveThrow(throwData);
    
    // Check if this is the third throw of the current player's turn
    if (this.throwHistory.filter(t => 
      t.playerId === playerId && 
      t.round === throwData.round
    ).length === 3) {
      await this.switchToNextPlayer();
    }
    
    // Check for winner
    await this.checkForWinner();
    
    // Emit game state changed
    this.emit('gameStateChanged', this.getGameState());
  }

  /**
   * Process a throw for straight out games (301, 501, 701)
   */
  private processStraightOutThrow(playerIndex: number, score: number): void {
    const player = this.players[playerIndex];
    const newScore = player.score - score;
    
    // Check for bust (score < 0 or score = 1 with double out)
    if (newScore < 0 || (newScore === 1 && this.settings.doubleOut)) {
      // Bust - no score change
      return;
    }
    
    // Valid score, update player
    player.score = newScore;
    this.scores[playerIndex] = newScore;
  }

  /**
   * Process a throw for cricket games
   */
  private processCricketThrow(playerIndex: number, segment: string, score: number): void {
    // Cricket logic would go here
    // This is a simplified placeholder
    this.scores[playerIndex] += score;
    this.players[playerIndex].score = this.scores[playerIndex];
  }

  /**
   * Switch to the next player
   */
  public async switchToNextPlayer(): Promise<void> {
    // Set current player as inactive
    this.players[this.activePlayerIndex].isActive = false;
    
    // Move to next player
    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    
    // If we've gone through all players, increment the round
    if (this.activePlayerIndex === 0) {
      this.currentRound++;
      
      // Check if we reached max rounds
      if (this.currentRound > this.rounds) {
        await this.endGame();
        return;
      }
    }
    
    // Set new active player
    this.players[this.activePlayerIndex].isActive = true;
    
    await this.saveGameState();
    this.emit('gameStateChanged', this.getGameState());
  }

  /**
   * Check if there's a winner
   */
  private async checkForWinner(): Promise<void> {
    // For 301, 501, 701 - winner is the first to reach 0
    if (this.mode === '301' || this.mode === '501' || this.mode === '701') {
      const winnerIndex = this.scores.findIndex(score => score === 0);
      if (winnerIndex !== -1) {
        const winner = this.players[winnerIndex];
        winner.isWinner = true;
        this.winnerId = winner.id;
        await this.endGame(winner.id);
      }
    }
    // For cricket, winner is determined by specific cricket rules
    else if (this.mode === 'cricket') {
      // Cricket winning logic would go here
    }
  }

  /**
   * Correct a throw (manual correction)
   */
  public async correctThrow(throwId: number, newScore: number): Promise<void> {
    // Find the throw in history
    const throwIndex = this.throwHistory.findIndex(t => t.id === throwId);
    if (throwIndex === -1) {
      throw new Error(`Throw with id ${throwId} not found`);
    }
    
    const throwData = this.throwHistory[throwIndex];
    const oldScore = throwData.score;
    const playerId = throwData.playerId;
    
    // Update throw data
    throwData.score = newScore;
    throwData.is_corrected = true;
    
    // Find player
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error(`Player with id ${playerId} not found in game`);
    }
    
    // Update score based on game mode
    if (this.mode === '301' || this.mode === '501' || this.mode === '701') {
      // Add back the old score and subtract the new score
      const currentScore = this.players[playerIndex].score;
      const updatedScore = currentScore + oldScore - newScore;
      
      this.players[playerIndex].score = updatedScore;
      this.scores[playerIndex] = updatedScore;
    } else if (this.mode === 'cricket') {
      // Cricket correction logic would go here
    }
    
    // Update throw in database
    await this.updateThrow(throwData);
    
    // Check for winner
    await this.checkForWinner();
    
    // Emit game state changed
    this.emit('gameStateChanged', this.getGameState());
  }
  
  /**
   * Get the game state
   */
  public getGameState(): any {
    return {
      matchId: this.matchId,
      boardId: this.boardId,
      mode: this.mode,
      state: this.state,
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
      scores: this.scores,
      currentRound: this.currentRound,
      maxRounds: this.rounds,
      settings: this.settings,
      startTime: this.startTime,
      endTime: this.endTime,
      winnerId: this.winnerId
    };
  }

  /**
   * Get the initial score based on game mode
   */
  private getInitialScore(mode: string): number {
    switch (mode) {
      case '301': return 301;
      case '501': return 501;
      case '701': return 701;
      case 'cricket': return 0;
      default: return 501;
    }
  }

  /**
   * Save the current game state to the database
   */
  private async saveGameState(): Promise<void> {
    if (!this.matchId) return;
    
    const db = await dbService.getDb();
    
    // Update match record
    await db.run(
      `UPDATE matches 
       SET state = ?, 
           scores = ?, 
           start_time = ?, 
           end_time = ?, 
           winner_id = ? 
       WHERE id = ?`,
      [
        this.state,
        JSON.stringify(this.scores),
        this.startTime ? this.startTime.toISOString() : null,
        this.endTime ? this.endTime.toISOString() : null,
        this.winnerId,
        this.matchId
      ]
    );
    
    // Update match players
    for (const player of this.players) {
      await db.run(
        `UPDATE match_players 
         SET current_score = ?, 
             is_winner = ? 
         WHERE match_id = ? AND player_id = ?`,
        [
          player.score,
          player.isWinner ? 1 : 0,
          this.matchId,
          player.id
        ]
      );
    }
  }

  /**
   * Save a throw to the database
   */
  private async saveThrow(throwData: ThrowData): Promise<void> {
    if (!this.matchId) return;
    
    const db = await dbService.getDb();
    
    const result = await db.run(
      `INSERT INTO throws 
       (match_id, player_id, round, position, segment, score, is_corrected) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        this.matchId,
        throwData.playerId,
        throwData.round,
        throwData.throwIndex,
        throwData.segment,
        throwData.score,
        throwData.is_corrected ? 1 : 0
      ]
    );
    
    // Set ID from inserted row
    throwData.id = result.lastID;
  }

  /**
   * Update a throw in the database
   */
  private async updateThrow(throwData: ThrowData): Promise<void> {
    if (!this.matchId || !throwData.id) return;
    
    const db = await dbService.getDb();
    
    await db.run(
      `UPDATE throws 
       SET segment = ?, 
           score = ?, 
           is_corrected = 1 
       WHERE id = ?`,
      [
        throwData.segment,
        throwData.score,
        throwData.id
      ]
    );
  }

  /**
   * Load a game from the database
   */
  public async loadGame(matchId: number): Promise<void> {
    const db = await dbService.getDb();
    
    // Get match data
    const match = await db.get<MatchModel>(
      `SELECT * FROM matches WHERE id = ?`,
      [matchId]
    );
    
    if (!match) {
      throw new Error(`Match with id ${matchId} not found`);
    }
    
    this.matchId = match.id;
    this.boardId = match.board_id;
    this.mode = match.mode;
    this.state = match.state;
    this.settings = match.settings ? JSON.parse(match.settings) : {};
    this.scores = match.scores ? JSON.parse(match.scores) : [];
    this.startTime = match.start_time ? new Date(match.start_time) : null;
    this.endTime = match.end_time ? new Date(match.end_time) : null;
    this.winnerId = match.winner_id;
    
    // Get match players
    const players = await db.all(
      `SELECT mp.*, p.name 
       FROM match_players mp 
       JOIN players p ON mp.player_id = p.id 
       WHERE mp.match_id = ? 
       ORDER BY mp.position`,
      [matchId]
    );
    
    this.players = players.map(player => ({
      position: player.position,
      name: player.name,
      id: player.player_id,
      score: player.current_score,
      isActive: false,
      isWinner: player.is_winner === 1
    }));
    
    // Find active player
    let activePlayerFound = false;
    if (this.state === 'active') {
      // Get the latest throw to determine active player
      const latestThrow = await db.get(
        `SELECT * FROM throws 
         WHERE match_id = ? 
         ORDER BY timestamp DESC LIMIT 1`,
        [matchId]
      );
      
      if (latestThrow) {
        // Find the next player after the one who made the last throw
        const lastPlayerIndex = this.players.findIndex(p => p.id === latestThrow.player_id);
        if (lastPlayerIndex !== -1) {
          // Check if this was the third throw of the player's turn
          const throwsInTurn = await db.all(
            `SELECT * FROM throws 
             WHERE match_id = ? AND player_id = ? AND round = ?`,
            [matchId, latestThrow.player_id, latestThrow.round]
          );
          
          if (throwsInTurn.length === 3) {
            // Move to next player
            this.activePlayerIndex = (lastPlayerIndex + 1) % this.players.length;
          } else {
            // Still same player's turn
            this.activePlayerIndex = lastPlayerIndex;
          }
          
          this.players[this.activePlayerIndex].isActive = true;
          activePlayerFound = true;
        }
      }
    }
    
    // If no active player was found and the game is active, set the first player as active
    if (!activePlayerFound && this.state === 'active') {
      this.activePlayerIndex = 0;
      this.players[0].isActive = true;
    }
    
    // Load throw history
    const throws = await db.all(
      `SELECT * FROM throws 
       WHERE match_id = ? 
       ORDER BY round, player_id, position`,
      [matchId]
    );
    
    this.throwHistory = throws.map(t => ({
      id: t.id,
      matchId: t.match_id,
      playerId: t.player_id,
      round: t.round,
      throwIndex: t.position,
      segment: t.segment,
      score: t.score,
      is_corrected: t.is_corrected === 1,
      timestamp: new Date(t.timestamp)
    }));
    
    // Determine current round
    if (this.throwHistory.length > 0) {
      this.currentRound = Math.max(...this.throwHistory.map(t => t.round));
    } else {
      this.currentRound = 1;
    }
  }
}

export default GameState; 