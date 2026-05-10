// Selectable pill group component
// renderPills(container, { name, options, value, variant, onChange }) → { get, set, focus }

export function renderPills(container, { name, options, value = '', variant = '', onChange = () => {} }) {
  const cls = `pill-group${variant ? ' ' + variant : ''}`;
  container.className = cls;
  container.dataset.name = name;
  container.innerHTML = options.map(opt => {
    const v = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : opt.label;
    const active = v === value ? 'active' : '';
    return `<button type="button" class="pill ${active}" data-val="${escapeAttr(v)}">${escapeHtml(label)}</button>`;
  }).join('');
  let cur = value;
  container.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    cur = pill.dataset.val;
    [...container.querySelectorAll('.pill')].forEach(p => p.classList.toggle('active', p === pill));
    onChange(cur);
  });
  return {
    get: () => cur,
    set: v => {
      cur = v;
      [...container.querySelectorAll('.pill')].forEach(p => p.classList.toggle('active', p.dataset.val === v));
    },
  };
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }
function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
