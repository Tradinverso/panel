// Selectable pill group component
// renderPills(container, { name, options, value, variant, onChange, multi }) → { get, set, focus }
//
// - Single (default): value es string. Click reemplaza el valor.
// - Multi (multi: true): value es array de strings. Click hace toggle (añade/quita).
//   onChange recibe el array actualizado. get() devuelve el array.

export function renderPills(container, { name, options, value, variant = '', onChange = () => {}, multi = false }) {
  const cls = `pill-group${variant ? ' ' + variant : ''}`;
  container.className = cls;
  container.dataset.name = name;

  // Estado interno: array (multi) o string (single)
  let cur = multi
    ? (Array.isArray(value) ? [...value] : (value ? [value] : []))
    : (Array.isArray(value) ? (value[0] || '') : (value || ''));

  function isActive(v) {
    return multi ? cur.includes(v) : cur === v;
  }

  function paintActive() {
    [...container.querySelectorAll('.pill')].forEach(p => {
      p.classList.toggle('active', isActive(p.dataset.val));
    });
  }

  container.innerHTML = options.map(opt => {
    const v = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : opt.label;
    const active = isActive(v) ? 'active' : '';
    return `<button type="button" class="pill ${active}" data-val="${escapeAttr(v)}">${escapeHtml(label)}</button>`;
  }).join('');

  container.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    const v = pill.dataset.val;
    if (multi) {
      if (cur.includes(v)) {
        cur = cur.filter(x => x !== v);
      } else {
        cur = [...cur, v];
      }
      paintActive();
      onChange(cur);
    } else {
      cur = v;
      paintActive();
      onChange(cur);
    }
  });

  return {
    get: () => (multi ? [...cur] : cur),
    set: v => {
      cur = multi
        ? (Array.isArray(v) ? [...v] : (v ? [v] : []))
        : (Array.isArray(v) ? (v[0] || '') : (v || ''));
      paintActive();
    },
  };
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
