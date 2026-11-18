import { Link } from 'react-router-dom';
import { brand } from '../config/brand.js';
import './Logo.css';

export default function Logo({ light = false }) {
  return (
    <Link to="/" className={`logo ${light ? 'logo-light' : ''}`.trim()} aria-label={`${brand.name} home`}>
      <span className="logo-mark">{brand.name[0]}</span>
      <span className="logo-name">{brand.name}</span>
    </Link>
  );
}
