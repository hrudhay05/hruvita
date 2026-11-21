import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FiCheck,
  FiCopy,
  FiPlus,
  FiShare2,
  FiTrash2,
  FiTruck,
  FiUsers,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './GroupDrops.css';

const FALLBACK_SLOTS = [
  { id: 'morning', name: 'Morning Slot', window: '6:30 AM – 9:00 AM', available: true },
  { id: 'afternoon', name: 'Afternoon Slot', window: '12:30 PM – 2:30 PM', available: true },
  { id: 'evening', name: 'Evening Slot', window: '6:30 PM – 8:30 PM', available: true },
];

export default function GroupDrops() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, addresses } = useAuth();
  const { products } = useCatalog();
  const { showToast } = useToast();

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [slots, setSlots] = useState(FALLBACK_SLOTS);
  const [myDrops, setMyDrops] = useState([]);
  const [activeDrop, setActiveDrop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: '',
    dropType: 'office',
    addressId: '',
    line1: '',
    area: '',
    pincode: '',
    scheduledDate: tomorrow,
    slotId: 'morning',
    cutoffNote: 'Add your items before 10:00 PM tonight',
  });

  const [itemForm, setItemForm] = useState({
    productId: '',
    qty: 1,
    memberName: '',
    note: '',
  });

  useEffect(() => {
    if (addresses?.length > 0 && !createForm.addressId) {
      const def = addresses.find((a) => a.isDefault) || addresses[0];
      setCreateForm((prev) => ({ ...prev, addressId: def.id }));
    }
  }, [addresses, createForm.addressId]);

  useEffect(() => {
    const activeProds = (products || []).filter((p) => p.active !== false);
    if (activeProds.length > 0 && !itemForm.productId) {
      setItemForm((prev) => ({ ...prev, productId: activeProds[0].id }));
    }
  }, [products, itemForm.productId]);

  useEffect(() => {
    if (!createForm.scheduledDate) return;
    apiRequest(`/api/slots?date=${encodeURIComponent(createForm.scheduledDate)}`)
      .then((d) => {
        if (d.slots?.length) {
          setSlots(d.slots);
          const valid = d.slots.find((s) => s.id === createForm.slotId && s.available !== false);
          if (!valid) {
            const firstAvail = d.slots.find((s) => s.available !== false) || d.slots[0];
            if (firstAvail) setCreateForm((prev) => ({ ...prev, slotId: firstAvail.id }));
          }
        }
      })
      .catch(() => setSlots(FALLBACK_SLOTS));
  }, [createForm.scheduledDate, createForm.slotId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (code) {
        const res = await apiRequest(`/api/group-drops/${encodeURIComponent(code)}`);
        setActiveDrop(res.groupDrop || null);
      } else {
        setActiveDrop(null);
      }
      if (user) {
        const myRes = await apiRequest('/api/group-drops/my');
        setMyDrops(myRes.groupDrops || []);
      }
    } catch (err) {
      setError(err.message || 'Could not load Group Drop.');
    } finally {
      setLoading(false);
    }
  }, [code, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live sync while drop is open
  useEffect(() => {
    if (!code) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        apiRequest(`/api/group-drops/${encodeURIComponent(code)}`)
          .then((res) => {
            if (res.groupDrop) setActiveDrop(res.groupDrop);
          })
          .catch(() => {});
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [code]);

  const handleCreateDrop = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        title: createForm.title,
        dropType: createForm.dropType,
        scheduledDate: createForm.scheduledDate,
        slotId: createForm.slotId,
        cutoffNote: createForm.cutoffNote,
        ...(createForm.addressId
          ? { addressId: createForm.addressId }
          : {
              customAddress: {
                line1: createForm.line1,
                area: createForm.area,
                pincode: createForm.pincode,
              },
            }),
      };
      const res = await apiRequest('/api/group-drops', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Group Morning Drop created! Share the link with your team or family.');
      navigate(`/group-drops/${res.groupDrop.code}`);
    } catch (err) {
      setError(err.message || 'Could not create Group Drop.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest(`/api/group-drops/${activeDrop.code}/items`, {
        method: 'POST',
        body: JSON.stringify(itemForm),
      });
      setActiveDrop(res.groupDrop);
      setItemForm((prev) => ({ ...prev, qty: 1, note: '' }));
      showToast('Added to Group Drop!');
    } catch (err) {
      setError(err.message || 'Could not add item.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest(`/api/group-drops/${activeDrop.code}/items/${itemId}`, {
        method: 'DELETE',
      });
      setActiveDrop(res.groupDrop);
      showToast('Item removed.');
    } catch (err) {
      setError(err.message || 'Could not remove item.');
    } finally {
      setBusy(false);
    }
  };

  const handlePlaceGroupOrder = async () => {
    if (!window.confirm(`Place combined Group Drop order for ${money(activeDrop.totalAmount)} with ₹0 delivery fee?`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await apiRequest(`/api/group-drops/${activeDrop.code}/place-order`, {
        method: 'POST',
      });
      setActiveDrop(res.groupDrop);
      showToast(`Group Order ${res.order?.id || ''} placed with ₹0 delivery fee!`);
    } catch (err) {
      setError(err.message || 'Could not place Group Drop order.');
    } finally {
      setBusy(false);
    }
  };

  const shareUrl = activeDrop ? `${window.location.origin}/group-drops/${activeDrop.code}` : '';
  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      showToast('Group Drop link copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const activeProducts = (products || []).filter((p) => p.active !== false);

  return (
    <div className="container group-drops-page">
      <div className="group-drops-hero">
        <div>
          <span className="group-drops-badge">
            <FiTruck size={13} /> Zero Delivery Fee &bull; One Morning Drop
          </span>
          <h1>Office &amp; Family Group Morning Drops</h1>
          <p>
            Start one shared drop link for your office floor, PG, or family. Everyone adds their own
            fresh fruit bowl or juice, sees their exact split, and pays <strong>₹0 delivery fee</strong>.
          </p>
        </div>
        {code && (
          <Link to="/group-drops" className="group-drops-back-btn">
            &larr; All Group Drops
          </Link>
        )}
      </div>

      {error && (
        <div className="group-drops-alert" role="alert">
          {error}
        </div>
      )}

      {code && activeDrop ? (
        <div className="group-drop-room">
          <div className="group-drop-summary-card">
            <div className="group-drop-summary-top">
              <div>
                <span className="group-drop-type-pill">
                  {activeDrop.dropType === 'family' ? '🏡 Family Drop' : '🏢 Office Drop'} &bull; {activeDrop.code}
                </span>
                <h2>{activeDrop.title}</h2>
                <p className="group-drop-meta">
                  Host: <strong>{activeDrop.hostName}</strong> &bull; {activeDrop.scheduledDate} &bull;{' '}
                  {activeDrop.slotLabel}
                </p>
                <p className="group-drop-meta">
                  Drop Address: {activeDrop.address?.line1}
                  {activeDrop.address?.area ? `, ${activeDrop.address.area}` : ''} ({activeDrop.address?.pincode})
                </p>
                {activeDrop.cutoffNote && (
                  <p className="group-drop-cutoff">⏰ {activeDrop.cutoffNote}</p>
                )}
              </div>

              <div className="group-drop-total-box">
                <span>Combined Total</span>
                <strong>{money(activeDrop.totalAmount)}</strong>
                <span className="group-drop-free-del">₹0 Delivery Fee</span>
                <span className={`group-drop-status group-drop-status-${activeDrop.status}`}>
                  {activeDrop.status === 'placed' ? `Order Placed (${activeDrop.createdOrderId})` : 'Open for Orders'}
                </span>
              </div>
            </div>

            <div className="group-drop-share-bar">
              <input type="text" readOnly value={shareUrl} aria-label="Shareable Group Drop link" />
              <button type="button" className="group-share-btn" onClick={handleCopyLink}>
                {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>
              <a
                className="group-share-btn group-share-wa"
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Join our HRUVITA Group Morning Drop "${activeDrop.title}" (${activeDrop.scheduledDate}) with ₹0 delivery fee: ${shareUrl}`
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <FiShare2 size={14} /> WhatsApp
              </a>
            </div>
          </div>

          <div className="group-drop-columns">
            <section className="group-drop-card">
              <h3>
                <FiPlus size={16} /> Add Your Bowl / Juice
              </h3>
              {!user ? (
                <div className="group-drop-login-box">
                  <p>Sign in to add your item to this Group Morning Drop.</p>
                  <Button type="button" size="sm" onClick={() => navigate('/login')}>
                    Sign In to Join
                  </Button>
                </div>
              ) : activeDrop.status !== 'open' ? (
                <p className="group-drop-meta">
                  This Group Drop is already placed ({activeDrop.createdOrderId}).
                </p>
              ) : (
                <form className="group-drop-form" onSubmit={handleAddItem}>
                  <div className="group-drop-field">
                    <label htmlFor="gd-product">Select Bowl / Drink</label>
                    <select
                      id="gd-product"
                      value={itemForm.productId}
                      onChange={(e) => setItemForm({ ...itemForm, productId: e.target.value })}
                    >
                      {activeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {money(p.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="group-drop-row-2">
                    <div className="group-drop-field">
                      <label htmlFor="gd-qty">Quantity</label>
                      <input
                        id="gd-qty"
                        type="number"
                        min={1}
                        max={20}
                        value={itemForm.qty}
                        onChange={(e) => setItemForm({ ...itemForm, qty: Number(e.target.value) })}
                      />
                    </div>
                    <div className="group-drop-field">
                      <label htmlFor="gd-member">Your Name (for label)</label>
                      <input
                        id="gd-member"
                        placeholder={user.fullName || user.name || 'Your name'}
                        value={itemForm.memberName}
                        onChange={(e) => setItemForm({ ...itemForm, memberName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="group-drop-field">
                    <label htmlFor="gd-note">Optional Note (e.g. No sugar / Desk 4B)</label>
                    <input
                      id="gd-note"
                      placeholder="Less honey, desk 4B..."
                      value={itemForm.note}
                      onChange={(e) => setItemForm({ ...itemForm, note: e.target.value })}
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={busy}>
                    {busy ? 'Adding...' : 'Add to Group Drop'}
                  </Button>
                </form>
              )}
            </section>

            <section className="group-drop-card">
              <div className="group-drop-members-head">
                <h3>
                  <FiUsers size={16} /> Members &amp; Split ({activeDrop.participants?.length || 0})
                </h3>
                {user && activeDrop.hostUserId === user.id && activeDrop.status === 'open' && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !(activeDrop.participants?.length > 0)}
                    onClick={handlePlaceGroupOrder}
                  >
                    Place Group Order ({money(activeDrop.totalAmount)})
                  </Button>
                )}
              </div>

              {!activeDrop.participants?.length ? (
                <p className="group-drop-meta" style={{ padding: '14px 0' }}>
                  No items added yet. Share the link or add the first bowl!
                </p>
              ) : (
                <div className="group-drop-participants">
                  {activeDrop.participants.map((p) => (
                    <div key={p.userId} className="group-participant-card">
                      <div className="group-participant-head">
                        <strong>{p.name}</strong>
                        <span className="group-participant-split">Split: {money(p.subtotal)}</span>
                      </div>
                      <ul className="group-participant-items">
                        {(p.items || []).map((it) => (
                          <li key={it.id}>
                            <div>
                              <strong>
                                {it.qty}&times; {it.name}
                              </strong>
                              {it.note && <span className="group-item-note"> ({it.note})</span>}
                            </div>
                            <div className="group-item-right">
                              <span>{money(it.lineTotal)}</span>
                              {activeDrop.status === 'open' &&
                                user &&
                                (user.id === p.userId || user.id === activeDrop.hostUserId) && (
                                  <button
                                    type="button"
                                    className="group-item-del"
                                    onClick={() => handleRemoveItem(it.id)}
                                    aria-label={`Remove ${it.name}`}
                                  >
                                    <FiTrash2 size={13} />
                                  </button>
                                )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="group-drop-columns">
          <section className="group-drop-card">
            <h3>Create a Group Morning Drop</h3>
            {!user ? (
              <div className="group-drop-login-box">
                <p>Sign in to create an Office or Family Group Drop with ₹0 delivery fee.</p>
                <Button type="button" size="sm" onClick={() => navigate('/login')}>
                  Sign In to Create
                </Button>
              </div>
            ) : (
              <form className="group-drop-form" onSubmit={handleCreateDrop}>
                <div className="group-drop-field">
                  <label htmlFor="gd-title">Group Title</label>
                  <input
                    id="gd-title"
                    required
                    minLength={3}
                    placeholder="e.g. Tech Park 3rd Floor Morning Drop"
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  />
                </div>

                <div className="group-drop-row-2">
                  <div className="group-drop-field">
                    <label htmlFor="gd-type">Drop Type</label>
                    <select
                      id="gd-type"
                      value={createForm.dropType}
                      onChange={(e) => setCreateForm({ ...createForm, dropType: e.target.value })}
                    >
                      <option value="office">🏢 Office / Team</option>
                      <option value="family">🏡 Family / Home</option>
                    </select>
                  </div>
                  <div className="group-drop-field">
                    <label htmlFor="gd-date">Delivery Date</label>
                    <input
                      id="gd-date"
                      type="date"
                      required
                      value={createForm.scheduledDate}
                      onChange={(e) => setCreateForm({ ...createForm, scheduledDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="group-drop-field">
                  <label htmlFor="gd-slot">Delivery Slot</label>
                  <select
                    id="gd-slot"
                    value={createForm.slotId}
                    onChange={(e) => setCreateForm({ ...createForm, slotId: e.target.value })}
                  >
                    {slots
                      .filter((s) => !s.isFull)
                      .map((s) => (
                        <option key={s.id} value={s.id} disabled={s.available === false}>
                          {s.name} ({s.window})
                          {s.available === false ? ' — Closed' : ''}
                        </option>
                      ))}
                  </select>
                </div>

                {addresses?.length > 0 ? (
                  <div className="group-drop-field">
                    <label htmlFor="gd-addr">Drop Address</label>
                    <select
                      id="gd-addr"
                      value={createForm.addressId}
                      onChange={(e) => setCreateForm({ ...createForm, addressId: e.target.value })}
                    >
                      {addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label} — {a.line1} ({a.pincode})
                        </option>
                      ))}
                      <option value="">+ Enter another address</option>
                    </select>
                  </div>
                ) : null}

                {(!addresses?.length || !createForm.addressId) && (
                  <>
                    <div className="group-drop-field">
                      <label htmlFor="gd-line1">Office / Home Address</label>
                      <input
                        id="gd-line1"
                        required
                        placeholder="Building, Floor, Street"
                        value={createForm.line1}
                        onChange={(e) => setCreateForm({ ...createForm, line1: e.target.value })}
                      />
                    </div>
                    <div className="group-drop-row-2">
                      <div className="group-drop-field">
                        <label htmlFor="gd-area">Area</label>
                        <input
                          id="gd-area"
                          placeholder="Madhapur / Kondapur"
                          value={createForm.area}
                          onChange={(e) => setCreateForm({ ...createForm, area: e.target.value })}
                        />
                      </div>
                      <div className="group-drop-field">
                        <label htmlFor="gd-pin">Pincode</label>
                        <input
                          id="gd-pin"
                          required
                          placeholder="500081"
                          value={createForm.pincode}
                          onChange={(e) => setCreateForm({ ...createForm, pincode: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="group-drop-field">
                  <label htmlFor="gd-cutoff">Cutoff Note for Team</label>
                  <input
                    id="gd-cutoff"
                    value={createForm.cutoffNote}
                    onChange={(e) => setCreateForm({ ...createForm, cutoffNote: e.target.value })}
                  />
                </div>

                <Button type="submit" disabled={busy}>
                  {busy ? 'Creating...' : 'Create Group Drop Link'}
                </Button>
              </form>
            )}
          </section>

          <section className="group-drop-card">
            <h3>Your Group Morning Drops ({myDrops.length})</h3>
            {loading ? (
              <p className="group-drop-meta">Loading your group drops...</p>
            ) : !user ? (
              <p className="group-drop-meta">Sign in to see group drops you hosted or joined.</p>
            ) : myDrops.length === 0 ? (
              <p className="group-drop-meta">
                No group drops yet. Create one on the left and share the link on WhatsApp!
              </p>
            ) : (
              <div className="group-drop-list">
                {myDrops.map((d) => (
                  <Link key={d.code} to={`/group-drops/${d.code}`} className="group-drop-list-item">
                    <div>
                      <strong>{d.title}</strong>
                      <div className="group-drop-meta">
                        {d.code} &bull; {d.scheduledDate} &bull; {d.participants?.length || 0} member(s)
                      </div>
                    </div>
                    <div className="group-drop-list-right">
                      <strong>{money(d.totalAmount)}</strong>
                      <span className={`group-drop-status group-drop-status-${d.status}`}>
                        {d.status === 'placed' ? 'Placed' : 'Open'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
