# 🔒 LOCKED PRODUCTION FEATURE: DIGITAL BUSINESS CARD

**Status:** PERMANENTLY FROZEN & PROTECTED  
**Date Locked:** 2026-10-24  
**Applies To:**  
- `rudra-pg-manager/business-card.js` & `data.js`
- `vivantha-pg-manager/business-card.js` & `data.js`
- `angel-pg-manager/business-card.js` & `data.js`

---

## ⚠️ STRICT RULE FOR ALL FUTURE SESSIONS & AGENTS
**DO NOT MODIFY OR REFACTOR THE BUSINESS CARD MODULE UNDER ANY CIRCUMSTANCES.**  
When modifying other features (rooms, rent, tenants, backup, settings, etc.), **NEVER touch or regress `business-card.js` or the branding/logo base64 logic in `data.js`**.

---

## 🌟 VERIFIED & FUNCTIONAL SPECIFICATIONS
1. **Full Preview Modal (`viewFullCardModal`):**
   - Renders 1:1 crisp card preview with the actual official PG logo.
   - Includes working action buttons:
     - 📥 **Download Image** (`BusinessCard.downloadCardImage()`)
     - 📲 **Share on WhatsApp** (`BusinessCard.shareOnWhatsApp()`)
     - ✕ **Close Preview** (`closeModal()`)
   - Fully phone and desktop compatible, no "Unable to render full preview" errors.

2. **Download Image (`downloadCardImage`):**
   - Exports high-DPI 1200×720 PNG (`<PG_Name>-Business-Card.png`).
   - Zero canvas tainting under `file:///` and HTTP origins because all default logos are embedded as clean Base64 Data URLs.
   - Direct browser download triggered with success toast and audio feedback.

3. **WhatsApp Sharing (`shareOnWhatsApp`):**
   - Web Share API Level 2 file sharing on mobile devices (attaches PNG file + business text in WhatsApp chat).
   - Desktop fallback: downloads PNG image, opens WhatsApp Web with pre-filled message, and provides an interactive modal if popup blocker intercepts.
   - Redundant `[👥]` button beside "Share on WhatsApp" permanently removed.

---

## 🛡️ GOLDEN BACKUP DIRECTORY
If any file is accidentally altered or regressed, restore immediately from:
`C:\Users\jeeva\.gemini\antigravity\scratch\_business_card_backup_locked\`
