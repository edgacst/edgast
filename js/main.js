document.addEventListener('DOMContentLoaded', () => {
  initActiveNav();
  initPageTransitions();
  initHeaderScroll();
  initMobileMenu();
  initHeroVideo();
  prefetchInquiries();
  prefetchProjects();
  initBoardLinkPrefetch();
  initStatusLinkPrefetch();
  initInquiryBoard();
  initInquiryForm();
  initStatusPage();
  initPortfolioPage();
  initHomePortfolio();
  initHomeStats();
  initFaqPage();
  initFooterAdmin();
});

const STATUS_LABELS = {
  progress: '진행중',
  review: '검수중',
  done: '완료',
  waiting: '대기'
};

const ADMIN_PASSWORD_KEY = 'edgacst_admin_password';
const ADMIN_SESSION_KEY = 'edgacst_admin_session';
const INQUIRIES_CACHE_KEY = 'edgacst_inquiries_cache';
const PROJECTS_CACHE_KEY = 'edgacst_projects_cache';
const INQUIRIES_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_ADMIN_PASSWORD = '1324';

let statusProjects = [];
let projectImageUrls = [];
let portfolioFilter = 'all';

const MAX_PROJECT_IMAGES = 5;
const MAX_PROJECT_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_PROJECT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function initStatusPage() {
  const tbody = document.getElementById('statusTableBody');
  if (!tbody) return;

  localStorage.setItem(ADMIN_PASSWORD_KEY, DEFAULT_ADMIN_PASSWORD);
  initStatusAdmin();
  initProjectImages();

  tbody.addEventListener('click', (e) => {
    const titleBtn = e.target.closest('.board-title-btn');
    if (titleBtn) {
      toggleBoardRow(titleBtn);
      return;
    }

    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      startEditProject(editBtn.dataset.edit);
      return;
    }

    const deleteBtn = e.target.closest('[data-delete]');
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      deleteProject(Number(deleteBtn.dataset.delete));
    }
  });

  loadProjects();
}

function getProjects() {
  return statusProjects;
}

async function apiPost(payload) {
  const res = await fetch(GOOGLE_CONFIG.SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('서버 응답을 읽을 수 없습니다.');
  }
}

function isDriveAuthError(message) {
  const msg = String(message || '');
  return /drive/i.test(msg) || /authorization/i.test(msg) || /권한/i.test(msg);
}

function getProjectSaveErrorMessage(err) {
  const msg = String(err?.message || '');
  if (msg === 'DRIVE_AUTH_REQUIRED' || isDriveAuthError(msg)) {
    return '이미지 업로드 실패: Apps Script에서 「연결 테스트」 실행 후 Drive 권한을 허용해 주세요.';
  }
  if (msg && msg !== 'save failed' && msg !== 'upload failed') {
    return `저장 실패: ${msg}`;
  }
  return '업무 저장에 실패했습니다.';
}

async function migrateLocalProjectsIfNeeded() {
  const raw = localStorage.getItem('edgacst_projects');
  if (!raw || statusProjects.length > 0 || !hasScriptConfig()) return;

  try {
    const localProjects = JSON.parse(raw);
    if (!Array.isArray(localProjects) || !localProjects.length) return;

    for (const project of localProjects) {
      await apiPost({
        action: 'project-save',
        token: getAdminPassword(),
        project: {
          id: project.id || null,
          name: project.name,
          assignee: project.assignee,
          start: project.start,
          end: project.end,
          progress: project.progress,
          status: project.status,
          content: project.content,
          images: project.images || []
        }
      });
    }

    localStorage.removeItem('edgacst_projects');
    showToast('브라우저에 저장된 업무를 스프레드시트로 옮겼습니다.');
    clearProjectCache();
    await loadProjects({ forceRefresh: true });
  } catch {
    // 마이그레이션 실패 시 조용히 무시
  }
}

async function loadProjects(options = {}) {
  const { forceRefresh = false } = options;
  const tbody = document.getElementById('statusTableBody');
  const portfolioGrid = document.getElementById('portfolioGrid');
  const statusEmpty = document.getElementById('statusEmpty');
  const portfolioEmpty = document.getElementById('portfolioEmpty');
  const portfolioLoading = document.getElementById('portfolioLoading');
  if (!tbody && !portfolioGrid) return;

  if (!hasScriptConfig()) {
    statusProjects = [];
    if (tbody) {
      tbody.innerHTML = '';
      statusEmpty?.classList.remove('hidden');
      statusEmpty.querySelector('p').textContent = '스프레드시트 연동이 설정되지 않았습니다.';
    }
    if (portfolioGrid) {
      portfolioLoading?.classList.add('hidden');
      portfolioGrid.innerHTML = '';
      portfolioEmpty?.classList.remove('hidden');
      portfolioEmpty.querySelector('p').textContent = '스프레드시트 연동이 설정되지 않았습니다.';
      updatePortfolioCount(0);
    }
    return;
  }

  if (!forceRefresh) {
    const freshCache = getProjectCache();
    if (freshCache) {
      statusProjects = freshCache;
      renderProjectViews();
      if (isAdminLoggedIn()) {
        migrateLocalProjectsIfNeeded();
      }
      return;
    }
  }

  const staleCache = !forceRefresh ? getProjectCacheStale() : null;
  if (staleCache) {
    statusProjects = staleCache;
    renderProjectViews();
  } else {
    statusEmpty?.classList.add('hidden');
    portfolioEmpty?.classList.add('hidden');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${getStatusTableColspan()}" class="board-loading-cell"><span class="board-loading-spinner"></span> 업무 현황을 불러오는 중...</td></tr>`;
    }
    if (portfolioGrid) {
      portfolioGrid.innerHTML = '';
      portfolioLoading?.classList.remove('hidden');
    }
  }

  try {
    statusProjects = await fetchProjectsFromApi();
    setProjectCache(statusProjects);
    renderProjectViews();
    if (isAdminLoggedIn()) {
      migrateLocalProjectsIfNeeded();
    }
  } catch (err) {
    if (staleCache) return;

    statusProjects = [];
    if (tbody) {
      tbody.innerHTML = '';
      statusEmpty?.classList.remove('hidden');
      const message = String(err?.message || '');
      const emptyText = statusEmpty.querySelector('p');
      if (message.includes('unknown action')) {
        emptyText.innerHTML = '업무 API가 아직 반영되지 않았습니다.<br>① Apps Script Code.gs에 <code>action === \'projects\'</code> 가 있는지 확인<br>② <strong>배포 → 배포 관리</strong>에서 웹앱 URL이 <code>config.js</code>의 SCRIPT_URL과 같은지 확인<br>③ 같지 않으면 <strong>새 배포</strong> 후 URL을 <code>js/config.js</code>에 넣기<br>④ 배포 확인: <a href="' + GOOGLE_CONFIG.SCRIPT_URL + '?action=health" target="_blank" rel="noopener">health</a> · <a href="' + GOOGLE_CONFIG.SCRIPT_URL + '?action=projects" target="_blank" rel="noopener">projects</a>';
      } else if (message) {
        emptyText.textContent = `업무 현황을 불러오지 못했습니다. (${message})`;
      } else {
        emptyText.textContent = '업무 현황을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';
      }
      updateStatusStats([]);
    }
    if (portfolioGrid) {
      portfolioLoading?.classList.add('hidden');
      portfolioGrid.innerHTML = '';
      portfolioEmpty?.classList.remove('hidden');
      portfolioEmpty.querySelector('p').textContent = '프로젝트를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';
      updatePortfolioCount(0);
    }
  }
}

function renderProjectViews() {
  if (document.getElementById('statusTableBody')) {
    renderStatusTable();
  }
  if (document.getElementById('portfolioGrid')) {
    renderPortfolioGrid();
  }
  if (document.getElementById('homePortfolioGrid')) {
    renderHomePortfolio();
  }
  if (document.getElementById('homeStats')) {
    renderHomeStats();
  }
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

function getAdminPassword() {
  return localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
}

function getStatusTableColspan() {
  return isAdminLoggedIn() ? 8 : 7;
}

function renderStatusTable() {
  const tbody = document.getElementById('statusTableBody');
  const statusEmpty = document.getElementById('statusEmpty');
  const statusUpdated = document.getElementById('statusUpdated');
  const isAdmin = isAdminLoggedIn();
  const projects = getProjects();

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

  tbody.innerHTML = projects.map((p, index) => renderProjectItem(p, isAdmin, projects.length - index)).join('');
  updateStatusStats(projects);
}

function renderProjectItem(project, isAdmin, number) {
  const name = escapeHtml(project.name || '(제목 없음)');
  const colspan = isAdmin ? 8 : 7;
  const adminCell = isAdmin
    ? `<td class="status-td-admin col-admin">
        <div class="admin-actions">
          <button type="button" class="btn-sm btn-edit" data-edit="${project.id}">수정</button>
          <button type="button" class="btn-sm btn-delete" data-delete="${project.row}">삭제</button>
        </div>
      </td>`
    : '';

  const imagesBlock = renderProjectDetailImages(project.images);

  return `
    <tr class="board-row status-list-row" data-id="${project.id}">
      <td class="board-td-num">${number}</td>
      <td class="board-td-subject">
        <button type="button" class="board-title-btn" aria-expanded="false">
          <span class="board-subject-text">${name}</span>
        </button>
      </td>
      <td class="status-td-assignee">${escapeHtml(project.assignee || '-')}</td>
      <td class="status-td-date">${escapeHtml(project.start || '-')}</td>
      <td class="status-td-date">${escapeHtml(project.end || '-')}</td>
      <td class="status-td-status"><span class="status-badge ${project.status}">${STATUS_LABELS[project.status]}</span></td>
      <td class="status-td-progress">
        <div class="progress-bar status-inline-progress">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${project.progress}%"></div>
          </div>
          <span class="progress-text">${project.progress}%</span>
        </div>
      </td>
      ${adminCell}
    </tr>
    <tr class="board-detail-row" data-id="${project.id}">
      <td colspan="${colspan}">
        <div class="board-detail">
          <div class="board-detail-block">
            <div class="board-detail-label">개발 내용</div>
            <div class="board-detail-text">${project.content ? linkifyText(project.content) : '등록된 내용이 없습니다.'}</div>
          </div>
          ${imagesBlock}
        </div>
      </td>
    </tr>`;
}

function extractDriveFileId(url) {
  const match = String(url || '').match(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

function toDisplayImageUrl(url) {
  const fileId = extractDriveFileId(url);
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
  }
  return url;
}

function renderProjectDetailImages(images) {
  if (!Array.isArray(images) || !images.length) return '';

  const items = images.map(url => {
    const displayUrl = toDisplayImageUrl(url);
    return `
    <a href="${escapeHtml(displayUrl)}" class="project-detail-image-link" target="_blank" rel="noopener noreferrer">
      <img src="${escapeHtml(displayUrl)}" alt="첨부 이미지" loading="lazy">
    </a>`;
  }).join('');

  return `
    <div class="board-detail-block">
      <div class="board-detail-label">첨부 이미지</div>
      <div class="project-detail-images">${items}</div>
    </div>`;
}

function initPortfolioPage() {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;

  document.querySelectorAll('[data-portfolio-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      portfolioFilter = btn.dataset.portfolioFilter || 'all';
      document.querySelectorAll('[data-portfolio-filter]').forEach((item) => {
        const active = item === btn;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderPortfolioGrid();
    });
  });

  grid.addEventListener('click', (e) => {
    if (e.target.closest('[data-portfolio-link]')) return;
    const card = e.target.closest('[data-portfolio-id]');
    if (card) {
      openPortfolioModal(card.dataset.portfolioId);
    }
  });

  document.getElementById('portfolioModalClose')?.addEventListener('click', closePortfolioModal);
  document.getElementById('portfolioModalBackdrop')?.addEventListener('click', closePortfolioModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePortfolioModal();
  });

  loadProjects();
}

function initHomeStats() {
  const section = document.getElementById('homeStats');
  if (!section) return;

  const cached = getProjectCache() || getProjectCacheStale();
  if (cached?.length) {
    statusProjects = cached;
    renderHomeStats();
    return;
  }

  if (!hasScriptConfig()) {
    renderHomeStats();
    return;
  }

  fetchProjectsFromApi()
    .then((projects) => {
      statusProjects = projects;
      setProjectCache(projects);
      renderHomeStats();
    })
    .catch(() => renderHomeStats());
}

function renderHomeStats() {
  const projects = getProjects();
  const counts = { total: projects.length, progress: 0, review: 0, done: 0 };
  projects.forEach((p) => {
    if (p.status === 'progress') counts.progress++;
    else if (p.status === 'review') counts.review++;
    else if (p.status === 'done') counts.done++;
  });

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set('homeStatTotal', counts.total);
  set('homeStatProgress', counts.progress);
  set('homeStatDone', counts.done);
  set('homeStatReview', counts.review);
}

function initFaqPage() {
  const list = document.getElementById('faqList');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.faq-question');
    if (!btn) return;

    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');

    list.querySelectorAll('.faq-item.open').forEach((openItem) => {
      openItem.classList.remove('open');
      openItem.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
    });

    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
}

function initHomePortfolio() {
  const grid = document.getElementById('homePortfolioGrid');
  if (!grid) return;

  grid.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    if (e.target.closest('[data-portfolio-id]')) {
      location.href = 'portfolio.html';
    }
  });

  const cached = getProjectCache() || getProjectCacheStale();
  if (cached?.length) {
    statusProjects = cached;
    renderHomePortfolio();
    return;
  }

  if (!hasScriptConfig()) return;

  fetchProjectsFromApi()
    .then((projects) => {
      statusProjects = projects;
      setProjectCache(projects);
      renderHomePortfolio();
    })
    .catch(() => {
      document.getElementById('homePortfolio')?.classList.add('hidden');
    });
}

function getFilteredPortfolioProjects() {
  const projects = getProjects().filter((p) => p.status !== 'waiting');
  if (portfolioFilter === 'all') return projects;
  return projects.filter((p) => p.status === portfolioFilter);
}

function getProjectThumbnail(project) {
  if (Array.isArray(project.images) && project.images.length) {
    return toDisplayImageUrl(project.images[0]);
  }
  return '';
}

function extractProjectUrls(content) {
  const text = String(content || '');
  const urlPattern = /(\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+)/gi;
  const matches = text.match(urlPattern) || [];
  return matches.map((url) => {
    const trimmed = url.replace(/[.,;:!?)]+$/, '');
    return trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
  });
}

function getProjectExcerpt(content, maxLen = 110) {
  const plain = String(content || '').replace(/\s+/g, ' ').trim();
  if (!plain) return '프로젝트 소개가 준비 중입니다.';
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
}

function renderPortfolioThumb(project) {
  const thumb = getProjectThumbnail(project);
  if (thumb) {
    return `<img src="${escapeHtml(thumb)}" alt="" class="portfolio-card-image" loading="lazy">`;
  }
  const initial = escapeHtml((project.name || 'P').charAt(0));
  return `<div class="portfolio-card-placeholder" aria-hidden="true"><span>${initial}</span></div>`;
}

function renderPortfolioCard(project, options = {}) {
  const { compact = false } = options;
  const urls = extractProjectUrls(project.content);
  const linkBtn = urls.length
    ? `<a href="${escapeHtml(urls[0])}" class="btn btn-sm btn-outline-dark portfolio-card-link" data-portfolio-link target="_blank" rel="noopener noreferrer">사이트 보기</a>`
    : '';
  const progressValue = project.status === 'done'
    ? 100
    : Math.min(100, Math.max(0, Number(project.progress) || 0));
  const progressBlock = `<div class="portfolio-card-progress">
        <div class="progress-track"><div class="progress-fill" style="width: ${progressValue}%"></div></div>
        <span class="progress-text">${progressValue}%</span>
      </div>`;

  return `
    <article class="portfolio-card${compact ? ' portfolio-card--compact' : ''}" data-portfolio-id="${project.id}" tabindex="0" role="button" aria-label="${escapeHtml(project.name)} 상세 보기">
      <div class="portfolio-card-media">
        ${renderPortfolioThumb(project)}
        <span class="status-badge ${project.status} portfolio-card-badge">${STATUS_LABELS[project.status]}</span>
      </div>
      <div class="portfolio-card-body">
        <h3 class="portfolio-card-title">${escapeHtml(project.name || '(제목 없음)')}</h3>
        <p class="portfolio-card-meta">${escapeHtml(project.assignee || '-')} · ${escapeHtml(project.start || '-')} ~ ${escapeHtml(project.end || '-')}</p>
        <p class="portfolio-card-desc">${escapeHtml(getProjectExcerpt(project.content, compact ? 72 : 110))}</p>
        ${progressBlock}
        <div class="portfolio-card-actions">
          <span class="portfolio-card-more">자세히 보기</span>
          ${linkBtn}
        </div>
      </div>
    </article>`;
}

function renderPortfolioGrid() {
  const grid = document.getElementById('portfolioGrid');
  const portfolioEmpty = document.getElementById('portfolioEmpty');
  const portfolioLoading = document.getElementById('portfolioLoading');
  if (!grid) return;

  portfolioLoading?.classList.add('hidden');
  const projects = getFilteredPortfolioProjects();
  updatePortfolioCount(projects.length);

  if (!projects.length) {
    grid.innerHTML = '';
    portfolioEmpty?.classList.remove('hidden');
    return;
  }

  portfolioEmpty?.classList.add('hidden');
  grid.innerHTML = projects.map((p) => renderPortfolioCard(p)).join('');
}

function renderHomePortfolio() {
  const grid = document.getElementById('homePortfolioGrid');
  const section = document.getElementById('homePortfolio');
  if (!grid) return;

  const projects = getProjects()
    .filter((p) => p.status === 'done' || p.status === 'progress' || p.status === 'review')
    .slice(0, 3);

  if (!projects.length) {
    section?.classList.add('hidden');
    return;
  }

  section?.classList.remove('hidden');
  grid.innerHTML = projects.map((p) => renderPortfolioCard(p, { compact: true })).join('');
}

function updatePortfolioCount(count) {
  const el = document.getElementById('portfolioCount');
  if (el) el.textContent = `총 ${count}건`;
}

function openPortfolioModal(id) {
  const project = getProjects().find((p) => String(p.id) === String(id));
  const modal = document.getElementById('portfolioModal');
  const body = document.getElementById('portfolioModalBody');
  if (!project || !modal || !body) return;

  const urls = extractProjectUrls(project.content);
  const imagesBlock = renderProjectDetailImages(project.images);
  const linkActions = urls.map((url) =>
    `<a href="${escapeHtml(url)}" class="btn btn-outline-dark btn-sm" target="_blank" rel="noopener noreferrer">링크 열기</a>`
  ).join('');

  body.innerHTML = `
    <div class="portfolio-modal-header">
      <span class="status-badge ${project.status}">${STATUS_LABELS[project.status]}</span>
      <h2 class="portfolio-modal-title" id="portfolioModalTitle">${escapeHtml(project.name || '(제목 없음)')}</h2>
      <p class="portfolio-modal-meta">${escapeHtml(project.assignee || '-')} · ${escapeHtml(project.start || '-')} ~ ${escapeHtml(project.end || '-')} · 진행률 ${project.progress}%</p>
    </div>
    ${getProjectThumbnail(project) ? `<div class="portfolio-modal-hero"><img src="${escapeHtml(getProjectThumbnail(project))}" alt="${escapeHtml(project.name)}"></div>` : ''}
    <div class="board-detail-block">
      <div class="board-detail-label">프로젝트 소개</div>
      <div class="board-detail-text">${project.content ? linkifyText(project.content) : '등록된 내용이 없습니다.'}</div>
    </div>
    ${imagesBlock}
    ${linkActions ? `<div class="portfolio-modal-actions">${linkActions}</div>` : ''}`;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closePortfolioModal() {
  const modal = document.getElementById('portfolioModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
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
    showToast('로그아웃되었습니다.');
  });

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    if (password === getAdminPassword()) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
      closeLoginModal();
      updateAdminUI();
      updateInquiryAdminBtn();
      updateInquiryAdminUI();
      showToast('관리자 로그인되었습니다.');
      migrateLocalProjectsIfNeeded();
      if (adminPanel) {
        adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function initProjectImages() {
  const input = document.getElementById('projectImages');
  const preview = document.getElementById('projectImagePreview');
  if (!input || !preview) return;

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const available = MAX_PROJECT_IMAGES - projectImageUrls.length;
    if (available <= 0) {
      showToast(`이미지는 최대 ${MAX_PROJECT_IMAGES}장까지 첨부할 수 있습니다.`);
      input.value = '';
      return;
    }

    const accepted = [];
    for (const file of files.slice(0, available)) {
      if (!ALLOWED_PROJECT_IMAGE_TYPES.includes(file.type)) {
        showToast('JPG, PNG, GIF, WEBP 형식만 업로드할 수 있습니다.');
        continue;
      }
      if (file.size > MAX_PROJECT_IMAGE_SIZE) {
        showToast('이미지는 파일당 2MB 이하만 업로드할 수 있습니다.');
        continue;
      }
      accepted.push(file);
    }

    if (!accepted.length) {
      input.value = '';
      return;
    }

    accepted.forEach(file => {
      const objectUrl = URL.createObjectURL(file);
      projectImageUrls.push({ url: objectUrl, file, isLocal: true });
    });

    if (files.length > available) {
      showToast(`이미지는 최대 ${MAX_PROJECT_IMAGES}장까지 첨부할 수 있습니다.`);
    }

    input.value = '';
    renderProjectImagePreview();
  });

  preview.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-image]');
    if (!removeBtn) return;
    removeProjectImage(Number(removeBtn.dataset.removeImage));
  });
}

function renderProjectImagePreview() {
  const preview = document.getElementById('projectImagePreview');
  if (!preview) return;

  preview.innerHTML = projectImageUrls.map((item, index) => `
    <div class="project-image-thumb">
      <img src="${escapeHtml(item.url)}" alt="미리보기">
      <button type="button" class="project-image-remove" data-remove-image="${index}" aria-label="이미지 삭제">×</button>
    </div>`).join('');
}

function removeProjectImage(index) {
  const item = projectImageUrls[index];
  if (!item) return;
  if (item.isLocal && item.url) {
    URL.revokeObjectURL(item.url);
  }
  projectImageUrls.splice(index, 1);
  renderProjectImagePreview();
}

function clearProjectImagePreview() {
  projectImageUrls.forEach(item => {
    if (item.isLocal && item.url) {
      URL.revokeObjectURL(item.url);
    }
  });
  projectImageUrls = [];
  const preview = document.getElementById('projectImagePreview');
  if (preview) preview.innerHTML = '';
  const input = document.getElementById('projectImages');
  if (input) input.value = '';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

async function uploadPendingProjectImages() {
  const uploaded = [];

  for (const item of projectImageUrls) {
    if (!item.isLocal) {
      uploaded.push(item.url);
      continue;
    }

    const base64 = await fileToBase64(item.file);
    const data = await apiPost({
      action: 'project-upload-image',
      token: getAdminPassword(),
      base64,
      mimeType: item.file.type,
      fileName: item.file.name
    });

    if (!data.success || !data.url) {
      const error = data.error || 'upload failed';
      if (isDriveAuthError(error)) {
        throw new Error('DRIVE_AUTH_REQUIRED');
      }
      throw new Error(error);
    }

    uploaded.push(data.url);
  }

  return uploaded;
}

function updateAdminUI() {
  const isAdmin = isAdminLoggedIn();
  const adminPanel = document.getElementById('adminPanel');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminColHeader = document.getElementById('adminColHeader');
  const statusAdminBanner = document.getElementById('statusAdminBanner');

  adminPanel?.classList.toggle('hidden', !isAdmin);
  adminColHeader?.classList.toggle('hidden', !isAdmin);
  statusAdminBanner?.classList.toggle('hidden', !isAdmin);

  if (adminLoginBtn) {
    adminLoginBtn.textContent = isAdmin ? '관리 패널' : '관리자';
  }

  if (document.getElementById('statusTableBody')) {
    renderStatusTable();
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

async function saveProjectFromForm() {
  const form = document.getElementById('projectForm');
  const idInput = document.getElementById('projectId');
  const submitBtn = document.getElementById('projectSubmitBtn');
  const isEdit = Boolean(idInput.value);

  if (!hasScriptConfig()) {
    showToast('SCRIPT_URL 이 설정되지 않았습니다.');
    return;
  }

  const project = {
    id: idInput.value || null,
    name: form.name.value.trim(),
    assignee: form.assignee.value.trim(),
    start: form.start.value,
    end: form.end.value,
    progress: Math.min(100, Math.max(0, Number(form.progress.value) || 0)),
    status: form.status.value,
    content: form.content.value.trim(),
    images: []
  };

  submitBtn.disabled = true;
  submitBtn.textContent = isEdit ? '수정 중...' : '등록 중...';

  try {
    project.images = await uploadPendingProjectImages();

    const data = await apiPost({
      action: 'project-save',
      token: getAdminPassword(),
      project
    });

    if (!data.success) throw new Error(data.error || 'save failed');

    clearProjectCache();
    await loadProjects({ forceRefresh: true });
    resetProjectForm();
    showToast(isEdit ? '업무가 수정되었습니다.' : '업무가 등록되었습니다.');
  } catch (err) {
    showToast(getProjectSaveErrorMessage(err));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? '수정' : '등록';
  }
}

function startEditProject(id) {
  const project = getProjects().find(p => String(p.id) === String(id));
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

  clearProjectImagePreview();
  projectImageUrls = (project.images || []).map(url => ({ url, isLocal: false }));
  renderProjectImagePreview();

  document.getElementById('adminPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteProject(row) {
  const project = getProjects().find(p => p.row === row);
  if (!project) return;
  if (!confirm(`"${project.name}" 항목을 삭제하시겠습니까?`)) return;

  if (!hasScriptConfig()) {
    showToast('SCRIPT_URL 이 설정되지 않았습니다.');
    return;
  }

  try {
    const data = await apiPost({
      action: 'project-delete',
      token: getAdminPassword(),
      row
    });

    if (!data.success) throw new Error(data.error || 'delete failed');

    clearProjectCache();
    await loadProjects({ forceRefresh: true });
    showToast('업무가 삭제되었습니다.');
  } catch {
    showToast('업무 삭제에 실패했습니다.');
  }
}

function resetProjectForm() {
  const form = document.getElementById('projectForm');
  form?.reset();
  document.getElementById('projectId').value = '';
  document.getElementById('projectProgress').value = '0';
  document.getElementById('projectSubmitBtn').textContent = '등록';
  document.getElementById('projectCancelBtn')?.classList.add('hidden');
  clearProjectImagePreview();
}

function formatDateTime(isoString) {
  try {
    return new Date(isoString).toLocaleString('ko-KR');
  } catch {
    return isoString;
  }
}

function getCurrentPageFile() {
  const path = location.pathname.replace(/\/$/, '');
  const last = path.split('/').filter(Boolean).pop() || '';
  return !last || !last.includes('.') ? 'index.html' : last.split('?')[0];
}

function initActiveNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const current = getCurrentPageFile();
  nav.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const linkFile = href.split('/').pop()?.split('?')[0] || '';
    link.classList.toggle('active', linkFile === current);
  });
}

function initHeaderScroll() {
  const header = document.querySelector('.header');
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle('header-scrolled', window.scrollY > 10);
  };

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

const PAGE_TRANSITION_MS = 280;

function getPageTransitionTargets() {
  return [...document.querySelectorAll('.header, main, .footer')];
}

function initPageTransitions() {
  getPageTransitionTargets().forEach((el) => {
    el.classList.remove('page-leave-active', 'page-enter-active');
    el.style.opacity = '';
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.remove('page-enter-pending');
    sessionStorage.removeItem('edgacst-page-transition');
    return;
  }

  const targets = getPageTransitionTargets();
  const fromNav = document.documentElement.classList.contains('page-enter-pending');

  if (fromNav) {
    targets.forEach((el) => {
      el.style.opacity = '0';
    });
  }

  document.documentElement.classList.remove('page-enter-pending');
  sessionStorage.removeItem('edgacst-page-transition');

  if (fromNav) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        targets.forEach((el) => {
          el.classList.add('page-enter-active');
          el.style.opacity = '';
        });
      });
    });
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }

    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

    e.preventDefault();
    navigateWithTransition(link.href);
  });
}

function navigateWithTransition(url) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    location.href = url;
    return;
  }

  const targets = getPageTransitionTargets();
  if (targets.some((el) => el.classList.contains('page-leave-active'))) return;

  targets.forEach((el) => el.classList.add('page-leave-active'));
  sessionStorage.setItem('edgacst-page-transition', 'out');

  window.setTimeout(() => {
    location.href = url;
  }, PAGE_TRANSITION_MS);
}

function initHeroVideo() {
  const video = document.querySelector('.hero-video');
  if (!video) return;

  const playVideo = () => {
    const promise = video.play();
    if (promise?.catch) {
      promise.catch(() => {});
    }
  };

  if (video.readyState >= 2) {
    playVideo();
  } else {
    video.addEventListener('loadeddata', playVideo, { once: true });
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

function isBoardPage() {
  return document.body?.dataset.page === 'board';
}

function initInquiryBoard() {
  if (!isBoardPage() || !document.getElementById('inquiryListContainer')) return;

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
      return;
    }
    const titleBtn = e.target.closest('.board-title-btn');
    if (titleBtn) {
      toggleBoardRow(titleBtn);
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
      setTimeout(() => prefetchInquiries(), 2500);
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
      navigateWithTransition('board.html');
    });
  });
  updateInquiryAdminBtn();
}

function updateInquiryAdminUI() {
  if (!isBoardPage()) return;

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

function getInquiryCacheRaw(isAdmin) {
  const raw = sessionStorage.getItem(INQUIRIES_CACHE_KEY) || localStorage.getItem(INQUIRIES_CACHE_KEY);
  if (!raw) return null;

  try {
    const cache = JSON.parse(raw);
    if (!cache?.inquiries) return null;
    if (!isAdmin && cache.isAdmin) return null;
    if (cache.isAdmin === isAdmin) return cache;
    if (isAdmin && !cache.isAdmin) return cache;
    return null;
  } catch {
    return null;
  }
}

function getInquiryCache(isAdmin) {
  const cache = getInquiryCacheRaw(isAdmin);
  if (!cache || Date.now() - cache.at > INQUIRIES_CACHE_TTL_MS) return null;
  return cache;
}

function getInquiryCacheStale(isAdmin) {
  return getInquiryCacheRaw(isAdmin);
}

function setInquiryCache(inquiries, isAdmin) {
  const payload = JSON.stringify({ inquiries, isAdmin, at: Date.now() });
  sessionStorage.setItem(INQUIRIES_CACHE_KEY, payload);
  localStorage.setItem(INQUIRIES_CACHE_KEY, payload);
}

function clearInquiryCache() {
  sessionStorage.removeItem(INQUIRIES_CACHE_KEY);
  localStorage.removeItem(INQUIRIES_CACHE_KEY);
}

function getProjectCacheRaw() {
  const raw = sessionStorage.getItem(PROJECTS_CACHE_KEY) || localStorage.getItem(PROJECTS_CACHE_KEY);
  if (!raw) return null;

  try {
    const cache = JSON.parse(raw);
    if (!cache?.projects) return null;
    return cache.projects;
  } catch {
    return null;
  }
}

function getProjectCache() {
  const raw = sessionStorage.getItem(PROJECTS_CACHE_KEY) || localStorage.getItem(PROJECTS_CACHE_KEY);
  if (!raw) return null;

  try {
    const cache = JSON.parse(raw);
    if (!cache?.projects || Date.now() - cache.at > INQUIRIES_CACHE_TTL_MS) return null;
    return cache.projects;
  } catch {
    return null;
  }
}

function getProjectCacheStale() {
  return getProjectCacheRaw();
}

function setProjectCache(projects) {
  const payload = JSON.stringify({ projects, at: Date.now() });
  sessionStorage.setItem(PROJECTS_CACHE_KEY, payload);
  localStorage.setItem(PROJECTS_CACHE_KEY, payload);
}

function clearProjectCache() {
  sessionStorage.removeItem(PROJECTS_CACHE_KEY);
  localStorage.removeItem(PROJECTS_CACHE_KEY);
}

async function fetchProjectsFromApi() {
  const url = new URL(GOOGLE_CONFIG.SCRIPT_URL);
  url.searchParams.set('action', 'projects');
  const res = await fetch(url.toString(), { redirect: 'follow' });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'load failed');
  }
  return data.projects || [];
}

function prefetchProjects() {
  if (!hasScriptConfig()) return Promise.resolve();
  if (getProjectCache()) return Promise.resolve();

  return fetchProjectsFromApi()
    .then(projects => setProjectCache(projects))
    .catch(() => {});
}

function initStatusLinkPrefetch() {
  document.querySelectorAll('a[href="status.html"], a[href="./status.html"], a[href="portfolio.html"], a[href="./portfolio.html"]').forEach(link => {
    link.addEventListener('mouseenter', prefetchProjects, { once: false });
    link.addEventListener('focus', prefetchProjects, { once: false });
  });
}

function showBoardLoading(container) {
  container.innerHTML = `
    <tr>
      <td colspan="5" class="board-loading-cell">
        <span class="board-loading-spinner"></span>
        문의 목록을 불러오는 중...
      </td>
    </tr>`;
}

function showBoardError(container, message) {
  container.innerHTML = `
    <tr>
      <td colspan="5" class="board-error-cell">${message}</td>
    </tr>`;
}

async function fetchInquiriesFromApi(isAdmin) {
  const url = new URL(GOOGLE_CONFIG.SCRIPT_URL);
  url.searchParams.set('action', 'list');
  if (isAdmin) {
    url.searchParams.set('token', getAdminPassword());
  }

  const res = await fetch(url.toString(), { redirect: 'follow' });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'load failed');
  }

  return data.inquiries || [];
}

function prefetchInquiries() {
  if (!hasScriptConfig()) return Promise.resolve();

  const isAdmin = isAdminLoggedIn();
  if (getInquiryCache(isAdmin)) return Promise.resolve();

  return fetchInquiriesFromApi(isAdmin)
    .then(inquiries => setInquiryCache(inquiries, isAdmin))
    .catch(() => {});
}

function initBoardLinkPrefetch() {
  const prefetch = () => prefetchInquiries();
  document.querySelectorAll('a[href="board.html"], a[href="./board.html"]').forEach(link => {
    link.addEventListener('mouseenter', prefetch, { once: false });
    link.addEventListener('focus', prefetch, { once: false });
    link.addEventListener('touchstart', prefetch, { once: false, passive: true });
  });
}

async function loadInquiries(options = {}) {
  const { forceRefresh = false } = options;
  if (!isBoardPage()) return;

  const container = document.getElementById('inquiryListContainer');
  if (!container) return;

  if (!hasScriptConfig()) {
    showBoardError(container, '문의 목록을 표시하려면 Apps Script 웹앱 URL이 필요합니다. <code>js/config.js</code> 의 <code>SCRIPT_URL</code> 을 확인해 주세요.');
    return;
  }

  const isAdmin = isAdminLoggedIn();

  if (!forceRefresh) {
    const freshCache = getInquiryCache(isAdmin);
    if (freshCache) {
      renderInquiryList(freshCache.inquiries);
      return;
    }
  }

  const staleCache = !forceRefresh ? getInquiryCacheStale(isAdmin) : null;
  if (staleCache) {
    renderInquiryList(staleCache.inquiries);
  } else {
    showBoardLoading(container);
  }

  try {
    const inquiries = await fetchInquiriesFromApi(isAdmin);
    setInquiryCache(inquiries, isAdmin);
    renderInquiryList(inquiries);
  } catch {
    if (!staleCache) {
      showBoardError(container, '문의 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    }
  }
}

function renderBoardStats(inquiries) {
  const stats = document.getElementById('boardStats');
  if (!stats) return;

  const answered = inquiries.filter(item => item.reply || item.hasReply).length;
  stats.innerHTML = `
    <span class="board-stat">전체 <strong>${inquiries.length}</strong></span>
    <span class="board-stat answered">답변완료 <strong>${answered}</strong></span>
    <span class="board-stat waiting">답변대기 <strong>${inquiries.length - answered}</strong></span>`;
}

function renderInquiryList(inquiries) {
  if (!isBoardPage()) return;

  const container = document.getElementById('inquiryListContainer');
  if (!container) return;

  updateInquiryAdminUI();
  renderBoardStats(inquiries);

  if (!inquiries.length) {
    container.innerHTML = `
      <tr>
        <td colspan="5" class="board-empty-cell">
          <p class="board-empty-title">등록된 문의가 없습니다.</p>
          <p class="board-empty-desc">궁금한 점이 있으시면 문의를 남겨 주세요.</p>
          <a href="inquiry.html" class="btn btn-primary btn-sm">문의 작성하기</a>
        </td>
      </tr>`;
    return;
  }

  const admin = isAdminLoggedIn();
  container.innerHTML = inquiries.map((item, index) => renderInquiryItem(item, admin, inquiries.length - index)).join('');
}

function toggleBoardRow(btn) {
  const detailRow = btn.closest('tr')?.nextElementSibling;
  if (!detailRow?.classList.contains('board-detail-row')) return;

  const isOpen = detailRow.classList.contains('open');
  document.querySelectorAll('.board-detail-row.open').forEach(row => row.classList.remove('open'));
  document.querySelectorAll('.board-title-btn[aria-expanded="true"]').forEach(openBtn => {
    openBtn.setAttribute('aria-expanded', 'false');
  });

  if (!isOpen) {
    detailRow.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function renderInquiryItem(item, admin, number) {
  const hasReply = Boolean(item.reply || item.hasReply);
  const subject = escapeHtml(item.subject || '(제목 없음)');
  const author = escapeHtml(item.name || '익명');
  const date = escapeHtml(formatInquiryDate(item.date));
  const replyHtml = hasReply
    ? `<div class="board-detail-reply">
        <div class="board-detail-label">관리자 답변</div>
        <div class="board-detail-text">${linkifyText(item.reply)}</div>
      </div>`
    : `<p class="board-detail-pending">답변 준비 중입니다.</p>`;

  const adminBlock = admin
    ? `<div class="inquiry-item-admin">
        <div class="board-detail-label">관리자 전용</div>
        <p class="inquiry-item-contact">이메일 ${escapeHtml(item.email || '-')} · 연락처 ${escapeHtml(item.phone || '-')}</p>
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

  const statusClass = hasReply ? 'answered' : 'waiting';
  const statusLabel = hasReply ? '답변완료' : '답변대기';

  return `
    <tr class="board-row" data-row="${item.row}">
      <td class="board-td-num">${number}</td>
      <td class="board-td-status"><span class="board-status ${statusClass}">${statusLabel}</span></td>
      <td class="board-td-subject">
        <button type="button" class="board-title-btn" aria-expanded="false">
          <span class="board-subject-text">${subject}</span>
          ${hasReply ? '<span class="board-reply-badge">답변</span>' : ''}
        </button>
      </td>
      <td class="board-td-author">${author}</td>
      <td class="board-td-date">${date}</td>
    </tr>
    <tr class="board-detail-row" data-row="${item.row}">
      <td colspan="5">
        <div class="board-detail">
          <div class="board-detail-block">
            <div class="board-detail-label">문의 내용</div>
            <div class="board-detail-text">${linkifyText(item.message || '')}</div>
          </div>
          ${replyHtml}
          ${adminBlock}
        </div>
      </td>
    </tr>`;
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
  const rowNum = btn.dataset.row;
  const subject = document.querySelector(`.board-row[data-row="${rowNum}"] .board-subject-text`)?.textContent || '이 문의';
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

    clearInquiryCache();
    showToast('문의가 삭제되었습니다.');
    loadInquiries({ forceRefresh: true });
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
  const article = btn.closest('.board-detail-row');
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

    clearInquiryCache();
    showToast('답변이 등록되었습니다.');
    loadInquiries({ forceRefresh: true });
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
