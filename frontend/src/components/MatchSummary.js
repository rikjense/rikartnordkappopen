import React, { useState, useEffect } from 'react';
import styles from '../styles/MatchSummary.module.css';

const MatchSummary = ({ matchId }) => {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (matchId) {
      fetchMatchSummary();
    }
  }, [matchId]);

  const fetchMatchSummary = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/games/${matchId}/summary`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch match summary');
      }
      
      const data = await response.json();
      setSummaries(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshSummary = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/games/${matchId}/summary`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh match summary');
      }
      
      const data = await response.json();
      setSummaries(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDecimal = (value) => {
    return Number(value).toFixed(2);
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        Loading match summary...
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        Error: {error}
        <button onClick={fetchMatchSummary} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div className={styles.empty}>
        No match summary available.
        <button onClick={refreshSummary} className={styles.refreshButton}>
          Generate Summary
        </button>
      </div>
    );
  }

  return (
    <div className={styles.matchSummary}>
      <div className={styles.header}>
        <h2 className={styles.title}>Match Summary</h2>
        <button 
          onClick={refreshSummary} 
          className={styles.refreshButton}
          title="Regenerate match statistics"
        >
          ↻ Refresh
        </button>
      </div>
      
      <div className={styles.tabs}>
        <button 
          className={`${styles.tabButton} ${activeTab === 'overview' ? styles.active : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'detailed' ? styles.active : ''}`}
          onClick={() => setActiveTab('detailed')}
        >
          Detailed Stats
        </button>
      </div>
      
      {activeTab === 'overview' && (
        <div className={styles.overviewTab}>
          <div className={styles.playersGrid}>
            {summaries.map(player => (
              <div key={player.playerId} className={styles.playerCard}>
                <div className={styles.playerHeader}>
                  <h3 className={styles.playerName}>{player.playerName}</h3>
                  <div className={styles.playerResult}>
                    {player.legsWon}/{player.legsPlayed} legs
                  </div>
                </div>
                
                <div className={styles.statRow}>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>Average</div>
                    <div className={styles.statValue}>{formatDecimal(player.average)}</div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>Checkout %</div>
                    <div className={styles.statValue}>{formatDecimal(player.checkoutPercentage)}%</div>
                  </div>
                </div>
                
                <div className={styles.statRow}>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>Highest Checkout</div>
                    <div className={styles.statValue}>{player.highestCheckout}</div>
                  </div>
                  <div className={styles.statItem}>
                    <div className={styles.statLabel}>Darts/Leg</div>
                    <div className={styles.statValue}>{formatDecimal(player.dartsPerLeg)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {activeTab === 'detailed' && (
        <div className={styles.detailedTab}>
          <table className={styles.statsTable}>
            <thead>
              <tr>
                <th>Stat</th>
                {summaries.map(player => (
                  <th key={player.playerId}>{player.playerName}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Legs Won</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.legsWon}</td>
                ))}
              </tr>
              <tr>
                <td>Three-Dart Average</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{formatDecimal(player.average)}</td>
                ))}
              </tr>
              <tr>
                <td>First 9 Average</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{formatDecimal(player.firstNineAverage)}</td>
                ))}
              </tr>
              <tr>
                <td>Checkout %</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{formatDecimal(player.checkoutPercentage)}%</td>
                ))}
              </tr>
              <tr>
                <td>Checkout Attempts</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.checkoutAttempts}</td>
                ))}
              </tr>
              <tr>
                <td>Checkouts Completed</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.checkoutSuccesses}</td>
                ))}
              </tr>
              <tr>
                <td>Highest Checkout</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.highestCheckout}</td>
                ))}
              </tr>
              <tr>
                <td>100+</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.tonPlus}</td>
                ))}
              </tr>
              <tr>
                <td>140+</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.tonFortyPlus}</td>
                ))}
              </tr>
              <tr>
                <td>180s</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.tonEighty}</td>
                ))}
              </tr>
              <tr>
                <td>Total Darts</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{player.totalDarts}</td>
                ))}
              </tr>
              <tr>
                <td>Darts per Leg</td>
                {summaries.map(player => (
                  <td key={player.playerId}>{formatDecimal(player.dartsPerLeg)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MatchSummary; 