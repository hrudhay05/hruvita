import './Skeleton.css';

export function SkeletonLine({ width = '100%', height = 14, style = {} }) {
  return <div className="hruvita-shimmer hruvita-skel-line" style={{ width, height, ...style }} />;
}

export function ProductSkeletonCard() {
  return (
    <div className="hruvita-skel-card" aria-hidden="true">
      <div className="hruvita-shimmer hruvita-skel-img" />
      <SkeletonLine width="78%" height={16} />
      <SkeletonLine width="56%" height={12} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <SkeletonLine width="34%" height={18} />
        <SkeletonLine width="30%" height={32} style={{ borderRadius: 999 }} />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 4, className = 'home-cards' }) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <ProductSkeletonCard key={i} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="container hruvita-page-skel" aria-busy="true" aria-label="Loading page">
      <SkeletonLine width="36%" height={28} />
      <SkeletonLine width="58%" height={14} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
          marginTop: 8,
        }}
      >
        {[1, 2, 3, 4].map((n) => (
          <ProductSkeletonCard key={n} />
        ))}
      </div>
    </div>
  );
}
