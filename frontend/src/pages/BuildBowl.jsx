import BowlBuilderSection from '../components/BowlBuilderSection.jsx';

export default function BuildBowl() {
  return (
    <div className="container" style={{ padding: '40px 0 64px' }}>
      <header style={{ marginBottom: 32, maxWidth: 640 }}>
        <span className="home-eyebrow">Custom Fruit Bowls</span>
        <h1 style={{ fontSize: '2.35rem', color: 'var(--primary)', marginTop: 12 }}>
          Build Your Own Fruit Bowl
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: '1.02rem' }}>
          Select your preferred bowl size, seasonal hand-cut fruits, superfood seeds and natural
          drizzle. Price updates live as you customize.
        </p>
      </header>
      <BowlBuilderSection />
    </div>
  );
}
