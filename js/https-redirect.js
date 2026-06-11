(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

  // github.io 에서만 HTTP→HTTPS (자체 도메인은 GitHub Pages 인증서 발급 후 Enforce HTTPS 사용)
  if (location.protocol === 'http:' && !isLocal && host.endsWith('.github.io')) {
    location.replace(
      'https://' + location.host + location.pathname + location.search + location.hash
    );
  }

})();
