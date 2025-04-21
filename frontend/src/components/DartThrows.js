import React from 'react';
import styles from '../styles/Components.module.css';

const DartThrows = ({ throws = [], highlight = true }) => {
  // Ensure we only display the last 3 throws
  const displayThrows = throws.slice(-3);
  
  // Pad the array with empty throws if less than 3
  while (displayThrows.length < 3) {
    displayThrows.unshift({ segment: '', score: '' });
  }

  return (
    <div className={styles.dartThrowsContainer}>
      <div className={styles.throwsHeader}>
        <span>Dart 1</span>
        <span>Dart 2</span>
        <span>Dart 3</span>
      </div>
      
      <div className={styles.throwValues}>
        {displayThrows.map((dartThrow, index) => (
          <div 
            key={index} 
            className={`${styles.throwValue} ${
              highlight && index === displayThrows.length - 1 ? styles.highlightedThrow : ''
            }`}
          >
            <div className={styles.throwScore}>{dartThrow.score}</div>
            <div className={styles.throwSegment}>{dartThrow.segment}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DartThrows; 