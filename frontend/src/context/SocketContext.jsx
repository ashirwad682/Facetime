import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    if (user) {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const newSocket = io(apiBase);
      setSocket(newSocket);

      newSocket.on('connect', () => {
        newSocket.emit('register-user', user._id);
      });

      newSocket.on('online-users', (users) => {
        setOnlineUsers(users);
      });

      return () => newSocket.close();
    }
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
};
