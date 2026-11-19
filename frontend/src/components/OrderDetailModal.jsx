import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiCheck,
  FiDownload,
  FiFileText,
  FiHeadphones,
  FiMapPin,
  FiMessageCircle,
  FiPackage,
  FiPhone,
  FiRefreshCw,
  FiShield,
  FiStar,
  FiTruck,
  FiX,
} from 'react-icons/fi';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './OrderDetailModal.css';

const LIFECYCLE_STAGES = [
  { key: 'placed', match: ['pending', 'payment_pending', 'placed'], label: 'Order Placed' },
  { key: 'confirmed', match: ['confirmed', 'accepted'], label: 'Order Confirmed' },
  { key: 'preparing', match: ['preparing'], label: 'Preparing' },
  { key: 'packed', match: ['packed'], label: 'Ready for Dispatch' },
  { key: 'out_for_delivery', match: ['out_for_delivery'], label: 'Out for Delivery' },
  { key: 'delivered', match: ['delivered'], label: 'Delivered' },
];

function maskPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return phone || 'Not provided';
  return `${'•'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return String(iso);
  return dt.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function OrderDetailModal({
  order,
  onClose,
  onReorder,
  onCancel,
  onReviewSubmitted,
}) {
  const [showInvoiceView, setShowInvoiceView] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMsg, setReviewMsg] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState('');
  const [payMsg, setPayMsg] = useState('');

  if (!order) return null;

  const isSameDay = order.slotId === 'same-day';
  const isCancelled = ['cancelled', 'refund_initiated', 'refunded'].includes(order.status);
  const isConvertedToOnline =
    order.originalPaymentMethod === 'COD' &&
    (order.currentPaymentMethod === 'Online' || order.paymentMethod === 'razorpay') &&
    order.paymentStatus === 'paid';
  const canConvertToOnline =
    order.paymentMethod === 'cod' &&
    order.paymentStatus !== 'paid' &&
    !['delivered', 'cancelled', 'refund_initiated', 'refunded'].includes(order.status) &&
    order.deliveryStatus !== 'delivered' &&
    order.delivery?.cashCollectionStatus !== 'collected';

  const handlePayOnline = async () => {
    setPayBusy(true);
    setPayErr('');
    setPayMsg('');
    try {
      const res = await apiRequest(`/api/orders/${order.id}/pay-online`, {
        method: 'POST',
      });
      if (res.razorpay?.isRealGateway && window.Razorpay) {
        const rzp = new window.Razorpay({
          key: res.razorpay.keyId,
          amount: res.razorpay.amountPaise,
          currency: res.razorpay.currency || 'INR',
          name: 'HRUVITA',
          description: `Pay Online for Order ${order.id}`,
          order_id: res.razorpay.orderId,
          prefill: {
            name: order.customerName || '',
            email: order.customerEmail || '',
            contact: order.customerPhone || '',
          },
          theme: { color: '#1b4d38' },
          handler: async (rzpResponse) => {
            try {
              await apiRequest(`/api/orders/${order.id}/verify-payment`, {
                method: 'POST',
                body: JSON.stringify({
                  razorpay_order_id: rzpResponse.razorpay_order_id,
                  razorpay_payment_id: rzpResponse.razorpay_payment_id,
                  razorpay_signature: rzpResponse.razorpay_signature,
                }),
              });
              setPayMsg('Payment successful! Order converted to Prepaid.');
              if (onReviewSubmitted) await onReviewSubmitted();
            } catch (verErr) {
              setPayErr(verErr.message || 'Payment verification failed. Order remains COD – Payment Pending.');
            } finally {
              setPayBusy(false);
            }
          },
          modal: {
            ondismiss: () => {
              setPayBusy(false);
              setPayErr('Payment cancelled. Your order remains COD – Payment Pending.');
            },
          },
        });
        rzp.on('payment.failed', () => {
          setPayBusy(false);
          setPayErr('Payment failed. Your order remains COD – Payment Pending.');
        });
        rzp.open();
        return;
      }

      if (res.razorpay?.testPayload) {
        await apiRequest(`/api/orders/${order.id}/verify-payment`, {
          method: 'POST',
          body: JSON.stringify(res.razorpay.testPayload),
        });
        setPayMsg('Payment successful! Order converted to Prepaid.');
        if (onReviewSubmitted) await onReviewSubmitted();
      }
      setPayBusy(false);
    } catch (err) {
      setPayErr(err.message || 'Could not initiate online payment.');
      setPayBusy(false);
    }
  };
  const paySum = order.paymentSummary || null;
  const rzpPaymentId = paySum?.razorpayPaymentId || order.razorpayPaymentId || '';
  const rzpOrderId = paySum?.razorpayOrderId || order.razorpayOrderId || '';
  const refundId = paySum?.refundId || '';
  const refundStatus = paySum?.refundStatus || '';

  const historyList = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const currentStageIdx = LIFECYCLE_STAGES.findIndex((s) => s.match.includes(order.status));

  const stageTimestamp = (stage) => {
    const entry = [...historyList].reverse().find((h) => stage.match.includes(h.status));
    return entry?.at ? formatDateTime(entry.at) : null;
  };

  const handlePrintReceipt = () => {
    const win = window.open('', '_blank', 'width=820,height=900');
    if (!win) return;
    const rowsHtml = (order.items || [])
      .map(
        (it) => `
        <tr>
          <td>${escapeHtml(it.name)}${it.sizeLabel ? ` (${escapeHtml(it.sizeLabel)})` : ''}</td>
          <td style="text-align:center;">${Number(it.qty || 1)}</td>
          <td style="text-align:right;">₹${Number(it.unitPrice || 0)}</td>
          <td style="text-align:right;">₹${Number(it.lineTotal || 0)}</td>
        </tr>`
      )
      .join('');

    const paymentLines =
      order.paymentMethod === 'cod'
        ? `<p><strong>Payment Method:</strong> Cash on Delivery</p>
           <p><strong>Collection Status:</strong> ${order.paymentStatus === 'paid' ? 'Collected' : 'Payable on Delivery'}</p>
           <p><strong>Payment Status:</strong> ${escapeHtml(order.paymentStatus)}</p>`
        : `<p><strong>Payment Gateway:</strong> Razorpay (Online)</p>
           ${rzpPaymentId ? `<p><strong>Gateway Payment ID:</strong> ${escapeHtml(rzpPaymentId)}</p>` : ''}
           ${rzpOrderId ? `<p><strong>Gateway Order ID:</strong> ${escapeHtml(rzpOrderId)}</p>` : ''}
           ${paySum?.id ? `<p><strong>Payment Reference:</strong> ${escapeHtml(paySum.id)}</p>` : ''}
           <p><strong>Payment Status:</strong> ${escapeHtml(order.paymentStatus)}</p>
           ${refundId ? `<p><strong>Refund ID:</strong> ${escapeHtml(refundId)} (${escapeHtml(refundStatus || 'processed')})</p>` : ''}`;

    win.document.write(`<!doctype html>
<html>
<head>
  <title>HRUVITA Receipt - ${escapeHtml(order.id)}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 28px; color: #1f2421; max-width: 720px; margin: auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1b4d38; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { font-size: 24px; font-weight: 800; color: #1b4d38; letter-spacing: 0.04em; }
    .sub { font-size: 12px; color: #5f6761; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; font-size: 13px; }
    .box { background: #fbf8f1; border: 1px solid #e7e2d6; border-radius: 10px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
    th, td { padding: 9px 8px; border-bottom: 1px solid #e7e2d6; text-align: left; }
    th { background: #f3f8f3; color: #1b4d38; }
    .totals { width: 280px; margin-left: auto; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .grand { border-top: 2px solid #1b4d38; margin-top: 6px; padding-top: 8px; font-weight: 800; font-size: 15px; color: #1b4d38; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="head">
    <div>
      <div class="brand">HRUVITA</div>
      <div class="sub">Fresh Food. Healthy Living. Smart Ordering.</div>
    </div>
    <div style="text-align:right; font-size:13px;">
      <strong>ORDER RECEIPT</strong><br/>
      Order ID: ${escapeHtml(order.id)}<br/>
      Placed: ${escapeHtml(formatDateTime(order.createdAt))}
    </div>
  </div>
  <div class="grid">
    <div class="box">
      <strong>Customer &amp; Delivery</strong>
      <p>${escapeHtml(order.address?.recipient || order.customerName)}</p>
      <p>${escapeHtml(order.address?.line1 || '')}${order.address?.area ? `, ${escapeHtml(order.address.area)}` : ''}</p>
      <p>${escapeHtml(order.address?.city || 'Hyderabad')} - ${escapeHtml(order.address?.pincode || '')}</p>
      <p>Schedule: ${escapeHtml(order.scheduledDate)} (${isSameDay ? 'Same-Day Express' : escapeHtml(order.slotLabel)})</p>
    </div>
    <div class="box">
      <strong>Payment Details</strong>
      ${paymentLines}
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Subtotal</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div><span>Item Subtotal</span><span>₹${Number(order.pricing?.subtotal || 0)}</span></div>
    <div><span>Delivery Charges</span><span>₹${Number(order.pricing?.deliveryCharge || 0)}</span></div>
    ${Number(order.pricing?.couponDiscount || 0) > 0 ? `<div><span>Coupon Discount</span><span>-₹${Number(order.pricing.couponDiscount)}</span></div>` : ''}
    ${Number(order.pricing?.rewardPointsUsed || 0) > 0 ? `<div><span>Reward Points</span><span>-₹${Number(order.pricing.rewardPointsUsed)}</span></div>` : ''}
    <div><span>Taxes</span><span>₹${Number(order.pricing?.taxAmount || 0)}</span></div>
    <div class="grand"><span>Final Total</span><span>₹${Number(order.pricing?.grandTotal || 0)}</span></div>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (comment.trim().length < 5) {
      setReviewMsg('Please write at least 5 characters.');
      return;
    }
    const firstItem = order.items?.[0];
    if (!firstItem?.productId) return;
    setReviewBusy(true);
    setReviewMsg('');
    try {
      await apiRequest('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          productId: String(firstItem.productId).replace(/^combo:/, ''),
          rating: Number(rating),
          comment: comment.trim(),
        }),
      });
      setReviewMsg('Thank you! Your review has been published.');
      setComment('');
      setReviewOpen(false);
      if (onReviewSubmitted) onReviewSubmitted();
    } catch (err) {
      setReviewMsg(err.message || 'Could not submit review.');
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div className="odm-backdrop" role="dialog" aria-modal="true" aria-label={`Order ${order.id} details`}>
      <div className="odm-modal">
        <div className="odm-header">
          <div>
            <span className="odm-eyebrow">
              {isSameDay ? 'Same-Day Express' : 'Advance Booking'}
            </span>
            <h2>Order {order.id}</h2>
            <p className="odm-placed-at">Placed on {formatDateTime(order.createdAt)}</p>
          </div>
          <div className="odm-header-right">
            <span className={`account-status-badge account-status-${order.status}`}>
              {order.status.replace(/_/g, ' ')}
            </span>
            <button type="button" className="odm-close" onClick={onClose} aria-label="Close order details">
              <FiX size={20} />
            </button>
          </div>
        </div>

        <div className="odm-toolbar">
          <button type="button" className="odm-tool-btn odm-tool-primary" onClick={handlePrintReceipt}>
            <FiDownload size={14} /> Download Receipt (PDF)
          </button>
          <button
            type="button"
            className="odm-tool-btn"
            onClick={() => setShowInvoiceView((v) => !v)}
          >
            <FiFileText size={14} /> {showInvoiceView ? 'Full Details View' : 'View Invoice'}
          </button>
          <button type="button" className="odm-tool-btn" onClick={() => onReorder(order)}>
            <FiRefreshCw size={14} /> Reorder
          </button>
          {order.status === 'delivered' && (
            <button type="button" className="odm-tool-btn" onClick={() => setReviewOpen((v) => !v)}>
              <FiStar size={14} /> Rate Order
            </button>
          )}
          <Link to={`/contact?order=${encodeURIComponent(order.id)}`} className="odm-tool-btn">
            <FiHeadphones size={14} /> Support
          </Link>
          {['pending', 'payment_pending', 'confirmed', 'placed'].includes(order.status) && (
            <button
              type="button"
              className="odm-tool-btn odm-tool-danger"
              onClick={() => onCancel(order.id)}
            >
              Cancel Order
            </button>
          )}
        </div>

        <div className="odm-body">
          {reviewMsg && <div className="odm-notice">{reviewMsg}</div>}

          {reviewOpen && (
            <form className="odm-card odm-review-form" onSubmit={handleSubmitReview}>
              <h3>Rate &amp; Review Your Order</h3>
              <div className="odm-stars-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`odm-star-btn ${n <= rating ? 'odm-star-active' : ''}`}
                    onClick={() => setRating(n)}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                placeholder="Share your feedback on taste, freshness, or delivery..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="odm-tool-btn odm-tool-primary" disabled={reviewBusy}>
                  {reviewBusy ? 'Submitting...' : 'Submit Review'}
                </button>
                <button type="button" className="odm-tool-btn" onClick={() => setReviewOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* A. Order Information + F. Tracking Timeline */}
          {!showInvoiceView && (
            <section className="odm-card">
              <h3><FiPackage size={16} /> Order Tracking &amp; Schedule</h3>
              <div className="odm-info-grid">
                <div><span>Order ID</span><strong>{order.id}</strong></div>
                <div><span>Order Type</span><strong>{isSameDay ? 'Same-Day Express' : 'Advance Booking'}</strong></div>
                <div><span>Delivery Date</span><strong>{order.scheduledDate || '—'}</strong></div>
                {!isSameDay && <div><span>Delivery Slot</span><strong>{order.slotLabel || '—'}</strong></div>}
              </div>

              {isCancelled ? (
                <div className="odm-cancelled-timeline">
                  <strong>Order {order.status.replace(/_/g, ' ')}</strong>
                  {historyList.slice(-1)[0]?.at && (
                    <span>Updated on {formatDateTime(historyList.slice(-1)[0].at)}</span>
                  )}
                  {historyList.slice(-1)[0]?.note && <p>{historyList.slice(-1)[0].note}</p>}
                </div>
              ) : (
                <div className="odm-timeline">
                  {LIFECYCLE_STAGES.map((stage, idx) => {
                    const completed = currentStageIdx >= idx;
                    const ts = completed ? stageTimestamp(stage) : null;
                    return (
                      <div key={stage.key} className={`odm-tl-step ${completed ? 'odm-tl-done' : ''}`}>
                        <span className="odm-tl-dot">
                          {completed ? <FiCheck size={12} /> : idx + 1}
                        </span>
                        <div className="odm-tl-copy">
                          <strong>{stage.label}</strong>
                          <small>{ts || (completed ? 'Completed' : 'Pending')}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* B. Ordered Products */}
          <section className="odm-card">
            <h3>Ordered Products ({order.items?.length || 0})</h3>
            <div className="odm-items-list">
              {(order.items || []).map((it, i) => (
                <div key={`${it.productId || i}-${i}`} className="odm-item-row">
                  {it.image ? (
                    <img src={it.image} alt={it.name} className="odm-item-img" />
                  ) : (
                    <div className="odm-item-fallback" aria-hidden="true">
                      <span>{it.emoji || '🥗'}</span>
                    </div>
                  )}
                  <div className="odm-item-info">
                    <strong>{it.name}</strong>
                    {it.description && <p className="odm-item-desc">{it.description}</p>}
                    <div className="odm-item-tags">
                      <span>Qty: {it.qty}</span>
                      <span>Unit: {money(it.unitPrice)}</span>
                      {it.sizeLabel && <span>Size: {it.sizeLabel}</span>}
                      {it.isCustomBowl && <span>Custom Fruit Bowl</span>}
                      {it.isCombo && <span>Combo</span>}
                    </div>
                  </div>
                  <strong className="odm-item-sub">{money(it.lineTotal)}</strong>
                </div>
              ))}
            </div>
          </section>

          <div className="odm-two-col">
            {/* C. Complete Price Breakdown */}
            <section className="odm-card">
              <h3>Price Breakdown</h3>
              <div className="odm-kv-list">
                <div><span>Item Subtotal</span><span>{money(order.pricing?.subtotal || 0)}</span></div>
                <div><span>Delivery Charges</span><span>{money(order.pricing?.deliveryCharge || 0)}</span></div>
                {Number(order.pricing?.couponDiscount || 0) > 0 && (
                  <div className="odm-discount">
                    <span>Coupon ({order.pricing.couponCode})</span>
                    <span>-{money(order.pricing.couponDiscount)}</span>
                  </div>
                )}
                {Number(order.pricing?.rewardPointsUsed || 0) > 0 && (
                  <div className="odm-discount">
                    <span>Reward Points Used</span>
                    <span>-{money(order.pricing.rewardPointsUsed)}</span>
                  </div>
                )}
                <div><span>Taxes</span><span>{money(order.pricing?.taxAmount || 0)}</span></div>
                <div className="odm-grand">
                  <span>Final Total</span>
                  <span>{money(order.pricing?.grandTotal || 0)}</span>
                </div>
              </div>
            </section>

            {/* D. Payment Details */}
            <section className="odm-card">
              <h3><FiShield size={16} /> Payment Details</h3>
              {order.paymentMethod === 'cod' && order.paymentStatus !== 'paid' ? (
                <div className="odm-kv-list">
                  <div><span>Payment Method</span><strong>COD – Payment Pending</strong></div>
                  <div><span>Amount Payable</span><strong>{money(order.pricing?.grandTotal || 0)}</strong></div>
                  <div><span>Collection Status</span><strong>Payable on Delivery</strong></div>
                  <div><span>Payment Status</span><strong>{order.paymentStatus}</strong></div>
                </div>
              ) : (
                <div className="odm-kv-list">
                  <div>
                    <span>Payment Method</span>
                    <strong>
                      {isConvertedToOnline ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          COD &rarr; Online Payment (Prepaid)
                          <span
                            style={{
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #86efac',
                              borderRadius: 999,
                              padding: '2px 8px',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                            }}
                          >
                            PAID
                          </span>
                        </span>
                      ) : order.paymentMethod === 'cod' ? (
                        'Cash on Delivery (Paid)'
                      ) : (
                        'Online Payment (Razorpay)'
                      )}
                    </strong>
                  </div>
                  {rzpPaymentId && <div><span>Gateway Payment ID</span><strong>{rzpPaymentId}</strong></div>}
                  {rzpOrderId && <div><span>Gateway Order ID</span><strong>{rzpOrderId}</strong></div>}
                  {paySum?.id && <div><span>Transaction / Ref ID</span><strong>{paySum.id}</strong></div>}
                  {paySum?.createdAt && (
                    <div><span>Payment Date</span><strong>{formatDateTime(paySum.createdAt)}</strong></div>
                  )}
                  <div>
                    <span>{order.paymentStatus === 'paid' ? 'Amount Paid' : 'Order Amount'}</span>
                    <strong>{money(paySum?.amount ?? order.pricing?.grandTotal ?? 0)}</strong>
                  </div>
                  <div><span>Payment Status</span><strong style={{ textTransform: 'uppercase' }}>{order.paymentStatus}</strong></div>
                  {refundId && <div><span>Refund ID</span><strong>{refundId}</strong></div>}
                  {refundStatus && <div><span>Refund Status</span><strong>{refundStatus}</strong></div>}
                </div>
              )}

              {payErr && (
                <p style={{ marginTop: 8, fontSize: '0.82rem', color: '#dc2626', fontWeight: 600 }}>
                  {payErr}
                </p>
              )}
              {payMsg && (
                <p style={{ marginTop: 8, fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>
                  {payMsg}
                </p>
              )}

              {canConvertToOnline && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="odm-tool-btn odm-tool-primary"
                    disabled={payBusy}
                    onClick={handlePayOnline}
                    style={{ width: '100%', justifyContent: 'center', padding: '10px 14px', fontSize: '0.9rem' }}
                  >
                    <FiShield size={15} /> {payBusy ? 'Opening Razorpay...' : `Pay Online (${money(order.pricing?.grandTotal || 0)})`}
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* E. Delivery Details */}
          <section className="odm-card">
            <h3><FiMapPin size={16} /> Delivery Details</h3>
            <div className="odm-info-grid">
              <div><span>Recipient</span><strong>{order.address?.recipient || order.customerName}</strong></div>
              <div><span>Contact</span><strong>{maskPhone(order.address?.phone || order.customerPhone)}</strong></div>
              <div>
                <span>Delivery Address</span>
                <strong>
                  {[order.address?.line1, order.address?.area, order.address?.city, order.address?.pincode]
                    .filter(Boolean)
                    .join(', ')}
                </strong>
              </div>
              <div><span>Delivery Status</span><strong>{(order.deliveryStatus && order.deliveryStatus !== 'unassigned' ? order.deliveryStatus : order.status).replace(/_/g, ' ')}</strong></div>
            </div>

            {order.customerDeliveryOtp && (
              <div
                style={{
                  marginTop: 10,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ display: 'block', color: '#92400e', fontSize: '0.88rem' }}>
                    Delivery Verification OTP
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#78350f' }}>
                    Share this 6-digit OTP with your delivery partner only when receiving your order.
                  </span>
                </div>
                <div
                  data-testid="customer-delivery-otp"
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    letterSpacing: '0.2em',
                    color: '#92400e',
                    background: '#ffffff',
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px dashed #f59e0b',
                  }}
                >
                  {order.customerDeliveryOtp}
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 8,
                padding: '12px 14px',
                borderRadius: 12,
                background: 'var(--green-50)',
                border: '1px solid #d5e6d7',
                display: 'grid',
                gap: 6,
              }}
            >
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green-900)', fontSize: '0.9rem' }}>
                <FiTruck size={15} /> Delivery Partner
              </strong>
              {order.deliveryAssignment?.deliveryBoyId ? (
                <>
                  <p style={{ fontSize: '0.84rem', color: 'var(--primary)', fontWeight: 600 }}>
                    Your delivery partner has been assigned.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: '0.86rem' }}>
                      <strong>{order.deliveryAssignment.deliveryBoyName}</strong> &bull;{' '}
                      <span>{order.deliveryAssignment.deliveryBoyPhone}</span>
                    </div>
                    {order.deliveryAssignment.deliveryBoyPhone && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <a href={`tel:${order.deliveryAssignment.deliveryBoyPhone}`} className="odm-tool-btn odm-tool-primary">
                          <FiPhone size={13} /> Call
                        </a>
                        <a
                          href={`https://wa.me/${(() => {
                            const d = String(order.deliveryAssignment.deliveryBoyPhone).replace(/\D/g, '');
                            return d.length === 10 ? `91${d}` : d;
                          })()}`}
                          target="_blank"
                          rel="noreferrer"
                          className="odm-tool-btn"
                        >
                          <FiMessageCircle size={13} /> WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
                  Your delivery partner will be assigned soon.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
