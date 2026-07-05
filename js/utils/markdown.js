// Renderizador Markdown minimalista y SEGURO (sin dependencias).
// Estrategia: escapar HTML SIEMPRE primero y luego aplicar un subconjunto de
// Markdown sobre el texto ya escapado. Así el contenido del usuario nunca puede
// inyectar HTML/JS. Soporta: # ## ### encabezados, **negrita**, *cursiva*,
// `código`, bloques ```code```, listas - / 1., enlaces [txt](http…), --- regla,
// párrafos y saltos de línea.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Inline sobre texto YA escapado: code, bold, italic, enlaces http(s).
function inline(escaped) {
  let t = escaped;
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Solo enlaces http/https (el texto y la url ya están escapados)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, txt, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`);
  return t;
}

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let list = null;       // 'ul' | 'ol' | null
  let inCode = false;
  let para = [];

  const flushPara = () => { if (para.length) { html += '<p>' + inline(esc(para.join(' '))) + '</p>'; para = []; } };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      flushPara();
      if (inCode) { html += '</code></pre>'; inCode = false; }
      else { closeList(); html += '<pre><code>'; inCode = true; }
      continue;
    }
    if (inCode) { html += esc(raw) + '\n'; continue; }

    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') { flushPara(); closeList(); continue; }

    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara(); closeList();
      const lvl = m[1].length;
      html += `<h${lvl}>${inline(esc(m[2]))}</h${lvl}>`;
      continue;
    }
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) { flushPara(); closeList(); html += '<hr>'; continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(esc(m[1]))}</li>`;
      continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(esc(m[1]))}</li>`;
      continue;
    }
    closeList();
    para.push(line.trim());
  }

  if (inCode) html += '</code></pre>';
  flushPara(); closeList();
  return html;
}
