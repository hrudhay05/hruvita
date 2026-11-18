import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiMic, FiMicOff, FiSend, FiShoppingBag, FiVolume2, FiVolumeX, FiX } from 'react-icons/fi';
import { useCart } from '../context/CartContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import './VoiceButton.css';

export default function VoiceButton() {
  const { items, add } = useCart();
  const { settings } = useCatalog();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState('en-IN');
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hello! Ask me in English or Telugu to search items, check offers, or add food to your cart.',
      actions: [],
    },
  ]);

  const recognitionRef = useRef(null);

  if (settings?.aiEnabled === false) {
    return null;
  }

  const speakText = (text, speechLang) => {
    if (muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = speechLang;
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => v.lang.toLowerCase().startsWith(speechLang.slice(0, 2).toLowerCase())) ||
        voices.find((v) => v.lang.toLowerCase().includes('in'));
      if (preferred) utter.voice = preferred;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore synthesis errors
    }
  };

  const sendMessage = async (textToSend) => {
    const clean = String(textToSend || '').trim();
    if (!clean || busy) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: clean, actions: [] }]);
    setBusy(true);

    try {
      const data = await apiRequest('/api/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: clean,
          language: lang,
          conversationId,
          cartItems: items,
        }),
      });

      if (data.conversationId) setConversationId(data.conversationId);

      // Execute safe structured cart actions returned by the backend
      for (const act of data.actions || []) {
        if (act.type === 'ADD_TO_CART' && act.productId) {
          add(act.productId, act.qty || 1);
          showToast(`Added ${act.qty || 1} × ${act.productName} to cart.`);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.reply,
          actions: data.actions || [],
        },
      ]);

      speakText(data.reply, data.language || lang);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: err.message || 'Sorry, I could not connect right now.',
          actions: [],
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (typeof window === 'undefined') return;
    // Interrupt current speech immediately when mic is pressed
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Voice input works best in Chrome. You can type your request below.', 'error');
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      showToast('Could not hear clearly. Try again or type below.', 'error');
    };
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        sendMessage(transcript);
      }
    };

    recognitionRef.current = rec;
    rec.start();
  };

  const quickPrompts =
    lang === 'te-IN'
      ? ['2 ఇడ్లీ యాడ్ చేయండి', 'ఆఫర్లు ఏంటి?', 'మిక్స్‌డ్ ఫ్రూట్ బౌల్', 'ఆర్డర్ స్టేటస్']
      : ['Add 2 Idli', 'Mixed Fruit Bowl', 'Active Offers', 'Delivery Slots'];

  return (
    <div className="voice-wrap">
      {open && (
        <div className="voice-drawer" role="dialog" aria-label="HRUVITA Voice Assistant">
          <div className="voice-head">
            <div className="voice-head-title">
              <strong>{settings?.aiName || 'HRUVITA Assistant'}</strong>
              <span>Telugu &amp; English Voice Ordering</span>
            </div>
            <div className="voice-head-controls">
              <button
                type="button"
                className={`voice-lang-btn ${lang === 'en-IN' ? 'voice-lang-active' : ''}`.trim()}
                onClick={() => setLang('en-IN')}
              >
                EN
              </button>
              <button
                type="button"
                className={`voice-lang-btn ${lang === 'te-IN' ? 'voice-lang-active' : ''}`.trim()}
                onClick={() => setLang('te-IN')}
              >
                తెలుగు
              </button>
              <button
                type="button"
                className="voice-icon-small"
                onClick={() => {
                  if (!muted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                  setMuted((m) => !m);
                }}
                aria-label={muted ? 'Unmute voice output' : 'Mute voice output'}
              >
                {muted ? <FiVolumeX size={14} /> : <FiVolume2 size={14} />}
              </button>
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
                {m.actions?.some(
                  (a) => a.type === 'ADD_TO_CART' || a.type === 'OPEN_CART_SUGGESTION'
                ) && (
                  <div className="voice-action-cta">
                    <Link
                      to="/cart"
                      className="voice-action-pill"
                      onClick={() => setOpen(false)}
                    >
                      <FiShoppingBag size={12} /> Open Checkout
                    </Link>
                  </div>
                )}
                {m.actions
                  ?.filter((a) => a.type === 'NAVIGATE_SUGGESTION')
                  .map((a) => (
                    <div key={a.to} className="voice-action-cta">
                      <Link
                        to={a.to}
                        className="voice-action-pill"
                        onClick={() => setOpen(false)}
                      >
                        {a.label} &rarr;
                      </Link>
                    </div>
                  ))}
              </div>
            ))}
            {busy && <div className="voice-msg voice-msg-assistant">Thinking...</div>}
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
            <button
              type="button"
              className={`voice-mic-btn ${listening ? 'voice-mic-listening' : ''}`.trim()}
              onClick={toggleMic}
              aria-label={listening ? 'Stop listening' : 'Speak in Telugu or English'}
              title={listening ? 'Listening... tap to stop' : 'Tap to speak'}
            >
              {listening ? <FiMicOff size={17} /> : <FiMic size={17} />}
            </button>
            <input
              id="voice-chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                listening
                  ? 'Listening...'
                  : lang === 'te-IN'
                  ? 'తెలుగు లేదా ఇంగ్లీష్‌లో టైప్ చేయండి...'
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
        className="voice-fab"
        onClick={() => {
          if (open && 'speechSynthesis' in window) window.speechSynthesis.cancel();
          setOpen((v) => !v);
        }}
        aria-label={open ? 'Close voice assistant' : 'Open Telugu & English voice assistant'}
        title="Voice Ordering (Telugu & English)"
      >
        {open ? <FiX size={24} /> : <FiMic size={24} />}
      </button>
    </div>
  );
}
