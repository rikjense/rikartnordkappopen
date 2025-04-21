import React, { useState, useEffect } from 'react';
import styles from '../styles/Components.module.css';
import MatchSummary from './MatchSummary';

const HistoricalSummaries = () => {
  const [recentMatches, setRecentMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [expandedMatch, setExpandedMatch] = useState(null);

  useEffect(() => {
    fetchRecentMatches();
  }, []);

  const fetchRecentMatches = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/games?state=completed&limit=20');
      
      if (!response.ok) {
        throw new Error('Failed to fetch recent matches');
      }
      
      const data = await response.json();
      setRecentMatches(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching recent matches:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowSummary = (matchId) => {
    setSelectedMatch(matchId);
  };

  const handleToggleDetails = (matchId) => {
    setExpandedMatch(expandedMatch === matchId ? null : matchId);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        Loading match history...
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <p>Error: {error}</p>
        <button onClick={fetchRecentMatches} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.historicalSummaries}>
      <h2 className={styles.sectionTitle}>Match History</h2>
      
      {recentMatches.length === 0 ? (
        <p className={styles.emptyState}>No completed matches found.</p>
      ) : (
        <div className={styles.matchList}>
          {recentMatches.map(match => (
            <div key={match.id} className={styles.matchItem}>
              <div className={styles.matchHeader} onClick={() => handleToggleDetails(match.id)}>
                <div className={styles.matchInfo}>
                  <h3 className={styles.matchTitle}>
                    {match.players.map(p => p.name).join(' vs ')}
                  </h3>
                  <span className={styles.matchDate}>{formatDate(match.created_at)}</span>
                </div>
                <div className={styles.matchScore}>
                  {match.players.map(player => (
                    <span key={player.id} className={styles.playerScore}>
                      {player.is_winner && '🏆 '}
                      {player.legs_won || 0}
                    </span>
                  )).reduce((prev, curr) => [prev, ' - ', curr])}
                </div>
                <button 
                  className={styles.detailsToggle}
                  aria-label={expandedMatch === match.id ? "Hide details" : "Show details"}
                >
                  {expandedMatch === match.id ? '▲' : '▼'}
                </button>
              </div>
              
              {expandedMatch === match.id && (
                <div className={styles.matchDetails}>
                  <div className={styles.detailsSection}>
                    <span className={styles.detailLabel}>Game Mode:</span>
                    <span className={styles.detailValue}>{match.mode}</span>
                  </div>
                  <div className={styles.detailsSection}>
                    <span className={styles.detailLabel}>Board:</span>
                    <span className={styles.detailValue}>{match.board_name}</span>
                  </div>
                  <div className={styles.detailsSection}>
                    <span className={styles.detailLabel}>Duration:</span>
                    <span className={styles.detailValue}>
                      {match.end_time && match.created_at ? 
                        Math.round((new Date(match.end_time) - new Date(match.created_at)) / 60000) + ' minutes' : 
                        'Unknown'}
                    </span>
                  </div>
                  
                  {!selectedMatch || selectedMatch !== match.id ? (
                    <button 
                      onClick={() => handleShowSummary(match.id)} 
                      className={styles.viewSummaryButton}
                    >
                      View Detailed Statistics
                    </button>
                  ) : (
                    <div className={styles.summaryContainer}>
                      <MatchSummary matchId={match.id} />
                      <button 
                        onClick={() => setSelectedMatch(null)} 
                        className={styles.hideSummaryButton}
                      >
                        Hide Statistics
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <div className={styles.actionBar}>
        <button onClick={fetchRecentMatches} className={styles.refreshButton}>
          ↻ Refresh Match History
        </button>
      </div>
    </div>
  );
};

export default HistoricalSummaries; 