import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiMic,
  FiMicOff,
  FiMinus,
  FiPause,
  FiPlay,
  FiRefreshCw,
  FiSend,
  FiShoppingBag,
  FiSliders,
  FiSquare,
  FiVolume2,
  FiVolumeX,
  FiX,
} from 'react-icons/fi';
import { useCart } from '../context/CartContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { API_BASE, apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './VoiceButton.css';

const GREETINGS = {
  'en-IN':
    "Hi! I'm your HRUVITA AI Bowl Nutritionist & Voice Assistant. Tap a health goal below to build a custom bowl, reorder your last order in 1 tap, or speak/type anytime!",
  'te-IN':
    'నమస్కారం! నేను మీ HRUVITA AI న్యూట్రిషనిస్ట్ & వాయిస్ అసిస్టెంట్. మీ ఆరోగ్య లక్ష్యం ఎంచుకుని కస్టమ్ బౌల్ తయారు చేసుకోండి లేదా మీ పాత ఆర్డర్‌ను మళ్ళీ ఆర్డర్ చేయండి!',
};

const NUTRITIONIST_GOALS = [
  {
    id: 'protein',
    label: '💪 High Protein',
    promptEn: 'Build me a high-protein custom fruit bowl, show its nutrition & price, and add it to cart.',
    promptTe: 'నాకు హై-ప్రోటీన్ కస్టమ్ ఫ్రూట్ బౌల్ తయారు చేసి కార్ట్‌లో యాడ్ చేయండి.',
  },
  {
    id: 'weight-loss',
    label: '🔥 Weight Loss',
    promptEn: 'Build me a low-calorie weight-loss custom fruit bowl, show its nutrition & price, and add it to cart.',
    promptTe: 'నాకు తక్కువ క్యాలరీల వెయిట్-లాస్ కస్టమ్ ఫ్రూట్ బౌల్ తయారు చేసి కార్ట్‌లో యాడ్ చేయండి.',
  },
  {
    id: 'immunity',
    label: '🛡️ Immunity Boost',
    promptEn: 'Build me a vitamin-C immunity boost custom fruit bowl, show its nutrition & price, and add it to cart.',
    promptTe: 'నాకు ఇమ్యూనిటీ బూస్ట్ కస్టమ్ ఫ్రూట్ బౌల్ తయారు చేసి కార్ట్‌లో యాడ్ చేయండి.',
  },
  {
    id: 'low-sugar',
    label: '🩺 Low Sugar',
    promptEn: 'Build me a diabetic-friendly low-sugar custom fruit bowl, show its nutrition & price, and add it to cart.',
    promptTe: 'నాకు తక్కువ షుగర్ ఉన్న కస్టమ్ ఫ్రూట్ బౌల్ తయారు చేసి కార్ట్‌లో యాడ్ చేయండి.',
  },
];

const FEMALE_VOICE_HINTS =
  /(shruti|neerja|heera|veena|lekha|aditi|raveena|kanya|samantha|zira|female|google.*తెలుగు|google.*हिन्दी|google uk english female)/i;
const MALE_VOICE_HINTS = /(mohan|prabhat|ravi|hemant|david|mark|daniel|george|rishi|\bmale\b)/i;

const devLog = (tag, msg, data = null) => {
  if (import.meta.env.DEV) {
    if (data !== null) console.log(`[${tag}] ${msg}`, data);
    else console.log(`[${tag}] ${msg}`);
  }
};

export default function VoiceButton() {
  const navigate = useNavigate();
  const { items, customBowls, add, setQty, addCustomBowl, clear } = useCart();
  const { settings } = useCatalog();
  const { user, selectedAddressId, setSelectedAddressId } = useAuth();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [lang, setLang] = useState('en-IN');
  const [mode, setMode] = useState('text'); // 'text' | 'ptt' | 'handsfree'
  const [personalization, setPersonalization] = useState(() => {
    try {
      return localStorage.getItem('hruvita_ai_personalize') !== '0';
    } catch {
      return true;
    }
  });
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [pausedAudio, setPausedAudio] = useState(false);
  const [lastSpoken, setLastSpoken] = useState({ text: '', lang: 'en-IN' });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [assistantState, setAssistantState] = useState('IDLE'); // IDLE | GREETING | LISTENING | PROCESSING | SPEAKING | ENDING | CLOSED
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: GREETINGS['en-IN'],
      lang: 'en-IN',
      actions: [],
      products: [],
    },
  ]);

  // Lifecycle & concurrency refs (prevent duplicate sessions or stale closures)
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const messagesEndRef = useRef(null);
  const handsFreeRef = useRef(false);
  const modeRef = useRef('text');
  const openRef = useRef(false);
  const voiceActiveRef = useRef(false);
  const speakingRef = useRef(false);
  const closingSessionRef = useRef(false);
  const greetedSessionRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const stateRef = useRef('IDLE');
  const chatAbortRef = useRef(null);
  const ttsAbortRef = useRef(null);
  const inFlightRef = useRef(false);

  const transitionState = useCallback((next) => {
    stateRef.current = next;
    setAssistantState(next);
    devLog('HRUVITA-STATE', `State -> ${next}`);
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    handsFreeRef.current = mode === 'handsfree';
  }, [mode]);

  useEffect(() => {
    openRef.current = open && !minimized;
  }, [open, minimized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, open]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const stopAllSpeech = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = '';
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    speakingRef.current = false;
    setSpeaking(false);
    setPausedAudio(false);
  }, []);

  const stopListening = useCallback(() => {
    clearRetryTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
    setInterimText('');
  }, [clearRetryTimer]);

  const resetAndCloseAssistant = useCallback(() => {
    transitionState('CLOSED');
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    inFlightRef.current = false;
    setBusy(false);
    closingSessionRef.current = false;
    greetedSessionRef.current = false;
    voiceActiveRef.current = false;
    retryCountRef.current = 0;
    stopListening();
    stopAllSpeech();
    setConversationId('');
    setMessages([
      {
        role: 'assistant',
        text: GREETINGS[lang],
        lang,
        actions: [],
        products: [],
      },
    ]);
    setOpen(false);
    setMinimized(false);
  }, [lang, stopListening, stopAllSpeech, transitionState]);

  // Cleanup on unmount or drawer close/minimize
  useEffect(() => {
    if (!open || minimized) {
      voiceActiveRef.current = false;
      retryCountRef.current = 0;
      stopListening();
      if (!open) {
        stopAllSpeech();
        greetedSessionRef.current = false;
        closingSessionRef.current = false;
        transitionState('IDLE');
      }
    }
  }, [open, minimized, stopListening, stopAllSpeech, transitionState]);

  const switchConversationMode = (nextMode) => {
    // Properly stop previous mode & cancel any pending requests before starting the newly selected mode
    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
      chatAbortRef.current = null;
    }
    inFlightRef.current = false;
    setBusy(false);
    stopListening();
    stopAllSpeech();
    retryCountRef.current = 0;
    closingSessionRef.current = false;
    setMode(nextMode);
    modeRef.current = nextMode;
    handsFreeRef.current = nextMode === 'handsfree';

    if (nextMode === 'text') {
      voiceActiveRef.current = false;
      transitionState('IDLE');
      devLog('HRUVITA-VOICE', 'Switched to Text mode (mic & voice stopped)');
      return;
    }

    const welcomeText =
      lang === 'te-IN'
        ? 'నమస్కారం! HRUVITA కి స్వాగతం. ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?'
        : 'Hello! Welcome! How can I help you today?';

    if (nextMode === 'ptt') {
      // Push-to-Talk: greet & activate mic for FIRST interaction, then wait for next manual click
      voiceActiveRef.current = false;
      transitionState('GREETING');
      devLog('HRUVITA-VOICE', 'Switched to Push-to-Talk mode');
      speakFemaleVoice(welcomeText, lang, {
        skipAutoListen: true,
        onFinished: () => {
          if (openRef.current && modeRef.current === 'ptt' && !closingSessionRef.current) {
            beginListeningRef.current(lang);
          }
        },
      });
    } else if (nextMode === 'handsfree') {
      voiceActiveRef.current = true;
      transitionState('GREETING');
      devLog('HRUVITA-VOICE', 'Switched to Hands-Free mode');
      if (!greetedSessionRef.current) {
        greetedSessionRef.current = true;
        speakFemaleVoice(welcomeText, lang);
      } else {
        beginListeningRef.current(lang);
      }
    }
  };

  useEffect(() => {
    return () => {
      voiceActiveRef.current = false;
      if (chatAbortRef.current) chatAbortRef.current.abort();
      stopListening();
      stopAllSpeech();
    };
  }, [stopListening, stopAllSpeech]);

  // Fetch personalized greeting when user opens drawer or switches language
  useEffect(() => {
    if (!open) return;
    apiRequest(
      `/api/assistant/greeting?lang=${encodeURIComponent(lang)}&personalization=${
        personalization ? '1' : '0'
      }`
    )
      .then((data) => {
        if (data?.greeting) {
          setMessages((prev) => {
            if (prev.length === 1 && prev[0].role === 'assistant') {
              return [{ role: 'assistant', text: data.greeting, lang, actions: [], products: [] }];
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, [open, lang, personalization, user?.id]);

  // Fallback Server-side Audio Capture + Groq Whisper STT (for Firefox/Safari)
  const startServerWhisperCapture = useCallback(
    async (forceLang) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast('Microphone is unavailable in this browser. Please type below.', 'error');
        setMode('text');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        setListening(true);
        devLog('HRUVITA-VOICE', 'Server Whisper STT capture started');

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setListening(false);
          if (chunks.length === 0) return;
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = String(reader.result || '').split(',')[1] || '';
            if (!base64) return;
            try {
              const sttRes = await apiRequest('/api/assistant/stt', {
                method: 'POST',
                body: JSON.stringify({
                  audioBase64: base64,
                  mimeType: blob.type,
                  language: forceLang || lang,
                }),
              });
              if (sttRes.text?.trim()) {
                devLog('HRUVITA-STT', `Whisper transcript: ${sttRes.text}`);
                sendMessageRef.current(sttRes.text.trim());
              }
            } catch (err) {
              devLog('HRUVITA-ERROR', `Server STT failed: ${err.message}`);
              showToast('Could not transcribe audio. Please type below.', 'error');
            }
          };
          reader.readAsDataURL(blob);
        };

        recorder.start();
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, 6000);
      } catch {
        setListening(false);
        voiceActiveRef.current = false;
        showToast('Microphone permission denied. Please type your request.', 'error');
        setMode('text');
      }
    },
    [lang, showToast]
  );

  const beginListening = useCallback(
    (forceLang) => {
      if (typeof window === 'undefined' || !openRef.current || speakingRef.current) return;
      clearRetryTimer();

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        startServerWhisperCapture(forceLang);
        return;
      }

      // Guarantee single active session (prevent duplicate listeners)
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }

      const targetLang = forceLang || lang;
      const rec = new SpeechRecognition();
      rec.lang = targetLang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      let finalTranscript = '';

      rec.onstart = () => {
        transitionState('LISTENING');
        setListening(true);
        setInterimText('');
        devLog('HRUVITA-VOICE', `Microphone active (${targetLang})`);
      };

      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalTranscript += ` ${piece}`;
          } else {
            interim += piece;
          }
        }
        setInterimText(interim.trim());

        if (finalTranscript.trim()) {
          const cleanTranscript = finalTranscript.trim();
          retryCountRef.current = 0;
          setInterimText('');
          devLog('HRUVITA-STT', `Transcript: "${cleanTranscript}"`);
          stopListening();
          sendMessageRef.current(cleanTranscript);
        }
      };

      rec.onerror = (ev) => {
        setListening(false);
        setInterimText('');
        const errCode = ev.error || 'unknown';
        devLog('HRUVITA-ERROR', `Speech recognition error: ${errCode}`);

        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          voiceActiveRef.current = false;
          retryCountRef.current = 0;
          showToast('Microphone permission denied. You can type your request below.', 'error');
          setMode('text');
          return;
        }

        if (errCode === 'aborted') return;

        // Bounded automatic recovery for temporary no-speech / network / audio-capture hiccups
        if (voiceActiveRef.current && handsFreeRef.current && openRef.current && !speakingRef.current) {
          retryCountRef.current += 1;
          if (retryCountRef.current <= 3) {
            devLog('HRUVITA-VOICE', `Recovering microphone (attempt ${retryCountRef.current}/3)...`);
            retryTimerRef.current = setTimeout(() => {
              beginListeningRef.current(targetLang);
            }, 450);
          } else {
            voiceActiveRef.current = false;
            retryCountRef.current = 0;
            showToast('Voice paused after silence. Tap the mic anytime or type below.');
          }
        }
      };

      rec.onend = () => {
        setListening(false);
        setInterimText('');
        if (
          !finalTranscript.trim() &&
          voiceActiveRef.current &&
          handsFreeRef.current &&
          openRef.current &&
          !speakingRef.current &&
          retryCountRef.current < 3
        ) {
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            beginListeningRef.current(targetLang);
          }, 350);
        }
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch (err) {
        setListening(false);
        devLog('HRUVITA-ERROR', `Failed to start SpeechRecognition: ${err.message}`);
      }
    },
    [lang, showToast, stopListening, clearRetryTimer, startServerWhisperCapture]
  );

  const beginListeningRef = useRef(beginListening);
  beginListeningRef.current = beginListening;

  const toggleMicManual = () => {
    stopAllSpeech();
    if (listening) {
      voiceActiveRef.current = false;
      retryCountRef.current = 0;
      stopListening();
      devLog('HRUVITA-VOICE', 'Microphone stopped by user');
    } else {
      voiceActiveRef.current = true;
      retryCountRef.current = 0;
      beginListening(lang);
    }
  };

  const speakFemaleBrowserFallback = (text, speechLang, { onFinished, skipAutoListen = false } = {}) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      speakingRef.current = false;
      if (onFinished) onFinished();
      else if (!skipAutoListen && handsFreeRef.current && voiceActiveRef.current && !closingSessionRef.current && openRef.current) {
        setTimeout(() => beginListeningRef.current(speechLang), 300);
      }
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    const prefix = speechLang.slice(0, 2).toLowerCase();
    const femaleMatches = voices.filter(
      (v) =>
        v.lang.toLowerCase().startsWith(prefix) &&
        FEMALE_VOICE_HINTS.test(v.name) &&
        !MALE_VOICE_HINTS.test(v.name)
    );
    const chosen =
      femaleMatches[0] ||
      voices.find(
        (v) => FEMALE_VOICE_HINTS.test(v.name) && !MALE_VOICE_HINTS.test(v.name) && v.lang.includes('IN')
      );

    if (!chosen) {
      speakingRef.current = false;
      if (onFinished) onFinished();
      else if (!skipAutoListen && handsFreeRef.current && voiceActiveRef.current && !closingSessionRef.current && openRef.current) {
        setTimeout(() => beginListeningRef.current(speechLang), 300);
      }
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = chosen;
    utter.lang = speechLang;
    utter.rate = 0.96;
    utter.pitch = 1.06;
    utter.onstart = () => {
      speakingRef.current = true;
      setSpeaking(true);
    };
    utter.onend = () => {
      speakingRef.current = false;
      setSpeaking(false);
      if (onFinished) onFinished();
      else if (!skipAutoListen && handsFreeRef.current && voiceActiveRef.current && !closingSessionRef.current && openRef.current) {
        setTimeout(() => beginListeningRef.current(speechLang), 300);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  const speakFemaleVoice = async (text, speechLang, { onFinished, skipAutoListen = false } = {}) => {
    setLastSpoken({ text, lang: speechLang });

    // In Text Mode, NEVER speak any voice responses!
    if (modeRef.current === 'text' || muted || !text) {
      speakingRef.current = false;
      if (onFinished) onFinished();
      else if (
        modeRef.current !== 'text' &&
        !skipAutoListen &&
        handsFreeRef.current &&
        voiceActiveRef.current &&
        !closingSessionRef.current &&
        openRef.current
      ) {
        setTimeout(() => beginListeningRef.current(speechLang), 300);
      }
      return;
    }

    stopListening();
    stopAllSpeech();
    speakingRef.current = true;

    try {
      const tts0 = Date.now();
      const ttsController = new AbortController();
      ttsAbortRef.current = ttsController;
      devLog('HRUVITA-TTS', `Requesting female voice (${speechLang})`);
      const resp = await fetch(`${API_BASE}/api/assistant/tts`, {
        method: 'POST',
        signal: ttsController.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: speechLang }),
      });

      if (!resp.ok) throw new Error('Neural TTS unavailable');
      devLog('HRUVITA-TTS', `Female voice ready in ${Date.now() - tts0}ms`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => {
        speakingRef.current = true;
        setSpeaking(true);
        setPausedAudio(false);
      };
      audio.onpause = () => {
        if (!audio.ended && audio.currentTime > 0) setPausedAudio(true);
      };
      audio.onended = () => {
        speakingRef.current = false;
        setSpeaking(false);
        setPausedAudio(false);
        if (onFinished) {
          onFinished();
        } else if (
          !skipAutoListen &&
          handsFreeRef.current &&
          voiceActiveRef.current &&
          !closingSessionRef.current &&
          openRef.current
        ) {
          setTimeout(() => beginListeningRef.current(speechLang), 300);
        }
      };
      await audio.play();
    } catch {
      speakFemaleBrowserFallback(text, speechLang, { onFinished, skipAutoListen });
    }
  };

  const togglePauseResumeAudio = () => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
        speakingRef.current = true;
        setPausedAudio(false);
        setSpeaking(true);
      } else {
        audioRef.current.pause();
        speakingRef.current = false;
        setPausedAudio(true);
        setSpeaking(false);
      }
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        speakingRef.current = true;
        setPausedAudio(false);
        setSpeaking(true);
      } else {
        window.speechSynthesis.pause();
        speakingRef.current = false;
        setPausedAudio(true);
        setSpeaking(false);
      }
    }
  };

  const sendMessage = async (textToSend) => {
    const clean = String(textToSend || '').trim();
    if (!clean || busy || inFlightRef.current || stateRef.current === 'CLOSED') return;

    inFlightRef.current = true;
    if (chatAbortRef.current) chatAbortRef.current.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    const turn0 = Date.now();
    devLog('HRUVITA-AI', `Sending customer message: "${clean}"`);
    transitionState('PROCESSING');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: clean, actions: [], products: [] }]);
    setBusy(true);

    try {
      const data = await apiRequest('/api/assistant/chat', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          message: clean,
          language: lang,
          conversationId,
          cartItems: items,
          customBowls,
          selectedAddressId,
          personalizationEnabled: personalization,
        }),
      });

      if (data.conversationId) setConversationId(data.conversationId);

      // Execute safe structured website, cart, payment & navigation actions
      const hasOrderPlaced = (data.actions || []).some(
        (x) => x.type === 'ORDER_PLACED' || x.type === 'CLEAR_CART'
      );
      for (const act of data.actions || []) {
        if (act.type === 'ADD_TO_CART' && act.productId) {
          devLog('HRUVITA-CART', `Adding product ${act.productId} x ${act.qty || 1}`);
          add(act.productId, act.qty || 1);
          showToast(`Added ${act.qty || 1} × ${act.productName} to cart.`);
        } else if (act.type === 'UPDATE_CART_QTY' && act.productId) {
          devLog('HRUVITA-CART', `Updating quantity ${act.productId} -> ${act.qty}`);
          setQty(act.productId, act.qty ?? 0);
          showToast(`Updated ${act.productName} quantity to ${act.qty}.`);
        } else if (act.type === 'ADD_CUSTOM_BOWL' && act.bowl) {
          devLog('HRUVITA-CART', `Adding custom bowl: ${act.bowl.name}`);
          addCustomBowl(act.bowl);
          showToast(`Added ${act.bowl.name} to cart.`);
        } else if (act.type === 'SELECT_ADDRESS' && act.addressId) {
          setSelectedAddressId(act.addressId);
          showToast('Delivery address selected.');
        } else if (act.type === 'SET_PAYMENT_METHOD' && act.method) {
          devLog('HRUVITA-PAYMENT', `Payment method selected: ${act.method}`);
          window.dispatchEvent(new CustomEvent('hruvita:set-payment', { detail: act.method }));
          if (!hasOrderPlaced) {
            navigate(`/cart?pay=${act.method}`);
          }
        } else if (act.type === 'CLEAR_CART') {
          devLog('HRUVITA-CART', 'Cart cleared');
          clear();
        } else if (act.type === 'ORDER_PLACED') {
          window.dispatchEvent(new CustomEvent('hruvita:order-placed', { detail: act.orderId }));
          navigate('/dashboard?tab=orders');
        } else if (act.type === 'NAVIGATE' && act.to) {
          const hasPayOverride = (data.actions || []).some((x) => x.type === 'SET_PAYMENT_METHOD');
          if (!(hasPayOverride && act.to === '/cart')) {
            devLog('HRUVITA-NAVIGATION', `Navigating to ${act.to}`);
            navigate(act.to);
          }
        } else if (act.type === 'OPEN_RAZORPAY_CHECKOUT') {
          devLog('HRUVITA-PAYMENT', 'Opening secure Razorpay checkout');
          navigate('/cart?pay=razorpay');
        }
      }

      devLog('HRUVITA-PERFORMANCE', `Total roundtrip: ${Date.now() - turn0}ms`, {
        toolsUsed: data.toolsUsed,
        language: data.language,
      });

      const isEnding = (data.actions || []).some((a) => a.type === 'END_CONVERSATION');
      if (isEnding) {
        transitionState('ENDING');
        closingSessionRef.current = true;
        voiceActiveRef.current = false;
        stopListening();
        devLog('HRUVITA-VOICE', 'Goodbye detected — closing conversation after farewell');
      }

      const replyLang = data.language || lang;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply,
          lang: replyLang,
          actions: data.actions || [],
          products: data.recommendedProducts || [],
          orders: data.recommendedOrders || [],
        },
      ]);

      if (isEnding) {
        if (modeRef.current === 'text') {
          setTimeout(() => resetAndCloseAssistant(), 1600);
        } else {
          await speakFemaleVoice(data.reply, replyLang, {
            skipAutoListen: true,
            onFinished: () => {
              setTimeout(() => resetAndCloseAssistant(), 450);
            },
          });
        }
      } else if (modeRef.current !== 'text') {
        transitionState('SPEAKING');
        await speakFemaleVoice(data.reply, replyLang);
      } else {
        transitionState('IDLE');
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      transitionState('IDLE');
      devLog('HRUVITA-ERROR', `Assistant request failed: ${err.message}`);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err.message || 'Sorry, I could not connect right now.',
          lang,
          actions: [],
          products: [],
        },
      ]);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  if (!user || settings?.aiEnabled === false) {
    return null;
  }

  const quickPrompts =
    lang === 'te-IN'
      ? ['నా లాస్ట్ ఆర్డర్ మళ్ళీ ఆర్డర్ చేయండి', 'హై ప్రోటీన్ బౌల్ తయారు చేయండి', 'బౌల్ బిల్డర్ ఓపెన్ చేయండి', 'చెక్ అవుట్ ఓపెన్ చేయండి']
      : ['Reorder my last order', 'High protein bowl', 'Open Bowl Builder', 'Open checkout'];

  const handleLanguageSwitch = (nextLang) => {
    setLang(nextLang);
    stopAllSpeech();
    setMessages((prev) =>
      prev.length <= 1
        ? [{ role: 'assistant', text: GREETINGS[nextLang], lang: nextLang, actions: [], products: [] }]
        : prev
    );
  };

  return (
    <div className="voice-wrap">
      {open && !minimized && (
        <div className="voice-drawer" role="dialog" aria-label="HRUVITA AI Voice Assistant">
          <div className="voice-head">
            <div className="voice-head-left">
              <div className="voice-avatar" aria-hidden="true">
                👩🏽‍🍳
              </div>
              <div className="voice-head-title">
                <strong>{settings?.aiName || 'HRUVITA AI'}</strong>
                <span>
                  {speaking
                    ? 'Speaking...'
                    : listening
                    ? 'Listening...'
                    : busy
                    ? 'Thinking...'
                    : 'AI Bowl Nutritionist & Voice Reorder'}
                </span>
              </div>
            </div>
            <div className="voice-head-controls">
              <button
                type="button"
                className={`voice-lang-btn ${lang === 'en-IN' ? 'voice-lang-active' : ''}`.trim()}
                onClick={() => handleLanguageSwitch('en-IN')}
              >
                EN
              </button>
              <button
                type="button"
                className={`voice-lang-btn ${lang === 'te-IN' ? 'voice-lang-active' : ''}`.trim()}
                onClick={() => handleLanguageSwitch('te-IN')}
              >
                తెలుగు
              </button>
              <button
                type="button"
                className="voice-icon-small"
                onClick={() => {
                  if (!muted) stopAllSpeech();
                  setMuted((m) => !m);
                }}
                aria-label={muted ? 'Unmute voice output' : 'Mute voice output'}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <FiVolumeX size={14} /> : <FiVolume2 size={14} />}
              </button>
              <button
                type="button"
                className="voice-icon-small"
                onClick={() => setMinimized(true)}
                aria-label="Minimize assistant"
                title="Minimize"
              >
                <FiMinus size={14} />
              </button>
              <button
                type="button"
                className="voice-icon-small"
                onClick={() => resetAndCloseAssistant()}
                aria-label="Close assistant"
                title="Close"
              >
                <FiX size={14} />
              </button>
            </div>
          </div>

          <div className="voice-mode-bar">
            <div className="voice-mode-pills" role="group" aria-label="Conversation mode">
              {[
                { id: 'text', label: 'Text' },
                { id: 'ptt', label: 'Push-to-Talk' },
                { id: 'handsfree', label: 'Hands-Free' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`voice-mode-pill ${mode === m.id ? 'voice-mode-active' : ''}`.trim()}
                  onClick={() => switchConversationMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`voice-pers-btn ${personalization ? 'voice-pers-on' : ''}`.trim()}
              onClick={() => {
                const next = !personalization;
                setPersonalization(next);
                try {
                  localStorage.setItem('hruvita_ai_personalize', next ? '1' : '0');
                } catch {
                  /* ignore */
                }
                showToast(next ? 'Personalization enabled.' : 'Personalization paused.');
              }}
              title="Toggle personalized food suggestions"
            >
              <FiSliders size={11} /> {personalization ? 'Personal' : 'Guest'}
            </button>
          </div>

          {(speaking || pausedAudio || lastSpoken.text) && (
            <div className="voice-player-bar">
              <div className={`voice-wave ${speaking ? 'voice-wave-active' : ''}`} aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="voice-player-actions">
                {(speaking || pausedAudio) && (
                  <>
                    <button
                      type="button"
                      className="voice-ctrl-btn"
                      onClick={togglePauseResumeAudio}
                      aria-label={pausedAudio ? 'Resume voice' : 'Pause voice'}
                    >
                      {pausedAudio ? <FiPlay size={12} /> : <FiPause size={12} />}
                    </button>
                    <button
                      type="button"
                      className="voice-ctrl-btn"
                      onClick={stopAllSpeech}
                      aria-label="Stop voice"
                    >
                      <FiSquare size={11} />
                    </button>
                  </>
                )}
                {lastSpoken.text && !speaking && (
                  <button
                    type="button"
                    className="voice-ctrl-btn"
                    onClick={() => speakFemaleVoice(lastSpoken.text, lastSpoken.lang)}
                    aria-label="Replay last response"
                  >
                    <FiRefreshCw size={12} /> Replay
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="voice-nutrition-bar">
            <div className="voice-nutrition-head">
              <span>🥗 AI Bowl Nutritionist</span>
              <button
                type="button"
                className="voice-reorder-btn"
                disabled={busy}
                onClick={() => {
                  voiceActiveRef.current = false;
                  sendMessage(
                    lang === 'te-IN'
                      ? 'నా లాస్ట్ ఆర్డర్ మళ్ళీ ఆర్డర్ చేయండి'
                      : 'Reorder my previous order into my cart'
                  );
                }}
              >
                <FiRefreshCw size={11} /> 1-Tap Reorder
              </button>
            </div>
            <div className="voice-goal-grid">
              {NUTRITIONIST_GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="voice-goal-btn"
                  disabled={busy}
                  onClick={() => {
                    voiceActiveRef.current = false;
                    sendMessage(lang === 'te-IN' ? g.promptTe : g.promptEn);
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="voice-messages">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`voice-msg ${
                  m.role === 'user' ? 'voice-msg-user' : 'voice-msg-assistant'
                }`.trim()}
              >
                <div>{m.text}</div>

                {m.orders?.length > 0 && (
                  <div className="voice-order-cards">
                    {m.orders.map((ord) => {
                      const st = String(ord.status || 'Confirmed').toLowerCase();
                      const statusEmoji = st.includes('deliver')
                        ? '🎉'
                        : st.includes('out')
                        ? '🛵'
                        : st.includes('process')
                        ? '👨‍🍳'
                        : st.includes('cancel')
                        ? '❌'
                        : '✅';
                      const statusClass = st.includes('cancel')
                        ? 'voice-order-status-danger'
                        : st.includes('deliver')
                        ? 'voice-order-status-done'
                        : 'voice-order-status-active';
                      return (
                        <div key={ord.id} className="voice-order-card">
                          <div className="voice-order-top">
                            <strong>#{ord.id}</strong>
                            <span className={`voice-order-status ${statusClass}`.trim()}>
                              {statusEmoji} {ord.status}
                            </span>
                          </div>
                          <div className="voice-order-items">🍽️ {ord.items}</div>
                          <div className="voice-order-meta">
                            <span>💰 <strong>{money(ord.total)}</strong></span>
                            <span>📅 {ord.scheduledDate}</span>
                          </div>
                          <div className="voice-order-slot">⏰ {ord.slotLabel}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {m.products?.length > 0 && (
                  <div className="voice-prod-cards">
                    {m.products.map((p) => (
                      <div key={p.id} className="voice-prod-card">
                        {p.image && <img src={p.image} alt={p.name} loading="lazy" />}
                        <div className="voice-prod-info">
                          <Link to={`/product/${p.id}`}>
                            <strong>{p.name}</strong>
                          </Link>
                          <span>{money(p.price)}</span>
                        </div>
                        <button
                          type="button"
                          className="voice-prod-add"
                          disabled={p.stock <= 0}
                          onClick={() => {
                            add(p.id, 1);
                            showToast(`Added ${p.name} to cart.`);
                          }}
                        >
                          {p.stock > 0 ? '+ Add' : 'Out'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {m.actions?.some(
                  (a) =>
                    a.type === 'ADD_TO_CART' ||
                    a.type === 'ADD_CUSTOM_BOWL' ||
                    a.type === 'OPEN_CART_SUGGESTION'
                ) && (
                  <div className="voice-action-cta">
                    <Link to="/cart" className="voice-action-pill" onClick={() => setMinimized(true)}>
                      <FiShoppingBag size={12} /> Open Checkout
                    </Link>
                  </div>
                )}

                {m.actions
                  ?.filter((a) => a.type === 'NAVIGATE' && a.to)
                  .map((a) => (
                    <div key={`${a.to}-${a.label}`} className="voice-action-cta">
                      <Link to={a.to} className="voice-action-pill">
                        {a.label} &rarr;
                      </Link>
                    </div>
                  ))}
              </div>
            ))}

            {busy && (
              <div className="voice-msg voice-msg-assistant voice-thinking">
                <span className="voice-dots">
                  <i />
                  <i />
                  <i />
                </span>
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="voice-quick-chips">
            {quickPrompts.map((chip) => (
              <button
                key={chip}
                type="button"
                className="voice-chip"
                onClick={() => {
                  voiceActiveRef.current = false;
                  sendMessage(chip);
                }}
                disabled={busy}
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            className="voice-input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              voiceActiveRef.current = false;
              sendMessage(input);
            }}
          >
            {mode !== 'text' && (
              <button
                type="button"
                className={`voice-mic-btn ${listening ? 'voice-mic-listening' : ''}`.trim()}
                onClick={toggleMicManual}
                aria-label={listening ? 'Stop listening' : 'Speak in Telugu or English'}
                title={listening ? 'Listening... tap to stop' : 'Tap to speak'}
              >
                {listening ? <FiMicOff size={17} /> : <FiMic size={17} />}
              </button>
            )}
            <input
              id="voice-chat-input"
              type="text"
              value={interimText || input}
              onChange={(e) => {
                setInterimText('');
                setInput(e.target.value);
              }}
              placeholder={
                listening
                  ? 'Listening... speak now'
                  : lang === 'te-IN'
                  ? 'తెలుగు లేదా ఇంగ్లీష్‌లో మాట్లాడండి లేదా టైప్ చేయండి...'
                  : 'Ask or order (e.g. Open Idli)...'
              }
            />
            <button
              type="submit"
              className="voice-send-btn"
              disabled={busy || !input.trim()}
              aria-label="Send message"
            >
              <FiSend size={15} />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className={`voice-fab ${listening ? 'voice-fab-listening' : ''} ${
          speaking ? 'voice-fab-speaking' : ''
        }`.trim()}
        onClick={() => {
          if (!open) {
            setOpen(true);
            setMinimized(false);
          } else if (minimized) {
            setMinimized(false);
          } else {
            resetAndCloseAssistant();
          }
        }}
        aria-label={open && !minimized ? 'Close HRUVITA AI Assistant' : 'Open HRUVITA AI Assistant'}
        title="HRUVITA AI — Telugu & English Assistant"
      >
        {open && !minimized ? <FiX size={24} /> : <FiMic size={24} />}
      </button>
    </div>
  );
}
