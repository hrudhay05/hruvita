import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCheck } from 'react-icons/fi';
import Button from './Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './PlanCard.css';

export default function PlanCard({ plan, preferredBreakfast = 'Mixed Fruit Bowl', slotId = 'morning' }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const perDay = Math.round(plan.price / plan.days);

  const handleSubscribe = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          planId: plan.id,
          preferredBreakfast,
          slotId,
        }),
      });
      showToast(`Subscribed to ${plan.name}! View it in your Dashboard.`);
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message || 'Could not activate subscription.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`plan-card ${plan.popular ? 'plan-card-popular' : ''}`.trim()}>
      {(plan.popular || plan.badge) && <span className="plan-tag">{plan.badge || 'Most Popular'}</span>}
      <span className="plan-duration">{plan.days} Days</span>
      <h3 className="plan-name">{plan.name}</h3>
      <p className="plan-price">
        <strong>{money(plan.price)}</strong>
        <span>{money(perDay)} / morning delivery</span>
      </p>
      <ul className="plan-perks">
        {(plan.perks || []).map((p, idx) => (
          <li key={`${p}-${idx}`}>
            <FiCheck size={16} /> <span>{p}</span>
          </li>
        ))}
      </ul>
      <Button
        variant={plan.popular ? 'primary' : 'outline'}
        size="md"
        onClick={handleSubscribe}
        disabled={busy}
      >
        {busy ? 'Activating...' : 'Subscribe Now'}
      </Button>
    </article>
  );
}
