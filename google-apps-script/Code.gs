/**
 * edgacst 문의게시판 API (목록 조회 · 관리자 답변 · 자동 백업)
 *
 * [최초 1회 설정]
 * 1. 문의 스프레드시트 → 확장 프로그램 → Apps Script
 * 2. testAuth 실행 → 권한 허용
 * 3. setupDailyBackup 실행 (매일 자동 백업)
 * 4. 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자
 * 5. 배포 URL을 js/config.js 의 SCRIPT_URL 에 입력
 *
 * 문의 등록은 사이트 폼 → Google Form 으로 저장됩니다.
 * 이 스크립트는 목록 표시·관리자 답변·백업만 담당합니다.
 */

const SPREADSHEET_ID = '1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI';
const ADMIN_TOKEN = '1324';
const BACKUP_SHEET_NAME = '문의백업';

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('edgacst')
      .addItem('지금 백업', 'backupInquiries')
      .addItem('일일 자동 백업 설정', 'setupDailyBackup')
      .addToUi();
  } catch (e) {
    // 웹앱 전용 실행 시 UI 없음
  }
}

function testAuth() {
  const sheet = getResponseSheet_();
  const count = Math.max(sheet.getLastRow() - 1, 0);
  const msg = '연결 성공\n시트: ' + sheet.getName() + '\n문의 수: ' + count;
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

function setupDailyBackup() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'backupInquiries') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('backupInquiries')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();

  backupInquiries();

  const msg = '매일 새벽 3시 자동 백업이 설정되었습니다.\n「문의백업」 시트를 확인하세요.';
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

function backupInquiries() {
  backupInquiries_();
}

function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || 'list';

    if (action === 'list') {
      return json_(listInquiries_(params.token === ADMIN_TOKEN));
    }

    return json_({ success: false, error: 'unknown action' });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'reply') {
      return handleReply_(data);
    }

    return json_({ success: false, error: 'invalid action' });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function listInquiries_(isAdmin) {
  const sheet = getResponseSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { success: true, inquiries: [] };
  }

  const headers = values[0].map(String);
  const inquiries = [];

  for (let i = 1; i < values.length; i++) {
    const item = parseInquiryRow_(values[i], headers, i + 1);
    if (!item.subject && !item.message) continue;

    if (isAdmin) {
      inquiries.push(item);
    } else {
      inquiries.push({
        row: item.row,
        date: item.date,
        name: maskName_(item.name),
        subject: item.subject,
        message: item.message,
        reply: item.reply,
        hasReply: Boolean(item.reply)
      });
    }
  }

  inquiries.reverse();
  return { success: true, inquiries: inquiries };
}

function handleReply_(data) {
  if (data.token !== ADMIN_TOKEN) {
    return json_({ success: false, error: 'unauthorized' });
  }

  const row = Number(data.row);
  if (!row || row < 2) {
    return json_({ success: false, error: 'invalid row' });
  }

  const sheet = getResponseSheet_();
  const replyCol = getReplyColumn_(sheet);
  sheet.getRange(row, replyCol).setValue(String(data.reply || '').trim());
  backupInquiries_();

  return json_({ success: true });
}

function getResponseSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const names = ['Form_Responses', 'Form Responses', '폼 응답'];
  let sheet = null;

  names.forEach(function (name) {
    if (!sheet) sheet = ss.getSheetByName(name);
  });

  if (!sheet) {
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      const candidate = sheets[i];
      if (candidate.getName() === BACKUP_SHEET_NAME) continue;
      const header = String(candidate.getRange(1, 1).getValue() || '');
      if (
        header === '타임스탬프' ||
        header === '등록일시' ||
        header === '이름'
      ) {
        sheet = candidate;
        break;
      }
    }
  }

  if (!sheet) sheet = ss.getSheets()[0];
  ensureReplyColumn_(sheet);
  return sheet;
}

function ensureReplyColumn_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  if (headers.indexOf('관리자답변') >= 0 || headers.indexOf('답변') >= 0) {
    return;
  }

  const col = lastCol + 1;
  sheet.getRange(1, col).setValue('관리자답변').setFontWeight('bold');
}

function getReplyColumn_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  let idx = headers.indexOf('관리자답변');
  if (idx < 0) idx = headers.indexOf('답변');
  if (idx < 0) {
    ensureReplyColumn_(sheet);
    return sheet.getLastColumn();
  }
  return idx + 1;
}

function parseInquiryRow_(row, headers, rowIndex) {
  const get = function () {
    const names = Array.prototype.slice.call(arguments);
    for (let i = 0; i < names.length; i++) {
      const idx = headers.indexOf(names[i]);
      if (idx >= 0) return String(row[idx] || '');
    }
    return '';
  };

  return {
    row: rowIndex,
    date: get('타임스탬프', '등록일시'),
    name: get('이름'),
    email: get('이메일'),
    phone: get('연락처'),
    subject: get('제목'),
    message: get('내용'),
    reply: get('관리자답변', '답변')
  };
}

function maskName_(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '익명';
  if (trimmed.length === 1) return trimmed + '*';
  if (trimmed.length === 2) return trimmed.charAt(0) + '*';
  return trimmed.charAt(0) + '*'.repeat(trimmed.length - 2) + trimmed.charAt(trimmed.length - 1);
}

function backupInquiries_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const source = getResponseSheet_();
  const data = source.getDataRange().getValues();
  let backup = ss.getSheetByName(BACKUP_SHEET_NAME);

  if (!backup) {
    backup = ss.insertSheet(BACKUP_SHEET_NAME);
  }

  backup.clearContents();
  if (data.length && data[0].length) {
    backup.getRange(1, 1, data.length, data[0].length).setValues(data);
    backup.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
  }

  backup.setTabColor('#34a853');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
