import React, { createContext, useState, useRef, useContext, useEffect } from 'react';
import { SocketContext } from './SocketContext';
import { AuthContext } from './AuthContext';
import { useNavigate } from 'react-router-dom';

export const CallContext = createContext();

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.anyfirewall.com:3478' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
  ],
  iceCandidatePoolSize: 10,
};

const safeSessionGet = (key) => {
  try { return sessionStorage.getItem(key); } catch { return null; }
};

export const CallProvider = ({ children }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [receivingCall, setReceivingCall] = useState(false);
  const [callerInfo, setCallerInfo] = useState({});
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [remoteUserId, setRemoteUserId] = useState(safeSessionGet('activeCallWith'));
  const [isInitiator, setIsInitiator] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  const { privateChannel, emit } = useContext(SocketContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const peerConnection = useRef(null);
  const makingOffer = useRef(false);
  const ignoreOffer = useRef(false);
  const isSettingRemoteAnswerPending = useRef(false);
  const polite = useRef(false); 
  const remoteStreamRef = useRef(null);
  const iceCandidatesQueue = useRef([]);

  const setBitrate = (sdp) => {
    // Priority for H264 on mobile (iOS/Android)
    let mangled = sdp.replace(/a=mid:video\r\n/g, 'a=mid:video\r\nb=AS:500\r\n');
    if (mangled.includes('H264/90000')) {
      const parts = mangled.split('m=video');
      const lines = parts[1].split('\r\n');
      const h264Line = lines.find(l => l.includes('H264/90000'));
      if (h264Line) {
        const pt = h264Line.split(' ')[0].split(':')[1];
        mangled = mangled.replace(`m=video 9 UDP/TLS/RTP/SAVPF`, `m=video 9 UDP/TLS/RTP/SAVPF ${pt}`);
      }
    }
    return mangled;
  };

  useEffect(() => {
    if (!privateChannel) return;

    const handleIncomingCall = ({ from, callerName, offer }) => {
      console.log(`[Signaling] Incoming call from ${callerName}`);
      setReceivingCall(true);
      setCallerInfo({ from, callerName, offer });
      setRemoteUserId(from);
      setIsInitiator(false);
    };

    const handleCallAnswered = async ({ answer }) => {
      if (!peerConnection.current) return;
      console.log('[Signaling] Answer received');
      setCallAccepted(true);
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
        await processIceQueue();
      } catch (err) { console.error("Error setting answer", err); }
    };

    const handleIceCandidate = async ({ candidate }) => {
      try {
        const pc = peerConnection.current;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          iceCandidatesQueue.current.push(candidate);
        }
      } catch (e) {
        if (!ignoreOffer.current) console.warn("ICE error", e);
      }
    };

    const handleRenegotiateOffer = async ({ offer, from }) => {
      if (!peerConnection.current) return;
      const pc = peerConnection.current;
      
      const readyForOffer = !makingOffer.current && (pc.signalingState === 'stable' || isSettingRemoteAnswerPending.current);
      const offerCollision = !readyForOffer;
      ignoreOffer.current = offerCollision && !polite.current;

      if (ignoreOffer.current) return;

      try {
        isSettingRemoteAnswerPending.current = true;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        isSettingRemoteAnswerPending.current = false;
        await processIceQueue();
        const answer = await pc.createAnswer();
        const mangled = { type: answer.type, sdp: setBitrate(answer.sdp) };
        await pc.setLocalDescription(mangled);
        emit('renegotiate-answer', { to: from, answer: mangled });
      } catch (err) { 
        console.error("Renegotiate error", err);
        isSettingRemoteAnswerPending.current = false;
      }
    };

    const handleRenegotiateAnswer = async ({ answer }) => {
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
          await processIceQueue();
        } catch (e) { }
      }
    };

    const handleCallEnded = () => { leaveCall(false); navigate('/'); };
    const handleCallChat = ({ message, senderName }) => {
      setChatMessages(prev => [...prev, { senderName, message, id: Date.now() }]);
    };

    privateChannel.bind('incoming-call', handleIncomingCall);
    privateChannel.bind('call-answered', handleCallAnswered);
    privateChannel.bind('renegotiate-offer', handleRenegotiateOffer);
    privateChannel.bind('renegotiate-answer', handleRenegotiateAnswer);
    privateChannel.bind('ice-candidate', handleIceCandidate);
    privateChannel.bind('call-ended', handleCallEnded);
    privateChannel.bind('call-chat', handleCallChat);

    return () => {
      privateChannel.unbind_all();
    };
  }, [privateChannel, user]);

  const processIceQueue = async () => {
    const pc = peerConnection.current;
    if (!pc || !pc.remoteDescription) return;
    while (iceCandidatesQueue.current.length > 0) {
      const candidate = iceCandidatesQueue.current.shift();
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { }
    }
  };

  const initLocalStream = async () => {
    if (localStream && localStream.active) return localStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 20 }, facingMode: 'user' },
        audio: true
      });
      setLocalStream(stream);
      return stream;
    } catch (err) { return null; }
  };

  const createPeerConnection = (recipientId) => {
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnection.current = pc;
    polite.current = user._id < recipientId;

    pc.onnegotiationneeded = async () => {
      // In Perfect Negotiation, the Responder (impolite) should never initiate 
      // a negotiation while a remote offer is still being processed.
      if (isSettingRemoteAnswerPending.current) return;
      
      try {
        console.log('[WebRTC] Negotiation needed, creating offer...');
        makingOffer.current = true;
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        if (pc.signalingState !== 'stable') return;
        
        const mangled = { type: offer.type, sdp: setBitrate(offer.sdp) };
        await pc.setLocalDescription(mangled);
        
        // If the call hasn't been accepted yet, this is the very first 'Incoming Call'
        // If it has been accepted, this is a renegotiation (e.g. screen share)
        const eventName = callAccepted ? 'renegotiate-offer' : 'incoming-call';
        
        emit(eventName, { 
          to: recipientId, 
          offer: mangled, 
          from: user._id, 
          callerName: user.name 
        });
      } catch (err) { 
        console.error("Negotiation error", err); 
      } finally { 
        makingOffer.current = false; 
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) emit('ice-candidate', { to: recipientId, candidate });
    };

    pc.ontrack = ({ track }) => {
      console.log(`[WebRTC] Track Received: ${track.kind}`);
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      const stream = remoteStreamRef.current;
      if (!stream.getTracks().find(t => t.id === track.id)) stream.addTrack(track);
      setRemoteStreams([new MediaStream(stream.getTracks())]);
    };

    return pc;
  };

  const callUser = async (id, isReconnect = false) => {
    setRemoteUserId(id);
    setIsInitiator(true);
    const stream = await initLocalStream();
    if (!stream) return;
    setCallEnded(false);
    setCallAccepted(false);

    // Close previous connection if any
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    const pc = createPeerConnection(id);
    
    // Use transceivers for better control on mobile
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    const transceivers = pc.getTransceivers();
    const aTrans = transceivers.find(t => t.receiver.track.kind === 'audio');
    const vTrans = transceivers.find(t => t.receiver.track.kind === 'video');
    
    if (aTrans && audioTrack) await aTrans.sender.replaceTrack(audioTrack);
    if (vTrans && videoTrack) await vTrans.sender.replaceTrack(videoTrack);
    
    if (isReconnect) {
      console.log("[WebRTC] Triggering Reconnect session");
    }
  };

  const answerCall = async () => {
    setCallAccepted(true);
    setReceivingCall(false);
    const stream = await initLocalStream();
    if (!stream) return;
    const pc = createPeerConnection(callerInfo.from);
    
    // Use transceivers for better control on mobile
    pc.addTransceiver('audio', { direction: 'sendrecv' });
    pc.addTransceiver('video', { direction: 'sendrecv' });

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    
    const transceivers = pc.getTransceivers();
    const aTrans = transceivers.find(t => t.receiver.track.kind === 'audio');
    const vTrans = transceivers.find(t => t.receiver.track.kind === 'video');
    
    if (aTrans && audioTrack) await aTrans.sender.replaceTrack(audioTrack);
    if (vTrans && videoTrack) await vTrans.sender.replaceTrack(videoTrack);

    try {
      isSettingRemoteAnswerPending.current = true;
      await pc.setRemoteDescription(new RTCSessionDescription(callerInfo.offer));
      isSettingRemoteAnswerPending.current = false;
      
      await processIceQueue();
      
      const answer = await pc.createAnswer();
      const mangled = { type: answer.type, sdp: setBitrate(answer.sdp) };
      await pc.setLocalDescription(mangled);

      emit('call-answered', { 
        to: callerInfo.from, 
        answer: mangled 
      });
      
      navigate(`/call/${callerInfo.from}`);
    } catch (err) {
      console.error("Error answering call", err);
      isSettingRemoteAnswerPending.current = false;
    }
  };

  const declineCall = () => { setReceivingCall(false); emit('call-ended', { to: callerInfo.from }); };

  const leaveCall = (emitEvent = true) => {
    setCallEnded(true); setCallAccepted(false); setReceivingCall(false);
    if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); setLocalStream(null); }
    setRemoteStreams([]);
    remoteStreamRef.current = null;
    iceCandidatesQueue.current = [];
  };

  const endCall = (id) => { if (id) emit('call-ended', { to: id }); leaveCall(); navigate('/'); };
  const toggleAudio = () => { if (localStream) { const t = localStream.getAudioTracks()[0]; t.enabled = !t.enabled; setIsAudioMuted(!t.enabled); return t.enabled; } return false; };
  const toggleVideo = () => { if (localStream) { const t = localStream.getVideoTracks()[0]; t.enabled = !t.enabled; setIsVideoMuted(!t.enabled); return t.enabled; } return false; };

  const sendChatMessage = (message) => {
    if (message.trim() && remoteUserId) {
      setChatMessages(prev => [...prev, { senderName: 'You', message, id: Date.now(), isSelf: true }]);
      emit('call-chat', { to: remoteUserId, message, senderName: user.name });
    }
  };

  return (
    <CallContext.Provider value={{
      localStream, remoteStreams, callUser, receivingCall, callerInfo, answerCall, declineCall, endCall,
      callAccepted, callEnded, initLocalStream, toggleAudio, toggleVideo, isVideoMuted, isAudioMuted,
      chatMessages, sendChatMessage, isInitiator
    }}>
      {children}
    </CallContext.Provider>
  );
};
