const MAX_DOWNLOAD_FILE_SIZE = 10 * 1024 * 1024;
const DOWNLOAD_FILE_EXTENSIONS = ['exe', 'msi', 'zip', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt', 'csv'];

let downloadItems = [];
let selectedDownloadFile = null;

document.addEventListener('DOMContentLoaded', initDownloadPage);

function initDownloadPage() {
  if (!document.getElementById('downloadTableBody')) return;
  initDownloadAdmin();
  initDownloadForm();
  initDownloadTableActions();
  refreshDownloadMemberNotice();
  loadDownloads();
}

async function loadDownloads() {
  const body = document.getElementById('downloadTableBody');
  const count = document.getElementById('downloadListCount');
  if (!body) return;

  try {
    const url = new URL(GOOGLE_CONFIG.SCRIPT_URL);
    url.searchParams.set('action', 'downloads');
    url.searchParams.set('_', Date.now());
    const response = await fetch(url.toString(), { redirect: 'follow', cache: 'no-store' });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || '목록을 불러오지 못했습니다.');
    downloadItems = Array.isArray(data.downloads) ? data.downloads : [];
    renderDownloads();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="5" class="download-state-cell download-state-error">${escapeHtml(error.message || '다운로드 목록을 불러오지 못했습니다.')}</td></tr>`;
    if (count) count.textContent = '목록을 불러오지 못했습니다.';
  }
}

function renderDownloads() {
  const body = document.getElementById('downloadTableBody');
  const count = document.getElementById('downloadListCount');
  if (!body) return;

  if (count) count.textContent = `총 ${downloadItems.length}개의 프로그램`;
  if (!downloadItems.length) {
    body.innerHTML = '<tr><td colspan="5" class="download-state-cell">등록된 프로그램이 없습니다.</td></tr>';
    return;
  }

  const admin = isAdminLoggedIn();
  body.innerHTML = downloadItems.map((item) => {
    const id = escapeHtml(String(item.id || ''));
    const adminActions = admin
      ? `<div class="download-admin-actions"><button type="button" class="btn-sm btn-edit" data-download-edit="${id}">수정</button><button type="button" class="btn-sm btn-delete" data-download-delete="${id}">삭제</button></div>`
      : '';
    return `<tr data-download-row="${id}">
      <td class="download-name-cell"><strong>${escapeHtml(item.name || item.fileName || '프로그램')}</strong>${adminActions}</td>
      <td class="download-desc-cell">${escapeHtml(item.description || '-')}</td>
      <td class="download-size-cell">${formatDownloadFileSize(item.fileSize)}</td>
      <td class="download-file-cell"><button type="button" class="download-btn" data-download-id="${id}"><span aria-hidden="true">↓</span> ${escapeHtml(item.fileName || '다운로드')}</button></td>
      <td class="download-count-cell" data-download-count>${Number(item.downloadCount) || 0}</td>
    </tr>`;
  }).join('');
}

function formatDownloadFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function initDownloadTableActions() {
  document.getElementById('downloadTableBody')?.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-download-edit]');
    if (edit) return startDownloadEdit(edit.dataset.downloadEdit);
    const remove = event.target.closest('[data-download-delete]');
    if (remove) deleteDownloadItem(remove.dataset.downloadDelete);
  });
}

function initDownloadAdmin() {
  const adminButton = document.getElementById('adminLoginBtn');
  const logoutButton = document.getElementById('downloadAdminLogoutBtn');
  const loginForm = document.getElementById('loginForm');

  updateDownloadAdminUI();
  adminButton?.addEventListener('click', () => {
    if (isAdminLoggedIn()) {
      document.getElementById('downloadAdminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      openLoginModal();
    }
  });

  logoutButton?.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    resetDownloadForm();
    updateDownloadAdminUI();
    showToast('로그아웃되었습니다.');
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('adminPassword').value;
    try {
      const data = await apiPost({ action: 'admin-auth', token: password });
      if (!data.success) throw new Error('unauthorized');
      sessionStorage.setItem(ADMIN_SESSION_KEY, password);
      closeLoginModal();
      updateDownloadAdminUI();
      showToast('관리자 로그인되었습니다.');
      document.getElementById('downloadAdminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      showToast('비밀번호가 올바르지 않습니다.');
    }
  });

  document.getElementById('loginCancelBtn')?.addEventListener('click', closeLoginModal);
  document.getElementById('loginModalBackdrop')?.addEventListener('click', closeLoginModal);
  if (new URLSearchParams(location.search).get('admin') === '1') adminButton?.click();
}

function updateDownloadAdminUI() {
  const admin = isAdminLoggedIn();
  document.getElementById('downloadAdminPanel')?.classList.toggle('hidden', !admin);
  const adminButton = document.getElementById('adminLoginBtn');
  if (adminButton) adminButton.textContent = admin ? '관리 패널' : '관리자';
  renderDownloads();
}

function initDownloadForm() {
  const form = document.getElementById('downloadForm');
  const fileInput = document.getElementById('downloadFile');
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0] || null;
    if (!file) return;
    const extension = file.name.split('.').pop().toLowerCase();
    if (!DOWNLOAD_FILE_EXTENSIONS.includes(extension)) {
      showToast('등록할 수 없는 파일 형식입니다.');
      fileInput.value = '';
      return;
    }
    if (!file.size || file.size > MAX_DOWNLOAD_FILE_SIZE) {
      showToast('첨부파일은 10MB 이하의 파일만 등록할 수 있습니다.');
      fileInput.value = '';
      return;
    }
    selectedDownloadFile = file;
    const nameInput = document.getElementById('downloadName');
    if (nameInput && !nameInput.value.trim()) nameInput.value = file.name.replace(/\.[^.]+$/, '');
    renderSelectedDownloadFile();
  });

  form?.addEventListener('submit', saveDownloadItem);
  document.getElementById('downloadCancelBtn')?.addEventListener('click', resetDownloadForm);
}

function renderSelectedDownloadFile(existingName = '') {
  const preview = document.getElementById('downloadFilePreview');
  if (!preview) return;
  const label = selectedDownloadFile
    ? `${selectedDownloadFile.name} · ${formatDownloadFileSize(selectedDownloadFile.size)}`
    : existingName;
  preview.textContent = label ? `첨부파일: ${label}` : '';
  preview.classList.toggle('hidden', !label);
}

async function saveDownloadItem(event) {
  event.preventDefault();
  if (!isAdminLoggedIn()) return showToast('관리자 로그인이 필요합니다.');

  const id = document.getElementById('downloadId').value;
  const existing = downloadItems.find((item) => String(item.id) === String(id));
  if (!selectedDownloadFile && !existing) return showToast('첨부파일을 선택해 주세요.');

  const submit = document.getElementById('downloadSubmitBtn');
  submit.disabled = true;
  submit.textContent = id ? '수정 중...' : '등록 중...';

  try {
    let attachment = null;
    if (selectedDownloadFile) {
      const uploaded = await apiPost({
        action: 'download-upload-file',
        token: getAdminPassword(),
        base64: await fileToBase64(selectedDownloadFile),
        mimeType: selectedDownloadFile.type || 'application/octet-stream',
        fileName: selectedDownloadFile.name
      });
      if (!uploaded.success || !uploaded.attachment) throw new Error(uploaded.error || '파일 업로드에 실패했습니다.');
      attachment = uploaded.attachment;
    }

    const saved = await apiPost({
      action: 'download-save',
      token: getAdminPassword(),
      download: {
        id: id || null,
        name: document.getElementById('downloadName').value.trim(),
        description: document.getElementById('downloadDescription').value.trim(),
        attachment
      }
    });
    if (!saved.success) throw new Error(saved.error || '저장하지 못했습니다.');
    resetDownloadForm();
    await loadDownloads();
    showToast(id ? '프로그램 정보가 수정되었습니다.' : '프로그램이 등록되었습니다.');
  } catch (error) {
    showToast(error.message || '프로그램을 저장하지 못했습니다.');
  } finally {
    submit.disabled = false;
    submit.textContent = document.getElementById('downloadId').value ? '수정' : '등록';
  }
}

function startDownloadEdit(id) {
  const item = downloadItems.find((entry) => String(entry.id) === String(id));
  if (!item || !isAdminLoggedIn()) return;
  document.getElementById('downloadId').value = item.id;
  document.getElementById('downloadName').value = item.name || '';
  document.getElementById('downloadDescription').value = item.description || '';
  document.getElementById('downloadSubmitBtn').textContent = '수정';
  document.getElementById('downloadCancelBtn').classList.remove('hidden');
  document.getElementById('downloadFileRequired').classList.add('hidden');
  document.getElementById('downloadFileHint').textContent = '새 파일을 선택하면 기존 첨부파일을 교체합니다.';
  selectedDownloadFile = null;
  document.getElementById('downloadFile').value = '';
  renderSelectedDownloadFile(`${item.fileName || '첨부파일'} · ${formatDownloadFileSize(item.fileSize)}`);
  document.getElementById('downloadAdminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteDownloadItem(id) {
  const item = downloadItems.find((entry) => String(entry.id) === String(id));
  if (!item || !isAdminLoggedIn()) return;
  if (!confirm(`"${item.name || item.fileName}" 항목을 삭제하시겠습니까?`)) return;
  try {
    const data = await apiPost({ action: 'download-delete', token: getAdminPassword(), id });
    if (!data.success) throw new Error(data.error || '삭제하지 못했습니다.');
    resetDownloadForm();
    await loadDownloads();
    showToast('프로그램이 삭제되었습니다.');
  } catch (error) {
    showToast(error.message || '프로그램을 삭제하지 못했습니다.');
  }
}

function resetDownloadForm() {
  document.getElementById('downloadForm')?.reset();
  document.getElementById('downloadId').value = '';
  document.getElementById('downloadSubmitBtn').textContent = '등록';
  document.getElementById('downloadCancelBtn').classList.add('hidden');
  document.getElementById('downloadFileRequired').classList.remove('hidden');
  document.getElementById('downloadFileHint').textContent = 'EXE·MSI·압축파일·문서, 파일당 10MB 이하';
  selectedDownloadFile = null;
  renderSelectedDownloadFile();
}

async function refreshDownloadMemberNotice() {
  const notice = document.getElementById('downloadMemberNotice');
  const link = document.getElementById('downloadMemberLink');
  if (!notice || typeof currentMemberSession !== 'function') return;
  try {
    const session = await currentMemberSession();
    if (!session) return;
    const paragraph = notice.querySelector('p');
    notice.classList.add('is-member');
    if (paragraph) paragraph.textContent = session.emailVerified
      ? `${session.displayName || session.email}님, 지금 바로 무료 프로그램을 다운로드할 수 있습니다.`
      : '이메일 인증을 완료하면 무료 프로그램을 다운로드할 수 있습니다.';
    if (link) {
      link.textContent = session.emailVerified ? '내 계정' : '이메일 인증하기';
      link.href = 'members.html';
    }
  } catch {}
}
