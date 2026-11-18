import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Explicit Female Voice IDs (never silently switch to male voices)
export const FEMALE_VOICE_CONFIG = {
  'te-IN': {
    id: process.env.TTS_TELUGU_VOICE_ID || 'te-IN-ShrutiNeural',
    label: 'Shruti (Female, Telugu)',
    gender: 'Female',
    rate: '-2%',
    pitch: '+2Hz',
  },
  'en-IN': {
    id: process.env.TTS_ENGLISH_VOICE_ID || 'en-IN-NeerjaNeural',
    label: 'Neerja (Female, Indian English)',
    gender: 'Female',
    rate: '-2%',
    pitch: '+1Hz',
  },
};

const KNOWN_MALE_VOICE_PATTERN = /(mohan|prabhat|ravi|hemant|david|mark|daniel|george|rishi|male)/i;

function assertFemaleVoiceId(voiceId) {
  if (KNOWN_MALE_VOICE_PATTERN.test(String(voiceId || ''))) {
    throw new Error('Configured TTS voice must be a female voice.');
  }
  return voiceId;
}

function cleanTextForSpeech(rawText = '') {
  return String(rawText || '')
    .replace(/[*_`#]/g, '')
    .replace(/₹\s*(\d+)/g, '$1 rupees')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export async function synthesizeFemaleSpeech({ text, language = 'en-IN' }) {
  const cleanText = cleanTextForSpeech(text);
  if (!cleanText) {
    throw new Error('Text is required for speech synthesis.');
  }

  const langKey = language === 'te-IN' ? 'te-IN' : 'en-IN';
  const voiceCfg = FEMALE_VOICE_CONFIG[langKey];
  const voiceId = assertFemaleVoiceId(voiceCfg.id);

  // Optional ElevenLabs override if user provides ELEVENLABS_API_KEY + female voice IDs
  const elevenKey = process.env.ELEVENLABS_API_KEY?.trim();
  const elevenVoiceId =
    langKey === 'te-IN'
      ? process.env.ELEVENLABS_TELUGU_FEMALE_VOICE_ID?.trim()
      : process.env.ELEVENLABS_ENGLISH_FEMALE_VOICE_ID?.trim();

  if (elevenKey && elevenVoiceId) {
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.78 },
      }),
    });
    if (resp.ok) {
      const arrayBuf = await resp.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuf),
        contentType: 'audio/mpeg',
        voiceId: elevenVoiceId,
        provider: 'elevenlabs',
      };
    }
  }

  // Primary Free Neural Female TTS (Microsoft Edge ShrutiNeural / NeerjaNeural)
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(cleanText, {
    rate: voiceCfg.rate,
    pitch: voiceCfg.pitch,
  });

  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) {
    throw new Error('Neural TTS returned empty audio stream.');
  }

  return {
    buffer,
    contentType: 'audio/mpeg',
    voiceId,
    provider: 'edge-neural',
  };
}
