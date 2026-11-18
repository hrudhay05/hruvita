export default function LegalPage({ type = 'privacy' }) {
  const content = {
    privacy: {
      title: 'Privacy Policy',
      updated: 'Updated November 2026',
      sections: [
        {
          heading: '1. Information We Collect',
          body: 'We collect only the information required to fulfill your food orders and subscriptions: your name, email address, mobile number, delivery addresses, and order history.',
        },
        {
          heading: '2. Password & Payment Security',
          body: 'Your password is stored exclusively as a strong bcrypt cryptographic hash. We never store card numbers, UPI PINs, or CVV details on our servers.',
        },
        {
          heading: '3. Location Permission',
          body: 'GPS coordinates are requested only when you click Use My Current Location and are used solely to populate your delivery address.',
        },
      ],
    },
    terms: {
      title: 'Terms & Conditions',
      updated: 'Updated November 2026',
      sections: [
        {
          heading: '1. Ordering & Pricing',
          body: 'All menu prices, discounts, taxes, and delivery charges are computed on our server at checkout. Availability depends on fresh kitchen stock.',
        },
        {
          heading: '2. Daily Subscriptions',
          body: 'Breakfast subscriptions may be paused or resumed prior to the daily cut-off hour from your Customer Dashboard.',
        },
        {
          heading: '3. Account Responsibility',
          body: 'Customers are responsible for maintaining accurate delivery addresses and contact numbers for timely slot deliveries.',
        },
      ],
    },
    refund: {
      title: 'Refund & Cancellation Policy',
      updated: 'Updated November 2026',
      sections: [
        {
          heading: '1. Order Cancellations',
          body: 'Orders may be cancelled before kitchen preparation begins. Stock is restored automatically and eligible refunds are initiated immediately.',
        },
        {
          heading: '2. Refund Timelines',
          body: 'Approved refunds for online payments are credited back to the original payment method within 5–7 business days.',
        },
        {
          heading: '3. Quality Assurance',
          body: 'If an item arrives damaged or incorrect, please contact our support team within 2 hours of delivery for a prompt resolution.',
        },
      ],
    },
  }[type];

  return (
    <div className="container" style={{ padding: '48px 0 72px', maxWidth: 820 }}>
      <h1 style={{ fontSize: '2.25rem', color: 'var(--primary)' }}>{content.title}</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 6, marginBottom: 28 }}>
        {content.updated}
      </p>
      <div style={{ display: 'grid', gap: 22 }}>
        {content.sections.map((s) => (
          <section key={s.heading} className="account-card">
            <h2 style={{ fontSize: '1.2rem', marginBottom: 8 }}>{s.heading}</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
