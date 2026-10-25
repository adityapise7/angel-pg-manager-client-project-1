// ============================================================
// ANGEL'S PG MANAGEMENT — CLOUD DATABASE SYNCHRONIZATION
// Synchronizes local DB models with Supabase Cloud Postgres tables
// Row-Level Security (RLS) enabled: data isolated per authenticated user
// ============================================================

(function(window) {
  'use strict';

  const CloudDB = {
    isSyncing: false,
    lastSyncTime: null,
    syncStatus: 'idle', // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

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
      const statusPills = document.querySelectorAll('.cloud-sync-badge, #cloud-sync-status, #sidebar-sync-badge');
      statusPills.forEach(el => {
        el.className = 'cloud-sync-badge sync-' + status;
        const iconSpan = el.querySelector('.sync-icon');
        const textSpan = el.querySelector('.sync-text') || el;
        
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
          if (textSpan && textSpan !== el) textSpan.textContent = label;
        } else {
          el.innerHTML = `<span class="sync-icon">${icon}</span> <span class="sync-text">${label}</span>`;
        }
      });
    },

    // ── CALLED ON USER SIGNED IN ──────────────────────────────
    async onUserSignedIn(user) {
      console.log('[CloudDB] User authenticated. Initializing Cloud Sync for:', user.id);
      this.updateSyncBadge('syncing', 'Syncing Data...');

      try {
        // 1. Check if cloud has records for this user
        const cloudCount = await this.getCloudRecordsCount(user.id);
        const hasLocalData = this.checkHasLocalData();

        console.log(`[CloudDB] Cloud count: ${cloudCount}, Has local data: ${hasLocalData}`);

        if (cloudCount > 0) {
          // Cloud has data: pull and populate local DB
          await this.pullAllData(user.id);
          this.updateSyncBadge('synced', 'Cloud Synced');
          if (typeof showToast === 'function') {
            showToast('☁️ Cloud data synchronized', 'success');
          }
        } else if (hasLocalData) {
          // Cloud is empty, but local device has existing PG data -> prompt migration
          this.promptLocalDataMigration(user.id);
        } else {
          // Fresh account: initialize default cloud property
          await this.pushLocalDataToCloud(user.id);
          this.updateSyncBadge('synced', 'Cloud Synced');
        }

        // Install mutation interceptors so any further edits persist to Supabase
        this.installMutationHooks();

      } catch (err) {
        console.error('[CloudDB] Auth sync failed:', err);
        this.updateSyncBadge('error', 'Sync Issue');
      }
    },

    onUserSignedOut() {
      this.updateSyncBadge('offline', 'Signed Out');
    },

    // ── CHECK EXISTING LOCAL DATA ─────────────────────────────
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

    async getCloudRecordsCount(userId) {
      const client = this.getClient();
      if (!client || !userId) return 0;
      try {
        const { count, error } = await client
          .from('floors')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (error) {
          console.warn('[CloudDB] Error checking floors count:', error);
          return 0;
        }
        return count || 0;
      } catch (e) {
        return 0;
      }
    },

    // ── PROMPT MIGRATION TO CLOUD ─────────────────────────────
    promptLocalDataMigration(userId) {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop active';
      modal.id = 'modal-cloud-migration';
      modal.style.zIndex = '999999';
      modal.innerHTML = `
        <div class="modal" style="max-width: 480px; text-align: center;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">☁️</div>
          <h2 class="modal-title" style="margin-bottom: 0.5rem;">Sync Existing PG Data</h2>
          <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.5;">
            We found existing PG records (rooms, beds, tenants) on this device. Would you like to upload and back up this data to your new Angel PG Cloud account?
          </p>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <button type="button" class="btn btn-primary" id="btn-confirm-migration" style="padding: 0.85rem; font-size: 1rem;">
              ☁️ Yes, Upload & Sync to Cloud
            </button>
            <button type="button" class="btn btn-secondary" id="btn-skip-migration" style="padding: 0.75rem;">
              Start with Empty Cloud Account
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('btn-confirm-migration')?.addEventListener('click', async () => {
        modal.remove();
        this.updateSyncBadge('syncing', 'Migrating to Cloud...');
        try {
          await this.pushLocalDataToCloud(userId);
          this.updateSyncBadge('synced', 'Cloud Synced');
          if (typeof showToast === 'function') {
            showToast('✅ All PG data successfully backed up to Supabase Cloud!', 'success');
          }
        } catch (err) {
          console.error('[CloudDB] Migration error:', err);
          this.updateSyncBadge('error', 'Migration Failed');
          if (typeof showToast === 'function') {
            showToast('Migration error: ' + err.message, 'error');
          }
        }
      });

      document.getElementById('btn-skip-migration')?.addEventListener('click', () => {
        modal.remove();
        this.updateSyncBadge('synced', 'Cloud Synced');
      });
    },

    // ── PULL ALL DATA FROM SUPABASE ───────────────────────────
    async pullAllData(userId) {
      const client = this.getClient();
      if (!client || !userId) return;

      this.isSyncing = true;
      console.log('[CloudDB] Pulling all tables for user:', userId);

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
          const beds = bedsData.map(b => ({ id: b.id, roomId: b.room_id, number: b.number, price: Number(b.price || 0), tenantId: b.tenant_id }));
          DB._set(DB.KEYS.BEDS, beds);
        }

        // 5. Tenants
        const { data: tenantsData } = await client.from('tenants').select('*').eq('user_id', userId);
        if (tenantsData) {
          const tenants = tenantsData.map(t => ({
            id: t.id,
            name: t.name,
            phone: t.phone,
            email: t.email,
            roomId: t.room_id,
            bedId: t.bed_id,
            rent: Number(t.rent || 0),
            deposit: Number(t.deposit || 0),
            joiningDate: t.joining_date,
            aadhaarVerified: t.aadhaar_verified,
            docs: Array.isArray(t.docs) ? t.docs : []
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
            mode: p.mode,
            month: p.month,
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
            category: e.category,
            title: e.description || e.category,
            date: e.date
          }));
          DB._set(DB.KEYS.EXPENSES, expenses);
        }

        // 8. Other Income
        const { data: incomeData } = await client.from('other_income').select('*').eq('user_id', userId).order('date', { ascending: false });
        if (incomeData) {
          const otherIncome = incomeData.map(i => ({
            id: i.id,
            amount: Number(i.amount || 0),
            category: i.category,
            title: i.description || i.category,
            date: i.date
          }));
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
          if (s.wa_config) DB.saveWhatsAppConfig(s.wa_config);
          if (s.owner_signature) DB.saveOwnerSignature(s.owner_signature);
          if (s.business_card) DB.saveBusinessCardCustom(s.business_card);
          if (s.gemini_key) DB.saveGeminiKey(s.gemini_key);
          if (s.agreement_policy) DB.saveAgreementPolicy(s.agreement_policy);
        }

        this.lastSyncTime = new Date();
        this.updateSyncBadge('synced', 'Cloud Synced');

        // Re-render UI views with cloud data
        if (window.App && typeof window.App.syncGlobalBranding === 'function') {
          window.App.syncGlobalBranding();
        }
        if (window.Dashboard && typeof window.Dashboard.render === 'function') {
          window.Dashboard.render();
        }
        if (window.Rooms && typeof window.Rooms.render === 'function') {
          window.Rooms.render();
        }
        if (window.Tenants && typeof window.Tenants.render === 'function') {
          window.Tenants.render();
        }

      } catch (err) {
        console.error('[CloudDB] pullAllData error:', err);
        this.updateSyncBadge('error', 'Pull Failed');
      } finally {
        this.isSyncing = false;
      }
    },

    // ── PUSH ALL LOCAL DATA TO SUPABASE ───────────────────────
    async pushLocalDataToCloud(userId) {
      const client = this.getClient();
      if (!client || !userId) return;

      this.isSyncing = true;
      console.log('[CloudDB] Pushing all local data to cloud for user:', userId);

      try {
        // 1. Property
        const prop = DB.getProperty() || {};
        await client.from('properties').upsert({
          id: prop.id || 'prop_' + userId.slice(0, 8),
          user_id: userId,
          name: prop.name || "Angel's PG",
          owner: prop.owner || '',
          phone: prop.phone || '',
          address: prop.address || '',
          currency: prop.currency || '₹',
          default_bed_price: prop.defaultBedPrice || 6000,
          default_capacity: prop.defaultCapacity || 2,
          electricity_rate: prop.electricityRate || 10,
          logo: prop.logo || '',
          logo_uploaded: !!prop.logoUploaded,
          updated_at: new Date().toISOString()
        });

        // 2. Floors
        const floors = DB.getFloors() || [];
        if (floors.length > 0) {
          const payload = floors.map((f, idx) => ({
            id: f.id,
            user_id: userId,
            name: f.name || `Floor ${idx + 1}`,
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
            price: b.price || 6000,
            tenant_id: b.tenantId || null
          }));
          await client.from('beds').upsert(payload);
        }

        // 5. Tenants
        const tenants = DB.getTenants() || [];
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
        const otherIncome = DB.getOtherIncome() || [];
        if (otherIncome.length > 0) {
          const payload = otherIncome.map(i => ({
            id: i.id,
            user_id: userId,
            amount: i.amount || 0,
            category: i.category || 'Other',
            description: i.title || i.category || 'Income',
            date: i.date || new Date().toISOString().split('T')[0]
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
        await client.from('user_settings').upsert({
          user_id: userId,
          dark_mode: !!DB.getDarkMode(),
          wa_config: DB.getWhatsAppConfig() || {},
          owner_signature: DB.getOwnerSignature() || '',
          business_card: DB.getBusinessCardCustom() || {},
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
        this.isSyncing = false;
      }
    },

    // ── MUTATION HOOKS (INTERCEPT LOCAL EDITS) ────────────────
    _hooksInstalled: false,
    installMutationHooks() {
      if (this._hooksInstalled) return;
      this._hooksInstalled = true;

      const self = this;

      // Wrap DB.saveProperty
      const origSaveProp = DB.saveProperty.bind(DB);
      DB.saveProperty = function(prop) {
        origSaveProp(prop);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          self.getClient().from('properties').upsert({
            id: prop.id || 'prop_' + user.id.slice(0, 8),
            user_id: user.id,
            name: prop.name || "Angel's PG",
            owner: prop.owner || '',
            phone: prop.phone || '',
            address: prop.address || '',
            currency: prop.currency || '₹',
            default_bed_price: prop.defaultBedPrice || 6000,
            default_capacity: prop.defaultCapacity || 2,
            electricity_rate: prop.electricityRate || 10,
            logo: prop.logo || '',
            logo_uploaded: !!prop.logoUploaded,
            updated_at: new Date().toISOString()
          }).then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Floor add/update/delete
      const origSaveFloors = DB.saveFloors.bind(DB);
      DB.saveFloors = function(floors) {
        origSaveFloors(floors);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = floors.map((f, idx) => ({
            id: f.id,
            user_id: user.id,
            name: f.name,
            order: f.order != null ? f.order : idx
          }));
          self.getClient().from('floors').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Room add/update/delete
      const origSaveRooms = DB.saveRooms.bind(DB);
      DB.saveRooms = function(rooms) {
        origSaveRooms(rooms);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = rooms.map(r => ({
            id: r.id,
            user_id: user.id,
            floor_id: r.floorId || '',
            name: r.name,
            capacity: r.capacity || 2
          }));
          self.getClient().from('rooms').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Bed add/update/delete
      const origSaveBeds = DB.saveBeds.bind(DB);
      DB.saveBeds = function(beds) {
        origSaveBeds(beds);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = beds.map(b => ({
            id: b.id,
            user_id: user.id,
            room_id: b.roomId,
            number: b.number,
            price: b.price || 6000,
            tenant_id: b.tenantId || null
          }));
          self.getClient().from('beds').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Tenant add/update/delete
      const origSaveTenants = DB.saveTenants.bind(DB);
      DB.saveTenants = function(tenants) {
        origSaveTenants(tenants);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = tenants.map(t => ({
            id: t.id,
            user_id: user.id,
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
          self.getClient().from('tenants').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Payment add/update/delete
      const origSavePayments = DB.savePayments.bind(DB);
      DB.savePayments = function(payments) {
        origSavePayments(payments);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = payments.map(p => ({
            id: p.id,
            user_id: user.id,
            tenant_id: p.tenantId,
            amount: p.amount || 0,
            mode: p.mode || 'Cash',
            month: p.month || '',
            paid_date: p.date || new Date().toISOString().split('T')[0],
            status: p.status || 'Paid'
          }));
          self.getClient().from('payments').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Expenses add/update/delete
      const origSaveExpenses = DB.saveExpenses.bind(DB);
      DB.saveExpenses = function(expenses) {
        origSaveExpenses(expenses);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = expenses.map(e => ({
            id: e.id,
            user_id: user.id,
            amount: e.amount || 0,
            category: e.category || 'General',
            description: e.title || e.category || 'Expense',
            date: e.date || new Date().toISOString().split('T')[0]
          }));
          self.getClient().from('expenses').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Other Income add/update/delete
      const origSaveOtherIncome = DB.saveOtherIncome.bind(DB);
      DB.saveOtherIncome = function(income) {
        origSaveOtherIncome(income);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = income.map(i => ({
            id: i.id,
            user_id: user.id,
            amount: i.amount || 0,
            category: i.category || 'Other',
            description: i.title || i.category || 'Income',
            date: i.date || new Date().toISOString().split('T')[0]
          }));
          self.getClient().from('other_income').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Wrap Agreements add/update/delete
      const origSaveAgreements = DB.saveAgreements.bind(DB);
      DB.saveAgreements = function(agreements) {
        origSaveAgreements(agreements);
        if (self.isCloudEnabled()) {
          const user = self.getUser();
          self.updateSyncBadge('syncing', 'Saving...');
          const payload = agreements.map(a => ({
            id: a.id,
            user_id: user.id,
            tenant_id: a.tenantId || a.tenant_id || '',
            agreement_data: a
          }));
          self.getClient().from('agreements').upsert(payload)
            .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
        }
      };

      // Automatic delete wrappers
      const origDeleteFloor = DB.deleteFloor ? DB.deleteFloor.bind(DB) : null;
      if (origDeleteFloor) {
        DB.deleteFloor = function(id) {
          origDeleteFloor(id);
          if (self.isCloudEnabled()) {
            self.getClient().from('floors').delete().eq('id', id).eq('user_id', self.getUser().id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
          }
        };
      }

      const origDeleteRoom = DB.deleteRoom ? DB.deleteRoom.bind(DB) : null;
      if (origDeleteRoom) {
        DB.deleteRoom = function(id) {
          origDeleteRoom(id);
          if (self.isCloudEnabled()) {
            self.getClient().from('rooms').delete().eq('id', id).eq('user_id', self.getUser().id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
          }
        };
      }

      const origDeleteBed = DB.deleteBed ? DB.deleteBed.bind(DB) : null;
      if (origDeleteBed) {
        DB.deleteBed = function(id) {
          origDeleteBed(id);
          if (self.isCloudEnabled()) {
            self.getClient().from('beds').delete().eq('id', id).eq('user_id', self.getUser().id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
          }
        };
      }

      const origDeleteTenant = DB.deleteTenant ? DB.deleteTenant.bind(DB) : null;
      if (origDeleteTenant) {
        DB.deleteTenant = function(id) {
          origDeleteTenant(id);
          if (self.isCloudEnabled()) {
            self.getClient().from('tenants').delete().eq('id', id).eq('user_id', self.getUser().id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
          }
        };
      }

      const origDeletePayment = DB.deletePayment ? DB.deletePayment.bind(DB) : null;
      if (origDeletePayment) {
        DB.deletePayment = function(id) {
          origDeletePayment(id);
          if (self.isCloudEnabled()) {
            self.getClient().from('payments').delete().eq('id', id).eq('user_id', self.getUser().id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
          }
        };
      }

      const origDeleteExpense = DB.deleteExpense ? DB.deleteExpense.bind(DB) : null;
      if (origDeleteExpense) {
        DB.deleteExpense = function(id) {
          origDeleteExpense(id);
          if (self.isCloudEnabled()) {
            self.getClient().from('expenses').delete().eq('id', id).eq('user_id', self.getUser().id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
          }
        };
      }

      const origDeleteOtherIncome = DB.deleteOtherIncome ? DB.deleteOtherIncome.bind(DB) : null;
      if (origDeleteOtherIncome) {
        DB.deleteOtherIncome = function(id) {
          origDeleteOtherIncome(id);
          if (self.isCloudEnabled()) {
            self.getClient().from('other_income').delete().eq('id', id).eq('user_id', self.getUser().id)
              .then(() => self.updateSyncBadge('synced', 'Cloud Synced')).catch(e => console.warn(e));
          }
        };
      }

      console.log('[CloudDB] Mutation hooks installed successfully.');
    }
  };

  window.CloudDB = CloudDB;

})(window);
