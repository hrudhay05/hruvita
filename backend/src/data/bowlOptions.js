export const bowlOptions = {
  sizes: [
    { id: 'small', name: 'Small Bowl', weight: '250g', maxFruits: 3, basePrice: 99 },
    { id: 'medium', name: 'Medium Bowl', weight: '400g', maxFruits: 5, basePrice: 139 },
    { id: 'large', name: 'Large Bowl', weight: '600g', maxFruits: 7, basePrice: 179 },
  ],
  fruits: [
    { id: 'papaya', name: 'Fresh Papaya', price: 0, included: true },
    { id: 'watermelon', name: 'Red Watermelon', price: 0, included: true },
    { id: 'apple', name: 'Crisp Apple', price: 10, included: false },
    { id: 'banana', name: 'Sweet Banana', price: 0, included: true },
    { id: 'pomegranate', name: 'Ruby Pomegranate', price: 20, included: false },
    { id: 'pineapple', name: 'Honey Pineapple', price: 15, included: false },
    { id: 'mango', name: 'Seasonal Mango', price: 25, included: false },
    { id: 'kiwi', name: 'Green Kiwi', price: 30, included: false },
    { id: 'dragonfruit', name: 'Dragon Fruit', price: 35, included: false },
  ],
  toppings: [
    { id: 'chia', name: 'Soaked Chia Seeds', price: 15 },
    { id: 'pumpkin', name: 'Roasted Pumpkin Seeds', price: 20 },
    { id: 'almonds', name: 'Sliced Almonds', price: 25 },
    { id: 'walnuts', name: 'Kashmiri Walnuts', price: 30 },
    { id: 'granola', name: 'Honey Oat Granola', price: 25 },
    { id: 'flax', name: 'Toasted Flax Seeds', price: 15 },
  ],
  extras: [
    { id: 'honey', name: 'Raw Forest Honey Drizzle', price: 15 },
    { id: 'yogurt', name: 'Creamy Greek Yogurt', price: 25 },
    { id: 'mint-lime', name: 'Fresh Mint & Lime', price: 10 },
    { id: 'cinnamon', name: 'Ceylon Cinnamon Dust', price: 10 },
  ],
};

export function computeCustomBowlPrice(bowlSpec = {}) {
  const size = bowlOptions.sizes.find((s) => s.id === bowlSpec.sizeId) || bowlOptions.sizes[1];
  const fruitIds = Array.isArray(bowlSpec.fruits) ? bowlSpec.fruits : [];
  const toppingIds = Array.isArray(bowlSpec.toppings) ? bowlSpec.toppings : [];
  const extraIds = Array.isArray(bowlSpec.extras) ? bowlSpec.extras : [];

  const chosenFruits = bowlOptions.fruits.filter((f) => fruitIds.includes(f.id));
  const chosenToppings = bowlOptions.toppings.filter((t) => toppingIds.includes(t.id));
  const chosenExtras = bowlOptions.extras.filter((e) => extraIds.includes(e.id));

  const fruitsCost = chosenFruits.reduce((sum, f) => sum + f.price, 0);
  const toppingsCost = chosenToppings.reduce((sum, t) => sum + t.price, 0);
  const extrasCost = chosenExtras.reduce((sum, e) => sum + e.price, 0);

  const unitPrice = size.basePrice + fruitsCost + toppingsCost + extrasCost;
  const parts = [
    ...chosenFruits.map((f) => f.name),
    ...chosenToppings.map((t) => t.name),
    ...chosenExtras.map((e) => e.name),
  ];

  return {
    name: `Custom ${size.name} (${size.weight})`,
    summary: parts.join(', ') || 'Chef selection of fresh fruits',
    unitPrice,
    size,
  };
}
