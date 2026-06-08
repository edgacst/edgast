document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initInquiryForm();
});

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
