const MEMBER_SESSION_KEY = 'edgacst_member_session';

document.addEventListener('DOMContentLoaded', initMemberAuth);

function getMemberSession() {
  try { return JSON.parse(sessionStorage.getItem(MEMBER_SESSION_KEY) || 'null'); }
  catch { return null; }
}

function saveMemberSession(session) {
  sessionStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify(session));
}

function clearMemberSession() {
  sessionStorage.removeItem(MEMBER_SESSION_KEY);
}

function getFirebaseApiKey() {
  const key = typeof FIREBASE_CONFIG === 'undefined' ? '' : String(FIREBASE_CONFIG.API_KEY || '');
  if (!key || key.indexOf('PASTE_') === 0) throw new Error('Firebase 설정이 아직 없습니다. MEMBER_SETUP.md의 설정을 진행해 주세요.');
  return key;
}

async function firebaseAuthRequest(method, payload) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${method}?key=${encodeURIComponent(getFirebaseApiKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    const code = data?.error?.message || 'AUTH_ERROR';
    const messages = {
      EMAIL_EXISTS: '이미 가입된 이메일입니다.',
      INVALID_EMAIL: '이메일 주소를 확인해 주세요.',
      WEAK_PASSWORD: '비밀번호는 8자 이상으로 설정해 주세요.',
      INVALID_LOGIN_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다.',
      EMAIL_NOT_FOUND: '가입된 이메일이 없습니다.',
      USER_DISABLED: '사용할 수 없는 계정입니다.',
      TOO_MANY_ATTEMPTS_TRY_LATER: '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    };
    throw new Error(messages[code] || `인증 요청에 실패했습니다. (${code})`);
  }
  return data;
}

async function lookupMember(idToken) {
  const result = await firebaseAuthRequest('accounts:lookup', { idToken });
  return result.users?.[0] || null;
}

async function syncMember(idToken, displayName = '', loginEvent = false) {
  const response = await fetch(GOOGLE_CONFIG.SCRIPT_URL, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'member-sync', idToken, displayName, loginEvent })
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || '회원 정보를 저장하지 못했습니다.');
  return data.member;
}

async function currentMemberSession() {
  let session = getMemberSession();
  if (!session) return null;
  if (Number(session.expiresAt || 0) < Date.now() + 60000) {
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(getFirebaseApiKey())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken })
    });
    const refreshed = await response.json();
    if (!response.ok) { clearMemberSession(); return null; }
    session = { ...session, idToken: refreshed.id_token, refreshToken: refreshed.refresh_token, expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000 };
    saveMemberSession(session);
  }
  const user = await lookupMember(session.idToken);
  if (!user) { clearMemberSession(); return null; }
  session.email = user.email || session.email;
  session.displayName = user.displayName || session.displayName;
  session.emailVerified = Boolean(user.emailVerified);
  saveMemberSession(session);
  return session;
}

function memberMessage(message, isError = false) {
  const node = document.getElementById('memberMessage');
  if (node) {
    node.textContent = message;
    node.classList.toggle('is-error', isError);
  }
  if (typeof showToast === 'function') showToast(message);
}

function renderMemberState(session) {
  const state = document.getElementById('memberAccountState');
  const logout = document.getElementById('memberLogoutBtn');
  const resend = document.getElementById('memberResendVerificationBtn');
  const remove = document.getElementById('memberDeleteBtn');
  const signup = document.getElementById('memberSignupSection');
  const login = document.getElementById('memberLoginSection');
  const navLink = document.querySelector('.nav a[href="members.html"]');
  const signedIn = Boolean(session);
  if (state) state.textContent = !session ? '로그인하지 않았습니다.' : `${session.displayName || session.email} · 이메일 ${session.emailVerified ? '인증 완료' : '미인증'}`;
  if (logout) logout.classList.toggle('hidden', !signedIn);
  if (resend) resend.classList.toggle('hidden', !signedIn || session.emailVerified);
  if (remove) remove.classList.toggle('hidden', !signedIn);
  if (signup) signup.classList.toggle('hidden', signedIn);
  if (login) login.classList.toggle('hidden', signedIn);
  if (navLink && signedIn) navLink.textContent = '내 계정';
}

function initMemberAuth() {
  const signupForm = document.getElementById('memberSignupForm');
  const loginForm = document.getElementById('memberLoginForm');
  const signupSection = document.getElementById('memberSignupSection');
  const loginSection = document.getElementById('memberLoginSection');
  const downloadsAvailable = document.querySelector('[data-download-attachment]');
  if (!signupForm && !loginForm && !downloadsAvailable && !document.querySelector('.nav a[href="members.html"]')) return;

  signupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = signupForm.elements.name.value.trim();
    const email = signupForm.elements.email.value.trim();
    const password = signupForm.elements.password.value;
    if (password !== signupForm.elements.passwordConfirm.value) return memberMessage('비밀번호 확인이 일치하지 않습니다.', true);
    try {
      const created = await firebaseAuthRequest('accounts:signUp', { email, password, returnSecureToken: true });
      const updated = await firebaseAuthRequest('accounts:update', { idToken: created.idToken, displayName: name, returnSecureToken: true });
      await syncMember(updated.idToken || created.idToken, name);
      await firebaseAuthRequest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: updated.idToken || created.idToken });
      signupForm.reset();
      memberMessage('가입이 완료되었습니다. 이메일 인증 링크를 확인한 뒤 로그인해 주세요.');
      loginSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) { memberMessage(error.message || '회원가입에 실패했습니다.', true); }
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const result = await firebaseAuthRequest('accounts:signInWithPassword', { email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value, returnSecureToken: true });
      const user = await lookupMember(result.idToken);
      await syncMember(result.idToken, user?.displayName || '', true);
      const session = { idToken: result.idToken, refreshToken: result.refreshToken, expiresAt: Date.now() + Number(result.expiresIn || 3600) * 1000, email: result.email, displayName: user?.displayName || '', emailVerified: Boolean(user?.emailVerified) };
      saveMemberSession(session);
      loginForm.reset();
      renderMemberState(session);
      memberMessage(session.emailVerified ? '로그인되었습니다. 회원 전용 파일을 다운로드할 수 있습니다.' : '로그인되었습니다. 다운로드하려면 이메일 인증을 완료해 주세요.');
    } catch (error) { memberMessage(error.message || '로그인에 실패했습니다.', true); }
  });

  document.getElementById('memberLogoutBtn')?.addEventListener('click', () => {
    clearMemberSession(); renderMemberState(null); memberMessage('로그아웃되었습니다.');
  });

  document.getElementById('memberResendVerificationBtn')?.addEventListener('click', async () => {
    try {
      const session = await currentMemberSession();
      if (!session) throw new Error('다시 로그인해 주세요.');
      await firebaseAuthRequest('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: session.idToken });
      memberMessage('인증 이메일을 다시 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.');
    } catch (error) { memberMessage(error.message || '인증 이메일을 보내지 못했습니다.', true); }
  });

  document.getElementById('memberDeleteBtn')?.addEventListener('click', async () => {
    if (!confirm('계정을 삭제하시겠습니까? 삭제하면 회원 정보와 로그인 계정이 함께 삭제됩니다.')) return;
    try {
      const session = await currentMemberSession();
      if (!session) throw new Error('다시 로그인해 주세요.');
      const response = await fetch(GOOGLE_CONFIG.SCRIPT_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'member-delete', idToken: session.idToken }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '계정을 삭제하지 못했습니다.');
      clearMemberSession(); renderMemberState(null); memberMessage('계정과 회원 정보가 삭제되었습니다.');
    } catch (error) { memberMessage(error.message || '계정을 삭제하지 못했습니다.', true); }
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-download-attachment]');
    if (!button) return;
    event.preventDefault();
    button.disabled = true;
    try {
      const session = await currentMemberSession();
      if (!session) { memberMessage('첨부파일 다운로드는 로그인 후 이용할 수 있습니다.', true); location.href = 'members.html'; return; }
      if (!session.emailVerified) { memberMessage('이메일 인증 후 파일을 다운로드할 수 있습니다.', true); location.href = 'members.html'; return; }
      const response = await fetch(GOOGLE_CONFIG.SCRIPT_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'member-download-attachment', idToken: session.idToken, fileId: button.dataset.downloadAttachment }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || '다운로드에 실패했습니다.');
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'application/octet-stream' }));
      const anchor = document.createElement('a');
      anchor.href = objectUrl; anchor.download = data.fileName || 'attachment'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { memberMessage(error.message || '다운로드에 실패했습니다.', true); }
    finally { button.disabled = false; }
  });

  currentMemberSession().then(renderMemberState).catch(() => { clearMemberSession(); renderMemberState(null); });
}
