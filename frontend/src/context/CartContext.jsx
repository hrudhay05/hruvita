import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

const CartContext = createContext(null);
const KEY = 'hruvita_cart';
const BOWLS_KEY = 'hruvita_custom_bowls';

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function loadBowls() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOWLS_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'add':
      return {
        ...state,
        items: { ...state.items, [action.id]: (state.items[action.id] || 0) + (action.qty || 1) },
      };
    case 'set': {
      const nextItems = { ...state.items };
      if (action.qty <= 0) delete nextItems[action.id];
      else nextItems[action.id] = action.qty;
      return { ...state, items: nextItems };
    }
    case 'addBowl': {
      const bowl = {
        ...action.bowl,
        id: action.bowl.id || `custom-bowl-${Date.now().toString(36)}`,
        qty: action.bowl.qty || 1,
      };
      return { ...state, customBowls: [...state.customBowls, bowl] };
    }
    case 'setBowlQty': {
      const nextBowls =
        action.qty <= 0
          ? state.customBowls.filter((b) => b.id !== action.id)
          : state.customBowls.map((b) => (b.id === action.id ? { ...b, qty: action.qty } : b));
      return { ...state, customBowls: nextBowls };
    }
    case 'clear':
      return { items: {}, customBowls: [] };
    default:
      return state;
  }
}

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    items: loadItems(),
    customBowls: loadBowls(),
  }));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.items));
      localStorage.setItem(BOWLS_KEY, JSON.stringify(state.customBowls));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const value = useMemo(() => {
    const itemCount = Object.values(state.items).reduce((a, b) => a + b, 0);
    const bowlCount = state.customBowls.reduce((sum, b) => sum + (b.qty || 1), 0);
    return {
      items: state.items,
      customBowls: state.customBowls,
      count: itemCount + bowlCount,
      add: (id, qty = 1) => dispatch({ type: 'add', id, qty }),
      setQty: (id, qty) => dispatch({ type: 'set', id, qty }),
      addCustomBowl: (bowl) => dispatch({ type: 'addBowl', bowl }),
      setCustomBowlQty: (id, qty) => dispatch({ type: 'setBowlQty', id, qty }),
      clear: () => dispatch({ type: 'clear' }),
    };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
