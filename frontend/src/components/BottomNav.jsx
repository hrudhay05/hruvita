import { NavLink } from 'react-router-dom';
import { FiCalendar, FiGrid, FiHome, FiShoppingCart, FiUser } from 'react-icons/fi';
import { useCart } from '../context/CartContext.jsx';
import './BottomNav.css';

export default function BottomNav() {
  const { count } = useCart();

  return (
    <nav className="bottom-nav" aria-label="Quick navigation">
      <NavLink to="/" end className="bottom-nav-item">
        <FiHome size={20} />
        <span>Home</span>
      </NavLink>
      <NavLink to="/menu" className="bottom-nav-item">
        <FiGrid size={20} />
        <span>Menu</span>
      </NavLink>
      <NavLink to="/subscriptions" className="bottom-nav-item">
        <FiCalendar size={20} />
        <span>Plans</span>
      </NavLink>
      <NavLink to="/cart" className="bottom-nav-item">
        <span className="bottom-nav-icon">
          <FiShoppingCart size={20} />
          {count > 0 && <b className="bottom-nav-badge">{count}</b>}
        </span>
        <span>Cart</span>
      </NavLink>
      <NavLink to="/account" className="bottom-nav-item">
        <FiUser size={20} />
        <span>Account</span>
      </NavLink>
    </nav>
  );
}
