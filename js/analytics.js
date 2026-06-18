(function initAnalytics() {
  const measurementId = ANALYTICS_CONFIG?.GA4_MEASUREMENT_ID?.trim();
  if (!measurementId) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', measurementId, {
    anonymize_ip: true,
    send_page_view: true
  });
})();

/** GA4 전환 이벤트 — 문의 폼 제출 성공 시 호출 (개인정보는 전송하지 않음) */
window.trackInquiryConversion = function (subject) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', 'generate_lead', {
    form_name: 'inquiry',
    inquiry_subject: subject || 'general'
  });
};
