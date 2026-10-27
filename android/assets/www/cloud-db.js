// ============================================================
// ANGEL'S PG MANAGEMENT — CLOUD DATABASE SYNCHRONIZATION
// Synchronizes local DB models with Supabase Cloud Postgres tables
// Row-Level Security (RLS) enabled: data isolated per authenticated user
// Two-way instant cross-device synchronization with Realtime subscriptions
// ============================================================

(function(window) {
  'use strict';

  const CloudDB = {
    isSyncing: false,
    isPushing: false,
    lastSyncTime: null,
    syncStatus: 'idle', // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
    _hooksInstalled: false,
    _realtimeChannel: null,
    _debounceTimers: {},

    getClient() {
      return window.supabaseClient || (window.AuthManager && window.AuthManager.client);
    },

    getUser() {
      return window.AuthManager ? window.AuthManager.getUser() : null;
    },

    isCloudEnabled() {
      return !!(this.getClient() && this.getUser());
    },

    // ── STATUS BADGE UI UPDATER ──────────────────────────────
    updateSyncBadge(status, text) {
      this.syncStatus = status;
      const statusPills = document.querySelectorAll('.cloud-sync-badge, #cloud-sync-status, #sidebar-sync-badge, #drawer-sync-badge');
      statusPills.forEach(el => {
        el.className = 'cloud-sync-badge sync-' + status;
        const iconSpan = el.querySelector('.sync-icon');
        const textSpan = el.querySelector('.sync-text');
        
        let icon = '☁️';
        let label = text || 'Cloud Synced';

        if (status === 'syncing') {
          icon = '🔄';
          label = text || 'Syncing...';
        } else if (status === 'synced') {
          icon = '☁️';
          label = text || 'Cloud Synced';
        } else if (status === 'error') {
          icon = '⚠️';
          label = text || 'Sync Warning';
        } else if (status === 'offline') {
          icon = '⚡';
          label = text || 'Local Cache';
        }

        if (iconSpan) {
          iconSpan.textContent = icon;
          if (textSpan) textSpan.textContent = label;
        } else {
          el.innerHTML = `<span class="sync-icon">${icon}</span> <span class="sync-text">${label}</span>`;
        }
      });
    },

    // ── CHECK IF CLOUD HAS DATA FOR THIS USER ─────────────────
    async checkHasCloudData(userId) {
      const client = this.getClient();
      if (!client || !userId) return false;
      try {
        // Check properties table
        const { data: props, error: propErr } = await client
          .from('properties')
          .select('id')
          .eq('user_id', userId)
          .limit(1);

        if (!propErr && props && props.length > 0) return true;

        // Check floors table
        const { count: floorCount, error: floorErr } = await client
          .from('floors')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (!floorErr && floorCount != null && floorCount > 0) return true;

        // Check rooms table
        const { count: roomCount, error: roomErr } = await client
          .from('rooms')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (!roomErr && roomCount != null && roomCount > 0) return true;

        // Check tenants table
        const { count: tenantCount, error: tenantErr } = await client
          .from('tenants')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (!tenantErr && tenantCount != null && tenantCount > 0) return true;

        // Check payments table
        const { count: paymentCount, error: payErr } = await client
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (!payErr && paymentCount != null && paymentCount > 0) return true;

        return false;
      } catch (e) {
        console.warn('[CloudDB] checkHasCloudData error:', e);
        return false;
      }
    },

    // ── CHECK IF DEVICE HAS LOCAL DATA ────────────────────────
    checkHasLocalData() {
      try {
        const floors = DB.getFloors();
        const rooms = DB.getRooms();
        const tenants = DB.getTenants();
        return (floors && floors.length > 0) || (rooms && rooms.length > 0) || (tenants && tenants.length > 0);
      } catch (e) {
        return false;
      }
    },

    // ── CALLED ON USER SIGNED IN OR RESTORED SESSION ──────────
    async onUserSignedIn(user) {
      if (!user || !user.id) return;
      console.log('[CloudDB] User authenticated. Initializing Cloud Sync for:', user.id, user.email);
      this.updateSyncBadge('syncing', 'Syncing Data...');

      // Install mutation hooks immediately so all local edits sync to cloud
      this.installMutationHooks();

      // Subscribe to Supabase Realtime channel for live cross-device updates
      this.setupRealtimeSubscription(user.id);

      try {
        // 1. Check if cloud has records for this user
        const hasCloud = await this.checkHasCloudData(user.id);
        const hasLocal = this.checkHasLocalData();

        console.log(`[CloudDB] Cloud has data: ${hasCloud}, Device has local data: ${hasLocal}`);

        if (hasCloud) {
          // Cloud has data: ALWAYS pull authoritative cloud data into local DB
          console.log('[CloudDB] Pulling authoritative data from Supabase Cloud...');
          localStorage.setItem('rentora_user_id', user.id);
          await this.pullAllData(user.id, false);
          this.updateSyncBadge('synced', 'Cloud Synced');
          if (typeof showToast === 'function') {
            showToast('☁️ Cloud data synchronized across devices', 'success');
          }
        } else {
          // Cloud is empty for this user.
          // CRITICAL MULTI-TENANT ISOLATION CHECK:
          // If local data belonged to a previous user or session, clear it immediately
          // so new PG owners do NOT inherit Angel PG or other owners' private records!
          const previousOwnerId = localStorage.getItem('rentora_user_id');
          if (previousOwnerId && previousOwnerId !== user.id) {
            console.log('[CloudDB] New owner detected. Purging previous cached records for isolation.');
            this.clearLocalData();
          }
          localStorage.setItem('rentora_user_id', user.id);

          const hasLocalClean = this.checkHasLocalData();
          if (hasLocalClean && previousOwnerId === user.id) {
            console.log('[CloudDB] Backing up local PG data to cloud...');
            await this.pushLocalDataToCloud(user.id);
            this.updateSyncBadge('synced', 'Cloud Synced');
          } else {
            console.log('[CloudDB] Fresh account. Awaiting owner onboarding...');
            this.updateSyncBadge('synced', 'Ready for Setup');
          }
        }
      } catch (err) {
        console.error('[CloudDB] onUserSignedIn sync failed:', err);
        this.updateSyncBadge('error', 'Sync Issue');
      }
    },

    clearLocalData() {
      try {
        localStorage.removeItem(DB.KEYS.PROPERTY);
        localStorage.removeItem(DB.KEYS.FLOORS);
        localStorage.removeItem(DB.KEYS.ROOMS);
        localStorage.removeItem(DB.KEYS.BEDS);
        localStorage.removeItem(DB.KEYS.TENANTS);
        localStorage.removeItem(DB.KEYS.PAYMENTS);
        localStorage.removeItem(DB.KEYS.EXPENSES);
        localStorage.removeItem(DB.KEYS.OTHER_INCOME);
        localStorage.removeItem(DB.KEYS.AGREEMENTS);
        localStorage.removeItem('rentora_onboarding_completed');
      } catch (e) {}
    },

    onUserSignedOut() {
      this.updateSyncBadge('offline', 'Signed Out');
      if (this._realtimeChannel) {
        try {
          const client = this.getClient();
          if (client) client.removeChannel(this._realtimeChannel);
        } catch (e) {}
        this._realtimeChannel = null;
      }
      // Clear local storage for all PG entities to prevent data bleed between accounts
      this.clearLocalData();
      try {
        localStorage.removeItem('rentora_user_id');
      } catch (e) {}
    },

    // ── SUPABASE REALTIME SUBSCRIPTION (LIVE MULTI-DEVICE SYNC) ──
    setupRealtimeSubscription(userId) {
      const client = this.getClient();
      if (!client || !userId) return;

      if (this._realtimeChannel) {
        try { client.removeChannel(this._realtimeChannel); } catch (e) {}
        this._realtimeChannel = null;
      }

      try {
        this._realtimeChannel = client.channel('realtime_pg_' + userId)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', filter: `user_id=eq.${userId}` },
            (payload) => {
              console.log('[CloudDB Realtime] Remote database change detected:', payload.table, payload.eventType);
              if (this.isPushing) return; // Ignore echoes from our own active push
              this.debounceRemotePull(userId);
            }
          )
          .subscribe((status) => {
            console.log('[CloudDB Realtime] Channel status:', status);
          });
      } catch (err) {
        console.warn('[CloudDB Realtime] Subscription error:', err);
      }
    },

    debounceRemotePull(userId) {
      if (this._debounceTimers.realtime) clearTimeout(this._debounceTimers.realtime);
      this._debounceTimers.realtime = setTimeout(() => {
        this.pullAllData(userId, false);
      }, 800);
    },

    // ── PULL ALL DATA FROM SUPABASE CLOUD ─────────────────────
    async pullAllData(userId, showToastNotification = false) {
      const client = this.getClient();
      if (!client || !userId) return;

      this.isSyncing = true;
      this.updateSyncBadge('syncing', 'Syncing Data...');
      console.log('[CloudDB] Pulling all tables from cloud for user:', userId);

      try {
        // 1. Property
        const { data: propData } = await client.from('properties').select('*').eq('user_id', userId).limit(1);
        if (propData && propData.length > 0) {
          const p = propData[0];
          const localProp = DB.getProperty() || {};
          localProp.id = p.id || localProp.id;
          localProp.name = p.name || localProp.name;
          localProp.owner = p.owner || localProp.owner;
          localProp.phone = p.phone || localProp.phone;
          localProp.address = p.address || localProp.address;
          localProp.currency = p.currency || localProp.currency || '₹';
          localProp.defaultBedPrice = p.default_bed_price != null ? Number(p.default_bed_price) : localProp.defaultBedPrice;
          localProp.defaultCapacity = p.default_capacity != null ? Number(p.default_capacity) : localProp.defaultCapacity;
          localProp.electricityRate = p.electricity_rate != null ? Number(p.electricity_rate) : localProp.electricityRate;
          if (p.logo) localProp.logo = p.logo;
          localProp.logoUploaded = p.logo_uploaded != null ? p.logo_uploaded : localProp.logoUploaded;
          
          // SaaS Fields
          if (p.pg_type) localProp.pgType = p.pg_type;
          if (p.locality) localProp.locality = p.locality;
          if (p.city) localProp.city = p.city;
          if (p.state) localProp.state = p.state;
          if (p.pin_code) localProp.pinCode = p.pin_code;
          if (p.buildings_count) localProp.buildingsCount = p.buildings_count;
          if (p.total_capacity) localProp.totalCapacity = p.total_capacity;
          if (p.security_deposit != null) localProp.securityDeposit = Number(p.security_deposit);
          if (p.rent_due_date != null) localProp.rentDueDate = Number(p.rent_due_date);
          if (p.late_fee_enabled != null) localProp.lateFeeEnabled = p.late_fee_enabled;
          if (p.late_fee_amount != null) localProp.lateFeeAmount = Number(p.late_fee_amount);
          if (p.late_fee_grace_days != null) localProp.lateFeeGraceDays = Number(p.late_fee_grace_days);
          if (p.facilities) localProp.facilities = p.facilities;
          if (p.upi_id) { localProp.upiId = p.upi_id; localProp.bankId = p.upi_id; }
          if (p.upi_qr_type) localProp.upiQrType = p.upi_qr_type;
          if (p.onboarding_completed != null) {
            localProp.onboardingCompleted = p.onboarding_completed;
            if (p.onboarding_completed) localStorage.setItem('rentora_onboarding_completed', 'true');
          }
          DB._set(DB.KEYS.PROPERTY, localProp);
        }

        // 2. Floors
        const { data: floorsData } = await client.from('floors').select('*').eq('user_id', userId).order('order', { ascending: true });
        if (floorsData) {
          const floors = floorsData.map(f => ({ id: f.id, name: f.name, order: f.order }));
          DB._set(DB.KEYS.FLOORS, floors);
        }

        // 3. Rooms
        const { data: roomsData } = await client.from('rooms').select('*').eq('user_id', userId);
        if (roomsData) {
          const rooms = roomsData.map(r => ({ id: r.id, floorId: r.floor_id, name: r.name, capacity: r.capacity }));
          DB._set(DB.KEYS.ROOMS, rooms);
        }

        // 4. Beds
        const { data: bedsData } = await client.from('beds').select('*').eq('user_id', userId);
        if (bedsData) {
          const beds = bedsData.map(b => ({
            id: b.id,
            roomId: b.room_id,
            number: b.number,
            price: Number(b.price || 0),
            tenantId: b.tenant_id || null
          }));
          DB._set(DB.KEYS.BEDS, beds);
        }

        // 5. Tenants
        const { data: tenantsData } = await client.from('tenants').select('*').eq('user_id', userId);
        if (tenantsData) {
          const tenants = tenantsData.map(t => ({
            id: t.id,
            name: t.name,
            phone: t.phone || '',
            email: t.email || '',
            roomId: t.room_id || '',
            bedId: t.bed_id || '',
            rent: Number(t.rent || 0),
            deposit: Number(t.deposit || 0),
            joiningDate: t.joining_date,
            aadhaarVerified: !!t.aadhaar_verified,
            docs: Array.isArray(t.docs) ? t.docs : [],
            active: true
          }));
          DB._set(DB.KEYS.TENANTS, tenants);
        }

        // 6. Payments
        const { data: paymentsData } = await client.from('payments').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (paymentsData) {
          const payments = paymentsData.map(p => ({
            id: p.id,
            tenantId: p.tenant_id,
            amount: Number(p.amount || 0),
            mode: p.mode || 'Cash',
            month: p.month || '',
            date: p.paid_date || p.created_at,
            status: p.status || 'Paid'
          }));
          DB._set(DB.KEYS.PAYMENTS, payments);
        }

        // 7. Expenses
        const { data: expensesData } = await client.from('expenses').select('*').eq('user_id', userId).order('date', { ascending: false });
        if (expensesData) {
          const expenses = expensesData.map(e => ({
            id: e.id,
            amount: Number(e.amount || 0),
            category: e.category || 'General',
            title: e.description || e.category || 'Expense',
            date: e.date,
            month: e.date ? e.date.slice(0, 7) : ''
          }));
          DB._set(DB.KEYS.EXPENSES, expenses);
        }

        // 8. Other Income
        const { data: incomeData } = await client.from('other_income').select('*').eq('user_id', userId).order('date', { ascending: false });
        if (incomeData) {
          const otherIncome = {};
          incomeData.forEach(i => {
            const m = i.date ? i.date.slice(0, 7) : (typeof getCurrentMonth === 'function' ? getCurrentMonth() : '');
            if (m) otherIncome[m] = (otherIncome[m] || 0) + Number(i.amount || 0);
          });
          DB._set(DB.KEYS.OTHER_INCOME, otherIncome);
        }

        // 9. Agreements
        const { data: agreementsData } = await client.from('agreements').select('*').eq('user_id', userId);
        if (agreementsData) {
          const agreements = agreementsData.map(a => a.agreement_data || { id: a.id, tenantId: a.tenant_id });
          DB._set(DB.KEYS.AGREEMENTS, agreements);
        }

        // 10. User Settings
        const { data: settingsData } = await client.from('user_settings').select('*').eq('user_id', userId).limit(1);
        if (settingsData && settingsData.length > 0) {
          const s = settingsData[0];
          if (s.dark_mode != null) DB.setDarkMode(s.dark_mode);
          if (s.wa_config) DB.saveWAConfig(s.wa_config);
          if (s.owner_signature) DB.saveOwnerSignature(s.owner_signature);
          if (s.business_card) DB.saveBusinessCardCustom(s.business_card);
          if (s.gemini_key) DB.saveGeminiKey(s.gemini_key);
          if (s.agreement_policy) DB.saveAgreementPolicy(s.agreement_policy);

          // Restore UPI/bank info if saved inside settings
          if (s.business_card && s.business_card.bank_info) {
            const b = s.business_card.bank_info;
            const prop = DB.getProperty() || {};
            if (b.upi_id) prop.upiId = b.upi_id;
            if (b.bank_id) prop.bankId = b.bank_id;
            if (b.qr_code) prop.qrCodeDataUrl = b.qr_code;
            DB.saveProperty(prop);
          }
        }

        this.lastSyncTime = new Date();
        this.updateSyncBadge('synced', 'Cloud Synced');

        // Refresh all application views with the fresh cloud data
        this.refreshActiveViews();

        if (showToastNotification && typeof showToast === 'function') {
          showToast('☁️ Cloud data synchronized', 'success');
        }

      } catch (err) {
        console.error('[CloudDB] pullAllData error:', err);
        this.updateSyncBadge('error', 'Pull Failed');
      } finally {
        this.isSyncing = false;
      }
    },

    // Refresh all rendered active views
    refreshActiveViews() {
      try {
        if (window.App && typeof window.App.syncGlobalBranding === 'function') {
          window.App.syncGlobalBranding();
        }
        if (typeof renderActiveTab === 'function') {
          renderActiveTab();
        } else {
          if (window.Dashboard && typeof window.Dashboard.render === 'function') window.Dashboard.render();
          if (window.Rooms && typeof window.Rooms.render === 'function') window.Rooms.render();
          if (window.Tenants && typeof window.Tenants.render === 'function') window.Tenants.render();
          if (window.Rent && typeof window.Rent.render === 'function') window.Rent.render();
          if (window.Expenses && typeof window.Expenses.render === 'function') window.Expenses.render();
          if (window.Settings && typeof window.Settings.render === 'function') window.Settings.render();
        }
      } catch (e) {
        console.warn('[CloudDB] View refresh error:', e);
      }
    },

    // ── PUSH ALL LOCAL DATA TO SUPABASE CLOUD ─────────────────
    async pushLocalDataToCloud(userId) {
      const client = this.getClient();
      if (!client || !userId) return;

      this.isPushing = true;
      this.updateSyncBadge('syncing', 'Saving to Cloud...');
      console.log('[CloudDB] Pushing all local data to cloud for user:', userId);

      try {
        // 1. Property
        const prop = DB.getProperty() || {};
        const propPayload = {
          id: prop.id || 'prop_' + userId.slice(0, 8),
          user_id: userId,
          name: prop.name || 'My PG Property',
          owner: prop.owner || '',
          phone: prop.phone || '',
          address: prop.address || '',
          currency: prop.currency || '₹',
          default_bed_price: prop.defaultBedPrice || 5000,
          default_capacity: prop.defaultCapacity || 2,
          electricity_rate: prop.electricityRate || 8,
          logo: prop.logo || '',
          logo_uploaded: !!prop.logoUploaded,
          updated_at: new Date().toISOString()
        };
        if (prop.pgType) propPayload.pg_type = prop.pgType;
        if (prop.locality) propPayload.locality = prop.locality;
        if (prop.city) propPayload.city = prop.city;
        if (prop.state) propPayload.state = prop.state;
        if (prop.pinCode) propPayload.pin_code = prop.pinCode;
        if (prop.buildingsCount) propPayload.buildings_count = prop.buildingsCount;
        if (prop.totalCapacity) propPayload.total_capacity = prop.totalCapacity;
        if (prop.securityDeposit != null) propPayload.security_deposit = prop.securityDeposit;
        if (prop.rentDueDate != null) propPayload.rent_due_date = prop.rentDueDate;
        if (prop.lateFeeEnabled != null) propPayload.late_fee_enabled = prop.lateFeeEnabled;
        if (prop.lateFeeAmount != null) propPayload.late_fee_amount = prop.lateFeeAmount;
        if (prop.lateFeeGraceDays != null) propPayload.late_fee_grace_days = prop.lateFeeGraceDays;
        if (prop.facilities) propPayload.facilities = prop.facilities;
        if (prop.upiId) propPayload.upi_id = prop.upiId;
        if (prop.upiQrType) propPayload.upi_qr_type = prop.upiQrType;
        if (prop.onboardingCompleted != null) propPayload.onboarding_completed = prop.onboardingCompleted;

        try {
          await client.from('properties').upsert(propPayload);
        } catch (pErr) {
          console.warn('[CloudDB] Extended property upsert fallback:', pErr);
          await client.from('properties').upsert({
            id: prop.id || 'prop_' + userId.slice(0, 8),
            user_id: userId,
            name: prop.name || 'My PG Property',
            owner: prop.owner || '',
            phone: prop.phone || '',
            address: prop.address || '',
            currency: prop.currency || '₹',
            default_bed_price: prop.defaultBedPrice || 5000,
            default_capacity: prop.defaultCapacity || 2,
            electricity_rate: prop.electricityRate || 8,
            logo: prop.logo || '',
            logo_uploaded: !!prop.logoUploaded,
            updated_at: new Date().toISOString()
          });
        }

        // 2. Floors
        const floors = DB.getFloors() || [];
        if (floors.length > 0) {
          const payload = floors.map((f, idx) => ({
            id: f.id,
            user_id: userId,
            name: f.name,
            order: f.order != null ? f.order : idx
          }));
          await client.from('floors').upsert(payload);
        }

        // 3. Rooms
        const rooms = DB.getRooms() || [];
        if (rooms.length > 0) {
          const payload = rooms.map(r => ({
            id: r.id,
            user_id: userId,
            floor_id: r.floorId || '',
            name: r.name,
            capacity: r.capacity || 2
          }));
          await client.from('rooms').upsert(payload);
        }

        // 4. Beds
        const beds = DB.getBeds() || [];
        if (beds.length > 0) {
          const payload = beds.map(b => ({
            id: b.id,
            user_id: userId,
            room_id: b.roomId,
            number: b.number,
            price: b.price || 5000,
            tenant_id: b.tenantId || null
          }));
          await client.from('beds').upsert(payload);
        }

        // 5. Tenants
        const tenants = (DB.getTenants() || []).filter(t => t.active !== false);
        if (tenants.length > 0) {
          const payload = tenants.map(t => ({
            id: t.id,
            user_id: userId,
            name: t.name,
            phone: t.phone || '',
            email: t.email || '',
            room_id: t.roomId || t.room || '',
            bed_id: t.bedId || t.bed || '',
            rent: t.rent || 0,
            deposit: t.deposit || 0,
            joining_date: t.joiningDate || new Date().toISOString().split('T')[0],
            aadhaar_verified: !!t.aadhaarVerified,
            docs: Array.isArray(t.docs) ? t.docs : []
          }));
          await client.from('tenants').upsert(payload);
        }

        // 6. Payments
        const payments = DB.getPayments() || [];
        if (payments.length > 0) {
          const payload = payments.map(p => ({
            id: p.id,
            user_id: userId,
            tenant_id: p.tenantId,
            amount: p.amount || 0,
            mode: p.mode || 'Cash',
            month: p.month || '',
            paid_date: p.date || new Date().toISOString().split('T')[0],
            status: p.status || 'Paid'
          }));
          await client.from('payments').upsert(payload);
        }

        // 7. Expenses
        const expenses = DB.getExpenses() || [];
        if (expenses.length > 0) {
          const payload = expenses.map(e => ({
            id: e.id,
            user_id: userId,
            amount: e.amount || 0,
            category: e.category || 'General',
            description: e.title || e.category || 'Expense',
            date: e.date || new Date().toISOString().split('T')[0]
          }));
          await client.from('expenses').upsert(payload);
        }

        // 8. Other Income
        const otherIncomeObj = DB.getAllOtherIncome() || {};
        const otherIncomeEntries = Object.entries(otherIncomeObj);
        if (otherIncomeEntries.length > 0) {
          const payload = otherIncomeEntries.map(([month, amount]) => ({
            id: 'inc_' + month.replace('-', '_'),
            user_id: userId,
            amount: Number(amount || 0),
            category: 'Other',
            description: 'Other Income ' + month,
            date: month + '-01'
          }));
          await client.from('other_income').upsert(payload);
        }

        // 9. Agreements
        const agreements = DB.getAgreements() || [];
        if (agreements.length > 0) {
          const payload = agreements.map(a => ({
            id: a.id,
            user_id: userId,
            tenant_id: a.tenantId || a.tenant_id || '',
            agreement_data: a
          }));
          await client.from('agreements').upsert(payload);
        }

        // 10. User Settings
        const businessCard = DB.getBusinessCardCustom() || {};
        businessCard.bank_info = {
          upi_id: prop.upiId || prop.bankId || '',
          bank_id: prop.bankId || prop.upiId || '',
          qr_code: prop.qrCodeDataUrl || ''
        };

        await client.from('user_settings').upsert({
          user_id: userId,
          dark_mode: !!DB.getDarkMode(),
          wa_config: DB.getWAConfig() || {},
          owner_signature: DB.getOwnerSignature() || '',
          business_card: businessCard,
          gemini_key: DB.getGeminiKey() || '',
          agreement_policy: DB.getAgreementPolicy() || '',
          updated_at: new Date().toISOString()
        });

        this.lastSyncTime = new Date();
        this.updateSyncBadge('synced', 'Cloud Synced');

      } catch (err) {
        console.error('[CloudDB] pushLocalDataToCloud error:', err);
        this.updateSyncBadge('error', 'Push Failed');
        throw err;
      } finally {
        this.isPushing = false;
      }
    },

    // ── MUTATION HOOKS (AUTOMATIC TWO-WAY CLOUD PERSISTENCE) ────
    installMutationHooks() {
      if (this._hooksInstalled) return;
      this._hooksInstalled = true;

      const self = this;

      // 1. Intercept DB._set to capture ALL data mutations universally
      const origSet = DB._set.bind(DB);
      DB._set = function(key, val) {
        origSet(key, val);
        // If sync is actively running, don't trigger push loops
        if (self.isSyncing || !self.isCloudEnabled()) return;

        const user = self.getUser();
        if (!user || !user.id) return;

        // Debounce cloud write per collection
        if (self._debounceTimers[key]) clearTimeout(self._debounceTimers[key]);
        self._debounceTimers[key] = setTimeout(() => {
          self.syncKeyToCloud(key, val, user.id);
        }, 300);
      };

      // 2. Explicit Delete Floor
      const origDeleteFloor = DB.deleteFloor ? DB.deleteFloor.bind(DB) : null;
      if (origDeleteFloor) {
        DB.deleteFloor = function(id) {
          origDeleteFloor(id);
          if (self.isCloudEnabled()) {
            const user = self.getUser();
            self.getClient().from('floors').delete().eq('id', id).eq('user_id', user.id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced'))
              .catch(e => console.warn(e));
          }
        };
      }

      // 3. Explicit Delete Room
      const origDeleteRoom = DB.deleteRoom ? DB.deleteRoom.bind(DB) : null;
      if (origDeleteRoom) {
        DB.deleteRoom = function(id) {
          origDeleteRoom(id);
          if (self.isCloudEnabled()) {
            const user = self.getUser();
            self.getClient().from('rooms').delete().eq('id', id).eq('user_id', user.id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced'))
              .catch(e => console.warn(e));
          }
        };
      }

      // 4. Explicit Delete Bed
      const origDeleteBed = DB.deleteBed ? DB.deleteBed.bind(DB) : null;
      if (origDeleteBed) {
        DB.deleteBed = function(id) {
          origDeleteBed(id);
          if (self.isCloudEnabled()) {
            const user = self.getUser();
            self.getClient().from('beds').delete().eq('id', id).eq('user_id', user.id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced'))
              .catch(e => console.warn(e));
          }
        };
      }

      // 5. Explicit Delete Tenant
      const origDeleteTenant = DB.deleteTenant ? DB.deleteTenant.bind(DB) : null;
      if (origDeleteTenant) {
        DB.deleteTenant = function(id) {
          origDeleteTenant(id);
          if (self.isCloudEnabled()) {
            const user = self.getUser();
            self.getClient().from('tenants').delete().eq('id', id).eq('user_id', user.id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced'))
              .catch(e => console.warn(e));
          }
        };
      }

      // 6. Explicit Delete Payment
      const origDeletePayment = DB.deletePayment ? DB.deletePayment.bind(DB) : null;
      if (origDeletePayment) {
        DB.deletePayment = function(id) {
          origDeletePayment(id);
          if (self.isCloudEnabled()) {
            const user = self.getUser();
            self.getClient().from('payments').delete().eq('id', id).eq('user_id', user.id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced'))
              .catch(e => console.warn(e));
          }
        };
      }

      // 7. Explicit Delete Expense
      const origDeleteExpense = DB.deleteExpense ? DB.deleteExpense.bind(DB) : null;
      if (origDeleteExpense) {
        DB.deleteExpense = function(id) {
          origDeleteExpense(id);
          if (self.isCloudEnabled()) {
            const user = self.getUser();
            self.getClient().from('expenses').delete().eq('id', id).eq('user_id', user.id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced'))
              .catch(e => console.warn(e));
          }
        };
      }

      // 8. Explicit Delete Other Income
      const origDeleteOtherIncome = DB.deleteOtherIncome ? DB.deleteOtherIncome.bind(DB) : null;
      if (origDeleteOtherIncome) {
        DB.deleteOtherIncome = function(id) {
          origDeleteOtherIncome(id);
          if (self.isCloudEnabled()) {
            const user = self.getUser();
            self.getClient().from('other_income').delete().eq('id', id).eq('user_id', user.id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced'))
              .catch(e => console.warn(e));
          }
        };
      }

      console.log('[CloudDB] Mutation hooks installed successfully.');
    },

    // ── SYNC SPECIFIC LOCAL KEY TO SUPABASE ────────────────────
    async syncKeyToCloud(key, val, userId) {
      const client = this.getClient();
      if (!client || !userId) return;

      this.isPushing = true;
      this.updateSyncBadge('syncing', 'Saving...');

      try {
        if (key === DB.KEYS.PROPERTY) {
          const prop = val || {};
          const propPayload = {
            id: prop.id || 'prop_' + userId.slice(0, 8),
            user_id: userId,
            name: prop.name || 'My PG Property',
            owner: prop.owner || '',
            phone: prop.phone || '',
            address: prop.address || '',
            currency: prop.currency || '₹',
            default_bed_price: prop.defaultBedPrice || 5000,
            default_capacity: prop.defaultCapacity || 2,
            electricity_rate: prop.electricityRate || 8,
            logo: prop.logo || '',
            logo_uploaded: !!prop.logoUploaded,
            updated_at: new Date().toISOString()
          };
          if (prop.pgType) propPayload.pg_type = prop.pgType;
          if (prop.locality) propPayload.locality = prop.locality;
          if (prop.city) propPayload.city = prop.city;
          if (prop.state) propPayload.state = prop.state;
          if (prop.pinCode) propPayload.pin_code = prop.pinCode;
          if (prop.buildingsCount) propPayload.buildings_count = prop.buildingsCount;
          if (prop.totalCapacity) propPayload.total_capacity = prop.totalCapacity;
          if (prop.securityDeposit != null) propPayload.security_deposit = prop.securityDeposit;
          if (prop.rentDueDate != null) propPayload.rent_due_date = prop.rentDueDate;
          if (prop.lateFeeEnabled != null) propPayload.late_fee_enabled = prop.lateFeeEnabled;
          if (prop.lateFeeAmount != null) propPayload.late_fee_amount = prop.lateFeeAmount;
          if (prop.lateFeeGraceDays != null) propPayload.late_fee_grace_days = prop.lateFeeGraceDays;
          if (prop.facilities) propPayload.facilities = prop.facilities;
          if (prop.upiId) propPayload.upi_id = prop.upiId;
          if (prop.upiQrType) propPayload.upi_qr_type = prop.upiQrType;
          if (prop.onboardingCompleted != null) propPayload.onboarding_completed = prop.onboardingCompleted;

          try {
            await client.from('properties').upsert(propPayload);
          } catch (pErr) {
            console.warn('[CloudDB] Extended property upsert fallback:', pErr);
            await client.from('properties').upsert({
              id: prop.id || 'prop_' + userId.slice(0, 8),
              user_id: userId,
              name: prop.name || 'My PG Property',
              owner: prop.owner || '',
              phone: prop.phone || '',
              address: prop.address || '',
              currency: prop.currency || '₹',
              default_bed_price: prop.defaultBedPrice || 5000,
              default_capacity: prop.defaultCapacity || 2,
              electricity_rate: prop.electricityRate || 8,
              logo: prop.logo || '',
              logo_uploaded: !!prop.logoUploaded,
              updated_at: new Date().toISOString()
            });
          }
        }
        else if (key === DB.KEYS.FLOORS) {
          const floors = Array.isArray(val) ? val : [];
          const currentIds = floors.map(f => f.id);
          if (floors.length > 0) {
            const payload = floors.map((f, idx) => ({
              id: f.id,
              user_id: userId,
              name: f.name,
              order: f.order != null ? f.order : idx
            }));
            await client.from('floors').upsert(payload);
          }
          // Delete removed floors
          if (currentIds.length > 0) {
            await client.from('floors').delete().eq('user_id', userId).not('id', 'in', `(${currentIds.map(id => `"${id}"`).join(',')})`);
          } else {
            await client.from('floors').delete().eq('user_id', userId);
          }
        }
        else if (key === DB.KEYS.ROOMS) {
          const rooms = Array.isArray(val) ? val : [];
          const currentIds = rooms.map(r => r.id);
          if (rooms.length > 0) {
            const payload = rooms.map(r => ({
              id: r.id,
              user_id: userId,
              floor_id: r.floorId || '',
              name: r.name,
              capacity: r.capacity || 2
            }));
            await client.from('rooms').upsert(payload);
          }
          // Delete removed rooms
          if (currentIds.length > 0) {
            await client.from('rooms').delete().eq('user_id', userId).not('id', 'in', `(${currentIds.map(id => `"${id}"`).join(',')})`);
          } else {
            await client.from('rooms').delete().eq('user_id', userId);
          }
        }
        else if (key === DB.KEYS.BEDS) {
          const beds = Array.isArray(val) ? val : [];
          const currentIds = beds.map(b => b.id);
          if (beds.length > 0) {
            const payload = beds.map(b => ({
              id: b.id,
              user_id: userId,
              room_id: b.roomId,
              number: b.number,
              price: b.price || 5000,
              tenant_id: b.tenantId || null
            }));
            await client.from('beds').upsert(payload);
          }
          // Delete removed beds
          if (currentIds.length > 0) {
            await client.from('beds').delete().eq('user_id', userId).not('id', 'in', `(${currentIds.map(id => `"${id}"`).join(',')})`);
          } else {
            await client.from('beds').delete().eq('user_id', userId);
          }
        }
        else if (key === DB.KEYS.TENANTS) {
          const allTenants = Array.isArray(val) ? val : [];
          const activeTenants = allTenants.filter(t => t.active !== false);
          const activeIds = activeTenants.map(t => t.id);
          if (activeTenants.length > 0) {
            const payload = activeTenants.map(t => ({
              id: t.id,
              user_id: userId,
              name: t.name,
              phone: t.phone || '',
              email: t.email || '',
              room_id: t.roomId || t.room || '',
              bed_id: t.bedId || t.bed || '',
              rent: t.rent || 0,
              deposit: t.deposit || 0,
              joining_date: t.joiningDate || new Date().toISOString().split('T')[0],
              aadhaar_verified: !!t.aadhaarVerified,
              docs: Array.isArray(t.docs) ? t.docs : []
            }));
            await client.from('tenants').upsert(payload);
          }
          // Delete removed or inactive tenants from Supabase
          if (activeIds.length > 0) {
            await client.from('tenants').delete().eq('user_id', userId).not('id', 'in', `(${activeIds.map(id => `"${id}"`).join(',')})`);
          } else {
            await client.from('tenants').delete().eq('user_id', userId);
          }
        }
        else if (key === DB.KEYS.PAYMENTS) {
          const payments = Array.isArray(val) ? val : [];
          const currentIds = payments.map(p => p.id);
          if (payments.length > 0) {
            const payload = payments.map(p => ({
              id: p.id,
              user_id: userId,
              tenant_id: p.tenantId,
              amount: p.amount || 0,
              mode: p.mode || 'Cash',
              month: p.month || '',
              paid_date: p.date || new Date().toISOString().split('T')[0],
              status: p.status || 'Paid'
            }));
            await client.from('payments').upsert(payload);
          }
          if (currentIds.length > 0) {
            await client.from('payments').delete().eq('user_id', userId).not('id', 'in', `(${currentIds.map(id => `"${id}"`).join(',')})`);
          } else {
            await client.from('payments').delete().eq('user_id', userId);
          }
        }
        else if (key === DB.KEYS.EXPENSES) {
          const expenses = Array.isArray(val) ? val : [];
          const currentIds = expenses.map(e => e.id);
          if (expenses.length > 0) {
            const payload = expenses.map(e => ({
              id: e.id,
              user_id: userId,
              amount: e.amount || 0,
              category: e.category || 'General',
              description: e.title || e.category || 'Expense',
              date: e.date || new Date().toISOString().split('T')[0]
            }));
            await client.from('expenses').upsert(payload);
          }
          if (currentIds.length > 0) {
            await client.from('expenses').delete().eq('user_id', userId).not('id', 'in', `(${currentIds.map(id => `"${id}"`).join(',')})`);
          } else {
            await client.from('expenses').delete().eq('user_id', userId);
          }
        }
        else if (key === DB.KEYS.OTHER_INCOME) {
          const otherIncomeObj = (val && typeof val === 'object') ? val : {};
          const otherIncomeEntries = Object.entries(otherIncomeObj);
          if (otherIncomeEntries.length > 0) {
            const payload = otherIncomeEntries.map(([month, amount]) => ({
              id: 'inc_' + month.replace('-', '_'),
              user_id: userId,
              amount: Number(amount || 0),
              category: 'Other',
              description: 'Other Income ' + month,
              date: month + '-01'
            }));
            await client.from('other_income').upsert(payload);
          }
        }
        else if (key === DB.KEYS.AGREEMENTS) {
          const agreements = Array.isArray(val) ? val : [];
          if (agreements.length > 0) {
            const payload = agreements.map(a => ({
              id: a.id,
              user_id: userId,
              tenant_id: a.tenantId || a.tenant_id || '',
              agreement_data: a
            }));
            await client.from('agreements').upsert(payload);
          }
        }
        else if (key === DB.KEYS.DARK_MODE || key === DB.KEYS.WA_CONFIG || key === DB.KEYS.OWNER_SIGNATURE ||
                 key === DB.KEYS.BUSINESS_CARD || key === DB.KEYS.GEMINI_KEY || key === DB.KEYS.AGREEMENT_POLICY) {
          const prop = DB.getProperty() || {};
          const businessCard = DB.getBusinessCardCustom() || {};
          businessCard.bank_info = {
            upi_id: prop.upiId || prop.bankId || '',
            bank_id: prop.bankId || prop.upiId || '',
            qr_code: prop.qrCodeDataUrl || ''
          };

          await client.from('user_settings').upsert({
            user_id: userId,
            dark_mode: !!DB.getDarkMode(),
            wa_config: DB.getWAConfig() || {},
            owner_signature: DB.getOwnerSignature() || '',
            business_card: businessCard,
            gemini_key: DB.getGeminiKey() || '',
            agreement_policy: DB.getAgreementPolicy() || '',
            updated_at: new Date().toISOString()
          });
        }

        this.updateSyncBadge('synced', 'Cloud Synced');
      } catch (err) {
        console.error('[CloudDB] syncKeyToCloud failed for key:', key, err);
        this.updateSyncBadge('error', 'Sync Warning');
      } finally {
        this.isPushing = false;
      }
    }
  };

  // ── WINDOW FOCUS / VISIBILITY SYNC LISTENER ─────────────────
  // Automatically pull fresh cloud changes whenever the user switches back to this tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && CloudDB.isCloudEnabled()) {
      const user = CloudDB.getUser();
      if (user && user.id) {
        CloudDB.pullAllData(user.id, false);
      }
    }
  });

  window.addEventListener('focus', () => {
    if (CloudDB.isCloudEnabled()) {
      const user = CloudDB.getUser();
      if (user && user.id) {
        CloudDB.pullAllData(user.id, false);
      }
    }
  });

  window.CloudDB = CloudDB;

})(window);
