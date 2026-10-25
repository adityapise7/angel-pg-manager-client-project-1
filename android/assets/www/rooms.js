// ============================================================
// ANGEL'S PG MANAGEMENT — ROOMS TAB
// ============================================================

const Rooms = {
  activeFloor: null,
  expandedRooms: new Set(),

  render() {
    const floors = DB.getFloors();
    if (floors.length === 0) {
      document.getElementById('tab-rooms').innerHTML = `
        <div class="scroll-area">
          <div class="empty-state" style="padding:60px 24px">
            <div class="empty-icon">🏢</div>
            <div class="empty-title">No Floors Yet</div>
            <div class="empty-sub">Add your first floor right here to start organizing rooms and beds.</div>
            <button class="btn btn-primary mt-16" onclick="Rooms.showAddFloorModal()">➕ Add New Floor</button>
          </div>
        </div>`;
      return;
    }

    if (!this.activeFloor || !floors.find(f => f.id === this.activeFloor)) {
      this.activeFloor = floors[0].id;
    }

    const currentFloorObj = floors.find(f => f.id === this.activeFloor) || floors[0];
    const floorTabs = floors.map(f =>
      `<button class="floor-tab ${f.id === this.activeFloor ? 'active' : ''}" onclick="Rooms.setFloor('${f.id}')">🏢 ${f.name}</button>`
    ).join('');

    const rooms = DB.getRoomsByFloor(this.activeFloor);
    const prop = DB.getProperty();

    let totalBedsOnFloor = 0;
    let totalOccupiedOnFloor = 0;
    rooms.forEach(r => {
      const b = DB.getBedsByRoom(r.id);
      totalBedsOnFloor += b.length;
      totalOccupiedOnFloor += b.filter(x => x.tenantId).length;
    });

    const roomCards = rooms.map(r => this.renderRoomCard(r, prop.currency)).join('') ||
      `<div class="empty-state">
        <div class="empty-icon">🚪</div>
        <div class="empty-title">No rooms on ${currentFloorObj.name}</div>
        <div class="empty-sub">Tap "+ Add Room" to create a room on ${currentFloorObj.name}</div>
        <button class="btn btn-primary mt-12" onclick="Rooms.showAddRoomModal()">➕ Add Room to ${currentFloorObj.name}</button>
      </div>`;

    document.getElementById('tab-rooms').innerHTML = `
      <div class="scroll-area">
        <!-- Floor Filter Tabs with direct Add Floor button -->
        <div class="floor-tabs-bar">
          <div class="floor-tabs">
            ${floorTabs}
            <button class="floor-tab add-floor-tab-btn" onclick="Rooms.showAddFloorModal()" title="Add New Floor">
              ➕ Add Floor
            </button>
          </div>
        </div>

        <!-- Rooms & Beds Section Header Bar -->
        <div class="rooms-header-bar">
          <div class="rooms-title-wrap">
            <div class="rooms-title-row">
              <h2 class="rooms-section-title">Rooms &amp; Beds</h2>
              <button class="floor-manage-pill" onclick="Rooms.showManageFloorsModal()" title="Manage all floors">
                🏢 Floors (${floors.length}) ▾
              </button>
            </div>
            <span class="rooms-count-badge">
              ${rooms.length} ${rooms.length === 1 ? 'Room' : 'Rooms'} · ${totalBedsOnFloor} Beds (${totalOccupiedOnFloor} occupied) · ${currentFloorObj.name}
            </span>
          </div>

          <div class="rooms-header-actions">
            <button class="btn btn-ghost btn-sm" onclick="Rooms.showEditFloorModal('${currentFloorObj.id}')" title="Rename ${currentFloorObj.name}">
              ✏️ Rename Floor
            </button>
            <button class="btn btn-secondary btn-sm" onclick="Rooms.showQuickAddBedModal()" title="Directly add a bed to any room on this floor">
              🛏️ + Add Bed
            </button>
            <button class="btn btn-primary btn-sm" onclick="Rooms.showAddRoomModal()" title="Add room to ${currentFloorObj.name}">
              🚪 + Add Room
            </button>
          </div>
        </div>

        <div id="rooms-list">${roomCards}</div>
      </div>
      <button class="app-fab-action app-fab-room" id="fab-add-room" onclick="Rooms.showAddRoomModal()" 
        title="Add Room to ${currentFloorObj.name}" aria-label="Add Room">
        <span class="app-fab-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </span>
        <span class="app-fab-label">Add Room</span>
      </button>
    `;
  },

  renderRoomCard(room, currency) {
    const beds = DB.getBedsByRoom(room.id);
    const occupied = beds.filter(b => b.tenantId).length;
    const vacant = beds.length - occupied;
    const expanded = this.expandedRooms.has(room.id);

    const bedChips = beds.map(b => {
      const tenant = b.tenantId ? DB.getTenantById(b.tenantId) : null;
      return `<button class="bed-chip ${tenant ? 'occupied' : 'vacant'}"
        onclick="Rooms.openBedModal('${b.id}')" title="${tenant ? tenant.name : 'Vacant'}">
        <span class="bed-chip-icon">${tenant ? '👤' : '🛏️'}</span>
        <span class="bed-chip-number">Bed ${b.number}</span>
        <span class="bed-chip-name">${tenant ? tenant.name.split(' ')[0] : 'Vacant'}</span>
      </button>`;
    }).join('');

    return `
      <div class="room-card ${expanded ? 'expanded' : ''}" id="rc-${room.id}">
        <div class="room-card-header" onclick="Rooms.toggleRoom('${room.id}')">
          <div class="room-icon">🚪</div>
          <div class="room-info">
            <div class="room-name">${room.name}</div>
            <div class="room-meta">
              <span class="badge green">🟢 ${vacant} Vacant</span>&nbsp;
              <span class="badge red">🔴 ${occupied} Occupied</span>&nbsp;
              <span class="badge blue">🛏️ ${beds.length} Total</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm room-add-bed-btn" onclick="Rooms.showAddBedModal('${room.id}')" title="Add Bed to ${room.name}">
              🛏️ + Bed
            </button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="Rooms.showEditRoomModal('${room.id}')" title="Edit Room">✏️</button>
            <span class="room-chevron" onclick="Rooms.toggleRoom('${room.id}')">›</span>
          </div>
        </div>
        <div class="beds-grid">
          ${bedChips}
          <button class="bed-chip vacant add-bed-chip" style="border:1.5px dashed var(--accent-green);background:transparent;color:var(--accent-green)"
            onclick="Rooms.showAddBedModal('${room.id}')" title="Add Bed to ${room.name}">
            <span class="bed-chip-icon">➕</span>
            <span class="bed-chip-name">Add Bed</span>
          </button>
        </div>
      </div>`;
  },

  toggleRoom(roomId) {
    if (this.expandedRooms.has(roomId)) this.expandedRooms.delete(roomId);
    else this.expandedRooms.add(roomId);
    this.render();
  },

  setFloor(floorId) {
    this.activeFloor = floorId;
    this.expandedRooms.clear();
    this.render();
  },

  // ── FLOOR MANAGEMENT DIRECT METHODS ────────────────────────
  showAddFloorModal() {
    showModal('➕ Add New Floor', `
      <div class="form-group">
        <label class="form-label">Floor Name / Number *</label>
        <input class="form-input" id="inp-rf-name" placeholder="e.g. Ground Floor, 1st Floor, 2nd Floor" autocomplete="off">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Rooms and beds can be added directly to this floor once created.</div>
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.saveFloor()">Add Floor</button>
      </div>
    `);
    const inp = document.getElementById('inp-rf-name');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Rooms.saveFloor();
      });
    }
  },

  saveFloor() {
    const inp = document.getElementById('inp-rf-name');
    const name = inp ? inp.value.trim() : '';
    if (!name) return showToast('Please enter a floor name', 'error');

    const floors = DB.getFloors();
    if (floors.some(f => f.name.trim().toLowerCase() === name.toLowerCase())) {
      return showToast(`Floor "${name}" already exists`, 'error');
    }

    const newFloorId = generateId('f');
    DB.addFloor({ id: newFloorId, name, order: floors.length });
    this.activeFloor = newFloorId;
    closeModal();
    this.render();
    if (typeof SoundFX !== 'undefined' && SoundFX.success) SoundFX.success();
    showToast(`✅ Floor "${name}" created!`, 'success');
  },

  showEditFloorModal(floorId) {
    const floor = DB.getFloors().find(f => f.id === floorId);
    if (!floor) return;
    showModal('✏️ Rename Floor', `
      <div class="form-group">
        <label class="form-label">Floor Name *</label>
        <input class="form-input" id="inp-rf-edit-name" value="${floor.name}" autocomplete="off">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.updateFloor('${floorId}')">Save</button>
      </div>
    `);
    const inp = document.getElementById('inp-rf-edit-name');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Rooms.updateFloor(floorId);
      });
    }
  },

  updateFloor(floorId) {
    const inp = document.getElementById('inp-rf-edit-name');
    const name = inp ? inp.value.trim() : '';
    if (!name) return showToast('Please enter floor name', 'error');
    DB.updateFloor(floorId, { name });
    closeModal();
    this.render();
    showToast('✅ Floor updated!', 'success');
  },

  deleteFloor(floorId) {
    const floor = DB.getFloors().find(f => f.id === floorId);
    if (!floor) return;
    const stats = DB.getFloorStats(floorId);
    if (stats.occupied > 0) {
      return showToast(`⚠️ Move out ${stats.occupied} tenant(s) before deleting this floor`, 'error');
    }
    if (!confirm(`Delete "${floor.name}" and all its ${stats.rooms} room(s)?`)) return;

    DB.deleteFloor(floorId);
    const remaining = DB.getFloors();
    this.activeFloor = remaining.length > 0 ? remaining[0].id : null;
    closeModal();
    this.render();
    showToast(`🗑️ Floor "${floor.name}" deleted`, 'info');
  },

  showManageFloorsModal() {
    const floors = DB.getFloors();
    const rows = floors.map(f => {
      const stats = DB.getFloorStats(f.id);
      const isCurrent = f.id === this.activeFloor;
      return `
        <div class="floor-mgmt-row ${isCurrent ? 'active-floor-row' : ''}">
          <div class="floor-mgmt-info" onclick="Rooms.setFloor('${f.id}'); closeModal();">
            <div class="floor-mgmt-name">
              🏢 ${f.name} ${isCurrent ? '<span class="badge blue">Current</span>' : ''}
            </div>
            <div class="floor-mgmt-meta">
              ${stats.rooms} room(s) · ${stats.total} bed(s) (${stats.occupied} occupied, ${stats.vacant} vacant)
            </div>
          </div>
          <div class="floor-mgmt-actions">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation(); Rooms.showEditFloorModal('${f.id}')" title="Rename">✏️</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation(); Rooms.deleteFloor('${f.id}')" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    showModal('🏢 Floor Management', `
      <div class="floor-mgmt-list">
        ${rows || '<div class="empty-state"><div class="empty-title">No floors found</div></div>'}
      </div>
      <div class="form-actions mt-16">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Close</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.showAddFloorModal()">➕ Add New Floor</button>
      </div>
    `);
  },

  // ── DIRECT QUICK ADD BED MODAL ─────────────────────────────
  showQuickAddBedModal() {
    const rooms = DB.getRoomsByFloor(this.activeFloor);
    if (!rooms || rooms.length === 0) {
      showToast('Please add a room to this floor first', 'info');
      Rooms.showAddRoomModal();
      return;
    }
    const prop = DB.getProperty();
    const roomOptions = rooms.map(r => {
      const beds = DB.getBedsByRoom(r.id);
      return `<option value="${r.id}">${r.name} (${beds.length} bed${beds.length === 1 ? '' : 's'})</option>`;
    }).join('');

    showModal('🛏️ Add Bed Directly', `
      <div class="form-group">
        <label class="form-label">Target Room *</label>
        <select class="form-select" id="inp-quick-bed-room" onchange="Rooms.updateQuickBedNextLabel()">
          ${roomOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Bed Number / Label *</label>
        <input class="form-input" id="inp-quick-bed-num" value="A">
      </div>
      <div class="form-group">
        <label class="form-label">Bed Price (${prop.currency || '₹'}/month)</label>
        <input class="form-input" id="inp-quick-bed-price" type="number" value="${prop.defaultBedPrice || 6000}">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.saveQuickBed()">Add Bed</button>
      </div>
    `);

    Rooms.updateQuickBedNextLabel();
  },

  updateQuickBedNextLabel() {
    const sel = document.getElementById('inp-quick-bed-room');
    if (!sel) return;
    const roomId = sel.value;
    const beds = DB.getBedsByRoom(roomId);
    const nextNum = String.fromCharCode(65 + beds.length);
    const inp = document.getElementById('inp-quick-bed-num');
    if (inp) inp.value = nextNum;
  },

  saveQuickBed() {
    const roomId = document.getElementById('inp-quick-bed-room')?.value;
    const number = document.getElementById('inp-quick-bed-num')?.value.trim();
    const price = parseFloat(document.getElementById('inp-quick-bed-price')?.value) || DB.getProperty().defaultBedPrice;
    if (!roomId) return showToast('Please select a room', 'error');
    if (!number) return showToast('Please enter a bed number/label', 'error');

    DB.addBed({ id: generateId('b'), roomId, number, price, tenantId: null });
    this.expandedRooms.add(roomId);
    closeModal();
    this.render();
    if (typeof SoundFX !== 'undefined' && SoundFX.success) SoundFX.success();
    showToast(`✅ Bed ${number} added directly!`, 'success');
  },

  // ── ADD/EDIT ROOM MODALS ───────────────────────────────────
  showAddRoomModal() {
    const floors = DB.getFloors();
    if (!floors || floors.length === 0) {
      showToast('Please add a floor first', 'info');
      Rooms.showAddFloorModal();
      return;
    }
    const currentFloor = floors.find(f => f.id === this.activeFloor) || floors[0];
    this.activeFloor = currentFloor.id;

    showModal(`Add Room to ${currentFloor.name}`, `
      <div style="background:var(--bg-input);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;border:1px solid var(--border)">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase">Target Floor</div>
          <div style="font-size:14px;font-weight:800;color:var(--text-primary)">🏢 ${currentFloor.name}</div>
        </div>
        <span class="badge blue">Selected Floor</span>
      </div>
      <input type="hidden" id="inp-room-floor" value="${currentFloor.id}">

      <div class="form-group">
        <label class="form-label">Room Number / Name *</label>
        <input class="form-input" id="inp-room-name" placeholder="e.g. 101, 201, or A-101" autocomplete="off">
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">This room will be added to ${currentFloor.name}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Number of Beds</label>
        <input class="form-input" id="inp-room-beds" type="number" min="1" max="20" value="${DB.getProperty().defaultCapacity || 2}">
      </div>
      <div class="form-group">
        <label class="form-label">Default Bed Price (${DB.getProperty().currency || '₹'})</label>
        <input class="form-input" id="inp-room-price" type="number" value="${DB.getProperty().defaultBedPrice || 6000}">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.saveRoom()">Add Room</button>
      </div>
    `);
    const inp = document.getElementById('inp-room-name');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Rooms.saveRoom();
      });
    }
  },

  saveRoom() {
    const nameInp = document.getElementById('inp-room-name');
    const name = nameInp ? nameInp.value.trim() : '';
    const floorId = document.getElementById('inp-room-floor') ? document.getElementById('inp-room-floor').value : this.activeFloor;
    const numBeds = parseInt(document.getElementById('inp-room-beds')?.value) || 1;
    const price = parseFloat(document.getElementById('inp-room-price')?.value) || DB.getProperty().defaultBedPrice;

    if (!name) return showToast('Please enter a room number/name', 'error');
    if (!floorId) return showToast('Please select a floor', 'error');

    const floors = DB.getFloors();
    const floorObj = floors.find(f => f.id === floorId) || { name: 'this floor' };

    // Duplicate room protection: Check if a room with the same name already exists on this floor
    const existingRoomsOnFloor = DB.getRoomsByFloor(floorId);
    const isDuplicate = existingRoomsOnFloor.some(r => r.name.trim().toLowerCase() === name.toLowerCase());

    if (isDuplicate) {
      return showToast(`Room ${name} already exists on ${floorObj.name}.`, 'error');
    }

    const roomId = generateId('r');
    DB.addRoom({ id: roomId, floorId, name, capacity: numBeds });
    for (let i = 1; i <= numBeds; i++) {
      DB.addBed({ id: generateId('b'), roomId, number: String.fromCharCode(64 + i), price, tenantId: null });
    }
    closeModal();
    this.activeFloor = floorId;
    this.expandedRooms.add(roomId);
    this.render();
    if (typeof SoundFX !== 'undefined' && SoundFX.success) {
      SoundFX.success();
    }
    showToast(`✅ Room ${name} added to ${floorObj.name}!`, 'success');
  },

  showEditRoomModal(roomId) {
    const room = DB.getRooms().find(r => r.id === roomId);
    if (!room) return;
    const floors = DB.getFloors();
    const floorOptions = floors.map(f => `<option value="${f.id}" ${f.id === room.floorId ? 'selected' : ''}>${f.name}</option>`).join('');
    showModal('Edit Room', `
      <div class="form-group"><label class="form-label">Room Name *</label>
        <input class="form-input" id="inp-edit-room-name" value="${room.name}"></div>
      <div class="form-group"><label class="form-label">Floor</label>
        <select class="form-select" id="inp-edit-room-floor">${floorOptions}</select></div>
      <div class="form-actions">
        <button class="btn btn-danger" onclick="Rooms.deleteRoom('${roomId}')">🗑️ Delete</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.updateRoom('${roomId}')">Save</button>
      </div>
    `);
  },

  updateRoom(roomId) {
    const name = document.getElementById('inp-edit-room-name').value.trim();
    const floorId = document.getElementById('inp-edit-room-floor').value;
    if (!name) return showToast('Enter a room name', 'error');
    DB.updateRoom(roomId, { name, floorId });
    closeModal();
    this.activeFloor = floorId;
    this.render();
    showToast('✅ Room updated!', 'success');
  },

  deleteRoom(roomId) {
    const room = DB.getRooms().find(r => r.id === roomId);
    const beds = DB.getBedsByRoom(roomId);
    const occupied = beds.filter(b => b.tenantId).length;
    if (occupied > 0) return showToast(`⚠️ Remove ${occupied} tenant(s) first`, 'error');
    if (!confirm(`Delete ${room?.name}? This will also delete all beds.`)) return;
    DB.deleteRoom(roomId);
    closeModal();
    this.render();
    showToast('🗑️ Room deleted', 'info');
  },

  // ── ADD BED MODAL ──────────────────────────────────────────
  showAddBedModal(roomId) {
    const room = DB.getRooms().find(r => r.id === roomId);
    const prop = DB.getProperty();
    const beds = DB.getBedsByRoom(roomId);
    const nextNum = String.fromCharCode(65 + beds.length);
    showModal('Add Bed', `
      <div class="form-group"><label class="form-label">Room</label>
        <input class="form-input" value="${room?.name}" disabled></div>
      <div class="form-group"><label class="form-label">Bed Number/Label *</label>
        <input class="form-input" id="inp-bed-num" value="${nextNum}"></div>
      <div class="form-group"><label class="form-label">Bed Price (${prop.currency}/month)</label>
        <input class="form-input" id="inp-bed-price" type="number" value="${prop.defaultBedPrice}"></div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.saveBed('${roomId}')">Add Bed</button>
      </div>
    `);
  },

  saveBed(roomId) {
    const number = document.getElementById('inp-bed-num').value.trim();
    const price = parseFloat(document.getElementById('inp-bed-price').value) || DB.getProperty().defaultBedPrice;
    if (!number) return showToast('Enter bed number', 'error');
    DB.addBed({ id: generateId('b'), roomId, number, price, tenantId: null });
    this.expandedRooms.add(roomId);
    closeModal();
    this.render();
    showToast('✅ Bed added!', 'success');
  },

  // ── BED DETAIL MODAL ───────────────────────────────────────
  openBedModal(bedId) {
    const bed = DB.getBeds().find(b => b.id === bedId);
    if (!bed) return;
    const room = DB.getRooms().find(r => r.id === bed.roomId);
    const prop = DB.getProperty();
    const tenant = bed.tenantId ? DB.getTenantById(bed.tenantId) : null;

    if (tenant) {
      const currentMonth = getCurrentMonth();
      const paid = DB.isPaid(tenant.id, currentMonth);
      const verificationBadge = tenant.mobileVerified 
        ? `<span class="badge green" style="display:inline-flex; align-items:center; gap:4px">📱 Mobile Verified</span>`
        : (tenant.aadhaarVerified 
          ? `<span class="badge green" style="display:inline-flex; align-items:center; gap:4px">${tenant.aadhaarMethod === 'DIGILOCKER' ? '🏛️ DigiLocker Verified' : '🛡️ Aadhaar QR Verified'}</span>` 
          : '');

      showModal(`🛏️ Bed ${bed.number} — ${room?.name}`, `
        <div style="text-align:center;margin-bottom:20px">
          <div class="tenant-avatar" style="background:${getAvatarColor(tenant.name)};width:64px;height:64px;font-size:24px;margin:0 auto 12px">${getInitials(tenant.name)}</div>
          <div style="font-size:18px;font-weight:700">${tenant.name}</div>
          <div class="color-secondary fs-13">📱 ${tenant.phone}</div>
          <div style="display:flex; justify-content:center; gap:6px; margin-top:8px">
            <span class="badge ${paid ? 'green' : 'red'}">${paid ? '✅ Paid' : '❌ Unpaid'}</span>
            ${verificationBadge}
          </div>
        </div>
        <div class="card" style="margin-bottom:12px">
          <div class="payment-item" style="padding:8px 0;border:none"><span class="color-secondary">Rent</span><strong>${formatCurrency(tenant.rent, prop.currency)}/mo</strong></div>
          <div class="payment-item" style="padding:8px 0;border:none"><span class="color-secondary">Deposit</span><strong>${formatCurrency(tenant.deposit, prop.currency)}</strong></div>
          <div class="payment-item" style="padding:8px 0;border:none"><span class="color-secondary">Move-in</span><strong>${formatDateDisplay(tenant.moveInDate)}</strong></div>
          <div class="payment-item" style="padding:8px 0;border:none;border-bottom:none"><span class="color-secondary">Verification</span><strong>${tenant.idProof || tenant.aadhaarNumber || '—'}</strong></div>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-full" onclick="Tenants.showEditModal('${tenant.id}')">✏️ Edit</button>
          <button class="btn btn-whatsapp btn-full" onclick="WhatsApp._sendOne('${tenant.id}')">📲 Remind</button>
        </div>
        <div class="flex gap-8 mt-8">
          <button class="btn btn-outline btn-full" onclick="Rooms.showReplaceTenantModal('${bed.id}','${tenant.id}')">🔄 Replace</button>
          <button class="btn btn-danger btn-full" onclick="Rooms.vacateBed('${bed.id}','${tenant.id}')">🚪 Vacate</button>
        </div>
        <button class="btn btn-ghost btn-full mt-8" onclick="closeModal()">Cancel</button>
      `);
    } else {
      showModal(`🛏️ Bed ${bed.number} — ${room?.name}`, `
        <div style="text-align:center;padding:20px 0">
          <div style="font-size:48px;margin-bottom:12px">🛏️</div>
          <div style="font-size:16px;font-weight:700;color:var(--accent-green)">Vacant</div>
          <div class="color-secondary fs-13 mt-8">Price: ${formatCurrency(bed.price, prop.currency)}/month</div>
        </div>
        <button class="btn btn-primary btn-full btn-lg" onclick="Rooms.showAssignTenantModal('${bed.id}')">👤 Assign Tenant</button>
        <button class="btn btn-ghost btn-full mt-8" onclick="Rooms.showEditBedModal('${bed.id}')">✏️ Edit Bed</button>
        <button class="btn btn-danger btn-full mt-8" onclick="Rooms.deleteBedConfirm('${bed.id}')">🗑️ Delete Bed</button>
        <button class="btn btn-ghost btn-full mt-8" onclick="closeModal()">Cancel</button>
      `);
    }
  },

  // ── ASSIGN TENANT WITH MOBILE OTP VERIFICATION ─────────
  showAssignTenantModal(bedId) {
    const bed = DB.getBeds().find(b => b.id === bedId);
    const prop = DB.getProperty();
    TenantKYC.reset();

    showModal('👤 Assign Tenant', `
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input class="form-input" id="inp-t-name" placeholder="Tenant Name">
      </div>
      <div class="form-group">
        <label class="form-label">Country & Mobile Number *</label>
        <div style="display:flex; align-items:center; gap:8px">
          <span style="background:var(--bg-card); border:1.5px solid var(--border); border-radius:var(--radius-md); padding:11px 12px; font-weight:700; font-size:14px; color:var(--text-primary); white-space:nowrap">🇮🇳 +91</span>
          <input class="form-input" id="inp-t-phone" placeholder="10-digit number" type="tel" maxlength="10" style="flex:1">
        </div>
      </div>

      <!-- Mobile OTP Verification Section -->
      <div class="card" style="margin-bottom:16px; background:var(--bg-input); border:1.5px solid var(--border); padding:14px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
          <label class="form-label" style="margin-bottom:0">📱 WhatsApp Mobile Verification *</label>
          <span id="aadhaar-status-badge" class="badge amber" style="font-size:11px">⚠️ Verification Required</span>
        </div>

        <div class="color-secondary fs-12 mb-8" id="aadhaar-help-text">
          Country code is preset to <strong>+91 (India only)</strong>. Verification code will be sent to the tenant via WhatsApp.
        </div>

        <div id="kyc-buttons-row">
          <button type="button" class="btn btn-whatsapp btn-full" id="btn-kyc-mobile" onclick="Rooms.triggerMobileVerify('assign')" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:12px">
            <span>📲</span> <span>Send Verification Code on WhatsApp</span>
          </button>
        </div>

        <!-- Inline OTP Entry (shown after code sent) -->
        <div id="inline-otp-container" style="display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--border)">
          <div style="text-align:center; margin-bottom:10px">
            <span class="badge green" style="font-size:11px" id="otp-sent-banner">✅ Code sent via WhatsApp to +91 <span id="target-phone-display"></span></span>
            <div class="color-secondary fs-12 mt-4" id="otp-timer-display">Resend available in: <strong id="otp-countdown">60</strong>s</div>
          </div>

          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label" style="text-align:center">Enter 6-Digit WhatsApp Code *</label>
            <input class="form-input" id="inp-otp-code" placeholder="• • • • • •" maxlength="6" type="text" style="text-align:center; font-size:22px; font-weight:700; letter-spacing:8px; padding:10px">
          </div>

          <div style="display:flex; gap:8px">
            <button type="button" class="btn btn-ghost" id="btn-resend-inline-otp" onclick="Rooms.triggerMobileVerify('assign')" style="display:none; flex:1">🔁 Resend Code</button>
            <button type="button" class="btn btn-success" id="btn-confirm-inline-otp" onclick="Rooms.verifyInlineOtp('assign')" style="flex:2">✅ Verify &amp; Unlock Registration</button>
          </div>
        </div>
      </div>

      <!-- Document Upload -->
      <div id="doc-upload-container"></div>

      <div class="form-row mt-8">
        <div class="form-group">
          <label class="form-label">Rent (${prop.currency}/mo) *</label>
          <input class="form-input" id="inp-t-rent" type="number" value="${bed?.price || prop.defaultBedPrice}">
        </div>
        <div class="form-group">
          <label class="form-label">Security Deposit</label>
          <input class="form-input" id="inp-t-deposit" type="number" value="${(bed?.price || prop.defaultBedPrice) * 2}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Move-in Date</label>
        <input class="form-input" id="inp-t-movein" type="date" value="${formatDate(new Date())}">
      </div>

      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" id="btn-assign-tenant-submit" onclick="Rooms.assignTenant('${bedId}')" disabled style="opacity:0.55; cursor:not-allowed">
          🔒 Verify Mobile to Assign
        </button>
      </div>
    `);

    document.getElementById('inp-t-name').focus();
    DocUploadManager.reset();
    DocUploadManager.renderUI();
  },

  triggerMobileVerify(context = 'assign') {
    const phoneInput = document.getElementById(context === 'replace' ? 'inp-rt-phone' : 'inp-t-phone');
    const rawPhone = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';

    if (!rawPhone || rawPhone.length !== 10) {
      SoundFX.error();
      return showToast('📱 Please enter a valid 10-digit mobile number', 'error');
    }

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    MobileVerification._currentOTP = otp;
    MobileVerification._currentPhone = rawPhone;

    // Send via WhatsApp
    const message = `🏠 Angel's PG Management - Tenant Verification\n\nYour verification code is: ${otp}\n\nPlease share this code with your PG owner to complete registration.`;
    const whatsappUrl = `https://wa.me/91${rawPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');

    // UI Updates inside the modal
    const inlineContainer = document.getElementById('inline-otp-container');
    const targetDisplay = document.getElementById('target-phone-display');
    const sendBtn = document.getElementById('btn-kyc-mobile');
    const otpInput = document.getElementById('inp-otp-code');
    const countdownEl = document.getElementById('otp-countdown');
    const timerDisplay = document.getElementById('otp-timer-display');
    const resendBtn = document.getElementById('btn-resend-inline-otp');

    if (targetDisplay) targetDisplay.textContent = rawPhone;
    if (inlineContainer) inlineContainer.style.display = 'block';
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = '0.6';
      sendBtn.innerHTML = `<span>⏳</span> <span>Code Sent via WhatsApp (+91 ${rawPhone})</span>`;
    }

    if (phoneInput) phoneInput.disabled = true;

    // Start 60s cooldown timer
    if (MobileVerification._timerInterval) clearInterval(MobileVerification._timerInterval);
    let secondsLeft = 60;
    if (countdownEl) countdownEl.textContent = secondsLeft;
    if (timerDisplay) timerDisplay.style.display = 'block';
    if (resendBtn) resendBtn.style.display = 'none';

    MobileVerification._timerInterval = setInterval(() => {
      secondsLeft--;
      if (countdownEl) countdownEl.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(MobileVerification._timerInterval);
        if (timerDisplay) timerDisplay.style.display = 'none';
        if (resendBtn) resendBtn.style.display = 'block';
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.style.opacity = '1';
        }
        if (phoneInput) phoneInput.disabled = false;
      }
    }, 1000);

    if (otpInput) {
      otpInput.value = '';
      setTimeout(() => otpInput.focus(), 300);
    }

    SoundFX.toast('info');
    showToast(`📲 Verification code sent to +91 ${rawPhone} on WhatsApp!`, 'success');
  },

  verifyInlineOtp(context = 'assign') {
    const otpInput = document.getElementById('inp-otp-code');
    const enteredOtp = otpInput ? otpInput.value.trim() : '';
    const phoneInput = document.getElementById(context === 'replace' ? 'inp-rt-phone' : 'inp-t-phone');
    const rawPhone = MobileVerification._currentPhone || (phoneInput ? phoneInput.value.replace(/\D/g, '') : '');

    if (!MobileVerification._currentOTP) {
      SoundFX.error();
      return showToast('Please click "Send Verification Code on WhatsApp" first', 'error');
    }

    if (!enteredOtp || enteredOtp.length !== 6) {
      SoundFX.error();
      return showToast('Please enter the full 6-digit verification code', 'error');
    }

    if (enteredOtp !== MobileVerification._currentOTP) {
      SoundFX.error();
      if (otpInput) {
        otpInput.value = '';
        otpInput.focus();
      }
      return showToast('❌ Invalid code! Please check WhatsApp and try again.', 'error');
    }

    // Success! Verified
    if (MobileVerification._timerInterval) clearInterval(MobileVerification._timerInterval);

    const kycData = {
      method: 'MOBILE_OTP',
      phone: `91${rawPhone}`,
      maskedPhone: `XXXXXX${rawPhone.slice(-4)}`,
      verified: true,
      verifiedAt: new Date().toISOString()
    };

    TenantKYC.setData(kycData);

    // Update Modal UI
    const badge = document.getElementById('aadhaar-status-badge');
    if (badge) {
      badge.className = 'badge green';
      badge.innerHTML = `✅ Mobile Verified (+91 ${rawPhone})`;
    }

    const helpText = document.getElementById('aadhaar-help-text');
    if (helpText) {
      helpText.className = 'color-green fs-12 mb-8';
      helpText.innerHTML = `✅ Tenant mobile number +91 ${rawPhone} successfully verified via WhatsApp!`;
    }

    const inlineContainer = document.getElementById('inline-otp-container');
    if (inlineContainer) {
      inlineContainer.innerHTML = `
        <div style="background:var(--accent-green-light); border:1px solid rgba(34,197,94,0.3); border-radius:var(--radius-md); padding:10px; text-align:center; color:var(--accent-green-dark); font-weight:700; font-size:13px">
          🎉 WhatsApp Mobile Verification Complete! You can now register this tenant.
        </div>
      `;
    }

    const sendBtn = document.getElementById('btn-kyc-mobile');
    if (sendBtn) {
      sendBtn.className = 'btn btn-success btn-full';
      sendBtn.innerHTML = `<span>✅</span> <span>Mobile Verified ✓</span>`;
      sendBtn.disabled = true;
    }

    // Unlock Assign/Replace button
    const assignBtn = document.getElementById('btn-assign-tenant-submit');
    if (assignBtn) {
      assignBtn.disabled = false;
      assignBtn.style.opacity = '1';
      assignBtn.style.cursor = 'pointer';
      assignBtn.className = 'btn btn-success btn-full';
      assignBtn.textContent = context === 'replace' ? '✅ Register & Replace Tenant' : '✅ Register Tenant';
    }

    SoundFX.success();
    showToast('✅ Mobile number verified! Registration is now unlocked.', 'success');
  },

  async assignTenant(bedId) {
    const name = document.getElementById('inp-t-name').value.trim();
    const phone = document.getElementById('inp-t-phone').value.trim();
    const rent = parseFloat(document.getElementById('inp-t-rent').value) || 0;
    const deposit = parseFloat(document.getElementById('inp-t-deposit').value) || 0;
    const moveInDate = document.getElementById('inp-t-movein').value;

    if (!name) return showToast('Enter tenant name', 'error');
    if (!phone || phone.length < 10) return showToast('Enter valid phone number', 'error');

    // Strict Verification Gate (Mobile OTP)
    if (!TenantKYC.isVerified()) {
      SoundFX.error();
      return showToast('⚠️ Please verify tenant mobile number via WhatsApp OTP first', 'error');
    }

    const kyc = TenantKYC.getData();

    // Save images to IndexedDB if uploaded
    let docIds = [];
    if (DocUploadManager.currentDocs.front || DocUploadManager.currentDocs.back) {
      const savedDocs = await DocUploadManager.saveAllToDB();
      docIds = savedDocs.map(d => d.id);
    }

    const tenant = { 
      id: generateId('t'),
      bedId,
      name,
      phone, 
      idProof: `Mobile: +91 ${phone} (WhatsApp OTP Verified ✅)`,
      mobileVerified: true,
      mobileVerifiedPhone: kyc.phone,
      mobileVerifiedAt: kyc.verifiedAt,
      docs: docIds, 
      rent,
      deposit,
      moveInDate,
      active: true 
    };

    DB.addTenant(tenant);
    closeModal();
    this.render();
    SoundFX.success();
    showToast(`✅ ${name} verified (Mobile OTP) & assigned!`, 'success');
    if (App.currentTab === 'dashboard') Dashboard.render();
  },

  // ── REPLACE TENANT WITH MOBILE OTP VERIFICATION ──────────────
  showReplaceTenantModal(bedId, oldTenantId) {
    const prop = DB.getProperty();
    const bed = DB.getBeds().find(b => b.id === bedId);
    TenantKYC.reset();

    showModal('🔄 Replace Tenant', `
      <div class="alert-item warning mb-12">⚠️ <span>Old tenant will be marked as moved out. History is preserved.</span></div>
      <div class="form-group">
        <label class="form-label">New Tenant Name *</label>
        <input class="form-input" id="inp-rt-name" placeholder="Full Name">
      </div>
      <div class="form-group">
        <label class="form-label">Country & Mobile Number *</label>
        <div style="display:flex; align-items:center; gap:8px">
          <span style="background:var(--bg-card); border:1.5px solid var(--border); border-radius:var(--radius-md); padding:11px 12px; font-weight:700; font-size:14px; color:var(--text-primary); white-space:nowrap">🇮🇳 +91</span>
          <input class="form-input" id="inp-rt-phone" placeholder="10-digit number" type="tel" maxlength="10" style="flex:1">
        </div>
      </div>

      <!-- Mobile OTP Verification Section -->
      <div class="card" style="margin-bottom:16px; background:var(--bg-input); border:1.5px solid var(--border); padding:14px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px">
          <label class="form-label" style="margin-bottom:0">📱 WhatsApp Mobile Verification *</label>
          <span id="aadhaar-status-badge" class="badge amber" style="font-size:11px">⚠️ Verification Required</span>
        </div>

        <div class="color-secondary fs-12 mb-8" id="aadhaar-help-text">
          Country code is preset to <strong>+91 (India only)</strong>. Verification code will be sent to the tenant via WhatsApp.
        </div>

        <div id="kyc-buttons-row">
          <button type="button" class="btn btn-whatsapp btn-full" id="btn-kyc-mobile" onclick="Rooms.triggerMobileVerify('replace')" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:12px">
            <span>📲</span> <span>Send Verification Code on WhatsApp</span>
          </button>
        </div>

        <!-- Inline OTP Entry (shown after code sent) -->
        <div id="inline-otp-container" style="display:none; margin-top:14px; padding-top:14px; border-top:1px dashed var(--border)">
          <div style="text-align:center; margin-bottom:10px">
            <span class="badge green" style="font-size:11px" id="otp-sent-banner">✅ Code sent via WhatsApp to +91 <span id="target-phone-display"></span></span>
            <div class="color-secondary fs-12 mt-4" id="otp-timer-display">Resend available in: <strong id="otp-countdown">60</strong>s</div>
          </div>

          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label" style="text-align:center">Enter 6-Digit WhatsApp Code *</label>
            <input class="form-input" id="inp-otp-code" placeholder="• • • • • •" maxlength="6" type="text" style="text-align:center; font-size:22px; font-weight:700; letter-spacing:8px; padding:10px">
          </div>

          <div style="display:flex; gap:8px">
            <button type="button" class="btn btn-ghost" id="btn-resend-inline-otp" onclick="Rooms.triggerMobileVerify('replace')" style="display:none; flex:1">🔁 Resend Code</button>
            <button type="button" class="btn btn-success" id="btn-confirm-inline-otp" onclick="Rooms.verifyInlineOtp('replace')" style="flex:2">✅ Verify &amp; Unlock Registration</button>
          </div>
        </div>
      </div>

      <div id="doc-upload-container"></div>
      
      <div class="form-row mt-8">
        <div class="form-group">
          <label class="form-label">Rent (${prop.currency}/mo)</label>
          <input class="form-input" id="inp-rt-rent" type="number" value="${bed?.price || prop.defaultBedPrice}">
        </div>
        <div class="form-group">
          <label class="form-label">Deposit</label>
          <input class="form-input" id="inp-rt-deposit" type="number" value="${(bed?.price || prop.defaultBedPrice) * 2}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Move-in Date</label>
        <input class="form-input" id="inp-rt-movein" type="date" value="${formatDate(new Date())}">
      </div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" id="btn-assign-tenant-submit" onclick="Rooms.replaceTenant('${oldTenantId}')" disabled style="opacity:0.55; cursor:not-allowed">
          🔒 Verify Mobile to Replace
        </button>
      </div>
    `);

    document.getElementById('inp-rt-name').focus();
    DocUploadManager.reset();
    DocUploadManager.renderUI();
  },

  async replaceTenant(oldId) {
    const name = document.getElementById('inp-rt-name').value.trim();
    const phone = document.getElementById('inp-rt-phone').value.trim();
    const rent = parseFloat(document.getElementById('inp-rt-rent').value) || 0;
    const deposit = parseFloat(document.getElementById('inp-rt-deposit').value) || 0;
    const moveInDate = document.getElementById('inp-rt-movein').value;

    if (!name || !phone) return showToast('Fill required fields', 'error');

    // Strict Verification Gate (Mobile OTP)
    if (!TenantKYC.isVerified()) {
      SoundFX.error();
      return showToast('⚠️ Please verify tenant mobile number via WhatsApp OTP first', 'error');
    }

    const kyc = TenantKYC.getData();

    // Save images to IndexedDB if uploaded
    let docIds = [];
    if (DocUploadManager.currentDocs.front || DocUploadManager.currentDocs.back) {
      const savedDocs = await DocUploadManager.saveAllToDB();
      docIds = savedDocs.map(d => d.id);
    }

    const newTenant = { 
      id: generateId('t'),
      bedId: '',
      name,
      phone, 
      idProof: `Mobile: +91 ${phone} (WhatsApp OTP Verified ✅)`,
      mobileVerified: true,
      mobileVerifiedPhone: kyc.phone,
      mobileVerifiedAt: kyc.verifiedAt,
      docs: docIds, 
      rent,
      deposit,
      moveInDate,
      active: true 
    };

    DB.replaceTenant(oldId, newTenant);
    closeModal();
    this.render();
    SoundFX.success();
    showToast(`✅ Tenant replaced with verified mobile OTP!`, 'success');
  },

  vacateBed(bedId, tenantId) {
    if (!confirm('Mark tenant as moved out?')) return;
    DB.deleteTenant(tenantId);
    closeModal();
    this.render();
    showToast('🚪 Bed vacated', 'info');
  },

  showEditBedModal(bedId) {
    const bed = DB.getBeds().find(b => b.id === bedId);
    const prop = DB.getProperty();
    showModal('✏️ Edit Bed', `
      <div class="form-group"><label class="form-label">Bed Number/Label</label>
        <input class="form-input" id="inp-eb-num" value="${bed.number}"></div>
      <div class="form-group"><label class="form-label">Price (${prop.currency}/month)</label>
        <input class="form-input" id="inp-eb-price" type="number" value="${bed.price}"></div>
      <div class="form-actions">
        <button class="btn btn-ghost btn-full" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary btn-full" onclick="Rooms.saveBedEdit('${bedId}')">Save</button>
      </div>
    `);
  },

  saveBedEdit(bedId) {
    const number = document.getElementById('inp-eb-num').value.trim();
    const price = parseFloat(document.getElementById('inp-eb-price').value) || 0;
    DB.updateBed(bedId, { number, price });
    closeModal();
    this.render();
    showToast('✅ Bed updated!', 'success');
  },

  deleteBedConfirm(bedId) {
    if (!confirm('Delete this bed?')) return;
    DB.deleteBed(bedId);
    closeModal();
    this.render();
    showToast('🗑️ Bed deleted', 'info');
  },
};
