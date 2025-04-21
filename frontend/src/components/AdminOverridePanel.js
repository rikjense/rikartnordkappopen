import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import styles from '../styles/AdminOverride.module.css';

const AdminOverridePanel = ({ matchId, players, onUpdate }) => {
  const { isConnected } = useSocket();
  const [activeTab, setActiveTab] = useState('score');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(players && players.length > 0 ? players[0].id : '');
  const [newScore, setNewScore] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState(null);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [selectedThrowId, setSelectedThrowId] = useState('');

  // Reset status messages after 3 seconds
  const resetStatus = () => {
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 3000);
  };

  // Handle score override
  const handleScoreOverride = async () => {
    if (!selectedPlayerId || !newScore) {
      setError('Please select a player and enter a new score');
      resetStatus();
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/override/match/${matchId}/score`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId: selectedPlayerId,
          newScore: parseInt(newScore),
          adminId: 'admin' // You can replace with actual admin ID if available
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update score');
      }
      
      setSuccess('Score updated successfully');
      setNewScore('');
      
      if (onUpdate) {
        onUpdate(data.match);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      resetStatus();
    }
  };

  // Handle throw removal
  const handleThrowRemoval = async () => {
    if (!selectedThrowId) {
      setError('Please select a throw to remove');
      resetStatus();
      return;
    }

    // Set up confirmation
    setConfirmationMessage('Are you sure you want to remove this throw? This action cannot be undone.');
    setConfirmationAction(() => executeThrowRemoval);
    setShowConfirmation(true);
  };

  // Execute throw removal after confirmation
  const executeThrowRemoval = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/override/match/${matchId}/throw/${selectedThrowId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminId: 'admin' // You can replace with actual admin ID if available
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove throw');
      }
      
      setSuccess('Throw removed successfully');
      setSelectedThrowId('');
      
      if (onUpdate) {
        onUpdate(data.match);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setShowConfirmation(false);
      resetStatus();
    }
  };

  // Handle leg result override
  const handleLegOverride = async () => {
    if (!selectedPlayerId) {
      setError('Please select a player to win the leg');
      resetStatus();
      return;
    }

    // Set up confirmation
    setConfirmationMessage('Are you sure you want to force the current leg to end with this player as the winner?');
    setConfirmationAction(() => executeLegOverride);
    setShowConfirmation(true);
  };

  // Execute leg override after confirmation
  const executeLegOverride = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/override/match/${matchId}/leg`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          winnerId: selectedPlayerId,
          adminId: 'admin' // You can replace with actual admin ID if available
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to force leg result');
      }
      
      setSuccess('Leg result forced successfully');
      
      if (onUpdate) {
        onUpdate(data.match);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setShowConfirmation(false);
      resetStatus();
    }
  };

  // Handle player turn override
  const handlePlayerSwitch = async () => {
    if (!selectedPlayerId) {
      setError('Please select a player to switch to');
      resetStatus();
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/override/match/${matchId}/player`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerId: selectedPlayerId,
          adminId: 'admin' // You can replace with actual admin ID if available
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to switch player');
      }
      
      setSuccess('Player switched successfully');
      
      if (onUpdate) {
        onUpdate(data.match);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      resetStatus();
    }
  };

  // Cancel confirmation
  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setConfirmationAction(null);
    setConfirmationMessage('');
  };

  // Get player throws for the removal dropdown
  const getPlayerThrows = () => {
    const playerThrows = [];
    
    players.forEach(player => {
      if (player.history && player.history.length > 0) {
        player.history.forEach(throwData => {
          playerThrows.push({
            id: throwData.id,
            playerId: player.id,
            playerName: player.name,
            score: throwData.score,
            segment: throwData.segment,
            round: throwData.round
          });
        });
      }
    });
    
    // Sort by newest first
    return playerThrows.sort((a, b) => b.round - a.round);
  };

  return (
    <div className={styles.adminOverridePanel}>
      <h2 className={styles.panelTitle}>Match Override Controls</h2>
      
      {!isConnected && (
        <div className={styles.connectionWarning}>
          Not connected to server. Overrides may not update in real-time.
        </div>
      )}
      
      {/* Status messages */}
      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}
      
      {/* Tabs */}
      <div className={styles.tabs}>
        <button 
          className={`${styles.tabButton} ${activeTab === 'score' ? styles.active : ''}`}
          onClick={() => setActiveTab('score')}
        >
          Edit Score
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'throw' ? styles.active : ''}`}
          onClick={() => setActiveTab('throw')}
        >
          Remove Throw
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'leg' ? styles.active : ''}`}
          onClick={() => setActiveTab('leg')}
        >
          Force Leg Result
        </button>
        <button 
          className={`${styles.tabButton} ${activeTab === 'player' ? styles.active : ''}`}
          onClick={() => setActiveTab('player')}
        >
          Switch Player
        </button>
      </div>
      
      {/* Tab content */}
      <div className={styles.tabContent}>
        {/* Score override */}
        {activeTab === 'score' && (
          <div className={styles.tabPanel}>
            <div className={styles.formGroup}>
              <label>Select Player:</label>
              <select 
                value={selectedPlayerId} 
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                disabled={loading}
              >
                {players.map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name} (Current: {player.score})
                  </option>
                ))}
              </select>
            </div>
            
            <div className={styles.formGroup}>
              <label>New Score:</label>
              <input 
                type="number"
                min="0"
                max="501"
                value={newScore}
                onChange={(e) => setNewScore(e.target.value)}
                disabled={loading}
              />
            </div>
            
            <button 
              className={styles.actionButton}
              onClick={handleScoreOverride}
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Score'}
            </button>
          </div>
        )}
        
        {/* Throw removal */}
        {activeTab === 'throw' && (
          <div className={styles.tabPanel}>
            <div className={styles.formGroup}>
              <label>Select Throw to Remove:</label>
              <select 
                value={selectedThrowId} 
                onChange={(e) => setSelectedThrowId(e.target.value)}
                disabled={loading}
              >
                <option value="">-- Select a throw --</option>
                {getPlayerThrows().map(throwData => (
                  <option key={throwData.id} value={throwData.id}>
                    {throwData.playerName}: {throwData.score} ({throwData.segment}) - Round {throwData.round}
                  </option>
                ))}
              </select>
            </div>
            
            <button 
              className={`${styles.actionButton} ${styles.dangerButton}`}
              onClick={handleThrowRemoval}
              disabled={loading || !selectedThrowId}
            >
              {loading ? 'Removing...' : 'Remove Throw'}
            </button>
          </div>
        )}
        
        {/* Leg result override */}
        {activeTab === 'leg' && (
          <div className={styles.tabPanel}>
            <div className={styles.formGroup}>
              <label>Select Leg Winner:</label>
              <select 
                value={selectedPlayerId} 
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                disabled={loading}
              >
                {players.map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            
            <button 
              className={`${styles.actionButton} ${styles.dangerButton}`}
              onClick={handleLegOverride}
              disabled={loading}
            >
              {loading ? 'Forcing...' : 'Force Leg Result'}
            </button>
          </div>
        )}
        
        {/* Player switch */}
        {activeTab === 'player' && (
          <div className={styles.tabPanel}>
            <div className={styles.formGroup}>
              <label>Select Active Player:</label>
              <select 
                value={selectedPlayerId} 
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                disabled={loading}
              >
                {players.map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name} {player.isActive ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <button 
              className={styles.actionButton}
              onClick={handlePlayerSwitch}
              disabled={loading}
            >
              {loading ? 'Switching...' : 'Switch Player'}
            </button>
          </div>
        )}
      </div>
      
      {/* Confirmation dialog */}
      {showConfirmation && (
        <div className={styles.confirmationOverlay}>
          <div className={styles.confirmationDialog}>
            <h3>Confirm Action</h3>
            <p>{confirmationMessage}</p>
            <div className={styles.confirmationButtons}>
              <button 
                className={styles.cancelButton}
                onClick={handleCancelConfirmation}
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                className={`${styles.confirmButton} ${styles.dangerButton}`}
                onClick={confirmationAction}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOverridePanel; 