/**
 * edgacst API (문의게시판 · 개발업무현황 · 백업)
 *
 * [최초 1회 설정]
 * 1. 스프레드시트 → 확장 프로그램 → Apps Script
 * 2. testAuth 실행 → 「권한 제공」 클릭 → Drive 포함 전체 허용 (이미지 첨부 필수)
 *    (권한 오류 시: 프로젝트 설정 → appsscript.json 표시 → oauthScopes 확인)
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
      .addItem('연결 테스트 (Drive 포함)', 'testAuth')
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
  const uploadFolder = getOrCreateUploadFolder_();
  const inquiryCount = Math.max(inquirySheet.getLastRow() - 1, 0);
  const projectCount = Math.max(projectSheet.getLastRow() - 1, 0);
  const msg = '연결 성공\n문의 시트: ' + inquirySheet.getName() + ' (' + inquiryCount + '건)\n업무 시트: ' + projectSheet.getName() + ' (' + projectCount + '건)\nDrive 폴더: ' + uploadFolder.getName();
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
        version: 3,
        features: ['list', 'projects', 'reply', 'delete', 'project-save', 'project-delete', 'project-upload-image']
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

    if (data.action === 'project-upload-image') {
      return handleProjectUploadImage_(data);
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
  ensureProjectImageColumn_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  const id = project.id ? String(project.id) : String(Date.now());
  const imagesJson = JSON.stringify(Array.isArray(project.images) ? project.images : []);
  const fieldMap = {
    'ID': id,
    '프로젝트명': String(project.name || '').trim(),
    '담당': String(project.assignee || '').trim(),
    '시작일': String(project.start || ''),
    '목표일': String(project.end || ''),
    '진행률': Number(project.progress) || 0,
    '상태': String(project.status || 'waiting'),
    '개발내용': String(project.content || '').trim(),
    '이미지': imagesJson,
    '수정일시': now
  };
  const rowValues = headers.map(function (header) {
    return fieldMap[header] !== undefined ? fieldMap[header] : '';
  });

  const existingRow = findProjectRowById_(sheet, id);
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return json_({ success: true, id: id });
}

function handleProjectUploadImage_(data) {
  if (data.token !== ADMIN_TOKEN) {
    return json_({ success: false, error: 'unauthorized' });
  }

  const base64 = String(data.base64 || '');
  const mimeType = String(data.mimeType || 'image/jpeg');
  const fileName = String(data.fileName || 'image.jpg');

  if (!base64) {
    return json_({ success: false, error: 'no image data' });
  }

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.indexOf(mimeType) < 0) {
    return json_({ success: false, error: 'unsupported type' });
  }

  const bytes = Utilities.base64Decode(base64);
  const maxSize = 2 * 1024 * 1024;
  if (bytes.length > maxSize) {
    return json_({ success: false, error: 'file too large' });
  }

  const folder = getOrCreateUploadFolder_();
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  return json_({
    success: true,
    fileId: fileId,
    url: getDriveImageUrl_(fileId)
  });
}

function getDriveImageUrl_(fileId, size) {
  return 'https://lh3.googleusercontent.com/d/' + fileId + '=' + (size || 'w1000');
}

function extractDriveFileId_(url) {
  const str = String(url || '');
  const match = str.match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

function normalizeDriveImageUrl_(url) {
  const fileId = extractDriveFileId_(url);
  return fileId ? getDriveImageUrl_(fileId) : String(url || '');
}

function getOrCreateUploadFolder_() {
  const folderName = 'edgacst-uploads';
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function ensureProjectImageColumn_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf('이미지') >= 0) {
    return;
  }

  const updatedIdx = headers.indexOf('수정일시');
  if (updatedIdx >= 0) {
    sheet.insertColumnBefore(updatedIdx + 1);
    sheet.getRange(1, updatedIdx + 1).setValue('이미지').setFontWeight('bold');
    return;
  }

  sheet.getRange(1, lastCol + 1).setValue('이미지').setFontWeight('bold');
}

function parseProjectImages_(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (url) {
      return typeof url === 'string' && url.indexOf('http') === 0;
    }).map(normalizeDriveImageUrl_);
  } catch (e) {
    return [];
  }
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
    sheet.getRange(1, 1, 1, 10).setValues([[
      'ID', '프로젝트명', '담당', '시작일', '목표일', '진행률', '상태', '개발내용', '이미지', '수정일시'
    ]]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
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
    images: parseProjectImages_(get('이미지')),
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
