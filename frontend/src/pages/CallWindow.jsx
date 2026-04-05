import React, { useContext, useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { CallContext } from '../context/CallContext';
import { Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, MonitorOff, MessageSquare, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Video player component with rounded corners and drop‑shadow
const VideoPlayer = ({ stream, className = '', muted = false, id }) => {
  const videoRef = useRef();
  
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      
      // Critical for mobile: explicit play() call after setting srcObject
      const playVideo = async () => {
        try {
          await video.play();
        } catch (err) {
          console.warn("[VideoPlayer] Autoplay blocked, waiting for interaction:", err);
        }
      };
      playVideo();
    }
  }, [stream]);

  return (
    <video
      id={id}
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      controls={false}
      disablePictureInPicture
      className={`rounded-lg shadow-lg bg-black ${className}`}
    />
  );
};

const CallWindow = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const {
    localStream,
    remoteStreams,
    callUser,
    callAccepted,
    callEnded,
    endCall,
    toggleAudio,
    toggleVideo,
    isScreenSharing,
    toggleScreenShare,
    chatMessages,
    sendChatMessage,
    screenStream,
    isInitiator,
    isVideoMuted,
    isAudioMuted,
  } = useContext(CallContext);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isLowLight, setIsLowLight] = useState(false);
  const [timer, setTimer] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const messagesEndRef = useRef(null);
  const hideTimerRef = useRef(null);

  // Detect touch device for conditional rendering
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Initiate / reconnect call
  useEffect(() => {
    if (!state?.incoming && !callAccepted) {
      if (state?.reconnect) {
        callUser(id, true);
      } else {
        callUser(id, false);
      }
    }
  }, [id, state?.incoming, state?.reconnect]);

  // Auto‑scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatOpen]);

  // Call duration timer
  useEffect(() => {
    let interval;
    if (callAccepted && !callEnded) {
      interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
    } else {
      setTimer(0);
    }
    return () => clearInterval(interval);
  }, [callAccepted, callEnded]);

  // Low‑light detection (kept from original implementation)
  useEffect(() => {
    let interval;
    if (localStream && !isVideoMuted && !isScreenSharing) {
      interval = setInterval(() => {
        const video = document.getElementById('local-video');
        if (!video || video.readyState < 2) return;
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          }
          const avg = sum / (data.length / 4);
          if (avg < 40) setIsLowLight(true);
          else if (avg > 50) setIsLowLight(false);
        } catch (e) {
          // ignore taint errors
        }
      }, 2000);
    } else {
      setIsLowLight(false);
    }
    return () => clearInterval(interval);
  }, [localStream, isVideoMuted, isScreenSharing]);

  // Auto-hide controls logic
  useEffect(() => {
    if (showControls) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        // Only hide if chat isn't open
        if (!isChatOpen) setShowControls(false);
      }, 5000);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showControls, isChatOpen]);

  const handleUserInteraction = () => {
    setShowControls(true);
  };

  // Mobile tap shows controls (mouse events don't fire reliably on touch)
  const handleTouch = () => {
    setShowControls(true);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleEndCall = () => {
    endCall(id);
    navigate('/');
  };

  const handleToggleAudio = () => {
    toggleAudio();
  };

  const handleToggleVideo = () => {
    toggleVideo();
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendChatMessage(chatInput);
      setChatInput('');
    }
  };

  // Status banner text
  const statusText = callEnded ? 'Call Ended' : callAccepted ? formatTime(timer) : state?.incoming ? 'Connecting...' : 'Calling...';

  // Render remote streams with gradient borders
  const renderRemoteStreams = () => {
    if (!remoteStreams || remoteStreams.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full text-gray-500 animate-pulse">
          <span className="text-xl mb-4 text-white font-medium">Connecting...</span>
          <div className="w-12 h-12 border-4 border-t-mac-accent border-gray-600 rounded-full animate-spin" />
        </div>
      );
    }
    if (remoteStreams.length === 1) {
      return <VideoPlayer key={remoteStreams[0].id} stream={remoteStreams[0]} className="w-full h-full object-cover" />;
    }
    return (
      <div className="flex flex-wrap justify-center gap-4">
        {remoteStreams.map((stream) => (
          <div key={stream.id} className="video-frame w-full max-w-md">
            <VideoPlayer stream={stream} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  };

  // Safe PiP drag constraints computed lazily so they always match real viewport
  const getPipConstraints = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
    const pipW = vw < 480 ? 112 : 224; // matches w-28 vs w-56
    const pipH = vw < 480 ? 160 : 320;
    return { top: 10, left: 10, right: Math.max(0, vw - pipW - 20), bottom: Math.max(0, vh - pipH - 20) };
  };

  return (
    <div className="call-container" onClick={handleUserInteraction} onMouseMove={handleUserInteraction} onTouchStart={handleTouch}>
      {/* Status banner */}
      <motion.div
        className="status-banner"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {statusText}
      </motion.div>

      {/* Low‑light overlay */}
      <AnimatePresence>
        {isLowLight && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 pointer-events-none z-50 border-[24px] sm:border-[40px] border-white mix-blend-screen rounded-[80px] sm:rounded-[120px]"
            style={{ boxShadow: 'inset 0 0 250px rgba(255,255,255,1), inset 0 0 50px rgba(255,255,255,1)' }}
          />
        )}
      </AnimatePresence>

      {/* Remote video area */}
      <div className="flex-1 w-full flex items-center justify-center relative">
        {renderRemoteStreams()}
      </div>

      {/* Local PiP video */}
      <motion.div
        drag
        dragConstraints={getPipConstraints()}
        dragElastic={0.1}
        className="absolute top-24 right-4 sm:right-6 w-28 h-40 sm:w-56 sm:h-80 bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-mac-border/50 z-30 cursor-grab active:cursor-grabbing touch-none"
      >
        {localStream ? (
          <VideoPlayer
            id="local-video"
            stream={localStream}
            muted={true}
            className={`w-full h-full object-cover ${isVideoMuted && !isScreenSharing ? 'hidden' : 'block'}`}
          />
        ) : null}
        {(!localStream || (isVideoMuted && !isScreenSharing)) && (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <VideoOff size={28} className="text-gray-500" />
          </div>
        )}
      </motion.div>

      {/* Control toolbar - Increased icons and auto-hide transition */}
      <div
        className={`glass-toolbar absolute bottom-8 left-1/2 -translate-x-1/2 z-30 transition-all duration-500 ease-in-out ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'
          }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleAudio(); }}
          aria-label={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={isAudioMuted ? 'bg-white text-black shadow-lg' : 'text-white hover:bg-white/10'}
        >
          {isAudioMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleVideo(); }}
          aria-label={isVideoMuted ? 'Enable video' : 'Disable video'}
          className={isVideoMuted ? 'bg-white text-black shadow-lg' : 'text-white hover:bg-white/10'}
        >
          {isVideoMuted ? <VideoOff size={24} /> : <Video size={24} />}
        </button>
        {/* Screen share – only available on desktop browsers */}
        {!isTouchDevice && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleScreenShare(); }}
            aria-label={isScreenSharing ? 'Stop screen share' : 'Start screen share'}
            className={isScreenSharing ? 'bg-mac-accent text-white shadow-lg shadow-blue-500/20' : 'text-white hover:bg-white/10'}
          >
            {isScreenSharing ? <MonitorOff size={24} /> : <MonitorUp size={24} />}
          </button>
        )}

        {/* End Call / Cancel Call button */}
        {(!isInitiator || !callAccepted) && (
          <button
            onClick={(e) => { e.stopPropagation(); handleEndCall(); }}
            aria-label={!isInitiator ? 'End Call' : 'Cancel Call'}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center bg-mac-red text-white shadow-xl shadow-red-500/30 hover:bg-red-400 hover:scale-110 transition-all border-none"
          >
            <PhoneOff size={28} />
          </button>
        )}

        {/* Active Call indicator for initiator */}
        {isInitiator && callAccepted && (
          <div className="flex flex-col items-center justify-center mx-2 text-mac-accent animate-pulse font-bold text-[10px] uppercase tracking-widest px-5 py-3 bg-white/5 rounded-full border border-white/10">
            Live
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); setIsChatOpen(!isChatOpen); }}
          aria-label="Toggle chat"
          className={isChatOpen ? 'bg-white text-black shadow-lg' : 'text-white hover:bg-white/10'}
        >
          <MessageSquare size={24} />
        </button>
      </div>


      {/* Sliding chat panel */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 bottom-0 w-full sm:w-80 md:w-96 backdrop-blur-2xl bg-mac-blur/90 border-l border-mac-border shadow-2xl z-40 flex flex-col"
          >
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-black/20">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <MessageSquare size={18} /> In‑Call Messages
              </h3>
              <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-white transition">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 text-sm mt-10">Messages will appear here...</div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-gray-400 mb-1 px-1">{msg.senderName}</span>
                    <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm shadow-md ${msg.isSelf ? 'bg-mac-accent text-white rounded-br-none' : 'bg-gray-700 text-gray-100 rounded-bl-none'}`}> {msg.message} </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSendMessage} className="p-4 bg-black/30 border-t border-gray-700">
              <div className="relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a message..."
                  className="w-full bg-mac-gray border border-mac-border rounded-full pl-5 pr-12 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-mac-accent placeholder-gray-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-mac-accent hover:bg-blue-5 transition rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={14} className="text-white" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CallWindow;
