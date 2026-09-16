/* Яндекс.Метрика + уведомление о cookie — один файл на все страницы сайта,
   чтобы менять счётчик или текст плашки в одном месте. */
(function () {
  var ID = 112703245;

  // 1. Прячем от Вебвизора всё, что человек вводит в формы:
  //    в поле «сообщение» могут написать о здоровье — это не должно попадать в записи сеансов.
  document.querySelectorAll('input, textarea, select').forEach(function (el) {
    el.classList.add('ym-disable-keys', 'ym-hide-content');
  });

  // 2. Официальный код счётчика Метрики
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
    k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + ID, 'ym');
  ym(ID, 'init', { ssr: true, webvisor: true, clickmap: true, accurateTrackBounce: true, trackLinks: true });

  // 3. Плашка про cookie. Запоминаем «Понятно», чтобы не показывать её на каждой странице.
  //    localStorage может быть недоступен (приватный режим) — тогда просто покажем плашку ещё раз.
  var KEY = 'cookieNoticeOk';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}

  var css = document.createElement('style');
  css.textContent =
    '.cookie-note{position:fixed;left:16px;right:16px;bottom:16px;z-index:70;max-width:560px;margin:0 auto;' +
    'display:flex;gap:14px;align-items:center;padding:14px 16px;background:#24342f;color:#eaf0ed;' +
    'border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.25);font:14px/1.5 Inter,Arial,sans-serif}' +
    '.cookie-note p{margin:0;flex:1}.cookie-note a{color:#fff;text-decoration:underline}' +
    '.cookie-note button{flex:none;min-height:44px;padding:10px 18px;border:0;border-radius:10px;' +
    'background:#fff;color:#24342f;font:700 14px Inter,Arial,sans-serif;cursor:pointer}' +
    '.cookie-note button:focus-visible{outline:3px solid #e6c996;outline-offset:2px}' +
    // на телефоне поднимаем плашку над нижней панелью «Записаться / Позвонить»
    '@media(max-width:650px){.has-mobile-cta .cookie-note{bottom:84px}}';
  document.head.appendChild(css);

  var box = document.createElement('div');
  box.className = 'cookie-note';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Уведомление о cookie');
  box.innerHTML =
    '<p>Сайт использует cookie и Яндекс Метрику, чтобы видеть, какие разделы полезны посетителям. ' +
    'Оставаясь на сайте, вы с этим соглашаетесь. <a href="/privacy/#cookie">Подробнее</a></p>' +
    '<button type="button">Понятно</button>';
  box.querySelector('button').addEventListener('click', function () {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    box.remove();
  });
  if (document.querySelector('.mobile-cta')) document.body.classList.add('has-mobile-cta');
  document.body.appendChild(box);
})();
