import { useState } from 'react';
import { FiMic, FiX } from 'react-icons/fi';
import './VoiceButton.css';

export default function VoiceButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="voice-wrap">
      {open && (
        <div className="voice-bubble" role="status">
          <p>Voice ordering in Telugu and English is coming soon.</p>
        </div>
      )}
      <button
        type="button"
        className="voice-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close voice assistant message' : 'Open voice assistant'}
      >
        {open ? <FiX size={24} /> : <FiMic size={24} />}
      </button>
    </div>
  );
}
