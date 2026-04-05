import React, { useContext } from 'react';
import { CallContext } from '../context/CallContext';
import { Phone, PhoneOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const IncomingCallModal = () => {
  const { receivingCall, callerInfo, answerCall, declineCall } = useContext(CallContext);

  return (
    <AnimatePresence>
      {receivingCall && (
        <motion.div 
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, y: -50 }}
          className="fixed top-10 left-1/2 -translate-x-1/2 z-[100] w-[90%] sm:w-full max-w-sm"
        >
          <div className="backdrop-blur-2xl bg-mac-blur/90 border border-mac-border rounded-3xl p-6 shadow-2xl flex flex-col items-center">
            
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-3xl font-bold text-white shadow-lg mb-4 animate-pulse">
              {callerInfo?.callerName?.charAt(0).toUpperCase()}
            </div>
            
            <h2 className="text-xl font-semibold text-white mb-1">
              {callerInfo?.callerName}
            </h2>
            <p className="text-gray-400 text-sm mb-6">is calling you...</p>
            
            <div className="flex gap-6 w-full justify-center">
              <button 
                onClick={declineCall}
                className="w-16 h-16 rounded-full bg-mac-red flex items-center justify-center text-white shadow-lg hover:-translate-y-1 transition-transform"
              >
                <PhoneOff size={28} />
              </button>

              <button 
                onClick={answerCall}
                className="w-16 h-16 rounded-full bg-mac-green flex items-center justify-center text-white shadow-[0_0_20px_rgba(52,199,89,0.5)] hover:-translate-y-1 transition-transform animate-bounce"
              >
                <Phone size={28} />
              </button>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IncomingCallModal;
