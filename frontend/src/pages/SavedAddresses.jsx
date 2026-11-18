import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiArrowLeft,
  FiCheckCircle,
  FiEdit2,
  FiMapPin,
  FiPlus,
  FiStar,
  FiTrash2,
} from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthFlow.css';

export default function SavedAddresses() {
  const navigate = useNavigate();
  const {
    user,
    loading,
    addresses,
    selectedAddressId,
    setSelectedAddressId,
    fetchAddresses,
    setDefaultAddress,
    removeAddress,
  } = useAuth();

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
      return;
    }
    if (user) {
      fetchAddresses();
    }
  }, [user, loading, navigate, fetchAddresses]);

  const handleSetDefault = async (addr) => {
    setError('');
    setNotice('');
    setBusyId(addr.id);
    try {
      await setDefaultAddress(addr.id);
      setNotice(`"${addr.addressLabel}" (${addr.recipientName}) is now your default delivery address.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  const handleDelete = async (addr) => {
    if (!window.confirm(`Delete "${addr.addressLabel}" address for ${addr.recipientName}?`)) {
      return;
    }
    setError('');
    setNotice('');
    setBusyId(addr.id);
    try {
      await removeAddress(addr.id);
      setNotice('Address deleted successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="container auth-page">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <div>
          <Link
            to="/dashboard"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--green-700)',
              fontWeight: 600,
              fontSize: '0.9rem',
              marginBottom: 6,
            }}
          >
            <FiArrowLeft size={16} /> Back to Customer Dashboard
          </Link>
          <h1 style={{ fontSize: '1.8rem', color: 'var(--green-900)' }}>
            <FiMapPin size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            My Saved Addresses ({addresses.length})
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.92rem' }}>
            Save multiple delivery addresses (Home, Office, Hostel, Other) and select any address for your order.
          </p>
        </div>

        <Button to="/addresses/new" size="md">
          <FiPlus size={18} /> Add New Address
        </Button>
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

      {addresses.length === 0 ? (
        <div className="account-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2>No Saved Addresses Yet</h2>
          <p style={{ color: 'var(--muted)', margin: '8px 0 20px' }}>
            Add your Home, Office, or Hostel address using GPS auto-detect or manual entry.
          </p>
          <Button to="/addresses/new">
            <FiPlus size={18} /> Add Your First Address
          </Button>
        </div>
      ) : (
        <div className="addr-cards-grid">
          {addresses.map((addr) => {
            const isSelected = selectedAddressId === addr.id;
            const fullStreet = [
              addr.doorNumber,
              addr.apartmentName,
              addr.street,
              addr.locality,
              addr.area,
            ]
              .filter(Boolean)
              .join(', ');
            const fullRegion = [addr.mandal, addr.district, addr.state, addr.country]
              .filter(Boolean)
              .join(', ');

            return (
              <article
                key={addr.id}
                className={`addr-card ${isSelected ? 'addr-card-selected' : ''}`.trim()}
              >
                <div className="addr-card-top">
                  <div className="addr-badge-group">
                    <span className="addr-type-pill">{addr.addressLabel}</span>
                    {addr.isDefault && <span className="addr-default-pill">Default</span>}
                    {isSelected && (
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: 'var(--green-700)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <FiCheckCircle size={13} /> Selected for Delivery
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <strong style={{ fontSize: '1.05rem', color: 'var(--green-900)' }}>
                    {addr.recipientName}
                  </strong>
                  <div style={{ fontSize: '0.86rem', color: 'var(--muted)' }}>
                    Mobile: {addr.mobileNumber}
                    {addr.alternateMobileNumber ? ` / Alt: ${addr.alternateMobileNumber}` : ''}
                  </div>
                </div>

                <div style={{ fontSize: '0.9rem', color: 'var(--ink)', lineHeight: 1.45 }}>
                  {fullStreet && <div>{fullStreet}</div>}
                  {fullRegion && <div>{fullRegion}</div>}
                  <div>
                    <strong>PIN Code: {addr.pincode}</strong>
                  </div>
                  {addr.latitude != null && addr.longitude != null && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 2 }}>
                      GPS: {addr.latitude}, {addr.longitude}
                    </div>
                  )}
                  {addr.deliveryInstructions && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                      Note: {addr.deliveryInstructions}
                    </div>
                  )}
                </div>

                <div className="addr-actions-bar">
                  <button
                    type="button"
                    className="admin-mini-btn"
                    onClick={() => {
                      setSelectedAddressId(addr.id);
                      setNotice(`Selected "${addr.addressLabel}" address for delivery.`);
                    }}
                  >
                    <FiCheckCircle size={13} />{' '}
                    {isSelected ? 'Selected' : 'Select Address'}
                  </button>

                  {!addr.isDefault && (
                    <button
                      type="button"
                      className="admin-mini-btn"
                      onClick={() => handleSetDefault(addr)}
                      disabled={busyId === addr.id}
                    >
                      <FiStar size={13} /> Set Default
                    </button>
                  )}

                  <Link to={`/addresses/${addr.id}/edit`} className="admin-mini-btn">
                    <FiEdit2 size={13} /> Edit
                  </Link>

                  <button
                    type="button"
                    className="admin-mini-btn admin-mini-danger"
                    onClick={() => handleDelete(addr)}
                    disabled={busyId === addr.id}
                  >
                    <FiTrash2 size={13} /> Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
