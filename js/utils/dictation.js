// Dictado por voz para textareas — Web Speech API (integrada en Chrome/Edge,
// sin servidor ni librerías). En navegadores sin soporte (Firefox) el botón
// simplemente no aparece: la función es opcional y no rompe nada.
//
// Uso: attachDictation(textarea) — añade un botón 🎤 flotante dentro del campo.
// Clic = empieza a escuchar (pide permiso de micro la 1ª vez); otro clic = para.
// Lo reconocido se AÑADE al final del texto existente, y se dispara un evento
// 'input' para que los data-bindings y autoresize de cada vista reaccionen.

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export function dictationSupported() {
  return !!SR;
}

export function attachDictation(textarea) {
  if (!SR || !textarea) return;
  if (textarea.dataset.dictation) return;   // ya montado (re-render defensivo)
  textarea.dataset.dictation = '1';

  const host = textarea.parentElement;
  host.classList.add('dictate-host');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dictate-btn';
  btn.title = 'Dictar por voz';
  btn.textContent = '🎤';
  host.appendChild(btn);

  let rec = null;
  let listening = false;
  let baseText = '';

  const stop = () => { if (rec) { try { rec.stop(); } catch (e) { /* ya parado */ } } };

  btn.addEventListener('click', () => {
    if (listening) { stop(); return; }

    rec = new SR();
    rec.lang = 'es-ES';           // reconoce bien también acentos LATAM
    rec.continuous = true;        // no corta en la primera pausa
    rec.interimResults = true;    // se ve el texto mientras hablas

    baseText = textarea.value;

    rec.onstart = () => {
      listening = true;
      btn.classList.add('rec');
      btn.title = 'Parar dictado';
    };
    rec.onend = () => {
      listening = false;
      btn.classList.remove('rec');
      btn.title = 'Dictar por voz';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = () => {
      listening = false;
      btn.classList.remove('rec');
      btn.title = 'Dictar por voz';
    };
    rec.onresult = e => {
      // Si la vista se re-renderizó y el textarea ya no existe, paramos.
      if (!document.contains(textarea)) { stop(); return; }
      let finalTxt = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript;
        else interim += r[0].transcript;
      }
      const sep = baseText && !/\s$/.test(baseText) ? ' ' : '';
      textarea.value = baseText + sep + finalTxt + interim;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.scrollTop = textarea.scrollHeight;
    };

    try { rec.start(); } catch (e) { /* micro denegado o en uso */ }
  });
}
