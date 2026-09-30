/**
 * Modal — reusable styled confirm/alert dialogs with focus trapping.
 *
 * Replaces native alert() / confirm() with styled, translatable,
 * non-blocking modal dialogs.
 *
 * Exports:
 *   showAlert(msg, title?)    — styled alert, returns Promise<void>
 *   showConfirm(msg, title?)  — styled confirm, returns Promise<boolean>
 */

const modal = document.getElementById('confirm-modal');
const modalTitle = document.getElementById('confirm-modal-title');
const modalMessage = document.getElementById('confirm-modal-message');
const cancelBtn = document.getElementById('confirm-modal-cancel');
const okBtn = document.getElementById('confirm-modal-ok');

let _resolveModal = null;
let _previousFocus = null;

/**
 * Trap Tab/Shift+Tab focus within the modal.
 */
function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
        if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
    } else {
        if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

function openModal(msg, title, isConfirm) {
    return new Promise(resolve => {
        _resolveModal = resolve;
        _previousFocus = document.activeElement;

        modalTitle.textContent = title;
        modalMessage.textContent = msg;

        if (isConfirm) {
            cancelBtn.classList.remove('hidden');
            cancelBtn.style.display = '';
        } else {
            cancelBtn.classList.add('hidden');
            cancelBtn.style.display = 'none';
        }

        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // Focus the OK button
        okBtn.focus();

        // Add focus trapping
        modal.addEventListener('keydown', trapFocus);

        // Allow Escape key to dismiss
        modal.addEventListener('keydown', handleEscape);
    });
}

function closeModal(result) {
    modal.classList.add('hidden');
    modal.style.display = '';
    modal.removeEventListener('keydown', trapFocus);
    modal.removeEventListener('keydown', handleEscape);

    // Restore focus to the triggering element
    if (_previousFocus && _previousFocus.focus) {
        _previousFocus.focus();
    }

    if (_resolveModal) {
        _resolveModal(result);
        _resolveModal = null;
    }
}

function handleEscape(e) {
    if (e.key === 'Escape') {
        closeModal(false);
    }
}

// Wire up button clicks
if (okBtn) {
    okBtn.addEventListener('click', () => closeModal(true));
}
if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeModal(false));
}

/**
 * Show a styled alert dialog (single OK button).
 * @param {string} msg - Message to display
 * @param {string} [title='Notice'] - Modal title
 * @returns {Promise<void>}
 */
export async function showAlert(msg, title = 'Notice') {
    await openModal(msg, title, false);
}

/**
 * Show a styled confirm dialog (OK + Cancel buttons).
 * @param {string} msg - Message to display
 * @param {string} [title='Confirm'] - Modal title
 * @returns {Promise<boolean>} true if OK, false if Cancel/Escape
 */
export function showConfirm(msg, title = 'Confirm') {
    return openModal(msg, title, true);
}
