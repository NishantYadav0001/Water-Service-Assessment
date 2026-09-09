/**
 * App Orchestrator — bootstraps all modules in correct order.
 *
 * This file is the entry point loaded by index.html as a module.
 * It imports all domain modules, wires up cross-module dependencies,
 * and kicks off initialization.
 */

import { getCurrentUser, getIsFormDirty, setIsFormDirty, logout, initAuth } from './js/auth.js';
import { loadLocations } from './js/locations.js';
import { switchAppView, showApp, showAuth, initNavigation } from './js/navigation.js';
import { renderDashboard, initDashboard, setShowDraftsOnly, resetFilterLock } from './js/dashboard.js';
import { openAssessmentForm, initAssessmentForm } from './js/assessmentForm.js';
import { renderSuperAdminDashboard, initSuperAdmin } from './js/superAdmin.js';

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
        successModal
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
    loadLocations();
});