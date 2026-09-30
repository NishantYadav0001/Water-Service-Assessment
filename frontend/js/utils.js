/**
 * Utility helpers — pure functions with no side effects.
 *
 * Import individual helpers as needed:
 *   import { escapeHtml, safeT, showToast, handleSupabaseError, debounce } from './utils.js';
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

export function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast'; // reset classes
    if (type === 'error') {
        toast.style.backgroundColor = 'var(--danger)';
    } else {
        toast.style.backgroundColor = 'var(--success)';
    }
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

/**
 * Centralized Supabase error handler — logs to console and shows a
 * non-blocking toast instead of a thread-blocking alert().
 * @param {Object} error - Supabase error object
 * @param {string} context - Human-readable description of what failed
 * @returns {void}
 */
export function handleSupabaseError(error, context = 'operation') {
    if (!error) return;
    console.error(`Supabase error during ${context}:`, error.message);
    showToast(`Failed: ${context}. ${error.message}`, 'error');
}

/**
 * Creates a debounced version of a function.
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function}
 */
export function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
