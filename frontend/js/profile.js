/**
 * User Profile Module — profile rendering, jurisdiction updates,
 * password management, ID proof updates, and role-based statistics.
 *
 * Applicable to all roles: GP USER, STATE ADMIN, DISTRICT ADMIN, SUPER ADMIN.
 */

import { supabase } from './supabaseClient.js';
import { escapeHtml, safeT, showToast } from './utils.js';
import { getLocationData, populateSelect } from './locations.js';

let _getCurrentUser = null;
let _setCurrentUser = null;
let _switchAppView = null;

/**
 * Format timestamp into readable string (e.g., "October 1, 2026")
 */
function formatDate(isoStr) {
    if (!isoStr) return 'N/A';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
        return isoStr;
    }
}

/**
 * Get role-specific initials & visual styling
 */
function getRoleVisuals(role) {
    const r = (role || '').toLowerCase().replace(/\s+/g, '');
    if (r === 'superadmin') {
        return { initials: 'SA', icon: '👑', badgeClass: 'role-superadmin', colorClass: 'avatar-superadmin' };
    } else if (r === 'stateadmin') {
        return { initials: 'ST', icon: '🏛️', badgeClass: 'role-stateadmin', colorClass: 'avatar-stateadmin' };
    } else if (r === 'districtadmin') {
        return { initials: 'DA', icon: '🏢', badgeClass: 'role-districtadmin', colorClass: 'avatar-districtadmin' };
    } else {
        return { initials: 'GP', icon: '👤', badgeClass: 'role-gpuser', colorClass: 'avatar-gpuser' };
    }
}

/**
 * Fetch and render live metrics based on user role
 */
async function loadRoleStatistics(user) {
    const val1 = document.getElementById('profile-stat-1-val');
    const label1 = document.getElementById('profile-stat-1-label');
    const val2 = document.getElementById('profile-stat-2-val');
    const label2 = document.getElementById('profile-stat-2-label');
    const val3 = document.getElementById('profile-stat-3-val');
    const label3 = document.getElementById('profile-stat-3-label');
    const val4 = document.getElementById('profile-stat-4-val');
    const label4 = document.getElementById('profile-stat-4-label');

    const roleNorm = (user.role || '').toLowerCase().replace(/\s+/g, '');

    try {
        if (roleNorm === 'superadmin') {
            label1.textContent = 'Total Registered Users';
            label2.textContent = 'Pending Approvals';
            label3.textContent = 'Total Assessments';
            label4.textContent = 'System Scope';

            val1.textContent = '...';
            val2.textContent = '...';
            val3.textContent = '...';
            val4.textContent = 'Nationwide';

            // Query profiles count
            const { count: usersCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
            const { count: pendingCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'pending');
            const { count: recordsCount } = await supabase.from('assessments').select('id', { count: 'exact', head: true });

            val1.textContent = usersCount !== null ? usersCount : '0';
            val2.textContent = pendingCount !== null ? pendingCount : '0';
            val3.textContent = recordsCount !== null ? recordsCount : '0';

        } else if (roleNorm === 'stateadmin') {
            label1.textContent = 'State Assessments';
            label2.textContent = 'Approved Assessments';
            label3.textContent = 'Pending Verification';
            label4.textContent = 'Assigned State';

            val1.textContent = '...';
            val2.textContent = '...';
            val3.textContent = '...';
            val4.textContent = user.state || 'N/A';

            let stateQ = supabase.from('assessments').select('status');
            if (user.state) stateQ = stateQ.eq('state', user.state);
            const { data: records } = await stateQ;

            const allRecs = records || [];
            val1.textContent = allRecs.length;
            val2.textContent = allRecs.filter(r => r.status === 'Approved').length;
            val3.textContent = allRecs.filter(r => r.status === 'Submitted').length;

        } else if (roleNorm === 'districtadmin') {
            label1.textContent = 'District Assessments';
            label2.textContent = 'Approved in District';
            label3.textContent = 'Pending Review';
            label4.textContent = 'Assigned District';

            val1.textContent = '...';
            val2.textContent = '...';
            val3.textContent = '...';
            val4.textContent = user.district || 'N/A';

            let distQ = supabase.from('assessments').select('status');
            if (user.state) distQ = distQ.eq('state', user.state);
            if (user.district) distQ = distQ.eq('district', user.district);
            const { data: records } = await distQ;

            const allRecs = records || [];
            val1.textContent = allRecs.length;
            val2.textContent = allRecs.filter(r => r.status === 'Approved').length;
            val3.textContent = allRecs.filter(r => r.status === 'Submitted').length;

        } else {
            // GP User
            label1.textContent = 'Assessments Filed';
            label2.textContent = 'Approved Records';
            label3.textContent = 'Saved Drafts';
            label4.textContent = 'Assigned Village';

            val1.textContent = '...';
            val2.textContent = '...';
            val3.textContent = '...';
            val4.textContent = user.village || 'N/A';

            const { data: records } = await supabase.from('assessments').select('status').eq('user_id', user.email);
            const allRecs = records || [];
            val1.textContent = allRecs.length;
            val2.textContent = allRecs.filter(r => r.status === 'Approved').length;
            val3.textContent = allRecs.filter(r => r.status === 'Draft').length;
        }
    } catch (err) {
        console.warn('Could not load profile statistics:', err);
    }
}

/**
 * Setup cascading dropdowns for the Profile Edit form
 */
function setupProfileEditDropdowns() {
    const locData = getLocationData();
    if (!locData || Object.keys(locData).length === 0) return;

    const stateEl = document.getElementById('prof-edit-state');
    const distEl = document.getElementById('prof-edit-district');
    const subdistEl = document.getElementById('prof-edit-subdistrict');
    const villEl = document.getElementById('prof-edit-village');

    if (!stateEl || stateEl.dataset.initialized === 'true') return;
    stateEl.dataset.initialized = 'true';

    const states = Object.keys(locData).sort();
    populateSelect(stateEl, states, 'Select State');

    stateEl.addEventListener('change', () => {
        const st = stateEl.value;
        if (st && locData[st]) {
            populateSelect(distEl, Object.keys(locData[st]).sort(), 'Select District');
        } else {
            populateSelect(distEl, [], 'Select District');
        }
        populateSelect(subdistEl, [], 'Select Sub-District');
        populateSelect(villEl, [], 'Select Village');
    });

    distEl.addEventListener('change', () => {
        const st = stateEl.value;
        const dt = distEl.value;
        if (dt && locData[st] && locData[st][dt]) {
            populateSelect(subdistEl, Object.keys(locData[st][dt]).sort(), 'Select Sub-District');
        } else {
            populateSelect(subdistEl, [], 'Select Sub-District');
        }
        populateSelect(villEl, [], 'Select Village');
    });

    subdistEl.addEventListener('change', () => {
        const st = stateEl.value;
        const dt = distEl.value;
        const sdt = subdistEl.value;
        if (sdt && locData[st] && locData[st][dt] && locData[st][dt][sdt]) {
            populateSelect(villEl, locData[st][dt][sdt].sort(), 'Select Village');
        } else {
            populateSelect(villEl, [], 'Select Village');
        }
    });
}

/**
 * Render the entire User Profile view
 */
export async function renderUserProfile() {
    const user = _getCurrentUser ? _getCurrentUser() : null;
    if (!user) return;

    const roleNorm = (user.role || '').toLowerCase().replace(/\s+/g, '');
    const visuals = getRoleVisuals(user.role);

    // Hero Section
    const avatarEl = document.getElementById('profile-avatar-large');
    const avatarText = document.getElementById('profile-avatar-text');
    const avatarRoleIcon = document.getElementById('profile-avatar-role-icon');
    const heroName = document.getElementById('profile-hero-name');
    const heroRoleBadge = document.getElementById('profile-hero-role-badge');
    const heroStatusBadge = document.getElementById('profile-hero-status-badge');
    const heroEmail = document.getElementById('profile-hero-email');
    const heroJurisdictionText = document.getElementById('profile-hero-jurisdiction-text');

    if (avatarEl) {
        avatarEl.className = 'profile-avatar-large ' + visuals.colorClass;
        avatarText.textContent = visuals.initials;
    }
    if (avatarRoleIcon) avatarRoleIcon.textContent = visuals.icon;

    const displayName = (user.email ? user.email.split('@')[0] : 'User');
    if (heroName) heroName.textContent = displayName;

    if (heroRoleBadge) {
        heroRoleBadge.className = 'role-badge ' + visuals.badgeClass;
        heroRoleBadge.textContent = user.role || 'User';
    }

    if (heroStatusBadge) {
        let statusClass = 'badge-approved';
        if (user.account_status === 'pending') statusClass = 'badge-submitted';
        else if (user.account_status === 'frozen' || user.account_status === 'rejected') statusClass = 'badge-rejected';
        heroStatusBadge.className = 'badge ' + statusClass;
        heroStatusBadge.textContent = (user.account_status || 'Approved').toUpperCase();
    }

    if (heroEmail) heroEmail.textContent = user.email || '';

    // Jurisdiction summary string
    let jurSummary = 'Nationwide (Central Super Admin)';
    if (roleNorm === 'stateadmin') {
        jurSummary = `State: ${user.state || 'N/A'}`;
    } else if (roleNorm === 'districtadmin') {
        jurSummary = `District: ${user.district || 'N/A'}, State: ${user.state || 'N/A'}`;
    } else if (roleNorm === 'gpuser') {
        jurSummary = [user.village, user.sub_district, user.district, user.state].filter(Boolean).join(', ') || 'N/A';
    }
    if (heroJurisdictionText) heroJurisdictionText.textContent = jurSummary;

    // Account Details
    const detailEmail = document.getElementById('profile-detail-email');
    const detailRole = document.getElementById('profile-detail-role');
    const detailStatus = document.getElementById('profile-detail-status');
    const detailJoined = document.getElementById('profile-detail-joined');

    if (detailEmail) detailEmail.textContent = user.email || '';
    if (detailRole) detailRole.textContent = user.role || '';
    if (detailStatus) detailStatus.innerHTML = `<span class="badge ${user.account_status === 'approved' ? 'badge-approved' : 'badge-draft'}">${escapeHtml(user.account_status || 'Approved')}</span>`;
    if (detailJoined) detailJoined.textContent = formatDate(user.created_at);

    // Jurisdiction Details Card
    const jurState = document.getElementById('profile-jur-state');
    const jurDistrict = document.getElementById('profile-jur-district');
    const jurSubdist = document.getElementById('profile-jur-subdistrict');
    const jurVillage = document.getElementById('profile-jur-village');
    const jurDistRow = document.getElementById('profile-jur-district-row');
    const jurSubdistRow = document.getElementById('profile-jur-subdistrict-row');
    const jurVillageRow = document.getElementById('profile-jur-village-row');
    const btnEditJur = document.getElementById('btn-edit-jurisdiction');

    if (roleNorm === 'superadmin') {
        if (jurState) jurState.textContent = 'All-India (National)';
        if (jurDistrict) jurDistrict.textContent = 'All Districts';
        if (jurSubdist) jurSubdist.textContent = 'All Sub-Districts';
        if (jurVillage) jurVillage.textContent = 'All Gram Panchayats';
        if (btnEditJur) btnEditJur.classList.add('hidden'); // Super Admin is all-india
    } else if (roleNorm === 'stateadmin') {
        if (jurState) jurState.textContent = user.state || 'N/A';
        if (jurDistrict) jurDistrict.textContent = 'All Districts in State';
        if (jurSubdistRow) jurSubdistRow.classList.add('hidden');
        if (jurVillageRow) jurVillageRow.classList.add('hidden');
        if (btnEditJur) btnEditJur.classList.remove('hidden');
    } else if (roleNorm === 'districtadmin') {
        if (jurState) jurState.textContent = user.state || 'N/A';
        if (jurDistrict) jurDistrict.textContent = user.district || 'N/A';
        if (jurSubdistRow) jurSubdistRow.classList.add('hidden');
        if (jurVillageRow) jurVillageRow.classList.add('hidden');
        if (btnEditJur) btnEditJur.classList.remove('hidden');
    } else {
        if (jurState) jurState.textContent = user.state || 'N/A';
        if (jurDistrict) jurDistrict.textContent = user.district || 'N/A';
        if (jurSubdist) jurSubdist.textContent = user.sub_district || 'N/A';
        if (jurVillage) jurVillage.textContent = user.village || 'N/A';
        if (jurDistRow) jurDistRow.classList.remove('hidden');
        if (jurSubdistRow) jurSubdistRow.classList.remove('hidden');
        if (jurVillageRow) jurVillageRow.classList.remove('hidden');
        if (btnEditJur) btnEditJur.classList.remove('hidden');
    }

    // ID Proof Preview
    const imgEl = document.getElementById('profile-id-img');
    const noIdText = document.getElementById('profile-no-id-text');
    const viewFullBtn = document.getElementById('profile-view-full-id-btn');

    if (user.id_proof_url) {
        if (imgEl) {
            imgEl.src = user.id_proof_url;
            imgEl.classList.remove('hidden');
        }
        if (noIdText) noIdText.classList.add('hidden');
        if (viewFullBtn) viewFullBtn.classList.remove('hidden');
    } else {
        if (imgEl) {
            imgEl.src = '';
            imgEl.classList.add('hidden');
        }
        if (noIdText) noIdText.classList.remove('hidden');
        if (viewFullBtn) viewFullBtn.classList.add('hidden');
    }

    // Reset forms
    const jurForm = document.getElementById('profile-edit-jurisdiction-form');
    const jurView = document.getElementById('profile-jurisdiction-view');
    if (jurForm) jurForm.classList.add('hidden');
    if (jurView) jurView.classList.remove('hidden');

    // Reset password messages
    const pwdErr = document.getElementById('prof-pwd-error');
    const pwdSucc = document.getElementById('prof-pwd-success');
    if (pwdErr) pwdErr.classList.add('hidden');
    if (pwdSucc) pwdSucc.classList.add('hidden');

    // Load asynchronous statistics
    loadRoleStatistics(user);
}

/**
 * Initialize event listeners for profile view
 */
export function initProfile(deps) {
    _getCurrentUser = deps.getCurrentUser;
    _setCurrentUser = deps.setCurrentUser;
    _switchAppView = deps.switchAppView;

    // "Back to Dashboard" button in profile view
    const backBtn = document.getElementById('profile-back-dashboard-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            _switchAppView('dashboard');
        });
    }

    // Edit Jurisdiction Toggle
    const btnEditJur = document.getElementById('btn-edit-jurisdiction');
    const btnToggleEditHero = document.getElementById('btn-toggle-edit-profile');
    const jurForm = document.getElementById('profile-edit-jurisdiction-form');
    const jurView = document.getElementById('profile-jurisdiction-view');
    const cancelEditBtn = document.getElementById('cancel-edit-jurisdiction-btn');

    // Track edit mode state
    let _isEditMode = false;

    function openJurisdictionEdit() {
        setupProfileEditDropdowns();
        const user = _getCurrentUser();
        const roleNorm = (user?.role || '').toLowerCase().replace(/\s+/g, '');

        if (roleNorm === 'superadmin') {
            showToast('Super Admin has nationwide authority across all locations.', 'success');
            return;
        }

        // Pre-select current values if available
        const stateEl = document.getElementById('prof-edit-state');
        const distEl = document.getElementById('prof-edit-district');
        const subdistEl = document.getElementById('prof-edit-subdistrict');
        const villEl = document.getElementById('prof-edit-village');

        // Adjust visibility according to role
        const distGroup = document.getElementById('prof-edit-district-group');
        const subdistGroup = document.getElementById('prof-edit-subdistrict-group');
        const villGroup = document.getElementById('prof-edit-village-group');

        if (roleNorm === 'stateadmin') {
            if (distGroup) distGroup.classList.add('hidden');
            if (subdistGroup) subdistGroup.classList.add('hidden');
            if (villGroup) villGroup.classList.add('hidden');
        } else if (roleNorm === 'districtadmin') {
            if (distGroup) distGroup.classList.remove('hidden');
            if (subdistGroup) subdistGroup.classList.add('hidden');
            if (villGroup) villGroup.classList.add('hidden');
        } else {
            if (distGroup) distGroup.classList.remove('hidden');
            if (subdistGroup) subdistGroup.classList.remove('hidden');
            if (villGroup) villGroup.classList.remove('hidden');
        }

        if (stateEl && user.state) {
            stateEl.value = user.state;
            stateEl.dispatchEvent(new Event('change'));
            if (distEl && user.district) {
                distEl.value = user.district;
                distEl.dispatchEvent(new Event('change'));
                if (subdistEl && user.sub_district) {
                    subdistEl.value = user.sub_district;
                    subdistEl.dispatchEvent(new Event('change'));
                    if (villEl && user.village) {
                        villEl.value = user.village;
                    }
                }
            }
        }

        jurView.classList.add('hidden');
        jurForm.classList.remove('hidden');
    }

    function closeEditMode() {
        _isEditMode = false;

        // Close jurisdiction form
        if (jurForm) jurForm.classList.add('hidden');
        if (jurView) jurView.classList.remove('hidden');

        // Remove edit highlights
        const editableCards = document.querySelectorAll('#profile-view .card.profile-edit-highlight');
        editableCards.forEach(card => card.classList.remove('profile-edit-highlight'));

        // Update button text
        const editBtnText = document.getElementById('edit-profile-btn-text');
        if (editBtnText) editBtnText.textContent = safeT('edit_profile', 'Edit Profile');
        if (btnToggleEditHero) {
            btnToggleEditHero.classList.remove('btn-outline');
            btnToggleEditHero.classList.add('btn-primary');
        }
    }

    function toggleEditMode() {
        const user = _getCurrentUser();
        const roleNorm = (user?.role || '').toLowerCase().replace(/\s+/g, '');

        if (_isEditMode) {
            // Exit edit mode
            closeEditMode();
            return;
        }

        // Enter edit mode
        _isEditMode = true;

        // Open jurisdiction edit (unless Super Admin)
        if (roleNorm !== 'superadmin') {
            openJurisdictionEdit();
        }

        // Highlight editable sections
        const profileCards = document.querySelectorAll('#profile-view .profile-content-grid .card');
        profileCards.forEach(card => card.classList.add('profile-edit-highlight'));

        // Update button text to "Done Editing"
        const editBtnText = document.getElementById('edit-profile-btn-text');
        if (editBtnText) editBtnText.textContent = '✓ Done Editing';
        if (btnToggleEditHero) {
            btnToggleEditHero.classList.remove('btn-primary');
            btnToggleEditHero.classList.add('btn-outline');
        }

        // Scroll to editable jurisdiction card smoothly
        const jurCard = jurForm ? jurForm.closest('.card') : null;
        if (jurCard) {
            setTimeout(() => {
                jurCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 150);
        }

        showToast('Edit mode active — make your changes below.', 'info');
    }

    if (btnEditJur) btnEditJur.addEventListener('click', () => {
        if (!_isEditMode) {
            // If clicked directly, just open the jurisdiction edit
            openJurisdictionEdit();
        }
    });
    if (btnToggleEditHero) btnToggleEditHero.addEventListener('click', toggleEditMode);

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            closeEditMode();
        });
    }

    // Save Jurisdiction Form
    if (jurForm) {
        jurForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = _getCurrentUser();
            if (!user) return;

            const state = document.getElementById('prof-edit-state').value;
            const district = document.getElementById('prof-edit-district').value;
            const subdistrict = document.getElementById('prof-edit-subdistrict').value;
            const village = document.getElementById('prof-edit-village').value;
            const roleNorm = (user.role || '').toLowerCase().replace(/\s+/g, '');

            if (!state) {
                alert('Please select a State.');
                return;
            }
            if ((roleNorm === 'districtadmin' || roleNorm === 'gpuser') && !district) {
                alert('Please select a District.');
                return;
            }
            if (roleNorm === 'gpuser' && !subdistrict) {
                alert('Please select a Sub-District.');
                return;
            }
            if (roleNorm === 'gpuser' && !village) {
                alert('Please select a Village.');
                return;
            }

            const saveBtn = document.getElementById('save-jurisdiction-btn');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;

            const updatePayload = {
                state: state,
                district: (roleNorm === 'stateadmin') ? null : district,
                sub_district: (roleNorm === 'stateadmin' || roleNorm === 'districtadmin') ? null : subdistrict,
                village: (roleNorm === 'stateadmin' || roleNorm === 'districtadmin') ? null : village
            };

            const { error } = await supabase.from('profiles').update(updatePayload).eq('email', user.email);

            saveBtn.textContent = originalText;
            saveBtn.disabled = false;

            if (error) {
                alert('Failed to update jurisdiction: ' + error.message);
            } else {
                showToast('Jurisdiction updated successfully!');
                Object.assign(user, updatePayload);
                if (_setCurrentUser) _setCurrentUser(user);
                _isEditMode = false; // Reset edit mode on successful save
                renderUserProfile();
            }
        });
    }

    // View Full ID Proof Modal
    const viewFullIdBtn = document.getElementById('profile-view-full-id-btn');
    if (viewFullIdBtn) {
        viewFullIdBtn.addEventListener('click', () => {
            const user = _getCurrentUser();
            if (!user || !user.id_proof_url) return;

            const img = document.getElementById('id-proof-image');
            const noText = document.getElementById('no-id-text');
            if (img) {
                img.src = user.id_proof_url;
                img.classList.remove('hidden');
            }
            if (noText) noText.classList.add('hidden');

            const modal = document.getElementById('id-proof-modal');
            if (modal) {
                let loc = [user.state, user.district, user.sub_district, user.village].filter(Boolean).join(', ') || 'N/A';
                document.getElementById('modal-email').textContent = user.email;
                document.getElementById('modal-role').textContent = user.role;
                document.getElementById('modal-location').textContent = loc;
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
            }
        });
    }

    // Upload New ID Proof
    const updateIdInput = document.getElementById('profile-update-id-input');
    if (updateIdInput) {
        updateIdInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                alert('ID proof file must be less than 2 MB.');
                return;
            }

            const user = _getCurrentUser();
            if (!user) return;

            showToast('Uploading ID Proof...', 'info');

            const fileName = `${Date.now()}_${file.name}`;
            const { error: uploadError } = await supabase.storage.from('id-proofs').upload(fileName, file);

            if (uploadError) {
                alert('Failed to upload ID proof: ' + uploadError.message);
                return;
            }

            const { data: publicUrlData } = supabase.storage.from('id-proofs').getPublicUrl(fileName);
            const newUrl = publicUrlData.publicUrl;

            const { error: updateError } = await supabase.from('profiles').update({ id_proof_url: newUrl }).eq('email', user.email);

            if (updateError) {
                alert('Failed to update profile: ' + updateError.message);
            } else {
                showToast('ID Proof updated successfully!');
                user.id_proof_url = newUrl;
                if (_setCurrentUser) _setCurrentUser(user);
                renderUserProfile();
            }
        });
    }

    // Change Password Form
    const pwdForm = document.getElementById('profile-change-password-form');
    if (pwdForm) {
        pwdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPwd = document.getElementById('prof-new-pwd').value;
            const confirmPwd = document.getElementById('prof-confirm-pwd').value;
            const errEl = document.getElementById('prof-pwd-error');
            const succEl = document.getElementById('prof-pwd-success');
            const btn = document.getElementById('prof-update-pwd-btn');

            errEl.classList.add('hidden');
            succEl.classList.add('hidden');

            if (newPwd !== confirmPwd) {
                errEl.textContent = 'Passwords do not match.';
                errEl.classList.remove('hidden');
                return;
            }

            if (newPwd.length < 6) {
                errEl.textContent = 'Password must be at least 6 characters.';
                errEl.classList.remove('hidden');
                return;
            }

            const originalText = btn.textContent;
            btn.textContent = 'Updating...';
            btn.disabled = true;

            const { error } = await supabase.auth.updateUser({ password: newPwd });

            btn.textContent = originalText;
            btn.disabled = false;

            if (error) {
                errEl.textContent = 'Failed to update password: ' + error.message;
                errEl.classList.remove('hidden');
            } else {
                succEl.textContent = '✓ Password updated successfully!';
                succEl.classList.remove('hidden');
                pwdForm.reset();
                showToast('Password changed successfully!');
            }
        });
    }
}
