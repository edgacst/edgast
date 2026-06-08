document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
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
  document.querySelectorAll('.footer-admin-btn[data-admin-link]').forEach(btn => {
    btn.addEventListener('click', () => {
      location.href = `${btn.dataset.adminLink}?admin=1`;
    });
  });
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
    renderStatusTable();
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
      showToast('관리자 로그인되었습니다.');
      adminPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function initInquiryForm() {
  const form = document.getElementById('inquiryForm');
  if (!form) return;

  renderInquiryList();

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const inquiry = {
      id: Date.now(),
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      subject: form.subject.value.trim(),
      message: form.message.value.trim(),
      date: new Date().toLocaleString('ko-KR')
    };

    const inquiries = getInquiries();
    inquiries.unshift(inquiry);
    localStorage.setItem('edgacst_inquiries', JSON.stringify(inquiries));

    form.reset();
    renderInquiryList();
    showToast('문의가 등록되었습니다.');
  });
}

function getInquiries() {
  try {
    return JSON.parse(localStorage.getItem('edgacst_inquiries')) || [];
  } catch {
    return [];
  }
}

function renderInquiryList() {
  const listItems = document.getElementById('listItems');
  const listEmpty = document.getElementById('listEmpty');
  if (!listItems || !listEmpty) return;

  const inquiries = getInquiries();

  if (inquiries.length === 0) {
    listEmpty.style.display = 'block';
    listItems.innerHTML = '';
    return;
  }

  listEmpty.style.display = 'none';
  listItems.innerHTML = inquiries.map(item => `
    <div class="inquiry-item">
      <div class="inquiry-item-header">
        <span class="inquiry-item-subject">${escapeHtml(item.subject)}</span>
        <span class="inquiry-item-date">${escapeHtml(item.date)}</span>
      </div>
      <div class="inquiry-item-meta">${escapeHtml(item.name)} · ${escapeHtml(item.email)}</div>
      <p class="inquiry-item-message">${linkifyText(item.message)}</p>
    </div>
  `).join('');
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
