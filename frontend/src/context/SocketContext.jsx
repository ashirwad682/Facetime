import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';
import { AuthContext } from './AuthContext';
import { getApiBase } from '../utils/api';

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
      const apiBase = getApiBase();
      
      const pusherKey = import.meta.env.VITE_PUSHER_KEY || "c0389c21418ea0212407";
      const cluster = import.meta.env.VITE_PUSHER_CLUSTER || "ap2";

      const client = new Pusher(pusherKey, {
        cluster: cluster,
        authEndpoint: `${apiBase}/api/pusher/auth`,
        enabledTransports: ['ws', 'xhr_streaming', 'xhr_polling'],
        auth: {
          params: {
            user_data: JSON.stringify(user)
          }
        },
        userAuthentication: {
          paramsProvider: () => {
            return { user_data: JSON.stringify(user) };
          }
        }
      });

      client.connection.bind('error', (err) => {
        console.error("PUSHER CONNECTION ERROR (Live Diagnostic):", err);
      });

      client.connection.bind('state_change', (states) => {
        console.log(`PUSHER STATE: ${states.previous} -> ${states.current}`);
      });

      pusherInstance.current = client;
      setPusher(client);

      const channel = client.subscribe('presence-facetime');
      setPresenceChannel(channel);

      const pChannel = client.subscribe(`private-user-${user._id}`);
      setPrivateChannel(pChannel);

      pChannel.bind('pusher:subscription_succeeded', () => {
        console.log(`%c[Pusher] SUBSCRIPTION SUCCESS: ${pChannel.name}`, 'color: #34C759; font-weight: bold;');
      });

      pChannel.bind('pusher:subscription_error', (status) => {
        console.error(`%c[Pusher] SUBSCRIPTION ERROR: ${pChannel.name}`, 'color: #FF3B30; font-weight: bold;', status);
      });

      // Global Signaling Activity Feed (Live Diagnostic)
      pChannel.bind_global((event, data) => {
        if (!event.startsWith('pusher:')) {
          console.log(`%c[Pusher] RECEIVED SIGNAL: ${event}`, 'color: #34C759; font-weight: bold;', data);
        }
      });

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
    const apiBase = getApiBase();
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
