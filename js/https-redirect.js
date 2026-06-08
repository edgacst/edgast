(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');

  if (location.protocol === 'http:' && !isLocal) {
    location.replace(
      'https://' + location.host + location.pathname + location.search + location.hash
    );
  }
})();
