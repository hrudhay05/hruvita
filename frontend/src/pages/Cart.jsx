import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FiCheckCircle, FiCrosshair, FiMinus, FiPlus, FiShield, FiTrash2 } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvents } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { detectCurrentLocation } from '../lib/location.js';
import { loadRazorpayScript } from '../lib/razorpay.js';
import { money, unitPrice } from '../lib/format.js';
import './Cart.css';

export default function Cart() {
  const navigate = useNavigate();
  const { items, customBowls, setQty, setCustomBowlQty, clear } = useCart();
  const { productById, comboById, settings, refreshCatalog } = useCatalog();
  const { user, addresses, selectedAddressId, setSelectedAddressId } = useAuth();
  const { showToast } = useToast();

  const [slots, setSlots] = useState([]);
  const [bookingInfo, setBookingInfo] = useState({
    isSameDay: true,
    sameDayAvailable: true,
    sameDayMessage: "Ordering for today? Great! We'll prepare your order as soon as possible.",
    nextAvailableDate: '',
  });
  const [coupons, setCoupons] = useState([]);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [useRewards, setUseRewards] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');

  const fmtBusinessDate = (dt) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dt);
  const todayStr = fmtBusinessDate(new Date());
  const maxPreOrderDays = Number(settings?.maxPreOrderDays ?? 7);
  const preOrderDates = Array.from({ length: maxPreOrderDays + 1 }, (_, i) => {
    const dt = new Date(Date.now() + i * 86400000);
    const iso = fmtBusinessDate(dt);
    const label =
      i === 0
        ? `Today (${iso})`
        : i === 1
          ? `Tomorrow (${iso})`
          : dt.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            }) + ` (${iso})`;
    return { iso, label };
  });
  const [searchParams] = useSearchParams();
  const [scheduledDate, setScheduledDate] = useState(todayStr);
  const [slotId, setSlotId] = useState('morning');
  const [paymentMethod, setPaymentMethod] = useState(() =>
    searchParams.get('pay') === 'razorpay' ? 'razorpay' : 'cod'
  );

  useEffect(() => {
    const payParam = searchParams.get('pay');
    if (payParam === 'razorpay' || payParam === 'cod') {
      setPaymentMethod(payParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const onVoicePay = (ev) => {
      if (ev.detail === 'razorpay' || ev.detail === 'cod') {
        setPaymentMethod(ev.detail);
      }
    };
    window.addEventListener('hruvita:set-payment', onVoicePay);
    return () => window.removeEventListener('hruvita:set-payment', onVoicePay);
  }, []);
  const [localAddressChoice, setLocalAddressChoice] = useState('');
  const [customAddr, setCustomAddr] = useState({
    label: 'Home',
    recipient: '',
    phone: '',
    line1: '',
    area: '',
    city: 'Hyderabad',
    pincode: '',
    notes: '',
  });

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rzpCheckout, setRzpCheckout] = useState(null);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  const lines = Object.entries(items)
    .map(([rawKey, qty]) => {
      if (rawKey.startsWith('combo:')) {
        const combo = comboById[rawKey.slice(6)];
        if (!combo) return null;
        return {
          key: rawKey,
          isCombo: true,
          name: combo.name,
          image: combo.image,
          unitAmount: Number(combo.price),
          maxStock: 20,
          linkTo: '/menu?cat=combos',
          subtitle: `${money(combo.price)} combo (${combo.scheduleStart}–${combo.scheduleEnd})`,
          qty,
        };
      }
      const [baseId, sizeLabel = ''] = rawKey.split('::');
      const product = productById[baseId];
      if (!product) return null;
      const matchedSize =
        sizeLabel && Array.isArray(product.sizes)
          ? product.sizes.find((s) => String(s.name).toLowerCase() === sizeLabel.toLowerCase())
          : null;
      const delta = matchedSize ? Number(matchedSize.priceDelta) || 0 : 0;
      const unitAmt = unitPrice(product) + delta;
      return {
        key: rawKey,
        isCombo: false,
        product,
        name: matchedSize ? `${product.name} (${matchedSize.name})` : product.name,
        image: product.image,
        unitAmount: unitAmt,
        maxStock: product.stock,
        linkTo: `/product/${product.id}`,
        subtitle: `${money(unitAmt)} each`,
        qty,
      };
    })
    .filter(Boolean);

  const hasItems = lines.length > 0 || customBowls.length > 0;

  useEffect(() => {
    apiRequest(`/api/slots?date=${encodeURIComponent(scheduledDate)}`)
      .then((d) => {
        setBookingInfo({
          isSameDay: d.isSameDay ?? scheduledDate === todayStr,
          sameDayAvailable: d.sameDayAvailable ?? true,
          sameDayMessage:
            d.sameDayMessage ||
            "Ordering for today? Great! We'll prepare your order as soon as possible.",
          nextAvailableDate: d.nextAvailableDate || '',
        });
        if (d.isSameDay ?? scheduledDate === todayStr) {
          setSlots([]);
          setSlotId('same-day');
        } else if (d.slots?.length) {
          setSlots(d.slots);
          const currentValid = d.slots.find((s) => s.id === slotId && s.available !== false);
          if (!currentValid) {
            const firstAvail = d.slots.find((s) => s.available !== false);
            if (firstAvail) setSlotId(firstAvail.id);
          }
        }
      })
      .catch(() => {});
  }, [scheduledDate]);

  useEffect(() => {
    apiRequest('/api/coupons')
      .then((d) => {
        setCoupons(d.coupons || []);
      })
      .catch(() => {});
  }, [user?.id]);

  useSocketEvents({
    'coupon:updated': () => {
      apiRequest('/api/coupons')
        .then((d) => setCoupons(d.coupons || []))
        .catch(() => {});
    },
  });

  useEffect(() => {
    if (user) {
      if (selectedAddressId && addresses.some((a) => a.id === selectedAddressId)) {
        setLocalAddressChoice(selectedAddressId);
      } else if (addresses.length > 0) {
        const def = addresses.find((a) => a.isDefault) || addresses[0];
        setLocalAddressChoice(def.id);
      } else {
        setLocalAddressChoice('new');
        setCustomAddr((prev) => ({
          ...prev,
          recipient: prev.recipient || user.fullName || user.name || '',
          phone: prev.phone || user.mobileNumber || user.phone || '',
        }));
      }
    }
  }, [user, addresses, selectedAddressId]);

  useEffect(() => {
    if (!hasItems) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    setQuoteError('');
    apiRequest('/api/checkout/quote', {
      method: 'POST',
      body: JSON.stringify({
        items,
        customBowls,
        couponCode: appliedCoupon,
        useRewards,
        userId: user?.id || null,
      }),
    })
      .then((data) => {
        setQuote(data);
        setQuoteError('');
      })
      .catch((err) => {
        setQuote(null);
        setQuoteError(err?.message || 'Could not calculate live quote.');
      });
  }, [items, customBowls, appliedCoupon, useRewards, user?.id, hasItems]);

  if (confirmedOrder) {
    return (
      <div className="container cart-empty">
        <FiCheckCircle size={56} style={{ color: 'var(--primary)' }} />
        <h1>Order Placed Successfully</h1>
        <p>
          Order <strong>{confirmedOrder.id}</strong> &bull; Total:{' '}
          <strong>{money(confirmedOrder.pricing?.grandTotal)}</strong> &bull; Delivery:{' '}
          <strong>
            {confirmedOrder.scheduledDate} ({confirmedOrder.slotLabel})
          </strong>
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
          <Button to="/dashboard" variant="primary">
            View Order in Dashboard
          </Button>
          <Button to="/menu" variant="outline">
            Continue Exploring
          </Button>
        </div>
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div className="container cart-empty">
        <h1>Your cart is empty</h1>
        <p>Explore our fresh fruit bowls, custom bowls, and wholesome breakfasts.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button to="/menu">Explore Menu</Button>
          <Button to="/build-bowl" variant="accent">
            Build Your Bowl
          </Button>
        </div>
      </div>
    );
  }

  const localCatalogSubtotal = lines.reduce((sum, l) => sum + l.unitAmount * l.qty, 0);
  const localBowlSubtotal = customBowls.reduce(
    (sum, b) => sum + (Number(b.unitPrice) || 139) * (b.qty || 1),
    0
  );
  const localSubtotal = localCatalogSubtotal + localBowlSubtotal;

  const freeAbove = Number(settings?.freeDeliveryAbove ?? 199);
  const baseDelivery = Number(settings?.deliveryCharge ?? 25);
  const taxPct = Number(settings?.taxPercent ?? 5);
  const fallbackDelivery = localSubtotal >= freeAbove ? 0 : baseDelivery;
  const fallbackTax = Math.round((localSubtotal * taxPct) / 100);

  const pricing = quote?.pricing || {
    subtotal: localSubtotal,
    couponCode: '',
    couponDiscount: 0,
    couponMessage: quoteError || '',
    rewardPointsUsed: 0,
    deliveryCharge: fallbackDelivery,
    freeDeliveryAbove: freeAbove,
    taxPercent: taxPct,
    taxAmount: fallbackTax,
    grandTotal: localSubtotal + fallbackDelivery + fallbackTax,
  };

  const handleApplyCoupon = (codeToApply) => {
    const code = (codeToApply ?? couponInput).trim().toUpperCase();
    setCouponInput(code);
    setAppliedCoupon(code);
  };

  const getSelectedAddressObject = () => {
    if (localAddressChoice && localAddressChoice !== 'new') {
      const found = addresses.find((a) => a.id === localAddressChoice);
      if (found) {
        const line1 = [found.doorNumber, found.apartmentName, found.street, found.locality, found.area]
          .filter(Boolean)
          .join(', ');
        return {
          label: found.addressLabel || 'Home',
          recipient: found.recipientName,
          phone: found.mobileNumber,
          line1: line1 || found.line1 || found.area,
          area: found.area || '',
          city: found.district || found.city || 'Hyderabad',
          pincode: found.pincode,
          notes: found.deliveryInstructions || '',
        };
      }
    }
    return customAddr;
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setError('');
    if (!user) {
      navigate('/login');
      return;
    }

    const address = getSelectedAddressObject();
    if (!address.recipient || !address.phone || !address.line1 || !address.pincode) {
      setError('Please select a saved delivery address or enter complete delivery details.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items,
          customBowls,
          couponCode: appliedCoupon,
          useRewards,
          address,
          scheduledDate,
          slotId: scheduledDate === todayStr ? 'same-day' : slotId,
          paymentMethod,
          idempotencyKey: `idem-${user.id}-${Date.now()}`,
        }),
      });

      if (paymentMethod === 'cod') {
        clear();
        await refreshCatalog();
        showToast('Order placed successfully.');
        setConfirmedOrder(res.order);
      } else if (res.razorpay?.isRealGateway && (await loadRazorpayScript()) && window.Razorpay) {
        const rzpOptions = {
          key: res.razorpay.keyId,
          amount: res.razorpay.amountPaise,
          currency: res.razorpay.currency || 'INR',
          name: settings?.name || 'HRUVITA',
          description: `Order ${res.order.id}`,
          order_id: res.razorpay.orderId,
          prefill: {
            name: address.recipient || user.fullName || user.name || '',
            email: user.email || '',
            contact: address.phone || user.mobileNumber || '',
          },
          theme: {
            color: '#245C45',
          },
          handler: async (rzpResponse) => {
            setBusy(true);
            try {
              const verified = await apiRequest(`/api/orders/${res.order.id}/verify-payment`, {
                method: 'POST',
                body: JSON.stringify({
                  razorpay_order_id: rzpResponse.razorpay_order_id,
                  razorpay_payment_id: rzpResponse.razorpay_payment_id,
                  razorpay_signature: rzpResponse.razorpay_signature,
                }),
              });
              clear();
              await refreshCatalog();
              showToast('Payment verified. Order placed successfully.');
              setConfirmedOrder(verified.order);
            } catch (verifyErr) {
              setError(verifyErr.message || 'Payment verification failed.');
              showToast('Payment verification failed.', 'error');
            } finally {
              setBusy(false);
            }
          },
          modal: {
            ondismiss: () => {
              setError(
                `Payment cancelled or dismissed for order ${res.order.id}. Stock is reserved for 10 minutes — you can pay from your dashboard or retry.`
              );
            },
          },
        };
        const rzp = new window.Razorpay(rzpOptions);
        rzp.on('payment.failed', (failResp) => {
          setError(
            failResp?.error?.description ||
              'Payment failed in Razorpay. Please try again or choose Cash on Delivery.'
          );
          showToast('Payment failed.', 'error');
        });
        rzp.open();
      } else {
        setRzpCheckout({
          order: res.order,
          razorpay: res.razorpay,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmOnlinePayment = async () => {
    if (!rzpCheckout) return;
    setError('');
    setBusy(true);
    try {
      const res = await apiRequest(`/api/orders/${rzpCheckout.order.id}/verify-payment`, {
        method: 'POST',
        body: JSON.stringify(rzpCheckout.razorpay.testPayload),
      });
      setRzpCheckout(null);
      clear();
      await refreshCatalog();
      showToast('Payment verified. Order placed successfully.');
      setConfirmedOrder(res.order);
    } catch (err) {
      setError(err.message);
      showToast('Payment verification failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container cart-page">
      <header className="cart-head">
        <h1>Cart &amp; Checkout</h1>
        <button type="button" className="cart-clear" onClick={clear}>
          Clear Cart
        </button>
      </header>

      {error && <div className="account-alert" role="alert">{error}</div>}

      <div className="cart-layout">
        <div>
          <ul className="cart-list">
            {lines.map((line) => (
              <li key={line.key} className="cart-line">
                <span className="cart-emoji" aria-hidden="true">
                  <img
                    src={line.image}
                    alt={line.name}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </span>
                <div className="cart-info">
                  <strong>
                    <Link to={line.linkTo}>{line.name}</Link>
                  </strong>
                  <span>{line.subtitle}</span>
                </div>
                <div className="cart-qty">
                  <button
                    type="button"
                    onClick={() => setQty(line.key, line.qty - 1)}
                    aria-label={`Decrease ${line.name}`}
                  >
                    {line.qty === 1 ? <FiTrash2 size={15} /> : <FiMinus size={15} />}
                  </button>
                  <b>{line.qty}</b>
                  <button
                    type="button"
                    onClick={() => setQty(line.key, Math.min(line.qty + 1, line.maxStock))}
                    aria-label={`Increase ${line.name}`}
                  >
                    <FiPlus size={15} />
                  </button>
                </div>
                <strong className="cart-total">{money(line.unitAmount * line.qty)}</strong>
              </li>
            ))}

            {customBowls.map((bowl) => (
              <li key={bowl.id} className="cart-line">
                <span className="cart-emoji" aria-hidden="true">
                  <img
                    src={
                      bowl.image ||
                      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'
                    }
                    alt={bowl.name}
                  />
                </span>
                <div className="cart-info">
                  <strong>{bowl.name}</strong>
                  <span>{bowl.summary}</span>
                </div>
                <div className="cart-qty">
                  <button
                    type="button"
                    onClick={() => setCustomBowlQty(bowl.id, (bowl.qty || 1) - 1)}
                    aria-label={`Remove ${bowl.name}`}
                  >
                    {(bowl.qty || 1) === 1 ? <FiTrash2 size={15} /> : <FiMinus size={15} />}
                  </button>
                  <b>{bowl.qty || 1}</b>
                  <button
                    type="button"
                    onClick={() => setCustomBowlQty(bowl.id, (bowl.qty || 1) + 1)}
                    aria-label={`Add another ${bowl.name}`}
                  >
                    <FiPlus size={15} />
                  </button>
                </div>
                <strong className="cart-total">
                  {money((Number(bowl.unitPrice) || 139) * (bowl.qty || 1))}
                </strong>
              </li>
            ))}
          </ul>

          <div className="cart-checkout-box">
            <h2>
              1. Delivery Date {scheduledDate !== todayStr ? `& Time Slot (Pre-order up to ${maxPreOrderDays} days)` : ''}
            </h2>
            <div className="cart-field-grid">
              <div className="cart-field">
                <label htmlFor="checkout-date">Delivery Date</label>
                <select
                  id="checkout-date"
                  name="scheduledDate"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                >
                  {preOrderDates.map((d) => (
                    <option key={d.iso} value={d.iso}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {scheduledDate === todayStr ? (
              <div
                className={`cart-sameday-banner ${bookingInfo.sameDayAvailable ? 'cart-sameday-open' : 'cart-sameday-closed'}`}
              >
                <div>
                  <strong>{bookingInfo.sameDayAvailable ? 'Same-Day Express Preparation' : 'Same-Day Ordering Closed'}</strong>
                  <p>{bookingInfo.sameDayMessage}</p>
                </div>
                {!bookingInfo.sameDayAvailable && bookingInfo.nextAvailableDate && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setScheduledDate(bookingInfo.nextAvailableDate)}
                  >
                    Switch to Tomorrow ({bookingInfo.nextAvailableDate})
                  </Button>
                )}
              </div>
            ) : (
              <div className="cart-slots">
                {slots.filter((s) => !s.isFull).map((s) => {
                  const disabled = s.available === false;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={disabled}
                      title={s.unavailableReason || ''}
                      className={`cart-slot-btn ${slotId === s.id && !disabled ? 'cart-slot-active' : ''}`.trim()}
                      style={disabled ? { opacity: 0.48, cursor: 'not-allowed' } : undefined}
                      onClick={() => !disabled && setSlotId(s.id)}
                    >
                      <span>{s.name}</span>
                      <span>{s.window}</span>
                      {disabled ? (
                        <small style={{ color: 'var(--danger)', fontSize: '0.72rem' }}>
                          {s.unavailableReason || 'Unavailable'}
                        </small>
                      ) : (
                        s.remainingCapacity !== undefined && (
                          <small style={{ color: 'var(--primary)', fontSize: '0.72rem' }}>
                            {s.remainingCapacity} spots left
                          </small>
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ marginBottom: 0 }}>2. Delivery Address</h2>
              {user && (
                <Link to="/addresses/new" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.86rem' }}>
                  + Manage / Add Address
                </Link>
              )}
            </div>

            {!user ? (
              <div className="account-notice">
                Please{' '}
                <Link to="/login" style={{ textDecoration: 'underline', fontWeight: 700 }}>
                  sign in to your account
                </Link>{' '}
                to choose a saved address and complete checkout.
              </div>
            ) : (
              <>
                {addresses.length > 0 && (
                  <div className="cart-field">
                    <label htmlFor="checkout-saved-addr">Select Saved Address</label>
                    <select
                      id="checkout-saved-addr"
                      name="savedAddress"
                      value={localAddressChoice}
                      onChange={(e) => {
                        setLocalAddressChoice(e.target.value);
                        if (e.target.value !== 'new') setSelectedAddressId(e.target.value);
                      }}
                    >
                      {addresses.map((a) => {
                        const line = [a.doorNumber, a.apartmentName, a.street, a.area]
                          .filter(Boolean)
                          .join(', ');
                        return (
                          <option key={a.id} value={a.id}>
                            {a.addressLabel}: {a.recipientName} — {line || a.district}, {a.pincode}
                          </option>
                        );
                      })}
                      <option value="new">+ Enter a one-time address below</option>
                    </select>
                  </div>
                )}

                {(!addresses.length || localAddressChoice === 'new') && (
                  <>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setError('');
                          try {
                            const loc = await detectCurrentLocation();
                            setCustomAddr((prev) => ({
                              ...prev,
                              line1: loc.line1,
                              area: loc.area,
                              city: loc.district || prev.city,
                              pincode: loc.pincode,
                            }));
                            showToast('Location detected.');
                          } catch (locErr) {
                            setError(locErr.message);
                          }
                        }}
                      >
                        <FiCrosshair size={14} /> Use Current Location
                      </Button>
                    </div>
                    <div className="cart-field-grid">
                      <div className="cart-field">
                        <label htmlFor="co-recipient">Recipient Name</label>
                        <input
                          id="co-recipient"
                          name="recipient"
                          type="text"
                          required
                          value={customAddr.recipient}
                          onChange={(e) => setCustomAddr({ ...customAddr, recipient: e.target.value })}
                        />
                      </div>
                      <div className="cart-field">
                        <label htmlFor="co-phone">Mobile Number</label>
                        <input
                          id="co-phone"
                          name="phone"
                          type="tel"
                          required
                          value={customAddr.phone}
                          onChange={(e) => setCustomAddr({ ...customAddr, phone: e.target.value })}
                        />
                      </div>
                      <div className="cart-field">
                        <label htmlFor="co-line1">Flat / Street / Area</label>
                        <input
                          id="co-line1"
                          name="line1"
                          type="text"
                          required
                          value={customAddr.line1}
                          onChange={(e) => setCustomAddr({ ...customAddr, line1: e.target.value })}
                        />
                      </div>
                      <div className="cart-field">
                        <label htmlFor="co-pincode">PIN Code</label>
                        <input
                          id="co-pincode"
                          name="pincode"
                          type="text"
                          required
                          value={customAddr.pincode}
                          onChange={(e) => setCustomAddr({ ...customAddr, pincode: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="cart-summary">
          <h2>Order Summary</h2>

          <div className="cart-coupon-row">
            <input
              id="coupon-code-input"
              name="couponCode"
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="Coupon code"
              aria-label="Coupon code"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => handleApplyCoupon()}>
              Apply
            </Button>
          </div>

          {coupons.length > 0 && (
            <div className="cart-coupon-chips" style={{ display: 'grid', gap: 6 }}>
              {coupons.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className="cart-coupon-chip"
                  onClick={() => handleApplyCoupon(c.code)}
                  title={c.title}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                  }}
                >
                  <span>
                    <strong>{c.code}</strong> &bull;{' '}
                    {c.type === 'percent' ? `${c.value}% OFF` : `Flat ₹${c.value} OFF`}
                    {c.minOrder > 0 ? ` (Min ₹${c.minOrder})` : ''}
                    {c.firstOrderOnly ? ' • First Order' : ''}
                  </span>
                  {c.validUntil && (
                    <span style={{ fontSize: '0.72rem', opacity: 0.78 }}>Exp {c.validUntil}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {pricing.couponMessage && (
            <p
              style={{
                fontSize: '0.82rem',
                color: pricing.couponDiscount > 0 ? 'var(--primary)' : 'var(--danger)',
              }}
            >
              {pricing.couponMessage}
            </p>
          )}

          {user && user.rewardPoints > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem' }}>
              <input
                id="use-rewards-check"
                name="useRewards"
                type="checkbox"
                checked={useRewards}
                onChange={(e) => setUseRewards(e.target.checked)}
              />
              Use Reward Points ({user.rewardPoints} pts available)
            </label>
          )}

          <div className="cart-row">
            <span>Subtotal</span>
            <strong>{money(pricing.subtotal)}</strong>
          </div>

          {pricing.couponDiscount > 0 && (
            <div className="cart-row cart-row-discount">
              <span>Discount ({pricing.couponCode})</span>
              <span>-{money(pricing.couponDiscount)}</span>
            </div>
          )}

          {pricing.rewardPointsUsed > 0 && (
            <div className="cart-row cart-row-discount">
              <span>Reward Points</span>
              <span>-{money(pricing.rewardPointsUsed)}</span>
            </div>
          )}

          <div className="cart-row">
            <span>Delivery {pricing.deliveryCharge === 0 ? '(Free above ₹199)' : ''}</span>
            <strong>{pricing.deliveryCharge === 0 ? 'Free' : money(pricing.deliveryCharge)}</strong>
          </div>

          <div className="cart-row">
            <span>GST ({pricing.taxPercent}%)</span>
            <strong>{money(pricing.taxAmount)}</strong>
          </div>

          <div className="cart-row cart-row-grand">
            <span>Total Payable</span>
            <strong>{money(pricing.grandTotal)}</strong>
          </div>

          <div>
            <strong style={{ fontSize: '0.86rem', display: 'block', marginBottom: 8 }}>
              Payment Method
            </strong>
            <div className="cart-pay-methods">
              <button
                type="button"
                className={`cart-pay-option ${
                  paymentMethod === 'cod' ? 'cart-pay-option-active' : ''
                }`.trim()}
                onClick={() => setPaymentMethod('cod')}
              >
                Cash on Delivery
              </button>
              <button
                type="button"
                className={`cart-pay-option ${
                  paymentMethod === 'razorpay' ? 'cart-pay-option-active' : ''
                }`.trim()}
                onClick={() => setPaymentMethod('razorpay')}
              >
                Online (Razorpay)
              </button>
            </div>
          </div>

          {!user ? (
            <Button to="/login" variant="primary" size="lg">
              Sign In to Checkout
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={busy}
              onClick={handlePlaceOrder}
            >
              {busy
                ? 'Processing...'
                : paymentMethod === 'razorpay'
                ? `Pay ${money(pricing.grandTotal)}`
                : `Place Order (${money(pricing.grandTotal)})`}
            </Button>
          )}
        </aside>
      </div>

      {rzpCheckout && (
        <div className="rzp-backdrop" role="dialog" aria-modal="true" aria-label="Razorpay Checkout">
          <div className="rzp-modal">
            <div className="rzp-head">
              <div>
                <strong>HRUVITA Payment</strong>
                <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>
                  Order {rzpCheckout.order.id}
                </div>
              </div>
              <strong style={{ fontSize: '1.25rem' }}>{money(rzpCheckout.razorpay.amount)}</strong>
            </div>
            <div className="rzp-body">
              <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
                Confirm Razorpay gateway authorization for{' '}
                <strong>{money(rzpCheckout.razorpay.amount)}</strong>. Your payment signature is
                verified securely on our server before order confirmation.
              </p>
              <Button variant="primary" size="lg" onClick={handleConfirmOnlinePayment} disabled={busy}>
                <FiShield size={18} />
                {busy ? 'Verifying Payment...' : `Authorize ${money(rzpCheckout.razorpay.amount)}`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRzpCheckout(null)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
