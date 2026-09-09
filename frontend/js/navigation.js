/**
 * Navigation — view switching, app/auth layout toggling, and nav guards.
 *
 * Exports:
 *   switchAppView(view)  — toggle between 'dashboard', 'assessment', 'superadmin'
 *   showApp()            — reveal the main app layout after login
 *   showAuth()           — reveal the auth/login layout
 *   initNavigation(deps) — wire up navigation event listeners
 */

import { safeT } from './utils.js';

// --- DOM references (cached once) ---
const authLayout = document.getElementById('auth-layout');
const appLayout = document.getElementById('app-layout');
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const assessmentView = document.getElementById('form-view');
const superadminView = document.getElementById('user-management-view');
const navToggleBtn = document.getElementById('nav-toggle-btn');

// These will be injected via initNavigation()
let _getCurrentUser = null;
let _getIsFormDirty = null;
let _renderDashboard = null;
let _renderSuperAdminDashboard = null;
let _logout = null;
let _setShowDraftsOnly = null;
let _successModal = null;

export function switchAppView(view) {
    dashboardView.classList.add('hidden');
    dashboardView.classList.remove('active');
    assessmentView.classList.add('hidden');
    assessmentView.classList.remove('active');
    if (superadminView) {
        superadminView.classList.add('hidden');
        superadminView.classList.remove('active');
    }

    if (view === 'dashboard') {
        // BUG-23: Reset draft filter when returning to dashboard
        if (_setShowDraftsOnly) _setShowDraftsOnly(false);
        const draftsBtn = document.getElementById('btn-view-drafts');
        if (draftsBtn) {
            draftsBtn.textContent = safeT('view_drafts', 'View Unfinished Forms');
            draftsBtn.classList.replace('btn-secondary', 'btn-outline');
        }
        const recordsTitle = document.getElementById('records-card-title');
        if (recordsTitle) recordsTitle.textContent = safeT('assessment_records', 'Assessment Records');

        dashboardView.classList.remove('hidden');
        dashboardView.classList.add('active');
        if (_renderDashboard) _renderDashboard();
    } else if (view === 'superadmin') {
        if (superadminView) {
            superadminView.classList.remove('hidden');
            superadminView.classList.add('active');
            if (_renderSuperAdminDashboard) _renderSuperAdminDashboard();
        }
    } else {
        assessmentView.classList.remove('hidden');
        assessmentView.classList.add('active');
    }
}

export function showApp() {
    const currentUser = _getCurrentUser();

    authLayout.classList.remove('active');
    authLayout.classList.add('hidden');
    appLayout.classList.remove('hidden');
    appLayout.classList.add('active');
    document.getElementById('current-user-name').textContent = currentUser.email.split('@')[0] || currentUser.email;

    // Show nav toggle for State Admin and District Admin
    if (['State Admin', 'District Admin'].includes(currentUser.role)) {
        if (navToggleBtn) navToggleBtn.classList.remove('hidden');
    } else {
        if (navToggleBtn) navToggleBtn.classList.add('hidden');
    }

    // Hide "New Assessment" button for non-GP Users
    const btnNewFormEl = document.getElementById('btn-new-form');
    if (btnNewFormEl) {
        if (currentUser.role === 'GP User') {
            btnNewFormEl.classList.remove('hidden');
        } else {
            btnNewFormEl.classList.add('hidden');
        }
    }

    // Hide "View Drafts" button for non-GP Users (admins don't create drafts)
    const viewDraftsBtnEl = document.getElementById('btn-view-drafts');
    if (viewDraftsBtnEl) {
        if (currentUser.role === 'GP User') {
            viewDraftsBtnEl.classList.remove('hidden');
        } else {
            viewDraftsBtnEl.classList.add('hidden');
        }
    }

    if (currentUser.role === 'SuperAdmin' || currentUser.role === 'Super Admin') {
        switchAppView('superadmin');
        if (navToggleBtn) {
            navToggleBtn.setAttribute('data-i18n', 'dashboard');
            navToggleBtn.textContent = window.t ? window.t('dashboard') : 'Dashboard';
        }
    } else {
        switchAppView('dashboard');
        if (navToggleBtn) {
            navToggleBtn.setAttribute('data-i18n', 'manage_users');
            navToggleBtn.textContent = window.t ? window.t('manage_users') : 'Manage Users';
        }
    }
}

export function showAuth() {
    appLayout.classList.remove('active');
    appLayout.classList.add('hidden');
    authLayout.classList.remove('hidden');
    authLayout.classList.add('active');
    loginView.classList.remove('hidden');
    loginView.classList.add('active');
    document.getElementById('register-view').classList.add('hidden');
    document.getElementById('register-view').classList.remove('active');
    
    const forgotPasswordView = document.getElementById('forgot-password-view');
    if (forgotPasswordView) {
        forgotPasswordView.classList.add('hidden');
        forgotPasswordView.classList.remove('active');
    }

    // Reset OTP flow to step 1 if it was in progress
    if (window._resetOtpFlow) window._resetOtpFlow();
}

/**
 * Wire up all navigation-related event listeners.
 *
 * @param {Object} deps — injected dependencies to avoid circular imports
 * @param {Function} deps.getCurrentUser
 * @param {Function} deps.getIsFormDirty
 * @param {Function} deps.renderDashboard
 * @param {Function} deps.renderSuperAdminDashboard
 * @param {Function} deps.logout
 * @param {Function} deps.setShowDraftsOnly
 * @param {HTMLElement} deps.successModal
 */
export function initNavigation(deps) {
    _getCurrentUser = deps.getCurrentUser;
    _getIsFormDirty = deps.getIsFormDirty;
    _renderDashboard = deps.renderDashboard;
    _renderSuperAdminDashboard = deps.renderSuperAdminDashboard;
    _logout = deps.logout;
    _setShowDraftsOnly = deps.setShowDraftsOnly;
    _successModal = deps.successModal;

    // Back to dashboard
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        if (_getIsFormDirty()) {
            if (!confirm('You have unsaved changes. Are you sure you want to leave? Your filled data may be lost.')) return;
        }
        switchAppView('dashboard');
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        if (_getIsFormDirty()) {
            if (!confirm('You have unsaved changes. Are you sure you want to logout? Your filled data may be lost.')) return;
        }
        _logout();
    });

    // Success modal close
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        _successModal.classList.add('hidden');
        switchAppView('dashboard');
    });

    // Unsaved changes guard
    window.addEventListener('beforeunload', (e) => {
        if (_getIsFormDirty()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Language change → re-render dashboard
    document.addEventListener('languageChanged', () => {
        if (!dashboardView.classList.contains('hidden')) {
            _renderDashboard();
        }
    });

    // Auth view toggle: Login ↔ Register
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.add('hidden');
        loginView.classList.remove('active');
        document.getElementById('register-view').classList.remove('hidden');
        document.getElementById('register-view').classList.add('active');
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('register-view').classList.remove('active');
        loginView.classList.remove('hidden');
        loginView.classList.add('active');
    });

    // Auth view toggle: Forgot Password
    const forgotPasswordView = document.getElementById('forgot-password-view');
    const showForgotBtn = document.getElementById('show-forgot-password');
    
    if (showForgotBtn && forgotPasswordView) {
        showForgotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.classList.add('hidden');
            loginView.classList.remove('active');
            forgotPasswordView.classList.remove('hidden');
            forgotPasswordView.classList.add('active');
            
            // Reset OTP flow to step 1
            if (window._resetOtpFlow) window._resetOtpFlow();
        });
    }

    // Back to login from forgot-password view
    const backToLoginBtn = document.getElementById('show-login-from-forgot');
    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (forgotPasswordView) {
                forgotPasswordView.classList.add('hidden');
                forgotPasswordView.classList.remove('active');
            }
            loginView.classList.remove('hidden');
            loginView.classList.add('active');
            if (window._resetOtpFlow) window._resetOtpFlow();
        });
    }

    // Nav toggle (Manage Users ↔ Dashboard)
    if (navToggleBtn) {
        navToggleBtn.addEventListener('click', () => {
            const isUserManagement = superadminView && superadminView.classList.contains('active');
            if (isUserManagement) {
                switchAppView('dashboard');
                navToggleBtn.setAttribute('data-i18n', 'manage_users');
                navToggleBtn.textContent = window.t ? window.t('manage_users') : 'Manage Users';
            } else {
                switchAppView('superadmin');
                navToggleBtn.setAttribute('data-i18n', 'dashboard');
                navToggleBtn.textContent = window.t ? window.t('dashboard') : 'Dashboard';
            }
        });
    }
}
