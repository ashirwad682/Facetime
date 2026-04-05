import React, { createContext, useState, useRef, useContext, useEffect } from 'react';
import { SocketContext } from './SocketContext';
import { AuthContext } from './AuthContext';
import { useNavigate } from 'react-router-dom';

export const CallContext = createContext();

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// Safe sessionStorage read that won't throw in strict privacy mode
const safeSessionGet = (key) => {
  try { return sessionStorage.getItem(key); } catch { return null; }
};

export const CallProvider = ({ children }) => {
  const [localStream, setLocalStream] = useState(null);

  // Track multiple remote streams (camera and screen)
  const [remoteStreams, setRemoteStreams] = useState([]);

  const [receivingCall, setReceivingCall] = useState(false);
  const [callerInfo, setCallerInfo] = useState({});
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState(safeSessionGet('activeCallWith'));
  const [isInitiator, setIsInitiator] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef(null);
  const screenSendersRef = useRef([]);

  // Chat integration
  const [chatMessages, setChatMessages] = useState([]);

  const { pusher, presenceChannel, privateChannel, onlineUsers, emit } = useContext(SocketContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const peerConnection = useRef(null);
  const isNegotiating = useRef(false);
  // Single MediaStream accumulator for remote tracks.
  const remoteStreamRef = useRef(null);
  // ICE candidate queue to solve race conditions where candidates arrive
  // before the remote description is set.
  const iceCandidatesQueue = useRef([]);

  useEffect(() => {
    // Notification API is not available on iOS Safari — guard before use
    try {
      if (typeof Notification !== 'undefined' &&
          Notification.permission !== 'granted' &&
          Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    } catch (e) {
      // Silently ignore — notifications are not available on this platform
    }
  }, []);

  useEffect(() => {
    if (!privateChannel) return;

    const handleIncomingCall = ({ from, callerName, offer }) => {
      console.log(`%c[CallContext] INCOMING CALL from: ${callerName} (${from})`, 'color: #FF9500; font-weight: bold;');
      setReceivingCall(true);
      setCallerInfo({ from, callerName, offer });
      setRemoteUserId(from);
      setIsInitiator(false);
      try {
        if (typeof Notification !== 'undefined' &&
            typeof document !== 'undefined' &&
            document.visibilityState === 'hidden' &&
            Notification.permission === 'granted') {
          new Notification(`Incoming FaceTime call from ${callerName}`);
        }
      } catch (e) {
        // Notifications not supported on this device
      }
    };

    const handleSilentReconnect = async ({ from, offer }) => {
      setRemoteUserId(from);
      const stream = await initLocalStream();
      if (!stream) return;
      if (peerConnection.current) peerConnection.current.close();
      const pc = createPeerConnection(from);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await processIceQueue();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit('call-answered', { to: from, answer });
      setCallAccepted(true);
      sessionStorage.setItem('activeCallWith', from);
    };

    const handleCallAnswered = async ({ answer }) => {
      console.log('[WebRTC] Answer received, setting remote description');
      setCallAccepted(true);
      if (remoteUserId) sessionStorage.setItem('activeCallWith', remoteUserId);
      if (peerConnection.current) {
        try { 
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer)); 
          await processIceQueue();
        } catch (e) {
          console.error('[WebRTC] Error setting remote description (initiator):', e);
        }
      }
    };

    const processIceQueue = async () => {
      if (!peerConnection.current || !peerConnection.current.remoteDescription) return;
      console.log(`[WebRTC] Processing ${iceCandidatesQueue.current.length} queued candidates`);
      while (iceCandidatesQueue.current.length > 0) {
        const candidate = iceCandidatesQueue.current.shift();
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding queued ICE candidate:', e);
        }
      }
    };

    const handleRenegotiateOffer = async ({ offer, from }) => {
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
          await processIceQueue();
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          emit('renegotiate-answer', { to: from || remoteUserId, answer });
        } catch (e) { }
      }
    };

    const handleRenegotiateAnswer = async ({ answer }) => {
      if (peerConnection.current) {
        try { await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer)); } catch (e) { }
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      if (peerConnection.current && peerConnection.current.remoteDescription && peerConnection.current.remoteDescription.type) {
        try {
          console.log('[WebRTC] Applying ICE candidate immediately');
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Error adding ICE candidate immediately:', e);
        }
      } else {
        console.log('[WebRTC] Queuing ICE candidate (remote description not ready)');
        iceCandidatesQueue.current.push(candidate);
      }
    };

    const handleCallEnded = () => {
      leaveCall(false);
      navigate('/');
    };

    const handleCallChat = ({ message, senderName }) => {
      setChatMessages(prev => [...prev, { senderName, message, id: Date.now() }]);
    };

    privateChannel.bind('incoming-call', handleIncomingCall);
    privateChannel.bind('silent-reconnect', handleSilentReconnect);
    privateChannel.bind('call-answered', handleCallAnswered);
    privateChannel.bind('renegotiate-offer', handleRenegotiateOffer);
    privateChannel.bind('renegotiate-answer', handleRenegotiateAnswer);
    privateChannel.bind('ice-candidate', handleIceCandidate);
    privateChannel.bind('call-ended', handleCallEnded);
    privateChannel.bind('call-chat', handleCallChat);

    return () => {
      privateChannel.unbind('incoming-call', handleIncomingCall);
      privateChannel.unbind('silent-reconnect', handleSilentReconnect);
      privateChannel.unbind('call-answered', handleCallAnswered);
      privateChannel.unbind('renegotiate-offer', handleRenegotiateOffer);
      privateChannel.unbind('renegotiate-answer', handleRenegotiateAnswer);
      privateChannel.unbind('ice-candidate', handleIceCandidate);
      privateChannel.unbind('call-ended', handleCallEnded);
      privateChannel.unbind('call-chat', handleCallChat);
    };
  }, [privateChannel, navigate, remoteUserId]);

  const initLocalStream = async () => {
    if (localStream && localStream.active) return localStream;
    try {
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error("Failed to get media devices", err);
      alert("Camera or Microphone access denied.");
      return null;
    }
  };

  const createPeerConnection = (recipientId) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnection.current = pc;
    isNegotiating.current = false;

    // Explicitly add transceivers to ensure media direction is set correctly
    // This is much more robust on mobile than addTrack alone.
    if (pc.addTransceiver) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE Connection State: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.warn('[WebRTC] Connection failing, might need TURN server');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection State: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        // Fallback: If after 5 seconds of connection we have no tracks, force renegotiation
        setTimeout(() => {
          if (remoteStreams.length === 0 && !callEnded && peerConnection.current) {
            console.warn('[WebRTC] Connected but no tracks received. Triggering renegotiation fallback...');
            if (pc.onnegotiationneeded) pc.onnegotiationneeded();
          }
        }, 5000);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit('ice-candidate', {
          to: recipientId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack fired: ${event.track.kind}. Total tracks now in stream: ${remoteStreamRef.current ? remoteStreamRef.current.getTracks().length + 1 : 1}`);

      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      const stream = remoteStreamRef.current;

      if (event.streams && event.streams.length > 0) {
        const incoming = event.streams[0];
        incoming.getTracks().forEach(track => {
          if (!stream.getTracks().find(t => t.id === track.id)) {
            console.log(`[WebRTC] Adding track from streams[0]: ${track.kind}`);
            stream.addTrack(track);
          }
        });
      } else {
        if (!stream.getTracks().find(t => t.id === event.track.id)) {
          console.log(`[WebRTC] Adding track from event.track directly: ${event.track.kind}`);
          stream.addTrack(event.track);
        }
      }

      // VERY IMPORTANT: Create a NEW MediaStream object from the accumulated tracks.
      // This ensures that the stream reference and ID change, which triggers
      // React components (like VideoPlayer) to re-mount and re-initialize playback.
      const freshStream = new MediaStream(stream.getTracks());
      setRemoteStreams([freshStream]);
    };

    pc.onnegotiationneeded = async () => {
      if (isNegotiating.current || pc.signalingState !== 'stable') return;
      isNegotiating.current = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emit('renegotiate-offer', { to: recipientId, offer, from: user._id });
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        isNegotiating.current = false;
      }
    };

    setRemoteStreams([]);

    return pc;
  };

  const callUser = async (recipientId, isReconnect = false) => {
    iceCandidatesQueue.current = [];
    setRemoteUserId(recipientId);
    setIsInitiator(true);
    const stream = await initLocalStream();
    if (!stream) return;

    setCallEnded(false);
    setCallAccepted(false);

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    const pc = createPeerConnection(recipientId);

    // Lock negotiation while adding tracks and creating initial offer
    isNegotiating.current = true;
    try {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const eventName = isReconnect ? 'silent-reconnect' : 'incoming-call';
      console.log(`%c[Pusher] EMITTING SIGNAL: ${eventName}`, 'color: #007AFF; font-weight: bold;', { to: recipientId, from: user._id });
      
      emit(eventName, {
        to: recipientId,
        offer,
        from: user._id,
        callerName: user.name
      });
    } catch (err) {
      console.error("Failed to create offer or emit signal:", err);
    } finally {
      isNegotiating.current = false;
    }
  };

  const answerCall = async () => {
    setCallAccepted(true);
    setReceivingCall(false);
    sessionStorage.setItem('activeCallWith', remoteUserId);

    const stream = await initLocalStream();
    if (!stream) return;

    if (peerConnection.current) {
      peerConnection.current.close();
    }
    const pc = createPeerConnection(callerInfo.from);

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    await pc.setRemoteDescription(new RTCSessionDescription(callerInfo.offer));
    // Drain candidates received during the initiation phase
    while (iceCandidatesQueue.current.length > 0) {
      const candidate = iceCandidatesQueue.current.shift();
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    emit('call-answered', {
      to: callerInfo.from,
      answer
    });

    navigate(`/call/${callerInfo.from}`, { state: { incoming: true, from: callerInfo.from } });
  };

  const declineCall = () => {
    setReceivingCall(false);
    emit('call-ended', { to: callerInfo.from });
  };

  const leaveCall = (emitEvent = true) => {
    setCallEnded(true);
    setCallAccepted(false);
    setReceivingCall(false);
    sessionStorage.removeItem('activeCallWith');
    setChatMessages([]);
    setIsScreenSharing(false);

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    screenSendersRef.current = [];

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }

    setRemoteStreams([]);
    iceCandidatesQueue.current = [];
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(t => t.stop());
      remoteStreamRef.current = null;
    }
  };

  const endCall = (remoteId) => {
    if (remoteId) {
      emit('call-ended', { to: remoteId });
    }
    leaveCall(false);
    navigate('/');
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
        return audioTrack.enabled;
      }
    }
    return false;
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks().find(t => screenStreamRef.current ? !screenStreamRef.current.getVideoTracks().includes(t) : true);
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoMuted(!videoTrack.enabled);
        return videoTrack.enabled;
      }
    }
    return false;
  };

  const stopScreenShare = () => {
    if (!peerConnection.current) return;

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    screenSendersRef.current.forEach(sender => {
      peerConnection.current.removeTrack(sender);
    });
    screenSendersRef.current = [];

    setIsScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (!peerConnection.current) return;

    if (isScreenSharing) {
      stopScreenShare();
    } else {
      try {
        let screenStream;
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } catch (err) {
          if (err.name === 'NotAllowedError') {
            throw err;
          }
          console.warn("Screen capturing with audio failed, falling back to video only...", err);
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        }

        screenStreamRef.current = screenStream;

        screenStream.getTracks().forEach(track => {
          const sender = peerConnection.current.addTrack(track, screenStream);
          screenSendersRef.current.push(sender);

          track.onended = () => {
            stopScreenShare();
          };
        });

        setIsScreenSharing(true);

      } catch (e) {
        console.error("Screen sharing failed", e);
        if (e.name === 'NotAllowedError') {
          alert("Permission to share screen was denied.");
        } else if (e.name === 'AbortError' || e.message.includes('capture')) {
          alert("macOS blocked screen capture! Please grant your browser 'Screen Recording' permissions in System Settings -> Privacy & Security.");
        } else {
          alert('Failed to start screen sharing. Your browser/device may not support capturing this source.');
        }
      }
    }
  };

  const sendChatMessage = (message) => {
    if (message.trim() && remoteUserId) {
      setChatMessages(prev => [...prev, { senderName: 'You', message, id: Date.now(), isSelf: true }]);
      emit('call-chat', { to: remoteUserId, message, senderName: user.name });
    }
  };

  return (
    <CallContext.Provider value={{
      localStream,
      remoteStreams,
      callUser,
      receivingCall,
      callerInfo,
      answerCall,
      declineCall,
      endCall,
      callAccepted,
      callEnded,
      initLocalStream,
      toggleAudio,
      toggleVideo,
      isVideoMuted,
      isAudioMuted,
      isScreenSharing,
      toggleScreenShare,
      chatMessages,
      sendChatMessage,
      isInitiator,
      screenStream: screenStreamRef.current
    }}>
      {children}
    </CallContext.Provider>
  );
};
