document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initInquiryForm();
  initStatusPage();
});

const STATUS_LABELS = {
  progress: '진행중',
  review: '검수중',
  done: '완료',
  waiting: '대기'
};

const DEFAULT_PROJECTS = [
  { name: '홈페이지 리뉴얼', assignee: '개발팀', start: '2026-03-01', end: '2026-04-15', progress: 75, status: 'progress' },
  { name: '고객 관리 시스템', assignee: '개발팀', start: '2026-02-10', end: '2026-05-30', progress: 40, status: 'progress' },
  { name: '모바일 앱 1차 배포', assignee: '개발팀', start: '2026-01-15', end: '2026-03-20', progress: 90, status: 'review' },
  { name: 'API 연동 모듈', assignee: '개발팀', start: '2026-04-01', end: '2026-06-30', progress: 0, status: 'waiting' },
  { name: '내부 업무 포털', assignee: '개발팀', start: '2025-11-01', end: '2026-02-28', progress: 100, status: 'done' }
];

function initStatusPage() {
  const tbody = document.getElementById('statusTableBody');
  if (!tbody) return;

  const projects = DEFAULT_PROJECTS;

  tbody.innerHTML = projects.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
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
    </tr>
  `).join('');

  const counts = { total: projects.length, progress: 0, review: 0, done: 0 };
  projects.forEach(p => {
    if (p.status === 'progress') counts.progress++;
    else if (p.status === 'review') counts.review++;
    else if (p.status === 'done') counts.done++;
  });

  document.getElementById('statTotal').textContent = counts.total;
  document.getElementById('statProgress').textContent = counts.progress;
  document.getElementById('statReview').textContent = counts.review;
  document.getElementById('statDone').textContent = counts.done;
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
      <p class="inquiry-item-message">${escapeHtml(item.message)}</p>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
