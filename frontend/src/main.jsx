import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { CallProvider } from './context/CallContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <SocketProvider>
          <CallProvider>
            <App />
          </CallProvider>
        </SocketProvider>
      </AuthProvider>
    </Router>
  </React.StrictMode>
);
