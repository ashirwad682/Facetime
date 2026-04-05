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

export const CallProvider = ({ children }) => {
  const [localStream, setLocalStream] = useState(null);

  // Track multiple remote streams (camera and screen)
  const [remoteStreams, setRemoteStreams] = useState([]);

  const [receivingCall, setReceivingCall] = useState(false);
  const [callerInfo, setCallerInfo] = useState({});
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState(sessionStorage.getItem('activeCallWith'));
  const [isInitiator, setIsInitiator] = useState(false);

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

  useEffect(() => {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!privateChannel) return;

    const handleIncomingCall = ({ from, callerName, offer }) => {
      setReceivingCall(true);
      setCallerInfo({ from, callerName, offer });
      setRemoteUserId(from);
      setIsInitiator(false);
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && Notification.permission === "granted") {
        new Notification(`Incoming FaceTime call from ${callerName}`);
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
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit('make-answer', { to: from, answer });
      setCallAccepted(true);
      sessionStorage.setItem('activeCallWith', from);
    };

    const handleCallAnswered = async ({ answer }) => {
      setCallAccepted(true);
      if (remoteUserId) sessionStorage.setItem('activeCallWith', remoteUserId);
      if (peerConnection.current) {
        try { await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer)); } catch (e) { }
      }
    };

    const handleRenegotiateOffer = async ({ offer, from }) => {
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
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
      if (peerConnection.current) {
        try { await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { }
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 2
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

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit('ice-candidate', {
          to: recipientId,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        const streamArray = prev.slice();
        event.streams.forEach(stream => {
          if (!streamArray.find(s => s.id === stream.id)) {
            streamArray.push(stream);
          }
        });
        return streamArray;
      });
    };

    pc.onnegotiationneeded = async () => {
      if (isNegotiating.current) return;
      isNegotiating.current = true;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emit('renegotiate-offer', { to: recipientId, offer, from: user._id });
      } catch (err) {
        console.error(err);
      } finally {
        isNegotiating.current = false;
      }
    };

    setRemoteStreams([]);

    return pc;
  };

  const callUser = async (recipientId, isReconnect = false) => {
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

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // We intentionally delay creating the initial offer specifically to avoid racing with onnegotiationneeded
    setTimeout(async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const eventName = isReconnect ? 'silent-reconnect' : 'incoming-call';
      emit(eventName, {
        to: recipientId,
        offer,
        from: user._id,
        callerName: user.name
      });
    }, 100);
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
