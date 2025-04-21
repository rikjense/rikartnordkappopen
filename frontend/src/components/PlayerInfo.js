import React from 'react';
import styles from '../styles/Components.module.css';

const PlayerInfo = ({ player, isActive }) => {
  if (!player) return null;
  
  return (
    <div className={`${styles.playerInfo} ${isActive ? styles.activePlayer : ''}`}>
      <div className={styles.playerHeader}>
        <h3 className={styles.playerName}>{player.name}</h3>
        {player.nickname && <span className={styles.playerNickname}>{player.nickname}</span>}
      </div>
      
      <div className={styles.scoreContainer}>
        <div className={styles.score}>{player.score}</div>
        <div className={styles.legsWon}>
          <span className={styles.legsLabel}>Legs:</span>
          <span className={styles.legsValue}>{player.legsWon || 0}</span>
        </div>
      </div>
      
      {player.isWinner && <div className={styles.winnerBadge}>Winner</div>}
    </div>
  );
};

export default PlayerInfo; 