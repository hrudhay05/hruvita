export const categories = [
  { slug: 'tiffins', name: 'Tiffins', emoji: '🍛', image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80', tint: '#fff1e0' },
  { slug: 'fruit-bowls', name: 'Fruit Bowls', emoji: '🥣', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80', tint: '#fde8ec' },
  { slug: 'juices', name: 'Fresh Juices', emoji: '🍊', image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=400&q=80', tint: '#fff4d6' },
  { slug: 'smoothies', name: 'Smoothies', emoji: '🥤', image: 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=400&q=80', tint: '#f3e8fd' },
  { slug: 'dairy', name: 'Dairy', emoji: '🥛', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80', tint: '#e8f1fd' },
  { slug: 'healthy-drinks', name: 'Healthy Drinks', emoji: '🌾', image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80', tint: '#eef6e0' },
  { slug: 'combos', name: 'Combos', emoji: '🍱', image: 'https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=400&q=80', tint: '#e6f4ea' },
  { slug: 'lunch', name: 'Lunch', emoji: '🍚', image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80', tint: '#fdf0e0' },
  { slug: 'snacks', name: 'Snacks', emoji: '🥗', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80', tint: '#e4f5ee' },
];

export const categoryBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));
