import React from 'react';
import Link from 'next/link';
import Scoreboard from './Scoreboard';
import styles from '../styles/Components.module.css';

const OverviewGrid = ({ boards, matches }) => {
  return (
    <div className={styles.overviewGrid}>
      {boards.map(board => {
        const boardMatch = matches.find(match => match.boardId === board.id && 
                                              match.state !== 'completed' && 
                                              match.state !== 'finished');
        
        return (
          <div key={board.id} className={styles.boardCard}>
            <div className={styles.boardHeader}>
              <h3 className={styles.boardName}>{board.name}</h3>
              <div className={`${styles.boardStatus} ${styles[board.status]}`}>
                {board.status}
              </div>
            </div>
            
            {boardMatch ? (
              <>
                <Scoreboard match={boardMatch} minimal={true} />
                <div className={styles.boardActions}>
                  <Link href={`/game?boardId=${board.id}&matchId=${boardMatch.id}`} className={styles.viewButton}>
                    View Match
                  </Link>
                </div>
              </>
            ) : (
              <div className={styles.noMatch}>
                <p>No active match</p>
                {board.status === 'online' && (
                  <Link href={`/game?boardId=${board.id}`} className={styles.startButton}>
                    Start Match
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default OverviewGrid; 