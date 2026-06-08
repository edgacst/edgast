/**
 * edgacst API (문의게시판 · 개발업무현황 · 백업)
 *
 * [최초 1회 설정]
 * 1. 스프레드시트 → 확장 프로그램 → Apps Script
 * 2. testAuth 실행 → 권한 허용
 * 3. setupDailyBackup 실행 (선택)
 * 4. 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자
 * 5. 배포 URL을 js/config.js 의 SCRIPT_URL 에 입력
 *
 * 시트 구성:
 * - Form_Responses (또는 폼 응답): 문의
 * - 개발업무: 개발 업무현황
 * - 문의백업: 문의 자동 백업
 */

const SPREADSHEET_ID = '1lJVAmeBNcyaGQDR9wfeNzqUDIY9K4aN3uyWTxph4hiI';
const ADMIN_TOKEN = '1324';
const BACKUP_SHEET_NAME = '문의백업';
const PROJECT_SHEET_NAME = '개발업무';

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('edgacst')
      .addItem('연결 테스트', 'testAuth')
      .addItem('지금 백업', 'backupInquiries')
      .addItem('일일 자동 백업 설정', 'setupDailyBackup')
      .addToUi();
  } catch (e) {
    // 웹앱 전용 실행 시 UI 없음
  }
}

function testAuth() {
  const inquirySheet = getResponseSheet_();
  const projectSheet = getProjectsSheet_();
  const inquiryCount = Math.max(inquirySheet.getLastRow() - 1, 0);
  const projectCount = Math.max(projectSheet.getLastRow() - 1, 0);
  const msg = '연결 성공\n문의 시트: ' + inquirySheet.getName() + ' (' + inquiryCount + '건)\n업무 시트: ' + projectSheet.getName() + ' (' + projectCount + '건)';
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

    if (action === 'health') {
      return json_({
        success: true,
        version: 2,
        features: ['list', 'projects', 'reply', 'delete', 'project-save', 'project-delete']
      });
    }

    if (action === 'list') {
      return json_(listInquiries_(params.token === ADMIN_TOKEN));
    }

    if (action === 'projects') {
      return json_(listProjects_());
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

    if (data.action === 'delete') {
      return handleDelete_(data);
    }

    if (data.action === 'project-save') {
      return handleProjectSave_(data);
    }

    if (data.action === 'project-delete') {
      return handleProjectDelete_(data);
    }

    return json_({ success: false, error: 'invalid action' });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function listProjects_() {
  const sheet = getProjectsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return { success: true, projects: [] };
  }

  const headers = values[0].map(String);
  const projects = [];

  for (let i = 1; i < values.length; i++) {
    const item = parseProjectRow_(values[i], headers, i + 1);
    if (!item.name) continue;
    projects.push(item);
  }

  projects.sort(function (a, b) {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  return { success: true, projects: projects };
}

function handleProjectSave_(data) {
  if (data.token !== ADMIN_TOKEN) {
    return json_({ success: false, error: 'unauthorized' });
  }

  const project = data.project || {};
  const sheet = getProjectsSheet_();
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  const id = project.id ? String(project.id) : String(Date.now());
  const rowValues = [
    id,
    String(project.name || '').trim(),
    String(project.assignee || '').trim(),
    String(project.start || ''),
    String(project.end || ''),
    Number(project.progress) || 0,
    String(project.status || 'waiting'),
    String(project.content || '').trim(),
    now
  ];

  const existingRow = findProjectRowById_(sheet, id);
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return json_({ success: true, id: id });
}

function handleProjectDelete_(data) {
  if (data.token !== ADMIN_TOKEN) {
    return json_({ success: false, error: 'unauthorized' });
  }

  const row = Number(data.row);
  if (!row || row < 2) {
    return json_({ success: false, error: 'invalid row' });
  }

  const sheet = getProjectsSheet_();
  if (row > sheet.getLastRow()) {
    return json_({ success: false, error: 'row not found' });
  }

  sheet.deleteRow(row);
  return json_({ success: true });
}

function getProjectsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(PROJECT_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(PROJECT_SHEET_NAME);
    sheet.getRange(1, 1, 1, 9).setValues([[
      'ID', '프로젝트명', '담당', '시작일', '목표일', '진행률', '상태', '개발내용', '수정일시'
    ]]);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
    sheet.setTabColor('#3b82f6');
  }

  return sheet;
}

function findProjectRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return i + 2;
    }
  }
  return 0;
}

function parseProjectRow_(row, headers, rowIndex) {
  const get = function () {
    const names = Array.prototype.slice.call(arguments);
    for (let i = 0; i < names.length; i++) {
      const idx = headers.indexOf(names[i]);
      if (idx >= 0) return row[idx];
    }
    return '';
  };

  return {
    row: rowIndex,
    id: Number(get('ID')) || String(get('ID')),
    name: String(get('프로젝트명') || ''),
    assignee: String(get('담당') || ''),
    start: formatDateValue_(get('시작일')),
    end: formatDateValue_(get('목표일')),
    progress: Number(get('진행률')) || 0,
    status: String(get('상태') || 'waiting'),
    content: String(get('개발내용') || ''),
    updatedAt: String(get('수정일시') || '')
  };
}

function formatDateValue_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(value).substring(0, 10);
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

function handleDelete_(data) {
  if (data.token !== ADMIN_TOKEN) {
    return json_({ success: false, error: 'unauthorized' });
  }

  const row = Number(data.row);
  if (!row || row < 2) {
    return json_({ success: false, error: 'invalid row' });
  }

  const sheet = getResponseSheet_();
  if (row > sheet.getLastRow()) {
    return json_({ success: false, error: 'row not found' });
  }

  sheet.deleteRow(row);
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
      if (candidate.getName() === BACKUP_SHEET_NAME || candidate.getName() === PROJECT_SHEET_NAME) continue;
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
