import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { user, token } = useContext(AuthContext);

  useEffect(() => {
    if (user && token) {
      const apiBase = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://facetime-bice.vercel.app');
      
      // Heartbeat pulse every 30 seconds
      const heartbeatInterval = setInterval(() => {
        fetch(`${apiBase}/api/users/heartbeat`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(err => console.error("Heartbeat failed:", err));
      }, 30000);

      const newSocket = io(apiBase, {
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 5000,
      });
      
      setSocket(newSocket);

      newSocket.on('connect', () => {
        newSocket.emit('register-user', user._id);
      });

      return () => {
        clearInterval(heartbeatInterval);
        newSocket.close();
      };
    }
  }, [user, token]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};
