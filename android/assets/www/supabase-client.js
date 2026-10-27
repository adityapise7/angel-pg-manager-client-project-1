// ============================================================
// ANGEL'S PG MANAGEMENT — SUPABASE CLIENT & AUTH CONTROLLER
// Cloud Authentication: Email & Password (Sign In, Sign Up, Password Reset)
// Zero-config compatibility with localhost and Vercel static deployment
// ============================================================

(function(window) {
  'use strict';

  // 1. Supabase Credentials Configuration
  // Fallback defaults point directly to the project credentials stored in .env
  const DEFAULT_SUPABASE_URL = 'https://epgipizdldvrevihxyqf.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_L95tfQXmRu8sw7gw16eLeg_ZMGpriwo';
  const PRODUCTION_APP_URL = 'https://angel-pg-management.vercel.app';

  const env = (window.__ENV__ && typeof window.__ENV__ === 'object') ? window.__ENV__ : {};
  const SUPABASE_URL = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  // 2. Initialize Supabase Client instance
  let client = null;
  if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'angel_pg_supabase_auth_token'
      }
    });
  } else {
    console.warn('[Supabase] CDN SDK @supabase/supabase-js not loaded yet.');
  }

  window.supabaseClient = client;

  // 3. Centralized Auth Manager
  const AuthManager = {
    client: client,
    currentUser: null,
    currentSession: null,
    isInitialized: false,

    // Initialize listener and check existing session
    async init() {
      if (!this.client && window.supabase && window.supabase.createClient) {
        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'angel_pg_supabase_auth_token'
          }
        });
        window.supabaseClient = this.client;
      }

      if (!this.client) {
        console.error('[AuthManager] Supabase client is unavailable.');
        return;
      }

      // Check for incoming verification link / code / hash parameters
      await this.handleIncomingAuthUrl();

      try {
        const { data, error } = await this.client.auth.getSession();
        if (!error && data && data.session) {
          this.currentSession = data.session;
          this.currentUser = data.session.user;
          console.log('[AuthManager] Active session restored for:', this.currentUser.email);
        }
      } catch (err) {
        console.warn('[AuthManager] Failed to restore session:', err);
      }

      // Attach state change listener
      this.client.auth.onAuthStateChange(async (event, session) => {
        console.log('[AuthManager] Auth event:', event);
        this.currentSession = session;
        this.currentUser = session ? session.user : null;

        if (event === 'SIGNED_IN' && session) {
          this.updateUserUI(session.user);
          if (window.SubscriptionManager && typeof window.SubscriptionManager.init === 'function') {
            await window.SubscriptionManager.init(session.user);
          }
          if (window.CloudDB && typeof window.CloudDB.onUserSignedIn === 'function') {
            await window.CloudDB.onUserSignedIn(session.user);
          }
          this.revealApp();
        } else if (event === 'SIGNED_OUT') {
          this.currentUser = null;
          this.currentSession = null;
          if (window.SubscriptionManager && typeof window.SubscriptionManager.init === 'function') {
            window.SubscriptionManager.init(null);
          }
          this.showAuthScreen();
          if (window.CloudDB && typeof window.CloudDB.onUserSignedOut === 'function') {
            window.CloudDB.onUserSignedOut();
          }
        } else if (event === 'PASSWORD_RECOVERY') {
          this.showResetPasswordModal();
        }
      });

      this.isInitialized = true;
    },

    // ── HANDLE EMAIL VERIFICATION LINK OR REDIRECT CODE ───────
    async handleIncomingAuthUrl() {
      try {
        const search = window.location.search || '';
        const searchParams = new URLSearchParams(search);
        const hash = window.location.hash ? window.location.hash.substring(1) : '';
        const hashParams = new URLSearchParams(hash);

        // 1. Check for error returned by Supabase
        const errorDesc = searchParams.get('error_description') || hashParams.get('error_description') || searchParams.get('error') || hashParams.get('error');
        if (errorDesc) {
          const readable = decodeURIComponent(errorDesc).replace(/\+/g, ' ');
          console.warn('[AuthManager] Auth URL returned error:', readable);
          if (typeof showToast === 'function') {
            showToast('Verification Notice: ' + readable, 'warning');
          }
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          return;
        }

        // 2. PKCE Authorization Code Exchange (?code=...)
        const code = searchParams.get('code');
        if (code && this.client && typeof this.client.auth.exchangeCodeForSession === 'function') {
          console.log('[AuthManager] Exchanging authorization code for session...');
          const { data, error } = await this.client.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[AuthManager] Code exchange error:', error);
            if (typeof showToast === 'function') {
              showToast('Verification failed: ' + error.message, 'error');
            }
          } else if (data && data.session) {
            console.log('[AuthManager] Successfully verified via authorization code!');
            this.currentSession = data.session;
            this.currentUser = data.session.user;
            if (typeof showToast === 'function') {
              showToast('Email verified successfully! Welcome to Rentora.', 'success');
            }
          }
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          return;
        }

        // 3. Token Hash OTP Verification (?token_hash=...&type=signup|email)
        const tokenHash = searchParams.get('token_hash');
        const otpType = searchParams.get('type') || 'signup';
        if (tokenHash && this.client && typeof this.client.auth.verifyOtp === 'function') {
          console.log('[AuthManager] Verifying token hash OTP...');
          const { data, error } = await this.client.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType
          });
          if (error) {
            console.error('[AuthManager] Token hash verification error:', error);
            if (typeof showToast === 'function') {
              showToast('Verification failed: ' + error.message, 'error');
            }
          } else if (data && data.session) {
            console.log('[AuthManager] Successfully verified via token hash!');
            this.currentSession = data.session;
            this.currentUser = data.session.user;
            if (typeof showToast === 'function') {
              showToast('Email verified successfully! Welcome to Rentora.', 'success');
            }
          }
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          return;
        }

        // 4. Implicit Hash Grant (#access_token=...&refresh_token=...)
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken && this.client) {
          console.log('[AuthManager] Restoring session from URL hash tokens...');
          const { data, error } = await this.client.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (!error && data && data.session) {
            this.currentSession = data.session;
            this.currentUser = data.session.user;
            if (typeof showToast === 'function') {
              showToast('Email verified successfully! Welcome to Rentora.', 'success');
            }
          }
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } catch (err) {
        console.warn('[AuthManager] Error processing auth URL:', err);
      }
    },

    // ── RESEND VERIFICATION EMAIL ─────────────────────────────
    async resendVerificationEmail(email) {
      if (!this.client) throw new Error('Supabase client is not ready');
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail) throw new Error('Please enter your email address');

      const { data, error } = await this.client.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: PRODUCTION_APP_URL
        }
      });

      if (error) {
        throw error;
      }

      return data;
    },

    getUser() {
      return this.currentUser;
    },

    getSession() {
      return this.currentSession;
    },

    isAuthenticated() {
      return !!this.currentUser;
    },

    // ── EMAIL & PASSWORD SIGN IN ──────────────────────────────
    async signInWithEmail(email, password) {
      if (!this.client) throw new Error('Supabase client is not ready');
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail) throw new Error('Please enter your email address');
      if (!password) throw new Error('Please enter your password');

      const { data, error } = await this.client.auth.signInWithPassword({
        email: cleanEmail,
        password: password
      });

      if (error) {
        throw error;
      }

      this.currentSession = data.session;
      this.currentUser = data.user;
      return data;
    },

    // ── EMAIL & PASSWORD SIGN UP ──────────────────────────────
    async signUpWithEmail(email, password, fullName = '') {
      if (!this.client) throw new Error('Supabase client is not ready');
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail) throw new Error('Please enter your email address');
      if (!password || password.length < 6) throw new Error('Password must be at least 6 characters long');

      // Always redirect verification and confirmation links to the live Vercel production domain
      const redirectUrl = PRODUCTION_APP_URL;

      const { data, error } = await this.client.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: (fullName || '').trim(),
            app_origin: redirectUrl
          }
        }
      });

      if (error) {
        throw error;
      }

      return data;
    },

    // ── FORGOT / RESET PASSWORD ───────────────────────────────
    async sendPasswordReset(email) {
      if (!this.client) throw new Error('Supabase client is not ready');
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail) throw new Error('Please enter your registered email address');

      const redirectUrl = PRODUCTION_APP_URL;
      const { data, error } = await this.client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl
      });

      if (error) {
        throw error;
      }

      return data;
    },

    // ── UPDATE PASSWORD ───────────────────────────────────────
    async updatePassword(newPassword) {
      if (!this.client) throw new Error('Supabase client is not ready');
      if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters');

      const { data, error } = await this.client.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw error;
      }

      return data;
    },

    // ── SIGN OUT ──────────────────────────────────────────────
    async signOut() {
      if (typeof SoundFX !== 'undefined' && SoundFX.buttonClick) SoundFX.buttonClick();
      
      const confirmLogout = confirm('Are you sure you want to sign out from your Rentora Cloud account?');
      if (!confirmLogout) return;

      try {
        if (this.client) {
          await this.client.auth.signOut();
        }
      } catch (err) {
        console.warn('[AuthManager] Sign out error:', err);
      } finally {
        this.currentUser = null;
        this.currentSession = null;
        try { localStorage.removeItem('angel_pg_supabase_auth_token'); } catch (e) {}
        this.showAuthScreen();
        if (typeof showToast === 'function') {
          showToast('Signed out successfully', 'info');
        }
      }
    },

    // ── UI HELPERS ────────────────────────────────────────────
    updateUserUI(user) {
      if (!user) return;
      const email = user.email || 'Owner';
      const name = user.user_metadata?.full_name || email.split('@')[0] || 'PG Owner';

      // Desktop sidebar profile badge
      const profileNameEl = document.getElementById('sidebar-user-name');
      const profileEmailEl = document.getElementById('sidebar-user-email');
      if (profileNameEl) profileNameEl.textContent = name;
      if (profileEmailEl) profileEmailEl.textContent = email;

      // Mobile drawer profile badge
      const drawerNameEl = document.getElementById('drawer-user-name');
      const drawerEmailEl = document.getElementById('drawer-user-email');
      if (drawerNameEl) drawerNameEl.textContent = name;
      if (drawerEmailEl) drawerEmailEl.textContent = email;

      // Settings screen user badge
      const settingsEmailEl = document.getElementById('settings-account-email');
      if (settingsEmailEl) settingsEmailEl.textContent = email;
    },

    revealApp() {
      try { if (typeof SoundFX !== 'undefined' && SoundFX.appUnlock) SoundFX.appUnlock(); } catch (e) {}

      const authScreen = document.getElementById('auth-screen');
      if (authScreen) {
        authScreen.style.pointerEvents = 'none';
        authScreen.style.opacity = '0';
        authScreen.style.transform = 'scale(1.02)';
        authScreen.style.transition = 'all 0.35s ease';
        setTimeout(() => {
          authScreen.style.display = 'none';
          authScreen.classList.add('auth-hidden');
        }, 350);
      }

      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.classList.remove('app-hidden');
        appEl.style.display = 'flex';
        appEl.style.pointerEvents = 'auto';
        appEl.style.opacity = '1';
      }

      // Show Chatbot container
      const chatbotEl = document.getElementById('chatbot-container');
      if (chatbotEl) {
        chatbotEl.style.display = 'block';
      }
      if (typeof Chatbot !== 'undefined' && typeof Chatbot.init === 'function') {
        Chatbot.init();
      }

      if (window.App && typeof window.App.navigate === 'function') {
        window.App.navigate(window.App.currentTab || 'dashboard');
      }

      // Check SaaS Trial and Subscription Lock
      if (window.SubscriptionManager && typeof window.SubscriptionManager.isLocked === 'function') {
        if (window.SubscriptionManager.isLocked()) {
          window.SubscriptionManager.showPaywall();
        } else {
          window.SubscriptionManager.removePaywall();
        }
      }
    },

    showAuthScreen() {
      // Dismiss any open paywall on auth screen
      if (window.SubscriptionManager && typeof window.SubscriptionManager.removePaywall === 'function') {
        window.SubscriptionManager.removePaywall();
      }

      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.style.display = 'none';
        appEl.style.pointerEvents = 'none';
        appEl.classList.add('app-hidden');
      }

      // Completely hide and remove Chatbot on sign out
      const chatbotEl = document.getElementById('chatbot-container');
      if (chatbotEl) {
        chatbotEl.style.display = 'none';
      }
      if (window.Chatbot && window.Chatbot.isOpen) {
        window.Chatbot.toggle();
      }

      const authScreen = document.getElementById('auth-screen');
      if (authScreen) {
        authScreen.classList.remove('auth-hidden');
        authScreen.style.display = 'flex';
        authScreen.style.opacity = '1';
        authScreen.style.transform = 'none';
        authScreen.style.pointerEvents = 'auto';
      }

      if (window.App && typeof window.App.switchAuthTab === 'function') {
        window.App.switchAuthTab('signin');
      }
    },

    showResetPasswordModal() {
      const newPass = prompt('Enter your new password (minimum 6 characters):');
      if (newPass) {
        this.updatePassword(newPass)
          .then(() => {
            if (typeof showToast === 'function') showToast('Password updated successfully!', 'success');
          })
          .catch((err) => {
            if (typeof showToast === 'function') showToast(err.message || 'Password update failed', 'error');
          });
      }
    }
  };

  window.AuthManager = AuthManager;

})(window);
