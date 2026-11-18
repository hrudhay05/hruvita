import {
  listProducts,
  listCoupons,
  listSlots,
  listOrdersByUser,
  getSettings,
} from '../store/repository.js';

// Fixed safe tool list — the AI never accesses MongoDB directly
const DEFAULT_FAQS = [
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
    a: 'Yes, you can pause or resume your 7, 15, or 30-day breakfast subscription anytime from your Customer Dashboard before the daily cut-off time.',
  },
  {
    q: 'Are your fruit bowls and juices preservative-free?',
    a: 'Every fruit bowl and cold-pressed juice is prepared fresh daily with zero preservatives and no added refined sugar.',
  },
];

// Telugu/Tenglish keyword mapping to English search terms for accurate menu matching
const TELUGU_ALIASES = [
  [/ఇడ్లీ|idly|idli/i, 'idli'],
  [/దోస|దోశ|dosa/i, 'dosa'],
  [/పొంగల్|pongal/i, 'pongal'],
  [/ఉప్మా|upma/i, 'upma'],
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

function extractQuantity(text) {
  const numMatch = text.match(/\b([1-9])\b/);
  if (numMatch) return Number(numMatch[1]);
  if (/రెండు|rendu|two/i.test(text)) return 2;
  if (/మూడు|mudu|three/i.test(text)) return 3;
  if (/నాలుగు|nalugu|four/i.test(text)) return 4;
  return 1;
}

function detectLanguage(text, requestedLang = 'en-IN') {
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
  if (/(cheyandi|kavali|enti|unnaya|entha|pettu|add chey|namaskaram|bagunda)/i.test(text)) {
    return 'te-IN';
  }
  return requestedLang === 'te-IN' ? 'te-IN' : 'en-IN';
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

  // Prefer non-combo exact dish matches unless the user asked for a combo
  return hits.sort((a, b) => {
    const aCombo = a.category === 'combos' ? 1 : 0;
    const bCombo = b.category === 'combos' ? 1 : 0;
    if (!wantsCombo && aCombo !== bCombo) return aCombo - bCombo;
    const aNameHit = matchedTerms.some((t) => a.name.toLowerCase().startsWith(t)) ? 1 : 0;
    const bNameHit = matchedTerms.some((t) => b.name.toLowerCase().startsWith(t)) ? 1 : 0;
    return bNameHit - aNameHit;
  });
}

async function callOptionalFreeLlm({ userMessage, lang, toolContext, settings }) {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  const systemPrompt = [
    `You are ${settings.aiName || 'HRUVITA Assistant'}, a friendly healthy-food ordering assistant for ${settings.name || 'HRUVITA'} in ${settings.city || 'Hyderabad'}.`,
    lang === 'te-IN'
      ? 'Reply warmly in natural, simple Telugu (using Telugu script or clear Telugu-English mix). Keep responses short (2-3 sentences) so they sound great when spoken aloud.'
      : 'Reply warmly in clear, concise Indian English (2-3 sentences) suitable for voice output.',
    'Rules: Only mention real items, prices, stock, slots, and offers provided in the Tool Context below. Never invent prices or items. Never pressure customers. Never make medical claims. Never ask for UPI PINs or card details.',
    settings.aiInstructions || '',
    `\nTool Context:\n${toolContext}`,
  ]
    .filter(Boolean)
    .join('\n');

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
          temperature: 0.4,
          max_tokens: 220,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) return reply;
      }
    } catch {
      // fall through to Gemini or deterministic response
    }
  }

  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nCustomer: ${userMessage}` }] }],
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (reply) return reply;
      }
    } catch {
      // fall through to deterministic response
    }
  }

  return null;
}

export async function processAssistantTurn({
  message,
  language = 'en-IN',
  user = null,
  cartItems = {},
}) {
  const cleanMsg = String(message || '').trim();
  const lang = detectLanguage(cleanMsg, language);
  const isTelugu = lang === 'te-IN';

  const [allProducts, coupons, slots, settings] = await Promise.all([
    listProducts(),
    listCoupons(),
    listSlots(),
    getSettings(),
  ]);

  const toolsUsed = [];
  const actions = [];
  const toolFacts = [];
  let fallbackReply = '';

  const lower = cleanMsg.toLowerCase();

  // 1. Order Status Tool (authenticated customer only)
  if (/(order status|my order|track|ఎక్కడ ఉంది|ఆర్డర్ స్టేటస్|naa order)/i.test(cleanMsg)) {
    toolsUsed.push('get_order_status');
    if (!user) {
      toolFacts.push('Customer is not logged in.');
      fallbackReply = isTelugu
        ? 'మీ ఆర్డర్ స్టేటస్ చూడటానికి దయచేసి ముందుగా మీ HRUVITA అకౌంట్‌లో లాగిన్ అవ్వండి.'
        : 'Please sign in to your HRUVITA account first so I can check your latest order status.';
    } else {
      const orders = await listOrdersByUser(user.id);
      if (orders.length === 0) {
        toolFacts.push('Customer has 0 orders.');
        fallbackReply = isTelugu
          ? 'మీరు ఇంకా ఏ ఆర్డర్ చేయలేదు. ఈరోజు తాజా ఫ్రూట్ బౌల్ లేదా ఇడ్లీ ఆర్డర్ చేయాలా?'
          : 'You do not have any orders yet. Would you like me to add a fresh fruit bowl or breakfast tiffin to your cart?';
      } else {
        const latest = orders[0];
        toolFacts.push(
          `Latest order ${latest.id}: status=${latest.status}, total=₹${latest.pricing?.grandTotal}, slot=${latest.scheduledDate} ${latest.slotLabel}`
        );
        fallbackReply = isTelugu
          ? `మీ తాజా ఆర్డర్ ${latest.id} ప్రస్తుతం "${latest.status.replace(/_/g, ' ')}" స్థితిలో ఉంది. మొత్తం ₹${latest.pricing?.grandTotal}, డెలివరీ ${latest.scheduledDate} (${latest.slotLabel}).`
          : `Your latest order ${latest.id} is currently ${latest.status.replace(/_/g, ' ')} for ₹${latest.pricing?.grandTotal}, scheduled on ${latest.scheduledDate} (${latest.slotLabel}).`;
      }
    }
  }
  // 2. Offers & Coupons Tool
  else if (/(offer|coupon|discount|ఆఫర్|కూపన్|డిస్కౌంట్)/i.test(cleanMsg)) {
    toolsUsed.push('get_offers');
    const offerText = coupons.map((c) => `${c.code}: ${c.title}`).join('; ');
    toolFacts.push(`Active coupons: ${offerText}`);
    fallbackReply = isTelugu
      ? `ప్రస్తుతం అందుబాటులో ఉన్న ఆఫర్లు: ${coupons
          .slice(0, 3)
          .map((c) => `${c.code} (${c.title})`)
          .join(', ')}. చెకౌట్‌లో కూపన్ కోడ్ అప్లై చేయండి!`
      : `Here are our active offers: ${coupons
          .slice(0, 3)
          .map((c) => `${c.code} — ${c.title}`)
          .join(' | ')}. You can apply any code at checkout!`;
  }
  // 3. Delivery Slots Tool
  else if (/(slot|timing|delivery time|టైమింగ్|డెలివరీ ఎప్పుడు|స్లాట్)/i.test(cleanMsg)) {
    toolsUsed.push('list_delivery_slots');
    const slotText = slots.map((s) => `${s.name} (${s.window})`).join(', ');
    toolFacts.push(`Delivery slots: ${slotText}`);
    fallbackReply = isTelugu
      ? `మా డెలివరీ స్లాట్లు: ${slotText}. ₹${settings.freeDeliveryAbove || 199} పైన ఆర్డర్‌కు ఉచిత డెలివరీ ఉంటుంది.`
      : `Our delivery slots are ${slotText}. Delivery is free on orders above ₹${settings.freeDeliveryAbove || 199}.`;
  }
  // 4. View Cart Tool
  else if (/(view cart|my cart|what is in cart|కార్ట్ లో|నా కార్ట్)/i.test(cleanMsg)) {
    toolsUsed.push('view_cart');
    const entries = Object.entries(cartItems || {}).filter(([, q]) => Number(q) > 0);
    if (entries.length === 0) {
      toolFacts.push('Cart is empty.');
      fallbackReply = isTelugu
        ? 'ప్రస్తుతం మీ కార్ట్ ఖాళీగా ఉంది. ఏదైనా ఐటమ్ యాడ్ చేయమని చెప్పండి!'
        : 'Your cart is currently empty. Tell me any item you would like to add!';
    } else {
      const names = entries.map(([id, q]) => {
        const p = allProducts.find((item) => item.id === id);
        return p ? `${q} × ${p.name}` : `${q} × ${id}`;
      });
      toolFacts.push(`Cart items: ${names.join(', ')}`);
      actions.push({ type: 'OPEN_CART_SUGGESTION' });
      fallbackReply = isTelugu
        ? `మీ కార్ట్‌లో ఉన్న ఐటమ్స్: ${names.join(', ')}. చెకౌట్ ఓపెన్ చేసి ఆర్డర్ పూర్తి చేయవచ్చు.`
        : `Your cart has: ${names.join(', ')}. Tap Open Checkout whenever you are ready to pay.`;
    }
  }
  // 5. Add to Cart / Search / Stock Check
  else {
    const matched = matchProductsFromText(cleanMsg, allProducts);
    const wantsAdd =
      /(add|order|buy|cart|kavali|cheyandi|pettu|కావాలి|యాడ్|ఆర్డర్|పెట్టు|తీసుకో)/i.test(cleanMsg);

    if (matched.length > 0) {
      toolsUsed.push('search_products', 'check_stock');
      const primary = matched[0];
      const unitP = primary.discountPrice || primary.price;
      const qty = extractQuantity(cleanMsg);

      toolFacts.push(
        `Matched products: ${matched
          .slice(0, 4)
          .map((p) => `${p.name} (₹${p.discountPrice || p.price}, stock=${p.stock})`)
          .join('; ')}`
      );

      if (wantsAdd) {
        if (primary.stock <= 0) {
          fallbackReply = isTelugu
            ? `క్షమించండి, ${primary.name} ప్రస్తుతం స్టాక్‌లో లేదు. దానికి బదులుగా ఫ్రెష్ ఆరెంజ్ జ్యూస్ లేదా మిక్స్‌డ్ ఫ్రూట్ బౌల్ ట్రై చేస్తారా?`
            : `Sorry, ${primary.name} is currently out of stock. Would you like to try our Fresh Orange Juice or Mixed Fruit Bowl instead?`;
        } else {
          toolsUsed.push('add_to_cart');
          actions.push({
            type: 'ADD_TO_CART',
            productId: primary.id,
            productName: primary.name,
            qty: Math.min(qty, primary.stock),
            unitPrice: unitP,
          });
          fallbackReply = isTelugu
            ? `${qty} × ${primary.name} (₹${unitP * qty}) మీ కార్ట్‌లో యాడ్ చేశాను! చెకౌట్ ఓపెన్ చేయాలా లేదా ఇంకేమైనా కాంబో యాడ్ చేయాలా?`
            : `Added ${qty} × ${primary.name} (₹${unitP * qty}) to your cart! Would you like to add a fresh juice combo or proceed to checkout?`;
        }
      } else {
        const listSummary = matched
          .slice(0, 3)
          .map((p) => `${p.name} (₹${p.discountPrice || p.price}${p.stock <= 0 ? ', Sold out' : ''})`)
          .join(', ');
        fallbackReply = isTelugu
          ? `మా మెనూలో అందుబాటులో ఉన్నవి: ${listSummary}. ఏదైనా కార్ట్‌లో యాడ్ చేయాలా?`
          : `Here is what we have: ${listSummary}. Would you like me to add any of these to your cart?`;
      }
    } else if (/(subscription|plan|సబ్‌స్క్రిప్షన్|ప్లాన్|రోజూ)/i.test(cleanMsg)) {
      toolsUsed.push('get_business_info_and_faqs');
      toolFacts.push('Subscriptions: 7 Days ₹350, 15 Days ₹720, 30 Days ₹1350.');
      actions.push({ type: 'NAVIGATE_SUGGESTION', to: '/subscriptions', label: 'View Subscriptions' });
      fallbackReply = isTelugu
        ? 'మా వద్ద 7 రోజుల (₹350), 15 రోజుల (₹720), మరియు 30 రోజుల (₹1,350) బ్రేక్‌ఫాస్ట్ సబ్‌స్క్రిప్షన్ ప్లాన్స్ ఉన్నాయి. ఎప్పుడైనా పాజ్ చేసుకోవచ్చు!'
        : 'We offer 7-day (₹350), 15-day (₹720), and 30-day (₹1,350) daily breakfast subscriptions with flexible pause & resume.';
    } else if (/(custom|build|own bowl|నా బౌల్|కస్టమ్)/i.test(cleanMsg)) {
      toolsUsed.push('get_business_info_and_faqs');
      actions.push({ type: 'NAVIGATE_SUGGESTION', to: '/build-bowl', label: 'Open Bowl Builder' });
      fallbackReply = isTelugu
        ? 'మీరు "Build Your Bowl" లో మీకు నచ్చిన సైజ్, పండ్లు, సీడ్స్ మరియు తేనెతో మీ సొంత ఫ్రూట్ బౌల్ తయారు చేసుకోవచ్చు!'
        : 'You can customize your own fruit bowl with your favorite size, fruits, seeds, and honey in our Build Your Bowl page!';
    } else {
      toolsUsed.push('get_business_info_and_faqs');
      const faqs = Array.isArray(settings.aiFaqs) && settings.aiFaqs.length ? settings.aiFaqs : DEFAULT_FAQS;
      toolFacts.push(
        `Hours: ${settings.hours}, City: ${settings.city}, FAQs: ${faqs.map((f) => `${f.q} ${f.a}`).join(' ')}`
      );
      fallbackReply = isTelugu
        ? `నమస్కారం! నేను ${settings.aiName || 'HRUVITA Assistant'}. ఇడ్లీ, మసాలా దోస, ఫ్రూట్ బౌల్స్, జ్యూస్‌లు ఆర్డర్ చేయడానికి లేదా ఆఫర్లు, ఆర్డర్ స్టేటస్ తెలుసుకోవడానికి నన్ను అడగండి.`
        : `Hello! I'm your ${settings.aiName || 'HRUVITA Assistant'}. Ask me to search the menu, check offers, add items like "2 Idli" or "Mixed Fruit Bowl" to your cart, or check your order status.`;
    }
  }

  const llmReply = await callOptionalFreeLlm({
    userMessage: cleanMsg,
    lang,
    toolContext: toolFacts.join('\n'),
    settings,
  });

  return {
    reply: llmReply || fallbackReply,
    language: lang,
    toolsUsed,
    actions,
  };
}

export { DEFAULT_FAQS };
