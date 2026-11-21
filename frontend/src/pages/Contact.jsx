import { useState } from 'react';
import { FiClock, FiMail, FiMapPin, FiPhone } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import './Contact.css';

export default function Contact() {
  const { settings } = useCatalog();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/api/contact', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      showToast('Message sent! Our kitchen support team has received it.');
      setForm({ name: '', email: '', message: '' });
    } catch (err) {
      showToast(err.message || 'Could not send message.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container contact-page">
      <span className="contact-eyebrow">Get in Touch</span>
      <h1>Contact Us</h1>
      <p className="contact-subtitle">
        Questions about daily breakfast subscriptions, bulk orders, or delivery slots? Reach out to
        our kitchen support team.
      </p>

      <div className="contact-grid">
        <div className="contact-card">
          <h2>Kitchen Support</h2>
          <p className="contact-info-row">
            <FiPhone size={18} className="contact-info-icon" /> {settings.phone}
          </p>
          <p className="contact-info-row">
            <FiMail size={18} className="contact-info-icon" /> {settings.email}
          </p>
          <p className="contact-info-row">
            <FiMapPin size={18} className="contact-info-icon" /> {settings.city}, India
          </p>
          <p className="contact-info-row">
            <FiClock size={18} className="contact-info-icon" /> {settings.hours}
          </p>
        </div>

        <form className="contact-card" onSubmit={handleSubmit}>
          <h2>Send a Message</h2>
          <div className="contact-field">
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
          <div className="contact-field">
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
          <div className="contact-field">
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
          <Button type="submit" disabled={busy}>
            {busy ? 'Sending...' : 'Send Message'}
          </Button>
        </form>
      </div>
    </div>
  );
}
