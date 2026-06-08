// ============================================================
// 문의게시판 - 간단 설정 (3단계, 무료, 승인 불필요)
// ============================================================
//
// 1. https://forms.google.com → 새 설문지
//    질문 추가: 이름, 이메일, 연락처, 제목, 내용
//
// 2. 「응답」탭 → 「스프레드시트에 링크」→ 기존 시트 선택
//
// 3. 「보내기」→ 「<>」아이콘(삽입) → HTML 복사
//    iframe 의 src="..." 주소만 아래에 붙여넣기
//
// 문의 확인: 푸터 「문의 확인」→ 스프레드시트
// ============================================================

const GOOGLE_CONFIG = {
  FORM_EMBED_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScb7N9_uzRhrAuo02VHMD2luEm0uGsv4ZAjqpQezi8v0N-3ZQ/viewform?embedded=true',
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI/edit'
};
