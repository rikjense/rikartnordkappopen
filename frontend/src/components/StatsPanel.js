import React from 'react';
import styles from '../styles/Components.module.css';

const StatsPanel = ({ stats = {} }) => {
  return (
    <div className={styles.statsPanel}>
      <h3 className={styles.statsTitle}>Player Statistics</h3>
      
      <div className={styles.statsGrid}>
        <div className={styles.statItem}>
          <div className={styles.statLabel}>3-Dart Avg</div>
          <div className={styles.statValue}>{stats.avgScore ? stats.avgScore.toFixed(1) : '0.0'}</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statLabel}>First 9 Avg</div>
          <div className={styles.statValue}>{stats.first9Avg ? stats.first9Avg.toFixed(1) : '0.0'}</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statLabel}>Checkout %</div>
          <div className={styles.statValue}>{stats.checkoutPercentage ? stats.checkoutPercentage.toFixed(1) : '0.0'}%</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statLabel}>Darts/Leg</div>
          <div className={styles.statValue}>{stats.dartsPerLeg || '0'}</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statLabel}>High Score</div>
          <div className={styles.statValue}>{stats.highScore || '0'}</div>
        </div>
        
        <div className={styles.statItem}>
          <div className={styles.statLabel}>High Checkout</div>
          <div className={styles.statValue}>{stats.highCheckout || '0'}</div>
        </div>
      </div>
    </div>
  );
};

export default StatsPanel; 