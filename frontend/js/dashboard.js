/**
 * Dashboard — record listing, filtering, draft toggle, and record actions.
 *
 * Exports:
 *   renderDashboard()      — fetch + render the assessment records table
 *   initDashboard(deps)    — wire up dashboard event listeners
 *   getShowDraftsOnly()    — accessor
 *   setShowDraftsOnly(val) — mutator
 */

import { supabase } from './supabaseClient.js';
import { escapeHtml, safeT, showToast } from './utils.js';

let showDraftsOnly = false;
let filterLockedForRole = false;

// Injected dependencies
let _getCurrentUser = null;
let _openAssessmentForm = null;
let _switchAppView = null;

export function getShowDraftsOnly() {
    return showDraftsOnly;
}

export function setShowDraftsOnly(val) {
    showDraftsOnly = val;
}

export function resetFilterLock() {
    filterLockedForRole = false;
}

export async function renderDashboard() {
    const tbody = document.querySelector('#records-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const currentUser = _getCurrentUser();
    if (!currentUser) return;

    // Show filter card for admins, hide for GP Users
    const filterCard = document.querySelector('.filter-card');
    if (filterCard) {
        filterCard.style.display = (currentUser.role === 'GP User') ? 'none' : '';
    }

    // Role-based filter locking (run ONCE per login, not on every render)
    if (!filterLockedForRole && currentUser.role !== 'GP User') {
        filterLockedForRole = true;
        const filterStateEl = document.getElementById('filter-state');
        const filterDistEl = document.getElementById('filter-district');

        if (currentUser.role === 'State Admin') {
            if (filterStateEl && currentUser.state) {
                filterStateEl.value = currentUser.state;
                filterStateEl.disabled = true;
                filterStateEl.dispatchEvent(new Event('change'));
            }
        } else if (currentUser.role === 'District Admin') {
            if (filterStateEl && currentUser.state) {
                filterStateEl.value = currentUser.state;
                filterStateEl.disabled = true;
                filterStateEl.dispatchEvent(new Event('change'));
            }
            await new Promise(r => setTimeout(r, 60));
            if (filterDistEl && currentUser.district) {
                filterDistEl.value = currentUser.district;
                filterDistEl.disabled = true;
                filterDistEl.dispatchEvent(new Event('change'));
            }
        }
    }

    // Fetch assessments from Supabase
    let query = supabase.from('assessments').select('*');

    // Role-based filtering
    if (currentUser.role === 'GP User') {
        query = query.eq('user_id', currentUser.email);
        if (showDraftsOnly) {
            query = query.eq('status', 'Draft');
        }
        // Default view: show ALL records (drafts + submitted + approved + rejected)
    } else if (currentUser.role === 'District Admin') {
        query = query.eq('district', currentUser.district).in('status', ['Submitted', 'Approved', 'Rejected']);
    } else if (currentUser.role === 'State Admin') {
        query = query.eq('state', currentUser.state).neq('status', 'Draft');
    }

    // BUG-S4: Apply location filters only when NOT already locked by role
    const filterStateEl = document.getElementById('filter-state');
    const filterDistEl = document.getElementById('filter-district');
    const fSub = document.getElementById('filter-subdistrict').value;
    const fVill = document.getElementById('filter-village').value;

    if (!filterStateEl.disabled && filterStateEl.value) query = query.eq('state', filterStateEl.value);
    if (!filterDistEl.disabled && filterDistEl.value) query = query.eq('district', filterDistEl.value);
    if (fSub) query = query.eq('sub_district', fSub);
    if (fVill) query = query.eq('village', fVill);

    const { data: dbRecords, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.warn("Error fetching assessments (table may not exist yet):", error.message);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" data-i18n="no_records">${safeT('no_records', 'No records found')}</td></tr>`;
        return;
    }

    let filtered = dbRecords.map(a => ({
        id: a.id,
        status: a.status,
        payload: a.payload,
        village: a.village,
        sub_district: a.sub_district,
        district: a.district,
        state: a.state,
        createdAt: a.created_at,
        user_id: a.user_id
    }));

    if (filtered.length === 0) {
        // BUG-02: use safeT instead of raw window.t()
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" data-i18n="no_records">${safeT('no_records', 'No records found')}</td></tr>`;
        return;
    }

    filtered.forEach(record => {
        const tr = document.createElement('tr');

        // BUG-02 + BUG-13: Safe translation + correct badge CSS classes
        let statusBadge = '';
        let displayStatus = safeT(record.status.toLowerCase(), record.status);

        if (record.status === 'Submitted') {
            statusBadge = 'badge-submitted';
            if (currentUser.role === 'GP User') {
                displayStatus = safeT('pending', 'Pending');
                statusBadge = 'badge-draft';
            }
        }
        else if (record.status === 'Approved') statusBadge = 'badge-approved';
        else if (record.status === 'Rejected') statusBadge = 'badge-rejected';
        else statusBadge = 'badge-draft';

        let actionBtn = '';
        // BUG-02 + BUG-06: Safe translations + escaped record IDs
        const safeId = escapeHtml(record.id);
        if (record.status === 'Draft' && currentUser.role === 'GP User') {
            actionBtn = `
                <button class="btn-outline btn-small view-record" data-id="${safeId}" data-i18n="edit">${safeT('edit', 'Edit')}</button>
                <button class="btn-outline btn-small delete-record text-danger" style="margin-left:5px;" data-id="${safeId}" data-i18n="delete">${safeT('delete', 'Delete')}</button>
            `;
        } else if (record.status === 'Submitted' && (currentUser.role === 'District Admin' || currentUser.role === 'State Admin')) {
            actionBtn = `<button class="btn-outline btn-small view-record" data-id="${safeId}" data-i18n="review">${safeT('review', 'Review')}</button>`;
        } else {
            actionBtn = `<button class="btn-outline btn-small view-record" data-id="${safeId}" data-i18n="view">${safeT('view', 'View')}</button>`;
        }

        // Logic for date display
        let displayDate = '';
        if (record.payload && record.payload.date_discussion) {
            displayDate = record.payload.date_discussion;
        } else if (record.createdAt) {
            displayDate = new Date(record.createdAt).toLocaleDateString();
        } else {
            displayDate = new Date().toLocaleDateString();
        }

        // BUG-06: Escape user-supplied village name
        tr.innerHTML = `
            <td>${escapeHtml(displayDate)}</td>
            <td>${escapeHtml(record.village) || 'N/A'}</td>
            <td><span class="badge ${statusBadge}" data-i18n="${escapeHtml(record.status.toLowerCase())}">${escapeHtml(displayStatus)}</span></td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.view-record').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            _openAssessmentForm(id);
        });
    });

    document.querySelectorAll('.delete-record').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const currentUser = _getCurrentUser();
            // BUG-C6: Only GP Users can delete, and only Draft assessments
            if (!currentUser || currentUser.role !== 'GP User') {
                alert('Only GP Users can delete draft assessments.');
                return;
            }
            // BUG-02 + BUG-05: Safe translations + database delete
            if (confirm(safeT('delete_confirm', 'Are you sure you want to delete this draft?'))) {
                const id = e.target.getAttribute('data-id');
                // BUG-C6: Double-check status is Draft and user owns the record
                const { data: record, error: fetchErr } = await supabase
                    .from('assessments').select('status, user_id').eq('id', id).single();
                if (fetchErr || !record) {
                    alert('Failed to verify draft: ' + (fetchErr?.message || 'Not found'));
                    return;
                }
                if (record.status !== 'Draft') {
                    alert('Only draft assessments can be deleted.');
                    return;
                }
                if (record.user_id !== currentUser.email) {
                    alert('You can only delete your own drafts.');
                    return;
                }
                const { error } = await supabase.from('assessments').delete().eq('id', id);
                if (error) {
                    alert('Failed to delete draft: ' + error.message);
                    return;
                }
                showToast(safeT('draft_deleted', 'Draft Deleted!'));
                renderDashboard();
            }
        });
    });
}

/**
 * Wire up dashboard event listeners.
 *
 * @param {Object} deps
 * @param {Function} deps.getCurrentUser
 * @param {Function} deps.openAssessmentForm
 * @param {Function} deps.switchAppView
 */
export function initDashboard(deps) {
    _getCurrentUser = deps.getCurrentUser;
    _openAssessmentForm = deps.openAssessmentForm;
    _switchAppView = deps.switchAppView;

    // "New Assessment" button
    const btnNewForm = document.getElementById('btn-new-form');
    if (btnNewForm) {
        btnNewForm.addEventListener('click', async () => {
            const currentUser = _getCurrentUser();
            // BUG-09: user-scoped draft count, now querying Supabase
            const { data: drafts, error } = await supabase.from('assessments').select('id').eq('user_id', currentUser.email).eq('status', 'Draft');
            if (error) {
                console.warn("Draft count check returned error (table may not exist yet):", error.message);
            }
            const draftCount = (drafts && !error) ? drafts.length : 0;
            if (draftCount >= 2) {
                alert('You can only have up to 2 unfinished drafts. Please submit or delete an existing draft before starting a new one.');
                return;
            }
            _openAssessmentForm(null);
        });
    }

    // "View Drafts" toggle button
    const viewDraftsBtn = document.getElementById('btn-view-drafts');
    if (viewDraftsBtn) {
        viewDraftsBtn.addEventListener('click', (e) => {
            showDraftsOnly = !showDraftsOnly;
            if (showDraftsOnly) {
                // MIN-1: Use safeT instead of raw window.t
                e.target.textContent = safeT('all', 'All') + ' ' + safeT('assessment_records', 'Records');
                e.target.classList.replace('btn-outline', 'btn-secondary');
                document.getElementById('records-card-title').textContent = safeT('view_drafts', 'Unfinished Assessment Forms');
            } else {
                e.target.textContent = safeT('view_drafts', 'View Unfinished Forms');
                e.target.classList.replace('btn-secondary', 'btn-outline');
                document.getElementById('records-card-title').textContent = safeT('assessment_records', 'Assessment Records');
            }
            renderDashboard();
        });
    }

    // Search button
    const searchRecordsBtn = document.getElementById('search-records-btn');
    if (searchRecordsBtn) searchRecordsBtn.addEventListener('click', renderDashboard);

    // BUG-S6: Auto-refresh dashboard when filter dropdowns change
    ['filter-state', 'filter-district', 'filter-subdistrict', 'filter-village'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                // Only refresh if we're on the dashboard and have a logged-in user
                const dashView = document.getElementById('dashboard-view');
                if (dashView && !dashView.classList.contains('hidden') && _getCurrentUser()) {
                    renderDashboard();
                }
            });
        }
    });
}
