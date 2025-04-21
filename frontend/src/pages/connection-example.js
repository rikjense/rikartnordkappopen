import React, { useState } from 'react';
import Head from 'next/head';
import ConnectionStatus from '../components/ConnectionStatus';
import SocketConnectionStatus from '../components/SocketConnectionStatus';
import Tooltip from '../components/Tooltip';
import styles from '../styles/Admin.module.css';

const ConnectionExample = () => {
  const [demoStatus, setDemoStatus] = useState('connected');
  const [errorMessage, setErrorMessage] = useState('');

  const handleStatusChange = (status) => {
    setDemoStatus(status);
    
    if (status === 'error') {
      setErrorMessage('Failed to connect: timeout after 5 seconds');
    } else if (status === 'failed') {
      setErrorMessage('Connection failed after multiple attempts');
    } else {
      setErrorMessage('');
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Connection Status Examples</title>
        <meta name="description" content="Examples of connection status components" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>Connection Status Examples</h1>

        <div className={styles.grid}>
          <div className={styles.formContainer}>
            <h2>Demo Connection Status</h2>
            <p>Change the status to see different states:</p>
            
            <div style={{ marginBottom: '2rem' }}>
              <button 
                style={{ 
                  padding: '0.5rem 1rem', 
                  marginRight: '0.5rem',
                  background: demoStatus === 'connected' ? '#4CAF50' : '#f8f9fa',
                  color: demoStatus === 'connected' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
                onClick={() => handleStatusChange('connected')}
              >
                Connected
              </button>
              
              <button 
                style={{ 
                  padding: '0.5rem 1rem', 
                  marginRight: '0.5rem',
                  background: demoStatus === 'disconnected' ? '#F44336' : '#f8f9fa',
                  color: demoStatus === 'disconnected' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
                onClick={() => handleStatusChange('disconnected')}
              >
                Disconnected
              </button>
              
              <button 
                style={{ 
                  padding: '0.5rem 1rem', 
                  marginRight: '0.5rem',
                  background: demoStatus === 'reconnecting' ? '#FF9800' : '#f8f9fa',
                  color: demoStatus === 'reconnecting' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
                onClick={() => handleStatusChange('reconnecting')}
              >
                Reconnecting
              </button>
              
              <button 
                style={{ 
                  padding: '0.5rem 1rem', 
                  marginRight: '0.5rem',
                  background: demoStatus === 'error' ? '#E91E63' : '#f8f9fa',
                  color: demoStatus === 'error' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
                onClick={() => handleStatusChange('error')}
              >
                Error
              </button>
              
              <button 
                style={{ 
                  padding: '0.5rem 1rem',
                  background: demoStatus === 'failed' ? '#9C27B0' : '#f8f9fa',
                  color: demoStatus === 'failed' ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
                onClick={() => handleStatusChange('failed')}
              >
                Failed
              </button>
            </div>
            
            <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '0.5rem' }}>
              <h3>Custom ConnectionStatus:</h3>
              <ConnectionStatus 
                status={demoStatus}
                errorMessage={errorMessage}
                onReconnect={() => alert('Reconnect clicked')}
              />
            </div>
          </div>

          <div className={styles.formContainer}>
            <h2>SocketConnectionStatus</h2>
            <p>Live connection status from Socket.io:</p>
            
            <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '0.5rem' }}>
              <SocketConnectionStatus />
            </div>
            
            <h2 style={{ marginTop: '2rem' }}>Tooltip Example</h2>
            <p>Hover over elements with tooltips:</p>
            
            <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '0.5rem', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span>Hover over the icon</span>
                <div className={styles.tooltipContainer} style={{ marginLeft: '0.5rem' }}>
                  <div className={styles.connectionError}>?</div>
                  <Tooltip text="This is a tooltip example" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ConnectionExample; 