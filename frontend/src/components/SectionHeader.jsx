import { Link } from 'react-router-dom';
import './SectionHeader.css';

export default function SectionHeader({ title, subtitle, to, linkLabel = 'View all' }) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-sub">{subtitle}</p>}
      </div>
      {to && (
        <Link to={to} className="section-link">
          {linkLabel} &rarr;
        </Link>
      )}
    </div>
  );
}
