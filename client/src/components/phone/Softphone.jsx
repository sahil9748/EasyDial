import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneOff, Mic, MicOff, Pause, Play,
  PhoneForwarded, Hash, ChevronUp, ChevronDown
} from 'lucide-react';
import useSipPhone from '../../hooks/useSipPhone';
import useAuthStore from '../../store/authStore';

export default function Softphone() {
  const { agent } = useAuthStore();
  const domain = window.location.hostname;

  const phone = useSipPhone({
    sipUsername: agent?.sipUsername,
    sipPassword: agent?.sipPassword,
    domain,
  });

  const [dialInput, setDialInput] = useState('');
  const [showDialpad, setShowDialpad] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [minimized, setMinimized] = useState(false);

  const dialpadKeys = ['1','2','3','4','5','6','7','8','9','*','0','#'];

  const handleDial = () => {
    if (dialInput.trim()) {
      phone.makeCall(dialInput.trim());
    }
  };

  const handleDialpadPress = (key) => {
    if (phone.callState === 'active') {
      phone.sendDTMF(key);
    } else {
      setDialInput(prev => prev + key);
    }
  };

  const handleTransfer = () => {
    if (transferTarget.trim()) {
      phone.transfer(transferTarget.trim());
      setShowTransfer(false);
      setTransferTarget('');
    }
  };

  const stateColors = {
    idle: 'border-dark-600',
    ringing: 'border-warning animate-pulse',
    active: 'border-success',
    held: 'border-primary-500',
  };

  return (
    <motion.div
      layout
      className={`glass-card ${stateColors[phone.callState]} border-2 overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-dark-800/40">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${phone.registered ? 'bg-success' : 'bg-danger'}`} />
          <span className="text-sm font-medium">{phone.registered ? 'Online' : 'Offline'}</span>
        </div>
        <button onClick={() => setMinimized(!minimized)} className="text-dark-400 hover:text-dark-200">
          {minimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <AnimatePresence>
        {!minimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Registration controls */}
            {!phone.registered ? (
              <div className="p-4">
                <button onClick={phone.register} className="btn-primary w-full text-sm">
                  Connect Softphone
                </button>
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {/* Call state display */}
                {phone.callState !== 'idle' && (
                  <div className="text-center py-2">
                    <p className="text-xs text-dark-400 uppercase tracking-wider mb-1">
                      {phone.callState === 'ringing' ? (phone.incomingCall ? 'Incoming Call' : 'Calling...') : phone.callState}
                    </p>
                    {phone.callState === 'active' && (
                      <p className="text-2xl font-mono font-bold text-primary-400">{phone.formattedDuration}</p>
                    )}
                  </div>
                )}

                {/* Dial input */}
                {phone.callState === 'idle' && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dialInput}
                      onChange={(e) => setDialInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleDial()}
                      placeholder="Enter number..."
                      className="input-field text-center text-lg font-mono"
                    />
                  </div>
                )}

                {/* Call controls */}
                <div className="flex items-center justify-center gap-3">
                  {phone.callState === 'idle' ? (
                    <button onClick={handleDial} disabled={!dialInput.trim()}
                      className="w-12 h-12 rounded-full bg-success hover:bg-success/80 flex items-center justify-center transition-all disabled:opacity-50">
                      <Phone className="w-5 h-5 text-white" />
                    </button>
                  ) : phone.incomingCall && phone.callState === 'ringing' ? (
                    <>
                      <button onClick={phone.answerCall}
                        className="w-12 h-12 rounded-full bg-success hover:bg-success/80 flex items-center justify-center transition-all animate-pulse">
                        <Phone className="w-5 h-5 text-white" />
                      </button>
                      <button onClick={phone.hangup}
                        className="w-12 h-12 rounded-full bg-danger hover:bg-danger/80 flex items-center justify-center transition-all">
                        <PhoneOff className="w-5 h-5 text-white" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={phone.toggleMute}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${phone.muted ? 'bg-danger/20 text-danger' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}>
                        {phone.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      <button onClick={phone.toggleHold}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${phone.callState === 'held' ? 'bg-primary-500/20 text-primary-400' : 'bg-dark-700 text-dark-300 hover:bg-dark-600'}`}>
                        {phone.callState === 'held' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      </button>
                      <button onClick={phone.hangup}
                        className="w-12 h-12 rounded-full bg-danger hover:bg-danger/80 flex items-center justify-center transition-all">
                        <PhoneOff className="w-5 h-5 text-white" />
                      </button>
                      <button onClick={() => setShowTransfer(!showTransfer)}
                        className="w-10 h-10 rounded-full bg-dark-700 text-dark-300 hover:bg-dark-600 flex items-center justify-center transition-all">
                        <PhoneForwarded className="w-4 h-4" />
                      </button>
                      <button onClick={() => setShowDialpad(!showDialpad)}
                        className="w-10 h-10 rounded-full bg-dark-700 text-dark-300 hover:bg-dark-600 flex items-center justify-center transition-all">
                        <Hash className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

                {/* Transfer input */}
                {showTransfer && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={transferTarget}
                      onChange={(e) => setTransferTarget(e.target.value)}
                      placeholder="Transfer to..."
                      className="input-field text-sm"
                    />
                    <button onClick={handleTransfer} className="btn-primary text-sm px-3">Go</button>
                  </div>
                )}

                {/* Dialpad grid */}
                {(showDialpad || phone.callState === 'idle') && (
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    {dialpadKeys.map((key) => (
                      <button
                        key={key}
                        onClick={() => handleDialpadPress(key)}
                        className="h-10 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-200 font-mono text-lg font-medium transition-all active:scale-95"
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
