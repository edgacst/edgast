/**
 * edgacst 문의게시판 - Google 스프레드시트 연동
 *
 * [승인이 안 될 때 - 먼저 이것부터]
 * 1. 스프레드시트 → 확장 프로그램 → Apps Script (반드시 스프레드시트에서 열기)
 * 2. 아래 testAuth 함수 선택 → ▶ 실행
 * 3. 권한 검토 → freecompr20@gmail.com 선택 → 고급 → 안전하지 않음으로 이동 → 허용
 * 4. 그래도 안 되면 js/config.js 에 Google Form 방식 사용 (승인 불필요)
 *
 * [웹 앱 배포]
 * 1. testAuth 실행 성공 후
 * 2. 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자
 * 3. URL을 js/config.js 의 SCRIPT_URL 에 입력
 */

const SPREADSHEET_ID = '1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI';
const ADMIN_TOKEN = '1324';

/** 에디터에서 선택 후 ▶ 실행 → 권한 승인 */
function testAuth() {
  const sheet = getOrCreateSheet_();
  Logger.log('연결 성공: ' + sheet.getName());
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet_();

    sheet.appendRow([
      Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
      data.name || '',
      data.email || '',
      data.phone || '',
      data.subject || '',
      data.message || ''
    ]);

    return json_({ success: true });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const params = e.parameter || {};

    if (params.token !== ADMIN_TOKEN) {
      return json_({ success: false, error: 'unauthorized' });
    }

    const sheet = getOrCreateSheet_();
    const values = sheet.getDataRange().getValues();
    values.shift();

    const inquiries = values.reverse().map(row => ({
      date: String(row[0] || ''),
      name: String(row[1] || ''),
      email: String(row[2] || ''),
      phone: String(row[3] || ''),
      subject: String(row[4] || ''),
      message: String(row[5] || '')
    }));

    return json_({ success: true, inquiries });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets()[0];

  if (sheet.getRange(1, 1).getValue() !== '등록일시') {
    sheet.getRange(1, 1, 1, 6).setValues([['등록일시', '이름', '이메일', '연락처', '제목', '내용']]);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
