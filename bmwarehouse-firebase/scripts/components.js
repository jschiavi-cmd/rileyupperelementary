// /scripts/components.js

/**
 * Render top bar / app bar
 * @param {Object} options - { school, user, claims, onMenu }
 * @returns {string} HTML string
 */
export function renderTopBar({ school, user, claims, onMenu }) {
  const roles = claims?.roles || [];
  const displayName = user?.displayName || user?.email || 'User';
  
  return `
    <div class="top-bar">
      ${school?.logoURL ? `<img src="${school.logoURL}" alt="${school.name}" class="top-bar__logo">` : ''}
      <h1 class="top-bar__title">${school?.name || 'BMWarehouse'}</h1>
      <div class="top-bar__actions">
        ${roles.map(role => renderRolePill(role)).join('')}
        <button class="btn btn--icon" onclick="(${onMenu || (() => {})})()" aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/**
 * Render role pill badge
 * @param {string} role 
 * @returns {string} HTML string
 */
export function renderRolePill(role) {
  const roleColors = {
    admin: 'error',
    teacher: 'primary',
    specials: 'secondary',
    achievement: 'info',
    parent: 'success'
  };
  
  const colorClass = roleColors[role] || '';
  const displayRole = role.charAt(0).toUpperCase() + role.slice(1);
  
  return `<span class="chip chip--${colorClass}">${displayRole}</span>`;
}

/**
 * Render week picker component
 * @param {Object} options - { date, onChange }
 * @returns {string} HTML string
 */
export function renderWeekPicker({ date, onChange }) {
  const currentDate = date || new Date();
  const dateStr = currentDate.toISOString().split('T')[0];
  
  // Calculate week boundaries
  const dayOfWeek = currentDate.getDay();
  const sunday = new Date(currentDate);
  sunday.setDate(currentDate.getDate() - dayOfWeek);
  
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  
  const formatDate = (d) => {
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    return `${month} ${day}`;
  };
  
  const weekLabel = `${formatDate(sunday)} - ${formatDate(saturday)}`;
  
  const changeId = `week-change-${Date.now()}`;
  
  // Store callback in global registry
  if (!window.__weekPickerCallbacks) {
    window.__weekPickerCallbacks = {};
  }
  window.__weekPickerCallbacks[changeId] = onChange;
  
  return `
    <div class="d-flex align-center gap-md" style="padding: var(--space-md); background: var(--color-surface-variant); border-radius: var(--radius-md);">
      <button 
        class="btn btn--icon" 
        onclick="window.__weekPickerCallbacks['${changeId}'](new Date('${dateStr}').setDate(new Date('${dateStr}').getDate() - 7))"
        aria-label="Previous week"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
      </button>
      
      <div class="text-center" style="min-width: 200px;">
        <div style="font-weight: var(--font-weight-semibold);">${weekLabel}</div>
        <div style="font-size: var(--font-size-sm); color: var(--color-on-surface-variant);">
          Week of ${currentDate.getFullYear()}
        </div>
      </div>
      
      <button 
        class="btn btn--icon" 
        onclick="window.__weekPickerCallbacks['${changeId}'](new Date('${dateStr}').setDate(new Date('${dateStr}').getDate() + 7))"
        aria-label="Next week"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </button>
      
      <button 
        class="btn btn--outline" 
        onclick="window.__weekPickerCallbacks['${changeId}'](new Date())"
      >
        Today
      </button>
    </div>
  `;
}

/**
 * Render matrix grid for scoring
 * @param {Object} options - { plan, dayData, onCell, onLongPress }
 * @returns {string} HTML string
 */
export function renderMatrixGrid({ plan, dayData, onCell, onLongPress }) {
  if (!plan || !plan.schedule || !plan.goals) {
    return '<div class="card"><p>No plan data available</p></div>';
  }
  
  const matrix = dayData?.matrix || {};
  const cellId = `cell-${Date.now()}`;
  
  // Store callbacks
  if (!window.__matrixCallbacks) {
    window.__matrixCallbacks = {};
  }
  window.__matrixCallbacks[cellId] = { onCell, onLongPress };
  
  let html = '<div class="matrix-grid">';
  
  // Header row
  html += '<div class="matrix-row" style="background: var(--color-surface-elevated); font-weight: var(--font-weight-semibold);">';
  html += '<div class="matrix-label">Period</div>';
  
  for (const goal of plan.goals) {
    html += `<div class="matrix-label text-center">${goal.label}</div>`;
  }
  html += '</div>';
  
  // Data rows
  for (const period of plan.schedule) {
    html += `<div class="matrix-row">`;
    html += `<div class="matrix-label">${period.label} ${period.am ? 'AM' : 'PM'}</div>`;
    
    const periodData = matrix[period.id] || {};
    
    for (const goal of plan.goals) {
      const value = periodData[goal.id];
      const cellKey = `${period.id}-${goal.id}`;
      
      if (goal.kind === 'stepper') {
        const displayValue = value !== undefined && value !== null ? value : '-';
        html += `
          <div style="display: flex; justify-content: center;">
            ${renderScoreStepper(value, (newValue) => {
              if (onCell) onCell(period.id, goal.id, newValue);
            }, cellKey)}
          </div>
        `;
      } else if (goal.kind === 'checkbox') {
        html += `
          <div style="display: flex; justify-content: center;">
            ${renderCheckPill(!!value, (newValue) => {
              if (onCell) onCell(period.id, goal.id, newValue);
            }, cellKey)}
          </div>
        `;
      }
    }
    
    html += '</div>';
  }
  
  html += '</div>';
  
  return html;
}

/**
 * Render score stepper (0, 1, 2)
 * @param {number} value - Current value
 * @param {Function} onChange - Callback
 * @param {string} key - Unique key
 * @returns {string} HTML string
 */
export function renderScoreStepper(value, onChange, key = '') {
  const currentValue = value !== undefined && value !== null ? value : 0;
  const callbackId = `stepper-${key}-${Date.now()}`;
  
  if (!window.__stepperCallbacks) {
    window.__stepperCallbacks = {};
  }
  window.__stepperCallbacks[callbackId] = onChange;
  
  return `
    <div 
      class="score-stepper" 
      data-value="${currentValue}"
      onclick="
        const current = parseInt(this.getAttribute('data-value'));
        const next = (current + 1) % 3;
        this.setAttribute('data-value', next);
        if (window.__stepperCallbacks['${callbackId}']) {
          window.__stepperCallbacks['${callbackId}'](next);
        }
        if (navigator.vibrate) navigator.vibrate(10);
      "
      role="button"
      tabindex="0"
      aria-label="Score stepper, current value ${currentValue}"
      onkeydown="
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.click();
        }
      "
    >
      ${currentValue === 0 ? '-' : currentValue}
    </div>
  `;
}

/**
 * Render checkbox pill
 * @param {boolean} checked - Current state
 * @param {Function} onChange - Callback
 * @param {string} key - Unique key
 * @returns {string} HTML string
 */
export function renderCheckPill(checked, onChange, key = '') {
  const callbackId = `check-${key}-${Date.now()}`;
  
  if (!window.__checkCallbacks) {
    window.__checkCallbacks = {};
  }
  window.__checkCallbacks[callbackId] = onChange;
  
  return `
    <div 
      class="check-pill" 
      data-checked="${checked}"
      onclick="
        const current = this.getAttribute('data-checked') === 'true';
        const next = !current;
        this.setAttribute('data-checked', next);
        if (window.__checkCallbacks['${callbackId}']) {
          window.__checkCallbacks['${callbackId}'](next);
        }
        if (navigator.vibrate) navigator.vibrate(10);
      "
      role="checkbox"
      tabindex="0"
      aria-checked="${checked}"
      aria-label="Checkbox"
      onkeydown="
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.click();
        }
      "
    >
      ${checked ? `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      ` : `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="2" opacity="0.3"/>
        </svg>
      `}
    </div>
  `;
}

/**
 * Render comment drawer/modal
 * @param {Object} options - { value, onSave, onClose }
 * @returns {string} HTML string
 */
export function renderCommentDrawer({ value, onSave, onClose }) {
  const drawerId = `drawer-${Date.now()}`;
  const textareaId = `comment-textarea-${Date.now()}`;
  
  if (!window.__drawerCallbacks) {
    window.__drawerCallbacks = {};
  }
  window.__drawerCallbacks[drawerId] = { onSave, onClose };
  
  return `
    <div class="drawer-backdrop active" onclick="
      if (window.__drawerCallbacks['${drawerId}']?.onClose) {
        window.__drawerCallbacks['${drawerId}'].onClose();
      }
    "></div>
    <div class="drawer active">
      <div class="drawer__handle"></div>
      <div class="drawer__header">
        <h3 class="drawer__title">Add Comment</h3>
        <button class="btn btn--icon" onclick="
          if (window.__drawerCallbacks['${drawerId}']?.onClose) {
            window.__drawerCallbacks['${drawerId}'].onClose();
          }
        " aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="drawer__body">
        <textarea 
          id="${textareaId}"
          class="form-textarea" 
          placeholder="Enter your comment..."
          rows="5"
        >${value || ''}</textarea>
      </div>
      <div class="drawer__footer">
        <button class="btn btn--text" onclick="
          if (window.__drawerCallbacks['${drawerId}']?.onClose) {
            window.__drawerCallbacks['${drawerId}'].onClose();
          }
        ">Cancel</button>
        <button class="btn btn--primary" onclick="
          const textarea = document.getElementById('${textareaId}');
          if (window.__drawerCallbacks['${drawerId}']?.onSave) {
            window.__drawerCallbacks['${drawerId}'].onSave(textarea.value);
          }
        ">Save</button>
      </div>
    </div>
  `;
}

/**
 * Render incident chip (for custom buttons)
 * @param {Object} options - { label, colorHex, onTap, onHold }
 * @returns {string} HTML string
 */
export function renderIncidentChip({ label, colorHex, onTap, onHold }) {
  const chipId = `incident-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  if (!window.__incidentCallbacks) {
    window.__incidentCallbacks = {};
  }
  window.__incidentCallbacks[chipId] = { onTap, onHold };
  
  return `
    <button 
      class="chip chip--clickable"
      style="background-color: ${colorHex}; color: #FFFFFF; border-color: ${colorHex};"
      onclick="
        if (window.__incidentCallbacks['${chipId}']?.onTap) {
          window.__incidentCallbacks['${chipId}'].onTap();
          this.style.animation = 'pulse 0.3s ease-out';
          setTimeout(() => { this.style.animation = ''; }, 300);
        }
        if (navigator.vibrate) navigator.vibrate(15);
      "
      oncontextmenu="
        event.preventDefault();
        if (window.__incidentCallbacks['${chipId}']?.onHold) {
          window.__incidentCallbacks['${chipId}'].onHold();
        }
        if (navigator.vibrate) navigator.vibrate(50);
      "
      ontouchstart="
        this.__holdTimer = setTimeout(() => {
          if (window.__incidentCallbacks['${chipId}']?.onHold) {
            window.__incidentCallbacks['${chipId}'].onHold();
          }
          if (navigator.vibrate) navigator.vibrate(50);
        }, 500);
      "
      ontouchend="
        if (this.__holdTimer) clearTimeout(this.__holdTimer);
      "
      ontouchcancel="
        if (this.__holdTimer) clearTimeout(this.__holdTimer);
      "
    >
      ${label}
    </button>
  `;
}

/**
 * Show toast notification
 * @param {string} message 
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {number} duration - milliseconds (default 3000)
 */
export function toast(message, type = 'info', duration = 3000) {
  // Create container if it doesn't exist
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  
  // Create toast element
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast--${type}`;
  
  const icon = {
    success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    error: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
    warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
    info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
  };
  
  toastEl.innerHTML = `
    ${icon[type] || icon.info}
    <span>${message}</span>
  `;
  
  container.appendChild(toastEl);
  
  // Auto-remove after duration
  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(20px)';
    setTimeout(() => {
      toastEl.remove();
      // Remove container if empty
      if (container.children.length === 0) {
        container.remove();
      }
    }, 180);
  }, duration);
}

/**
 * Render loading skeleton
 * @param {string} type - 'text', 'card', or custom height
 * @returns {string} HTML string
 */
export function renderSkeleton(type = 'text') {
  if (type === 'text') {
    return '<div class="skeleton skeleton--text"></div>';
  } else if (type === 'card') {
    return '<div class="skeleton skeleton--card"></div>';
  } else {
    return `<div class="skeleton" style="height: ${type};"></div>`;
  }
}

/**
 * Render student card for list views
 * @param {Object} student - Student data
 * @param {Function} onClick - Click handler
 * @returns {string} HTML string
 */
export function renderStudentCard(student, onClick) {
  const clickId = `student-${student.id}-${Date.now()}`;
  
  if (!window.__studentCardCallbacks) {
    window.__studentCardCallbacks = {};
  }
  window.__studentCardCallbacks[clickId] = onClick;
  
  return `
    <div 
      class="card" 
      style="cursor: pointer;" 
      onclick="if (window.__studentCardCallbacks['${clickId}']) window.__studentCardCallbacks['${clickId}']()"
      role="button"
      tabindex="0"
      onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }"
    >
      <div class="card__header">
        <div>
          <h3 class="card__title">${student.name}</h3>
          <p class="card__subtitle">Grade ${student.grade} • ${student.teacherId || 'No teacher'}</p>
        </div>
        ${student.plan ? `
          <div class="chip chip--primary">Active Plan</div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render theme selector
 * @param {string} currentTheme - 'dark', 'light', or 'custom'
 * @param {Function} onChange - Callback
 * @returns {string} HTML string
 */
export function renderThemeSelector(currentTheme, onChange) {
  const selectId = `theme-select-${Date.now()}`;
  
  if (!window.__themeCallbacks) {
    window.__themeCallbacks = {};
  }
  window.__themeCallbacks[selectId] = onChange;
  
  return `
    <div class="form-group">
      <label class="form-label" for="${selectId}">Theme</label>
      <select 
        id="${selectId}"
        class="form-select" 
        onchange="if (window.__themeCallbacks['${selectId}']) window.__themeCallbacks['${selectId}'](this.value)"
      >
        <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Dark</option>
        <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Light</option>
        <option value="custom" ${currentTheme === 'custom' ? 'selected' : ''}>Custom</option>
      </select>
    </div>
  `;
}

// Add pulse animation for incident chips
if (!document.getElementById('component-styles')) {
  const style = document.createElement('style');
  style.id = 'component-styles';
  style.textContent = `
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
  `;
  document.head.appendChild(style);
}