// @ts-check
export const CDN = {
  marked: 'https://cdn.jsdelivr.net/npm/marked@15/+esm',
  purify: 'https://cdn.jsdelivr.net/npm/dompurify@3/+esm',
  mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
  elk: 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs',
  cytoscape: 'https://cdn.jsdelivr.net/npm/cytoscape@3/+esm',
  hljs: 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/es/highlight.min.js',
  lucide: 'https://cdn.jsdelivr.net/npm/lucide@0/+esm',
};

/** @type {Map<string, Promise<any>>} */
const cache = new Map();

/** @param {keyof typeof CDN} name */
export function load(name) {
  if (!cache.has(name)) {
    cache.set(name, (async () => {
      try {
        const module = await import(CDN[name]);
        return module.default ?? module;
      } catch {
        return null;
      }
    })());
  }
  return cache.get(name);
}
