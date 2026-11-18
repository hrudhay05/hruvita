import {
  listProducts,
  listCategories,
  listCoupons,
  listSlotsForDate,
  listPlans,
  listOrdersByUser,
  getOrderById,
  listAddressesByUser,
  getAddressByIdForUser,
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
import { logAI, logAIError } from './aiLogger.js';

export const DEFAULT_FAQS = [
  {
    q: 'What are your delivery slots?',
    a: 'Morning (6:30–9:00 AM), Afternoon (12:30–2:30 PM), and Evening (6:30–8:30 PM).',
  },
  {
    q: 'Is delivery free?',
    a: 'Yes! Delivery is free above ₹199; otherwise ₹25 delivery fee applies.',
  },
  {
    q: 'Can I pause my breakfast subscription?',
    a: 'Yes, pause or resume anytime before 10 PM the previous day.',
  },
];

// 60-second cache ONLY for static business info (never cache cart, stock, or orders)
let staticCache = { ts: 0, settings: null, categories: null, plans: null };
async function getCachedStaticInfo() {
  const now = Date.now();
  if (staticCache.settings && now - staticCache.ts < 60_000) {
    return staticCache;
  }
  const [settings, categories, plans] = await Promise.all([
    getSettings(),
    listCategories(),
    listPlans(),
  ]);
  staticCache = { ts: now, settings, categories, plans };
  return staticCache;
}

export function detectLanguage(text, requestedLang = 'en-IN') {
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
  if (
    /(cheyandi|kavali|enti|unnaya|entha|pettu|add chey|namaskaram|bagunda|naku|naa|avunu|vaddu|chalu|tiffin|pampandi|akali|karam|teliyatledu|em tinalo|okati|rendu|moodu|ekkada|undi)/i.test(
      text
    )
  ) {
    return 'te-IN';
  }
  return requestedLang === 'te-IN' ? 'te-IN' : 'en-IN';
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
    description: p.description || '',
  };
}

// ============================================================
// TOOL DEFINITIONS FOR REAL AI FUNCTION CALLING
// ============================================================
const TOOL_DEFINITIONS = [
  {
    name: 'search_products',
    description:
      'Search real available HRUVITA food products in MongoDB by keyword, category slug (tiffins, fruit-bowls, juices, smoothies, dairy, healthy-drinks, combos, lunch, snacks), or maxPrice.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Dish name or keyword in English (e.g. idli, dosa, fruit bowl, orange juice, spicy, breakfast).' },
        category: { type: 'string', description: 'Optional category slug: tiffins, fruit-bowls, juices, smoothies, dairy, healthy-drinks, combos, lunch, snacks.' },
        maxPrice: { type: 'number', description: 'Optional maximum price in INR (e.g. 100).' },
      },
    },
  },
  {
    name: 'show_category',
    description: 'Navigate the website to a food category page and display its real available products.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category slug: tiffins, fruit-bowls, juices, smoothies, dairy, healthy-drinks, combos, lunch, snacks.',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'open_product_details',
    description: 'Get real details (price, stock, ingredients, diet tags) for a specific product and open its product page.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Exact product ID such as p1, p2, p5.' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a verified product and quantity to the customer cart after checking stock.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Exact product ID from search_products.' },
        quantity: { type: 'number', description: 'Quantity to add (1 to 20).' },
      },
      required: ['productId', 'quantity'],
    },
  },
  {
    name: 'update_cart_quantity',
    description: 'Update quantity of a product already in the cart (set quantity=0 to remove).',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'number' },
      },
      required: ['productId', 'quantity'],
    },
  },
  {
    name: 'remove_from_cart',
    description: 'Remove a product completely from the cart.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'view_cart',
    description: 'View current cart items, server-calculated subtotal, delivery charge, GST, and grand total, and open the cart page.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'open_checkout',
    description:
      'Check if the cart has items. If non-empty, open the checkout page and return the exact server-calculated total. If empty, report empty cart.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_saved_addresses',
    description: 'Retrieve saved delivery addresses for the logged-in customer.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'select_delivery_address',
    description: 'Select a saved delivery address owned by the logged-in customer.',
    parameters: {
      type: 'object',
      properties: {
        addressId: { type: 'string' },
      },
      required: ['addressId'],
    },
  },
  {
    name: 'get_subscription_plans',
    description: 'Retrieve live 7, 15, and 30-day breakfast subscription plans and open the Subscriptions page.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'build_custom_bowl',
    description:
      'Inspect live bowl options or create a custom fruit bowl with real DB ingredient pricing. Pass addToCart=true only after customer confirms.',
    parameters: {
      type: 'object',
      properties: {
        sizeId: { type: 'string', description: 'small, medium, or large' },
        fruitIds: { type: 'array', items: { type: 'string' }, description: 'e.g. ["apple","banana","pomegranate"]' },
        toppingIds: { type: 'array', items: { type: 'string' }, description: 'e.g. ["almonds","chia"]' },
        extraIds: { type: 'array', items: { type: 'string' }, description: 'e.g. ["honey","yogurt"]' },
        addToCart: { type: 'boolean', description: 'Set true only when customer explicitly asks to add the custom bowl to cart.' },
      },
    },
  },
  {
    name: 'get_my_orders',
    description: 'Retrieve authenticated customer order history and open the Orders dashboard.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'track_order',
    description: 'Track latest order or a specific order ID for the authenticated customer.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Optional order ID.' },
      },
    },
  },
  {
    name: 'get_business_info_and_offers',
    description: 'Retrieve real active coupon codes, delivery fees, free delivery threshold, kitchen hours, and today delivery slots.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'select_payment_method',
    description:
      'Select payment method during checkout: "cod" for Cash on Delivery, or "razorpay" for Online Payment (UPI/Card/NetBanking/PhonePe/GPay).',
    parameters: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['cod', 'razorpay'] },
      },
      required: ['method'],
    },
  },
  {
    name: 'place_cod_order',
    description:
      'Place a real Cash-on-Delivery order ONLY after customer explicitly confirmed the order summary and total. For online Razorpay payment, call initiate_online_checkout instead.',
    parameters: {
      type: 'object',
      properties: {
        confirmed: { type: 'boolean', description: 'Must be true only after explicit customer confirmation.' },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'initiate_online_checkout',
    description: 'Open checkout and initiate Razorpay online payment popup after explicit customer confirmation.',
    parameters: {
      type: 'object',
      properties: {
        confirmed: { type: 'boolean' },
      },
      required: ['confirmed'],
    },
  },
];

// ============================================================
// SECURE BACKEND TOOL EXECUTOR
// ============================================================
async function executeToolCall(
  toolName,
  args = {},
  ctx,
  stateAcc
) {
  const t0 = Date.now();
  logAI('HRUVITA-TOOLS', `Tool selected: ${toolName}`, args);

  const { user, cartItems, customBowls, selectedAddressId, slotId, vegOnly } = ctx;
  let result = {};

  switch (toolName) {
    case 'search_products': {
      const db0 = Date.now();
      const all = await listProducts({
        q: args.query || '',
        category: args.category || '',
        max: args.maxPrice || 0,
      });
      stateAcc.dbDurationMs += Date.now() - db0;
      const filtered = all
        .filter((p) => p.active !== false && p.stock > 0 && (!vegOnly || p.veg))
        .slice(0, 6);
      // Fallback: if query was broad (e.g. Telugu word not in English text index), return all available items so LLM can pick accurately!
      const finalPool =
        filtered.length > 0
          ? filtered.slice(0, 5)
          : (await listProducts()).filter((p) => p.active !== false && p.stock > 0).slice(0, 6);

      stateAcc.recommendedProducts = finalPool.slice(0, 4).map(formatProductCard);
      logAI('HRUVITA-PRODUCT', `${finalPool.length} matching products found`);
      result = {
        count: finalPool.length,
        products: finalPool.map((p) => ({
          id: p.id,
          name: p.name,
          cat: p.category,
          price: p.discountPrice || p.price,
          stock: p.stock,
        })),
      };
      break;
    }

    case 'show_category': {
      const slug = String(args.category || 'tiffins').toLowerCase().trim();
      const db0 = Date.now();
      const items = (await listProducts({ category: slug })).filter(
        (p) => p.active !== false && p.stock > 0 && (!vegOnly || p.veg)
      );
      stateAcc.dbDurationMs += Date.now() - db0;
      stateAcc.recommendedProducts = items.slice(0, 4).map(formatProductCard);
      logAI('HRUVITA-PRODUCT', `${items.length} category products found in ${slug}`);
      logAI('HRUVITA-NAVIGATION', `Opening product category: /menu?category=${slug}`);
      stateAcc.actions.push({ type: 'NAVIGATE', to: `/menu?category=${slug}`, label: `Browse ${slug}` });
      result = {
        navigatedTo: `/menu?category=${slug}`,
        products: items.slice(0, 6).map((p) => ({
          id: p.id,
          name: p.name,
          price: p.discountPrice || p.price,
          stock: p.stock,
        })),
      };
      break;
    }

    case 'open_product_details': {
      const db0 = Date.now();
      const all = await listProducts();
      stateAcc.dbDurationMs += Date.now() - db0;
      const prod = all.find((p) => p.id === args.productId);
      if (!prod) {
        logAIError('Product not found', new Error(`productId=${args.productId}`));
        result = { error: 'Product not found.' };
      } else {
        stateAcc.recommendedProducts = [formatProductCard(prod)];
        logAI('HRUVITA-PRODUCT', `Opening product details: ${prod.name} (${prod.id})`);
        logAI('HRUVITA-NAVIGATION', `Navigating to /product/${prod.id}`);
        stateAcc.actions.push({ type: 'NAVIGATE', to: `/product/${prod.id}`, label: `View ${prod.name}` });
        result = {
          navigatedTo: `/product/${prod.id}`,
          product: {
            id: prod.id,
            name: prod.name,
            price: prod.discountPrice || prod.price,
            stock: prod.stock,
            ingredients: prod.ingredients,
            dietTags: prod.dietTags,
            description: prod.description,
          },
        };
      }
      break;
    }

    case 'add_to_cart': {
      const qty = Math.max(1, Math.min(20, Math.floor(Number(args.quantity) || 1)));
      const db0 = Date.now();
      const all = await listProducts();
      stateAcc.dbDurationMs += Date.now() - db0;
      const prod = all.find((p) => p.id === args.productId);
      if (!prod || prod.active === false) {
        result = { success: false, error: 'Product not found or inactive.' };
      } else if (prod.stock < qty) {
        result = {
          success: false,
          error: prod.stock <= 0 ? `${prod.name} is out of stock.` : `Only ${prod.stock} left of ${prod.name}.`,
        };
      } else {
        const unitP = prod.discountPrice || prod.price;
        logAI('HRUVITA-CART', `Adding product: ${prod.id} x ${qty}`);
        stateAcc.actions.push({
          type: 'ADD_TO_CART',
          productId: prod.id,
          productName: prod.name,
          qty,
          unitPrice: unitP,
        });
        stateAcc.actions.push({ type: 'OPEN_CART_SUGGESTION' });
        stateAcc.recommendedProducts = [formatProductCard(prod)];
        result = {
          success: true,
          added: { productId: prod.id, name: prod.name, qty, unitPrice: unitP, lineTotal: unitP * qty },
        };
      }
      break;
    }

    case 'update_cart_quantity': {
      const qty = Math.max(0, Math.min(20, Math.floor(Number(args.quantity) || 0)));
      const all = await listProducts();
      const prod = all.find((p) => p.id === args.productId);
      if (!prod) {
        result = { success: false, error: 'Product not found.' };
      } else if (qty > prod.stock) {
        result = { success: false, error: `Only ${prod.stock} available in stock.` };
      } else {
        logAI('HRUVITA-CART', `Updating quantity: ${prod.id} -> ${qty}`);
        stateAcc.actions.push({
          type: 'UPDATE_CART_QTY',
          productId: prod.id,
          productName: prod.name,
          qty,
        });
        result = { success: true, productId: prod.id, name: prod.name, newQuantity: qty };
      }
      break;
    }

    case 'remove_from_cart': {
      const all = await listProducts();
      const prod = all.find((p) => p.id === args.productId);
      logAI('HRUVITA-CART', `Removing product: ${args.productId}`);
      stateAcc.actions.push({
        type: 'UPDATE_CART_QTY',
        productId: args.productId,
        productName: prod?.name || args.productId,
        qty: 0,
      });
      result = { success: true, removedProductId: args.productId, name: prod?.name || args.productId };
      break;
    }

    case 'view_cart':
    case 'open_checkout': {
      const hasCatalog = Object.values(cartItems || {}).some((q) => Number(q) > 0);
      const hasBowls = Array.isArray(customBowls) && customBowls.length > 0;
      if (!hasCatalog && !hasBowls) {
        result = {
          empty: true,
          navigated: false,
          message: 'Cart is empty. Customer needs to add at least one item before checkout.',
        };
      } else {
        const quote = await calculateCheckoutQuote({
          items: cartItems,
          customBowls,
          userId: user?.id || null,
        });
        logAI('HRUVITA-CHECKOUT', `Opening ${toolName === 'open_checkout' ? 'checkout' : 'cart'} page`, quote.pricing);
        logAI('HRUVITA-NAVIGATION', 'Navigating to /cart');
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/cart', label: 'Open Cart & Checkout' });
        stateAcc.actions.push({ type: 'OPEN_CART_SUGGESTION' });
        result = {
          empty: false,
          navigatedTo: '/cart',
          items: quote.items.map((i) => ({ name: i.name, qty: i.qty, lineTotal: i.lineTotal })),
          pricing: quote.pricing,
          nextStep: 'Ask customer: Cash on Delivery or Online Payment?',
        };
      }
      break;
    }

    case 'get_saved_addresses': {
      if (!user) {
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/login', label: 'Sign In' });
        result = { authenticated: false, error: 'Customer must sign in to view saved addresses.' };
      } else {
        const addrs = await listAddressesByUser(user.id);
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/addresses', label: 'Manage Addresses' });
        result = {
          authenticated: true,
          addresses: addrs.map((a) => ({
            id: a.id,
            label: a.addressLabel,
            recipient: a.recipientName,
            area: a.area,
            pincode: a.pincode,
            isDefault: a.isDefault,
          })),
        };
      }
      break;
    }

    case 'select_delivery_address': {
      if (!user) {
        result = { success: false, error: 'Authentication required.' };
      } else {
        const addr = await getAddressByIdForUser(args.addressId, user.id);
        if (!addr) {
          result = { success: false, error: 'Address not found for your account.' };
        } else {
          stateAcc.actions.push({ type: 'SELECT_ADDRESS', addressId: addr.id });
          result = { success: true, selected: { id: addr.id, label: addr.addressLabel, pincode: addr.pincode } };
        }
      }
      break;
    }

    case 'get_subscription_plans': {
      const { plans } = await getCachedStaticInfo();
      stateAcc.actions.push({ type: 'NAVIGATE', to: '/subscriptions', label: 'View Subscriptions' });
      result = {
        navigatedTo: '/subscriptions',
        plans: plans.map((p) => ({ id: p.id, name: p.name, days: p.days, price: p.price, perDay: p.perDay })),
      };
      break;
    }

    case 'build_custom_bowl': {
      const bowlOpts = await getDynamicBowlOptions();
      stateAcc.actions.push({ type: 'NAVIGATE', to: '/build-bowl', label: 'Open Bowl Builder' });
      const allIngs = [...bowlOpts.fruits, ...bowlOpts.toppings, ...bowlOpts.extras];
      const draft = {
        sizeId: args.sizeId || 'medium',
        fruits: Array.isArray(args.fruitIds) ? args.fruitIds : [],
        toppings: Array.isArray(args.toppingIds) ? args.toppingIds : [],
        extras: Array.isArray(args.extraIds) ? args.extraIds : [],
        qty: 1,
      };
      const computed = computeCustomBowlPrice(draft, allIngs);
      if (args.addToCart && draft.fruits.length > 0) {
        stateAcc.actions.push({
          type: 'ADD_CUSTOM_BOWL',
          bowl: { ...draft, name: computed.name, summary: computed.summary, unitPrice: computed.unitPrice },
        });
      }
      result = {
        navigatedTo: '/build-bowl',
        availableSizes: bowlOpts.sizes,
        availableFruits: bowlOpts.fruits.map((f) => ({ id: f.id, name: f.name, extraPrice: f.price })),
        availableToppings: bowlOpts.toppings.map((t) => ({ id: t.id, name: t.name, extraPrice: t.price })),
        availableExtras: bowlOpts.extras.map((e) => ({ id: e.id, name: e.name, extraPrice: e.price })),
        computedBowl: { name: computed.name, summary: computed.summary, unitPrice: computed.unitPrice },
        addedToCart: Boolean(args.addToCart && draft.fruits.length > 0),
      };
      break;
    }

    case 'get_my_orders':
    case 'track_order': {
      if (!user) {
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/login', label: 'Sign In' });
        result = { authenticated: false, error: 'Customer must sign in to view or track orders.' };
      } else {
        const formatOrderStatus = (raw) => {
          const map = {
            pending: 'Confirmed',
            payment_pending: 'Payment Pending',
            confirmed: 'Confirmed',
            accepted: 'Processing',
            preparing: 'Processing',
            packed: 'Processing',
            out_for_delivery: 'Out for Delivery',
            delivered: 'Delivered',
            cancelled: 'Cancelled',
            refund_initiated: 'Cancelled',
            refunded: 'Cancelled',
          };
          return map[raw] || String(raw || 'Confirmed').replace(/_/g, ' ');
        };

        stateAcc.actions.push({ type: 'NAVIGATE', to: '/dashboard', label: 'Open Orders' });
        if (args.orderId) {
          const ord = await getOrderById(args.orderId);
          if (!ord || ord.userId !== user.id) {
            result = { error: 'Order not found for your account.' };
          } else {
            const card = {
              id: ord.id,
              status: formatOrderStatus(ord.status),
              rawStatus: ord.status,
              total: ord.pricing?.grandTotal || 0,
              scheduledDate: ord.scheduledDate,
              slotLabel: ord.slotLabel,
              items: (ord.items || []).map((i) => `${i.qty}× ${i.name}`).join(', '),
            };
            stateAcc.recommendedOrders = [card];
            result = {
              order: card,
              formattingRule: 'Do NOT use a Markdown table. The UI renders the order card automatically.',
            };
          }
        } else {
          const orders = await listOrdersByUser(user.id);
          const recentCards = orders.slice(0, 5).map((o) => ({
            id: o.id,
            status: formatOrderStatus(o.status),
            rawStatus: o.status,
            total: o.pricing?.grandTotal || 0,
            scheduledDate: o.scheduledDate,
            slotLabel: o.slotLabel,
            items: (o.items || []).map((i) => `${i.qty}× ${i.name}`).join(', '),
          }));
          stateAcc.recommendedOrders = recentCards;
          result = {
            orderCount: orders.length,
            latestOrders: recentCards,
            formattingRule:
              orders.length === 0
                ? 'Respond warmly that there are no previous orders yet and invite them to explore the menu.'
                : 'Do NOT output a Markdown table (| ... |). Start warmly with "Of course! 😊 Let me show you your recent orders." (or Telugu equivalent), briefly mention the count, and end with "Would you like to check the details of any order, track your latest order, or reorder your favourites? ❤️" (or Telugu equivalent). The UI will display clean visual order cards automatically.',
          };
        }
      }
      break;
    }

    case 'get_business_info_and_offers': {
      const [{ settings }, coupons, slots] = await Promise.all([
        getCachedStaticInfo(),
        listCoupons(),
        listSlotsForDate(new Date().toISOString().slice(0, 10)),
      ]);
      result = {
        brand: settings.name,
        city: settings.city,
        hours: settings.hours,
        deliveryCharge: settings.deliveryCharge,
        freeDeliveryAbove: settings.freeDeliveryAbove,
        activeCoupons: coupons.map((c) => ({ code: c.code, title: c.title })),
        todaySlots: slots.filter((s) => s.available).map((s) => ({ id: s.id, name: s.name, window: s.window })),
      };
      break;
    }

    case 'select_payment_method': {
      const method = args.method === 'razorpay' ? 'razorpay' : 'cod';
      const hasCatalog = Object.values(cartItems || {}).some((q) => Number(q) > 0);
      const hasBowls = Array.isArray(customBowls) && customBowls.length > 0;
      if (!hasCatalog && !hasBowls) {
        result = { success: false, error: 'Cart is empty. Customer must add items first.' };
        break;
      }
      const { settings } = await getCachedStaticInfo();
      const quote = await calculateCheckoutQuote({
        items: cartItems,
        customBowls,
        userId: user?.id || null,
      });

      if (method === 'cod') {
        if (settings.codEnabled === false) {
          logAI('HRUVITA-PAYMENT', 'COD requested but currently disabled by admin');
          result = { success: false, codAvailable: false, error: 'Cash on Delivery is currently disabled.' };
          break;
        }
        logAI('HRUVITA-PAYMENT', 'Payment method selected: cod');
        logAI('HRUVITA-NAVIGATION', 'Navigating to /cart with COD selected');
        stateAcc.actions.push({ type: 'SET_PAYMENT_METHOD', method: 'cod' });
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/cart', label: 'Review COD Order' });
        result = {
          success: true,
          method: 'cod',
          codAvailable: true,
          summary: quote.items.map((i) => `${i.qty}x ${i.name} (₹${i.lineTotal})`).join(', '),
          grandTotal: quote.pricing.grandTotal,
          instruction: 'Show order summary and ask for explicit final confirmation before calling place_cod_order.',
        };
      } else {
        logAI('HRUVITA-PAYMENT', 'Payment method selected: online (razorpay)');
        logAI('HRUVITA-PAYMENT', 'Opening secure payment flow — awaiting gateway confirmation');
        logAI('HRUVITA-NAVIGATION', 'Navigating to /cart for online payment');
        stateAcc.actions.push({ type: 'SET_PAYMENT_METHOD', method: 'razorpay' });
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/cart', label: 'Complete Online Payment' });
        result = {
          success: true,
          method: 'razorpay',
          grandTotal: quote.pricing.grandTotal,
          securityNoticeRequired: true,
          instruction:
            'Tell the customer politely that for security reasons we cannot guide them through the online payment process, and ask them to complete payment securely using the payment options displayed on our website. Never claim order is confirmed yet.',
        };
      }
      break;
    }

    case 'place_cod_order': {
      if (!args.confirmed) {
        result = { success: false, error: 'Explicit customer confirmation is required before placing an order.' };
        break;
      }
      if (!user) {
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/login', label: 'Sign In' });
        result = { success: false, error: 'Customer must sign in before placing an order.' };
        break;
      }
      const hasCatalog = Object.values(cartItems || {}).some((q) => Number(q) > 0);
      const hasBowls = Array.isArray(customBowls) && customBowls.length > 0;
      if (!hasCatalog && !hasBowls) {
        result = { success: false, error: 'Cart is empty.' };
        break;
      }
      const addrs = await listAddressesByUser(user.id);
      const chosenAddr = addrs.find((a) => a.id === selectedAddressId) || addrs.find((a) => a.isDefault) || addrs[0];
      if (!chosenAddr) {
        stateAcc.actions.push({ type: 'NAVIGATE', to: '/addresses/new', label: 'Add Address' });
        result = { success: false, error: 'No saved delivery address found. Please add an address first.' };
        break;
      }
      const legacyAddr = formatAddressForLegacy(chosenAddr);
      const todayStr = new Date().toISOString().slice(0, 10);
      const slots = await listSlotsForDate(todayStr);
      const chosenSlot = slots.find((s) => s.id === slotId && s.available) || slots.find((s) => s.available) || slots[0];
      const quote = await calculateCheckoutQuote({ items: cartItems, customBowls, userId: user.id });
      const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
      await deductOrderStockAtomically(quote.items, { reason: 'order_deducted', orderId, actor: user.email });
      const order = await createOrderRecord({
        id: orderId,
        idempotencyKey: `ai-${user.id}-${Date.now()}`,
        userId: user.id,
        customerName: user.fullName || user.name,
        customerEmail: user.email,
        customerPhone: legacyAddr.phone || user.mobileNumber || '9000000000',
        items: quote.items,
        pricing: quote.pricing,
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
        scheduledDate: todayStr,
        slotId: chosenSlot.id,
        slotLabel: `${chosenSlot.name} (${chosenSlot.window})`,
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        status: 'confirmed',
        stockDeducted: true,
        statusHistory: [{ status: 'confirmed', note: 'Placed via HRUVITA AI Agent (COD)', by: user.email, at: new Date().toISOString() }],
      });
      await createPaymentRecord({ id: `PAY-${Date.now().toString(36).toUpperCase()}`, orderId: order.id, userId: user.id, method: 'cod', amount: quote.pricing.grandTotal, currency: 'INR', status: 'created' });
      await recordAudit({ actorId: user.id, actorEmail: user.email, action: 'VOICE_ORDER_CONFIRMED', entity: 'order', entityId: order.id, details: { total: quote.pricing.grandTotal } });
      await sendUserNotification({ userId: user.id, email: user.email, type: 'order', title: `Order Confirmed (${order.id})`, message: `Your COD order of ₹${quote.pricing.grandTotal} is confirmed.` });
      stateAcc.actions.push({ type: 'CLEAR_CART' });
      stateAcc.actions.push({ type: 'NAVIGATE', to: '/dashboard', label: `Track ${order.id}` });
      result = { success: true, orderId: order.id, grandTotal: quote.pricing.grandTotal, slot: chosenSlot.name };
      break;
    }

    case 'initiate_online_checkout': {
      if (!args.confirmed) {
        result = { success: false, error: 'Explicit customer confirmation required.' };
      } else {
        stateAcc.actions.push({ type: 'OPEN_RAZORPAY_CHECKOUT', to: '/cart' });
        result = { success: true, message: 'Navigated to checkout to open Razorpay payment popup.' };
      }
      break;
    }

    default:
      result = { error: `Unknown tool: ${toolName}` };
  }

  const dur = Date.now() - t0;
  stateAcc.toolDurationMs += dur;
  logAI('HRUVITA-TOOLS', `Tool ${toolName} finished in ${dur}ms`);
  return result;
}

// ============================================================
// GROQ / OPENAI-COMPATIBLE TOOL CALLING LOOP
// ============================================================
async function runGroqToolAgent({ messages, ctx, stateAcc, model }) {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) throw Object.assign(new Error('GROQ_API_KEY missing'), { code: 'MISSING_API_KEY' });

  const openAiTools = TOOL_DEFINITIONS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const loopMessages = [...messages];
  for (let step = 0; step < 3; step++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const ai0 = Date.now();
    logAI('HRUVITA-AI', `Sending request to Groq (${model}) step=${step + 1}`);

    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: loopMessages,
          tools: openAiTools,
          tool_choice: 'auto',
          temperature: 0.3,
          max_tokens: 300,
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    stateAcc.aiDurationMs += Date.now() - ai0;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw Object.assign(new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 160)}`), {
        code: `GROQ_HTTP_${res.status}`,
      });
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    logAI('HRUVITA-AI', `AI response received in ${Date.now() - ai0}ms`);

    if (!choice) throw Object.assign(new Error('Empty Groq response'), { code: 'EMPTY_AI_RESPONSE' });

    if (Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0) {
      loopMessages.push(choice);
      for (const tc of choice.tool_calls) {
        const fnName = tc.function?.name;
        let parsedArgs = {};
        try {
          parsedArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsedArgs = {};
        }
        stateAcc.toolsUsed.push(fnName);
        const toolResult = await executeToolCall(fnName, parsedArgs, ctx, stateAcc);
        loopMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    return (choice.content || '').trim();
  }

  return '';
}

// ============================================================
// GEMINI FUNCTION-CALLING FAILOVER AGENT
// ============================================================
async function runGeminiToolAgent({ systemPrompt, history, userMessage, ctx, stateAcc, model }) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) throw Object.assign(new Error('GEMINI_API_KEY missing'), { code: 'MISSING_API_KEY' });

  const contents = [
    ...(history || []).slice(-6).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const tools = [{ functionDeclarations: TOOL_DEFINITIONS }];

  for (let step = 0; step < 3; step++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const ai0 = Date.now();
    logAI('HRUVITA-AI', `Sending request to Gemini (${model}) step=${step + 1}`);

    let res;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools,
            generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
          }),
        }
      );
    } finally {
      clearTimeout(timer);
    }

    stateAcc.aiDurationMs += Date.now() - ai0;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw Object.assign(new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 160)}`), {
        code: `GEMINI_HTTP_${res.status}`,
      });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const fnCallPart = parts.find((p) => p.functionCall);
    logAI('HRUVITA-AI', `Gemini response received in ${Date.now() - ai0}ms`);

    if (fnCallPart) {
      const { name, args } = fnCallPart.functionCall;
      stateAcc.toolsUsed.push(name);
      contents.push({ role: 'model', parts });
      const toolResult = await executeToolCall(name, args || {}, ctx, stateAcc);
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response: toolResult } }],
      });
      continue;
    }

    const textPart = parts.find((p) => p.text);
    return (textPart?.text || '').trim();
  }

  return '';
}

// ============================================================
// MAIN ENTRYPOINT
// ============================================================
export async function processAssistantTurn({
  message,
  language = 'en-IN',
  user = null,
  cartItems = {},
  customBowls = [],
  selectedAddressId = '',
  slotId = 'morning',
  personalizationEnabled = true,
  history = [],
}) {
  const totalStart = Date.now();
  const cleanMsg = String(message || '').trim();
  const lang = detectLanguage(cleanMsg, language);
  const isTelugu = lang === 'te-IN';

  logAI('HRUVITA-AI', `Customer message received: "${cleanMsg}"`);
  logAI('HRUVITA-AI', `Detected language: ${lang}`);

  const { settings, categories } = await getCachedStaticInfo();
  const vegOnly = Boolean(personalizationEnabled && user?.preferences?.vegOnly);

  const cartSummary = Object.entries(cartItems || {})
    .filter(([, q]) => Number(q) > 0)
    .map(([id, q]) => `${id}×${q}`)
    .join(', ') || 'EMPTY';

  const stateAcc = {
    actions: [],
    toolsUsed: [],
    recommendedProducts: [],
    recommendedOrders: [],
    aiDurationMs: 0,
    toolDurationMs: 0,
    dbDurationMs: 0,
    provider: 'none',
    modelUsed: 'none',
    errorCode: '',
    errorMessage: '',
  };

  const systemPrompt = [
    `You are ${settings.aiName || 'HRUVITA AI'}, a warm, friendly, polite female food-ordering representative for ${settings.name || 'HRUVITA'} in ${settings.city || 'Hyderabad'}.`,
    `Language rule: Respond naturally in ${isTelugu ? 'clear, warm spoken Telugu (Telugu script)' : 'friendly, natural Indian English'}. Keep replies concise (1-3 short sentences) so they sound great when spoken aloud by a female voice.`,
    `Categories: ${categories.map((c) => c.slug).join(', ')}`,
    `Current Cart: ${cartSummary}${customBowls?.length ? ` + ${customBowls.length} custom bowl(s)` : ''}`,
    `Customer Auth: ${user ? `Signed in as ${user.fullName || user.name}` : 'Guest (not signed in)'}`,
    `CRITICAL RULES:`,
    `1. You do NOT know product IDs, prices, or stock from memory. Whenever a customer asks for food, call search_products or show_category FIRST. Whenever they ask to open/view a specific product (e.g. "ఈ ఇడ్లీ ఓపెన్ చేయండి", "open idli", "open masala dosa"), call search_products AND then IMMEDIATELY call open_product_details on the best matching single productId (preferring the main dish over combos) so the website navigates to /product/:id right away without asking first.`,
    `2. Always call open_checkout for checkout requests, view_cart for cart requests, build_custom_bowl for ANY custom fruit bowl request or question, get_subscription_plans for subscription questions, get_business_info_and_offers for coupons/slots/delivery charges, and get_my_orders/track_order for order tracking. When proceeding to checkout/payment, ask: "${isTelugu ? 'మీరు ఏ పద్ధతిలో చెల్లించాలనుకుంటున్నారు? క్యాష్ ఆన్ డెలివరీనా లేదా ఆన్లైన్ పేమెంటా?' : 'Which payment method would you prefer: Cash on Delivery or Online Payment?'}"`,
    `3. When customer chooses COD/Cash, call select_payment_method({ method: "cod" }), show the summary, and ask confirmation before calling place_cod_order({ confirmed: true }). When customer chooses Online/UPI/GPay/PhonePe, call select_payment_method({ method: "razorpay" }) and reply politely that for security reasons we cannot guide through online payment and they should complete payment using the secure options on our website.`,
    `4. Never invent products, prices, stock, offers, or slots. Never collect UPI PIN, OTP, CVV, or card PIN. Never claim payment succeeded without backend gateway verification. NEVER output Markdown pipe tables (| ... |) in your reply — the chat UI renders clean order and product cards automatically.`,
    settings.aiInstructions || '',
  ]
    .filter(Boolean)
    .join('\n');

  const ctx = { user, cartItems, customBowls, selectedAddressId, slotId, vegOnly };
  const groqModel = process.env.AI_MODEL?.trim() || 'openai/gpt-oss-20b';
  const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';

  let reply = '';

  // 1. Primary Real LLM (Groq Tool Calling with automatic alternate-model failover on 429)
  if (process.env.GROQ_API_KEY?.trim()) {
    const llmMsgs = [
      { role: 'system', content: systemPrompt },
      ...(history || []).slice(-4).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.text,
      })),
      {
        role: 'user',
        content: `${cleanMsg}\n\n[Language instruction for this reply: Respond ONLY in ${
          isTelugu ? 'natural Telugu script' : 'clear friendly Indian English'
        }.]`,
      },
    ];
    const groqCandidates = [...new Set([groqModel, 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'])];
    for (const candidateModel of groqCandidates) {
      try {
        stateAcc.provider = 'groq';
        stateAcc.modelUsed = candidateModel;
        reply = await runGroqToolAgent({ messages: llmMsgs, ctx, stateAcc, model: candidateModel });
        if (reply) {
          stateAcc.errorCode = '';
          stateAcc.errorMessage = '';
          break;
        }
      } catch (err) {
        stateAcc.errorCode = err.code || 'GROQ_FAILED';
        stateAcc.errorMessage = err.message;
        logAIError(`Groq (${candidateModel}) failed`, err);
        if (!String(err.code).includes('429') && !String(err.code).includes('404')) break;
      }
    }
  }

  // 2. Failover Real LLM (Gemini Function Calling)
  if (!reply && process.env.GEMINI_API_KEY?.trim()) {
    try {
      stateAcc.provider = 'gemini';
      stateAcc.modelUsed = geminiModel;
      reply = await runGeminiToolAgent({
        systemPrompt,
        history,
        userMessage: cleanMsg,
        ctx,
        stateAcc,
        model: geminiModel,
      });
      stateAcc.errorCode = '';
      stateAcc.errorMessage = '';
    } catch (err) {
      stateAcc.errorCode = err.code || 'GEMINI_FAILED';
      stateAcc.errorMessage = err.message;
      logAIError('Gemini AI failover failed', err);
    }
  }

  // 3. Honest error / fallback message only when both LLM APIs are missing or unreachable
  if (!reply) {
    if (!process.env.GROQ_API_KEY?.trim() && !process.env.GEMINI_API_KEY?.trim()) {
      stateAcc.errorCode = 'MISSING_API_KEY';
      stateAcc.errorMessage = 'Neither GROQ_API_KEY nor GEMINI_API_KEY is configured in backend/.env.';
      logAIError('Missing AI API key', stateAcc.errorMessage);
    } else if (!stateAcc.errorCode) {
      stateAcc.errorCode = 'AI_UNAVAILABLE';
      stateAcc.errorMessage = 'AI service did not return a valid reply.';
    }
    reply = isTelugu
      ? 'క్షమించండి, ప్రస్తుతం AI సేవ తాత్కాలికంగా అందుబాటులో లేదు. దయచేసి కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.'
      : 'Sorry, our AI assistant is temporarily busy right now. Please try again in a moment.';
  }

  const totalDurationMs = Date.now() - totalStart;
  logAI('HRUVITA-PERFORMANCE', `Total response time: ${totalDurationMs} ms (AI: ${stateAcc.aiDurationMs}ms, Tools: ${stateAcc.toolDurationMs}ms, DB: ${stateAcc.dbDurationMs}ms)`);

  return {
    reply,
    language: lang,
    toolsUsed: stateAcc.toolsUsed,
    actions: stateAcc.actions,
    recommendedProducts: stateAcc.recommendedProducts,
    recommendedOrders: stateAcc.recommendedOrders,
    sessionState: { pendingIntent: null, customBowlDraft: null },
    debug: {
      provider: stateAcc.provider,
      model: stateAcc.modelUsed,
      detectedLanguage: lang,
      aiDurationMs: stateAcc.aiDurationMs,
      toolDurationMs: stateAcc.toolDurationMs,
      dbDurationMs: stateAcc.dbDurationMs,
      totalDurationMs,
      toolsCalled: stateAcc.toolsUsed,
      errorCode: stateAcc.errorCode || null,
      errorMessage: stateAcc.errorMessage || null,
    },
  };
}
