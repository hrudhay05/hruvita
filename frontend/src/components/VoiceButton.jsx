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
  'en-IN': 'Hello! Welcome to HRUVITA. What would you like to eat today?',
  'te-IN': 'నమస్కారం! HRUVITA కి స్వాగతం. ఈరోజు మీకు ఏమి కావాలి?',
};

const FEMALE_VOICE_HINTS =
  /(shruti|neerja|heera|veena|lekha|aditi|raveena|kanya|samantha|zira|female|google.*తెలుగు|google.*हिन्दी|google uk english female)/i;
const MALE_VOICE_HINTS = /(mohan|prabhat|ravi|hemant|david|mark|daniel|george|rishi|\bmale\b)/i;

export default function VoiceButton() {
  const navigate = useNavigate();
  const { items, customBowls, add, setQty, addCustomBowl, clear } = useCart();
  const { settings } = useCatalog();
  const { user, selectedAddressId } = useAuth();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [lang, setLang] = useState('en-IN');
  const [mode, setMode] = useState('handsfree'); // 'text' | 'ptt' | 'handsfree' (auto-listen after reply)
  const [personalization, setPersonalization] = useState(() => {
    try {
      return localStorage.getItem('hruvita_ai_personalize') !== '0';
    } catch {
      return true;
    }
  });
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [pausedAudio, setPausedAudio] = useState(false);
  const [lastSpoken, setLastSpoken] = useState({ text: '', lang: 'en-IN' });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
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

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const messagesEndRef = useRef(null);
  const handsFreeRef = useRef(false);
  const openRef = useRef(false);

  useEffect(() => {
    handsFreeRef.current = mode === 'handsfree';
  }, [mode]);

  useEffect(() => {
    openRef.current = open && !minimized;
  }, [open, minimized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, open]);

  const stopAllSpeech = useCallback(() => {
    if (audioRef.current) {
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
    setSpeaking(false);
    setPausedAudio(false);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setListening(false);
  }, []);

  useEffect(() => {
    if (!open || minimized) {
      stopListening();
      if (!open) stopAllSpeech();
    }
  }, [open, minimized, stopListening, stopAllSpeech]);

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

  if (settings?.aiEnabled === false) {
    return null;
  }

  const beginListening = useCallback(
    (forceLang) => {
      if (typeof window === 'undefined' || !openRef.current) return;
      stopAllSpeech();

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        showToast('Voice recognition works best in Chrome. Please type your message below.', 'error');
        return;
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
      }

      const rec = new SpeechRecognition();
      rec.lang = forceLang || lang;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = (ev) => {
        setListening(false);
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          showToast('Microphone permission denied. You can type your request anytime.', 'error');
          setMode('text');
        } else if (ev.error === 'no-speech' && handsFreeRef.current && openRef.current) {
          setTimeout(() => beginListeningRef.current(forceLang || lang), 300);
        } else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
          showToast('Could not hear clearly. Please repeat or type below.', 'error');
        }
      };
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript.trim()) {
          setListening(false);
          sendMessageRef.current(transcript);
        }
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch {
        setListening(false);
      }
    },
    [lang, showToast, stopAllSpeech]
  );

  const beginListeningRef = useRef(beginListening);
  beginListeningRef.current = beginListening;

  const toggleMicManual = () => {
    if (listening) {
      stopListening();
    } else {
      beginListening(lang);
    }
  };

  const speakFemaleBrowserFallback = (text, speechLang) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (handsFreeRef.current && openRef.current) {
        setTimeout(() => beginListeningRef.current(speechLang), 250);
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

    // Never silently switch to a male voice — still continue hands-free listening
    if (!chosen) {
      if (handsFreeRef.current && openRef.current) {
        setTimeout(() => beginListeningRef.current(speechLang), 250);
      }
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = chosen;
    utter.lang = speechLang;
    utter.rate = 0.96;
    utter.pitch = 1.06;
    utter.onstart = () => setSpeaking(true);
    utter.onend = () => {
      setSpeaking(false);
      if (handsFreeRef.current && openRef.current) {
        setTimeout(() => beginListeningRef.current(speechLang), 250);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  const speakFemaleVoice = async (text, speechLang) => {
    setLastSpoken({ text, lang: speechLang });
    if (muted || !text) {
      if (handsFreeRef.current && openRef.current) {
        setTimeout(() => beginListeningRef.current(speechLang), 300);
      }
      return;
    }
    stopAllSpeech();

    try {
      const resp = await fetch(`${API_BASE}/api/assistant/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: speechLang }),
      });

      if (!resp.ok) throw new Error('Neural TTS unavailable');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => {
        setSpeaking(true);
        setPausedAudio(false);
      };
      audio.onpause = () => {
        if (!audio.ended && audio.currentTime > 0) setPausedAudio(true);
      };
      audio.onended = () => {
        setSpeaking(false);
        setPausedAudio(false);
        if (handsFreeRef.current && openRef.current) {
          setTimeout(() => beginListeningRef.current(speechLang), 250);
        }
      };
      await audio.play();
    } catch {
      speakFemaleBrowserFallback(text, speechLang);
    }
  };

  const togglePauseResumeAudio = () => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
        setPausedAudio(false);
        setSpeaking(true);
      } else {
        audioRef.current.pause();
        setPausedAudio(true);
        setSpeaking(false);
      }
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setPausedAudio(false);
        setSpeaking(true);
      } else {
        window.speechSynthesis.pause();
        setPausedAudio(true);
        setSpeaking(false);
      }
    }
  };

  const sendMessage = async (textToSend) => {
    const clean = String(textToSend || '').trim();
    if (!clean || busy) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: clean, actions: [], products: [] }]);
    setBusy(true);

    try {
      const data = await apiRequest('/api/assistant/chat', {
        method: 'POST',
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

      // Execute safe structured website & cart actions
      for (const act of data.actions || []) {
        if (act.type === 'ADD_TO_CART' && act.productId) {
          add(act.productId, act.qty || 1);
          showToast(`Added ${act.qty || 1} × ${act.productName} to cart.`);
        } else if (act.type === 'UPDATE_CART_QTY' && act.productId) {
          setQty(act.productId, act.qty ?? 0);
          showToast(`Updated ${act.productName} quantity to ${act.qty}.`);
        } else if (act.type === 'ADD_CUSTOM_BOWL' && act.bowl) {
          addCustomBowl(act.bowl);
          showToast(`Added ${act.bowl.name} to cart.`);
        } else if (act.type === 'CLEAR_CART') {
          clear();
        } else if (act.type === 'NAVIGATE' && act.to) {
          navigate(act.to);
        } else if (act.type === 'OPEN_RAZORPAY_CHECKOUT') {
          navigate('/cart');
        }
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
        },
      ]);

      await speakFemaleVoice(data.reply, replyLang);
    } catch (err) {
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
      setBusy(false);
    }
  };

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  const quickPrompts =
    lang === 'te-IN'
      ? ['నాకు టిఫిన్స్ కావాలి', '2 ఇడ్లీ యాడ్ చేయండి', 'ఆఫర్లు ఏంటి?', 'ఆర్డర్ స్టేటస్']
      : ['I want breakfast', 'Build my own bowl', 'Active Offers', 'Where is my order?'];

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
            <div className="voice-head-title">
              <strong>{settings?.aiName || 'HRUVITA AI'}</strong>
              <span>
                {speaking
                  ? 'Speaking (Female Voice)...'
                  : listening
                  ? 'Listening...'
                  : busy
                  ? 'Thinking...'
                  : 'Bilingual Telugu & English'}
              </span>
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
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                title="Close"
              >
                <FiX size={14} />
              </button>
            </div>
          </div>

          {/* Conversation Mode & Personalization Bar */}
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
                  onClick={() => {
                    setMode(m.id);
                    if (m.id === 'handsfree') beginListening(lang);
                    else if (m.id === 'text') stopListening();
                  }}
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

          {/* Animated Audio Waveform & Playback Controls */}
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
                    title="Replay"
                  >
                    <FiRefreshCw size={12} /> Replay
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="voice-messages">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`voice-msg ${
                  m.role === 'user' ? 'voice-msg-user' : 'voice-msg-assistant'
                }`.trim()}
              >
                <div>{m.text}</div>

                {/* Live MongoDB Product Cards inside Chat */}
                {m.products?.length > 0 && (
                  <div className="voice-prod-cards">
                    {m.products.map((p) => (
                      <div key={p.id} className="voice-prod-card">
                        {p.image && <img src={p.image} alt={p.name} loading="lazy" />}
                        <div className="voice-prod-info">
                          <strong>{p.name}</strong>
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
                  (a) => a.type === 'ADD_TO_CART' || a.type === 'ADD_CUSTOM_BOWL' || a.type === 'OPEN_CART_SUGGESTION'
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
                onClick={() => sendMessage(chip)}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                listening
                  ? 'Listening...'
                  : lang === 'te-IN'
                  ? 'తెలుగు లేదా ఇంగ్లీష్‌లో మాట్లాడండి లేదా టైప్ చేయండి...'
                  : 'Ask or order (e.g. Add 2 Idli)...'
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
            if (mode === 'handsfree') {
              setTimeout(() => beginListeningRef.current(lang), 350);
            }
          } else if (minimized) {
            setMinimized(false);
            if (mode === 'handsfree') {
              setTimeout(() => beginListeningRef.current(lang), 350);
            }
          } else {
            setOpen(false);
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
