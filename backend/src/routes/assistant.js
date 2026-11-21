import { Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  findUserById,
  getSettings,
  getConversationById,
  saveConversationTurn,
  listConversations,
  listOrdersByUser,
  sanitizeUser,
} from '../store/repository.js';
import { ACCESS_COOKIE_NAME, requireAuth, requireRole } from '../middleware/auth.js';
import { processAssistantTurn, DEFAULT_FAQS } from '../utils/aiBrain.js';
import { getProviderHealthSnapshot } from '../utils/aiProviderManager.js';
import { synthesizeFemaleSpeech, FEMALE_VOICE_CONFIG } from '../utils/ttsService.js';
import { createRequestId, logAI, logAIError } from '../utils/aiLogger.js';

const router = Router();

async function getOptionalUser(req) {
  try {
    let token = req.cookies?.[ACCESS_COOKIE_NAME] || '';
    const header = req.headers.authorization || '';
    if (!token && header.startsWith('Bearer ')) token = header.slice(7).trim();
    if (!token) return null;
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'hruvita-jwt-access-secret-2026-secure'
    );
    const user = await findUserById(decoded.id);
    if (!user || user.blocked) return null;
    return sanitizeUser(user);
  } catch {
    return null;
  }
}

router.get('/config', async (_req, res) => {
  const settings = await getSettings();
  res.json({
    enabled: settings.aiEnabled !== false,
    name: settings.aiName || 'HRUVITA AI',
    voices: FEMALE_VOICE_CONFIG,
    greetings: {
      'en-IN': 'Hello! Welcome to HRUVITA. What would you like to eat today?',
      'te-IN': 'నమస్కారం! HRUVITA కి స్వాగతం. ఈరోజు మీకు ఏమి కావాలి?',
    },
    faqs: Array.isArray(settings.aiFaqs) && settings.aiFaqs.length ? settings.aiFaqs : DEFAULT_FAQS,
  });
});

// Developer / Admin-only AI Debug Status
router.get('/debug', async (req, res) => {
  const user = await getOptionalUser(req);
  if (process.env.NODE_ENV === 'production' && user?.role !== 'admin') {
    return res.status(403).json({ error: 'Debug status is restricted to admins in production.' });
  }
  return res.json({
    aiConnected: Boolean(process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()),
    primaryProvider: process.env.GROQ_API_KEY?.trim() ? 'groq' : process.env.GEMINI_API_KEY?.trim() ? 'gemini' : 'none',
    aiModel: process.env.AI_MODEL?.trim() || 'openai/gpt-oss-20b',
    fallbackModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    sttConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
    ttsProvider: process.env.ELEVENLABS_API_KEY?.trim() ? 'elevenlabs+edge-neural' : 'edge-neural',
    voices: FEMALE_VOICE_CONFIG,
    providerHealth: getProviderHealthSnapshot(),
  });
});

// Personalized welcome greeting (after login only)
router.get('/greeting', requireAuth, async (req, res) => {
  const lang = req.query.lang === 'te-IN' ? 'te-IN' : 'en-IN';
  const personalization = req.query.personalization !== '0';
  const user = req.user;

  const defaultGreeting =
    lang === 'te-IN'
      ? 'నమస్కారం! HRUVITA కి స్వాగతం. ఈరోజు మీకు ఏమి కావాలి?'
      : 'Hello! Welcome to HRUVITA. What would you like to eat today?';

  if (!user || !personalization) {
    return res.json({ greeting: defaultGreeting, personalized: false });
  }

  const firstName = String(user.fullName || user.name || 'Friend').split(' ')[0];
  const pastOrders = await listOrdersByUser(user.id);
  const lastItemName = pastOrders?.[0]?.items?.[0]?.name || '';

  if (lastItemName) {
    const greeting =
      lang === 'te-IN'
        ? `నమస్కారం ${firstName}! HRUVITA కి స్వాగతం. ఈరోజు మీకు ఎప్పటిలాగే ${lastItemName} కావాలా లేదా కొత్తది ఏమైనా ట్రై చేస్తారా?`
        : `Welcome back, ${firstName}! Would you like your usual ${lastItemName} today, or something fresh?`;
    return res.json({ greeting, personalized: true, suggestedItem: lastItemName });
  }

  const greeting =
    lang === 'te-IN'
      ? `నమస్కారం ${firstName}! HRUVITA కి స్వాగతం. ఈరోజు మీకు ఏమి కావాలి?`
      : `Hello ${firstName}! Welcome to HRUVITA. What would you like to eat today?`;
  return res.json({ greeting, personalized: true });
});

router.post('/chat', requireAuth, async (req, res) => {
  const requestId = createRequestId();
  const reqStart = Date.now();
  try {
    const settings = await getSettings();
    if (settings.aiEnabled === false) {
      return res.status(503).json({ error: 'Voice assistant is currently turned off by admin.' });
    }

    const {
      message,
      language = 'en-IN',
      conversationId = '',
      cartItems = {},
      customBowls = [],
      selectedAddressId = '',
      slotId = 'morning',
      personalizationEnabled = true,
    } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Please say or type a message.' });
    }

    const user = req.user;
    logAI('HRUVITA-API', `POST /api/assistant/chat [${requestId}] user=${user.id}`);

    const existingConv = conversationId ? await getConversationById(conversationId) : null;
    const history = existingConv?.messages || [];

    const result = await processAssistantTurn({
      message: String(message).trim(),
      language,
      conversationId,
      user,
      cartItems,
      customBowls,
      selectedAddressId,
      slotId,
      personalizationEnabled,
      history,
    });

    const conv = await saveConversationTurn({
      conversationId: conversationId || `conv-${Date.now().toString(36)}`,
      userId: user?.id || 'guest',
      userName: user?.fullName || user?.name || 'Guest',
      language: result.language,
      userText: String(message).trim(),
      assistantText: result.reply,
      toolsUsed: result.toolsUsed,
      addedToCart: result.actions.some((a) => a.type === 'ADD_TO_CART' || a.type === 'ADD_CUSTOM_BOWL'),
      sessionState: result.sessionState,
    });

    logAI('HRUVITA-API', `200 OK [${requestId}] total=${Date.now() - reqStart}ms`, result.debug);

    return res.json({
      requestId,
      conversationId: conv.id,
      reply: result.reply,
      language: result.language,
      toolsUsed: result.toolsUsed,
      actions: result.actions,
      recommendedProducts: result.recommendedProducts || [],
      recommendedOrders: result.recommendedOrders || [],
    });
  } catch (err) {
    logAIError(`POST /api/assistant/chat [${requestId}] failed`, err);
    return res.status(500).json({ error: 'Assistant could not process request.', requestId });
  }
});

// Natural Female Voice TTS Endpoint (after login only)
router.post('/tts', requireAuth, async (req, res) => {
  const t0 = Date.now();
  try {
    const { text, language = 'en-IN' } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }
    const audio = await synthesizeFemaleSpeech({ text: String(text), language });
    const dur = Date.now() - t0;
    logAI('HRUVITA-TTS', `Synthesized ${language} female audio (${audio.voiceId}, ${audio.provider}) in ${dur}ms`);
    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('X-Voice-Id', audio.voiceId);
    res.setHeader('X-Voice-Provider', audio.provider);
    res.setHeader('X-TTS-Duration-Ms', String(dur));
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audio.buffer);
  } catch (err) {
    logAIError('TTS synthesis failed', err);
    return res.status(502).json({ error: err.message || 'Could not synthesize voice.' });
  }
});

// Whisper STT fallback endpoint (after login only, requires GROQ_API_KEY)
router.post('/stt', requireAuth, async (req, res) => {
  const t0 = Date.now();
  try {
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!groqKey) {
      return res.status(501).json({
        error: 'Cloud STT fallback is not configured. Please use Chrome voice input or type your message.',
      });
    }
    const { audioBase64, mimeType = 'audio/webm', language = 'te' } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio payload is required.' });
    }
    const buf = Buffer.from(audioBase64, 'base64');
    const formData = new FormData();
    formData.append('file', new Blob([buf], { type: mimeType }), 'speech.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', language === 'te-IN' ? 'te' : 'en');

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });
    const dur = Date.now() - t0;
    if (!resp.ok) {
      logAIError(`STT HTTP ${resp.status}`, new Error('Groq Whisper failed'));
      return res.status(502).json({ error: 'Speech-to-text transcription failed.' });
    }
    const data = await resp.json();
    logAI('HRUVITA-STT', `Whisper transcribed in ${dur}ms`);
    return res.json({ text: data.text || '', durationMs: dur });
  } catch (err) {
    logAIError('STT endpoint error', err);
    return res.status(500).json({ error: err.message || 'STT error.' });
  }
});

router.get('/conversations', requireAuth, requireRole('admin', 'staff'), async (_req, res) => {
  const conversations = await listConversations(40);
  res.json({ conversations });
});

export default router;
