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
    if (user && user._id) {
      // Re-init protection: don't create a new Pusher if already running for the same user
      if (pusherInstance.current && pusherInstance.current.user_id === user._id) return;
      
      const apiBase = getApiBase();
      const pusherKey = import.meta.env.VITE_PUSHER_KEY || "c0389c21418ea0212407";
      const cluster = import.meta.env.VITE_PUSHER_CLUSTER || "ap2";

      if (!pusherKey) {
        console.error("VITE_PUSHER_KEY is missing!");
        return;
      }

      const client = new Pusher(pusherKey, {
        cluster: cluster,
        authEndpoint: `${apiBase}/api/pusher/auth`,
        enabledTransports: ['ws', 'xhr_streaming', 'xhr_polling'],
        auth: {
          params: {
            user_data: JSON.stringify(user)
          }
        }
      });
      client.user_id = user._id;

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

      // Global Signaling Activity Feed
      pChannel.bind_global((event, data) => {
        if (!event.startsWith('pusher:')) {
          console.log(`%c[Pusher] RECEIVED SIGNAL: ${event}`, 'color: #34C759; font-weight: bold;', data);
        }
      });

      channel.bind('pusher:subscription_succeeded', (members) => {
        const users = [];
        members.each((member) => users.push(String(member.id)));
        console.log(`%c[Pusher] Online Users: ${users.length}`, 'color: #0A84FF; font-weight: bold;', users);
        setOnlineUsers(users);
      });

      channel.bind('pusher:member_added', (member) => {
        console.log(`%c[Pusher] User Online: ${member.info.name}`, 'color: #34C759;');
        setOnlineUsers((prev) => [...new Set([...prev, String(member.id)])]);
      });

      channel.bind('pusher:member_removed', (member) => {
        console.log(`%c[Pusher] User Offline: ${member.info.name}`, 'color: #FF3B30;');
        setOnlineUsers((prev) => prev.filter((id) => id !== String(member.id)));
      });

      return () => {
        if (pusherInstance.current) {
          pusherInstance.current.unsubscribe('presence-facetime');
          pusherInstance.current.unsubscribe(`private-user-${user._id}`);
          pusherInstance.current.disconnect();
          pusherInstance.current = null;
        }
      };
    }
  }, [user?._id]); // Only re-run if USER ID changes, not the whole user object

  const lastEmit = useRef({ event: '', time: 0 });

  const emit = async (event, data) => {
    // 🛡️ Signal Deduplication: stop the infinite negotiation flood
    const now = Date.now();
    if (lastEmit.current.event === event && (now - lastEmit.current.time < 800)) {
       return; 
    }
    lastEmit.current = { event, time: now };

    const apiBase = getApiBase();
    const payload = JSON.stringify({
      channel: `private-user-${data.to}`,
      event: event,
      data: { ...data, from: String(user._id), callerName: user.name }
    });

    if (payload.length > 9500) {
      console.warn(`%c[Pusher] WARNING: Payload size (${payload.length} bytes) is close to 10KB limit. This may fail on mobile/Pusher.`, 'color: #FF9500; font-weight: bold;');
    }

    try {
      const response = await fetch(`${apiBase}/api/pusher/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn(`[Pusher] Signaling delivery failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }
    } catch (err) { 
      console.warn("[Pusher] Network error during signaling", err);
    }
  };

  const contextValue = React.useMemo(() => ({
    pusher, presenceChannel, privateChannel, onlineUsers, emit
  }), [pusher, presenceChannel, privateChannel, onlineUsers, user?._id]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};
