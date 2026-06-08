/**
 * edgacst 문의게시판 - Google 스프레드시트 연동
 *
 * [설정 방법]
 * 1. Google 스프레드시트 새로 만들기
 * 2. 확장 프로그램 → Apps Script
 * 3. 이 코드 전체 붙여넣기 후 저장
 * 4. 배포 → 새 배포 → 유형: 웹 앱
 *    - 실행 계정: 나
 *    - 액세스 권한: 모든 사용자
 * 5. 생성된 웹 앱 URL을 js/config.js 의 SCRIPT_URL 에 입력
 */

const SHEET_NAME = '문의';
const ADMIN_TOKEN = '1324';

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['등록일시', '이름', '이메일', '연락처', '제목', '내용']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
