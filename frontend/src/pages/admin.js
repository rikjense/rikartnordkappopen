import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSocket } from '../context/SocketContext';
import SocketConnectionStatus from '../components/SocketConnectionStatus';
import styles from '../styles/Admin.module.css';
import HistoricalSummaries from '../components/HistoricalSummaries';

// Tabs for different admin sections
const AdminTabs = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'boards', label: 'Dart Boards' },
    { id: 'settings', label: 'Configuration' },
    { id: 'history', label: 'Match History' },
    { id: 'players', label: 'Players' }
  ];
  
  return (
    <div className={styles.tabsContainer}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`${styles.tabButton} ${activeTab === tab.id ? styles.activeTab : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

// Component for adding a new board
const AddBoardForm = ({ onBoardAdded }) => {
  const [name, setName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!name || !serialNumber || !accessToken) {
      setError('All fields are required');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          serial_number: serialNumber,
          access_token: accessToken
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to add board');
      }
      
      // Reset form
      setName('');
      setSerialNumber('');
      setAccessToken('');
      
      // Notify parent
      if (onBoardAdded) {
        onBoardAdded(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.formContainer}>
      <h2>Add New Dart Board</h2>
      {error && <div className={styles.error}>{error}</div>}
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="boardName">Board Name:</label>
          <input
            id="boardName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Dart Board"
            disabled={isLoading}
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="serialNumber">Serial Number:</label>
          <input
            id="serialNumber"
            type="text"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Board serial number"
            disabled={isLoading}
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="accessToken">Access Token:</label>
          <input
            id="accessToken"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Board access token"
            disabled={isLoading}
          />
        </div>
        <button 
          type="submit" 
          className={styles.submitButton}
          disabled={isLoading}
        >
          {isLoading ? 'Adding...' : 'Add Board'}
        </button>
      </form>
    </div>
  );
};

// Component for board list and management
const BoardsManagement = ({ boards, onBoardConnected, onBoardDisconnected, onBoardDeleted, onBoardEdit }) => {
  const connectBoard = async (boardId) => {
    try {
      const response = await fetch(`/api/boards/${boardId}/connect`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to connect to board');
      }
      
      if (onBoardConnected) {
        onBoardConnected(boardId);
      }
    } catch (err) {
      alert(err.message);
    }
  };
  
  const disconnectBoard = async (boardId) => {
    try {
      const response = await fetch(`/api/boards/${boardId}/disconnect`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to disconnect from board');
      }
      
      if (onBoardDisconnected) {
        onBoardDisconnected(boardId);
      }
    } catch (err) {
      alert(err.message);
    }
  };
  
  const deleteBoard = async (boardId) => {
    if (!confirm('Are you sure you want to delete this board?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete board');
      }
      
      if (onBoardDeleted) {
        onBoardDeleted(boardId);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className={styles.boardsContainer}>
      <h2>Manage Dart Boards</h2>
      {boards.length === 0 ? (
        <p>No boards added yet. Add a board to get started.</p>
      ) : (
        <table className={styles.boardsTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Serial Number</th>
              <th>Status</th>
              <th>Last Seen</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr key={board.id} className={styles.boardRow}>
                <td>{board.name}</td>
                <td>{board.serial_number}</td>
                <td>
                  <span className={`${styles.statusBadge} ${styles[board.status]}`}>
                    {board.status}
                  </span>
                </td>
                <td>{board.last_seen ? new Date(board.last_seen).toLocaleString() : 'Never'}</td>
                <td className={styles.actions}>
                  {board.status === 'online' ? (
                    <button 
                      onClick={() => disconnectBoard(board.id)}
                      className={styles.disconnectButton}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button 
                      onClick={() => connectBoard(board.id)}
                      className={styles.connectButton}
                      disabled={!board.serial_number || !board.access_token}
                    >
                      Connect
                    </button>
                  )}
                  <button 
                    onClick={() => onBoardEdit(board)}
                    className={styles.editButton}
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => deleteBoard(board.id)}
                    className={styles.deleteButton}
                    disabled={board.status === 'online'}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Component for database management
const DatabaseManagement = () => {
  const [isResetting, setIsResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState('');
  
  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    
    setIsResetting(true);
    setError('');
    
    try {
      const response = await fetch('/api/database/reset', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to reset database');
      }
      
      alert('Database reset successful');
      setConfirmReset(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsResetting(false);
    }
  };
  
  return (
    <div className={styles.databaseContainer}>
      <h2>Database Management</h2>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.dangerZone}>
        <h3>Danger Zone</h3>
        <p>These actions cannot be undone. Be careful!</p>
        <button 
          onClick={handleReset}
          className={styles.dangerButton}
          disabled={isResetting}
        >
          {confirmReset 
            ? 'Click again to confirm reset' 
            : isResetting 
              ? 'Resetting...' 
              : 'Reset Database'}
        </button>
      </div>
    </div>
  );
};

// Component for configuration settings
const ConfigurationSettings = () => {
  const [settings, setSettings] = useState({
    game_defaults: {
      x01: {
        startingScore: 501,
        doubleIn: false,
        doubleOut: true,
        masterOut: false
      }
    },
    refresh_interval: 5000,
    checkout_suggestions: true
  });
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings');
      
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      
      const data = await response.json();
      setSettings(data);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaveStatus('saving');
      
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save settings');
      }
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 3000);
      setError('');
    } catch (err) {
      setError(err.message);
      setSaveStatus('error');
    }
  };

  const resetSettings = async () => {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings/reset', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to reset settings');
      }
      
      const data = await response.json();
      setSettings(data);
      setError('');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setError(err.message);
      setSaveStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartValueChange = (value) => {
    setSettings(prev => ({
      ...prev,
      game_defaults: {
        ...prev.game_defaults,
        x01: {
          ...prev.game_defaults.x01,
          startingScore: Number(value)
        }
      }
    }));
  };

  const handleInModeChange = (value) => {
    setSettings(prev => ({
      ...prev,
      game_defaults: {
        ...prev.game_defaults,
        x01: {
          ...prev.game_defaults.x01,
          doubleIn: value === 'double'
        }
      }
    }));
  };

  const handleOutModeChange = (value) => {
    setSettings(prev => ({
      ...prev,
      game_defaults: {
        ...prev.game_defaults,
        x01: {
          ...prev.game_defaults.x01,
          doubleOut: value === 'double',
          masterOut: value === 'master'
        }
      }
    }));
  };

  const handleRefreshIntervalChange = (value) => {
    setSettings(prev => ({
      ...prev,
      refresh_interval: Number(value)
    }));
  };

  const handleCheckoutSuggestionsChange = (checked) => {
    setSettings(prev => ({
      ...prev,
      checkout_suggestions: checked
    }));
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading settings...</div>;
  }

  return (
    <div className={styles.settingsContainer}>
      <h2>Application Settings</h2>
      {error && <div className={styles.error}>{error}</div>}
      
      <div className={styles.settingsGroup}>
        <h3>Game Defaults (x01)</h3>
        
        <div className={styles.settingRow}>
          <label>Starting Score:</label>
          <select 
            value={settings.game_defaults.x01.startingScore} 
            onChange={(e) => handleStartValueChange(e.target.value)}
          >
            <option value="301">301</option>
            <option value="501">501</option>
            <option value="701">701</option>
            <option value="901">901</option>
          </select>
        </div>
        
        <div className={styles.settingRow}>
          <label>In Mode:</label>
          <select 
            value={settings.game_defaults.x01.doubleIn ? 'double' : 'straight'} 
            onChange={(e) => handleInModeChange(e.target.value)}
          >
            <option value="straight">Straight In</option>
            <option value="double">Double In</option>
          </select>
        </div>
        
        <div className={styles.settingRow}>
          <label>Out Mode:</label>
          <select 
            value={
              settings.game_defaults.x01.masterOut ? 'master' : 
              settings.game_defaults.x01.doubleOut ? 'double' : 'straight'
            } 
            onChange={(e) => handleOutModeChange(e.target.value)}
          >
            <option value="straight">Straight Out</option>
            <option value="double">Double Out</option>
            <option value="master">Master Out</option>
          </select>
        </div>
      </div>
      
      <div className={styles.settingsGroup}>
        <h3>Display Settings</h3>
        
        <div className={styles.settingRow}>
          <label>Data Refresh Interval (ms):</label>
          <input 
            type="number" 
            min="1000" 
            max="60000" 
            step="500" 
            value={settings.refresh_interval} 
            onChange={(e) => handleRefreshIntervalChange(e.target.value)}
          />
        </div>
        
        <div className={styles.settingRow}>
          <label>Show Checkout Suggestions:</label>
          <input 
            type="checkbox" 
            checked={settings.checkout_suggestions} 
            onChange={(e) => handleCheckoutSuggestionsChange(e.target.checked)}
          />
        </div>
      </div>
      
      <div className={styles.buttonGroup}>
        <button 
          onClick={saveSettings} 
          className={styles.saveButton}
          disabled={saveStatus === 'saving'}
        >
          {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
        </button>
        
        <button 
          onClick={resetSettings} 
          className={styles.resetButton}
          disabled={isLoading}
        >
          Reset to Defaults
        </button>
        
        {saveStatus === 'saved' && (
          <span className={styles.saveSuccess}>Settings saved successfully!</span>
        )}
      </div>
    </div>
  );
};

// Component for board edit dialog
const BoardEditDialog = ({ board, onClose, onSave }) => {
  const [name, setName] = useState(board.name || '');
  const [serialNumber, setSerialNumber] = useState(board.serial_number || '');
  const [accessToken, setAccessToken] = useState(''); // Don't populate for security
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!name) {
      setError('Board name is required');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const payload = {
        name,
        serial_number: serialNumber,
      };
      
      // Only include access token if it was modified
      if (accessToken) {
        payload.access_token = accessToken;
      }
      
      const response = await fetch(`/api/boards/${board.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to update board');
      }
      
      if (onSave) {
        onSave(data);
      }
      
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h2>Edit Dart Board</h2>
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="boardName">Board Name:</label>
            <input
              id="boardName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="serialNumber">Serial Number:</label>
            <input
              id="serialNumber"
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="accessToken">Access Token (leave blank to keep current):</label>
            <input
              id="accessToken"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Enter new token to change"
              disabled={isLoading}
            />
          </div>
          <div className={styles.modalActions}>
            <button 
              type="button" 
              onClick={onClose}
              className={styles.cancelButton}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className={styles.saveButton}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main admin page component
export default function AdminPage() {
  const { socket, isConnected } = useSocket();
  const [boards, setBoards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingBoard, setEditingBoard] = useState(null);
  const [activeTab, setActiveTab] = useState('boards');
  
  // Fetch boards on mount
  useEffect(() => {
    fetchBoards();
    
    // Set up socket listeners
    if (socket) {
      socket.on('board:created', (board) => {
        setBoards((prev) => [...prev, board]);
      });
      
      socket.on('board:updated', (updatedBoard) => {
        setBoards((prev) => 
          prev.map((board) => 
            board.id === updatedBoard.id ? updatedBoard : board
          )
        );
      });
      
      socket.on('board:deleted', (boardId) => {
        setBoards((prev) => prev.filter((board) => board.id !== boardId));
      });
      
      return () => {
        socket.off('board:created');
        socket.off('board:updated');
        socket.off('board:deleted');
      };
    }
  }, [socket]);
  
  const fetchBoards = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/boards');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch boards');
      }
      
      setBoards(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleBoardAdded = (newBoard) => {
    setBoards((prev) => [...prev, newBoard]);
  };
  
  const handleBoardConnected = (boardId) => {
    setBoards((prev) => 
      prev.map((board) => 
        board.id === boardId 
          ? { ...board, status: 'connecting' } 
          : board
      )
    );
  };
  
  const handleBoardDisconnected = (boardId) => {
    setBoards((prev) => 
      prev.map((board) => 
        board.id === boardId 
          ? { ...board, status: 'offline' } 
          : board
      )
    );
  };
  
  const handleBoardDeleted = (boardId) => {
    setBoards((prev) => prev.filter((board) => board.id !== boardId));
  };
  
  const handleBoardEdit = (board) => {
    setEditingBoard(board);
  };
  
  const handleBoardSaved = (updatedBoard) => {
    setBoards((prev) => 
      prev.map((board) => 
        board.id === updatedBoard.id ? updatedBoard : board
      )
    );
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Admin Dashboard | Dart Scoring System</title>
        <meta name="description" content="Admin dashboard for dart scoring system" />
      </Head>
      
      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Admin Dashboard</h1>
          <div className={styles.connectionStatusWrapper}>
            <SocketConnectionStatus />
          </div>
        </div>
        
        <AdminTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        
        {error && <div className={styles.error}>{error}</div>}
        
        {activeTab === 'boards' && (
          <div className={styles.grid}>
            <AddBoardForm onBoardAdded={handleBoardAdded} />
            
            {isLoading ? (
              <div className={styles.loading}>Loading boards...</div>
            ) : (
              <BoardsManagement 
                boards={boards}
                onBoardConnected={handleBoardConnected}
                onBoardDisconnected={handleBoardDisconnected}
                onBoardDeleted={handleBoardDeleted}
                onBoardEdit={handleBoardEdit}
              />
            )}
          </div>
        )}
        
        {activeTab === 'settings' && (
          <div className={styles.grid}>
            <ConfigurationSettings />
            <DatabaseManagement />
          </div>
        )}
        
        {activeTab === 'history' && (
          <div className={styles.fullWidth}>
            <HistoricalSummaries />
          </div>
        )}
        
        {activeTab === 'players' && (
          <div className={styles.comingSoon}>
            Player management coming soon...
          </div>
        )}
      </main>
      
      {editingBoard && (
        <BoardEditDialog 
          board={editingBoard}
          onClose={() => setEditingBoard(null)}
          onSave={handleBoardSaved}
        />
      )}
    </div>
  );
} 