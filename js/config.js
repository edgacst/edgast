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
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxWVKqfnIBB1a-DwxE0Hfo7jdL6ipRRy-NILOuaZNTlD8Yyma4HECL0TivBRyXXK0B_Tw/exec',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI/edit',
  // 스프레드시트 탭: Form_Responses(문의), 개발업무(업무현황), 문의백업
  PROJECT_SHEET_NAME: '개발업무'
};
