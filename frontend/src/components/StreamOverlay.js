import React from 'react';
import styles from '../styles/Stream.module.css';

const StreamOverlay = ({ matches, minimal = true }) => {
  return (
    <div className={styles.streamContainer}>
      <div className={styles.streamGrid}>
        {matches.map(match => (
          <div key={match.id} className={styles.streamBoard}>
            <div className={styles.streamHeader}>
              <h3 className={styles.streamTitle}>Board {match.boardId}</h3>
              <div className={styles.streamMode}>{match.mode}</div>
            </div>
            
            <div className={styles.streamPlayers}>
              {match.players.map(player => (
                <div 
                  key={player.id} 
                  className={`${styles.streamPlayer} ${player.isActive ? styles.streamActive : ''}`}
                >
                  <div className={styles.streamPlayerHeader}>
                    <div className={styles.streamPlayerName}>{player.name}</div>
                    <div className={styles.streamLegsWon}>
                      Legs: {player.legsWon || 0}/{match.legsToWin}
                    </div>
                  </div>
                  
                  <div className={styles.streamScore}>{player.score}</div>
                  
                  <div className={styles.streamStats}>
                    <div className={styles.streamStat}>
                      <span className={styles.streamStatLabel}>AVG</span>
                      <span className={styles.streamStatValue}>
                        {player.stats?.avgScore ? player.stats.avgScore.toFixed(1) : '0.0'}
                      </span>
                    </div>
                    
                    <div className={styles.streamStat}>
                      <span className={styles.streamStatLabel}>CO%</span>
                      <span className={styles.streamStatValue}>
                        {player.stats?.checkoutPercentage ? player.stats.checkoutPercentage.toFixed(0) : '0'}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StreamOverlay; 