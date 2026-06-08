document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initInquiryBoard();
  initInquiryForm();
  initStatusPage();
  initFooterAdmin();
});

const STATUS_LABELS = {
  progress: '진행중',
  review: '검수중',
  done: '완료',
  waiting: '대기'
};

const PROJECTS_KEY = 'edgacst_projects';
const ADMIN_PASSWORD_KEY = 'edgacst_admin_password';
const ADMIN_SESSION_KEY = 'edgacst_admin_session';
const DEFAULT_ADMIN_PASSWORD = '1324';

const DEFAULT_PROJECTS = [
  {
    id: 1,
    name: '홈페이지 리뉴얼',
    assignee: '개발팀',
    start: '2026-03-01',
    end: '2026-04-15',
    progress: 75,
    status: 'progress',
    content: '메인 페이지 및 사업영역 페이지 디자인 완료. 문의게시판 UI 구현 중.',
    updatedAt: '2026-03-15T10:00:00'
  },
  {
    id: 2,
    name: '고객 관리 시스템',
    assignee: '개발팀',
    start: '2026-02-10',
    end: '2026-05-30',
    progress: 40,
    status: 'progress',
    content: '회원 관리 모듈 개발 완료. 주문 관리 화면 설계 진행 중.',
    updatedAt: '2026-03-10T14:30:00'
  }
];

function initStatusPage() {
  const tbody = document.getElementById('statusTableBody');
  if (!tbody) return;

  seedProjectsIfEmpty();
  renderStatusTable();
  initStatusAdmin();
}

function seedProjectsIfEmpty() {
  if (!localStorage.getItem(PROJECTS_KEY)) {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(DEFAULT_PROJECTS));
  }
  localStorage.setItem(ADMIN_PASSWORD_KEY, DEFAULT_ADMIN_PASSWORD);
}

function getProjects() {
  try {
    return JSON.parse(localStorage.getItem(PROJECTS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

function getAdminPassword() {
  return localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
}

function renderStatusTable() {
  const tbody = document.getElementById('statusTableBody');
  const statusEmpty = document.getElementById('statusEmpty');
  const adminColHeader = document.getElementById('adminColHeader');
  const statusUpdated = document.getElementById('statusUpdated');
  const isAdmin = isAdminLoggedIn();

  const projects = getProjects();

  if (adminColHeader) {
    adminColHeader.classList.toggle('hidden', !isAdmin);
  }

  if (projects.length === 0) {
    tbody.innerHTML = '';
    statusEmpty?.classList.remove('hidden');
    updateStatusStats([]);
    if (statusUpdated) statusUpdated.textContent = '';
    return;
  }

  statusEmpty?.classList.add('hidden');

  const latestUpdate = projects.reduce((latest, p) => {
    const date = p.updatedAt || '';
    return date > latest ? date : latest;
  }, '');

  if (statusUpdated && latestUpdate) {
    statusUpdated.textContent = `최종 업데이트: ${formatDateTime(latestUpdate)}`;
  }

  tbody.innerHTML = projects.map(p => `
    <tr>
      <td>
        <strong>${escapeHtml(p.name)}</strong>
        ${p.content ? `<div class="status-content-cell">${linkifyText(p.content)}</div>` : ''}
      </td>
      <td>${escapeHtml(p.assignee)}</td>
      <td>${escapeHtml(p.start)}</td>
      <td>${escapeHtml(p.end)}</td>
      <td>
        <div class="progress-bar">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${p.progress}%"></div>
          </div>
          <span class="progress-text">${p.progress}%</span>
        </div>
      </td>
      <td><span class="status-badge ${p.status}">${STATUS_LABELS[p.status]}</span></td>
      ${isAdmin ? `
        <td class="col-admin">
          <div class="admin-actions">
            <button type="button" class="btn-sm btn-edit" data-edit="${p.id}">수정</button>
            <button type="button" class="btn-sm btn-delete" data-delete="${p.id}">삭제</button>
          </div>
        </td>
      ` : ''}
    </tr>
  `).join('');

  updateStatusStats(projects);

  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => startEditProject(Number(btn.dataset.edit)));
  });

  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteProject(Number(btn.dataset.delete)));
  });
}

function updateStatusStats(projects) {
  const counts = { total: projects.length, progress: 0, review: 0, done: 0 };
  projects.forEach(p => {
    if (p.status === 'progress') counts.progress++;
    else if (p.status === 'review') counts.review++;
    else if (p.status === 'done') counts.done++;
  });

  const statTotal = document.getElementById('statTotal');
  const statProgress = document.getElementById('statProgress');
  const statReview = document.getElementById('statReview');
  const statDone = document.getElementById('statDone');

  if (statTotal) statTotal.textContent = counts.total;
  if (statProgress) statProgress.textContent = counts.progress;
  if (statReview) statReview.textContent = counts.review;
  if (statDone) statDone.textContent = counts.done;
}

function initFooterAdmin() {
  initInquiryAdminBtn();
}

function handleAdminLoginClick() {
  if (isAdminLoggedIn()) {
    document.getElementById('adminPanel')?.classList.remove('hidden');
    document.getElementById('adminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    openLoginModal();
  }
}

function initStatusAdmin() {
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const adminPanel = document.getElementById('adminPanel');
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const loginCancelBtn = document.getElementById('loginCancelBtn');
  const loginModalBackdrop = document.getElementById('loginModalBackdrop');
  const projectForm = document.getElementById('projectForm');
  const projectCancelBtn = document.getElementById('projectCancelBtn');

  updateAdminUI();

  adminLoginBtn?.addEventListener('click', handleAdminLoginClick);

  if (new URLSearchParams(location.search).get('admin') === '1') {
    handleAdminLoginClick();
  }

  adminLogoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    resetProjectForm();
    updateAdminUI();
    updateInquiryAdminBtn();
    updateInquiryAdminUI();
    renderStatusTable();
    loadInquiries();
    showToast('로그아웃되었습니다.');
  });

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    if (password === getAdminPassword()) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
      closeLoginModal();
      updateAdminUI();
      renderStatusTable();
      updateInquiryAdminBtn();
      updateInquiryAdminUI();
      loadInquiries();
      showToast('관리자 로그인되었습니다.');
      if (adminPanel) {
        adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        document.getElementById('inquiryListSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      showToast('비밀번호가 올바르지 않습니다.');
    }
  });

  loginCancelBtn?.addEventListener('click', closeLoginModal);
  loginModalBackdrop?.addEventListener('click', closeLoginModal);

  projectForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveProjectFromForm();
  });

  projectCancelBtn?.addEventListener('click', resetProjectForm);
}

function updateAdminUI() {
  const isAdmin = isAdminLoggedIn();
  const adminPanel = document.getElementById('adminPanel');
  const adminLoginBtn = document.getElementById('adminLoginBtn');

  adminPanel?.classList.toggle('hidden', !isAdmin);
  if (adminLoginBtn) {
    adminLoginBtn.textContent = isAdmin ? '관리 패널' : '관리자';
  }
}

function openLoginModal() {
  const loginModal = document.getElementById('loginModal');
  const adminPassword = document.getElementById('adminPassword');
  loginModal?.classList.remove('hidden');
  if (adminPassword) {
    adminPassword.value = '';
    adminPassword.focus();
  }
}

function closeLoginModal() {
  document.getElementById('loginModal')?.classList.add('hidden');
  const loginForm = document.getElementById('loginForm');
  loginForm?.reset();
}

function saveProjectFromForm() {
  const form = document.getElementById('projectForm');
  const idInput = document.getElementById('projectId');
  const projects = getProjects();

  const project = {
    id: idInput.value ? Number(idInput.value) : Date.now(),
    name: form.name.value.trim(),
    assignee: form.assignee.value.trim(),
    start: form.start.value,
    end: form.end.value,
    progress: Math.min(100, Math.max(0, Number(form.progress.value) || 0)),
    status: form.status.value,
    content: form.content.value.trim(),
    updatedAt: new Date().toISOString()
  };

  const existingIndex = projects.findIndex(p => p.id === project.id);
  if (existingIndex >= 0) {
    projects[existingIndex] = project;
    showToast('업무가 수정되었습니다.');
  } else {
    projects.unshift(project);
    showToast('업무가 등록되었습니다.');
  }

  saveProjects(projects);
  resetProjectForm();
  renderStatusTable();
}

function startEditProject(id) {
  const project = getProjects().find(p => p.id === id);
  if (!project) return;

  document.getElementById('projectId').value = project.id;
  document.getElementById('projectName').value = project.name;
  document.getElementById('projectAssignee').value = project.assignee;
  document.getElementById('projectStart').value = project.start;
  document.getElementById('projectEnd').value = project.end;
  document.getElementById('projectProgress').value = project.progress;
  document.getElementById('projectStatus').value = project.status;
  document.getElementById('projectContent').value = project.content || '';
  document.getElementById('projectSubmitBtn').textContent = '수정';
  document.getElementById('projectCancelBtn')?.classList.remove('hidden');

  document.getElementById('adminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteProject(id) {
  const project = getProjects().find(p => p.id === id);
  if (!project) return;
  if (!confirm(`"${project.name}" 항목을 삭제하시겠습니까?`)) return;

  const projects = getProjects().filter(p => p.id !== id);
  saveProjects(projects);
  renderStatusTable();
  showToast('업무가 삭제되었습니다.');
}

function resetProjectForm() {
  const form = document.getElementById('projectForm');
  form?.reset();
  document.getElementById('projectId').value = '';
  document.getElementById('projectProgress').value = '0';
  document.getElementById('projectSubmitBtn').textContent = '등록';
  document.getElementById('projectCancelBtn')?.classList.add('hidden');
}

function formatDateTime(isoString) {
  try {
    return new Date(isoString).toLocaleString('ko-KR');
  } catch {
    return isoString;
  }
}

function initMobileMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
  });

  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => nav.classList.remove('open'));
  });
}

function initInquiryBoard() {
  if (!document.getElementById('inquiryListContainer')) return;

  document.getElementById('inquiryRefreshBtn')?.addEventListener('click', () => loadInquiries());
  document.getElementById('inquiryAdminLoginBtn')?.addEventListener('click', () => openLoginModal());
  document.getElementById('inquiryLogoutBtn')?.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    updateInquiryAdminBtn();
    updateInquiryAdminUI();
    loadInquiries();
    showToast('로그아웃되었습니다.');
  });

  document.getElementById('inquiryListContainer')?.addEventListener('click', (e) => {
    const replyBtn = e.target.closest('.inquiry-reply-btn');
    if (replyBtn) {
      submitInquiryReply(replyBtn);
      return;
    }
    const deleteBtn = e.target.closest('.inquiry-delete-btn');
    if (deleteBtn) {
      deleteInquiry(deleteBtn);
    }
  });

  updateInquiryAdminUI();
  loadInquiries();
  initInquiryLogin();
}

function initInquiryForm() {
  const form = document.getElementById('inquiryForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!hasGoogleFormConfig()) {
      showToast('문의 연동이 설정되지 않았습니다.');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '등록 중...';

    try {
      const params = new URLSearchParams();
      const entries = GOOGLE_CONFIG.FORM_ENTRIES;
      params.append(entries.name, form.name.value.trim());
      params.append(entries.email, form.email.value.trim());
      params.append(entries.phone, form.phone.value.trim());
      params.append(entries.subject, form.subject.value.trim());
      params.append(entries.message, form.message.value.trim());

      await fetch(GOOGLE_CONFIG.FORM_ACTION_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      form.reset();
      showToast('문의가 등록되었습니다. 공개게시판에서 확인할 수 있습니다.');
    } catch {
      showToast('문의 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '문의 등록';
    }
  });
}

function hasGoogleFormConfig() {
  if (typeof GOOGLE_CONFIG === 'undefined') return false;
  const entries = GOOGLE_CONFIG.FORM_ENTRIES || {};
  return Boolean(
    GOOGLE_CONFIG.FORM_ACTION_URL &&
    entries.name &&
    entries.email &&
    entries.subject &&
    entries.message
  );
}

function updateInquiryAdminBtn() {
  document.querySelectorAll('#inquiryAdminBtn').forEach(btn => {
    btn.classList.toggle('hidden', !isAdminLoggedIn());
  });
}

function initInquiryAdminBtn() {
  document.querySelectorAll('#inquiryAdminBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isAdminLoggedIn()) return;
      if (document.getElementById('inquiryListSection')) {
        document.getElementById('inquiryListSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        loadInquiries();
        return;
      }
      location.href = 'board.html';
    });
  });
  updateInquiryAdminBtn();
}

function updateInquiryAdminUI() {
  const loggedIn = isAdminLoggedIn();
  document.getElementById('inquiryLogoutBtn')?.classList.toggle('hidden', !loggedIn);
  document.getElementById('inquiryAdminLoginBtn')?.classList.toggle('hidden', loggedIn);
  document.getElementById('inquiryAdminBanner')?.classList.toggle('hidden', !loggedIn);
  document.getElementById('inquiryListSection')?.classList.toggle('inquiry-list--admin', loggedIn);
}

function formatInquiryDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

function hasScriptConfig() {
  return Boolean(GOOGLE_CONFIG?.SCRIPT_URL);
}

async function loadInquiries() {
  const container = document.getElementById('inquiryListContainer');
  if (!container) return;

  if (!hasScriptConfig()) {
    container.innerHTML = `
      <div class="list-error">
        <p>문의 목록을 표시하려면 Apps Script 웹앱 URL이 필요합니다.</p>
        <p style="margin-top:8px;font-size:0.9rem;">google-apps-script/Code.gs 를 배포한 뒤 <code>js/config.js</code> 의 <code>SCRIPT_URL</code> 에 입력해 주세요.</p>
      </div>`;
    return;
  }

  container.innerHTML = '<p class="list-loading">문의 목록을 불러오는 중...</p>';

  try {
    const url = new URL(GOOGLE_CONFIG.SCRIPT_URL);
    url.searchParams.set('action', 'list');
    if (isAdminLoggedIn()) {
      url.searchParams.set('token', getAdminPassword());
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'load failed');
    }

    renderInquiryList(data.inquiries || []);
  } catch {
    container.innerHTML = '<p class="list-error">문의 목록을 불러오지 못했습니다. SCRIPT_URL 과 Apps Script 배포를 확인해 주세요.</p>';
  }
}

function renderInquiryList(inquiries) {
  const container = document.getElementById('inquiryListContainer');
  if (!container) return;

  updateInquiryAdminUI();

  if (!inquiries.length) {
    container.innerHTML = '<p class="list-empty">등록된 문의가 없습니다.</p>';
    return;
  }

  const admin = isAdminLoggedIn();
  container.innerHTML = `<div class="list-items">${inquiries.map(item => renderInquiryItem(item, admin)).join('')}</div>`;
}

function renderInquiryItem(item, admin) {
  const hasReply = Boolean(item.reply || item.hasReply);

  const replyHtml = hasReply
    ? `<div class="inquiry-item-reply">
        <span class="inquiry-reply-label">관리자 답변</span>
        <div class="inquiry-reply-body">${linkifyText(item.reply)}</div>
      </div>`
    : '';

  const statusBadge = hasReply
    ? '<span class="inquiry-status answered">답변완료</span>'
    : '<span class="inquiry-status waiting">답변대기</span>';

  const adminBlock = admin
    ? `<div class="inquiry-item-admin">
        <p class="inquiry-admin-only-label">관리자 전용</p>
        <p class="inquiry-item-contact">이메일: ${escapeHtml(item.email || '-')} · 연락처: ${escapeHtml(item.phone || '-')}</p>
        ${hasReply ? '' : '<p class="inquiry-reply-pending">답변 대기 중입니다.</p>'}
        <div class="inquiry-reply-form">
          <label class="inquiry-reply-form-label">답변 작성</label>
          <textarea class="inquiry-reply-input" rows="3" data-row="${item.row}" placeholder="답변 내용을 입력하세요">${escapeHtml(item.reply || '')}</textarea>
          <div class="inquiry-admin-actions">
            <button type="button" class="btn btn-primary btn-sm inquiry-reply-btn" data-row="${item.row}">답변 등록</button>
            <button type="button" class="btn btn-danger btn-sm inquiry-delete-btn" data-row="${item.row}">삭제</button>
          </div>
        </div>
      </div>`
    : '';

  return `
    <article class="inquiry-item" data-row="${item.row}">
      <div class="inquiry-item-header">
        <h3 class="inquiry-item-subject">${escapeHtml(item.subject || '(제목 없음)')}</h3>
        ${statusBadge}
      </div>
      <div class="inquiry-item-meta">
        <span class="inquiry-item-author">${escapeHtml(item.name || '익명')}</span>
        <span class="inquiry-item-date">${escapeHtml(formatInquiryDate(item.date))}</span>
      </div>
      <div class="inquiry-item-message">${linkifyText(item.message || '')}</div>
      ${replyHtml}
      ${adminBlock}
    </article>`;
}

async function deleteInquiry(btn) {
  if (!isAdminLoggedIn()) {
    showToast('관리자 로그인이 필요합니다.');
    return;
  }

  if (!hasScriptConfig()) {
    showToast('SCRIPT_URL 이 설정되지 않았습니다.');
    return;
  }

  const row = btn.dataset.row;
  const subject = btn.closest('.inquiry-item')?.querySelector('.inquiry-item-subject')?.textContent || '이 문의';
  if (!confirm(`「${subject}」 문의를 삭제하시겠습니까?\n삭제 후에는 복구할 수 없습니다.`)) {
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetch(GOOGLE_CONFIG.SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete',
        token: getAdminPassword(),
        row: Number(row)
      })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'delete failed');
    }

    showToast('문의가 삭제되었습니다.');
    loadInquiries();
  } catch {
    showToast('문의 삭제에 실패했습니다.');
  } finally {
    btn.disabled = false;
  }
}

async function submitInquiryReply(btn) {
  if (!isAdminLoggedIn()) {
    showToast('관리자 로그인이 필요합니다.');
    return;
  }

  if (!hasScriptConfig()) {
    showToast('SCRIPT_URL 이 설정되지 않았습니다.');
    return;
  }

  const row = btn.dataset.row;
  const article = btn.closest('.inquiry-item');
  const textarea = article?.querySelector('.inquiry-reply-input');
  const reply = textarea?.value.trim() || '';

  if (!reply) {
    showToast('답변 내용을 입력해 주세요.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '등록 중...';

  try {
    const res = await fetch(GOOGLE_CONFIG.SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'reply',
        token: getAdminPassword(),
        row: Number(row),
        reply
      })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'reply failed');
    }

    showToast('답변이 등록되었습니다.');
    loadInquiries();
  } catch {
    showToast('답변 등록에 실패했습니다.');
  } finally {
    btn.disabled = false;
    btn.textContent = '답변 등록';
  }
}

function initInquiryLogin() {
  const loginForm = document.getElementById('loginForm');
  const loginCancelBtn = document.getElementById('loginCancelBtn');
  const loginModalBackdrop = document.getElementById('loginModalBackdrop');
  if (!loginForm || !document.getElementById('inquiryListContainer')) return;

  if (new URLSearchParams(location.search).get('admin') === '1') {
    openLoginModal();
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    if (password === getAdminPassword()) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
      closeLoginModal();
      updateInquiryAdminBtn();
      updateInquiryAdminUI();
      loadInquiries();
      showToast('관리자 로그인되었습니다.');
      document.getElementById('inquiryListSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      showToast('비밀번호가 올바르지 않습니다.');
    }
  });

  loginCancelBtn?.addEventListener('click', closeLoginModal);
  loginModalBackdrop?.addEventListener('click', closeLoginModal);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function linkifyText(text) {
  if (!text) return '';

  const escaped = escapeHtml(text);
  const urlPattern = /(\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+)/gi;

  return escaped.replace(urlPattern, (url) => {
    const trimmed = url.replace(/[.,;:!?)]+$/, '');
    const suffix = url.slice(trimmed.length);
    const href = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-link">${trimmed}</a>${suffix}`;
  });
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
