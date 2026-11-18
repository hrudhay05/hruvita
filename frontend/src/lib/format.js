import { brand } from '../config/brand.js';

export const money = (n) => `${brand.currency}${Number(n).toLocaleString('en-IN')}`;

export const unitPrice = (p) => p.discountPrice ?? p.price;

export const discountPercent = (p) =>
  p.discountPrice ? Math.round(((p.price - p.discountPrice) / p.price) * 100) : 0;
