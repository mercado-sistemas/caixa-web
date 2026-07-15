import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from './shared';
import './theme.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
