(() => {
  const element = document.getElementById('offline-messages');
  if (!element) return;
  let messages;
  try { messages = JSON.parse(element.textContent); } catch { return; }
  if (!messages || typeof messages !== 'object' || !messages.en) return;
  let saved = '';
  try { saved = decodeURIComponent(document.cookie.split('; ').find(value => value.startsWith('NEXT_LOCALE='))?.slice(12) ?? ''); } catch {}
  const candidates = [saved, ...(navigator.languages ?? [navigator.language])].filter(value => typeof value === 'string').map(value => value.toLowerCase().split('-')[0]);
  const locale = candidates.find(value => Object.prototype.hasOwnProperty.call(messages, value)) ?? 'en';
  const text = messages[locale];
  document.documentElement.lang = locale;
  document.title = text.title + ' | Liravo';
  document.getElementById('offline-title').textContent = text.title;
  document.getElementById('offline-description').textContent = text.description;
  const retry = document.getElementById('offline-retry');
  retry.textContent = text.retry;
  retry.href = location.pathname === '/offline' ? '/' : location.href;
})();
