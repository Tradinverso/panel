const KEYS = {
  trades: 'tradinverso_trades',
  theme: 'tradinverso_theme',
  url: 'tradinverso_apps_script_url',
  version: 'tradinverso_schema_version',
  sidebar: 'tradinverso_sidebar_collapsed',
  news: 'tradinverso_news_source',
  checklist: 'tradinverso_checklist',
};

const SCHEMA_VERSION = 1;

export const storage = {
  getTrades() {
    try {
      const raw = localStorage.getItem(KEYS.trades);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to read trades from storage', e);
      return [];
    }
  },
  setTrades(trades) {
    localStorage.setItem(KEYS.trades, JSON.stringify(trades));
  },
  getTheme() {
    return localStorage.getItem(KEYS.theme) || 'dark';
  },
  setTheme(t) {
    localStorage.setItem(KEYS.theme, t);
  },
  // Menú plegado a rail de iconos (solo escritorio; se recuerda entre sesiones).
  getSidebarCollapsed() {
    return localStorage.getItem(KEYS.sidebar) === '1';
  },
  setSidebarCollapsed(v) {
    localStorage.setItem(KEYS.sidebar, v ? '1' : '0');
  },
  // Checklist pre-sesión: mapa {entries: {clave: [bool,...]}} donde conviven la
  // clave DIARIA ('YYYY-MM-DD|daily', ej. "he dormido bien") y la del TRAMO
  // ('YYYY-MM-DD|pN', que re-arma en las aperturas de Londres/NY). Al guardar
  // se podan las claves de otros días (auto-limpieza).
  getChecklist(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.checklist));
      if (raw && raw.entries && Array.isArray(raw.entries[key])) return raw.entries[key];
    } catch (e) { /* corrupto o formato viejo → vacío */ }
    return [];
  },
  setChecklist(key, done) {
    let entries = {};
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.checklist));
      if (raw && raw.entries) entries = raw.entries;
    } catch (e) { /* empezar de cero */ }
    const day = key.split('|')[0];
    for (const k of Object.keys(entries)) if (!k.startsWith(day)) delete entries[k];
    entries[key] = done;
    localStorage.setItem(KEYS.checklist, JSON.stringify({ entries }));
  },
  // Fuente del calendario económico del botón "Noticias": 'investing' | 'forexfactory'.
  getNewsSource() {
    return localStorage.getItem(KEYS.news) === 'forexfactory' ? 'forexfactory' : 'investing';
  },
  setNewsSource(v) {
    localStorage.setItem(KEYS.news, v === 'forexfactory' ? 'forexfactory' : 'investing');
  },
  getAppsScriptUrl() {
    return localStorage.getItem(KEYS.url) || '';
  },
  setAppsScriptUrl(s) {
    localStorage.setItem(KEYS.url, s || '');
  },
  init() {
    const v = parseInt(localStorage.getItem(KEYS.version), 10);
    if (isNaN(v) || v < SCHEMA_VERSION) {
      localStorage.setItem(KEYS.version, String(SCHEMA_VERSION));
    }
  },
  clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  },
  exportJson() {
    return {
      version: SCHEMA_VERSION,
      trades: this.getTrades(),
      exportedAt: new Date().toISOString(),
    };
  },
};
