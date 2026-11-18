import Button from '../components/Button.jsx';
import { useCatalog } from '../context/CatalogContext.jsx';

export default function About() {
  const { settings } = useCatalog();

  return (
    <div className="container" style={{ padding: '48px 0 72px', maxWidth: 920 }}>
      <span className="home-eyebrow">Our Story</span>
      <h1 style={{ fontSize: '2.5rem', color: 'var(--primary)', marginTop: 14 }}>
        Fresh Food Made Simple for Busy Mornings
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '1.06rem', marginTop: 14, lineHeight: 1.75 }}>
        {settings.name} started in {settings.city} with a straightforward promise: healthy eating
        should never feel complicated. Every morning before sunrise, our kitchen washes, cuts, and
        steams fresh seasonal fruits, cold-pressed juices, and wholesome South Indian tiffins with
        zero preservatives and zero refined shortcuts.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 20,
          margin: '36px 0',
        }}
      >
        <div className="home-why-card">
          <h3>Farm-Fresh Sourcing</h3>
          <p>We select ripe seasonal produce daily so every fruit bowl tastes crisp and naturally sweet.</p>
        </div>
        <div className="home-why-card">
          <h3>Transparent Nutrition</h3>
          <p>Clear ingredient lists, allergen labels, and customizable bowls so you always know what you eat.</p>
        </div>
        <div className="home-why-card">
          <h3>Punctual Slot Delivery</h3>
          <p>Reliable morning, afternoon, and evening delivery windows built around your daily schedule.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Button to="/menu" size="lg">
          Explore Menu
        </Button>
        <Button to="/build-bowl" variant="accent" size="lg">
          Build Your Bowl
        </Button>
      </div>
    </div>
  );
}
