import crypto from 'crypto';
import {
  emitToUser,
  emitToAdmins,
  emitToAnalysts,
  emitToDeliveryPartner,
  emitPublicCatalog,
} from '../utils/socketServer.js';

function envelope(data = {}) {
  return {
    eventId: crypto.randomUUID(),
    ts: Date.now(),
    ...data,
  };
}

export function emitOrderCreated(order) {
  if (!order) return;
  const payload = envelope({ orderId: order.id, status: order.status, order });
  emitToUser(order.userId, 'order:created', payload);
  emitToAdmins('order:created', payload);
  emitAnalyticsUpdated('analytics:sales-updated');
}

export function emitOrderUpdated(order, eventName = 'order:updated') {
  if (!order) return;
  const payload = envelope({
    orderId: order.id,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    paymentStatus: order.paymentStatus,
    order,
  });
  emitToUser(order.userId, eventName, payload);
  if (eventName !== 'order:updated') {
    emitToUser(order.userId, 'order:updated', payload);
  }
  emitToAdmins('order:updated', payload);
  const partnerId = order.deliveryAssignment?.deliveryBoyId || order.delivery?.partnerId;
  if (partnerId) {
    emitToDeliveryPartner(partnerId, 'order:updated', payload);
  }
  emitAnalyticsUpdated('analytics:updated');
}

export function emitOrderCancelled(order) {
  if (!order) return;
  const payload = envelope({ orderId: order.id, status: order.status, order });
  emitToUser(order.userId, 'order:cancelled', payload);
  emitToAdmins('order:cancelled', payload);
  const partnerId = order.deliveryAssignment?.deliveryBoyId || order.delivery?.partnerId;
  if (partnerId) {
    emitToDeliveryPartner(partnerId, 'order:cancelled', payload);
  }
  emitAnalyticsUpdated('analytics:sales-updated');
}

export function emitProductUpdated(product, eventName = 'product:updated') {
  if (!product) return;
  const payload = envelope({ productId: product.id, product });
  emitPublicCatalog(eventName, payload);
  if (eventName !== 'product:updated') {
    emitPublicCatalog('product:updated', payload);
  }
  emitToAdmins(eventName, payload);
  emitAnalyticsUpdated('analytics:inventory-updated');
}

export function emitInventoryUpdated(item, eventName = 'inventory:updated') {
  if (!item) return;
  const payload = envelope({ productId: item.id || item.itemId, stock: item.stock, item });
  emitPublicCatalog('inventory:updated', payload);
  emitToAdmins(eventName, payload);
  emitToAnalysts(eventName, payload);
  emitAnalyticsUpdated('analytics:inventory-updated');
}

export function emitPaymentUpdated(orderOrPayment, eventName = 'payment:successful') {
  if (!orderOrPayment) return;
  const payload = envelope({
    orderId: orderOrPayment.orderId || orderOrPayment.id,
    paymentStatus: orderOrPayment.paymentStatus || orderOrPayment.status,
    amount: orderOrPayment.pricing?.grandTotal ?? orderOrPayment.amount ?? 0,
  });
  if (orderOrPayment.userId) {
    emitToUser(orderOrPayment.userId, eventName, payload);
  }
  emitToAdmins(eventName, payload);
  emitAnalyticsUpdated('analytics:sales-updated');
}

export function emitDeliveryAssigned(order, partnerId, isReassign = false, previousPartnerId = '') {
  if (!order) return;
  const payload = envelope({
    orderId: order.id,
    partnerId,
    partnerName: order.deliveryAssignment?.deliveryBoyName || order.delivery?.partnerName || '',
    partnerPhone: order.deliveryAssignment?.deliveryBoyPhone || order.delivery?.partnerPhone || '',
    customerName: order.customerName,
    grandTotal: order.pricing?.grandTotal || 0,
  });
  emitToDeliveryPartner(partnerId, isReassign ? 'delivery:reassigned' : 'delivery:assigned', payload);
  if (isReassign && previousPartnerId && previousPartnerId !== partnerId) {
    emitToDeliveryPartner(previousPartnerId, 'delivery:assignment-cancelled', payload);
  }
  emitToUser(order.userId, 'delivery:assigned', payload);
  emitToAdmins('delivery:assigned', payload);
  emitAnalyticsUpdated('analytics:delivery-updated');
}

export function emitDeliveryUpdated(order, eventName = 'delivery:updated') {
  if (!order) return;
  const payload = envelope({
    orderId: order.id,
    deliveryStatus: order.deliveryStatus,
    status: order.status,
    partnerName: order.deliveryAssignment?.deliveryBoyName || order.delivery?.partnerName || '',
    partnerPhone: order.deliveryAssignment?.deliveryBoyPhone || order.delivery?.partnerPhone || '',
    reason: order.delivery?.failureReason || order.deliveryAssignment?.failureReason || '',
  });
  emitToUser(order.userId, eventName, payload);
  emitToAdmins(eventName, payload);
  const partnerId = order.deliveryAssignment?.deliveryBoyId || order.delivery?.partnerId;
  if (partnerId) {
    emitToDeliveryPartner(partnerId, 'delivery:order-updated', payload);
  }
  emitAnalyticsUpdated('analytics:delivery-updated');
}

export function emitSubscriptionUpdated(subscription, eventName = 'subscription:updated') {
  if (!subscription) return;
  const payload = envelope({ subscriptionId: subscription.id, status: subscription.status, subscription });
  emitToUser(subscription.userId, eventName, payload);
  emitToAdmins(eventName, payload);
  emitAnalyticsUpdated('analytics:updated');
}

export function emitCustomerUpdated(customer, eventName = 'customer:registered') {
  if (!customer) return;
  const payload = envelope({ customerId: customer.id, fullName: customer.fullName || customer.name });
  emitToAdmins(eventName, payload);
  emitAnalyticsUpdated('analytics:updated');
}

export function emitNotificationCreated(notif, target = 'admin') {
  if (!notif) return;
  const payload = envelope({ notification: notif });
  if (target === 'admin') {
    emitToAdmins('notification:new', payload);
    emitToAnalysts('notification:new', payload);
  } else if (target) {
    emitToUser(target, 'notification:new', payload);
  }
}

export function emitAnalyticsUpdated(eventName = 'analytics:updated') {
  const payload = envelope({ scope: eventName });
  emitToAnalysts(eventName, payload);
  if (eventName !== 'analytics:updated') {
    emitToAnalysts('analytics:updated', payload);
  }
  emitToAdmins('analytics:updated', payload);
}
