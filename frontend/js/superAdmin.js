/**
 * Super Admin — user management dashboard, pending registrations,
 * approve/reject/delete users, and user details modal.
 *
 * Exports:
 *   renderSuperAdminDashboard() — fetch + render all user tables
 *   initSuperAdmin(deps)        — wire up event listeners
 */

import { supabase } from './supabaseClient.js';
import { escapeHtml } from './utils.js';

let currentPendingUsers = [];

// Injected dependencies
let _getCurrentUser = null;

// --- Internal Helpers ---

function renderUserRow(u, tbody) {
    let loc = [u.state, u.district, u.sub_district, u.village].filter(Boolean).join(', ');
    if (!loc) loc = 'N/A';

    // BUG-06: Escape user-supplied data + BUG-13: correct badge classes
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${escapeHtml(u.email.split('@')[0])}</td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.role === 'GP User' ? 'badge-submitted' : 'badge-approved'}">${escapeHtml(u.role)}</span></td>
        <td><small>${escapeHtml(loc)}</small></td>
        <td>
            <span class="badge ${u.account_status === 'approved' ? 'badge-approved' : 'badge-rejected'}">${escapeHtml(u.account_status)}</span>
        </td>
        <td>
            <button class="btn-outline btn-small delete-user-btn text-danger" data-email="${escapeHtml(u.email)}">Delete</button>
        </td>
    `;
    tbody.appendChild(tr);
}

function setupTableSearch(inputId, tbody) {
    const searchInput = document.getElementById(inputId);
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.dataset.listenerAttached = 'true';
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }
}

function viewUserDetails(email) {
    const user = currentPendingUsers.find(u => u.email === email);
    if (!user) {
        alert('User details not found in cache.');
        return;
    }

    try {
        // Populate Details
        let loc = [user.state, user.district, user.sub_district, user.village].filter(Boolean).join(', ');
        document.getElementById('modal-email').textContent = user.email;
        document.getElementById('modal-role').textContent = user.role;
        document.getElementById('modal-location').textContent = loc || 'N/A';

        // Populate Image
        const img = document.getElementById('id-proof-image');
        const noText = document.getElementById('no-id-text');
        if (user.id_proof_url) {
            img.src = user.id_proof_url;
            img.classList.remove('hidden');
            noText.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            img.src = '';
            noText.classList.remove('hidden');
        }

        const modal = document.getElementById('id-proof-modal');
        if (modal) {
            modal.classList.remove('hidden');

            // FORCE INLINE STYLES to bypass any CSS caching issues
            modal.style.display = 'flex';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            modal.style.zIndex = '999999';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
        } else {
            alert("Could not find the modal element in the HTML.");
        }
    } catch (err) {
        console.error("Error populating modal:", err);
        alert("Error populating details: " + err.message);
    }
}

async function approveUser(email) {
    if (!confirm('Are you sure you want to approve this user?')) return;
    const { error } = await supabase.from('profiles').update({ account_status: 'approved' }).eq('email', email);
    if (error) alert("Error approving: " + error.message);
    else renderSuperAdminDashboard();
}

async function rejectUser(email) {
    if (!confirm('Are you sure you want to reject this user?')) return;
    const { error } = await supabase.from('profiles').update({ account_status: 'rejected' }).eq('email', email);
    if (error) alert("Error rejecting: " + error.message);
    else renderSuperAdminDashboard();
}

// --- Public API ---

export async function renderSuperAdminDashboard() {
    const currentUser = _getCurrentUser();
    const tbody = document.querySelector('#pending-users-table tbody');
    const allUsersTbody = document.querySelector('#all-users-table tbody');
    const allAdminsTbody = document.querySelector('#all-admins-table tbody');
    const allAdminsCard = document.getElementById('all-admins-card');

    if (!tbody || !allUsersTbody) return;
    tbody.innerHTML = '';
    allUsersTbody.innerHTML = '';
    if (allAdminsTbody) allAdminsTbody.innerHTML = '';

    let query = supabase.from('profiles').select('*');
    if (currentUser.role === 'State Admin') {
        query = query.eq('state', currentUser.state);
    } else if (currentUser.role === 'District Admin') {
        query = query.eq('state', currentUser.state).eq('district', currentUser.district);
    }

    const { data: fetchedUsers, error: allUsersError } = await query;

    // Hide admins card for District Admins since they only manage GP Users
    if (currentUser.role === 'District Admin') {
        if (allAdminsCard) allAdminsCard.classList.add('hidden');
    } else {
        if (allAdminsCard) allAdminsCard.classList.remove('hidden');
    }

    // Exclude current user from lists
    const allUsers = fetchedUsers ? fetchedUsers.filter(u => u.email !== currentUser.email) : [];

    const pendingUsers = allUsers.filter(u => u.account_status === 'pending');
    const gpUsers = allUsers.filter(u => u.account_status !== 'pending' && u.role === 'GP User');
    const adminUsers = allUsers.filter(u => u.account_status !== 'pending' && u.role !== 'GP User');
    currentPendingUsers = pendingUsers || [];

    // --- Render Pending ---
    if (allUsersError || pendingUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No pending registrations found.</td></tr>';
    } else {
        pendingUsers.forEach(u => {
            let loc = [u.state, u.district, u.sub_district, u.village].filter(Boolean).join(', ');
            if (!loc) loc = 'N/A';

            // BUG-C3: Show warning for elevated role requests
            const isElevatedRole = u.role !== 'GP User';
            const roleWarning = isElevatedRole
                ? `<span class="badge badge-rejected" style="font-size:0.7rem; margin-left:4px;" title="This user is requesting an admin role. Verify their identity carefully before approving.">⚠ Elevated Role!</span>`
                : '';

            // BUG-06: Escape user-supplied data + BUG-13: use correct badge classes
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(u.email.split('@')[0])}</td>
                <td>${escapeHtml(u.email)}</td>
                <td><span class="badge ${u.role === 'GP User' ? 'badge-submitted' : 'badge-approved'}">${escapeHtml(u.role)}</span>${roleWarning}</td>
                <td><small>${escapeHtml(loc)}</small></td>
                <td>
                    <button class="btn-outline btn-small view-id-btn" data-email="${escapeHtml(u.email)}">View Details</button>
                    <button class="btn-primary btn-small approve-user-btn" data-email="${escapeHtml(u.email)}" style="background-color: var(--success); border-color: var(--success);">Approve</button>
                    <button class="btn-outline btn-small reject-user-btn text-danger" data-email="${escapeHtml(u.email)}">Reject</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- Render GP Users ---
    if (gpUsers.length === 0) {
        allUsersTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No users found.</td></tr>';
    } else {
        gpUsers.forEach(u => renderUserRow(u, allUsersTbody));
    }

    // --- Render Admin Users ---
    if (allAdminsTbody) {
        if (adminUsers.length === 0) {
            allAdminsTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No admins found.</td></tr>';
        } else {
            adminUsers.forEach(u => renderUserRow(u, allAdminsTbody));
        }
    }

    setupTableSearch('pending-users-search', tbody);
    setupTableSearch('all-users-search', allUsersTbody);
    if (allAdminsTbody) setupTableSearch('all-admins-search', allAdminsTbody);
}

/**
 * Wire up super admin event listeners.
 *
 * @param {Object} deps
 * @param {Function} deps.getCurrentUser
 */
export function initSuperAdmin(deps) {
    _getCurrentUser = deps.getCurrentUser;

    // Event Delegation for the user management view
    const superadminViewContainer = document.getElementById('user-management-view');
    if (superadminViewContainer) {
        superadminViewContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const email = btn.getAttribute('data-email');
            if (!email) return;

            if (btn.classList.contains('view-id-btn')) {
                viewUserDetails(email);
            } else if (btn.classList.contains('approve-user-btn')) {
                approveUser(email);
            } else if (btn.classList.contains('reject-user-btn')) {
                rejectUser(email);
            } else if (btn.classList.contains('delete-user-btn')) {
                // BUG-C5: Warn that only the profile is deleted, not the auth account
                if (confirm(`Are you sure you want to delete the user ${email}?\n\n⚠️ Note: This removes the user profile from the system. The authentication account will still exist in Supabase Auth and must be removed separately from the Supabase dashboard.`)) {
                    const { error } = await supabase.from('profiles').delete().eq('email', email);
                    if (error) {
                        alert('Error deleting user: ' + error.message);
                    } else {
                        alert('User profile deleted successfully.\n\nReminder: Please also delete their auth account from the Supabase dashboard to prevent re-login issues.');
                        renderSuperAdminDashboard();
                    }
                }
            }
        });
    }

    // Modal close button
    if (document.getElementById('close-id-modal-btn')) {
        document.getElementById('close-id-modal-btn').addEventListener('click', () => {
            const modal = document.getElementById('id-proof-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
        });
    }
}
