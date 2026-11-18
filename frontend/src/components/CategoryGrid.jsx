import { Link } from 'react-router-dom';
import { useCatalog } from '../context/CatalogContext.jsx';
import './CategoryGrid.css';

export default function CategoryGrid() {
  const { categories } = useCatalog();

  return (
    <ul className="category-grid">
      {categories.map((c) => (
        <li key={c.slug}>
          <Link to={`/menu?category=${c.slug}`} className="category-card">
            <span className="category-thumb" style={{ background: c.tint }}>
              {c.image ? (
                <img src={c.image} alt={c.name} loading="lazy" />
              ) : (
                <span aria-hidden="true">{c.emoji}</span>
              )}
            </span>
            <span className="category-name">{c.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
