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
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyLqTm4T0soZUiUNW9jMaKLNV0aEdwMBTcY1SbOdouE3c9DlLEuvAxamo53YYTTs2AUfQ/exec',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI/edit'
};
