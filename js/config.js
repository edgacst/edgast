// Google Analytics 4 — analytics.google.com 에서 측정 ID 발급 후 입력 (예: G-XXXXXXXXXX)
const ANALYTICS_CONFIG = {
  GA4_MEASUREMENT_ID: 'G-6KJWH6SGTP'
};

// Google Form → 스프레드시트 저장 + Apps Script → 목록·답변·백업
const GOOGLE_CONFIG = {
  FORM_ACTION_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScb7N9_uzRhrAuo02VHMD2luEm0uGsv4ZAjqpQezi8v0N-3ZQ/formResponse',
  FORM_ENTRIES: {
    name: 'entry.2026758434',
    email: 'entry.2040093877',
    phone: 'entry.2079079070',
    subject: 'entry.786471210',
    message: 'entry.402639363'
  },
  // Apps Script 웹앱 배포 URL (google-apps-script/Code.gs 배포 후 입력)
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxtkPa2nTWTGN3kx3d-WH6gwxeMHxu5SNaFCoG7tete8YDQyEXV5ry_bvsceohpKPeocQ/exec',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI/edit',
  // 스프레드시트 탭: Form_Responses(문의), 개발업무(업무현황), 문의백업
  PROJECT_SHEET_NAME: '개발업무'
};

(function earlyPrefetch() {
  const scriptUrl = GOOGLE_CONFIG?.SCRIPT_URL;
  if (!scriptUrl) return;

  const INQUIRIES_KEY = 'edgacst_inquiries_cache';
  const PROJECTS_KEY = 'edgacst_projects_cache';
  const TTL_MS = 15 * 60 * 1000;

  function hasFreshCache(key) {
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
      if (!raw) return false;
      const cache = JSON.parse(raw);
      return Boolean(cache?.at && Date.now() - cache.at < TTL_MS);
    } catch {
      return false;
    }
  }

  function saveCache(key, payload) {
    const data = JSON.stringify({ ...payload, at: Date.now() });
    sessionStorage.setItem(key, data);
    localStorage.setItem(key, data);
  }

  if (!hasFreshCache(INQUIRIES_KEY)) {
    const url = new URL(scriptUrl);
    url.searchParams.set('action', 'list');
    fetch(url.toString(), { redirect: 'follow' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          saveCache(INQUIRIES_KEY, { inquiries: data.inquiries || [], isAdmin: false });
        }
      })
      .catch(() => {});
  }

  if (!hasFreshCache(PROJECTS_KEY)) {
    const url = new URL(scriptUrl);
    url.searchParams.set('action', 'projects');
    fetch(url.toString(), { redirect: 'follow' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          saveCache(PROJECTS_KEY, { projects: data.projects || [] });
        }
      })
      .catch(() => {});
  }
})();
