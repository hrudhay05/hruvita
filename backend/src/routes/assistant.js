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
import { synthesizeFemaleSpeech, FEMALE_VOICE_CONFIG } from '../utils/ttsService.js';

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

// Personalized welcome greeting (respects personalization=0 opt-out)
router.get('/greeting', async (req, res) => {
  const lang = req.query.lang === 'te-IN' ? 'te-IN' : 'en-IN';
  const personalization = req.query.personalization !== '0';
  const user = await getOptionalUser(req);

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

router.post('/chat', async (req, res) => {
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
      paymentMethod = 'cod',
      personalizationEnabled = true,
    } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Please say or type a message.' });
    }

    const user = await getOptionalUser(req);
    const existingConv = conversationId ? await getConversationById(conversationId) : null;
    const sessionState = existingConv?.sessionState || { pendingIntent: null, customBowlDraft: null };
    const history = existingConv?.messages || [];

    const result = await processAssistantTurn({
      message: String(message).trim(),
      language,
      user,
      cartItems,
      customBowls,
      selectedAddressId,
      slotId,
      paymentMethod,
      personalizationEnabled,
      sessionState,
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

    return res.json({
      conversationId: conv.id,
      reply: result.reply,
      language: result.language,
      toolsUsed: result.toolsUsed,
      actions: result.actions,
      recommendedProducts: result.recommendedProducts || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Assistant could not process request.' });
  }
});

// Natural Female Voice TTS Endpoint (te-IN-ShrutiNeural / en-IN-NeerjaNeural)
router.post('/tts', async (req, res) => {
  try {
    const { text, language = 'en-IN' } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }
    const audio = await synthesizeFemaleSpeech({ text: String(text), language });
    res.setHeader('Content-Type', audio.contentType);
    res.setHeader('X-Voice-Id', audio.voiceId);
    res.setHeader('X-Voice-Provider', audio.provider);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audio.buffer);
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Could not synthesize voice.' });
  }
});

// Optional Whisper STT fallback for browsers without Web Speech API (requires GROQ_API_KEY)
router.post('/stt', async (req, res) => {
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
    if (!resp.ok) {
      return res.status(502).json({ error: 'Speech-to-text transcription failed.' });
    }
    const data = await resp.json();
    return res.json({ text: data.text || '' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'STT error.' });
  }
});

// Admin conversation history view
router.get('/conversations', requireAuth, requireRole('admin', 'staff'), async (_req, res) => {
  const conversations = await listConversations(40);
  res.json({ conversations });
});

export default router;
