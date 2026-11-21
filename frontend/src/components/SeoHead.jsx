import { useEffect } from 'react';

function upsertMeta(attrName, attrValue, content) {
  if (!content || typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(url) {
  if (!url || typeof document === 'undefined') return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', url);
}

export default function SeoHead({
  title,
  description,
  path = '',
  image = '',
  jsonLd = null,
}) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
      upsertMeta('name', 'twitter:description', description);
    }
    if (title) {
      upsertMeta('property', 'og:title', title);
      upsertMeta('name', 'twitter:title', title);
    }
    if (image) {
      upsertMeta('property', 'og:image', image);
      upsertMeta('name', 'twitter:image', image);
    }
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const canonical = origin ? `${origin}${path || window.location.pathname}` : '';
    if (canonical) {
      upsertCanonical(canonical);
      upsertMeta('property', 'og:url', canonical);
    }

    let scriptEl = null;
    if (jsonLd) {
      scriptEl = document.createElement('script');
      scriptEl.type = 'application/ld+json';
      scriptEl.id = 'hruvita-page-jsonld';
      const existing = document.getElementById('hruvita-page-jsonld');
      if (existing) existing.remove();
      scriptEl.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(scriptEl);
    }
    return () => {
      if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    };
  }, [title, description, path, image, jsonLd]);

  return null;
}
