import { Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  findUserById,
  getSettings,
  saveConversationTurn,
  listConversations,
  sanitizeUser,
} from '../store/repository.js';
import { ACCESS_COOKIE_NAME, requireAuth, requireRole } from '../middleware/auth.js';
import { processAssistantTurn, DEFAULT_FAQS } from '../utils/aiBrain.js';

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
    name: settings.aiName || 'HRUVITA Assistant',
    faqs: Array.isArray(settings.aiFaqs) && settings.aiFaqs.length ? settings.aiFaqs : DEFAULT_FAQS,
  });
});

router.post('/chat', async (req, res) => {
  try {
    const settings = await getSettings();
    if (settings.aiEnabled === false) {
      return res.status(503).json({ error: 'Voice assistant is currently turned off by admin.' });
    }

    const { message, language = 'en-IN', conversationId = '', cartItems = {} } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Please say or type a message.' });
    }

    const user = await getOptionalUser(req);
    const result = await processAssistantTurn({
      message: String(message).trim(),
      language,
      user,
      cartItems,
    });

    const conv = await saveConversationTurn({
      conversationId: conversationId || `conv-${Date.now().toString(36)}`,
      userId: user?.id || 'guest',
      userName: user?.fullName || user?.name || 'Guest',
      language: result.language,
      userText: String(message).trim(),
      assistantText: result.reply,
      toolsUsed: result.toolsUsed,
      addedToCart: result.actions.some((a) => a.type === 'ADD_TO_CART'),
    });

    return res.json({
      conversationId: conv.id,
      reply: result.reply,
      language: result.language,
      toolsUsed: result.toolsUsed,
      actions: result.actions,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Assistant could not process request.' });
  }
});

// Admin conversation history view
router.get('/conversations', requireAuth, requireRole('admin', 'staff'), async (_req, res) => {
  const conversations = await listConversations(40);
  res.json({ conversations });
});

export default router;
