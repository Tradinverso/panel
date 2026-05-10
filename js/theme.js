import { storage } from './storage.js';

let current = 'dark';
const listeners = new Set();

export const theme = {
  init() {
    current = storage.getTheme();
    this.apply(current);
  },
  apply(t) {
    current = t;
    document.documentElement.setAttribute('data-theme', t);
    storage.setTheme(t);
    listeners.forEach(fn => fn(t));
  },
  toggle() {
    this.apply(current === 'dark' ? 'light' : 'dark');
  },
  current() { return current; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
