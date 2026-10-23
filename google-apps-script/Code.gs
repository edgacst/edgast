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
const LEGACY_ADMIN_TOKEN = '1324';
const BACKUP_SHEET_NAME = '문의백업';
const PROJECT_SHEET_NAME = '개발업무';
const MEMBER_SHEET_NAME = '회원';
const DOWNLOAD_SHEET_NAME = '다운로드';
const FIREBASE_API_KEY_FALLBACK = 'AIzaSyA4jXihgK_AH_FOPQQEFSfJhUpSYhw7qLY';
const MAX_DOWNLOAD_FILE_SIZE = 10 * 1024 * 1024;

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('edgacst')
      .addItem('연결 테스트 (Drive 포함)', 'testAuth')
      .addItem('보안 설정 (관리자 비밀번호·Firebase 키)', 'setupSecurity')
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
  const memberSheet = getMembersSheet_();
  const downloadSheet = getDownloadsSheet_();
  const uploadFolder = getOrCreateUploadFolder_();
  const memberFilesFolder = getOrCreateMemberFilesFolder_();
  const downloadFolder = getOrCreateDownloadFolder_();
  const inquiryCount = Math.max(inquirySheet.getLastRow() - 1, 0);
  const projectCount = Math.max(projectSheet.getLastRow() - 1, 0);
  const msg = '연결 성공\n문의 시트: ' + inquirySheet.getName() + ' (' + inquiryCount + '건)\n업무 시트: ' + projectSheet.getName() + ' (' + projectCount + '건)\n회원 시트: ' + memberSheet.getName() + '\n다운로드 시트: ' + downloadSheet.getName() + '\n이미지 폴더: ' + uploadFolder.getName() + '\n회원 파일 폴더: ' + memberFilesFolder.getName() + '\n다운로드 폴더: ' + downloadFolder.getName();
  Logger.log(msg);
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    Logger.log(msg);
  }
}

function setupSecurity() {
  const ui = SpreadsheetApp.getUi();
  const adminResponse = ui.prompt('관리자 비밀번호 설정', '32자 이상의 무작위 비밀번호를 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (adminResponse.getSelectedButton() !== ui.Button.OK) return;
  const adminToken = String(adminResponse.getResponseText() || '').trim();
  if (adminToken.length < 12) {
    ui.alert('관리자 비밀번호는 12자 이상으로 설정해 주세요. 32자 이상을 권장합니다.');
    return;
  }

  const firebaseResponse = ui.prompt('Firebase 웹 API 키 설정', 'Firebase 프로젝트의 웹 API 키를 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (firebaseResponse.getSelectedButton() !== ui.Button.OK) return;
  const firebaseKey = String(firebaseResponse.getResponseText() || '').trim();
  if (!firebaseKey) {
    ui.alert('Firebase 웹 API 키를 입력해 주세요.');
    return;
  }

  PropertiesService.getScriptProperties().setProperties({
    ADMIN_TOKEN: adminToken,
    FIREBASE_API_KEY: firebaseKey
  }, false);
  ui.alert('보안 설정이 저장되었습니다. 웹 앱을 새 버전으로 배포해 주세요.');
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
        version: 6,
        features: ['list', 'projects', 'downloads', 'reply', 'delete', 'project-save', 'project-delete', 'project-upload-image', 'project-upload-attachment', 'member-auth', 'member-download', 'download-admin', 'download-multiple-files']
      });
    }

    if (action === 'list') {
      return json_(listInquiries_(isAdminToken_(params.token)));
    }

    if (action === 'projects') {
      return json_(listProjects_());
    }

    if (action === 'downloads') {
      return json_(listDownloads_());
    }

    return json_({ success: false, error: 'unknown action' });
  } catch (err) {
    return json_({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'admin-auth') {
      return json_({ success: isAdminToken_(data.token) });
    }

    if (data.action === 'member-sync') {
      return handleMemberSync_(data);
    }

    if (data.action === 'member-delete') {
      return handleMemberDelete_(data);
    }

    if (data.action === 'members-list') {
      return handleMembersList_(data);
    }

    if (data.action === 'member-download-attachment') {
      return handleMemberProjectDownload_(data);
    }

    if (data.action === 'member-download') {
      return handleMemberDownload_(data);
    }

    if (data.action === 'download-upload-file') {
      return handleDownloadUploadFile_(data);
    }

    if (data.action === 'download-save') {
      return handleDownloadSave_(data);
    }

    if (data.action === 'download-delete') {
      return handleDownloadDelete_(data);
    }

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

    if (data.action === 'project-upload-attachment') {
      return handleProjectUploadAttachment_(data);
    }

    if (data.action === 'inquiries-admin') {
      if (!isAdminToken_(data.token)) return json_({ success: false, error: 'unauthorized' });
      return json_(listInquiries_(true));
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
  if (!isAdminToken_(data.token)) {
    return json_({ success: false, error: 'unauthorized' });
  }

  const project = data.project || {};
  const sheet = getProjectsSheet_();
  ensureProjectImageColumn_(sheet);
  ensureProjectAttachmentColumn_(sheet);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  const id = project.id ? String(project.id) : String(Date.now());
  const imagesJson = JSON.stringify(Array.isArray(project.images) ? project.images : []);
  const attachmentsJson = JSON.stringify(Array.isArray(project.attachments) ? project.attachments : []);
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
    '첨부파일': attachmentsJson,
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
  if (!isAdminToken_(data.token)) {
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

function handleProjectUploadAttachment_(data) {
  if (!isAdminToken_(data.token)) {
    return json_({ success: false, error: 'unauthorized' });
  }

  const fileName = sanitizeFileName_(data.fileName || 'attachment');
  const extension = getFileExtension_(fileName);
  const allowed = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'zip', 'txt', 'csv'];
  if (allowed.indexOf(extension) < 0) {
    return json_({ success: false, error: 'unsupported type' });
  }

  const bytes = decodeUploadBytes_(data.base64, 5 * 1024 * 1024);
  if (!bytes.success) return json_({ success: false, error: bytes.error });
  const mimeType = String(data.mimeType || 'application/octet-stream');
  const file = getOrCreateMemberFilesFolder_().createFile(Utilities.newBlob(bytes.value, mimeType, fileName));
  return json_({ success: true, attachment: {
    fileId: file.getId(),
    name: file.getName(),
    mimeType: file.getMimeType(),
    size: file.getSize()
  } });
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

function ensureProjectAttachmentColumn_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf('첨부파일') >= 0) return;
  const updatedIdx = headers.indexOf('수정일시');
  if (updatedIdx >= 0) {
    sheet.insertColumnBefore(updatedIdx + 1);
    sheet.getRange(1, updatedIdx + 1).setValue('첨부파일').setFontWeight('bold');
    return;
  }
  sheet.getRange(1, lastCol + 1).setValue('첨부파일').setFontWeight('bold');
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

function parseProjectAttachments_(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function (item) {
      return item && item.fileId && item.name;
    }).map(function (item) {
      return {
        fileId: String(item.fileId),
        name: String(item.name),
        mimeType: String(item.mimeType || 'application/octet-stream'),
        size: Number(item.size) || 0
      };
    });
  } catch (e) {
    return [];
  }
}

function handleProjectDelete_(data) {
  if (!isAdminToken_(data.token)) {
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
    sheet.getRange(1, 1, 1, 11).setValues([[
      'ID', '프로젝트명', '담당', '시작일', '목표일', '진행률', '상태', '개발내용', '이미지', '첨부파일', '수정일시'
    ]]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
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
    attachments: parseProjectAttachments_(get('첨부파일')),
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

function getAdminToken_() {
  return String(PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || LEGACY_ADMIN_TOKEN);
}

function isAdminToken_(token) {
  const value = String(token || '');
  return Boolean(value) && value === getAdminToken_();
}

function getFirebaseApiKey_() {
  return String(PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY') || FIREBASE_API_KEY_FALLBACK);
}

function verifyFirebaseUser_(idToken) {
  const token = String(idToken || '');
  if (!token) throw new Error('로그인이 필요합니다.');
  const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(getFirebaseApiKey_()), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: token }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('회원 인증이 만료되었습니다. 다시 로그인해 주세요.');
  }
  const result = JSON.parse(response.getContentText() || '{}');
  const user = result.users && result.users[0];
  if (!user || !user.localId) throw new Error('회원 정보를 확인할 수 없습니다.');
  return user;
}

function requireVerifiedMember_(idToken) {
  const user = verifyFirebaseUser_(idToken);
  if (!user.emailVerified) throw new Error('이메일 인증 후 다운로드할 수 있습니다.');
  return user;
}

function getMembersSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(MEMBER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MEMBER_SHEET_NAME);
    sheet.getRange(1, 1, 1, 6).setValues([['UID', '이름', '이메일', '이메일인증', '가입일', '최근로그인']]);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setTabColor('#8b5cf6');
  }
  return sheet;
}

function findMemberRowByUid_(sheet, uid) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(uid)) return i + 2;
  }
  return 0;
}

function handleMemberSync_(data) {
  const user = verifyFirebaseUser_(data.idToken);
  const sheet = getMembersSheet_();
  const row = findMemberRowByUid_(sheet, user.localId);
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  const existingJoinedAt = row ? String(sheet.getRange(row, 5).getValue() || now) : now;
  const displayName = String(user.displayName || data.displayName || '').trim();
  const values = [
    String(user.localId),
    displayName,
    String(user.email || ''),
    Boolean(user.emailVerified),
    existingJoinedAt,
    data.loginEvent ? now : (row ? String(sheet.getRange(row, 6).getValue() || '') : '')
  ];
  if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  return json_({ success: true, member: {
    uid: user.localId,
    name: displayName,
    email: user.email || '',
    emailVerified: Boolean(user.emailVerified),
    joinedAt: existingJoinedAt,
    lastLogin: values[5]
  } });
}

function handleMembersList_(data) {
  if (!isAdminToken_(data.token)) return json_({ success: false, error: 'unauthorized' });
  const sheet = getMembersSheet_();
  const values = sheet.getDataRange().getValues();
  const members = [];
  for (let i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    members.push({
      uid: String(values[i][0] || ''),
      name: String(values[i][1] || ''),
      email: String(values[i][2] || ''),
      emailVerified: values[i][3] === true || String(values[i][3]).toLowerCase() === 'true',
      joinedAt: String(values[i][4] || ''),
      lastLogin: String(values[i][5] || '')
    });
  }
  members.sort(function (a, b) { return b.joinedAt.localeCompare(a.joinedAt); });
  return json_({ success: true, members: members });
}

function handleMemberDelete_(data) {
  const user = verifyFirebaseUser_(data.idToken);
  const response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + encodeURIComponent(getFirebaseApiKey_()), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: String(data.idToken || '') }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    return json_({ success: false, error: 'Firebase 계정을 삭제하지 못했습니다.' });
  }
  const sheet = getMembersSheet_();
  const row = findMemberRowByUid_(sheet, user.localId);
  if (row) sheet.deleteRow(row);
  return json_({ success: true });
}

function getOrCreateMemberFilesFolder_() {
  const folderName = 'edgacst-member-files';
  const folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}

function handleMemberProjectDownload_(data) {
  requireVerifiedMember_(data.idToken);
  const fileId = String(data.fileId || '');
  if (!fileId) return json_({ success: false, error: '첨부파일 정보가 없습니다.' });

  const projects = listProjects_().projects || [];
  let allowed = false;
  for (let i = 0; i < projects.length && !allowed; i++) {
    const attachments = projects[i].attachments || [];
    allowed = attachments.some(function (item) { return String(item.fileId) === fileId; });
  }
  if (!allowed) return json_({ success: false, error: '등록된 첨부파일이 아닙니다.' });
  return json_(driveFilePayload_(fileId));
}

function getDownloadsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(DOWNLOAD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(DOWNLOAD_SHEET_NAME);
    sheet.getRange(1, 1, 1, 10).setValues([[
      'ID', '파일명', '프로그램설명', '파일용량', '첨부파일ID', '첨부파일명', 'MIME타입', '첨부파일목록', '다운로드수', '수정일시'
    ]]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setTabColor('#0ea5e9');
  }
  ensureDownloadAttachmentsColumn_(sheet);
  return sheet;
}

function ensureDownloadAttachmentsColumn_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.indexOf('첨부파일목록') >= 0) return;
  const countIdx = headers.indexOf('다운로드수');
  if (countIdx >= 0) {
    sheet.insertColumnBefore(countIdx + 1);
    sheet.getRange(1, countIdx + 1).setValue('첨부파일목록').setFontWeight('bold');
    return;
  }
  sheet.getRange(1, lastCol + 1).setValue('첨부파일목록').setFontWeight('bold');
}

function listDownloads_() {
  const sheet = getDownloadsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { success: true, downloads: [] };
  const headers = values[0].map(String);
  const downloads = [];
  for (let i = 1; i < values.length; i++) {
    const item = parseDownloadRow_(values[i], headers, i + 1);
    if (!item.id || !item.attachments.length) continue;
    downloads.push({
      id: item.id,
      name: item.name,
      description: item.description,
      fileSize: item.attachments.reduce(function (sum, file) { return sum + (Number(file.size) || 0); }, 0),
      fileName: item.attachments[0].fileName,
      attachments: item.attachments.map(function (file) {
        return { fileName: file.fileName, size: file.size, mimeType: file.mimeType };
      }),
      downloadCount: item.downloadCount,
      updatedAt: item.updatedAt
    });
  }
  downloads.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  return { success: true, downloads: downloads };
}

function parseDownloadRow_(row, headers, rowIndex) {
  const get = function (name) {
    const index = headers.indexOf(name);
    return index >= 0 ? row[index] : '';
  };
  const legacy = {
    fileId: String(get('첨부파일ID') || ''),
    fileName: String(get('첨부파일명') || ''),
    mimeType: String(get('MIME타입') || 'application/octet-stream'),
    size: Number(get('파일용량')) || 0
  };
  const attachments = parseDownloadAttachments_(get('첨부파일목록'), legacy);
  return {
    row: rowIndex,
    id: String(get('ID') || ''),
    name: String(get('파일명') || ''),
    description: String(get('프로그램설명') || ''),
    fileSize: attachments.reduce(function (sum, file) { return sum + (Number(file.size) || 0); }, 0),
    fileId: attachments.length ? attachments[0].fileId : '',
    fileName: attachments.length ? attachments[0].fileName : '',
    mimeType: attachments.length ? attachments[0].mimeType : 'application/octet-stream',
    attachments: attachments,
    downloadCount: Number(get('다운로드수')) || 0,
    updatedAt: String(get('수정일시') || '')
  };
}

function parseDownloadAttachments_(value, legacy) {
  const raw = String(value || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const attachments = parsed.filter(function (item) {
          return item && item.fileId && item.fileName;
        }).map(function (item) {
          return {
            fileId: String(item.fileId),
            fileName: String(item.fileName),
            mimeType: String(item.mimeType || 'application/octet-stream'),
            size: Number(item.size) || 0
          };
        });
        if (attachments.length) return attachments;
      }
    } catch (e) {}
  }
  if (legacy && legacy.fileId && legacy.fileName) return [legacy];
  return [];
}

function findDownloadRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function getOrCreateDownloadFolder_() {
  const folderName = 'edgacst-downloads';
  const folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}

function handleDownloadUploadFile_(data) {
  if (!isAdminToken_(data.token)) return json_({ success: false, error: 'unauthorized' });
  const fileName = sanitizeFileName_(data.fileName || 'download');
  const extension = getFileExtension_(fileName);
  const allowed = ['exe', 'msi', 'zip', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt', 'csv'];
  if (allowed.indexOf(extension) < 0) return json_({ success: false, error: '등록할 수 없는 파일 형식입니다.' });
  const bytes = decodeUploadBytes_(data.base64, MAX_DOWNLOAD_FILE_SIZE);
  if (!bytes.success) return json_({ success: false, error: bytes.error });
  const mimeType = String(data.mimeType || 'application/octet-stream');
  const file = getOrCreateDownloadFolder_().createFile(Utilities.newBlob(bytes.value, mimeType, fileName));
  return json_({ success: true, attachment: {
    fileId: file.getId(),
    fileName: file.getName(),
    mimeType: file.getMimeType(),
    size: file.getSize()
  } });
}

function handleDownloadSave_(data) {
  if (!isAdminToken_(data.token)) return json_({ success: false, error: 'unauthorized' });
  const input = data.download || {};
  const sheet = getDownloadsSheet_();
  const id = input.id ? String(input.id) : String(Date.now());
  const row = findDownloadRowById_(sheet, id);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const existing = row ? parseDownloadRow_(sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0], headers, row) : null;
  const existingAttachments = existing ? existing.attachments : [];
  const requestedAttachments = Array.isArray(input.attachments) ? input.attachments : (input.attachment ? [input.attachment] : null);
  let attachments = existingAttachments;
  if (requestedAttachments) {
    attachments = requestedAttachments.map(function (attachment) {
      const existingIndex = Number(attachment && attachment.existingIndex);
      if (attachment && attachment.existingIndex !== undefined && Number.isInteger(existingIndex) && existingAttachments[existingIndex]) {
        return existingAttachments[existingIndex];
      }
      if (!attachment || !attachment.fileId || !attachment.fileName) return null;
      return {
        fileId: String(attachment.fileId),
        fileName: String(attachment.fileName),
        mimeType: String(attachment.mimeType || 'application/octet-stream'),
        size: Number(attachment.size) || 0
      };
    }).filter(Boolean);
  }
  if (attachments.length > 5) return json_({ success: false, error: '첨부파일은 최대 5개까지 등록할 수 있습니다.' });
  const name = String(input.name || '').trim();
  const description = String(input.description || '').trim();
  if (!name || !description || !attachments.length) return json_({ success: false, error: '필수 정보를 모두 입력해 주세요.' });
  const now = Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss");
  const first = attachments[0];
  const fieldMap = {
    'ID': id,
    '파일명': name,
    '프로그램설명': description,
    '파일용량': attachments.reduce(function (sum, file) { return sum + (Number(file.size) || 0); }, 0),
    '첨부파일ID': first.fileId,
    '첨부파일명': first.fileName,
    'MIME타입': first.mimeType,
    '첨부파일목록': JSON.stringify(attachments),
    '다운로드수': existing ? existing.downloadCount : 0,
    '수정일시': now
  };
  const values = headers.map(function (header) { return fieldMap[header] !== undefined ? fieldMap[header] : ''; });
  if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  return json_({ success: true, id: id });
}

function handleDownloadDelete_(data) {
  if (!isAdminToken_(data.token)) return json_({ success: false, error: 'unauthorized' });
  const sheet = getDownloadsSheet_();
  const row = findDownloadRowById_(sheet, data.id);
  if (!row) return json_({ success: false, error: '항목을 찾을 수 없습니다.' });
  sheet.deleteRow(row);
  return json_({ success: true });
}

function handleMemberDownload_(data) {
  requireVerifiedMember_(data.idToken);
  const sheet = getDownloadsSheet_();
  const row = findDownloadRowById_(sheet, data.id);
  if (!row) return json_({ success: false, error: '다운로드 항목을 찾을 수 없습니다.' });
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const item = parseDownloadRow_(sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0], headers, row);
  const attachmentIndex = Math.max(0, Number(data.attachmentIndex) || 0);
  const attachment = item.attachments[attachmentIndex];
  if (!attachment) return json_({ success: false, error: '첨부파일을 찾을 수 없습니다.' });
  const payload = driveFilePayload_(attachment.fileId);
  if (!payload.success) return json_(payload);

  const countColumn = headers.indexOf('다운로드수') + 1;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const current = Number(sheet.getRange(row, countColumn).getValue()) || 0;
    sheet.getRange(row, countColumn).setValue(current + 1);
  } finally {
    lock.releaseLock();
  }
  return json_(payload);
}

function driveFilePayload_(fileId) {
  try {
    const file = DriveApp.getFileById(String(fileId || ''));
    const blob = file.getBlob();
    return {
      success: true,
      fileName: file.getName(),
      mimeType: blob.getContentType() || file.getMimeType() || 'application/octet-stream',
      base64: Utilities.base64Encode(blob.getBytes())
    };
  } catch (e) {
    return { success: false, error: '첨부파일을 찾을 수 없습니다.' };
  }
}

function sanitizeFileName_(fileName) {
  return String(fileName || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').substring(0, 180);
}

function getFileExtension_(fileName) {
  const parts = String(fileName || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function decodeUploadBytes_(base64, maxSize) {
  const encoded = String(base64 || '');
  if (!encoded) return { success: false, error: '파일 데이터가 없습니다.' };
  try {
    const bytes = Utilities.base64Decode(encoded);
    if (!bytes.length) return { success: false, error: '빈 파일은 등록할 수 없습니다.' };
    if (bytes.length > maxSize) return { success: false, error: '파일 용량 제한을 초과했습니다.' };
    return { success: true, value: bytes };
  } catch (e) {
    return { success: false, error: '파일 데이터를 읽을 수 없습니다.' };
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
  if (!isAdminToken_(data.token)) {
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
  if (!isAdminToken_(data.token)) {
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
