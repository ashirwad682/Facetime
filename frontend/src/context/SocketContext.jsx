import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';
import { AuthContext } from './AuthContext';

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [pusher, setPusher] = useState(null);
  const [presenceChannel, setPresenceChannel] = useState(null);
  const [privateChannel, setPrivateChannel] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const { user } = useContext(AuthContext);
  const pusherInstance = useRef(null);

  useEffect(() => {
    if (user) {
      const apiBase = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://facetime-bice.vercel.app');
      
      const pusherKey = import.meta.env.VITE_PUSHER_KEY || "c0389c21418ea0212407";
      const cluster = import.meta.env.VITE_PUSHER_CLUSTER || "ap2";

      const client = new Pusher(pusherKey, {
        cluster: cluster,
        authEndpoint: `${apiBase}/api/pusher/auth`,
        auth: {
          params: {
            user_data: JSON.stringify(user)
          }
        }
      });

      pusherInstance.current = client;
      setPusher(client);

      const channel = client.subscribe('presence-facetime');
      setPresenceChannel(channel);

      const pChannel = client.subscribe(`private-user-${user._id}`);
      setPrivateChannel(pChannel);

      channel.bind('pusher:subscription_succeeded', (members) => {
        const users = [];
        members.each((member) => users.push(member.id));
        setOnlineUsers(users);
      });

      channel.bind('pusher:member_added', (member) => {
        setOnlineUsers((prev) => [...new Set([...prev, member.id])]);
      });

      channel.bind('pusher:member_removed', (member) => {
        setOnlineUsers((prev) => prev.filter((id) => id !== member.id));
      });

      return () => {
        client.unsubscribe('presence-facetime');
        client.disconnect();
      };
    }
  }, [user]);

  // Helper to trigger events via backend REST API
  const emit = async (event, data) => {
    const apiBase = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5001' : 'https://facetime-bice.vercel.app');
    try {
      await fetch(`${apiBase}/api/pusher/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: `private-user-${data.to}`,
          event: event,
          data: { ...data, from: user._id, callerName: user.name }
        })
      });
    } catch (err) {
      console.error("Pusher trigger error:", err);
    }
  };

  return (
    <SocketContext.Provider value={{ pusher, presenceChannel, privateChannel, onlineUsers, emit }}>
      {children}
    </SocketContext.Provider>
  );
};
