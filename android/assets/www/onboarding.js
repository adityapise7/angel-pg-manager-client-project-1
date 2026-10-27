// ============================================================
// RENTORA — UNIVERSAL PG MANAGEMENT SAAS PLATFORM
// ONBOARDING WIZARD CONTROLLER (MULTI-STEP SAAS SETUP)
// ============================================================

(function(window) {
  'use strict';

  const OnboardingManager = {
    currentStep: 1,
    totalSteps: 4,
    formData: {
      // Section A: PG Info
      pgName: '',
      pgType: 'Co-living',
      locality: '',
      city: '',
      state: '',
      pinCode: '',
      fullAddress: '',
      phone: '',
      ownerName: '',
      buildingsCount: 1,
      totalCapacity: 10,

      // Section B: Payment Configuration
      upiId: '',
      upiQrType: 'dynamic', // 'dynamic' | 'static'
      whatsappRemindersEnabled: true,
      whatsappCountryCode: '91',

      // Section C: Rent & Property Rules
      defaultRent: 5000,
      securityDeposit: 5000,
      rentDueDate: 5,
      lateFeeEnabled: false,
      lateFeeAmount: 50,
      lateFeeGraceDays: 3,
      facilities: ['Wi-Fi', 'Housekeeping', 'Water (RO)', 'Security / CCTV'],

      // Section D: Localization & Preferences
      currency: '₹',
      language: 'English',
      notifyRentDue: true,
      notifyPaymentReceived: true,
      notifyVacantBed: false
    },

    availableFacilities: [
      { id: 'Wi-Fi', label: 'High-Speed Wi-Fi', icon: '📶' },
      { id: 'Food / Mess', label: 'Food & Daily Mess', icon: '🍲' },
      { id: 'Housekeeping', label: 'Daily Housekeeping', icon: '🧹' },
      { id: 'Laundry', label: 'Laundry & Washing', icon: '🧺' },
      { id: 'Power Backup', label: '24/7 Power Backup', icon: '⚡' },
      { id: 'AC', label: 'Air Conditioning', icon: '❄️' },
      { id: 'Geyser', label: 'Hot Water / Geyser', icon: '🚿' },
      { id: 'Parking', label: 'Vehicle Parking', icon: '🚗' },
      { id: 'Water (RO)', label: 'Purified RO Water', icon: '💧' },
      { id: 'Security / CCTV', label: '24/7 CCTV Security', icon: '📹' },
      { id: 'Gym', label: 'Fitness & Gym', icon: '🏋️' },
      { id: 'Study Room', label: 'Quiet Study Area', icon: '📚' }
    ],

    // ── CHECK IF ONBOARDING IS NEEDED ───────────────────────
    needsOnboarding() {
      // 1. If property has explicitly completed onboarding
      const prop = DB.getProperty();
      if (prop && prop.onboardingCompleted === true) {
        return false;
      }

      // 2. Existing Angel PG legacy accounts with pre-existing data:
      // If the user already has rooms or tenants or floors saved, preserve them and auto-mark as onboarded
      const floors = DB.getFloors();
      const rooms = DB.getRooms();
      const tenants = DB.getTenants();
      if ((floors && floors.length > 0) || (rooms && rooms.length > 0) || (tenants && tenants.length > 0)) {
        if (prop) {
          prop.onboardingCompleted = true;
          DB.saveProperty(prop);
        }
        return false;
      }

      // 3. If explicit local storage flag is set
      const onboardFlag = localStorage.getItem('rentora_onboarding_completed');
      if (onboardFlag === 'true') {
        return false;
      }

      // Fresh account with no rooms/tenants: require onboarding
      return true;
    },

    // ── START ONBOARDING MODAL / SCREEN ─────────────────────
    start() {
      this.currentStep = 1;
      
      // Pre-fill owner info from Supabase Auth if available
      const user = window.AuthManager ? window.AuthManager.getUser() : null;
      if (user) {
        if (user.user_metadata && user.user_metadata.full_name) {
          this.formData.ownerName = user.user_metadata.full_name;
        }
        if (user.phone) {
          this.formData.phone = user.phone;
        }
      }

      // Remove any existing onboarding overlay
      const existing = document.getElementById('rentora-onboarding-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'rentora-onboarding-overlay';
      overlay.className = 'onboarding-overlay';
      overlay.innerHTML = `
        <div class="onboarding-modal">
          <!-- Header Branding -->
          <div class="onboarding-header">
            <div class="onboarding-brand">
              <img src="rentora-logo.png" alt="Rentora Logo" class="onboarding-brand-logo" onerror="this.src='assets/rentora-logo.png'">
              <div>
                <h1 class="onboarding-brand-title">Rentora</h1>
                <p class="onboarding-brand-sub">Universal PG &amp; Hostel Management SaaS Platform</p>
              </div>
            </div>
            
            <!-- Progress Bar & Stepper -->
            <div class="onboarding-stepper">
              <div class="onboarding-step-indicator" id="step-ind-1">
                <span class="step-num">1</span>
                <span class="step-label">PG Info</span>
              </div>
              <div class="onboarding-step-line" id="step-line-1"></div>
              <div class="onboarding-step-indicator" id="step-ind-2">
                <span class="step-num">2</span>
                <span class="step-label">Payments</span>
              </div>
              <div class="onboarding-step-line" id="step-line-2"></div>
              <div class="onboarding-step-indicator" id="step-ind-3">
                <span class="step-num">3</span>
                <span class="step-label">Rent &amp; Rules</span>
              </div>
              <div class="onboarding-step-line" id="step-line-3"></div>
              <div class="onboarding-step-indicator" id="step-ind-4">
                <span class="step-num">4</span>
                <span class="step-label">Preferences</span>
              </div>
            </div>
          </div>

          <!-- Wizard Body -->
          <div class="onboarding-body" id="onboarding-step-container">
            <!-- Step content dynamically rendered here -->
          </div>

          <!-- Footer Actions -->
          <div class="onboarding-footer">
            <button type="button" class="btn btn-outline" id="btn-onboarding-prev" onclick="OnboardingManager.prevStep()">
              ← Back
            </button>
            <div class="onboarding-footer-right">
              <button type="button" class="btn btn-ghost" id="btn-onboarding-skip" onclick="OnboardingManager.skipOptional()" style="display:none">
                Skip for now
              </button>
              <button type="button" class="btn btn-primary" id="btn-onboarding-next" onclick="OnboardingManager.nextStep()">
                Continue →
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.renderStep();
    },

    // ── RENDER ACTIVE STEP ──────────────────────────────────
    renderStep() {
      this.updateStepperUI();
      const container = document.getElementById('onboarding-step-container');
      if (!container) return;

      const prevBtn = document.getElementById('btn-onboarding-prev');
      const nextBtn = document.getElementById('btn-onboarding-next');
      const skipBtn = document.getElementById('btn-onboarding-skip');

      if (prevBtn) prevBtn.style.display = this.currentStep === 1 ? 'none' : 'inline-flex';
      if (skipBtn) skipBtn.style.display = (this.currentStep === 2 || this.currentStep === 3) ? 'inline-flex' : 'none';
      if (nextBtn) {
        nextBtn.innerHTML = this.currentStep === this.totalSteps ?
          '🚀 Complete Setup &amp; Launch Dashboard' : 'Continue →';
      }

      if (this.currentStep === 1) {
        container.innerHTML = this.getStep1Html();
      } else if (this.currentStep === 2) {
        container.innerHTML = this.getStep2Html();
      } else if (this.currentStep === 3) {
        container.innerHTML = this.getStep3Html();
      } else if (this.currentStep === 4) {
        container.innerHTML = this.getStep4Html();
      }

      // Scroll wizard to top
      container.scrollTop = 0;
    },

    updateStepperUI() {
      for (let i = 1; i <= this.totalSteps; i++) {
        const ind = document.getElementById(`step-ind-${i}`);
        if (ind) {
          ind.classList.remove('active', 'completed');
          if (i === this.currentStep) ind.classList.add('active');
          else if (i < this.currentStep) ind.classList.add('completed');
        }
        if (i < this.totalSteps) {
          const line = document.getElementById(`step-line-${i}`);
          if (line) {
            line.classList.toggle('active', i < this.currentStep);
          }
        }
      }
    },

    // ── STEP 1: PG INFORMATION ──────────────────────────────
    getStep1Html() {
      return `
        <div class="onboarding-step-panel">
          <div class="step-heading">
            <span class="step-badge">Section A</span>
            <h2>Tell Us About Your PG Property</h2>
            <p class="step-desc">Enter your PG's basic information to personalize your Rentora dashboard and tenant management tools.</p>
          </div>

          <div class="form-group">
            <label class="form-label" for="ob-pg-name">
              PG Name <span class="required-star">*</span>
            </label>
            <div class="input-with-icon">
              <span class="input-icon">🏢</span>
              <input type="text" id="ob-pg-name" class="form-control" placeholder="e.g. Sri Balaji Luxury PG / Oxford Living" value="${this.escapeHtml(this.formData.pgName)}" required>
            </div>
            <span class="form-hint">This name will appear on the dashboard header, rent receipts, and WhatsApp reminders.</span>
          </div>

          <div class="form-group">
            <label class="form-label">
              PG Category / Type <span class="required-star">*</span>
            </label>
            <div class="pg-type-grid">
              <label class="pg-type-card ${this.formData.pgType === 'Boys PG' ? 'selected' : ''}">
                <input type="radio" name="ob-pg-type" value="Boys PG" ${this.formData.pgType === 'Boys PG' ? 'checked' : ''} onchange="OnboardingManager.selectPgType('Boys PG')">
                <span class="pg-type-icon">👦</span>
                <span class="pg-type-title">Boys PG</span>
              </label>

              <label class="pg-type-card ${this.formData.pgType === 'Girls PG' ? 'selected' : ''}">
                <input type="radio" name="ob-pg-type" value="Girls PG" ${this.formData.pgType === 'Girls PG' ? 'checked' : ''} onchange="OnboardingManager.selectPgType('Girls PG')">
                <span class="pg-type-icon">👧</span>
                <span class="pg-type-title">Girls PG</span>
              </label>

              <label class="pg-type-card ${this.formData.pgType === 'Co-living' ? 'selected' : ''}">
                <input type="radio" name="ob-pg-type" value="Co-living" ${this.formData.pgType === 'Co-living' ? 'checked' : ''} onchange="OnboardingManager.selectPgType('Co-living')">
                <span class="pg-type-icon">🏠</span>
                <span class="pg-type-title">Co-living</span>
              </label>

              <label class="pg-type-card ${this.formData.pgType === 'Other' ? 'selected' : ''}">
                <input type="radio" name="ob-pg-type" value="Other" ${this.formData.pgType === 'Other' ? 'checked' : ''} onchange="OnboardingManager.selectPgType('Other')">
                <span class="pg-type-icon">🏢</span>
                <span class="pg-type-title">Hostel / Other</span>
              </label>
            </div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="ob-owner-name">Owner / Manager Name</label>
              <div class="input-with-icon">
                <span class="input-icon">👤</span>
                <input type="text" id="ob-owner-name" class="form-control" placeholder="e.g. Ramesh Kumar" value="${this.escapeHtml(this.formData.ownerName)}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="ob-phone">Primary Contact Phone</label>
              <div class="input-with-icon">
                <span class="input-icon">📞</span>
                <input type="tel" id="ob-phone" class="form-control" placeholder="e.g. 9876543210" value="${this.escapeHtml(this.formData.phone)}">
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Full PG Address <span class="required-star">*</span></label>
            <div class="form-grid-2" style="margin-bottom: 8px;">
              <div class="input-with-icon">
                <span class="input-icon">📍</span>
                <input type="text" id="ob-locality" class="form-control" placeholder="Locality / Area / Street" value="${this.escapeHtml(this.formData.locality)}" required>
              </div>
              <div class="input-with-icon">
                <span class="input-icon">🏙️</span>
                <input type="text" id="ob-city" class="form-control" placeholder="City (e.g. Bengaluru, Pune)" value="${this.escapeHtml(this.formData.city)}" required>
              </div>
            </div>
            <div class="form-grid-2">
              <div class="input-with-icon">
                <span class="input-icon">🗺️</span>
                <input type="text" id="ob-state" class="form-control" placeholder="State (e.g. Karnataka, Maharashtra)" value="${this.escapeHtml(this.formData.state)}" required>
              </div>
              <div class="input-with-icon">
                <span class="input-icon">📮</span>
                <input type="text" id="ob-pincode" class="form-control" placeholder="PIN Code (6 digits)" maxlength="6" value="${this.escapeHtml(this.formData.pinCode)}" required>
              </div>
            </div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="ob-buildings">Number of Buildings</label>
              <div class="input-with-icon">
                <span class="input-icon">🏘️</span>
                <input type="number" id="ob-buildings" class="form-control" min="1" max="20" value="${this.formData.buildingsCount}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="ob-capacity">Total Approximate Bed Capacity</label>
              <div class="input-with-icon">
                <span class="input-icon">🛏️</span>
                <input type="number" id="ob-capacity" class="form-control" min="1" max="1000" placeholder="e.g. 25" value="${this.formData.totalCapacity}">
              </div>
            </div>
          </div>
        </div>
      `;
    },

    selectPgType(type) {
      this.formData.pgType = type;
      document.querySelectorAll('.pg-type-card').forEach(el => {
        el.classList.toggle('selected', el.querySelector('input').value === type);
      });
    },

    // ── STEP 2: PAYMENT CONFIGURATION ───────────────────────
    getStep2Html() {
      return `
        <div class="onboarding-step-panel">
          <div class="step-heading">
            <span class="step-badge">Section B</span>
            <h2>Payment &amp; WhatsApp Reminders</h2>
            <p class="step-desc">Configure your Bank UPI ID to receive direct tenant rent payments via QR codes, invoices, and WhatsApp reminders.</p>
          </div>

          <!-- Crucial Educational Banner -->
          <div class="info-alert-box">
            <span class="info-alert-icon">ℹ️</span>
            <div class="info-alert-text">
              <strong>How Payment Collection Works:</strong>
              Your UPI ID is the direct recipient for tenant payments. Rentora generates secure QR codes for that destination. WhatsApp messaging handles communication and automated follow-ups separately.
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="ob-upi-id">
              Your Bank UPI ID (VPA) <span class="required-star">*</span>
            </label>
            <div class="input-with-icon">
              <span class="input-icon">💳</span>
              <input type="text" id="ob-upi-id" class="form-control" placeholder="e.g. yourname@okicici, pgname@paytm" value="${this.escapeHtml(this.formData.upiId)}" oninput="OnboardingManager.validateUpiInput(this)">
            </div>
            <div id="ob-upi-feedback" class="field-feedback"></div>
            <span class="form-hint">Direct 100% tenant payments go directly to this bank account with 0% platform commission.</span>
          </div>

          <!-- QR Mode Selection -->
          <div class="form-group">
            <label class="form-label">Payment QR Code Instrument Style</label>
            <div class="qr-mode-grid">
              <label class="qr-mode-card ${this.formData.upiQrType === 'dynamic' ? 'selected' : ''}">
                <input type="radio" name="ob-qr-mode" value="dynamic" ${this.formData.upiQrType === 'dynamic' ? 'checked' : ''} onchange="OnboardingManager.selectQrMode('dynamic')">
                <div class="qr-mode-title">⚡ Dynamic Payment QR (Recommended)</div>
                <div class="qr-mode-desc">QR code encodes each tenant's exact rent amount and invoice number. Prevents underpayment errors.</div>
              </label>

              <label class="qr-mode-card ${this.formData.upiQrType === 'static' ? 'selected' : ''}">
                <input type="radio" name="ob-qr-mode" value="static" ${this.formData.upiQrType === 'static' ? 'checked' : ''} onchange="OnboardingManager.selectQrMode('static')">
                <div class="qr-mode-title">📌 Static UPI QR</div>
                <div class="qr-mode-desc">Static PG QR code where the tenant manually types the rent amount when scanning.</div>
              </label>
            </div>
          </div>

          <!-- Live QR Code Preview Modal Trigger -->
          <div class="qr-preview-box">
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <div>
                <strong>Payment Instrument Preview:</strong>
                <p class="fs-12 color-secondary" style="margin:2px 0 0 0;">Check how your branded QR payment card will look to tenants</p>
              </div>
              <button type="button" class="btn btn-outline btn-sm" onclick="OnboardingManager.previewQrCard()">
                👁️ Preview Payment QR
              </button>
            </div>
          </div>

          <!-- WhatsApp Reminder Integration Preference -->
          <div class="form-group" style="margin-top:20px;">
            <label class="form-label">WhatsApp Communication Preferences</label>
            
            <div class="preference-toggle-item">
              <div class="pref-info">
                <div class="pref-title">📲 WhatsApp Rent Reminders &amp; Invoices</div>
                <div class="pref-desc">Enable 1-tap WhatsApp reminders with pre-filled payment instructions and QR receipt cards.</div>
              </div>
              <label class="toggle">
                <input type="checkbox" id="ob-wa-enabled" ${this.formData.whatsappRemindersEnabled ? 'checked' : ''} onchange="OnboardingManager.formData.whatsappRemindersEnabled = this.checked">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="info-card-subtle">
            <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">
              🔗 WhatsApp Integration Note:
            </div>
            <p style="font-size:12px; color:var(--text-secondary); line-height:1.4; margin:0;">
              Rentora uses WhatsApp Web &amp; WhatsApp Mobile deep links. No third-party API keys or recurring per-message WhatsApp costs are required. You can review or adjust message templates anytime in Settings.
            </p>
          </div>
        </div>
      `;
    },

    selectQrMode(mode) {
      this.formData.upiQrType = mode;
      document.querySelectorAll('.qr-mode-card').forEach(el => {
        el.classList.toggle('selected', el.querySelector('input').value === mode);
      });
    },

    validateUpiInput(el) {
      const val = (el.value || '').trim();
      const feedback = document.getElementById('ob-upi-feedback');
      if (!feedback) return;

      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!val) {
        feedback.innerHTML = '';
        feedback.className = 'field-feedback';
      } else if (upiRegex.test(val)) {
        feedback.innerHTML = '✅ Valid UPI ID format';
        feedback.className = 'field-feedback success';
      } else {
        feedback.innerHTML = '⚠️ Enter a valid UPI format (e.g. username@bankhandle)';
        feedback.className = 'field-feedback warning';
      }
    },

    previewQrCard() {
      const upiId = (document.getElementById('ob-upi-id')?.value || this.formData.upiId || '').trim();
      const pgName = this.formData.pgName || 'Your PG Property';

      if (!upiId) {
        if (typeof showToast === 'function') {
          showToast('Please enter your Bank UPI ID first to generate the preview', 'info');
        }
        return;
      }

      const upiPayload = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(pgName)}&am=5000&cu=INR&tn=Rentora+Payment+Preview`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiPayload)}&size=240x240&margin=8`;

      const previewHtml = `
        <div style="text-align:center; padding:12px;">
          <div style="font-weight:800; font-size:18px; color:var(--text-primary); margin-bottom:4px;">${this.escapeHtml(pgName)}</div>
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:16px;">Official Rent Payment QR Instrument</div>
          <div style="display:inline-block; padding:12px; background:#fff; border-radius:16px; box-shadow:0 10px 25px rgba(0,0,0,0.1); border:1px solid #e2e8f0; margin-bottom:14px;">
            <img src="${qrUrl}" alt="Payment QR" style="width:200px; height:200px; display:block; border-radius:8px;">
          </div>
          <div style="font-family:monospace; font-size:13px; font-weight:700; color:var(--primary); background:rgba(79,70,229,0.08); padding:8px 12px; border-radius:8px; display:inline-block;">
            UPI: ${this.escapeHtml(upiId)}
          </div>
          <p style="font-size:12px; color:var(--text-secondary); margin-top:14px; line-height:1.4;">
            Tenants scan this using GPay, PhonePe, Paytm, or BHIM. Payments credit instantly to your registered bank account.
          </p>
          <button type="button" class="btn btn-primary btn-full mt-12" onclick="closeModal()">Got it</button>
        </div>
      `;

      if (typeof showModal === 'function') {
        showModal('💳 Payment QR Preview', previewHtml);
      }
    },

    // ── STEP 3: RENT & PROPERTY RULES ───────────────────────
    getStep3Html() {
      const selectedFacilities = this.formData.facilities || [];
      return `
        <div class="onboarding-step-panel">
          <div class="step-heading">
            <span class="step-badge">Section C</span>
            <h2>Rent Defaults &amp; Included Amenities</h2>
            <p class="step-desc">Set baseline room rates and amenities. You can override these defaults for individual rooms or tenants anytime.</p>
          </div>

          <div class="form-grid-3">
            <div class="form-group">
              <label class="form-label" for="ob-rent">Default Monthly Rent</label>
              <div class="input-with-icon">
                <span class="input-icon">💰</span>
                <input type="number" id="ob-rent" class="form-control" placeholder="5000" min="0" step="500" value="${this.formData.defaultRent}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="ob-deposit">Security Deposit</label>
              <div class="input-with-icon">
                <span class="input-icon">🛡️</span>
                <input type="number" id="ob-deposit" class="form-control" placeholder="5000" min="0" step="500" value="${this.formData.securityDeposit}">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="ob-due-date">Monthly Due Date</label>
              <div class="input-with-icon">
                <span class="input-icon">📅</span>
                <select id="ob-due-date" class="form-control">
                  ${[1,2,3,4,5,6,7,8,9,10,15,20,25].map(d => `
                    <option value="${d}" ${this.formData.rentDueDate === d ? 'selected' : ''}>Day ${d} of every month</option>
                  `).join('')}
                </select>
              </div>
            </div>
          </div>

          <!-- Late Payment Rules -->
          <div class="form-group">
            <div class="preference-toggle-item" style="margin-bottom:10px;">
              <div class="pref-info">
                <div class="pref-title">⚠️ Late Payment Fee Rule (Optional)</div>
                <div class="pref-desc">Automatically compute a late fine if rent is unpaid after grace period.</div>
              </div>
              <label class="toggle">
                <input type="checkbox" id="ob-latefee-toggle" ${this.formData.lateFeeEnabled ? 'checked' : ''} onchange="OnboardingManager.toggleLateFee(this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div id="ob-latefee-box" style="display:${this.formData.lateFeeEnabled ? 'flex' : 'none'}; gap:12px;">
              <div class="input-with-icon" style="flex:1;">
                <span class="input-icon">💸</span>
                <input type="number" id="ob-latefee-amount" class="form-control" placeholder="Late fee ₹" value="${this.formData.lateFeeAmount}">
              </div>
              <div class="input-with-icon" style="flex:1;">
                <span class="input-icon">⏳</span>
                <input type="number" id="ob-latefee-grace" class="form-control" placeholder="Grace days (e.g. 3)" value="${this.formData.lateFeeGraceDays}">
              </div>
            </div>
          </div>

          <!-- Included Facilities Checkbox Grid -->
          <div class="form-group">
            <label class="form-label">Included Facilities &amp; Amenities</label>
            <span class="form-hint" style="margin-bottom:10px; display:block;">Select the amenities available at your PG to showcase in rent agreements and receipts:</span>
            
            <div class="amenities-pill-grid">
              ${this.availableFacilities.map(f => {
                const isChecked = selectedFacilities.includes(f.id);
                return `
                  <label class="amenity-pill ${isChecked ? 'active' : ''}" onclick="OnboardingManager.toggleAmenity(this, '${f.id}')">
                    <span class="amenity-icon">${f.icon}</span>
                    <span class="amenity-label">${f.label}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    },

    toggleLateFee(enabled) {
      this.formData.lateFeeEnabled = enabled;
      const box = document.getElementById('ob-latefee-box');
      if (box) box.style.display = enabled ? 'flex' : 'none';
    },

    toggleAmenity(el, amenityId) {
      el.classList.toggle('active');
      const cur = this.formData.facilities || [];
      if (cur.includes(amenityId)) {
        this.formData.facilities = cur.filter(id => id !== amenityId);
      } else {
        this.formData.facilities.push(amenityId);
      }
    },

    // ── STEP 4: LOCALIZATION & CONFIRMATION ───────────────────
    getStep4Html() {
      return `
        <div class="onboarding-step-panel">
          <div class="step-heading">
            <span class="step-badge">Section D</span>
            <h2>Preferences &amp; Final Confirmation</h2>
            <p class="step-desc">Review your PG configuration. Your Rentora workspace will be personalized instantly.</p>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="ob-currency">Currency Format</label>
              <select id="ob-currency" class="form-control" onchange="OnboardingManager.formData.currency = this.value">
                <option value="₹" ${this.formData.currency === '₹' ? 'selected' : ''}>INR (₹) — Indian Rupee</option>
                <option value="$" ${this.formData.currency === '$' ? 'selected' : ''}>USD ($) — US Dollar</option>
                <option value="€" ${this.formData.currency === '€' ? 'selected' : ''}>EUR (€) — Euro</option>
                <option value="£" ${this.formData.currency === '£' ? 'selected' : ''}>GBP (£) — British Pound</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="ob-lang">Application Language</label>
              <select id="ob-lang" class="form-control" onchange="OnboardingManager.formData.language = this.value">
                <option value="English" selected>English (Primary)</option>
                <option value="Hindi">Hindi (Coming Soon)</option>
                <option value="Kannada">Kannada (Coming Soon)</option>
                <option value="Telugu">Telugu (Coming Soon)</option>
              </select>
            </div>
          </div>

          <!-- Notification Toggles -->
          <div class="form-group">
            <label class="form-label">Alert &amp; Notification Preferences</label>

            <div class="preference-toggle-item mb-8">
              <div class="pref-info">
                <div class="pref-title">📅 Rent Due Alerts</div>
                <div class="pref-desc">Display badge and summary of pending rents on due date.</div>
              </div>
              <label class="toggle">
                <input type="checkbox" ${this.formData.notifyRentDue ? 'checked' : ''} onchange="OnboardingManager.formData.notifyRentDue = this.checked">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="preference-toggle-item mb-8">
              <div class="pref-info">
                <div class="pref-title">🧾 Payment Confirmation Receipts</div>
                <div class="pref-desc">Prompt to generate digital payment receipts upon collecting rent.</div>
              </div>
              <label class="toggle">
                <input type="checkbox" ${this.formData.notifyPaymentReceived ? 'checked' : ''} onchange="OnboardingManager.formData.notifyPaymentReceived = this.checked">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="preference-toggle-item">
              <div class="pref-info">
                <div class="pref-title">🛏️ Vacancy Notifications</div>
                <div class="pref-desc">Highlight empty rooms to help maintain high occupancy.</div>
              </div>
              <label class="toggle">
                <input type="checkbox" ${this.formData.notifyVacantBed ? 'checked' : ''} onchange="OnboardingManager.formData.notifyVacantBed = this.checked">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Summary Confirmation Card -->
          <div class="onboarding-summary-card">
            <div class="summary-card-header">
              <div style="font-size:24px;">🏢</div>
              <div>
                <div class="summary-pg-name">${this.escapeHtml(this.formData.pgName || 'Your PG')}</div>
                <div class="summary-pg-sub">${this.escapeHtml(this.formData.pgType)} · ${this.escapeHtml(this.formData.city || 'Location')}</div>
              </div>
            </div>

            <div class="summary-row">
              <span class="summary-label">Owner / Admin:</span>
              <span class="summary-val">${this.escapeHtml(this.formData.ownerName || 'Property Admin')} (${this.escapeHtml(this.formData.phone || 'No phone')})</span>
            </div>

            <div class="summary-row">
              <span class="summary-label">Address:</span>
              <span class="summary-val">${this.escapeHtml([this.formData.locality, this.formData.city, this.formData.state, this.formData.pinCode].filter(Boolean).join(', '))}</span>
            </div>

            <div class="summary-row">
              <span class="summary-label">Payment UPI ID:</span>
              <span class="summary-val">${this.formData.upiId ? `<strong>${this.escapeHtml(this.formData.upiId)}</strong>` : '<span style="color:#f59e0b">Not set (can add later)</span>'}</span>
            </div>

            <div class="summary-row">
              <span class="summary-label">Rent Baseline:</span>
              <span class="summary-val">${this.formData.currency}${Number(this.formData.defaultRent).toLocaleString('en-IN')}/mo (Due Day ${this.formData.rentDueDate})</span>
            </div>

            <div class="summary-row">
              <span class="summary-label">Amenities (${this.formData.facilities.length}):</span>
              <span class="summary-val">${this.formData.facilities.join(', ') || 'Standard accommodation'}</span>
            </div>
          </div>
        </div>
      `;
    },

    // ── NAVIGATION & VALIDATION ─────────────────────────────
    nextStep() {
      if (this.currentStep === 1) {
        // Collect Step 1 inputs
        const pgName = (document.getElementById('ob-pg-name')?.value || '').trim();
        const locality = (document.getElementById('ob-locality')?.value || '').trim();
        const city = (document.getElementById('ob-city')?.value || '').trim();
        const state = (document.getElementById('ob-state')?.value || '').trim();
        const pin = (document.getElementById('ob-pincode')?.value || '').trim();
        const owner = (document.getElementById('ob-owner-name')?.value || '').trim();
        const phone = (document.getElementById('ob-phone')?.value || '').trim();
        const bldgs = parseInt(document.getElementById('ob-buildings')?.value) || 1;
        const capacity = parseInt(document.getElementById('ob-capacity')?.value) || 10;

        if (!pgName) {
          if (typeof showToast === 'function') showToast('Please enter your PG Name', 'error');
          document.getElementById('ob-pg-name')?.focus();
          return;
        }

        if (!locality || !city || !state || !pin) {
          if (typeof showToast === 'function') showToast('Please complete all address fields (Locality, City, State, PIN)', 'error');
          return;
        }

        this.formData.pgName = pgName;
        this.formData.locality = locality;
        this.formData.city = city;
        this.formData.state = state;
        this.formData.pinCode = pin;
        this.formData.fullAddress = `${locality}, ${city}, ${state} - ${pin}`;
        this.formData.ownerName = owner;
        this.formData.phone = phone;
        this.formData.buildingsCount = bldgs;
        this.formData.totalCapacity = capacity;

        this.currentStep = 2;
        this.renderStep();
        return;
      }

      if (this.currentStep === 2) {
        // Collect Step 2 inputs
        const upi = (document.getElementById('ob-upi-id')?.value || '').trim();
        if (upi) {
          const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
          if (!upiRegex.test(upi)) {
            if (typeof showToast === 'function') showToast('Please enter a valid Bank UPI ID format (e.g. name@bank)', 'error');
            return;
          }
        }
        this.formData.upiId = upi;

        this.currentStep = 3;
        this.renderStep();
        return;
      }

      if (this.currentStep === 3) {
        // Collect Step 3 inputs
        this.formData.defaultRent = Number(document.getElementById('ob-rent')?.value) || 5000;
        this.formData.securityDeposit = Number(document.getElementById('ob-deposit')?.value) || 5000;
        this.formData.rentDueDate = parseInt(document.getElementById('ob-due-date')?.value) || 5;
        this.formData.lateFeeAmount = Number(document.getElementById('ob-latefee-amount')?.value) || 50;
        this.formData.lateFeeGraceDays = parseInt(document.getElementById('ob-latefee-grace')?.value) || 3;

        this.currentStep = 4;
        this.renderStep();
        return;
      }

      if (this.currentStep === 4) {
        // Final finish
        this.finishOnboarding();
      }
    },

    prevStep() {
      if (this.currentStep > 1) {
        this.currentStep--;
        this.renderStep();
      }
    },

    skipOptional() {
      if (this.currentStep < this.totalSteps) {
        this.currentStep++;
        this.renderStep();
      }
    },

    // ── SAVE AND FINISH ONBOARDING ──────────────────────────
    async finishOnboarding() {
      const finishBtn = document.getElementById('btn-onboarding-next');
      if (finishBtn) {
        finishBtn.disabled = true;
        finishBtn.innerHTML = '⏳ Personalizing Rentora Workspace...';
      }

      try {
        // 1. Update local DB property object
        const prop = DB.getProperty() || {};
        prop.name = this.formData.pgName;
        prop.pgType = this.formData.pgType;
        prop.owner = this.formData.ownerName || prop.owner || 'Owner';
        prop.phone = this.formData.phone || prop.phone || '';
        prop.address = this.formData.fullAddress || prop.address;
        prop.locality = this.formData.locality;
        prop.city = this.formData.city;
        prop.state = this.formData.state;
        prop.pinCode = this.formData.pinCode;
        prop.buildingsCount = this.formData.buildingsCount;
        prop.totalCapacity = this.formData.totalCapacity;
        prop.currency = this.formData.currency || '₹';
        prop.defaultBedPrice = this.formData.defaultRent;
        prop.securityDeposit = this.formData.securityDeposit;
        prop.rentDueDate = this.formData.rentDueDate;
        prop.lateFeeEnabled = this.formData.lateFeeEnabled;
        prop.lateFeeAmount = this.formData.lateFeeAmount;
        prop.lateFeeGraceDays = this.formData.lateFeeGraceDays;
        prop.facilities = this.formData.facilities;
        prop.preferredLanguage = this.formData.language;
        prop.onboardingCompleted = true;
        prop.onboardedAt = new Date().toISOString();

        // Configure UPI
        if (this.formData.upiId) {
          prop.upiId = this.formData.upiId;
          prop.bankId = this.formData.upiId;
          prop.bankIdUploaded = true;
          prop.bankIdManuallySaved = true;
          prop.upiQrType = this.formData.upiQrType;

          // Generate offline vector QR code
          const cleanProp = encodeURIComponent(prop.name);
          const upiPayload = `upi://pay?pa=${encodeURIComponent(prop.upiId)}&pn=${cleanProp}&cu=INR&tn=PG+Rent+Payment`;
          if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
            try { prop.qrCodeDataUrl = QRCode.toDataURL(upiPayload, 300, 8); } catch (e) {}
          }
          if (!prop.qrCodeDataUrl) {
            prop.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(upiPayload)}&size=300x300&margin=8`;
          }
        }

        DB.saveProperty(prop);

        // 2. Update WhatsApp config
        const waCfg = DB.getWAConfig();
        waCfg.enabled = this.formData.whatsappRemindersEnabled;
        waCfg.reminderDay = this.formData.rentDueDate;
        waCfg.template = `Dear {name},\n\nThis is a friendly reminder that your rent of {currency}{amount} for {month} at {property} is due on day ${this.formData.rentDueDate}.\n\nKindly pay at the earliest.\n\nThank you,\n{owner}\n{property}`;
        DB.saveWAConfig(waCfg);

        // 3. Set persistent local storage flag
        localStorage.setItem('rentora_onboarding_completed', 'true');

        // 4. Synchronize with Supabase Cloud
        const user = window.AuthManager ? window.AuthManager.getUser() : null;
        if (user && window.CloudDB && typeof window.CloudDB.syncKeyToCloud === 'function') {
          await window.CloudDB.syncKeyToCloud(DB.KEYS.PROPERTY, prop, user.id);
          await window.CloudDB.syncKeyToCloud(DB.KEYS.WA_CONFIG, waCfg, user.id);
        }

        // 5. If this is a fresh PG with 0 floors, optionally create Floor 1 with 2 default rooms
        const currentFloors = DB.getFloors();
        if (!currentFloors || currentFloors.length === 0) {
          const defaultFloorId = 'fl_' + Date.now();
          DB.addFloor({ id: defaultFloorId, name: 'Ground Floor', order: 0 });
          
          const r1 = 'rm_' + Date.now() + '_1';
          const r2 = 'rm_' + Date.now() + '_2';
          DB.addRoom({ id: r1, floorId: defaultFloorId, name: 'Room 101', capacity: 2 });
          DB.addRoom({ id: r2, floorId: defaultFloorId, name: 'Room 102', capacity: 2 });
          
          DB.addBed({ id: 'bed_' + Date.now() + '_1', roomId: r1, number: '1', price: this.formData.defaultRent, tenantId: null });
          DB.addBed({ id: 'bed_' + Date.now() + '_2', roomId: r1, number: '2', price: this.formData.defaultRent, tenantId: null });
          DB.addBed({ id: 'bed_' + Date.now() + '_3', roomId: r2, number: '1', price: this.formData.defaultRent, tenantId: null });
          DB.addBed({ id: 'bed_' + Date.now() + '_4', roomId: r2, number: '2', price: this.formData.defaultRent, tenantId: null });

          if (user && window.CloudDB && typeof window.CloudDB.pushLocalDataToCloud === 'function') {
            await window.CloudDB.pushLocalDataToCloud(user.id);
          }
        }

        // 6. Dismiss onboarding overlay with celebration
        const overlay = document.getElementById('rentora-onboarding-overlay');
        if (overlay) {
          overlay.style.transition = 'all 0.4s ease';
          overlay.style.opacity = '0';
          overlay.style.transform = 'scale(0.98)';
          setTimeout(() => overlay.remove(), 400);
        }

        try { if (typeof SoundFX !== 'undefined' && SoundFX.appUnlock) SoundFX.appUnlock(); } catch (e) {}

        if (typeof showToast === 'function') {
          showToast(`🎉 Welcome to Rentora! ${prop.name} is now ready to manage.`, 'success');
        }

        // 7. Update UI headers & dashboard with personalized PG details
        if (window.App) {
          window.App.syncGlobalBranding();
          window.App.navigate('dashboard');
        }

      } catch (err) {
        console.error('[Onboarding] Error saving onboarding data:', err);
        if (typeof showToast === 'function') {
          showToast('Completed with local save. Workspace ready!', 'info');
        }
        const overlay = document.getElementById('rentora-onboarding-overlay');
        if (overlay) overlay.remove();
        if (window.App) {
          window.App.syncGlobalBranding();
          window.App.navigate('dashboard');
        }
      }
    },

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  window.OnboardingManager = OnboardingManager;

})(window);
