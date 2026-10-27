// ============================================================
// ANGEL'S PG MANAGEMENT — SAAS SUBSCRIPTION & TRIAL ENGINE
// 10-Day Free Trial upon account registration
// Monthly UPI Paywall & Cross-Device Cloud-Enforced Subscriptions
// ============================================================

const SubscriptionManager = {
  TRIAL_DAYS: 10,
  MASTER_KEY: 'RENTORA-PRO-2026',
  _initialized: false,
  _currentSub: null,

  // ── 1. INITIALIZE FOR AUTHENTICATED USER ─────────────────────
  async init(user) {
    if (!user) {
      this._currentSub = null;
      this.updateHeaderBadge();
      this.removePaywall();
      return null;
    }

    const pricing = DB.getAppPricing();
    let sub = DB.getSubscription();
    const now = Date.now();

    // 1. Fetch latest subscription from Supabase user_subscriptions table
    try {
      const client = window.supabaseClient || (window.AuthManager && window.AuthManager.client);
      if (client && user.id) {
        const { data: remoteSub, error } = await client
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && remoteSub) {
          sub = {
            id: remoteSub.id,
            userId: remoteSub.user_id,
            userEmail: remoteSub.user_email || user.email,
            status: remoteSub.status,
            trialStart: remoteSub.trial_start ? new Date(remoteSub.trial_start).getTime() : (sub && sub.trialStart ? sub.trialStart : null),
            trialEnd: remoteSub.trial_end ? new Date(remoteSub.trial_end).getTime() : (sub && sub.trialEnd ? sub.trialEnd : null),
            subscriptionEnd: remoteSub.subscription_end,
            planName: remoteSub.plan_name || 'Monthly Pro',
            price: Number(remoteSub.price_inr) || pricing.monthlyPrice,
            lastPaymentRef: remoteSub.last_payment_ref || '',
            lastPaymentDate: remoteSub.last_payment_date || null
          };
          DB.saveSubscription(sub);
        }
      }
    } catch (e) {
      console.warn('[Subscription] Remote fetch warning (using local status):', e);
    }

    // 2. If no subscription record or trial timestamps exist yet, prepare trial object
    if (!sub || !sub.status) {
      sub = {
        userId: user.id,
        userEmail: user.email,
        status: 'trialing',
        trialStart: null, // Will be stamped when PG details are asked
        trialEnd: null,
        subscriptionEnd: null,
        planName: 'Monthly Pro',
        price: pricing.monthlyPrice,
        lastPaymentRef: '',
        lastPaymentDate: null
      };
      DB.saveSubscription(sub);
    }

    // 3. Validate current status against real-time expiration
    if (sub.status === 'active' && sub.subscriptionEnd) {
      const subEndTime = new Date(sub.subscriptionEnd).getTime();
      if (now > subEndTime) {
        sub.status = 'expired';
        DB.saveSubscription(sub);
      }
    } else if (sub.status === 'trialing' && sub.trialEnd) {
      if (now >= Number(sub.trialEnd)) {
        sub.status = 'expired';
        DB.saveSubscription(sub);
      }
    }

    this._currentSub = sub;
    this._initialized = true;

    // 4. Update UI Indicators and Enforce Paywall only if expired
    this.updateHeaderBadge();

    if (this.isLocked()) {
      this.showPaywall();
    } else {
      this.removePaywall();
    }

    return sub;
  },

  // ── 1B. DYNAMICALLY START TRIAL WHEN PG DETAILS ARE ASKED ────
  async startTrialWhenPGDetailsAsked(user) {
    if (!user) {
      user = window.AuthManager ? window.AuthManager.getUser() : null;
    }
    if (!user) return;

    let sub = this._currentSub || DB.getSubscription();
    const now = Date.now();

    // If subscription already active (paid Pro), don't overwrite
    if (sub && sub.status === 'active' && sub.subscriptionEnd && new Date(sub.subscriptionEnd).getTime() > now) {
      return sub;
    }

    // If trial is already started and has valid timestamps, don't reset
    if (sub && sub.trialStart && sub.trialEnd) {
      return sub;
    }

    // 10-day trial starts NOW because PG details are being asked
    const trialEnd = now + (this.TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const pricing = DB.getAppPricing();

    sub = {
      ...(sub || {}),
      userId: user.id,
      userEmail: user.email,
      status: 'trialing',
      trialStart: now,
      trialEnd: trialEnd,
      planName: 'Monthly Pro',
      price: pricing.monthlyPrice
    };

    DB.saveSubscription(sub);
    this._currentSub = sub;

    // Persist dynamic trial window to Supabase
    try {
      const client = window.supabaseClient || (window.AuthManager && window.AuthManager.client);
      if (client && user.id) {
        await client.from('user_subscriptions').upsert({
          user_id: user.id,
          user_email: user.email,
          status: 'trialing',
          trial_start: new Date(now).toISOString(),
          trial_end: new Date(trialEnd).toISOString(),
          plan_name: 'Monthly Pro',
          price_inr: pricing.monthlyPrice,
          updated_at: new Date(now).toISOString()
        });
        console.log('[Subscription] 10-day trial officially started upon PG details prompt. Ends:', new Date(trialEnd).toLocaleDateString());
      }
    } catch (err) {
      console.warn('[Subscription] Remote trial start upsert note:', err);
    }

    this.updateHeaderBadge();
    this.removePaywall();
    return sub;
  },

  // ── 2. SUBSCRIPTION STATUS COMPUTATION ──────────────────────
  getStatus() {
    const user = window.AuthManager ? window.AuthManager.getUser() : null;
    const pricing = DB.getAppPricing();

    if (!user) {
      return {
        status: 'guest',
        isTrial: false,
        daysLeft: 0,
        isExpired: false,
        isActive: false,
        isPending: false,
        isLocked: false,
        planName: 'Monthly Pro',
        price: pricing.monthlyPrice
      };
    }

    const sub = this._currentSub || DB.getSubscription() || {};
    const now = Date.now();
    // If trialEnd is not yet stamped, default to 10 days from now (onboarding pending)
    const trialEnd = sub.trialEnd ? Number(sub.trialEnd) : (now + (this.TRIAL_DAYS * 86400000));

    const isTrial = (sub.status === 'trialing' || !sub.status) && now < trialEnd;
    const daysLeft = isTrial ? Math.max(1, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24))) : 0;
    const isPending = sub.status === 'pending_approval';

    let isActive = false;
    let activeDaysLeft = 0;
    if (sub.status === 'active' && sub.subscriptionEnd) {
      const subEnd = new Date(sub.subscriptionEnd).getTime();
      if (subEnd > now) {
        isActive = true;
        activeDaysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
      }
    }

    const isExpired = !isActive && !isTrial && !isPending;
    const isLocked = isExpired;

    return {
      status: sub.status || (isTrial ? 'trialing' : (isActive ? 'active' : 'expired')),
      isTrial,
      daysLeft: isTrial ? daysLeft : activeDaysLeft,
      isExpired,
      isActive,
      isPending,
      isLocked,
      subscriptionEnd: sub.subscriptionEnd,
      lastPaymentRef: sub.lastPaymentRef || '',
      planName: sub.planName || 'Monthly Pro',
      price: sub.price || pricing.monthlyPrice
    };
  },

  isLocked() {
    const s = this.getStatus();
    return s.isLocked;
  },

  // ── 3. HEADER & SIDEBAR BADGES ──────────────────────────────
  updateHeaderBadge() {
    const status = this.getStatus();
    const badge = document.getElementById('trial-countdown-badge');
    const sidebarBadge = document.getElementById('sidebar-subscription-badge');

    if (!badge && !sidebarBadge) return;

    let badgeHtml = '';
    let badgeClass = 'trial-badge';

    if (status.isTrial) {
      badgeClass += ' trial-active';
      badgeHtml = `<span class="badge-icon">⏱️</span> <span><strong>${status.daysLeft}d</strong> <span class="badge-full-text">Free Trial </span><u style="cursor:pointer;" onclick="SubscriptionManager.openSubscriptionModal(); event.stopPropagation();">Upgrade</u></span>`;
    } else if (status.isActive) {
      badgeClass += ' sub-active';
      badgeHtml = `<span class="badge-icon">👑</span> <span><strong>Pro</strong><span class="badge-full-text"> Active</span> (${status.daysLeft}d)</span>`;
    } else if (status.isPending) {
      badgeClass += ' sub-pending';
      badgeHtml = `<span class="badge-icon">⏳</span> <span><span class="badge-full-text">Payment </span>Verifying</span>`;
    } else if (status.isLocked) {
      badgeClass += ' trial-expired';
      badgeHtml = `<span class="badge-icon">⚠️</span> <span><strong>Expired</strong> · <u style="cursor:pointer;" onclick="SubscriptionManager.openSubscriptionModal(); event.stopPropagation();">Unlock</u></span>`;
    }

    if (badge) {
      if (status.status === 'guest') {
        badge.style.display = 'none';
      } else {
        badge.className = badgeClass;
        badge.innerHTML = badgeHtml;
        badge.style.display = 'inline-flex';
        badge.onclick = () => this.openSubscriptionModal();
      }
    }

    if (sidebarBadge) {
      if (status.status === 'guest') {
        sidebarBadge.style.display = 'none';
      } else {
        sidebarBadge.className = 'sidebar-sub-card ' + badgeClass;
        sidebarBadge.innerHTML = badgeHtml;
        sidebarBadge.style.display = 'block';
        sidebarBadge.onclick = () => this.openSubscriptionModal();
      }
    }

    const drawerBadge = document.getElementById('drawer-subscription-badge');
    if (drawerBadge) {
      if (status.status === 'guest') {
        drawerBadge.style.display = 'none';
      } else {
        drawerBadge.className = 'sidebar-sub-card ' + badgeClass;
        drawerBadge.innerHTML = badgeHtml;
        drawerBadge.style.display = 'block';
        drawerBadge.onclick = () => this.openSubscriptionModal();
      }
    }
  },

  // ── 4. SUBSCRIPTION & UPGRADE MODAL ─────────────────────────
  openSubscriptionModal() {
    const status = this.getStatus();
    const pricing = DB.getAppPricing();
    const prop = DB.getProperty() || {};
    const user = window.AuthManager ? window.AuthManager.getUser() : null;

    const payeeUpi = pricing.payeeUpi || 'adityajeevanpise@okicici';
    const payeeName = pricing.payeeName || 'Aditya Jeevan Pise';
    const monthlyPrice = pricing.monthlyPrice || 1500;
    const officialQrPath = 'assets/subscription-qr.png';

    const cleanProp = encodeURIComponent(payeeName);
    const upiPayload = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${cleanProp}&am=${monthlyPrice}&cu=INR&tn=Angel+PG+1+Month+Subscription`;

    // Generate dynamic QR Code Data URL
    let qrUrl = '';
    if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
      try { qrUrl = QRCode.toDataURL(upiPayload, 260, 8); } catch (e) {}
    }
    if (!qrUrl) {
      qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiPayload)}&size=260x260&margin=8`;
    }

    // Modal status highlight banner
    let statusBanner = '';
    if (status.isTrial) {
      statusBanner = `
        <div class="sub-alert-card trial-glow">
          <div class="sub-alert-icon">⏱️</div>
          <div class="sub-alert-text">
            <strong>10-Day Free Trial Active:</strong> You have <strong>${status.daysLeft} days remaining</strong>. Subscribe now to avoid any interruption in service.
          </div>
        </div>`;
    } else if (status.isActive) {
      statusBanner = `
        <div class="sub-alert-card active-glow">
          <div class="sub-alert-icon">👑</div>
          <div class="sub-alert-text">
            <strong>Pro Plan Active!</strong> Valid until <strong>${new Date(status.subscriptionEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong> (${status.daysLeft} days remaining).
          </div>
        </div>`;
    } else if (status.isPending) {
      statusBanner = `
        <div class="sub-alert-card pending-glow">
          <div class="sub-alert-icon">⏳</div>
          <div class="sub-alert-text">
            <strong>Payment Under Verification:</strong> Transaction Ref <code>${status.lastPaymentRef}</code> submitted. You have full access while our team verifies.
          </div>
        </div>`;
    } else if (status.isExpired) {
      statusBanner = `
        <div class="sub-alert-card expired-glow">
          <div class="sub-alert-icon">⚠️</div>
          <div class="sub-alert-text">
            <strong>Free Trial Ended:</strong> Your 10-day trial has concluded. Please complete monthly payment below to unlock full access.
          </div>
        </div>`;
    }

    const modalHtml = `
      <div class="sub-modal-container">
        <!-- Close button if not locked -->
        ${!status.isLocked ? `<button type="button" class="sub-modal-close" onclick="closeModal()">✕</button>` : ''}

        <div class="sub-modal-header">
          <div class="sub-badge-pill">👑 RENTORA PRO</div>
          <h2>Upgrade to Unlimited PG Suite</h2>
          <p>Everything you need to automate floors, rooms, tenants, rent collections, and cloud records.</p>
        </div>

        ${statusBanner}

        <!-- Pricing & Value Card -->
        <div class="sub-pricing-row">
          <div class="sub-plan-card active">
            <div class="sub-plan-badge">MONTHLY ACCESS</div>
            <div class="sub-plan-price">
              <span class="currency">₹</span>
              <span class="amount">${monthlyPrice}</span>
              <span class="period">/ month</span>
            </div>
            <ul class="sub-features-list">
              <li>✅ <strong>Unlimited</strong> Floors, Rooms &amp; Bed Allocations</li>
              <li>✅ <strong>Live Cloud Sync</strong> &amp; Supabase Multi-Device Backup</li>
              <li>✅ <strong>1-Click WhatsApp</strong> Rent Reminders &amp; Receipts</li>
              <li>✅ <strong>Digital Business Card</strong> &amp; Tenant Aadhaar KYC</li>
              <li>✅ <strong>Revenue Analytics</strong> &amp; Security Deposit Tracker</li>
            </ul>
          </div>
        </div>

        <!-- UPI QR Code & Direct Mobile Payment -->
        <div class="sub-payment-box">
          <h3>⚡ Scan &amp; Pay via Any UPI App</h3>
          <p class="sub-pay-instruction">Scan with GPay, PhonePe, Paytm, or BHIM to pay <strong>₹${monthlyPrice}</strong></p>

          <div class="sub-qr-wrapper">
            <img src="${officialQrPath}" onerror="this.onerror=null;this.src='${qrUrl}'" alt="UPI Subscription QR Code (Fixed ₹${monthlyPrice})" class="sub-qr-image" onclick="SubscriptionManager.openUpiPayment()" style="cursor:pointer;" title="Tap to open UPI app (Fixed ₹${monthlyPrice})" />
            <div class="sub-upi-meta">
              <span class="sub-upi-label">Payee UPI ID:</span>
              <code class="sub-upi-code" id="sub-copy-upi">${payeeUpi}</code>
              <button type="button" class="btn-copy-upi" onclick="SubscriptionManager.copyUpi('${payeeUpi}')">📋 Copy</button>
            </div>
            <div style="margin-top:8px; display:inline-flex; align-items:center; gap:6px; background:rgba(34,197,94,0.12); color:#16a34a; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:700;">
              🔒 Fixed Amount: ₹${monthlyPrice} (Only ₹${monthlyPrice} can be paid from this QR code)
            </div>
          </div>

          <!-- UTR / Payment Submission Form -->
          <form id="form-sub-verify" onsubmit="SubscriptionManager.handlePaymentSubmit(event)">
            <div class="form-group" style="text-align: left; margin-top: 14px;">
              <label class="form-label" for="sub-utr-input">
                <strong>Enter 12-Digit UPI Ref / UTR Number:</strong>
              </label>
              <input type="text" id="sub-utr-input" class="form-control" placeholder="e.g. 423589123456" maxlength="24" required />
              <small style="color: var(--text-muted); font-size: 11px; display: block; margin-top: 4px;">
                You can find this in your GPay / PhonePe / Paytm payment receipt details.
              </small>
            </div>

            <button type="submit" class="btn btn-primary btn-block" id="btn-submit-sub-utr">
              <span>🚀 Submit Payment for Activation</span>
            </button>
          </form>

          <!-- WhatsApp Direct Confirmation -->
          <div style="margin-top: 10px;">
            <button type="button" class="btn-whatsapp-proof" onclick="SubscriptionManager.sendWhatsAppProof('${payeeUpi}', ${monthlyPrice})">
              <span>💬 Send Payment Screenshot on WhatsApp</span>
            </button>
          </div>

          <!-- Master / Promo Key Toggle -->
          <div class="sub-key-accordion">
            <a href="javascript:void(0)" onclick="SubscriptionManager.toggleKeyBox()">Have a License / Master Activation Key? ▾</a>
            <div id="sub-key-box" style="display: none; margin-top: 8px;">
              <div style="display: flex; gap: 8px;">
                <input type="text" id="sub-license-key-input" class="form-control" placeholder="Enter License Key..." style="text-transform: uppercase;" />
                <button type="button" class="btn btn-secondary" onclick="SubscriptionManager.redeemKey()">Redeem</button>
              </div>
            </div>
          </div>

          <!-- Bottom Button Redirecting to UPI Payments Page -->
          <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border);">
            <a href="${upiPayload}" onclick="SubscriptionManager.openUpiPayment();" class="btn-pay-intent" style="display:flex; align-items:center; justify-content:center; gap:10px; width:100%; box-sizing:border-box; text-decoration:none; padding:15px 20px; border-radius:12px; font-weight:700; font-size:16px; background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color:#ffffff; box-shadow:0 6px 18px rgba(34,197,94,0.35); text-align:center;">
              <span>📱 Proceed to UPI Payments Page (Pay ₹${monthlyPrice}) ➔</span>
            </a>
            <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-top:6px;">
              Opens Google Pay, PhonePe, Paytm, or BHIM with locked amount ₹${monthlyPrice}
            </div>
          </div>

          ${status.isLocked ? `
            <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 12px;">
              <button type="button" class="btn-sub-signout" onclick="AuthManager.signOut()">🚪 Sign Out / Switch Account</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    if (typeof showModal === 'function') {
      showModal('👑 Upgrade to Rentora Pro', modalHtml);
    } else if (typeof openModal === 'function') {
      openModal(modalHtml);
    } else {
      const titleEl = document.getElementById('modal-title');
      const bodyEl = document.getElementById('modal-body');
      const overlayEl = document.getElementById('modal-overlay');
      if (titleEl) titleEl.textContent = '👑 Upgrade to Rentora Pro';
      if (bodyEl) bodyEl.innerHTML = modalHtml;
      if (overlayEl) overlayEl.classList.add('open');
    }
  },

  // ── 5. FULL-SCREEN UNCLOSABLE PAYWALL ─────────────────────────
  showPaywall() {
    let paywallEl = document.getElementById('subscription-paywall-screen');
    if (!paywallEl) {
      paywallEl = document.createElement('div');
      paywallEl.id = 'subscription-paywall-screen';
      paywallEl.className = 'subscription-paywall-backdrop';
      document.body.appendChild(paywallEl);
    }

    const pricing = DB.getAppPricing();
    const payeeUpi = pricing.payeeUpi || 'adityajeevanpise@okicici';
    const payeeName = pricing.payeeName || 'Aditya Jeevan Pise';
    const monthlyPrice = pricing.monthlyPrice || 1500;
    const officialQrPath = 'assets/subscription-qr.png';

    const cleanProp = encodeURIComponent(payeeName);
    const upiPayload = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${cleanProp}&am=${monthlyPrice}&cu=INR&tn=Angel+PG+1+Month+Subscription`;

    let qrUrl = '';
    if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
      try { qrUrl = QRCode.toDataURL(upiPayload, 260, 8); } catch (e) {}
    }
    if (!qrUrl) {
      qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiPayload)}&size=260x260&margin=8`;
    }

    paywallEl.innerHTML = `
      <div class="paywall-card">
        <div class="paywall-icon-badge">🔒</div>
        <h2>10-Day Free Trial Expired</h2>
        <p class="paywall-sub">
          Your free trial has ended. Subscribe to <strong>Rentora Pro</strong> to unlock your data and continue managing properties.
        </p>

        <div class="paywall-price-banner">
          <div class="paywall-price-val">₹${monthlyPrice} <span>/ month</span></div>
          <div class="paywall-price-meta">Full Cloud Access · Mobile &amp; Desktop · Fixed QR Payment</div>
        </div>

        <div class="paywall-qr-container">
          <img src="${officialQrPath}" onerror="this.onerror=null;this.src='${qrUrl}'" alt="UPI Subscription QR (Fixed ₹${monthlyPrice})" class="paywall-qr-img" onclick="SubscriptionManager.openUpiPayment()" style="cursor:pointer;" title="Tap to open UPI app (Fixed ₹${monthlyPrice})" />
          <div class="paywall-upi-line">
            <span>UPI ID:</span> <strong>${payeeUpi}</strong>
            <button type="button" class="btn-copy-upi-sm" onclick="SubscriptionManager.copyUpi('${payeeUpi}')">📋 Copy</button>
          </div>
          <div style="margin-top:8px; display:inline-flex; align-items:center; gap:6px; background:rgba(34,197,94,0.12); color:#16a34a; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:700;">
            🔒 Fixed Amount: ₹${monthlyPrice} (Only ₹${monthlyPrice} can be paid from this QR code)
          </div>
        </div>

        <form id="form-paywall-utr" onsubmit="SubscriptionManager.handlePaymentSubmit(event)">
          <div class="form-group" style="text-align: left;">
            <label class="form-label" for="paywall-utr-input"><strong>Enter 12-Digit UPI Transaction / UTR:</strong></label>
            <input type="text" id="paywall-utr-input" class="form-control" placeholder="e.g. 423589123456" maxlength="24" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            <span>🚀 Submit &amp; Unlock Pro Access</span>
          </button>
        </form>

        <div style="margin-top: 10px;">
          <button type="button" class="btn-whatsapp-proof" onclick="SubscriptionManager.sendWhatsAppProof('${payeeUpi}', ${monthlyPrice})">
            <span>💬 Send Proof on WhatsApp</span>
          </button>
        </div>

        <!-- Prominent Bottom Button to Redirect to UPI Payments Page -->
        <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border);">
          <a href="${upiPayload}" onclick="SubscriptionManager.openUpiPayment();" class="btn-pay-intent" style="display:flex; align-items:center; justify-content:center; gap:10px; width:100%; box-sizing:border-box; text-decoration:none; padding:15px 20px; border-radius:12px; font-weight:700; font-size:16px; background:linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color:#ffffff; box-shadow:0 6px 18px rgba(34,197,94,0.35); text-align:center;">
            <span>📱 Proceed to UPI Payments Page (Pay ₹${monthlyPrice}) ➔</span>
          </a>
          <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-top:6px;">
            Opens Google Pay, PhonePe, Paytm, or BHIM with locked amount ₹${monthlyPrice}
          </div>
        </div>

        <div class="sub-key-accordion" style="margin-top: 12px;">
          <a href="javascript:void(0)" onclick="SubscriptionManager.toggleKeyBox('paywall')">Enter License Key ▾</a>
          <div id="paywall-key-box" style="display: none; margin-top: 8px;">
            <div style="display: flex; gap: 8px;">
              <input type="text" id="paywall-license-key-input" class="form-control" placeholder="LICENSE KEY..." style="text-transform: uppercase;" />
              <button type="button" class="btn btn-secondary" onclick="SubscriptionManager.redeemKey('paywall')">Unlock</button>
            </div>
          </div>
        </div>

        <div style="margin-top: 14px; border-top: 1px solid var(--border); padding-top: 10px;">
          <button type="button" class="btn-sub-signout" onclick="AuthManager.signOut()">🚪 Sign Out / Switch Account</button>
        </div>
      </div>
    `;

    paywallEl.style.display = 'flex';
  },

  removePaywall() {
    const paywallEl = document.getElementById('subscription-paywall-screen');
    if (paywallEl) {
      paywallEl.style.display = 'none';
    }
  },

  // ── 6. PAYMENT SUBMISSION & ACTIVATION ───────────────────────
  async handlePaymentSubmit(event) {
    if (event) event.preventDefault();

    const utrInput = document.getElementById('sub-utr-input') || document.getElementById('paywall-utr-input');
    const utr = (utrInput ? utrInput.value : '').trim();

    if (!utr || utr.length < 6) {
      if (typeof showToast === 'function') {
        showToast('Please enter a valid 12-digit UPI UTR / Transaction Reference number', 'error');
      } else {
        alert('Please enter a valid UPI Transaction / UTR number.');
      }
      return;
    }

    const user = window.AuthManager ? window.AuthManager.getUser() : null;
    if (!user) return;

    const pricing = DB.getAppPricing();
    const now = Date.now();
    // Grant 30 days active subscription upon payment submission
    const subEnd = new Date(now + (30 * 24 * 60 * 60 * 1000)).toISOString();

    const sub = {
      userId: user.id,
      userEmail: user.email,
      status: 'active', // Activated for 30 days
      subscriptionEnd: subEnd,
      planName: 'Monthly Pro',
      price: pricing.monthlyPrice,
      lastPaymentRef: utr,
      lastPaymentDate: new Date().toISOString()
    };

    DB.saveSubscription(sub);
    this._currentSub = sub;

    // Save to Supabase
    try {
      const client = window.supabaseClient || (window.AuthManager && window.AuthManager.client);
      if (client && user.id) {
        await client.from('user_subscriptions').upsert({
          user_id: user.id,
          user_email: user.email,
          status: 'active',
          subscription_end: subEnd,
          plan_name: 'Monthly Pro',
          price_inr: pricing.monthlyPrice,
          last_payment_ref: utr,
          last_payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('[Subscription] Remote sync note:', err);
    }

    // Refresh UI & remove paywall
    this.updateHeaderBadge();
    this.removePaywall();
    if (typeof closeModal === 'function') closeModal();

    try { if (typeof SoundFX !== 'undefined' && SoundFX.pinSuccess) SoundFX.pinSuccess(); } catch (e) {}

    if (typeof showToast === 'function') {
      showToast('🎉 Subscription Active! Your account has been upgraded to Rentora Pro.', 'success');
    } else {
      alert('Subscription Active! Welcome to Rentora Pro.');
    }

    if (window.App && typeof window.App.navigate === 'function') {
      window.App.navigate('dashboard');
    }
  },

  // ── 7. LICENSE / MASTER KEY ACTIVATION ───────────────────────
  async redeemKey(source = 'modal') {
    const input = source === 'paywall' 
      ? document.getElementById('paywall-license-key-input') 
      : document.getElementById('sub-license-key-input');

    const key = (input ? input.value : '').trim().toUpperCase();
    if (!key) {
      if (typeof showToast === 'function') showToast('Please enter an activation key', 'error');
      return;
    }

    if (key === this.MASTER_KEY || key === 'RENTORA-PRO' || key === 'ANGEL-PRO-2026' || key === 'ANGEL-PRO' || key === 'LIFETIME-VIP') {
      const user = window.AuthManager ? window.AuthManager.getUser() : null;
      if (!user) return;

      const subEnd = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString();
      const sub = {
        userId: user.id,
        userEmail: user.email,
        status: 'active',
        subscriptionEnd: subEnd,
        planName: 'VIP Pro (Annual)',
        price: 0,
        lastPaymentRef: 'KEY-' + key,
        lastPaymentDate: new Date().toISOString()
      };

      DB.saveSubscription(sub);
      this._currentSub = sub;

      try {
        const client = window.supabaseClient || (window.AuthManager && window.AuthManager.client);
        if (client && user.id) {
          await client.from('user_subscriptions').upsert({
            user_id: user.id,
            user_email: user.email,
            status: 'active',
            subscription_end: subEnd,
            plan_name: 'VIP Pro (Annual)',
            price_inr: 0,
            last_payment_ref: 'KEY-' + key,
            updated_at: new Date().toISOString()
          });
        }
      } catch (e) {}

      this.updateHeaderBadge();
      this.removePaywall();
      if (typeof closeModal === 'function') closeModal();

      if (typeof showToast === 'function') {
        showToast('🎉 Key Verified! 365 Days of Pro Access Activated.', 'success');
      } else {
        alert('Key Verified! 365 Days of Pro Access Activated.');
      }
    } else {
      if (typeof showToast === 'function') {
        showToast('Invalid License Key. Please check and try again.', 'error');
      } else {
        alert('Invalid License Key.');
      }
    }
  },

  // ── 8. WHATSAPP & UPI HELPERS ────────────────────────────────
  openUpiPayment() {
    const pricing = DB.getAppPricing();
    const payeeUpi = pricing.payeeUpi || 'adityajeevanpise@okicici';
    const payeeName = encodeURIComponent(pricing.payeeName || 'Aditya Jeevan Pise');
    const amount = pricing.monthlyPrice || 1500;
    const note = encodeURIComponent('Rentora 1 Month Subscription');
    const upiUri = `upi://pay?pa=${payeeUpi}&pn=${payeeName}&am=${amount}&cu=INR&tn=${note}`;
    try {
      window.location.href = upiUri;
    } catch (e) {
      console.warn('[Subscription] UPI launch warning:', e);
    }
  },

  copyUpi(upiId) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(upiId).then(() => {
        if (typeof showToast === 'function') showToast('UPI ID copied to clipboard!', 'info');
      });
    } else {
      prompt('Copy UPI ID:', upiId);
    }
  },

  toggleKeyBox(source = 'modal') {
    const el = source === 'paywall' 
      ? document.getElementById('paywall-key-box') 
      : document.getElementById('sub-key-box');
    if (el) {
      el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
    }
  },

  sendWhatsAppProof(payeeUpi, amount) {
    const user = window.AuthManager ? window.AuthManager.getUser() : null;
    const email = user ? user.email : 'Landlord';
    const utrInput = document.getElementById('sub-utr-input') || document.getElementById('paywall-utr-input');
    const utr = (utrInput ? utrInput.value : '').trim() || 'Pending';
    const pricing = DB.getAppPricing();
    const phone = pricing.whatsappNumber || '919876543210';

    const msg = `*Rentora Pro Subscription Payment Proof*\n\n` +
      `👤 *Account Email:* ${email}\n` +
      `💰 *Amount Paid:* ₹${amount}\n` +
      `💳 *Paid To UPI:* ${payeeUpi}\n` +
      `🔢 *Transaction / UTR:* ${utr}\n\n` +
      `Please confirm my Rentora Pro access. Thank you!`;

    const waUrl = `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  },

  // ── 9. OWNER PRICING & PAYMENT SETTINGS MODAL ─────────────────
  openOwnerConfigModal() {
    const pricing = DB.getAppPricing();

    const modalHtml = `
      <div style="padding: 1.5rem; max-width: 480px; margin: 0 auto;">
        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-primary);">
          ⚙️ SaaS Pricing &amp; UPI Configuration
        </h3>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
          Configure your subscription price and the Bank UPI details where landlords send monthly payments.
        </p>

        <form onsubmit="SubscriptionManager.saveOwnerConfig(event)">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label" for="cfg-sub-price">Monthly Subscription Fee (₹ INR):</label>
            <input type="number" id="cfg-sub-price" class="form-control" value="${pricing.monthlyPrice}" min="49" max="99999" required />
          </div>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label" for="cfg-sub-upi">Receiving Bank UPI ID:</label>
            <input type="text" id="cfg-sub-upi" class="form-control" value="${pricing.payeeUpi}" placeholder="e.g. yourname@okhdfcbank" required />
          </div>

          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-label" for="cfg-sub-name">Payee Display Name:</label>
            <input type="text" id="cfg-sub-name" class="form-control" value="${pricing.payeeName}" placeholder="e.g. Angel PG Management" required />
          </div>

          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label class="form-label" for="cfg-sub-phone">Admin WhatsApp Support Number (with country code):</label>
            <input type="text" id="cfg-sub-phone" class="form-control" value="${pricing.whatsappNumber}" placeholder="e.g. 919876543210" required />
          </div>

          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Pricing &amp; UPI</button>
          </div>
        </form>
      </div>
    `;

    openModal(modalHtml);
  },

  saveOwnerConfig(event) {
    if (event) event.preventDefault();

    const price = Number(document.getElementById('cfg-sub-price')?.value) || 1500;
    const upi = (document.getElementById('cfg-sub-upi')?.value || '').trim() || 'adityajeevanpise@okicici';
    const name = (document.getElementById('cfg-sub-name')?.value || '').trim() || 'Aditya Jeevan Pise';
    const phone = (document.getElementById('cfg-sub-phone')?.value || '').trim() || '919876543210';

    const pricing = {
      monthlyPrice: price,
      payeeUpi: upi,
      payeeName: name,
      whatsappNumber: phone
    };

    DB.saveAppPricing(pricing);
    if (typeof closeModal === 'function') closeModal();
    if (typeof showToast === 'function') showToast('Subscription pricing & UPI updated successfully!', 'success');

    if (window.App && window.App.currentTab === 'settings') {
      Settings.render();
    }
  }
};

window.SubscriptionManager = SubscriptionManager;
