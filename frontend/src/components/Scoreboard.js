import React from 'react';
import PlayerInfo from './PlayerInfo';
import DartThrows from './DartThrows';
import StatsPanel from './StatsPanel';
import CheckoutSuggestion from './CheckoutSuggestion';
import styles from '../styles/Components.module.css';

const Scoreboard = ({ match, minimal = false }) => {
  if (!match) return <div className={styles.loadingContainer}>Loading match data...</div>;

  const activePlayer = match.players.find(p => p.isActive);
  const dartsRemaining = activePlayer && activePlayer.currentTurn 
    ? 3 - activePlayer.currentTurn.length 
    : 3;

  return (
    <div className={styles.scoreboardContainer}>
      <div className={styles.scoreboardHeader}>
        <h2 className={styles.matchTitle}>{`${match.mode} Match - Legs: ${match.legsToWin}`}</h2>
        <div className={styles.matchState}>{match.state}</div>
      </div>
      
      <div className={styles.playersGrid}>
        {match.players.map(player => (
          <div key={player.id} className={styles.playerColumn}>
            <PlayerInfo 
              player={player} 
              isActive={player.id === (activePlayer?.id || null)} 
            />
            
            {!minimal && (
              <>
                <DartThrows throws={[...player.history, ...player.currentTurn]} />
                
                {player.isActive && (
                  <CheckoutSuggestion 
                    score={player.score} 
                    dartsRemaining={dartsRemaining}
                    showSuggestions={match.settings?.checkoutSuggestions}
                  />
                )}
                
                <StatsPanel stats={player.stats} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Scoreboard; 