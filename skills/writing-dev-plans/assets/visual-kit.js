/* visual-kit.js: interaction for writing-dev-plans visual documents.
   Injected by visual-status.mjs (--init, --stamp); edits inside the kit block are overwritten.
   Markup contract (see references/visual-guide.md):
     [data-src='selector']      placeholder for verbatim source; --stamp stores the selected Markdown in
                                <script id="plan-sources">, this script fills and renders it (leave the element empty)
     .diagram[data-links] > pre.mermaid   rendered, pan/zoom/full-screen toolbar added; links "NodeId:key ..."
     [data-open=key]            opens the drawer with <template data-sum=key [data-title]>
     [data-tabs] [data-tab=x] / [data-panel=x]   tabs
     .toc (empty = built from main section[id] > h2), [data-theme-toggle] */
((start) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start())(() => {
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const zh = /^zh/i.test(document.documentElement.lang);
  const t = zh
    ? { in: '放大', out: '缩小', fit: '适应', full: '全屏', exit: '退出全屏', hint: '⌘/Ctrl + 滚轮缩放 · 拖动平移', failed: '图表渲染失败，显示源码。', close: '关闭', light: '浅色', dark: '暗色' }
    : { in: 'Zoom in', out: 'Zoom out', fit: 'Fit', full: 'Full screen', exit: 'Exit full screen', hint: '⌘/Ctrl + wheel to zoom · drag to pan', failed: 'Diagram failed to render; showing source.', close: 'Close', light: 'Light', dark: 'Dark' };
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const URLS = {
    marked: 'https://cdn.jsdelivr.net/npm/marked@15/+esm',
    purify: 'https://cdn.jsdelivr.net/npm/dompurify@3/+esm',
    hljs: 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/es/highlight.min.js',
    mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
    elk: 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs',
  };
  const cache = {};
  // Libraries load on first use; when the CDN is unreachable the page keeps its plain text.
  const lib = name => (cache[name] ??= import(URLS[name]).then(m => m.default ?? m).catch(() => null));

  // ---- source markdown: the stamped map is the only source of truth for [data-src] content ----
  const SOURCES = (() => { try { return JSON.parse(document.getElementById('plan-sources')?.textContent || '{}'); } catch { return {}; } })();
  async function renderSources(root) {
    const els = $$('[data-src]:not([data-done])', root);
    for (const el of els) { el.textContent = SOURCES[el.dataset.src] ?? ''; el.classList.add('md'); }
    if (!els.length) return;
    const [marked, purify] = await Promise.all([lib('marked'), lib('purify')]);
    if (!marked || !purify) return;
    for (const el of els) {
      el.innerHTML = purify.sanitize(marked.parse(SOURCES[el.dataset.src] ?? ''));
      el.dataset.done = '';
      for (const code of $$('pre > code.language-mermaid', el)) {
        const box = document.createElement('div');
        box.className = 'diagram';
        const pre = document.createElement('pre');
        pre.className = 'mermaid';
        pre.textContent = code.textContent;
        box.append(pre);
        code.parentElement.replaceWith(box);
      }
    }
  }
  async function highlight(root) {
    const blocks = $$('pre code[class*="language-"]:not(.hljs)', root);
    if (!blocks.length) return;
    const hljs = await lib('hljs');
    if (!hljs) return;
    for (const code of blocks) {
      const lang = [...code.classList].find(c => c.startsWith('language-')).slice(9);
      if (!hljs.getLanguage(lang)) continue;
      code.innerHTML = hljs.highlight(code.textContent, { language: lang }).value;
      code.classList.add('hljs');
    }
  }

  // ---- diagrams ----
  let mermaidSeq = 0;
  async function renderDiagrams(root) {
    const boxes = $$('.diagram', root).filter(box => box.querySelector('pre.mermaid'));
    if (!boxes.length) return;
    const [mermaid, elk] = await Promise.all([lib('mermaid'), lib('elk')]);
    if (!mermaid) return;
    if (elk && !cache.elkRegistered) { mermaid.registerLayoutLoaders(elk); cache.elkRegistered = true; }
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'base', layout: elk ? 'elk' : 'dagre', fontFamily: cssVar('--sans'),
      flowchart: { htmlLabels: true, padding: 10 }, sequence: { mirrorActors: false, actorMargin: 40 },
      themeVariables: {
        fontSize: '13px', primaryColor: cssVar('--raised'), primaryTextColor: cssVar('--ink'), primaryBorderColor: cssVar('--line-strong'), lineColor: cssVar('--muted'),
        secondaryColor: cssVar('--paper'), tertiaryColor: cssVar('--bg'), clusterBkg: cssVar('--paper'), clusterBorder: cssVar('--line'), edgeLabelBackground: cssVar('--paper'),
        actorBkg: cssVar('--raised'), actorBorder: cssVar('--line-strong'), actorTextColor: cssVar('--ink'), actorLineColor: cssVar('--line-strong'), signalColor: cssVar('--muted'), signalTextColor: cssVar('--ink'),
        noteBkgColor: cssVar('--wash'), noteTextColor: cssVar('--ink'), noteBorderColor: cssVar('--line-strong'), labelBoxBkgColor: cssVar('--wash'), labelBoxBorderColor: cssVar('--line-strong'), labelTextColor: cssVar('--ink'), loopTextColor: cssVar('--muted'),
      },
    });
    for (const box of boxes) {
      const pre = box.querySelector('pre.mermaid');
      pre.dataset.source ??= pre.textContent;
      box.querySelector(':scope > .kit-error')?.remove();
      try {
        const { svg } = await mermaid.render(`kit-mm-${++mermaidSeq}`, pre.dataset.source);
        pre.innerHTML = svg;
        pre.dataset.done = '';
        bindNodes(box);
        panZoom(box);
        toolbar(box);
      } catch {
        pre.textContent = pre.dataset.source;
        delete pre.dataset.done;
        const p = document.createElement('p');
        p.className = 'kit-error';
        p.textContent = t.failed;
        box.prepend(p);
      }
    }
  }
  function toolbar(box) {
    if (box._toolbar) return;
    const bar = document.createElement('span');
    bar.className = 'kit-zoom';
    const fig = box.closest('.fig');
    const caption = fig && fig.querySelectorAll('.diagram').length === 1 ? fig.querySelector(':scope > figcaption') : null;
    bar.innerHTML = (caption ? `<span class="kit-zoom-hint">${t.hint}</span>` : '')
      + `<button type="button" data-zoom="out" aria-label="${t.out}">−</button><button type="button" data-zoom="in" aria-label="${t.in}">+</button>`
      + `<button type="button" data-zoom="fit">${t.fit}</button><button type="button" data-zoom="full">${t.full}</button>`;
    bar._box = box;
    (caption ?? box).append(bar);
    box._toolbar = bar;
  }
  function bindNodes(box) {
    if (!box.dataset.links) return;
    const links = Object.fromEntries(box.dataset.links.trim().split(/\s+/).map(pair => { const i = pair.indexOf(':'); return [pair.slice(0, i), pair.slice(i + 1)]; }));
    for (const g of $$('g.node', box)) {
      const id = /-flowchart-(.+)-\d+$/.exec(g.id)?.[1];
      if (!id || !links[id]) continue;
      g.classList.add('kit-node');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', g.textContent.trim());
      g.dataset.open = links[id];
    }
  }
  // Pan and zoom by editing the svg viewBox.
  function panZoom(box) {
    const svg = box.querySelector('pre.mermaid > svg');
    if (!svg) return;
    const b = svg.viewBox.baseVal, home = [b.x, b.y, b.width, b.height];
    let vb = [...home];
    const apply = () => svg.setAttribute('viewBox', vb.map(n => +n.toFixed(2)).join(' '));
    const scale = () => { const r = svg.getBoundingClientRect(); return Math.min(r.width / vb[2], r.height / vb[3]); };
    const zoom = (k, cx = 0.5, cy = 0.5) => {
      const w = Math.min(home[2] * 2, Math.max(home[2] / 12, vb[2] * k)), h = vb[3] * w / vb[2];
      vb = [vb[0] + (vb[2] - w) * cx, vb[1] + (vb[3] - h) * cy, w, h];
      apply();
    };
    box._pz = { in: () => zoom(1 / 1.3), out: () => zoom(1.3), fit: () => { vb = [...home]; apply(); } };
    box.onwheel = e => {
      // Plain wheel scrolls the page; pinch, Ctrl/⌘ + wheel, or any wheel in full screen zooms.
      if (!(e.ctrlKey || e.metaKey || box.closest('.kit-full'))) return;
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoom(Math.exp(e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    let drag = null;
    svg.onpointerdown = e => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY, vb: [...vb], id: e.pointerId, moved: false }; };
    svg.onpointermove = e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) { drag.moved = true; svg.setPointerCapture(drag.id); box.classList.add('grabbing'); }
      const s = scale();
      vb = [drag.vb[0] - dx / s, drag.vb[1] - dy / s, vb[2], vb[3]];
      apply();
    };
    svg.onpointerup = svg.onpointercancel = () => {
      if (drag?.moved) { box._dragged = true; setTimeout(() => { box._dragged = false; }); }
      drag = null;
      box.classList.remove('grabbing');
    };
  }
  let full = null, placeholder = null, backdrop = null;
  function setFull(target) {
    if (full) {
      const was = full;
      was.classList.remove('kit-full');
      was.querySelector('[data-zoom="full"]').textContent = t.full;
      placeholder.replaceWith(was);
      backdrop.remove();
      document.body.style.overflow = '';
      full = null;
      $$('.diagram', was).concat(was.matches('.diagram') ? [was] : []).forEach(d => d._pz?.fit());
      if (was === target) return;
    }
    if (!target) return;
    placeholder = document.createElement('div');
    placeholder.style.height = `${target.offsetHeight}px`;
    target.replaceWith(placeholder);
    backdrop = document.createElement('div');
    backdrop.className = 'kit-backdrop';
    backdrop.onclick = () => setFull(null);
    document.body.append(backdrop, target);
    target.classList.add('kit-full');
    target.querySelector('[data-zoom="full"]').textContent = t.exit;
    document.body.style.overflow = 'hidden';
    full = target;
  }

  // ---- drawer ----
  const drawer = document.createElement('aside');
  drawer.className = 'kit-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.setAttribute('aria-labelledby', 'kit-drawer-title');
  drawer.innerHTML = `<header><b id="kit-drawer-title"></b><button class="btn" type="button" data-kit-close>${t.close}</button></header><div class="scroll"></div>`;
  document.body.append(drawer);
  const drawerBody = drawer.querySelector('.scroll');
  let lastFocus = null;
  function clearSelection() {
    $$('.is-sel').forEach(el => el.classList.remove('is-sel'));
    $$('[data-open][aria-expanded="true"]').forEach(el => el.setAttribute('aria-expanded', 'false'));
  }
  function open(key, from) {
    const tpl = document.querySelector(`template[data-sum="${CSS.escape(key)}"]`);
    if (!tpl) { document.getElementById(key)?.scrollIntoView(); return; }
    drawerBody.replaceChildren(tpl.content.cloneNode(true));
    drawer.querySelector('#kit-drawer-title').textContent = tpl.dataset.title || key;
    clearSelection();
    if (from?.matches?.('g.kit-node')) from.classList.add('is-sel');
    if (from?.hasAttribute?.('aria-expanded')) from.setAttribute('aria-expanded', 'true');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    lastFocus = from;
    drawer.querySelector('[data-kit-close]').focus({ preventScroll: true });
    drawerBody.scrollTop = 0;
    renderSources(drawerBody).then(() => Promise.all([renderDiagrams(drawerBody), highlight(drawerBody)]));
  }
  function close() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    clearSelection();
    lastFocus?.focus?.({ preventScroll: true });
  }

  document.addEventListener('click', e => {
    const zoom = e.target.closest('[data-zoom]');
    if (zoom) {
      const box = zoom.closest('.kit-zoom')._box;
      if (zoom.dataset.zoom === 'full') setFull(box.closest('.fig') ?? box);
      else box._pz?.[zoom.dataset.zoom]();
      return;
    }
    if (e.target.closest('[data-kit-close]')) { close(); return; }
    if (e.target.closest('.diagram')?._dragged) return;
    const opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); open(opener.dataset.open, opener); return; }
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      const group = tab.closest('[data-tabs]');
      $$('[data-tab]', group).forEach(b => b.setAttribute('aria-selected', String(b === tab)));
      $$('[data-panel]', group).forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
      return;
    }
    if (e.target.closest('[data-theme-toggle]')) setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (drawer.classList.contains('open')) close(); else if (full) setFull(null); return; }
    const node = e.target.closest?.('g.kit-node[data-open]');
    if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(node.dataset.open, node); }
  });

  // ---- tabs default, table of contents ----
  for (const group of $$('[data-tabs]')) {
    const first = group.querySelector('[data-tab]');
    if (first && !group.querySelector('[data-tab][aria-selected="true"]')) first.click();
  }
  const toc = document.querySelector('.toc');
  if (toc && !toc.children.length) {
    for (const sec of $$('main section[id]')) {
      const h = sec.querySelector(':scope > h2');
      if (!h) continue;
      const a = document.createElement('a');
      a.href = `#${sec.id}`;
      a.textContent = [...h.childNodes].filter(n => n.nodeName !== 'SMALL').map(n => n.textContent).join('').trim();
      toc.append(a);
    }
  }
  const tocLinks = $$('.toc a');
  if (tocLinks.length) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) tocLinks.forEach(a => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${en.target.id}`)));
    }, { rootMargin: '-15% 0px -75% 0px' });
    $$('main section[id]').forEach(s => io.observe(s));
  }

  // ---- theme: own toggle, or the viewer's choice when embedded ----
  const toggles = $$('[data-theme-toggle]');
  function setTheme(theme) {
    const changed = document.documentElement.dataset.theme !== theme;
    document.documentElement.dataset.theme = theme;
    toggles.forEach(b => { b.textContent = theme === 'dark' ? t.light : t.dark; });
    if (changed) renderDiagrams(document);
  }
  window.addEventListener('message', e => {
    const theme = e.source === window.parent && e.data?.type === 'plan-theme' ? e.data.theme : null;
    if (theme !== 'dark' && theme !== 'light') return;
    toggles.forEach(b => { b.hidden = true; });
    setTheme(theme);
  });
  document.documentElement.dataset.theme ||= matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  toggles.forEach(b => { b.textContent = document.documentElement.dataset.theme === 'dark' ? t.light : t.dark; });

  renderSources(document).then(() => Promise.all([renderDiagrams(document), highlight(document)]));
});
