// ============================================================
// 문의게시판 연동 설정
// ============================================================
//
// [방법 A] Google Form (승인 불필요 - 추천)
// 1. https://forms.google.com 에서 새 설문지 만들기
//    질문: 이름, 이메일, 연락처, 제목, 내용 (단답형/장문형)
// 2. 응답 탭 → 스프레드시트에 링크 → 기존 시트 선택
//    https://docs.google.com/spreadsheets/d/1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI/edit
// 3. 설문지 미리보기 → 우클릭 페이지 소스 보기 → "entry." 검색
// 4. 아래 FORM_ACTION_URL, FORM_ENTRIES 에 입력
//
// [방법 B] Apps Script (관리자 페이지에서 목록 불러오기 가능)
// google-apps-script/Code.gs 참고 → testAuth 실행 후 웹 앱 배포
// SCRIPT_URL 에 /exec URL 입력
//
// ============================================================

const GOOGLE_CONFIG = {
  SPREADSHEET_ID: '1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI/edit',

  // 방법 B: Apps Script 웹 앱 URL (비어 있으면 방법 A 사용)
  SCRIPT_URL: '',

  // 방법 A: Google Form (승인 없이 문의 저장 가능)
  FORM_ACTION_URL: '',
  FORM_ENTRIES: {
    name: '',    // 예: entry.123456789
    email: '',   // 예: entry.987654321
    phone: '',   // 예: entry.111222333
    subject: '', // 예: entry.444555666
    message: ''  // 예: entry.777888999
  }
};
