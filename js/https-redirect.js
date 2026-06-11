(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

  // github.io 에서만 HTTP→HTTPS (자체 도메인은 GitHub Pages 인증서 발급 후 Enforce HTTPS 사용)
  if (location.protocol === 'http:' && !isLocal && host.endsWith('.github.io')) {
    location.replace(
      'https://' + location.host + location.pathname + location.search + location.hash
    );
  }

  try {
    if (sessionStorage.getItem('edgacst-page-transition') === 'out') {
      var style = document.createElement('style');
      style.id = 'page-transition-style';
      style.textContent =
        '#page-transition-overlay{position:fixed;inset:0;z-index:99999;background:#0f2438;opacity:1;pointer-events:none}';
      document.documentElement.appendChild(style);
      var overlay = document.createElement('div');
      overlay.id = 'page-transition-overlay';
      overlay.className = 'is-covering';
      overlay.setAttribute('aria-hidden', 'true');
      document.documentElement.appendChild(overlay);
    }
  } catch (e) {
    // sessionStorage unavailable
  }
})();
