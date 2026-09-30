/**
 * App Orchestrator — bootstraps all modules in correct order.
 *
 * This file is the entry point loaded by index.html as a module.
 * It imports all domain modules, wires up cross-module dependencies,
 * and kicks off initialization.
 */

import { getCurrentUser, getIsFormDirty, setIsFormDirty, logout, initAuth, getResetOtpFlow } from './js/auth.js?v=9';
import { loadLocations } from './js/locations.js?v=9';
import { switchAppView, showApp, showAuth, initNavigation } from './js/navigation.js?v=9';
import { renderDashboard, initDashboard, setShowDraftsOnly, resetFilterLock } from './js/dashboard.js?v=9';
import { openAssessmentForm, initAssessmentForm } from './js/assessmentForm.js?v=9';
import { renderSuperAdminDashboard, initSuperAdmin } from './js/superAdmin.js?v=9';
import './js/modal.js?v=9'; // Initialize confirm/alert modal system

document.addEventListener('DOMContentLoaded', async () => {
    const successModal = document.getElementById('success-modal');

    // Initialize language system (translations.js exposes window.initLanguage)
    if (window.initLanguage) {
        await window.initLanguage();
    }

    // --- Wire up modules with cross-dependencies ---

    initNavigation({
        getCurrentUser,
        getIsFormDirty,
        renderDashboard,
        renderSuperAdminDashboard,
        logout,
        setShowDraftsOnly,
        successModal,
        getResetOtpFlow,
        loadLocations,
        openAssessmentForm
    });

    initDashboard({
        getCurrentUser,
        openAssessmentForm,
        switchAppView
    });

    initAssessmentForm({
        getCurrentUser,
        getIsFormDirty,
        setIsFormDirty,
        switchAppView,
        successModal
    });

    initSuperAdmin({
        getCurrentUser
    });

    initAuth({
        showApp,
        showAuth,
        setShowDraftsOnly,
        resetFilterLock
    });

    // --- Load data ---
    // Location data is now loaded lazily after login (inside showApp/navigation.js)
    // This avoids downloading 15MB on unauthenticated page loads
});