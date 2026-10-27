// ============================================================
// ANGEL'S PG MANAGEMENT — MAIN CONTROLLER
// ============================================================

const DocUploadManager = {
  currentDocs: { front: null, back: null, extra: [] }, // Stores base64 payloads before saving
  currentTenantId: null,
  currentTenantName: '',
  pendingDeletions: [],
  _confirmAction: null,

  reset() {
    this.currentDocs = { front: null, back: null, extra: [] };
    this.currentTenantId = null;
    this.currentTenantName = '';
    this.pendingDeletions = [];
    this.closeConfirmPrompt();
  },

  async loadFromTenant(tenantId) {
    this.reset();
    this.currentTenantId = tenantId;
    this.pendingDeletions = [];
    const t = DB.getTenantById(tenantId);
    this.currentTenantName = t ? t.name : '';
    if (!t || !t.docs || !Array.isArray(t.docs)) return;

    for (let i = 0; i < t.docs.length; i++) {
      const docId = t.docs[i];
      try {
        const data = await ImageDB.get(docId);
        if (data) {
          const docObj = {
            id: docId,
            name: `Document ${i + 1}`,
            size: ImageUtils.formatSize(Math.round(data.length * 0.75)),
            data: data
          };

          if (i === 0) {
            docObj.type = 'front';
            this.currentDocs.front = docObj;
          } else if (i === 1) {
            docObj.type = 'back';
            this.currentDocs.back = docObj;
          } else {
            docObj.type = 'extra';
            this.currentDocs.extra.push(docObj);
          }
        }
      } catch (err) {
        console.error('Failed to load document:', docId, err);
      }
    }
  },

  handleFileSelect: async function(type, inputEl) {
    const file = inputEl.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('Please upload an image file', 'error');

    try {
      const base64 = await ImageUtils.compressImage(file);
      const doc = {
        id: generateId('doc'),
        type: type,
        name: file.name,
        size: ImageUtils.formatSize(file.size),
        data: base64
      };

      if (type === 'front') this.currentDocs.front = doc;
      else if (type === 'back') this.currentDocs.back = doc;
      else this.currentDocs.extra.push(doc);

      this.renderUI();
    } catch (e) {
      showToast('Error processing image', 'error');
    }
  },

  confirmRemoveDoc(type, id, title) {
    const tenantName = this.currentTenantName || (this.currentTenantId ? DB.getTenantById(this.currentTenantId)?.name : '') || 'the tenant';
    const docLabel = title || (type === 'front' ? 'Front Side' : (type === 'back' ? 'Back Side' : 'Identity Document'));

    this.showFormalDeletePrompt({
      tenantName: tenantName,
      docLabel: docLabel,
      onConfirm: () => {
        if (id && !this.pendingDeletions.includes(id)) {
          this.pendingDeletions.push(id);
        }
        this.removeDoc(type, id);
        try { SoundFX.error(); } catch (e) {}
        showToast(`🗑️ Identity document (${docLabel}) for ${tenantName} removed`, 'info');
      }
    });
  },

  showFormalDeletePrompt({ tenantName, docLabel, onConfirm }) {
    this.closeConfirmPrompt();
    this._confirmAction = onConfirm;

    const overlay = document.createElement('div');
    overlay.id = 'doc-confirm-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:10050; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(3px);';

    overlay.innerHTML = `
      <div style="background:var(--bg-card, #ffffff); border:1px solid var(--border); border-radius:18px; max-width:380px; width:100%; padding:22px; box-shadow:0 20px 40px rgba(0,0,0,0.3); text-align:center; box-sizing:border-box;">
        <div style="width:52px; height:52px; border-radius:50%; background:rgba(239,68,68,0.12); color:#ef4444; font-size:26px; display:flex; align-items:center; justify-content:center; margin:0 auto 14px;">
          🗑️
        </div>
        <div style="font-size:16px; font-weight:800; color:var(--text-primary); margin-bottom:8px;">
          Delete Identity Document?
        </div>
        <div style="font-size:13px; color:var(--text-secondary); line-height:1.5; margin-bottom:20px;">
          Are you sure you want to delete the <strong>${docLabel}</strong> identity document of tenant <strong>${tenantName}</strong>?
          <div style="margin-top:8px; color:#ef4444; font-weight:600; font-size:12px;">
            ⚠️ This document will be permanently deleted.
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn btn-outline" style="flex:1; padding:10px 14px; border-radius:10px; font-weight:600;" onclick="DocUploadManager.closeConfirmPrompt()">
            Cancel
          </button>
          <button type="button" class="btn btn-danger" style="flex:1; padding:10px 14px; border-radius:10px; font-weight:700; background:#ef4444; color:#fff;" onclick="DocUploadManager.executeConfirmedDelete()">
            Delete Permanently
          </button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeConfirmPrompt();
    });

    document.body.appendChild(overlay);
  },

  executeConfirmedDelete() {
    const action = this._confirmAction;
    this.closeConfirmPrompt();
    if (typeof action === 'function') {
      action();
    }
  },

  closeConfirmPrompt() {
    this._confirmAction = null;
    const el = document.getElementById('doc-confirm-overlay');
    if (el) el.remove();
  },

  removeDoc(type, id) {
    if (type === 'front') this.currentDocs.front = null;
    else if (type === 'back') this.currentDocs.back = null;
    else this.currentDocs.extra = this.currentDocs.extra.filter(d => d.id !== id);
    this.renderUI();
  },

  async saveAllToDB() {
    const savedDocs = [];
    const all = [];
    if (this.currentDocs.front) all.push(this.currentDocs.front);
    if (this.currentDocs.back) all.push(this.currentDocs.back);
    all.push(...this.currentDocs.extra);

    for (const doc of all) {
      await ImageDB.save(doc.id, doc.data);
      savedDocs.push({ id: doc.id, type: doc.type, name: doc.name, size: doc.size });
    }
    return savedDocs;
  },

  renderUI() {
    const container = document.getElementById('doc-upload-container');
    if (!container) return;

    const renderCard = (type, title, doc) => {
      if (doc) {
        return `
          <div class="doc-card">
            <img src="${doc.data}" class="doc-thumb" onclick="DocUploadManager.viewFullscreen('${doc.data}')">
            <div class="doc-info">
              <div class="doc-name">${title}</div>
              <div class="doc-size">Uploaded • ${doc.size}</div>
            </div>
            <div class="doc-actions">
              <button class="btn btn-ghost" onclick="document.getElementById('file-upload-${type}').click()">🔄</button>
              <button type="button" class="btn btn-ghost" style="color:var(--danger); cursor:pointer;" onclick="DocUploadManager.confirmRemoveDoc('${type}', '${doc.id}', '${title}')" title="Delete document">🗑️</button>
            </div>
            <input type="file" id="file-upload-${type}" accept="image/*" style="display:none" onchange="DocUploadManager.handleFileSelect('${type}', this)">
          </div>
        `;
      } else {
        return `
          <div class="doc-upload-btn" onclick="document.getElementById('file-upload-${type}').click()">
            <div class="doc-upload-icon">📄</div>
            <div class="doc-upload-text">Upload ${title}</div>
          </div>
          <input type="file" id="file-upload-${type}" accept="image/*" style="display:none" onchange="DocUploadManager.handleFileSelect('${type}', this)">
        `;
      }
    };

    let extraHtml = '';
    this.currentDocs.extra.forEach((doc, idx) => {
      extraHtml += `
        <div class="doc-card mt-8">
          <img src="${doc.data}" class="doc-thumb" onclick="DocUploadManager.viewFullscreen('${doc.data}')">
          <div class="doc-info">
            <div class="doc-name">Extra Image ${idx + 1}</div>
            <div class="doc-size">Uploaded • ${doc.size}</div>
          </div>
          <div class="doc-actions">
            <button type="button" class="btn btn-ghost" style="color:var(--danger); cursor:pointer;" onclick="DocUploadManager.confirmRemoveDoc('extra', '${doc.id}', 'Extra Image ${idx + 1}')" title="Delete document">🗑️</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="form-label" style="margin-bottom:8px">Identity Documents (Optional)</div>
      <div class="doc-grid">
        ${renderCard('front', 'Front Side', this.currentDocs.front)}
        ${renderCard('back', 'Back Side', this.currentDocs.back)}
      </div>
      ${extraHtml}
      <button class="btn btn-outline btn-full mt-8" onclick="document.getElementById('file-upload-extra').click()">+ Add More Images</button>
      <input type="file" id="file-upload-extra" accept="image/*" style="display:none" onchange="DocUploadManager.handleFileSelect('extra', this)">
    `;
  },

  viewFullscreen(src) {
    let viewer = document.getElementById('image-viewer-modal');
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.id = 'image-viewer-modal';
      viewer.className = 'image-viewer-modal';
      viewer.innerHTML = `
        <div class="viewer-controls" style="display:flex; gap:12px">
          <a id="viewer-download" href="" download="Document.jpg" class="btn btn-ghost viewer-close" style="text-decoration:none; display:flex;">📥</a>
          <button class="btn btn-ghost viewer-close" onclick="document.getElementById('image-viewer-modal').style.display='none'">✕</button>
        </div>
        <div class="viewer-content">
          <img id="viewer-img" src="">
        </div>
      `;
      document.body.appendChild(viewer);
    }
    document.getElementById('viewer-img').src = src;
    document.getElementById('viewer-download').href = src;
    viewer.style.display = 'flex';
  }
};

const App = {
  currentTab: 'dashboard',
  pinBuffer: '',

  async init() {
    // Reset WhatsApp reminder session indicators on reload
    if (typeof WhatsApp !== 'undefined' && WhatsApp.resetSessionIndicators) {
      WhatsApp.resetSessionIndicators();
    }

    // Synchronize branding and saved logo across all components
    this.syncGlobalBranding();

    // Start cinematic logo reveal & splash screen
    this.initSplash();

    // Apply dark mode immediately
    if (DB.getDarkMode()) document.documentElement.setAttribute('data-theme', 'dark');

    // Initialize Supabase Cloud Auth
    if (window.AuthManager && typeof window.AuthManager.init === 'function') {
      try {
        await window.AuthManager.init();
        if (window.AuthManager.isAuthenticated()) {
          const user = window.AuthManager.getUser();
          console.log('[App] Restored existing Supabase session for:', user.email);
          window.AuthManager.updateUserUI(user);
          if (window.SubscriptionManager && typeof window.SubscriptionManager.init === 'function') {
            await window.SubscriptionManager.init(user);
          }
          if (window.CloudDB && typeof window.CloudDB.onUserSignedIn === 'function') {
            await window.CloudDB.onUserSignedIn(user);
          }
          this.unlockApp();
          return;
        }
      } catch (err) {
        console.warn('[App] Supabase Auth initialization error:', err);
      }
    }

    // Display Email & Password Auth Screen
    this.showEmailAuth();
  },

  initSplash() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;

    // Use official Rentora logo for cinematic splash screen
    const splashImg = splash.querySelector('.splash-logo-img');
    if (splashImg) {
      splashImg.src = 'rentora-logo.png';
    }

    // Minimum display time is 2.75s to allow 5-phase cinematic reveal to complete
    const MIN_SPLASH_TIME = 2750;
    const startTime = Date.now();

    const dismissSplash = () => {
      if (splash.dataset.dismissed) return;
      splash.dataset.dismissed = 'true';
      splash.classList.add('splash-fade-out');
      setTimeout(() => {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, 550);
    };

    // Calculate delay so full cinematic animation completes smoothly
    const elapsed = Date.now() - startTime;
    const delay = Math.max(0, MIN_SPLASH_TIME - elapsed);
    setTimeout(dismissSplash, delay);

    // Failsafe timeout to prevent any possibility of screen lockup
    setTimeout(dismissSplash, 3300);
  },

  // ── CENTRALIZED GLOBAL BRANDING SYNCHRONIZER ─────────────
  syncGlobalBranding() {
    const prop = DB.getProperty() || {};
    const hasCustom = DB.hasCustomLogo();
    const activeLogo = hasCustom && prop.logo ? prop.logo : '';

    // 1. Navigation Drawer & Desktop Sidebar Platform Branding (Rentora)
    const platformLogos = document.querySelectorAll('.drawer-brand-logo img, .sidebar-brand-logo img, #auth-logo-img');
    platformLogos.forEach(img => {
      img.src = 'rentora-logo.png';
    });

    const sidebarTitle = document.querySelector('.sidebar-brand-title');
    if (sidebarTitle) {
      sidebarTitle.textContent = 'Rentora';
    }

    const sidebarSub = document.querySelector('.sidebar-brand-sub');
    if (sidebarSub) {
      sidebarSub.textContent = prop.name || 'PG Management Platform';
    }

    // 2. Invalidate Image & Business Card Caches and synchronize saved Business Card
    if (typeof ImageUtils !== 'undefined' && ImageUtils.clearImageCache) {
      ImageUtils.clearImageCache();
    }
    if (typeof BusinessCard !== 'undefined' && BusinessCard._logoImageCache) {
      BusinessCard._logoImageCache.clear();
    }
    if (typeof DB !== 'undefined' && typeof DB.getBusinessCardCustom === 'function') {
      const bcCustom = DB.getBusinessCardCustom();
      if (bcCustom && bcCustom.logoType !== 'none') {
        bcCustom.logo = activeLogo || '';
        DB.saveBusinessCardCustom(bcCustom);
      }
    }
    if (typeof BusinessCard !== 'undefined' && typeof BusinessCard.updateCardView === 'function') {
      if (document.getElementById('bc-hero-card') || document.getElementById('bc-container')) {
        BusinessCard.updateCardView();
      }
    }

    // 3. Update Home Dashboard Property Hero with owner's custom logo (or icon)
    const heroImg = document.getElementById('dash-prop-hero-logo');
    if (heroImg && heroImg.tagName === 'IMG' && activeLogo) {
      heroImg.src = activeLogo;
    }

    // 4. Update Header Title if on Dashboard
    if (this.currentTab === 'dashboard') {
      const titleEl = document.getElementById('header-title');
      if (titleEl && prop.name) {
        titleEl.textContent = '🏢 ' + prop.name;
      }
    }

    // 5. Refresh Settings UI if open
    if (this.currentTab === 'settings' && typeof Settings !== 'undefined' && Settings.render) {
      Settings.render();
    }
  },

  updateAuthLogo() {
    this.syncGlobalBranding();
  },

  // ── SUPABASE EMAIL & PASSWORD AUTH METHODS ────────────────
  showEmailAuth() {
    const authEl = document.getElementById('auth-screen');
    if (authEl) {
      authEl.classList.remove('auth-hidden');
      authEl.style.display = 'flex';
      authEl.style.opacity = '1';
      authEl.style.transform = 'none';
      authEl.style.pointerEvents = 'auto';
    }
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.style.display = 'none';
      appEl.style.pointerEvents = 'none';
      appEl.classList.add('app-hidden');
    }
    const chatbot = document.getElementById('chatbot-container');
    if (chatbot) {
      chatbot.style.display = 'none';
    }
    if (window.Chatbot && window.Chatbot.isOpen) {
      window.Chatbot.toggle();
    }
    this.switchAuthTab('signin');
  },

  switchAuthTab(tab) {
    if (typeof SoundFX !== 'undefined' && SoundFX.buttonClick) SoundFX.buttonClick();
    this.clearAuthAlerts();

    const signinBtn = document.getElementById('tab-auth-signin');
    const signupBtn = document.getElementById('tab-auth-signup');
    const signinForm = document.getElementById('form-auth-signin');
    const signupForm = document.getElementById('form-auth-signup');
    const forgotBox = document.getElementById('box-auth-forgot');

    if (forgotBox) forgotBox.style.display = 'none';

    if (tab === 'signup') {
      if (signinBtn) { signinBtn.classList.remove('active'); signinBtn.setAttribute('aria-selected', 'false'); }
      if (signupBtn) { signupBtn.classList.add('active'); signupBtn.setAttribute('aria-selected', 'true'); }
      if (signinForm) signinForm.style.display = 'none';
      if (signupForm) signupForm.style.display = 'block';
    } else {
      if (signupBtn) { signupBtn.classList.remove('active'); signupBtn.setAttribute('aria-selected', 'false'); }
      if (signinBtn) { signinBtn.classList.add('active'); signinBtn.setAttribute('aria-selected', 'true'); }
      if (signupForm) signupForm.style.display = 'none';
      if (signinForm) signinForm.style.display = 'block';
    }
  },

  showForgotPasswordBox() {
    this.clearAuthAlerts();
    const signinForm = document.getElementById('form-auth-signin');
    const signupForm = document.getElementById('form-auth-signup');
    const forgotBox = document.getElementById('box-auth-forgot');

    if (signinForm) signinForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'none';
    if (forgotBox) forgotBox.style.display = 'block';

    const currentEmail = document.getElementById('signin-email')?.value;
    const forgotEmail = document.getElementById('forgot-email');
    if (forgotEmail && currentEmail) forgotEmail.value = currentEmail;
  },

  hideForgotPasswordBox() {
    this.switchAuthTab('signin');
  },

  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    if (btnEl) btnEl.textContent = isPass ? '🙈' : '👁️';
  },

  showAuthError(msg) {
    const banner = document.getElementById('auth-error-banner');
    const textEl = document.getElementById('auth-error-text');
    const successBanner = document.getElementById('auth-success-banner');
    if (successBanner) successBanner.style.display = 'none';

    if (banner && textEl) {
      if (typeof msg === 'string' && msg.includes('<')) {
        textEl.innerHTML = msg;
      } else {
        textEl.textContent = msg || 'An error occurred during authentication';
      }
      banner.style.display = 'flex';
    }
    try { if (typeof SoundFX !== 'undefined' && SoundFX.error) SoundFX.error(); } catch (e) {}
  },

  showAuthSuccess(msg) {
    const banner = document.getElementById('auth-success-banner');
    const textEl = document.getElementById('auth-success-text');
    const errorBanner = document.getElementById('auth-error-banner');
    if (errorBanner) errorBanner.style.display = 'none';

    if (banner && textEl) {
      textEl.textContent = msg;
      banner.style.display = 'flex';
    }
    try { if (typeof SoundFX !== 'undefined' && SoundFX.pinSuccess) SoundFX.pinSuccess(); } catch (e) {}
  },

  clearAuthAlerts() {
    const errorBanner = document.getElementById('auth-error-banner');
    const successBanner = document.getElementById('auth-success-banner');
    if (errorBanner) errorBanner.style.display = 'none';
    if (successBanner) successBanner.style.display = 'none';
  },

  async handleEmailSignIn(event) {
    event.preventDefault();
    this.clearAuthAlerts();

    const email = document.getElementById('signin-email')?.value;
    const password = document.getElementById('signin-password')?.value;
    const submitBtn = document.getElementById('btn-submit-signin');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnSpinner = submitBtn?.querySelector('.btn-spinner');

    if (btnText && btnSpinner) {
      btnText.style.display = 'none';
      btnSpinner.style.display = 'inline';
      submitBtn.disabled = true;
    }

    try {
      if (!window.AuthManager) throw new Error('Authentication manager is not initialized');
      await window.AuthManager.signInWithEmail(email, password);
      const user = window.AuthManager.getUser();
      if (user && window.SubscriptionManager && typeof window.SubscriptionManager.init === 'function') {
        await window.SubscriptionManager.init(user);
      }
      if (user && window.CloudDB && typeof window.CloudDB.onUserSignedIn === 'function') {
        await window.CloudDB.onUserSignedIn(user);
      }
      this.showAuthSuccess('Signed in successfully! Loading your PG workspace...');
      setTimeout(() => {
        this.unlockApp();
      }, 300);
    } catch (err) {
      console.error('[App] Sign In error:', err);
      let errorMsg = err.message || 'Invalid email or password';
      if (errorMsg.includes('Invalid login credentials')) {
        errorMsg = 'Incorrect email or password. Please try again or create an account.';
        this.showAuthError(errorMsg);
      } else if (errorMsg.includes('Email not confirmed')) {
        const targetEmail = (email || '').trim();
        this.showAuthError(
          `<span>Your email address is not verified yet. Check your inbox for the link, or click below:</span>` +
          `<div style="margin-top:8px;"><button type="button" id="btn-resend-verify" style="background:#4f46e5;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">✉️ Resend Verification Link</button></div>`
        );
        const resendBtn = document.getElementById('btn-resend-verify');
        if (resendBtn) {
          resendBtn.onclick = async () => {
            resendBtn.disabled = true;
            resendBtn.textContent = 'Sending link...';
            try {
              await window.AuthManager.resendVerificationEmail(targetEmail);
              if (typeof showToast === 'function') {
                showToast('Fresh verification link sent to ' + targetEmail + '! Check inbox.', 'success');
              }
              resendBtn.textContent = '✅ Link Sent! Check Email';
            } catch (rErr) {
              resendBtn.disabled = false;
              resendBtn.textContent = 'Retry Resend';
              if (typeof showToast === 'function') {
                showToast('Failed to resend: ' + rErr.message, 'error');
              }
            }
          };
        }
        return;
      } else {
        this.showAuthError(errorMsg);
      }
    } finally {
      if (btnText && btnSpinner) {
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        submitBtn.disabled = false;
      }
    }
  },

  async handleEmailSignUp(event) {
    event.preventDefault();
    this.clearAuthAlerts();

    const name = document.getElementById('signup-name')?.value;
    const email = document.getElementById('signup-email')?.value;
    const password = document.getElementById('signup-password')?.value;
    const confirm = document.getElementById('signup-confirm')?.value;
    const submitBtn = document.getElementById('btn-submit-signup');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnSpinner = submitBtn?.querySelector('.btn-spinner');

    if (password !== confirm) {
      this.showAuthError("Passwords do not match. Please re-enter.");
      return;
    }

    if (password.length < 6) {
      this.showAuthError("Password must be at least 6 characters.");
      return;
    }

    if (btnText && btnSpinner) {
      btnText.style.display = 'none';
      btnSpinner.style.display = 'inline';
      submitBtn.disabled = true;
    }

    try {
      if (!window.AuthManager) throw new Error('Authentication manager is not initialized');
      const data = await window.AuthManager.signUpWithEmail(email, password, name);
      
      if (data.session) {
        if (window.SubscriptionManager && typeof window.SubscriptionManager.init === 'function') {
          await window.SubscriptionManager.init(data.session.user);
        }
        this.showAuthSuccess('Account created! Welcome to Angel PG Cloud.');
        setTimeout(() => {
          this.unlockApp();
        }, 600);
      } else {
        this.showAuthSuccess('Account created! Check your email to verify your registration, then sign in.');
      }
    } catch (err) {
      console.error('[App] Sign Up error:', err);
      let errorMsg = err.message || 'Registration failed';
      if (errorMsg.includes('User already registered')) {
        errorMsg = 'An account with this email already exists. Please sign in instead.';
      }
      this.showAuthError(errorMsg);
    } finally {
      if (btnText && btnSpinner) {
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        submitBtn.disabled = false;
      }
    }
  },

  async handleSendResetLink() {
    this.clearAuthAlerts();
    const email = document.getElementById('forgot-email')?.value;
    const submitBtn = document.getElementById('btn-send-reset');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnSpinner = submitBtn?.querySelector('.btn-spinner');

    if (!email) {
      this.showAuthError('Please enter your email address');
      return;
    }

    if (btnText && btnSpinner) {
      btnText.style.display = 'none';
      btnSpinner.style.display = 'inline';
      submitBtn.disabled = true;
    }

    try {
      await window.AuthManager.sendPasswordReset(email);
      this.showAuthSuccess('Password recovery link sent! Please check your email.');
    } catch (err) {
      console.error('[App] Reset link error:', err);
      this.showAuthError(err.message || 'Failed to send recovery link.');
    } finally {
      if (btnText && btnSpinner) {
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        submitBtn.disabled = false;
      }
    }
  },

  // ── OPTIONAL FALLBACK PIN HELPERS ─────────────────────────
  showSetupPin() {
    this.showEmailAuth();
  },

  showAuthPin() {
    this.showEmailAuth();
  },

  // ── PIN KEY PRESS ────────────────────────────────────────
  async pressKey(key) {
    if (key === '⌫') {
      this.pinBuffer = this.pinBuffer.slice(0, -1);
      try { SoundFX.pinDelete(); } catch (e) {}
    } else if (this.pinBuffer.length < 4) {
      this.pinBuffer += key;
      try { SoundFX.pinKey(key); } catch (e) {}
    }
    this.updatePinDots();
    if (this.pinBuffer.length === 4) {
      await this.handlePinComplete();
    }
  },

  updatePinDots() {
    [0,1,2,3].forEach(i => {
      const dot = document.getElementById(`dot-${i}`);
      if (dot) dot.className = 'pin-dot' + (i < this.pinBuffer.length ? ' filled' : '');
    });
  },

  async handlePinComplete() {
    const pin = this.pinBuffer;
    const step = this._pinStep;

    if (step === 'auth') {
      const hash = await hashPin(pin);
      if (hash === DB.getPassword()) {
        try { SoundFX.pinSuccess(); } catch (e) {}
        this.unlockApp();
      } else {
        try { SoundFX.pinError(); } catch (e) {}
        this.showPinError('Wrong PIN. Try again.');
      }
    } else if (step === 'setup1') {
      this._setupPin1 = pin;
      this._pinStep = 'setup2';
      this.pinBuffer = '';
      this.updatePinDots();
      document.getElementById('auth-subtitle').textContent = 'Confirm your PIN';
    } else if (step === 'setup2') {
      if (pin !== this._setupPin1) {
        try { SoundFX.pinError(); } catch (e) {}
        this.showPinError("PINs don't match. Start over.");
        setTimeout(() => {
          this._pinStep = 'setup1';
          this._setupPin1 = '';
          document.getElementById('auth-subtitle').textContent = 'Create your 4-digit security PIN';
          clearPinError();
        }, 1000);
      } else {
        const hash = await hashPin(pin);
        DB.setPassword(hash);
        DB.setInitialized();
        try { SoundFX.pinSuccess(); } catch (e) {}
        this.unlockApp();
      }
    }
  },

  showPinError(msg) {
    [0,1,2,3].forEach(i => {
      const d = document.getElementById(`dot-${i}`);
      if (d) d.className = 'pin-dot error';
    });
    document.getElementById('auth-error').textContent = msg;
    setTimeout(() => {
      this.pinBuffer = '';
      this.updatePinDots();
    }, 600);
  },

  unlockApp() {
    if (typeof WhatsApp !== 'undefined' && WhatsApp.resetSessionIndicators) {
      WhatsApp.resetSessionIndicators();
    }
    try { SoundFX.appUnlock(); } catch (e) {}
    const authEl = document.getElementById('auth-screen');
    if (authEl) {
      authEl.style.pointerEvents = 'none';
      authEl.classList.add('auth-hidden');
      authEl.style.opacity = '0';
      authEl.style.transform = 'scale(1.05)';
      authEl.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        authEl.style.display = 'none';
      }, 300);
    }
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.style.display = 'flex';
      appEl.style.pointerEvents = 'auto';
      appEl.classList.remove('app-hidden');
    }
    const chatbot = document.getElementById('chatbot-container');
    if (chatbot) {
      chatbot.style.display = 'block';
    }

    // ── CHECK FIRST-TIME ONBOARDING WIZARD ──────────────────
    if (window.OnboardingManager && typeof window.OnboardingManager.needsOnboarding === 'function' && window.OnboardingManager.needsOnboarding()) {
      window.OnboardingManager.start();
      return;
    }

    this.navigate('dashboard');
    if (typeof Chatbot !== 'undefined') Chatbot.init();

    // Check SaaS subscription & paywall lock
    if (window.SubscriptionManager && typeof window.SubscriptionManager.isLocked === 'function') {
      if (window.SubscriptionManager.isLocked()) {
        window.SubscriptionManager.showPaywall();
      } else {
        window.SubscriptionManager.removePaywall();
      }
    }
  },

  // ── NAVIGATION ───────────────────────────────────────────
  navigate(tab) {
    if (this.currentTab !== tab) {
      try { SoundFX.navTab(); } catch (e) {}
    }
    this.currentTab = tab;

    document.querySelectorAll('.nav-item, .sidebar-nav-link, .mobile-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tab);
    });

    // Sync drawer active state
    document.querySelectorAll('.drawer-item[data-drawer-tab]').forEach(el => {
      el.classList.toggle('active', el.dataset.drawerTab === tab);
    });

    renderActiveTab();
  },

  // ── TOP RIGHT THREE-DOTS DRAWER MENU ───────────────────────
  toggleNavDrawer() {
    const overlay = document.getElementById('app-nav-drawer-overlay');
    const drawer = document.querySelector('.app-nav-drawer');
    if (!overlay || !drawer) return;

    if (overlay.classList.contains('open')) {
      this.closeNavDrawer();
    } else {
      this.openNavDrawer();
    }
  },

  openNavDrawer() {
    const overlay = document.getElementById('app-nav-drawer-overlay');
    const drawer = document.querySelector('.app-nav-drawer');
    if (!overlay || !drawer) return;

    try { SoundFX.dropdown(); } catch (e) {}
    overlay.classList.add('open');
    drawer.classList.add('open');

    // Highlight current active tab in drawer
    document.querySelectorAll('.drawer-item[data-drawer-tab]').forEach(el => {
      el.classList.toggle('active', el.dataset.drawerTab === this.currentTab);
    });
  },

  closeNavDrawer() {
    const overlay = document.getElementById('app-nav-drawer-overlay');
    const drawer = document.querySelector('.app-nav-drawer');
    if (!overlay || !drawer) return;

    overlay.classList.remove('open');
    drawer.classList.remove('open');
  },

  navigateFromDrawer(tab) {
    this.closeNavDrawer();
    this.navigate(tab);
  },

  openPaymentHistoryTab() {
    this.closeNavDrawer();
    this.navigate('history');
  },

  openRentView(view) {
    this.closeNavDrawer();
    if (typeof Rent !== 'undefined' && typeof Rent.setView === 'function') {
      Rent.setView(view);
    }
    this.navigate('rent');
  },
};

window.App = App;

function renderActiveTab() {
  const tab = App.currentTab;
  const prop = (typeof DB !== 'undefined' && typeof DB.getProperty === 'function') ? DB.getProperty() : {};
  const titles = {
    dashboard: (prop && prop.name) ? `🏢 ${prop.name}` : '📊 Rentora Dashboard',
    rooms: '🏠 Rooms & Beds',
    tenants: '👥 Tenants',
    rent: '💰 Rent Collection',
    history: '📜 Payment History',
    expenses: '💸 Expenses & P&L',
    settings: '⚙️ Settings'
  };
  const titleEl = document.getElementById('header-title');
  if (titleEl) titleEl.textContent = titles[tab] || '';

  switch (tab) {
    case 'dashboard': Dashboard.render(); break;
    case 'rooms': Rooms.render(); break;
    case 'tenants': Tenants.render(); break;
    case 'rent': Rent.render(); break;
    case 'history': if (typeof PaymentHistory !== 'undefined') PaymentHistory.render(); break;
    case 'expenses': Expenses.render(); break;
    case 'settings': Settings.render(); break;
  }
}

// ── MODAL SYSTEM ────────────────────────────────────────────
function showModal(title, bodyHtml) {
  try { if (typeof SoundFX !== 'undefined' && SoundFX.modalOpen) SoundFX.modalOpen(); } catch (e) {}
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const overlay = document.getElementById('modal-overlay');
  if (titleEl) titleEl.textContent = title || '';
  if (bodyEl) bodyEl.innerHTML = bodyHtml || '';
  if (overlay) overlay.classList.add('open');
}

function openModal(content) {
  try { if (typeof SoundFX !== 'undefined' && SoundFX.modalOpen) SoundFX.modalOpen(); } catch (e) {}
  if (content) {
    const bodyEl = document.getElementById('modal-body');
    if (bodyEl) bodyEl.innerHTML = content;
  }
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeModal() {
  try { if (typeof SoundFX !== 'undefined' && SoundFX.modalClose) SoundFX.modalClose(); } catch (e) {}
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

window.showModal = showModal;
window.openModal = openModal;
window.closeModal = closeModal;

// ── TOAST SYSTEM ────────────────────────────────────────────
function showToast(msg, type = 'info') {
  SoundFX.toast(type);
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function clearPinError() {
  document.getElementById('auth-error').textContent = '';
}

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  App.init();
});
