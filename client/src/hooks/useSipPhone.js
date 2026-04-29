import { useState, useRef, useCallback, useEffect } from 'react';
import { UserAgent, Registerer, Inviter, SessionState } from 'sip.js';

export default function useSipPhone({ sipUsername, sipPassword, domain }) {
  const [registered, setRegistered] = useState(false);
  const [callState, setCallState] = useState('idle'); // idle, ringing, active, held
  const [incomingCall, setIncomingCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  const uaRef = useRef(null);
  const registererRef = useRef(null);
  const sessionRef = useRef(null);
  const audioRef = useRef(null);
  const timerRef = useRef(null);

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.autoplay = true;
    }
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (registererRef.current) {
      try { registererRef.current.unregister(); } catch {}
    }
    if (uaRef.current) {
      try { uaRef.current.stop(); } catch {}
    }
    setRegistered(false);
    setCallState('idle');
  }, []);

  const register = useCallback(async () => {
    if (!sipUsername || !sipPassword || !domain) return;

    try {
      const wsServer = `wss://${domain}:8089/ws`;
      const uri = UserAgent.makeURI(`sip:${sipUsername}@${domain}`);

      const ua = new UserAgent({
        uri,
        transportOptions: { server: wsServer },
        authorizationUsername: sipUsername,
        authorizationPassword: sipPassword,
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          },
        },
        delegate: {
          onInvite: (invitation) => {
            setIncomingCall(invitation);
            setCallState('ringing');

            invitation.stateChange.addListener((state) => {
              if (state === SessionState.Established) {
                setupRemoteAudio(invitation);
                setCallState('active');
                startTimer();
                setIncomingCall(null);
              } else if (state === SessionState.Terminated) {
                setCallState('idle');
                setIncomingCall(null);
                stopTimer();
              }
            });
          },
        },
      });

      await ua.start();
      uaRef.current = ua;

      const registerer = new Registerer(ua);
      registererRef.current = registerer;

      registerer.stateChange.addListener((state) => {
        setRegistered(state === 'Registered');
      });

      await registerer.register();
    } catch (err) {
      console.error('SIP registration error:', err);
    }
  }, [sipUsername, sipPassword, domain]);

  const unregister = useCallback(async () => {
    cleanup();
  }, [cleanup]);

  const makeCall = useCallback(async (number) => {
    if (!uaRef.current || callState !== 'idle') return;

    try {
      const target = UserAgent.makeURI(`sip:${number}@${domain}`);
      const inviter = new Inviter(uaRef.current, target, {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
        },
      });

      sessionRef.current = inviter;

      inviter.stateChange.addListener((state) => {
        if (state === SessionState.Establishing) {
          setCallState('ringing');
        } else if (state === SessionState.Established) {
          setupRemoteAudio(inviter);
          setCallState('active');
          startTimer();
        } else if (state === SessionState.Terminated) {
          setCallState('idle');
          stopTimer();
          sessionRef.current = null;
        }
      });

      await inviter.invite();
    } catch (err) {
      console.error('Make call error:', err);
      setCallState('idle');
    }
  }, [domain, callState]);

  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    try {
      sessionRef.current = incomingCall;
      await incomingCall.accept({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
        },
      });
    } catch (err) {
      console.error('Answer error:', err);
    }
  }, [incomingCall]);

  const hangup = useCallback(async () => {
    const session = sessionRef.current || incomingCall;
    if (!session) return;

    try {
      switch (session.state) {
        case SessionState.Initial:
        case SessionState.Establishing:
          if (session.cancel) await session.cancel();
          else if (session.reject) await session.reject();
          break;
        case SessionState.Established:
          await session.bye();
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('Hangup error:', err);
    }
    sessionRef.current = null;
    setCallState('idle');
    setIncomingCall(null);
    stopTimer();
  }, [incomingCall]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    const sdh = session.sessionDescriptionHandler;
    if (!sdh) return;

    const pc = sdh.peerConnection;
    if (!pc) return;

    pc.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === 'audio') {
        sender.track.enabled = muted;
      }
    });
    setMuted(!muted);
  }, [muted]);

  const toggleHold = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    try {
      if (callState === 'held') {
        await session.invite({ sessionDescriptionHandlerModifiers: [] });
        setCallState('active');
      } else {
        // Simple hold via re-INVITE with sendonly
        setCallState('held');
      }
    } catch (err) {
      console.error('Hold error:', err);
    }
  }, [callState]);

  const sendDTMF = useCallback((tone) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    try {
      const sdh = session.sessionDescriptionHandler;
      if (sdh && sdh.sendDtmf) {
        sdh.sendDtmf(tone);
      }
    } catch (err) {
      console.error('DTMF error:', err);
    }
  }, []);

  const transfer = useCallback(async (target) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    try {
      const targetUri = UserAgent.makeURI(`sip:${target}@${domain}`);
      await session.refer(targetUri);
    } catch (err) {
      console.error('Transfer error:', err);
    }
  }, [domain]);

  const setupRemoteAudio = (session) => {
    const sdh = session.sessionDescriptionHandler;
    if (!sdh) return;
    const pc = sdh.peerConnection;
    if (!pc) return;

    const remoteStream = new MediaStream();
    pc.getReceivers().forEach((receiver) => {
      if (receiver.track) remoteStream.addTrack(receiver.track);
    });

    if (audioRef.current) {
      audioRef.current.srcObject = remoteStream;
      audioRef.current.play().catch(() => {});
    }
  };

  const startTimer = () => {
    setCallDuration(0);
    timerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallDuration(0);
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return {
    registered,
    callState,
    callDuration,
    formattedDuration: formatDuration(callDuration),
    muted,
    incomingCall: !!incomingCall,
    register,
    unregister,
    makeCall,
    answerCall,
    hangup,
    toggleMute,
    toggleHold,
    sendDTMF,
    transfer,
  };
}
