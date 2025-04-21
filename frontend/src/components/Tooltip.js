import React from 'react';
import styles from '../styles/Components.module.css';

const Tooltip = ({ text }) => {
  return (
    <div className={styles.tooltip}>
      {text}
    </div>
  );
};

export default Tooltip; 