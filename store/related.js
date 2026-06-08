// Related tools widget for FreeMarketingStore
(function () {
  const STORE = 'https://freemarketingstore.online';

  async function loadRelated(currentPath) {
    try {
      const res = await fetch(`${STORE}/registry.json`);
      const tools = await res.json();
      const current = currentPath.replace(/\/index\.html$/, '').replace(/\/$/, '');
      const related = tools.filter(t => !current.endsWith(t.path.replace(/\/index\.html$/, '').replace(/\/$/, '')));
      const shuffled = related.sort(() => Math.random() - 0.5).slice(0, 3);
      if (!shuffled.length) return;

      const container = document.createElement('section');
      container.id = 'related-tools';
      container.innerHTML = `
        <style>
          #related-tools {
            max-width: 900px;
            margin: 3rem auto;
            padding: 0 1.5rem;
            font-family: 'Manrope', system-ui, sans-serif;
          }
          #related-tools h3 {
            font-size: 1.1rem;
            color: #1a1a1a;
            margin-bottom: 1rem;
          }
          #related-tools .related-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1rem;
          }
          #related-tools .related-card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 1.25rem;
            text-decoration: none;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          #related-tools .related-card:hover {
            border-color: #f97316;
            box-shadow: 0 2px 12px rgba(249,115,22,0.1);
          }
          #related-tools .related-card .card-title {
            font-size: 0.95rem;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 0.35rem;
          }
          #related-tools .related-card .card-desc {
            font-size: 0.82rem;
            color: #6b7280;
            line-height: 1.4;
          }
        </style>
        <h3>More Marketing Tools</h3>
        <div class="related-grid">
          ${shuffled.map(t => `
            <a class="related-card" href="${STORE}/${t.path}">
              <div class="card-title">${t.name}</div>
              <div class="card-desc">${t.description}</div>
            </a>
          `).join('')}
        </div>
      `;
      document.body.appendChild(container);
    } catch (e) {
      // silent fail
    }
  }

  loadRelated(window.location.pathname);
})();
