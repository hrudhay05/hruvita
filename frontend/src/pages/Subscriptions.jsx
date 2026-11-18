import { useState } from 'react';
import PlanCard from '../components/PlanCard.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';
import './Subscriptions.css';

const BREAKFAST_CHOICES = [
  'Mixed Fruit Bowl',
  'Exotic Seasonal Fruit Bowl',
  'Idli (3 pcs) + Fresh Orange Juice',
  'Masala Dosa',
  'Ghee Ven Pongal',
  'Protein Sprouts & Pomegranate Salad',
];

export default function Subscriptions() {
  const { plans } = useCatalog();
  const [preferredBreakfast, setPreferredBreakfast] = useState(BREAKFAST_CHOICES[0]);
  const [slotId, setSlotId] = useState('morning');

  return (
    <div className="container" style={{ paddingBottom: 56 }}>
      <header className="subscriptions-head">
        <span className="home-eyebrow">Daily Wellness Routine</span>
        <h1 style={{ marginTop: 12 }}>Daily Breakfast Subscriptions</h1>
        <p>
          Select your preferred morning meal and delivery slot. You can pause or resume your plan
          anytime directly from your Customer Dashboard.
        </p>
      </header>

      <div
        className="account-card"
        style={{
          marginBottom: 32,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        <div className="auth-field">
          <label htmlFor="sub-breakfast">Preferred Morning Meal</label>
          <select
            id="sub-breakfast"
            value={preferredBreakfast}
            onChange={(e) => setPreferredBreakfast(e.target.value)}
          >
            {BREAKFAST_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </div>

        <div className="auth-field">
          <label htmlFor="sub-slot">Preferred Delivery Slot</label>
          <select id="sub-slot" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
            <option value="morning">Morning Slot (6:30 AM – 9:00 AM)</option>
            <option value="afternoon">Afternoon Slot (12:30 PM – 2:30 PM)</option>
            <option value="evening">Evening Slot (6:30 PM – 8:30 PM)</option>
          </select>
        </div>
      </div>

      <div className="subscriptions-plans">
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            preferredBreakfast={preferredBreakfast}
            slotId={slotId}
          />
        ))}
      </div>
    </div>
  );
}
