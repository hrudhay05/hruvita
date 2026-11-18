import { useEffect, useMemo, useState } from 'react';
import { FiCheck, FiShoppingBag } from 'react-icons/fi';
import Button from './Button.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiRequest } from '../lib/api.js';
import { money } from '../lib/format.js';
import './BowlBuilderSection.css';

const DEFAULT_OPTIONS = {
  sizes: [
    { id: 'small', name: 'Small Bowl', weight: '250g', maxFruits: 3, basePrice: 99 },
    { id: 'medium', name: 'Medium Bowl', weight: '400g', maxFruits: 5, basePrice: 139 },
    { id: 'large', name: 'Large Bowl', weight: '600g', maxFruits: 7, basePrice: 179 },
  ],
  fruits: [
    { id: 'papaya', name: 'Fresh Papaya', price: 0, included: true },
    { id: 'watermelon', name: 'Red Watermelon', price: 0, included: true },
    { id: 'apple', name: 'Crisp Apple', price: 10, included: false },
    { id: 'banana', name: 'Sweet Banana', price: 0, included: true },
    { id: 'pomegranate', name: 'Ruby Pomegranate', price: 20, included: false },
    { id: 'pineapple', name: 'Honey Pineapple', price: 15, included: false },
    { id: 'mango', name: 'Seasonal Mango', price: 25, included: false },
    { id: 'kiwi', name: 'Green Kiwi', price: 30, included: false },
    { id: 'dragonfruit', name: 'Dragon Fruit', price: 35, included: false },
  ],
  toppings: [
    { id: 'chia', name: 'Soaked Chia Seeds', price: 15 },
    { id: 'pumpkin', name: 'Roasted Pumpkin Seeds', price: 20 },
    { id: 'almonds', name: 'Sliced Almonds', price: 25 },
    { id: 'walnuts', name: 'Kashmiri Walnuts', price: 30 },
    { id: 'granola', name: 'Honey Oat Granola', price: 25 },
    { id: 'flax', name: 'Toasted Flax Seeds', price: 15 },
  ],
  extras: [
    { id: 'honey', name: 'Raw Forest Honey Drizzle', price: 15 },
    { id: 'yogurt', name: 'Creamy Greek Yogurt', price: 25 },
    { id: 'mint-lime', name: 'Fresh Mint & Lime', price: 10 },
    { id: 'cinnamon', name: 'Ceylon Cinnamon Dust', price: 10 },
  ],
};

export default function BowlBuilderSection() {
  const { addCustomBowl } = useCart();
  const { showToast } = useToast();

  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [sizeId, setSizeId] = useState('medium');
  const [fruits, setFruits] = useState(['papaya', 'watermelon', 'pomegranate']);
  const [toppings, setToppings] = useState(['chia']);
  const [extras, setExtras] = useState(['honey']);

  useEffect(() => {
    apiRequest('/api/bowl-options')
      .then((data) => {
        if (data.bowlOptions?.sizes?.length) setOptions(data.bowlOptions);
      })
      .catch(() => {});
  }, []);

  const selectedSize =
    options.sizes.find((s) => s.id === sizeId) || options.sizes[1] || options.sizes[0];

  const toggleFruit = (id) => {
    setFruits((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= selectedSize.maxFruits) {
        showToast(`Up to ${selectedSize.maxFruits} fruits for ${selectedSize.name}.`, 'error');
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleItem = (setter, id) => {
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const summary = useMemo(() => {
    const pickedFruits = options.fruits.filter((f) => fruits.includes(f.id));
    const pickedToppings = options.toppings.filter((t) => toppings.includes(t.id));
    const pickedExtras = options.extras.filter((e) => extras.includes(e.id));

    const total =
      selectedSize.basePrice +
      pickedFruits.reduce((s, f) => s + f.price, 0) +
      pickedToppings.reduce((s, t) => s + t.price, 0) +
      pickedExtras.reduce((s, e) => s + e.price, 0);

    return {
      pickedFruits,
      pickedToppings,
      pickedExtras,
      total,
    };
  }, [options, selectedSize, fruits, toppings, extras]);

  const handleAddBowl = () => {
    if (fruits.length === 0) {
      showToast('Please select at least one fresh fruit for your bowl.', 'error');
      return;
    }

    const description = [
      ...summary.pickedFruits.map((f) => f.name),
      ...summary.pickedToppings.map((t) => t.name),
      ...summary.pickedExtras.map((e) => e.name),
    ].join(', ');

    addCustomBowl({
      sizeId: selectedSize.id,
      name: `Custom ${selectedSize.name} (${selectedSize.weight})`,
      summary: description,
      fruits,
      toppings,
      extras,
      unitPrice: summary.total,
      image:
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=700&q=80',
      qty: 1,
    });

    showToast('Custom fruit bowl added to cart.');
  };

  return (
    <div className="bowl-builder">
      <div className="bowl-steps">
        <div className="bowl-step-card">
          <div className="bowl-step-head">
            <h3>1. Choose Bowl Size</h3>
            <span>Freshly cut to order</span>
          </div>
          <div className="bowl-size-grid">
            {options.sizes.map((sz) => (
              <button
                key={sz.id}
                type="button"
                className={`bowl-size-btn ${sizeId === sz.id ? 'bowl-size-active' : ''}`.trim()}
                onClick={() => {
                  setSizeId(sz.id);
                  setFruits((prev) => prev.slice(0, sz.maxFruits));
                }}
              >
                <strong>{sz.name}</strong>
                <span>{sz.weight} &bull; up to {sz.maxFruits} fruits</span>
                <strong>{money(sz.basePrice)}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="bowl-step-card">
          <div className="bowl-step-head">
            <h3>2. Select Fresh Fruits</h3>
            <span>
              {fruits.length} / {selectedSize.maxFruits} selected
            </span>
          </div>
          <div className="bowl-chips-grid">
            {options.fruits.map((f) => {
              const active = fruits.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`bowl-chip ${active ? 'bowl-chip-active' : ''}`.trim()}
                  onClick={() => toggleFruit(f.id)}
                >
                  {active && <FiCheck size={14} />}
                  <span>{f.name}</span>
                  <span className="bowl-chip-price">
                    {f.price === 0 ? 'Included' : `+${money(f.price)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bowl-step-card">
          <div className="bowl-step-head">
            <h3>3. Add Superfood Toppings</h3>
            <span>Seeds, nuts &amp; crunch</span>
          </div>
          <div className="bowl-chips-grid">
            {options.toppings.map((t) => {
              const active = toppings.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`bowl-chip ${active ? 'bowl-chip-active' : ''}`.trim()}
                  onClick={() => toggleItem(setToppings, t.id)}
                >
                  {active && <FiCheck size={14} />}
                  <span>{t.name}</span>
                  <span className="bowl-chip-price">+{money(t.price)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bowl-step-card">
          <div className="bowl-step-head">
            <h3>4. Finish with Dressings &amp; Extras</h3>
            <span>Natural, zero refined sugar</span>
          </div>
          <div className="bowl-chips-grid">
            {options.extras.map((ex) => {
              const active = extras.includes(ex.id);
              return (
                <button
                  key={ex.id}
                  type="button"
                  className={`bowl-chip ${active ? 'bowl-chip-active' : ''}`.trim()}
                  onClick={() => toggleItem(setExtras, ex.id)}
                >
                  {active && <FiCheck size={14} />}
                  <span>{ex.name}</span>
                  <span className="bowl-chip-price">+{money(ex.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="bowl-summary-card">
        <img
          src="https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?auto=format&fit=crop&w=800&q=80"
          alt="Your custom fresh fruit bowl"
          className="bowl-summary-photo"
        />
        <div className="bowl-summary-body">
          <h3>Your Custom Bowl</h3>
          <div className="bowl-summary-list">
            <div className="bowl-summary-row">
              <span>Size</span>
              <strong>
                {selectedSize.name} ({selectedSize.weight})
              </strong>
            </div>
            <div className="bowl-summary-row">
              <span>Fruits</span>
              <strong>
                {summary.pickedFruits.map((f) => f.name).join(', ') || 'None selected'}
              </strong>
            </div>
            <div className="bowl-summary-row">
              <span>Toppings</span>
              <strong>
                {summary.pickedToppings.map((t) => t.name).join(', ') || 'None'}
              </strong>
            </div>
            <div className="bowl-summary-row">
              <span>Extras</span>
              <strong>
                {summary.pickedExtras.map((e) => e.name).join(', ') || 'None'}
              </strong>
            </div>
          </div>

          <div className="bowl-summary-total">
            <span>Bowl Total</span>
            <strong>{money(summary.total)}</strong>
          </div>

          <Button type="button" variant="primary" size="lg" onClick={handleAddBowl}>
            <FiShoppingBag size={18} /> Add Custom Bowl to Cart
          </Button>
        </div>
      </aside>
    </div>
  );
}
