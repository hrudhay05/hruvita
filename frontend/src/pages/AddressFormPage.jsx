import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiCrosshair, FiMapPin } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { detectCurrentLocation } from '../lib/location.js';
import './AuthFlow.css';

const LABELS = ['Home', 'Office', 'Hostel', 'Other'];

export default function AddressFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get('onboarding') === '1';

  const navigate = useNavigate();
  const { user, loading, getAddressById, addAddress, updateAddress } = useAuth();

  const [form, setForm] = useState({
    addressLabel: 'Home',
    recipientName: '',
    mobileNumber: '',
    alternateMobileNumber: '',
    doorNumber: '',
    apartmentName: '',
    street: '',
    locality: '',
    area: '',
    mandal: '',
    district: '',
    state: '',
    country: 'India',
    pincode: '',
    latitude: '',
    longitude: '',
    deliveryInstructions: '',
    isDefault: false,
  });

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fetchingAddr, setFetchingAddr] = useState(isEdit);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
      return;
    }
    if (user && !isEdit) {
      setForm((prev) => ({
        ...prev,
        recipientName: prev.recipientName || user.fullName || user.name || '',
        mobileNumber: prev.mobileNumber || user.mobileNumber || user.phone || '',
      }));
    }
  }, [user, loading, isEdit, navigate]);

  useEffect(() => {
    if (!isEdit || !user) return;
    setFetchingAddr(true);
    getAddressById(id)
      .then((addr) => {
        if (!addr) {
          setError('Address not found.');
          return;
        }
        setForm({
          addressLabel: addr.addressLabel || 'Home',
          recipientName: addr.recipientName || '',
          mobileNumber: addr.mobileNumber || '',
          alternateMobileNumber: addr.alternateMobileNumber || '',
          doorNumber: addr.doorNumber || '',
          apartmentName: addr.apartmentName || '',
          street: addr.street || '',
          locality: addr.locality || '',
          area: addr.area || '',
          mandal: addr.mandal || '',
          district: addr.district || '',
          state: addr.state || '',
          country: addr.country || 'India',
          pincode: addr.pincode || '',
          latitude: addr.latitude ?? '',
          longitude: addr.longitude ?? '',
          deliveryInstructions: addr.deliveryInstructions || '',
          isDefault: Boolean(addr.isDefault),
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setFetchingAddr(false));
  }, [isEdit, id, user, getAddressById]);

  const handleUseCurrentLocation = async () => {
    setError('');
    setNotice('');
    setLocating(true);
    try {
      const detected = await detectCurrentLocation();
      setForm((prev) => ({
        ...prev,
        doorNumber: detected.doorNumber,
        apartmentName: detected.apartmentName,
        street: detected.street,
        locality: detected.locality,
        area: detected.area,
        mandal: detected.mandal,
        district: detected.district,
        state: detected.state,
        country: detected.country || prev.country || 'India',
        pincode: detected.pincode,
        latitude: detected.latitude,
        longitude: detected.longitude,
      }));
      setNotice(
        `Coordinates (${detected.latitude}, ${detected.longitude}) reverse-geocoded. You can review and edit any field below.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const cleanMobile = String(form.mobileNumber).replace(/\D/g, '').slice(-10);
    const cleanAlt = String(form.alternateMobileNumber).replace(/\D/g, '').slice(-10);
    const cleanPin = String(form.pincode).replace(/\D/g, '').slice(0, 6);

    if (!form.recipientName.trim()) {
      setError('Recipient Name is required.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6–9.');
      return;
    }
    if (cleanAlt && !/^[6-9]\d{9}$/.test(cleanAlt)) {
      setError('Alternate mobile number must be a valid 10-digit Indian mobile number.');
      return;
    }
    if (!/^\d{6}$/.test(cleanPin)) {
      setError('Please enter a valid 6-digit PIN Code.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        ...form,
        mobileNumber: cleanMobile,
        alternateMobileNumber: cleanAlt,
        pincode: cleanPin,
        latitude:
          form.latitude !== '' && form.latitude !== null ? Number(form.latitude) : null,
        longitude:
          form.longitude !== '' && form.longitude !== null ? Number(form.longitude) : null,
      };

      if (isEdit) {
        await updateAddress(id, payload);
        navigate('/addresses');
      } else {
        await addAddress(payload);
        navigate(isOnboarding ? '/dashboard' : '/addresses');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (fetchingAddr) {
    return (
      <div className="container auth-page" style={{ textAlign: 'center' }}>
        <p>Loading address details...</p>
      </div>
    );
  }

  return (
    <div className="container auth-page">
      <div className="auth-card auth-card-wide">
        <div style={{ marginBottom: 16 }}>
          <Link
            to={isOnboarding ? '/dashboard' : '/addresses'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--green-700)',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            <FiArrowLeft size={16} />{' '}
            {isOnboarding ? 'Skip to Customer Dashboard' : 'Back to My Saved Addresses'}
          </Link>
        </div>

        <div className="auth-head" style={{ textAlign: 'left' }}>
          <h1>
            <FiMapPin size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            {isEdit ? 'Edit Delivery Address' : 'Add New Delivery Address'}
          </h1>
          <p>
            Use GPS reverse-geocoding to auto-populate your address or fill in the fields manually.
          </p>
        </div>

        {/* PART 5: Prominent USE MY CURRENT LOCATION Button */}
        <div className="addr-location-banner">
          <div>
            <strong style={{ color: 'var(--green-900)', display: 'block' }}>
              Auto-Detect Address via Browser GPS
            </strong>
            <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
              Populates street, locality, area, mandal, district, state, PIN code &amp; coordinates.
            </span>
          </div>
          <button
            type="button"
            className="addr-location-btn"
            onClick={handleUseCurrentLocation}
            disabled={locating}
          >
            <FiCrosshair size={18} />
            {locating ? 'Detecting GPS Location...' : '📍 USE MY CURRENT LOCATION'}
          </button>
        </div>

        {error && (
          <div className="account-alert" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="account-notice" role="status">
            {notice}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Address Label *</label>
            <div className="addr-labels-row" role="radiogroup" aria-label="Address Label">
              {LABELS.map((lbl) => (
                <button
                  key={lbl}
                  type="button"
                  className={`addr-label-chip ${
                    form.addressLabel === lbl ? 'addr-label-chip-active' : ''
                  }`.trim()}
                  onClick={() => setForm({ ...form, addressLabel: lbl })}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-recipient">Recipient Name *</label>
              <input
                id="af-recipient"
                name="recipientName"
                type="text"
                required
                value={form.recipientName}
                onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                placeholder="Full name of receiver"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-mobile">Mobile Number (10-digit) *</label>
              <input
                id="af-mobile"
                name="mobileNumber"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                value={form.mobileNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                  })
                }
                placeholder="9876543210"
              />
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-alt-mobile">Alternate Mobile Number (optional)</label>
              <input
                id="af-alt-mobile"
                name="alternateMobileNumber"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={form.alternateMobileNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
                    alternateMobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                  })
                }
                placeholder="Optional 10-digit number"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-door">Door / House / Flat Number</label>
              <input
                id="af-door"
                name="doorNumber"
                type="text"
                value={form.doorNumber}
                onChange={(e) => setForm({ ...form, doorNumber: e.target.value })}
                placeholder="e.g. Flat 302, Plot 14"
              />
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-apartment">Apartment / Building Name</label>
              <input
                id="af-apartment"
                name="apartmentName"
                type="text"
                value={form.apartmentName}
                onChange={(e) => setForm({ ...form, apartmentName: e.target.value })}
                placeholder="e.g. Green Valley Apartments"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-street">Street / Road</label>
              <input
                id="af-street"
                name="street"
                type="text"
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
                placeholder="e.g. Hitech City Main Road"
              />
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-locality">Locality / Colony</label>
              <input
                id="af-locality"
                name="locality"
                type="text"
                value={form.locality}
                onChange={(e) => setForm({ ...form, locality: e.target.value })}
                placeholder="e.g. Kavuri Hills"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-area">Area / Suburb</label>
              <input
                id="af-area"
                name="area"
                type="text"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                placeholder="e.g. Madhapur"
              />
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-mandal">Mandal / Taluk</label>
              <input
                id="af-mandal"
                name="mandal"
                type="text"
                value={form.mandal}
                onChange={(e) => setForm({ ...form, mandal: e.target.value })}
                placeholder="e.g. Serilingampally"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-district">District / City</label>
              <input
                id="af-district"
                name="district"
                type="text"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                placeholder="e.g. Hyderabad / Rangareddy"
              />
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-state">State</label>
              <input
                id="af-state"
                name="state"
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="e.g. Telangana"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-country">Country</label>
              <input
                id="af-country"
                name="country"
                type="text"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                placeholder="India"
              />
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-pincode">PIN Code (6-digit) *</label>
              <input
                id="af-pincode"
                name="pincode"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={form.pincode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                  })
                }
                placeholder="500081"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-instructions">Delivery Instructions</label>
              <input
                id="af-instructions"
                name="deliveryInstructions"
                type="text"
                value={form.deliveryInstructions}
                onChange={(e) => setForm({ ...form, deliveryInstructions: e.target.value })}
                placeholder="e.g. Ring bell once, leave with security"
              />
            </div>
          </div>

          <div className="auth-row-2">
            <div className="auth-field">
              <label htmlFor="af-lat">Latitude (GPS)</label>
              <input
                id="af-lat"
                name="latitude"
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="Auto-filled via GPS"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="af-lon">Longitude (GPS)</label>
              <input
                id="af-lon"
                name="longitude"
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="Auto-filled via GPS"
              />
            </div>
          </div>

          <label className="auth-checkbox-label">
            <input
              id="af-default"
              name="isDefault"
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            <span>Set as my Default Delivery Address</span>
          </label>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button type="submit" size="lg" disabled={busy}>
              <FiCheckCircle size={18} />
              {busy
                ? 'Saving Address...'
                : isEdit
                ? 'Update Delivery Address'
                : 'Save Delivery Address'}
            </Button>
            <Button
              to={isOnboarding ? '/dashboard' : '/addresses'}
              variant="outline"
              size="lg"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
