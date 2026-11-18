import {
  listProducts,
  listCategories,
  listCoupons,
  listSlotsForDate,
  listPlans,
  listOrdersByUser,
  listAddressesByUser,
  getDynamicBowlOptions,
  calculateCheckoutQuote,
  deductOrderStockAtomically,
  createOrderRecord,
  createPaymentRecord,
  getSettings,
  recordAudit,
  formatAddressForLegacy,
} from '../store/repository.js';
import { computeCustomBowlPrice } from '../data/bowlOptions.js';
import { sendUserNotification } from './emailService.js';

export const DEFAULT_FAQS = [
  {
    q: 'What are your delivery slots?',
    a: 'We deliver in Morning (6:30–9:00 AM), Afternoon (12:30–2:30 PM), and Evening (6:30–8:30 PM) slots.',
  },
  {
    q: 'Is delivery free?',
    a: 'Yes! Delivery is free on all orders above ₹199. Below ₹199, a ₹25 delivery fee applies.',
  },
  {
    q: 'Can I pause my breakfast subscription?',
    a: 'Yes, you can pause or resume your 7, 15, or 30-day breakfast subscription anytime before 10 PM the previous day.',
  },
  {
    q: 'Are your fruit bowls and juices preservative-free?',
    a: 'Every fruit bowl and cold-pressed juice is prepared fresh daily with zero preservatives.',
  },
];

// Telugu / Tenglish / English keyword mapping to English search terms
const TELUGU_ALIASES = [
  [/ఇడ్లీ|idly|idli/i, 'idli'],
  [/దోస|దోశ|dosa/i, 'dosa'],
  [/పొంగల్|pongal/i, 'pongal'],
  [/ఉప్మా|upma/i, 'upma'],
  [/మిక్స్‌డ్ ఫ్రూట్|mixed fruit/i, 'mixed fruit bowl'],
  [/ఎక్సోటిక్|exotic/i, 'exotic seasonal fruit bowl'],
  [/ఫ్రూట్ బౌల్|పండ్ల|fruit bowl|bowl/i, 'fruit bowl'],
  [/ఆరెంజ్|నారింజ|orange/i, 'orange'],
  [/పుచ్చకాయ|watermelon/i, 'watermelon'],
  [/దానిమ్మ|pomegranate/i, 'pomegranate'],
  [/అరటి|banana/i, 'banana'],
  [/మామిడి|mango/i, 'mango'],
  [/పాలు|milk/i, 'milk'],
  [/పెరుగు|curd/i, 'curd'],
  [/పనీర్|paneer/i, 'paneer'],
  [/రాగి|ragi/i, 'ragi'],
  [/కాంబో|combo/i, 'combo'],
  [/మొలకలు|sprouts|salad/i, 'sprouts'],
  [/భోజనం|లంచ్|thali|lunch|meals/i, 'thali'],
  [/జ్యూస్|juice/i, 'juice'],
  [/స్మూతీ|smoothie/i, 'smoothie'],
];

const CATEGORY_ALIASES = [
  { slug: 'tiffins', label: 'Tiffins & Breakfast', regex: /(tiffin|tiffins|breakfast|టిఫిన్|టిఫిన్స్|బ్రేక్‌ఫాస్ట్)/i },
  { slug: 'fruit-bowls', label: 'Fruit Bowls', regex: /(fruit bowl|fruit bowls|పండ్ల బౌల్|ఫ్రూట్ బౌల్స్|ఫ్రూట్ బౌల్)/i },
  { slug: 'juices', label: 'Fresh Juices', regex: /(juice|juices|జ్యూస్|జ్యూసులు|జ్యూస్‌లు|beverages)/i },
  { slug: 'smoothies', label: 'Smoothies', regex: /(smoothie|smoothies|స్మూతీ)/i },
  { slug: 'dairy', label: 'Dairy', regex: /(dairy|milk|curd|paneer|పాలు|పెరుగు)/i },
  { slug: 'healthy-drinks', label: 'Healthy Drinks', regex: /(healthy drink|ragi|రాగి|హెల్దీ డ్రింక్)/i },
  { slug: 'combos', label: 'Combos', regex: /(combos|combo|కాంబో)/i },
  { slug: 'lunch', label: 'Lunch', regex: /(lunch|thali|meals|లంచ్|భోజనం)/i },
  { slug: 'snacks', label: 'Healthy Snacks', regex: /(snack|snacks|sprouts|salad|స్నాక్స్|మొలకలు)/i },
];

function extractQuantity(text) {
  const numMatch = text.match(/\b([1-9][0-9]?)\b/);
  if (numMatch) return Math.min(20, Number(numMatch[1]));
  if (/(ఒకటి|ఒక|oka|okati|one|single)(?=$|[\s.,!?])/i.test(text)) return 1;
  if (/(రెండు|rendu|two)/i.test(text)) return 2;
  if (/(మూడు|mudu|moodu|three)/i.test(text)) return 3;
  if (/(నాలుగు|nalugu|four)/i.test(text)) return 4;
  if (/(ఐదు|aidu|five)/i.test(text)) return 5;
  return null;
}

export function detectLanguage(text, requestedLang = 'en-IN') {
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
  if (/(cheyandi|kavali|enti|unnaya|entha|pettu|add chey|namaskaram|bagunda|naku|naa|avunu|vaddu|chalu|tiffin|pampandi)/i.test(text)) {
    return 'te-IN';
  }
  return requestedLang === 'te-IN' ? 'te-IN' : 'en-IN';
}

function isAffirmative(text) {
  return /^(yes|yeah|yep|yup|ok|okay|sure|confirm|proceed|go ahead|do it|add it|అవును|సరే|కన్ఫర్మ్|ఓకే|చేయండి|యాడ్ చేయండి)(?=$|[\s.,!?])/i.test(
    text.trim()
  ) || /(yes,?\s*confirm|confirm my order|అవును.*చేయండి|ఆర్డర్ కన్ఫర్మ్)/i.test(text);
}

function isNegative(text) {
  return /^(no|nope|cancel|stop|never mind|don't|dont|వద్దు|క్యాన్సిల్|ఆపండి)(?=$|[\s.,!?])/i.test(text.trim()) ||
    /(cancel order|cancel my order|do not place|వద్దు)/i.test(text);
}

function matchProductsFromText(text, allProducts) {
  const lowered = text.toLowerCase();
  const wantsCombo = /(combo|కాంబో|\+)/i.test(text);
  const matchedTerms = [];
  for (const [regex, term] of TELUGU_ALIASES) {
    if (regex.test(text)) matchedTerms.push(term);
  }

  const hits = allProducts.filter((p) => {
    const hay = `${p.name} ${p.category} ${p.description}`.toLowerCase();
    if (matchedTerms.some((t) => hay.includes(t))) return true;
    const words = lowered.split(/\s+/).filter((w) => w.length >= 4);
    return words.some((w) => p.name.toLowerCase().includes(w));
  });

  return hits.sort((a, b) => {
    const aCombo = a.category === 'combos' ? 1 : 0;
    const bCombo = b.category === 'combos' ? 1 : 0;
    if (!wantsCombo && aCombo !== bCombo) return aCombo - bCombo;
    const aNameHit = matchedTerms.some((t) => a.name.toLowerCase().startsWith(t)) ? 1 : 0;
    const bNameHit = matchedTerms.some((t) => b.name.toLowerCase().startsWith(t)) ? 1 : 0;
    return bNameHit - aNameHit;
  });
}

function matchIngredientsFromText(text, pool = []) {
  const lowered = text.toLowerCase();
  const matched = [];
  const fruitAliases = {
    apple: /(apple|యాపిల్)/i,
    banana: /(banana|అరటి)/i,
    pomegranate: /(pomegranate|దానిమ్మ)/i,
    papaya: /(papaya|బొప్పాయి)/i,
    watermelon: /(watermelon|పుచ్చకాయ)/i,
    pineapple: /(pineapple|అనాస)/i,
    mango: /(mango|మామిడి)/i,
    kiwi: /(kiwi|కివీ)/i,
    dragonfruit: /(dragon|డ్రాగన్)/i,
    chia: /(chia|చియా)/i,
    pumpkin: /(pumpkin|గుమ్మడి)/i,
    almonds: /(almond|almonds|బాదం|nuts)/i,
    walnuts: /(walnut|walnuts|వాల్‌నట్)/i,
    granola: /(granola|గ్రానోలా)/i,
    flax: /(flax|అవిసె)/i,
    honey: /(honey|తేనె)/i,
    yogurt: /(yogurt|curd|పెరుగు)/i,
    'mint-lime': /(mint|lime|పుదీనా)/i,
    cinnamon: /(cinnamon|దాల్చిన)/i,
  };

  for (const ing of pool) {
    const aliasRe = fruitAliases[ing.id];
    if (lowered.includes(ing.id.toLowerCase()) || lowered.includes(ing.name.toLowerCase()) || (aliasRe && aliasRe.test(text))) {
      matched.push(ing.id);
    }
  }
  return [...new Set(matched)];
}

function formatProductCard(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.discountPrice || p.price,
    mrp: p.price,
    image: p.image,
    stock: p.stock,
    veg: p.veg,
  };
}

async function callOptionalFreeLlm({ userMessage, lang, toolContext, history = [], settings }) {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!groqKey && !geminiKey) return null;

  const systemPrompt = [
    `You are ${settings.aiName || 'HRUVITA AI'}, a warm, sweet, polite female food-ordering representative for ${settings.name || 'HRUVITA'} in ${settings.city || 'Hyderabad'}.`,
    lang === 'te-IN'
      ? 'Reply warmly in natural, friendly spoken Telugu (clear Telugu script). Keep responses concise (1-3 sentences) for natural voice playback.'
      : 'Reply warmly in friendly, pleasant Indian English (1-3 sentences) suitable for natural female voice playback.',
    'STRICT SAFETY RULES: Only state real items, prices, totals, stock, slots, and order statuses from Tool Context. Never invent prices, items, or orders. Never make medical claims. Never ask for UPI PINs or card CVVs. Keep any exact rupee totals and confirmation questions intact.',
    settings.aiInstructions || '',
    `\nTool Context:\n${toolContext}`,
  ]
    .filter(Boolean)
    .join('\n');

  const recentMsgs = (history || []).slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.text,
  }));

  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          temperature: 0.35,
          max_tokens: 200,
          messages: [{ role: 'system', content: systemPrompt }, ...recentMsgs, { role: 'user', content: userMessage }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) return reply;
      }
    } catch {
      // fall through
    }
  }

  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const transcript = recentMsgs.map((m) => `${m.role}: ${m.content}`).join('\n');
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n${transcript}\nCustomer: ${userMessage}` }] }],
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply) return reply;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

export async function processAssistantTurn({
  message,
  language = 'en-IN',
  user = null,
  cartItems = {},
  customBowls = [],
  selectedAddressId = '',
  slotId = 'morning',
  paymentMethod = 'cod',
  personalizationEnabled = true,
  sessionState = { pendingIntent: null, customBowlDraft: null },
  history = [],
}) {
  const cleanMsg = String(message || '').trim();
  const lang = detectLanguage(cleanMsg, language);
  const isTelugu = lang === 'te-IN';

  const [allProducts, categories, coupons, slots, plans, settings] = await Promise.all([
    listProducts(),
    listCategories(),
    listCoupons(),
    listSlotsForDate(new Date().toISOString().slice(0, 10)),
    listPlans(),
    getSettings(),
  ]);

  const toolsUsed = [];
  const actions = [];
  const toolFacts = [];
  let recommendedProducts = [];
  let nextSessionState = {
    pendingIntent: sessionState?.pendingIntent || null,
    customBowlDraft: sessionState?.customBowlDraft || null,
  };
  let fallbackReply = '';
  let preserveExactReply = false;

  // Helper to filter by user's veg preference if personalization is on
  const vegOnly = personalizationEnabled && user?.preferences?.vegOnly;
  const availableProducts = allProducts.filter((p) => p.active !== false && (!vegOnly || p.veg));

  // ------------------------------------------------------------------
  // 0. HANDLE PENDING CONVERSATION INTENTS (Confirmations / Multi-turn)
  // ------------------------------------------------------------------
  const pending = nextSessionState.pendingIntent;

  if (pending && isNegative(cleanMsg)) {
    nextSessionState = { pendingIntent: null, customBowlDraft: null };
    preserveExactReply = true;
    fallbackReply = isTelugu
      ? 'సరే అండి, దాన్ని క్యాన్సిల్ చేశాను. మీకు ఇంకేమైనా కావాలా?'
      : 'No problem! I have cancelled that request. What else would you like today?';
    return {
      reply: fallbackReply,
      language: lang,
      toolsUsed: ['cancel_pending_action'],
      actions: [],
      recommendedProducts: [],
      sessionState: nextSessionState,
    };
  }

  // A. Pending Order Confirmation ("Yes, confirm my order")
  if (pending?.type === 'confirm_order') {
    if (isAffirmative(cleanMsg)) {
      preserveExactReply = true;
      nextSessionState.pendingIntent = null;
      if (!user) {
        actions.push({ type: 'NAVIGATE', to: '/login', label: 'Sign In' });
        fallbackReply = isTelugu
          ? 'ఆర్డర్ పూర్తి చేయడానికి దయచేసి ముందుగా లాగిన్ అవ్వండి.'
          : 'Please sign in first to confirm your order.';
      } else if (pending.paymentMethod === 'razorpay') {
        toolsUsed.push('initiate_razorpay_checkout');
        actions.push({ type: 'OPEN_RAZORPAY_CHECKOUT', to: '/cart' });
        fallbackReply = isTelugu
          ? 'సరే! మీ Razorpay పేమెంట్ పాప్‌అప్ ఓపెన్ చేస్తున్నాను. దయచేసి పేమెంట్ పూర్తి చేయండి.'
          : 'Great! Opening your Razorpay payment checkout now. Please complete your payment securely.';
      } else {
        // Execute real COD order through existing backend repository
        try {
          toolsUsed.push('place_order_cod');
          const deliveryDate = pending.scheduledDate || new Date().toISOString().slice(0, 10);
          const quote = await calculateCheckoutQuote({
            items: cartItems,
            customBowls,
            userId: user.id,
          });
          const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
          await deductOrderStockAtomically(quote.items, {
            reason: 'order_deducted',
            orderId,
            actor: user.email,
          });
          const order = await createOrderRecord({
            id: orderId,
            idempotencyKey: `voice-${user.id}-${Date.now()}`,
            userId: user.id,
            customerName: user.fullName || user.name,
            customerEmail: user.email,
            customerPhone: pending.address.phone || user.mobileNumber || user.phone || '9000000000',
            items: quote.items,
            pricing: quote.pricing,
            address: pending.address,
            scheduledDate: deliveryDate,
            slotId: pending.slot.id,
            slotLabel: `${pending.slot.name} (${pending.slot.window})`,
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            status: 'confirmed',
            stockDeducted: true,
            statusHistory: [
              {
                status: 'confirmed',
                note: 'Confirmed via HRUVITA AI Voice Assistant (COD)',
                by: user.email,
                at: new Date().toISOString(),
              },
            ],
          });
          await createPaymentRecord({
            id: `PAY-${Date.now().toString(36).toUpperCase()}`,
            orderId: order.id,
            userId: user.id,
            method: 'cod',
            amount: quote.pricing.grandTotal,
            currency: 'INR',
            status: 'created',
          });
          await recordAudit({
            actorId: user.id,
            actorEmail: user.email,
            action: 'VOICE_ORDER_CONFIRMED',
            entity: 'order',
            entityId: order.id,
            details: { total: quote.pricing.grandTotal },
          });
          await sendUserNotification({
            userId: user.id,
            email: user.email,
            type: 'order',
            title: `Order Confirmed (${order.id})`,
            message: `Your voice-confirmed COD order of ₹${quote.pricing.grandTotal} is scheduled for ${deliveryDate} (${pending.slot.name}).`,
          });

          actions.push({ type: 'CLEAR_CART' });
          actions.push({ type: 'NAVIGATE', to: '/dashboard', label: `Track ${order.id}` });
          fallbackReply = isTelugu
            ? `ధన్యవాదాలు! మీ ఆర్డర్ ${order.id} కన్ఫర్మ్ అయింది. మొత్తం ₹${quote.pricing.grandTotal} (Cash on Delivery). త్వరలో మీ వద్దకు చేరుతుంది!`
            : `Wonderful! Your order ${order.id} for ₹${quote.pricing.grandTotal} (Cash on Delivery) is confirmed and sent to our kitchen!`;
        } catch (ordErr) {
          fallbackReply = isTelugu
            ? `క్షమించండి, ఆర్డర్ చేయడంలో సమస్య వచ్చింది: ${ordErr.message}`
            : `Sorry, I could not place your order: ${ordErr.message}`;
        }
      }
      return {
        reply: fallbackReply,
        language: lang,
        toolsUsed,
        actions,
        recommendedProducts,
        sessionState: nextSessionState,
      };
    }
  }

  // B. Pending Product Quantity ("రెండు ప్లేట్లు" / "2 plates")
  if (pending?.type === 'product_qty') {
    const qty = extractQuantity(cleanMsg);
    const prod = availableProducts.find((p) => p.id === pending.productId);
    if (qty && prod) {
      preserveExactReply = true;
      toolsUsed.push('check_stock');
      if (prod.stock < qty) {
        nextSessionState.pendingIntent = null;
        fallbackReply = isTelugu
          ? `క్షమించండి, ${prod.name} ప్రస్తుతం ${prod.stock} మాత్రమే అందుబాటులో ఉన్నాయి.`
          : `Sorry, we only have ${prod.stock} of ${prod.name} in stock right now.`;
      } else {
        nextSessionState.pendingIntent = { type: 'confirm_add', productId: prod.id, qty };
        const price = prod.discountPrice || prod.price;
        fallbackReply = isTelugu
          ? `సరే! ${qty} × ${prod.name} (₹${price * qty}) ను మీ కార్ట్‌లో యాడ్ చేయనా?`
          : `Sure! Should I add ${qty} × ${prod.name} (₹${price * qty}) to your cart?`;
      }
      return {
        reply: fallbackReply,
        language: lang,
        toolsUsed,
        actions: [],
        recommendedProducts: [formatProductCard(prod)],
        sessionState: nextSessionState,
      };
    }
  }

  // C. Pending Add-to-Cart Confirmation ("అవును" / "Yes")
  if (pending?.type === 'confirm_add') {
    if (isAffirmative(cleanMsg)) {
      preserveExactReply = true;
      const prod = availableProducts.find((p) => p.id === pending.productId);
      nextSessionState.pendingIntent = null;
      if (prod && prod.stock >= pending.qty) {
        toolsUsed.push('add_to_cart');
        const unitP = prod.discountPrice || prod.price;
        actions.push({
          type: 'ADD_TO_CART',
          productId: prod.id,
          productName: prod.name,
          qty: pending.qty,
          unitPrice: unitP,
        });
        actions.push({ type: 'OPEN_CART_SUGGESTION' });
        fallbackReply = isTelugu
          ? `అలాగే! ${pending.qty} × ${prod.name} మీ కార్ట్‌లో యాడ్ చేశాను. చెకౌట్ ఓపెన్ చేయాలా లేదా ఇంకేమైనా కావాలా?`
          : `Done! I added ${pending.qty} × ${prod.name} to your cart. Would you like to proceed to checkout or add anything else?`;
      } else {
        fallbackReply = isTelugu
          ? 'క్షమించండి, ఆ ఐటమ్ ప్రస్తుతం అందుబాటులో లేదు.'
          : 'Sorry, that item is no longer available in the requested quantity.';
      }
      return {
        reply: fallbackReply,
        language: lang,
        toolsUsed,
        actions,
        recommendedProducts: prod ? [formatProductCard(prod)] : [],
        sessionState: nextSessionState,
      };
    }
  }

  // D. Pending Custom Fruit Bowl Builder Steps
  if (pending?.type === 'bowl_fruits') {
    const bowlOpts = await getDynamicBowlOptions();
    const chosenFruits = matchIngredientsFromText(cleanMsg, bowlOpts.fruits);
    if (chosenFruits.length > 0) {
      preserveExactReply = true;
      nextSessionState.customBowlDraft = {
        sizeId: pending.sizeId || 'medium',
        fruits: chosenFruits,
        toppings: [],
        extras: [],
        qty: 1,
      };
      nextSessionState.pendingIntent = { type: 'bowl_toppings' };
      const fruitNames = bowlOpts.fruits
        .filter((f) => chosenFruits.includes(f.id))
        .map((f) => f.name)
        .join(', ');
      fallbackReply = isTelugu
        ? `బాగుంది! ${fruitNames} ఎంచుకున్నారు. దీనిపై నట్స్, చియా సీడ్స్, తేనె లేదా గ్రీక్ యోగర్ట్ ఏమైనా టాపింగ్స్ యాడ్ చేయాలా?`
        : `Great choice! I picked ${fruitNames}. Would you like to add any toppings like nuts, chia seeds, honey, or Greek yogurt?`;
      return {
        reply: fallbackReply,
        language: lang,
        toolsUsed: ['custom_bowl_fruits'],
        actions: [],
        recommendedProducts: [],
        sessionState: nextSessionState,
      };
    }
  }

  if (pending?.type === 'bowl_toppings' && nextSessionState.customBowlDraft) {
    const bowlOpts = await getDynamicBowlOptions();
    const allIngs = [...bowlOpts.fruits, ...bowlOpts.toppings, ...bowlOpts.extras];
    const draft = { ...nextSessionState.customBowlDraft };

    if (!/(no|none|skip|వద్దు)/i.test(cleanMsg)) {
      const pickedToppings = matchIngredientsFromText(cleanMsg, bowlOpts.toppings);
      const pickedExtras = matchIngredientsFromText(cleanMsg, bowlOpts.extras);
      if (/(nuts|dry fruits|నట్స్)/i.test(cleanMsg) && pickedToppings.length === 0) {
        pickedToppings.push('almonds');
      }
      draft.toppings = pickedToppings;
      draft.extras = pickedExtras;
    }

    const computed = computeCustomBowlPrice(draft, allIngs);
    nextSessionState.customBowlDraft = { ...draft, ...computed };
    nextSessionState.pendingIntent = { type: 'bowl_confirm' };
    preserveExactReply = true;
    toolsUsed.push('custom_bowl_price');
    fallbackReply = isTelugu
      ? `మీ కస్టమ్ ఫ్రూట్ బౌల్ సిద్ధమైంది: ${computed.summary}. ధర ₹${computed.unitPrice}. దీన్ని మీ కార్ట్‌లో యాడ్ చేయనా?`
      : `Perfect! Your custom fruit bowl is ready (${computed.summary}) for ₹${computed.unitPrice}. Would you like me to add it to your cart?`;
    return {
      reply: fallbackReply,
      language: lang,
      toolsUsed,
      actions: [],
      recommendedProducts: [],
      sessionState: nextSessionState,
    };
  }

  if (pending?.type === 'bowl_confirm' && nextSessionState.customBowlDraft) {
    if (isAffirmative(cleanMsg)) {
      preserveExactReply = true;
      const draft = nextSessionState.customBowlDraft;
      nextSessionState = { pendingIntent: null, customBowlDraft: null };
      toolsUsed.push('add_custom_bowl');
      actions.push({
        type: 'ADD_CUSTOM_BOWL',
        bowl: {
          sizeId: draft.sizeId,
          fruits: draft.fruits,
          toppings: draft.toppings,
          extras: draft.extras,
          name: draft.name,
          summary: draft.summary,
          unitPrice: draft.unitPrice,
          qty: 1,
        },
      });
      actions.push({ type: 'OPEN_CART_SUGGESTION' });
      fallbackReply = isTelugu
        ? `మీ ${draft.name} (₹${draft.unitPrice}) కార్ట్‌లో యాడ్ చేశాను! చెకౌట్ చేయాలా?`
        : `Added your ${draft.name} (₹${draft.unitPrice}) to the cart! Would you like to open checkout?`;
      return {
        reply: fallbackReply,
        language: lang,
        toolsUsed,
        actions,
        recommendedProducts: [],
        sessionState: nextSessionState,
      };
    }
  }

  // ------------------------------------------------------------------
  // 1. CONVERSATIONAL ORDER CHECKOUT ("I want to place my order")
  // ------------------------------------------------------------------
  if (/(place my order|place order|confirm my order|checkout now|ఆర్డర్ చేయాలి|ఆర్డర్ కన్ఫర్మ్|ఆర్డర్ పెట్టు)/i.test(cleanMsg)) {
    preserveExactReply = true;
    if (!user) {
      actions.push({ type: 'NAVIGATE', to: '/login', label: 'Sign In to Checkout' });
      fallbackReply = isTelugu
        ? 'ఆర్డర్ ప్లేస్ చేయడానికి దయచేసి ముందుగా మీ HRUVITA అకౌంట్‌లో లాగిన్ అవ్వండి.'
        : 'Please sign in to your HRUVITA account so I can review your address and place your order.';
      return { reply: fallbackReply, language: lang, toolsUsed: ['auth_required'], actions, recommendedProducts, sessionState: nextSessionState };
    }

    try {
      const quote = await calculateCheckoutQuote({ items: cartItems, customBowls, userId: user.id });
      const userAddresses = await listAddressesByUser(user.id);
      const chosenAddr =
        userAddresses.find((a) => a.id === selectedAddressId) ||
        userAddresses.find((a) => a.isDefault) ||
        userAddresses[0];

      if (!chosenAddr) {
        actions.push({ type: 'NAVIGATE', to: '/addresses/new', label: 'Add Delivery Address' });
        fallbackReply = isTelugu
          ? 'మీ వద్ద ఇంకా డెలివరీ అడ్రస్ సేవ్ కాలేదు. దయచేసి ముందుగా మీ అడ్రస్ యాడ్ చేయండి.'
          : 'You do not have a saved delivery address yet. Let me open the address page so you can add one.';
        return { reply: fallbackReply, language: lang, toolsUsed: ['show_saved_addresses'], actions, recommendedProducts, sessionState: nextSessionState };
      }

      const legacyAddr = formatAddressForLegacy(chosenAddr);
      const chosenSlot = slots.find((s) => s.id === slotId && s.available) || slots.find((s) => s.available) || slots[0];
      const itemSummary = quote.items.map((it) => `${it.qty} × ${it.name}`).join(', ');
      const todayStr = new Date().toISOString().slice(0, 10);

      nextSessionState.pendingIntent = {
        type: 'confirm_order',
        address: {
          label: legacyAddr.label,
          recipient: legacyAddr.recipient,
          phone: legacyAddr.phone,
          line1: legacyAddr.line1,
          area: chosenAddr.area || '',
          city: legacyAddr.city,
          pincode: chosenAddr.pincode,
          notes: legacyAddr.notes,
        },
        slot: chosenSlot,
        scheduledDate: todayStr,
        paymentMethod: /(online|upi|razorpay|card|ఆన్‌లైన్)/i.test(cleanMsg) ? 'razorpay' : paymentMethod || 'cod',
      };

      toolsUsed.push('review_order_quote');
      actions.push({ type: 'NAVIGATE', to: '/cart', label: 'Review Checkout' });
      fallbackReply = isTelugu
        ? `మీ ఆర్డర్‌లో ${itemSummary} ఉన్నాయి. మొత్తం ₹${quote.pricing.grandTotal} (${legacyAddr.label} - ${chosenAddr.area || chosenAddr.pincode}). ఈ ఆర్డర్‌ను కన్ఫర్మ్ చేయాలా?`
        : `Your order has ${itemSummary}. Grand total is ₹${quote.pricing.grandTotal}, delivering to ${legacyAddr.label} (${chosenAddr.pincode}). Should I confirm your order?`;
    } catch {
      fallbackReply = isTelugu
        ? 'ప్రస్తుతం మీ కార్ట్ ఖాళీగా ఉంది. ముందుగా ఏదైనా ఆహారం కార్ట్‌లో యాడ్ చేయండి.'
        : 'Your cart is empty right now. Tell me what you would like to add first!';
    }
    return { reply: fallbackReply, language: lang, toolsUsed, actions, recommendedProducts, sessionState: nextSessionState };
  }

  // ------------------------------------------------------------------
  // 2. ORDER TRACKING (Authenticated Only)
  // ------------------------------------------------------------------
  if (/(where is my order|order status|my order|track|delivered|ఎక్కడ ఉంది|ఆర్డర్ స్టేటస్|naa order|డెలివరీ అయిందా)/i.test(cleanMsg)) {
    toolsUsed.push('get_order_status');
    preserveExactReply = true;
    if (!user) {
      actions.push({ type: 'NAVIGATE', to: '/login', label: 'Sign In' });
      fallbackReply = isTelugu
        ? 'మీ ఆర్డర్ స్టేటస్ చూడటానికి దయచేసి ముందుగా మీ అకౌంట్‌లో లాగిన్ అవ్వండి.'
        : 'Please sign in to your HRUVITA account so I can check your order status safely.';
    } else {
      const orders = await listOrdersByUser(user.id);
      if (orders.length === 0) {
        fallbackReply = isTelugu
          ? 'మీరు ఇంకా ఏ ఆర్డర్ చేయలేదు. ఈరోజు తాజా ఫ్రూట్ బౌల్ లేదా ఇడ్లీ ఆర్డర్ చేయాలా?'
          : 'You have not placed any orders yet. Would you like to order a fresh fruit bowl or tiffin?';
      } else {
        const latest = orders[0];
        actions.push({ type: 'NAVIGATE', to: '/dashboard', label: `View Order ${latest.id}` });
        fallbackReply = isTelugu
          ? `మీ తాజా ఆర్డర్ ${latest.id} ప్రస్తుతం "${latest.status.replace(/_/g, ' ')}" స్థితిలో ఉంది. మొత్తం ₹${latest.pricing?.grandTotal}, డెలివరీ ${latest.scheduledDate} (${latest.slotLabel}).`
          : `Your latest order ${latest.id} is currently ${latest.status.replace(/_/g, ' ')} for ₹${latest.pricing?.grandTotal}, scheduled on ${latest.scheduledDate} (${latest.slotLabel}).`;
      }
    }
    return { reply: fallbackReply, language: lang, toolsUsed, actions, recommendedProducts, sessionState: nextSessionState };
  }

  // ------------------------------------------------------------------
  // 3. CUSTOM FRUIT BOWL BUILDER DISCOVERY
  // ------------------------------------------------------------------
  if (/(make my own|custom.*bowl|build.*bowl|own fruit bowl|సొంత.*బౌల్|కస్టమ్ బౌల్)/i.test(cleanMsg)) {
    toolsUsed.push('open_bowl_builder');
    preserveExactReply = true;
    nextSessionState.pendingIntent = { type: 'bowl_fruits', sizeId: 'medium' };
    actions.push({ type: 'NAVIGATE', to: '/build-bowl', label: 'Build Your Bowl' });
    fallbackReply = isTelugu
      ? 'తప్పకుండా! మీ కోసం Build Your Own Bowl ఓపెన్ చేశాను. మీ బౌల్‌లో ఏ పండ్లు కావాలి? (ఉదాహరణకు: యాపిల్, అరటి, దానిమ్మ, మామిడి)'
      : 'Sure! I opened Build Your Own Bowl for you. Which fruits would you like in your bowl — for example apple, banana, pomegranate, or mango?';
    return { reply: fallbackReply, language: lang, toolsUsed, actions, recommendedProducts, sessionState: nextSessionState };
  }

  // ------------------------------------------------------------------
  // 4. DAILY SUBSCRIPTIONS
  // ------------------------------------------------------------------
  if (/(daily breakfast|subscription|plans|సబ్‌స్క్రిప్షన్|రోజూ బ్రేక్‌ఫాస్ట్|ప్లాన్)/i.test(cleanMsg)) {
    toolsUsed.push('show_subscriptions');
    preserveExactReply = true;
    const planSummary = plans.map((p) => `${p.name} (₹${p.price})`).join(', ');
    actions.push({ type: 'NAVIGATE', to: '/subscriptions', label: 'View Breakfast Plans' });
    fallbackReply = isTelugu
      ? `మా వద్ద ${planSummary} బ్రేక్‌ఫాస్ట్ సబ్‌స్క్రిప్షన్ ప్లాన్స్ ఉన్నాయి. మీరు ఎప్పుడైనా 10 PM లోపు పాజ్ చేసుకోవచ్చు!`
      : `We offer ${planSummary} daily breakfast subscriptions! You can choose your favorite meal, start date, and pause anytime.`;
    return { reply: fallbackReply, language: lang, toolsUsed, actions, recommendedProducts, sessionState: nextSessionState };
  }

  // ------------------------------------------------------------------
  // 5. OFFERS, SLOTS & SAVED ADDRESSES
  // ------------------------------------------------------------------
  if (/(offer|coupon|discount|ఆఫర్|కూపన్|డిస్కౌంట్)/i.test(cleanMsg)) {
    toolsUsed.push('get_offers');
    const offerText = coupons.slice(0, 3).map((c) => `${c.code} (${c.title})`).join(', ');
    toolFacts.push(`Active coupons: ${offerText}`);
    fallbackReply = isTelugu
      ? `ప్రస్తుతం అందుబాటులో ఉన్న ఆఫర్లు: ${offerText}. చెకౌట్‌లో కూపన్ అప్లై చేయండి!`
      : `Here are our active offers: ${offerText}. You can apply any code at checkout!`;
  } else if (/(slot|timing|delivery time|టైమింగ్|డెలివరీ ఎప్పుడు|స్లాట్)/i.test(cleanMsg)) {
    toolsUsed.push('list_delivery_slots');
    const slotText = slots.filter((s) => s.available).map((s) => `${s.name} (${s.window})`).join(', ');
    toolFacts.push(`Available slots today: ${slotText}`);
    fallbackReply = isTelugu
      ? `ఈరోజు అందుబాటులో ఉన్న డెలివరీ స్లాట్లు: ${slotText}. ₹${settings.freeDeliveryAbove || 199} పైన ఆర్డర్‌కు ఉచిత డెలివరీ!`
      : `Today's available delivery slots are ${slotText}. Delivery is free above ₹${settings.freeDeliveryAbove || 199}.`;
  } else if (/(address|addresses|అడ్రస్)/i.test(cleanMsg)) {
    toolsUsed.push('show_saved_addresses');
    actions.push({ type: 'NAVIGATE', to: '/addresses', label: 'Manage Addresses' });
    fallbackReply = isTelugu
      ? 'మీ సేవ్ చేసిన డెలివరీ అడ్రస్‌లను చూడటానికి Addresses పేజీ ఓపెన్ చేశాను.'
      : 'I opened your Saved Addresses page so you can view, select, or add a new delivery address.';
  }
  // ------------------------------------------------------------------
  // 6. VIEW CART / TOTAL PRICE
  // ------------------------------------------------------------------
  else if (/(view cart|my cart|show.*cart|what is in cart|how much is my total|cart total|కార్ట్|మొత్తం ఎంత)/i.test(cleanMsg)) {
    toolsUsed.push('view_cart');
    preserveExactReply = true;
    const hasCatalog = Object.values(cartItems || {}).some((q) => Number(q) > 0);
    const hasBowls = Array.isArray(customBowls) && customBowls.length > 0;
    if (!hasCatalog && !hasBowls) {
      fallbackReply = isTelugu
        ? 'ప్రస్తుతం మీ కార్ట్ ఖాళీగా ఉంది. ఏదైనా ఐటమ్ యాడ్ చేయమని చెప్పండి!'
        : 'Your cart is currently empty. Tell me what you would like to add!';
    } else {
      const quote = await calculateCheckoutQuote({ items: cartItems, customBowls, userId: user?.id || null });
      const names = quote.items.map((it) => `${it.qty} × ${it.name}`).join(', ');
      actions.push({ type: 'NAVIGATE', to: '/cart', label: 'Open Cart' });
      actions.push({ type: 'OPEN_CART_SUGGESTION' });
      fallbackReply = isTelugu
        ? `మీ కార్ట్‌లో ${names} ఉన్నాయి. మొత్తం చెల్లించాల్సినది ₹${quote.pricing.grandTotal} (డెలివరీ ₹${quote.pricing.deliveryCharge}, GST ₹${quote.pricing.taxAmount}). ఆర్డర్ కన్ఫర్మ్ చేయాలా?`
        : `Your cart has ${names}. Your grand total is ₹${quote.pricing.grandTotal} (including ₹${quote.pricing.deliveryCharge} delivery and ₹${quote.pricing.taxAmount} GST). Would you like to place the order?`;
    }
  }
  // ------------------------------------------------------------------
  // 7. REMOVE OR UPDATE QUANTITY IN CART
  // ------------------------------------------------------------------
  else if (/(remove|delete|drop|తొలగించు|తీసేయ్)/i.test(cleanMsg)) {
    const matched = matchProductsFromText(cleanMsg, allProducts);
    if (matched.length > 0) {
      const target = matched[0];
      const currentQty = Number(cartItems?.[target.id] || 0);
      const removeQty = extractQuantity(cleanMsg) || 1;
      const nextQty = Math.max(0, currentQty - removeQty);
      toolsUsed.push('remove_from_cart');
      preserveExactReply = true;
      if (currentQty <= 0) {
        fallbackReply = isTelugu
          ? `మీ కార్ట్‌లో ${target.name} లేదు.`
          : `${target.name} is not currently in your cart.`;
      } else {
        actions.push({ type: 'UPDATE_CART_QTY', productId: target.id, productName: target.name, qty: nextQty });
        fallbackReply = isTelugu
          ? `${target.name} ను మీ కార్ట్ నుండి అప్‌డేట్ చేశాను (ఇప్పుడు ${nextQty}).`
          : `Updated ${target.name} in your cart (now ${nextQty}).`;
      }
    }
  } else if (/(change|update|set|మార్చు)/i.test(cleanMsg) && extractQuantity(cleanMsg)) {
    const matched = matchProductsFromText(cleanMsg, allProducts);
    const newQty = extractQuantity(cleanMsg);
    if (matched.length > 0 && newQty) {
      const target = matched[0];
      toolsUsed.push('update_quantity');
      preserveExactReply = true;
      actions.push({ type: 'UPDATE_CART_QTY', productId: target.id, productName: target.name, qty: Math.min(newQty, target.stock) });
      fallbackReply = isTelugu
        ? `మీ కార్ట్‌లో ${target.name} క్వాంటిటీని ${newQty} కు మార్చాను.`
        : `Updated ${target.name} quantity in your cart to ${newQty}.`;
    }
  }
  // ------------------------------------------------------------------
  // 8. MOOD-BASED RECOMMENDATIONS
  // ------------------------------------------------------------------
  else if (/(hungry|starving|ఆకలి|కడుపు నిండా)/i.test(cleanMsg)) {
    toolsUsed.push('mood_recommendation');
    const picks = availableProducts.filter((p) => ['tiffins', 'lunch'].includes(p.category) && p.stock > 0).slice(0, 3);
    recommendedProducts = picks.map(formatProductCard);
    actions.push({ type: 'NAVIGATE', to: '/menu?category=tiffins', label: 'View Tiffins' });
    toolFacts.push(`Mood=Hungry. Filling picks: ${picks.map((p) => `${p.name} ₹${p.discountPrice || p.price}`).join(', ')}`);
    fallbackReply = isTelugu
      ? `మీకు బాగా ఆకలిగా ఉందా? ఇవిగో వేడివేడి, కడుపు నిండే టిఫిన్స్: ${picks.map((p) => `${p.name} (₹${p.discountPrice || p.price})`).join(', ')}. ఏది యాడ్ చేయమంటారు?`
      : `Feeling hungry? Here are our filling breakfast picks: ${picks.map((p) => `${p.name} (₹${p.discountPrice || p.price})`).join(', ')}. Which one would you like?`;
  } else if (/(tired|exhausted|fatigue|refresh|అలసటగా|అలసట|నీరసం|ఫ్రెష్)/i.test(cleanMsg)) {
    toolsUsed.push('mood_recommendation');
    const picks = availableProducts.filter((p) => ['fruit-bowls', 'juices'].includes(p.category) && p.stock > 0).slice(0, 3);
    recommendedProducts = picks.map(formatProductCard);
    actions.push({ type: 'NAVIGATE', to: '/menu?category=fruit-bowls', label: 'View Fruit Bowls' });
    toolFacts.push(`Mood=Tired. Refreshing picks: ${picks.map((p) => `${p.name} ₹${p.discountPrice || p.price}`).join(', ')}`);
    fallbackReply = isTelugu
      ? `మీకు ఫ్రెష్‌గా అనిపించడానికి ఒక ఫ్రూట్ బౌల్ లేదా తాజా జ్యూస్ ట్రై చేయొచ్చు: ${picks.map((p) => `${p.name} (₹${p.discountPrice || p.price})`).join(', ')}. మీకు ఏది ఇష్టం?`
      : `To help you feel refreshed, you can try a fresh fruit bowl or cold-pressed juice: ${picks.map((p) => `${p.name} (₹${p.discountPrice || p.price})`).join(', ')}. Which one sounds good?`;
  } else if (/(spicy|కారంగా|కారం)/i.test(cleanMsg)) {
    toolsUsed.push('mood_recommendation');
    const picks = availableProducts.filter((p) => ['tiffins', 'snacks'].includes(p.category) && p.stock > 0).slice(0, 3);
    recommendedProducts = picks.map(formatProductCard);
    actions.push({ type: 'NAVIGATE', to: '/menu?category=tiffins', label: 'View Spicy Tiffins' });
    toolFacts.push(`Mood=Spicy. Picks: ${picks.map((p) => `${p.name} ₹${p.discountPrice || p.price}`).join(', ')}`);
    fallbackReply = isTelugu
      ? `తప్పకుండా! కారంగా, రుచిగా ఉండే టిఫిన్స్ ఇవిగో: ${picks.map((p) => `${p.name} (₹${p.discountPrice || p.price})`).join(', ')}.`
      : `Sure! Here are our flavorful tiffin options: ${picks.map((p) => `${p.name} (₹${p.discountPrice || p.price})`).join(', ')}.`;
  } else if (/(confused|suggest|recommend|what should i eat|ఏమి తినాలి|సలహా)/i.test(cleanMsg)) {
    toolsUsed.push('mood_recommendation');
    const picks = availableProducts.filter((p) => p.bestseller && p.stock > 0).slice(0, 3);
    recommendedProducts = picks.map(formatProductCard);
    toolFacts.push(`Popular picks: ${picks.map((p) => `${p.name} ₹${p.discountPrice || p.price}`).join(', ')}`);
    fallbackReply = isTelugu
      ? 'తప్పకుండా సహాయం చేస్తాను! మీకు కడుపు నిండే టిఫిన్ కావాలా, తాజా జ్యూస్ కావాలా, లేదా ఫ్రూట్ బౌల్ కావాలా?'
      : 'Of course! Would you prefer a filling breakfast, a refreshing juice, or a fresh fruit bowl?';
  }
  // ------------------------------------------------------------------
  // 9. PRODUCT-SPECIFIC CONVERSATION OR CATEGORY DETECTION
  // ------------------------------------------------------------------
  else {
    const matchedProducts = matchProductsFromText(cleanMsg, availableProducts);
    const matchedCat = CATEGORY_ALIASES.find((c) => c.regex.test(cleanMsg));
    const hasSpecificDishWord =
      /(idli|idly|ఇడ్లీ|dosa|దోస|దోశ|pongal|పొంగల్|upma|ఉప్మా|orange|ఆరెంజ్|నారింజ|watermelon|పుచ్చకాయ|pomegranate|దానిమ్మ|banana|అరటి|mango|మామిడి|milk|పాలు|curd|పెరుగు|paneer|పనీర్|ragi|రాగి|sprouts|మొలకలు|thali|భోజనం|mixed fruit|exotic)/i.test(
        cleanMsg
      );

    if (matchedProducts.length > 0 && (!matchedCat || hasSpecificDishWord)) {
      toolsUsed.push('search_products', 'check_stock');
      const primary = matchedProducts[0];
      const unitP = primary.discountPrice || primary.price;
      const qty = extractQuantity(cleanMsg);
      const directAddVerb = /(add|order|buy|cart|pettu|యాడ్|పెట్టు)/i.test(cleanMsg);

      recommendedProducts = matchedProducts.slice(0, 3).map(formatProductCard);

      if (primary.stock <= 0) {
        preserveExactReply = true;
        fallbackReply = isTelugu
          ? `క్షమించండి, ${primary.name} ప్రస్తుతం స్టాక్‌లో లేదు. దానికి బదులుగా ఫ్రెష్ ఆరెంజ్ జ్యూస్ లేదా మిక్స్‌డ్ ఫ్రూట్ బౌల్ ట్రై చేస్తారా?`
          : `Sorry, ${primary.name} is currently out of stock. Would you like to try our Fresh Orange Juice or Mixed Fruit Bowl instead?`;
      } else if (directAddVerb && qty) {
        preserveExactReply = true;
        toolsUsed.push('add_to_cart');
        actions.push({
          type: 'ADD_TO_CART',
          productId: primary.id,
          productName: primary.name,
          qty: Math.min(qty, primary.stock),
          unitPrice: unitP,
        });
        actions.push({ type: 'OPEN_CART_SUGGESTION' });
        fallbackReply = isTelugu
          ? `అలాగే! ${qty} × ${primary.name} (₹${unitP * qty}) మీ కార్ట్‌లో యాడ్ చేశాను. చెకౌట్ ఓపెన్ చేయాలా?`
          : `Added ${qty} × ${primary.name} (₹${unitP * qty}) to your cart! Would you like to open checkout or add anything else?`;
      } else {
        // Multi-turn product inquiry -> navigate to Product Detail & ask quantity
        preserveExactReply = true;
        nextSessionState.pendingIntent = { type: 'product_qty', productId: primary.id };
        actions.push({ type: 'NAVIGATE', to: `/product/${primary.id}`, label: `View ${primary.name}` });
        fallbackReply = isTelugu
          ? `చాలా మంచిది! ${primary.name} (₹${unitP}) అందుబాటులో ఉంది. మీకు ఎన్ని ప్లేట్లు లేదా యూనిట్లు కావాలి?`
          : `Great choice! ${primary.name} is ₹${unitP} and freshly available. How many would you like?`;
      }
    } else if (matchedCat) {
      toolsUsed.push('show_category');
      const catItems = availableProducts.filter((p) => p.category === matchedCat.slug && p.stock > 0).slice(0, 4);
      recommendedProducts = catItems.map(formatProductCard);
      actions.push({ type: 'NAVIGATE', to: `/menu?category=${matchedCat.slug}`, label: `Browse ${matchedCat.label}` });
      toolFacts.push(`Category ${matchedCat.label}: ${catItems.map((p) => `${p.name} ₹${p.discountPrice || p.price}`).join(', ')}`);
      fallbackReply = isTelugu
        ? `తప్పకుండా! ఇవిగో ఈరోజు అందుబాటులో ఉన్న ${matchedCat.label} ఐటమ్స్.`
        : `Sure! Here are our available ${matchedCat.label} options right now.`;
    } else {
      toolsUsed.push('get_business_info_and_faqs');
      const faqs = Array.isArray(settings.aiFaqs) && settings.aiFaqs.length ? settings.aiFaqs : DEFAULT_FAQS;
      toolFacts.push(`Hours: ${settings.hours}, City: ${settings.city}, FAQs: ${faqs.map((f) => `${f.q} ${f.a}`).join(' ')}`);
      fallbackReply = isTelugu
        ? `నమస్కారం! నేను HRUVITA AI. టిఫిన్స్, ఫ్రూట్ బౌల్స్, జ్యూస్‌లు వెతకడానికి, మీ సొంత బౌల్ తయారు చేయడానికి లేదా ఆర్డర్ చేయడానికి నన్ను అడగండి.`
        : `Hello! I'm HRUVITA AI. Ask me to browse tiffins, fruit bowls, fresh juices, build a custom bowl, or track your order!`;
    }
  }

  const llmReply = preserveExactReply
    ? null
    : await callOptionalFreeLlm({
        userMessage: cleanMsg,
        lang,
        toolContext: toolFacts.join('\n'),
        history,
        settings,
      });

  return {
    reply: llmReply || fallbackReply,
    language: lang,
    toolsUsed,
    actions,
    recommendedProducts,
    sessionState: nextSessionState,
  };
}
