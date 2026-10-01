/**
 * Super Admin — user management dashboard, pending registrations,
 * approve/reject/delete users, and user details modal.
 *
 * Exports:
 *   renderSuperAdminDashboard() — fetch + render all user tables
 *   initSuperAdmin(deps)        — wire up event listeners
 */

import { supabase } from './supabaseClient.js';
import { escapeHtml, debounce } from './utils.js';
import { showPrompt, showConfirm, showAlert } from './modal.js';

let allFetchedUsersCache = [];

// Injected dependencies
let _getCurrentUser = null;

// --- Internal Helpers ---

function renderUserRow(u, tbody) {
    let loc = [u.state, u.district, u.sub_district, u.village].filter(Boolean).join(', ');
    if (!loc) loc = 'N/A';

    const currentUser = _getCurrentUser();
    const isSuperAdmin = currentUser && String(currentUser.role).trim().toLowerCase().replace(/\s+/g, '') === 'superadmin';
    const targetIsSuperAdmin = u && String(u.role).trim().toLowerCase().replace(/\s+/g, '') === 'superadmin';

    let canDelete = true;
    if (currentUser.role === 'District Admin' && u.role !== 'GP User') canDelete = false;
    if (currentUser.role === 'State Admin' && (u.role === 'State Admin' || targetIsSuperAdmin)) canDelete = false;

    let actions = '';
    if (canDelete) {
        actions += `<button class="btn-outline btn-small delete-user-btn text-danger" data-email="${escapeHtml(u.email)}">Delete</button>`;
    }
    
    if (canDelete) {
        if (u.account_status === 'frozen') {
            actions += ` <button class="btn-outline btn-small unfreeze-user-btn text-success" data-email="${escapeHtml(u.email)}">Unfreeze</button>`;
        } else {
            actions += ` <button class="btn-outline btn-small freeze-user-btn text-warning" data-email="${escapeHtml(u.email)}">Freeze</button>`;
        }
        
        if (u.account_status === 'restricted') {
            actions += ` <button class="btn-outline btn-small unrestrict-user-btn text-success" data-email="${escapeHtml(u.email)}">Unrestrict</button>`;
        } else {
            actions += ` <button class="btn-outline btn-small restrict-user-btn text-warning" data-email="${escapeHtml(u.email)}">Restrict</button>`;
        }
    }

    let statusBadgeClass = 'badge-draft';
    if (u.account_status === 'approved') statusBadgeClass = 'badge-approved';
    else if (u.account_status === 'frozen' || u.account_status === 'restricted') statusBadgeClass = 'badge-rejected';

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><a href="#" class="view-id-btn" data-email="${escapeHtml(u.email)}">${escapeHtml(u.email.split('@')[0])}</a></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.role === 'GP User' ? 'badge-submitted' : 'badge-approved'}">${escapeHtml(u.role)}</span></td>
        <td><small>${escapeHtml(loc)}</small></td>
        <td>
            <span class="badge ${statusBadgeClass}">${escapeHtml(u.account_status)}</span>
        </td>
        <td>
            ${actions}
        </td>
    `;
    tbody.appendChild(tr);
}

function setupTableSearch(inputId, tbody) {
    const searchInput = document.getElementById(inputId);
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.dataset.listenerAttached = 'true';
        searchInput.addEventListener('input', debounce((e) => {
            const term = e.target.value.toLowerCase();
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        }, 250));
    }
}

function viewUserDetails(email) {
    const user = allFetchedUsersCache.find(u => u.email === email);
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
        const modalStatus = document.getElementById('modal-status');
        if (modalStatus) modalStatus.textContent = user.account_status || 'N/A';

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
    const confirmed = await showConfirm('Are you sure you want to approve this user?', 'Approve User');
    if (!confirmed) return;
    const { error } = await supabase.from('profiles').update({ account_status: 'approved', status_reason: null }).eq('email', email);
    if (error) showAlert("Error approving: " + error.message, 'Error');
    else renderSuperAdminDashboard();
}

async function rejectUser(email) {
    const reason = await showPrompt(`Please enter the reason for rejecting user ${email}:`, 'Reject User');
    if (reason === null) return;
    const { error } = await supabase.from('profiles').update({ account_status: 'rejected', status_reason: reason }).eq('email', email);
    if (error) showAlert("Error rejecting: " + error.message, 'Error');
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
    allFetchedUsersCache = allUsers || [];

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
            const btn = e.target.closest('button, a.view-id-btn');
            if (!btn) return;

            // Prevent default navigation for anchor tags
            if (btn.tagName === 'A') {
                e.preventDefault();
            }

            const email = btn.getAttribute('data-email');
            if (!email) return;

            if (btn.classList.contains('view-id-btn')) {
                viewUserDetails(email);
            } else if (btn.classList.contains('approve-user-btn')) {
                approveUser(email);
            } else if (btn.classList.contains('reject-user-btn')) {
                rejectUser(email);
            } else if (btn.classList.contains('freeze-user-btn')) {
                const reason = await showPrompt(`Please enter the reason for freezing user ${email}:`, 'Freeze User');
                if (reason === null) return;
                const { error } = await supabase.from('profiles').update({ account_status: 'frozen', status_reason: reason }).eq('email', email);
                if (error) showAlert('Error freezing user: ' + error.message, 'Error');
                else renderSuperAdminDashboard();
            } else if (btn.classList.contains('unfreeze-user-btn')) {
                const confirmed = await showConfirm(`Are you sure you want to unfreeze the user ${email}?`, 'Unfreeze User');
                if (!confirmed) return;
                const { error } = await supabase.from('profiles').update({ account_status: 'approved', status_reason: null }).eq('email', email);
                if (error) showAlert('Error unfreezing user: ' + error.message, 'Error');
                else renderSuperAdminDashboard();
            } else if (btn.classList.contains('restrict-user-btn')) {
                const reason = await showPrompt(`Please enter the reason for restricting user ${email} from filing assessments:`, 'Restrict User');
                if (reason === null) return;
                const { error } = await supabase.from('profiles').update({ account_status: 'restricted', status_reason: reason }).eq('email', email);
                if (error) showAlert('Error restricting user: ' + error.message, 'Error');
                else renderSuperAdminDashboard();
            } else if (btn.classList.contains('unrestrict-user-btn')) {
                const confirmed = await showConfirm(`Are you sure you want to remove restrictions for user ${email}?`, 'Unrestrict User');
                if (!confirmed) return;
                const { error } = await supabase.from('profiles').update({ account_status: 'approved', status_reason: null }).eq('email', email);
                if (error) showAlert('Error unrestricting user: ' + error.message, 'Error');
                else renderSuperAdminDashboard();
            } else if (btn.classList.contains('delete-user-btn')) {
                const currentUser = _getCurrentUser();
                const targetUser = allFetchedUsersCache.find(u => u.email === email);
                if (targetUser) {
                    const isTargetUserSuperAdmin = String(targetUser.role).trim().toLowerCase().replace(/\s+/g, '') === 'superadmin';
                    if (currentUser.role === 'District Admin' && targetUser.role !== 'GP User') {
                        showAlert('Security Error: District Admins cannot delete admin users.', 'Access Denied');
                        return;
                    }
                    if (currentUser.role === 'State Admin' && (targetUser.role === 'State Admin' || isTargetUserSuperAdmin)) {
                        showAlert('Security Error: State Admins cannot delete other State Admins or Super Admins.', 'Access Denied');
                        return;
                    }
                }

                // BUG-C5: Warn that only the profile is deleted, not the auth account
                const confirmed = await showConfirm(`Are you sure you want to delete the user ${email}?\n\n⚠️ Note: This removes the user profile completely. The user will not be able to see a reason because their profile will no longer exist. If you want to show them a reason, Freeze or Reject them instead.`, 'Delete User');
                if (!confirmed) return;
                const { error } = await supabase.from('profiles').delete().eq('email', email);
                if (error) {
                    showAlert('Error deleting user: ' + error.message, 'Error');
                } else {
                    showAlert('User profile deleted successfully.\n\nReminder: Please also delete their auth account from the Supabase dashboard to prevent re-login issues.', 'Success');
                    renderSuperAdminDashboard();
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
