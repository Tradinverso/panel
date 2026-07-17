const KEYS = {
  trades: 'tradinverso_trades',
  theme: 'tradinverso_theme',
  url: 'tradinverso_apps_script_url',
  version: 'tradinverso_schema_version',
  sidebar: 'tradinverso_sidebar_collapsed',
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
