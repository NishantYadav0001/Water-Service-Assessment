/**
 * Utility helpers — pure functions with no side effects.
 *
 * Import individual helpers as needed:
 *   import { escapeHtml, safeT, showToast } from './utils.js';
 */

// BUG-06: Sanitize user input before inserting into innerHTML
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

// BUG-02: Safe translation helper that never throws
export function safeT(key, fallback) {
    try {
        if (window.t) return window.t(key) || fallback || key;
    } catch (e) { /* ignore */ }
    return fallback || key;
}

export function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}
