import cron from 'node-cron';
import {
  listAllSubscriptions,
  listProducts,
  listAllOrders,
  findUserById,
  createOrderRecord,
  transitionOrderStatus,
  recordAutomationLog,
  decrementSubscriptionDelivery,
} from '../store/repository.js';
import { sendUserNotification } from '../utils/emailService.js';

export async function runDailySubscriptionGenerator() {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const subs = await listAllSubscriptions();
  const activeSubs = subs.filter(
    (s) => s.status === 'active' && s.remainingDeliveries > 0 && s.startDate <= tomorrow
  );

  let createdCount = 0;
  let remindersSent = 0;

  for (const sub of activeSubs) {
    const user = await findUserById(sub.userId);
    if (!user) continue;

    const idempotencyKey = `sub-del-${sub.id}-${tomorrow}`;
    await createOrderRecord({
      id: `ORD-SUB-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      idempotencyKey,
      userId: user.id,
      customerName: user.fullName || user.name || 'Subscriber',
      customerEmail: user.email,
      customerPhone: user.mobileNumber || user.phone || '0000000000',
      items: [
        {
          productId: `sub-${sub.planId}`,
          name: `${sub.preferredBreakfast} (${sub.planName})`,
          emoji: '🥣',
          unitPrice: Math.round(sub.price / sub.days),
          mrp: Math.round(sub.price / sub.days),
          qty: 1,
          lineTotal: Math.round(sub.price / sub.days),
          isCustomBowl: true,
        },
      ],
      pricing: {
        subtotal: Math.round(sub.price / sub.days),
        couponCode: '',
        couponDiscount: 0,
        rewardPointsUsed: 0,
        deliveryCharge: 0,
        taxAmount: 0,
        grandTotal: 0,
      },
      address: {
        label: 'Subscription Delivery',
        recipient: user.fullName || user.name || 'Subscriber',
        phone: user.mobileNumber || user.phone || '0000000000',
        line1: 'Default saved delivery address',
        area: '',
        city: 'Hyderabad',
        pincode: '500081',
        notes: `Subscription ${sub.id}`,
      },
      scheduledDate: tomorrow,
      slotId: sub.slotId || 'morning',
      slotLabel: sub.slotLabel || 'Morning Slot (6:30 AM – 9:00 AM)',
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      status: 'confirmed',
      stockDeducted: true,
      statusHistory: [
        {
          status: 'confirmed',
          note: `Auto-generated from active subscription ${sub.id}`,
          by: 'cron-scheduler',
          at: new Date().toISOString(),
        },
      ],
    });

    const updatedSub = await decrementSubscriptionDelivery(sub.id);
    createdCount += 1;

    if (updatedSub && updatedSub.remainingDeliveries <= 2 && updatedSub.remainingDeliveries > 0) {
      await sendUserNotification({
        userId: user.id,
        email: user.email,
        type: 'order',
        title: `Renewal Reminder: ${updatedSub.remainingDeliveries} deliveries left`,
        message: `Your ${updatedSub.planName} has ${updatedSub.remainingDeliveries} morning deliveries remaining. Renew anytime from Subscriptions!`,
      });
      remindersSent += 1;
    }
  }

  return recordAutomationLog({
    jobName: 'daily_subscription_orders',
    status: 'success',
    summary: `Generated ${createdCount} delivery orders for ${tomorrow} (${remindersSent} renewal reminders sent).`,
    details: { date: tomorrow, createdCount, remindersSent },
  });
}

export async function runLowStockCheck() {
  const products = await listProducts({ includeInactive: true });
  const lowItems = products.filter((p) => p.stock <= 5);

  if (lowItems.length > 0) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@hruvita.com';
    const summaryList = lowItems.map((p) => `${p.name} (Stock: ${p.stock})`).join(', ');
    await sendUserNotification({
      userId: 'u-admin',
      email: adminEmail,
      type: 'order',
      title: `Low Stock Alert (${lowItems.length} items)`,
      message: `The following menu items need restocking: ${summaryList}`,
    });
  }

  return recordAutomationLog({
    jobName: 'daily_low_stock_alert',
    status: 'success',
    summary: `Checked ${products.length} items — found ${lowItems.length} low/out-of-stock item(s).`,
    details: { lowStockIds: lowItems.map((p) => p.id) },
  });
}

export async function runAbandonedPaymentCleanup() {
  const orders = await listAllOrders('payment_pending');
  const cutoffMs = Date.now() - 20 * 60 * 1000;
  let cancelledCount = 0;

  for (const ord of orders) {
    const createdMs = new Date(ord.createdAt).getTime();
    if (Number.isFinite(createdMs) && createdMs < cutoffMs) {
      await transitionOrderStatus({
        orderId: ord.id,
        status: 'cancelled',
        note: 'Auto-cancelled after 20 minutes without payment confirmation',
        by: 'cron-scheduler',
      });
      cancelledCount += 1;
    }
  }

  return recordAutomationLog({
    jobName: 'abandoned_payment_cleanup',
    status: 'success',
    summary: `Scanned ${orders.length} payment_pending order(s); auto-cancelled ${cancelledCount}.`,
    details: { scanned: orders.length, cancelledCount },
  });
}

export function startAutomationJobs() {
  if (process.env.DISABLE_CRON === 'true') return;

  // 10:00 PM daily: create next day's breakfast subscription deliveries
  cron.schedule('0 22 * * *', () => {
    runDailySubscriptionGenerator().catch((err) =>
      console.error('[Cron] Subscription generator error:', err.message)
    );
  });

  // 8:00 AM daily: check low-stock inventory and notify admin
  cron.schedule('0 8 * * *', () => {
    runLowStockCheck().catch((err) => console.error('[Cron] Low stock alert error:', err.message));
  });

  // Every 15 mins: clean up abandoned unpaid checkout orders
  cron.schedule('*/15 * * * *', () => {
    runAbandonedPaymentCleanup().catch((err) =>
      console.error('[Cron] Abandoned cleanup error:', err.message)
    );
  });

  console.log('[Cron] HRUVITA automation jobs scheduled (subscriptions, low-stock, payment cleanup).');
}
