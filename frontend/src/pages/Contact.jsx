import { useState } from 'react';
import { FiClock, FiMail, FiMapPin, FiPhone } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function Contact() {
  const { settings } = useCatalog();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    showToast('Message received. Our team will get back to you shortly.');
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <div className="container" style={{ padding: '48px 0 72px', maxWidth: 960 }}>
      <span className="home-eyebrow">Get in Touch</span>
      <h1 style={{ fontSize: '2.4rem', color: 'var(--primary)', marginTop: 12 }}>Contact Us</h1>
      <p style={{ color: 'var(--muted)', marginTop: 8, maxWidth: 560 }}>
        Questions about daily breakfast subscriptions, bulk orders, or delivery slots? Reach out to
        our kitchen support team.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: 28,
          marginTop: 32,
          alignItems: 'start',
        }}
      >
        <div className="account-card" style={{ display: 'grid', gap: 16 }}>
          <h2>Kitchen Support</h2>
          <p style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiPhone size={18} style={{ color: 'var(--primary)' }} /> {settings.phone}
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiMail size={18} style={{ color: 'var(--primary)' }} /> {settings.email}
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiMapPin size={18} style={{ color: 'var(--primary)' }} /> {settings.city}, India
          </p>
          <p style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiClock size={18} style={{ color: 'var(--primary)' }} /> {settings.hours}
          </p>
        </div>

        <form className="account-card auth-form" onSubmit={handleSubmit}>
          <h2>Send a Message</h2>
          <div className="auth-field">
            <label htmlFor="contact-name">Your Name</label>
            <input
              id="contact-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="contact-email">Email Address</label>
            <input
              id="contact-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="contact-msg">Message</label>
            <textarea
              id="contact-msg"
              rows={4}
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="How can we help you?"
            />
          </div>
          <Button type="submit">Send Message</Button>
        </form>
      </div>
    </div>
  );
}
