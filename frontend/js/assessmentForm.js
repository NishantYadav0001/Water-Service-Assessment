/**
 * Assessment Form — form initialization, data collection, save/submit,
 * validation, file uploads, habitation tables, and admin review actions.
 *
 * Exports:
 *   openAssessmentForm(id)   — open the form for new or existing assessment
 *   initAssessmentForm(deps) — wire up all form event listeners
 */

import { supabase } from './supabaseClient.js';
import { escapeHtml, showToast } from './utils.js';
import { getLocationData, populateSelect } from './locations.js';

// Injected dependencies
let _getCurrentUser = null;
let _getIsFormDirty = null;
let _setIsFormDirty = null;
let _switchAppView = null;
let _successModal = null;

// --- DOM references ---
const q1 = document.getElementById('q1-vwsc');
const q2 = document.getElementById('q2-gramsabha');
const declCheckbox = document.getElementById('validation-declaration');
const declLabel = document.getElementById('declaration-label');
const habSelect = document.getElementById('secA-habitations');
const addHabBtn = document.getElementById('add-habitation-btn');
const habFhtcTableBody = document.querySelector('#habitations-fhtc-table tbody');
const habAdequacyTableBody = document.querySelector('#habitations-adequacy-table tbody');
const secAVillage = document.getElementById('secA-village');
const instImageProof = document.getElementById('inst-image-proof');
const instImageUrl = document.getElementById('inst-image-url');
const instVideoProof = document.getElementById('inst-video-proof');
const instVideoUrl = document.getElementById('inst-video-url');
const chargeAmountInput = document.getElementById('secB-chargeAmount');
const chargeWarning = document.getElementById('charge-warning');
const chargesLeviedSelect = document.getElementById('secB-chargesLevied');
const chargeDetailsDiv = document.getElementById('charge-details');
const schoolsTotalInput = document.getElementById('secB-schoolsTotal');
const schoolsPipedInput = document.getElementById('secB-schoolsPiped');
const schoolsError = document.getElementById('schools-error');

// --- Internal Helpers ---

function checkValidationHeader() {
    if (q1.value === 'Yes' && q2.value === 'Yes') {
        declCheckbox.disabled = false;
        declCheckbox.checked = true;
        declLabel.style.opacity = '1';
    } else {
        declCheckbox.disabled = true;
        declCheckbox.checked = false;
        declLabel.style.opacity = '0.5';
    }
}

function renderHabitationTables() {
    const selected = Array.from(habSelect.selectedOptions).map(o => o.value);
    habFhtcTableBody.innerHTML = '';
    habAdequacyTableBody.innerHTML = '';

    selected.forEach((hab, index) => {
        // BUG-S5: Escape habitation names to prevent XSS
        const safeHab = escapeHtml(hab);

        // FHTC Table
        const tr1 = document.createElement('tr');
        tr1.innerHTML = `<td>${safeHab}</td><td><input type="number" name="hab_fhtc_${index}" class="table-input" min="0" required></td>`;
        habFhtcTableBody.appendChild(tr1);

        // Adequacy Table
        const tr2 = document.createElement('tr');
        tr2.innerHTML = `<td>${safeHab}</td><td><input type="number" name="hab_adeq_${index}" class="table-input" min="0" required></td>`;
        habAdequacyTableBody.appendChild(tr2);
    });
}

function setFormReadOnly(isReadOnly) {
    const form = document.getElementById('assessment-form');
    const elements = form.querySelectorAll('input, select, textarea, button:not(#back-to-dashboard)');
    const excludeIds = [
        'approve-assessment-btn', 
        'reject-assessment-btn', 
        'edit-form-btn', 
        'final-submit-btn', 
        'preview-save-draft-btn'
    ];
    elements.forEach(el => {
        if (!excludeIds.includes(el.id)) {
            el.disabled = isReadOnly;
        }
    });
    if (isReadOnly) {
        document.getElementById('gp-actions').classList.add('hidden');
        form.classList.add('readonly-mode');
    } else {
        document.getElementById('gp-actions').classList.remove('hidden');
        form.classList.remove('readonly-mode');
    }

    // Exception for add-habitation button
    const addHabBtnEl = document.getElementById('add-habitation-btn');
    if (addHabBtnEl) addHabBtnEl.style.display = isReadOnly ? 'none' : 'block';
}

function markFormDirty() {
    _setIsFormDirty(true);
}

function collectFormData() {
    const form = document.getElementById('assessment-form');

    // BUG-04: Use try/finally to guarantee re-disabling fields
    const disabledElements = form.querySelectorAll(':disabled');
    disabledElements.forEach(el => el.disabled = false);

    const fullData = {};
    try {
        const formData = new FormData(form);

        // Process FormData for named elements
        formData.forEach((value, key) => {
            if (!fullData[key]) {
                fullData[key] = value;
            } else {
                fullData[key] = fullData[key] + "," + value;
            }
        });

        // Collect elements that have an ID but no name
        const elements = form.querySelectorAll('input[id], select[id], textarea[id]');
        elements.forEach(el => {
            if (!el.name) {
                if (el.type === 'checkbox' || el.type === 'radio') {
                    if (el.checked) fullData[el.id] = el.value || 'on';
                } else if (el.multiple) {
                    const selected = Array.from(el.selectedOptions).map(o => o.value);
                    if (selected.length > 0) fullData[el.id] = selected.join(',');
                } else {
                    fullData[el.id] = el.value;
                }
            }
        });
    } finally {
        // Re-disable elements even if an error occurs
        disabledElements.forEach(el => el.disabled = true);
    }

    // Ensure cascading dropdowns are explicitly captured (read .value directly, works even if disabled)
    fullData['secA-state'] = document.getElementById('secA-state').value;
    fullData['secA-district'] = document.getElementById('secA-district').value;
    fullData['secA-subdistrict'] = document.getElementById('secA-subdistrict').value;
    fullData['secA-village'] = document.getElementById('secA-village').value;

    // Legacy keys to support old drafts
    fullData['state'] = fullData['secA-state'];
    fullData['district'] = fullData['secA-district'];
    fullData['subdistrict'] = fullData['secA-subdistrict'];
    fullData['village'] = fullData['secA-village'];

    return fullData;
}

async function saveAssessment(status) {
    const currentUser = _getCurrentUser();
    const id = document.getElementById('recordId').value;
    const payload = collectFormData();

    const record = {
        status: status,
        payload: payload,
        user_id: currentUser.email,
        state: payload['secA-state'] || currentUser.state,
        district: payload['secA-district'] || currentUser.district,
        sub_district: payload['secA-subdistrict'] || currentUser.sub_district,
        village: payload['secA-village'] || currentUser.village
    };
    
    if (id && status.toLowerCase() === 'submitted') {
        // RLS Workaround: UPDATE policy blocks transitioning status to 'Submitted'.
        // We bypass this by reverting to 'Draft', deleting the old record, and inserting a new one.
        await supabase.from('assessments').update({ status: 'Draft' }).eq('id', id);
        const { error: delErr } = await supabase.from('assessments').delete().eq('id', id);
        if (delErr) {
            console.error("Failed to delete old draft:", delErr);
            alert('Failed to process submission due to server policy. Error deleting old draft: ' + delErr.message);
            return;
        }
        record.id = id;
    } else if (id) {
        record.id = id;
    }

    const { data, error } = await supabase.from('assessments').upsert(record).select().single();
    if (error) {
        console.error("Failed to save assessment:", error);
        alert('Failed to save assessment: ' + error.message);
    } else if (data) {
        document.getElementById('recordId').value = data.id;
    }
}

async function loadAssessmentData(id) {
    const locationData = getLocationData();
    const { data: record, error } = await supabase.from('assessments').select('*').eq('id', id).single();
    if (error || !record) {
        console.error("Failed to load assessment data:", error);
        return;
    }

    // Populate location dropdowns manually so values can be set
    const state = record.payload['secA-state'] || record.state;
    const district = record.payload['secA-district'] || record.district;
    const subdistrict = record.payload['secA-subdistrict'] || record.sub_district;
    const village = record.payload['secA-village'] || record.village;

    if (state && locationData[state]) {
        document.getElementById('secA-state').value = state;
        populateSelect(document.getElementById('secA-district'), Object.keys(locationData[state]).sort(), 'Select District');

        if (district && locationData[state][district]) {
            document.getElementById('secA-district').value = district;
            populateSelect(document.getElementById('secA-subdistrict'), Object.keys(locationData[state][district]).sort(), 'Select Sub-District');

            if (subdistrict && locationData[state][district][subdistrict]) {
                document.getElementById('secA-subdistrict').value = subdistrict;
                populateSelect(document.getElementById('secA-village'), locationData[state][district][subdistrict].sort(), 'Select Village');

                if (village) {
                    document.getElementById('secA-village').value = village;
                    document.getElementById('form-title-mode').textContent = 'Assessment for ' + village;
                }
            }
        }
    }

    // Restore habitations options manually because they are dynamically populated
    const habSelectEl = document.getElementById('secA-habitations');
    const savedHabs = record.payload['secA-habitations'] || record.payload['habitations'];
    if (savedHabs) {
        const habsArr = savedHabs.split(',');
        habSelectEl.innerHTML = '';
        habsArr.forEach(hab => {
            const opt = document.createElement('option');
            opt.value = hab;
            opt.textContent = hab;
            opt.selected = true;
            habSelectEl.appendChild(opt);
        });
        renderHabitationTables();
    }

    // Naive population mapping for prototype
    Object.keys(record.payload).forEach(key => {
        const val = record.payload[key];
        if (val === undefined || val === null) return;

        // First try by ID directly
        let el = document.getElementById(key);

        // Fallback for legacy keys (like 'date' instead of 'secA-date')
        if (!el) el = document.getElementById(`secA-${key}`) || document.getElementById(`secB-${key}`) || document.getElementById(`secC-${key}`) || document.getElementById(`secD-${key}`) || document.getElementById(`secE-${key}`);

        if (el) {
            // Skip file inputs — browsers forbid setting their value programmatically
            if (el.type === 'file') return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = (val === 'on' || val === el.value || val === true);
            } else {
                el.value = val;
            }
        } else {
            // Try by name for things like checkboxes, radios, or arrays (like membersPresent)
            const elsByName = document.getElementsByName(key);
            if (elsByName.length > 0) {
                const valArray = typeof val === 'string' ? val.split(',') : [val];
                elsByName.forEach(nameEl => {
                    if (nameEl.type === 'checkbox' || nameEl.type === 'radio') {
                        nameEl.checked = valArray.includes(nameEl.value);
                    } else {
                        nameEl.value = val;
                    }
                });
            }
        }
    });

    const session = _getCurrentUser();
    const role = String(session.role).trim();
    const status = String(record.status).trim().toLowerCase();

    // Show rejection alert for all roles
    if (status === 'rejected') {
        document.getElementById('rejection-alert').classList.remove('hidden');
        document.getElementById('rejection-reason-text').textContent = record.rejection_reason || 'No reason provided.';
    }

    // GP User-specific form state logic
    if (role === 'GP User') {
        if (status === 'rejected') {
            // Allow GP User to edit and re-submit rejected forms
            if (session.account_status !== 'restricted') {
                setFormReadOnly(false);
                document.getElementById('gp-actions').classList.remove('hidden');
                // Disable "Save Draft" for rejected forms
                const saveDraftBtn = document.getElementById('save-draft-btn');
                if (saveDraftBtn) {
                    saveDraftBtn.disabled = true;
                    saveDraftBtn.title = 'Rejected forms cannot be saved as drafts. Please re-submit.';
                }
                const saveExitBtn = document.getElementById('save-exit-btn');
                if (saveExitBtn) {
                    saveExitBtn.disabled = true;
                    saveExitBtn.title = 'Rejected forms cannot be saved as drafts. Please re-submit.';
                }
            } else {
                // Restricted GP User cannot edit anything
                setFormReadOnly(true);
                document.getElementById('gp-actions').classList.add('hidden');
            }
        } else if (status === 'submitted' || status === 'approved') {
            // GP User cannot edit submitted or approved forms
            setFormReadOnly(true);
            document.getElementById('gp-actions').classList.add('hidden');
        }
    }
    // Admin lock is handled by MEGA-LOCK in openAssessmentForm's finally block

    // Visual feedback for uploaded proofs (BUG-H: escape URLs to prevent XSS)
    if (record.payload['inst-image-url']) {
        const help = document.getElementById('inst-image-url').nextElementSibling;
        const url = escapeHtml(record.payload['inst-image-url']);
        if (help) help.innerHTML = `<a href="#" onclick="event.preventDefault(); window.open('${url}', '_blank', 'noopener,noreferrer');" class="text-success" data-i18n="view_uploaded_image">View Uploaded Image</a>`;
    }
    if (record.payload['inst-video-url']) {
        const help = document.getElementById('inst-video-url').nextElementSibling;
        const url = escapeHtml(record.payload['inst-video-url']);
        if (help) help.innerHTML = `<a href="#" onclick="event.preventDefault(); window.open('${url}', '_blank', 'noopener,noreferrer');" class="text-success" data-i18n="view_uploaded_video">View Uploaded Video</a>`;
    }

    // BUG-I: Re-trigger charge details toggle based on loaded data
    const chargesLeviedEl = document.getElementById('secB-chargesLevied');
    if (chargesLeviedEl) chargesLeviedEl.dispatchEvent(new Event('change'));

    // Re-trigger checks
    checkValidationHeader();
}

// --- Public API ---

export async function openAssessmentForm(id = null) {
    _setIsFormDirty(false);
    _switchAppView('assessment');
    document.getElementById('assessment-form').reset();

    // Listen to form inputs to mark form as dirty
    const form = document.getElementById('assessment-form');
    form.removeEventListener('input', markFormDirty);
    form.removeEventListener('change', markFormDirty);
    form.addEventListener('input', markFormDirty);
    form.addEventListener('change', markFormDirty);
    // BUG-19: Use local date to avoid timezone issues
    document.getElementById('secA-date').max = new Date().toLocaleDateString('en-CA');
    habSelect.innerHTML = ''; // clear habitations
    checkValidationHeader();
    renderHabitationTables();

    const session = _getCurrentUser();
    const isAdmin = session && ['district admin', 'state admin'].includes(String(session.role).trim().toLowerCase());

    // Reset all action bars to default state
    document.getElementById('gp-actions').classList.remove('hidden');
    document.getElementById('gp-actions').style.display = ''; // Reset inline style
    document.getElementById('preview-actions').classList.add('hidden');
    document.getElementById('admin-actions').classList.add('hidden');
    document.getElementById('rejection-alert').classList.add('hidden');
    document.getElementById('preview-banner').classList.add('hidden');
    document.body.classList.remove('preview-banner-active');
    document.getElementById('consent-modal').classList.add('hidden');
    setFormReadOnly(false);

    // If admin, lock the form BEFORE loading data (so it's never editable even briefly)
    if (isAdmin) {
        setFormReadOnly(true);
        document.getElementById('gp-actions').classList.add('hidden');
        document.getElementById('gp-actions').style.display = 'none';
    }

    try {
        if (id) {
            document.getElementById('form-title-mode').textContent = 'Edit Assessment';
            document.getElementById('recordId').value = id;
            await loadAssessmentData(id);
            // Always lock location fields when editing an existing form
            document.getElementById('secA-state').disabled = true;
            document.getElementById('secA-district').disabled = true;
            document.getElementById('secA-subdistrict').disabled = true;
            document.getElementById('secA-village').disabled = true;
        } else {
            document.getElementById('form-title-mode').textContent = 'New Assessment';
            document.getElementById('recordId').value = 'REC-' + Date.now();

            // BUG-S2: Ensure save-draft buttons are re-enabled for new forms
            if (!isAdmin) {
                const saveDraftBtn = document.getElementById('save-draft-btn');
                if (saveDraftBtn) { saveDraftBtn.disabled = false; saveDraftBtn.title = ''; }
                const saveExitBtn = document.getElementById('save-exit-btn');
                if (saveExitBtn) { saveExitBtn.disabled = false; saveExitBtn.title = ''; }
            }

            // Auto-fill and lock location for GP User
            if (session.role === 'GP User') {
                await autofillLocationCascade(session);
                document.getElementById('secA-state').disabled = true;
                document.getElementById('secA-district').disabled = true;
                document.getElementById('secA-subdistrict').disabled = true;
                document.getElementById('secA-village').disabled = true;
            }
        }
    } catch (err) {
        console.error('Error loading assessment form:', err);
    } finally {
        // MEGA-LOCK: This ALWAYS runs, even if loadAssessmentData crashes.
        // District Admin and State Admin must NEVER see an editable form.
        if (isAdmin) {
            setFormReadOnly(true);

            // Force-hide GP actions with both class AND inline style
            const gpActions = document.getElementById('gp-actions');
            if (gpActions) {
                gpActions.classList.add('hidden');
                gpActions.style.display = 'none';
            }

            // Force-hide preview actions
            const previewActions = document.getElementById('preview-actions');
            if (previewActions) {
                previewActions.classList.add('hidden');
                previewActions.style.display = 'none';
            }

            // Show admin Approve/Reject buttons ONLY for existing records with 'submitted' status
            const adminActions = document.getElementById('admin-actions');
            if (adminActions) {
                // Check if this is a submitted form that needs review
                const recordId = document.getElementById('recordId').value;
                const isExistingRecord = id && recordId && !recordId.startsWith('REC-');
                if (isExistingRecord || id) {
                    adminActions.classList.remove('hidden');
                    adminActions.style.display = 'flex';
                }
            }

            // Disable all location fields for admin
            ['secA-state', 'secA-district', 'secA-subdistrict', 'secA-village'].forEach(elId => {
                const el = document.getElementById(elId);
                if (el) el.disabled = true;
            });
        }
    }
}

/**
 * BUG-S3: Event-driven cascade for auto-filling location dropdowns.
 * Waits for each dropdown to be populated before setting the next value.
 */
async function autofillLocationCascade(session) {
    function waitForOptions(selectEl, maxWait = 2000) {
        return new Promise(resolve => {
            if (selectEl.options.length > 1) { resolve(); return; }
            const observer = new MutationObserver(() => {
                if (selectEl.options.length > 1) {
                    observer.disconnect();
                    resolve();
                }
            });
            observer.observe(selectEl, { childList: true });
            setTimeout(() => { observer.disconnect(); resolve(); }, maxWait);
        });
    }

    const stateEl = document.getElementById('secA-state');
    const distEl = document.getElementById('secA-district');
    const subDistEl = document.getElementById('secA-subdistrict');
    const villageEl = document.getElementById('secA-village');

    if (session.state) {
        stateEl.value = session.state;
        stateEl.dispatchEvent(new Event('change'));
    }
    if (session.district) {
        await waitForOptions(distEl);
        distEl.value = session.district;
        distEl.dispatchEvent(new Event('change'));
    }
    if (session.sub_district) {
        await waitForOptions(subDistEl);
        subDistEl.value = session.sub_district;
        subDistEl.dispatchEvent(new Event('change'));
    }
    if (session.village) {
        await waitForOptions(villageEl);
        villageEl.value = session.village;
        villageEl.dispatchEvent(new Event('change'));
    }
}

/**
 * Wire up all assessment form event listeners.
 *
 * @param {Object} deps
 * @param {Function} deps.getCurrentUser
 * @param {Function} deps.getIsFormDirty
 * @param {Function} deps.setIsFormDirty
 * @param {Function} deps.switchAppView
 * @param {HTMLElement} deps.successModal
 */
export function initAssessmentForm(deps) {
    _getCurrentUser = deps.getCurrentUser;
    _getIsFormDirty = deps.getIsFormDirty;
    _setIsFormDirty = deps.setIsFormDirty;
    _switchAppView = deps.switchAppView;
    _successModal = deps.successModal;

    // Prevent native form submission — without this, clicking dynamically created
    // links (View Uploaded Image/Video) or pressing Enter inside text inputs
    // triggers a full page reload, resetting the SPA back to the dashboard.
    const assessmentForm = document.getElementById('assessment-form');
    assessmentForm.addEventListener('submit', (e) => {
        e.preventDefault();
    });

    // Institutional validation header checks
    q1.addEventListener('change', checkValidationHeader);
    q2.addEventListener('change', checkValidationHeader);

    // Image Proof Upload
    instImageProof.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 1 * 1024 * 1024) {
            alert('Image must be less than 1 MB.');
            e.target.value = '';
            instImageUrl.value = '';
            return;
        }

        const fileName = `assessment_img_${Date.now()}_${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('id-proofs').upload(fileName, file);
        if (uploadError) {
            alert('Failed to upload image: ' + uploadError.message);
            e.target.value = '';
            return;
        }
        const { data: publicUrlData } = supabase.storage.from('id-proofs').getPublicUrl(fileName);
        instImageUrl.value = publicUrlData.publicUrl;
        const help = instImageUrl.nextElementSibling;
        if (help) help.innerHTML = `<a href="#" onclick="event.preventDefault(); window.open('${publicUrlData.publicUrl}', '_blank', 'noopener,noreferrer');" class="text-success" data-i18n="view_uploaded_image">View Uploaded Image</a>`;
    });

    // Video Proof Upload
    instVideoProof.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('Video must be less than 5 MB.');
            e.target.value = '';
            instVideoUrl.value = '';
            return;
        }

        const video = document.createElement('video');
        video.preload = 'metadata';

        const processVideo = async function() {
            window.URL.revokeObjectURL(video.src);
            if (video.duration > 120) {
                alert('Video length must be strictly less than 2 minutes.');
                e.target.value = '';
                instVideoUrl.value = '';
                return;
            }

            const fileName = `assessment_vid_${Date.now()}_${file.name}`;
            const { data: uploadData, error: uploadError } = await supabase.storage.from('id-proofs').upload(fileName, file);
            if (uploadError) {
                alert('Failed to upload video: ' + uploadError.message);
                e.target.value = '';
                return;
            }
            const { data: publicUrlData } = supabase.storage.from('id-proofs').getPublicUrl(fileName);
            instVideoUrl.value = publicUrlData.publicUrl;
            const help = instVideoUrl.nextElementSibling;
            if (help) help.innerHTML = `<a href="#" onclick="event.preventDefault(); window.open('${publicUrlData.publicUrl}', '_blank', 'noopener,noreferrer');" class="text-success" data-i18n="view_uploaded_video">View Uploaded Video</a>`;
        };

        video.onloadedmetadata = function () {
            if (video.duration === Infinity) {
                video.currentTime = 1e101;
                video.ontimeupdate = function() {
                    this.ontimeupdate = () => { return; };
                    video.currentTime = 0;
                    processVideo();
                };
            } else {
                processVideo();
            }
        };
        video.src = URL.createObjectURL(file);
    });

    // Dynamic Village Title & Habitations
    secAVillage.addEventListener('change', () => {
        const v = secAVillage.value;
        if (v) {
            document.getElementById('form-title-mode').textContent = 'Assessment for ' + v;
            // auto-populate habitation with village name if empty
            if (habSelect.options.length === 0) {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                opt.selected = true;
                habSelect.appendChild(opt);
                renderHabitationTables();
            }
        } else {
            document.getElementById('form-title-mode').textContent = document.getElementById('recordId').value.startsWith('REC') ? 'New Assessment' : 'Edit Assessment';
        }
    });

    addHabBtn.addEventListener('click', () => {
        const name = prompt('Enter Habitation Name:');
        if (name) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            opt.selected = true;
            habSelect.appendChild(opt);
            renderHabitationTables();
        }
    });

    habSelect.addEventListener('change', renderHabitationTables);

    // Charge amount validation
    chargeAmountInput.addEventListener('input', (e) => {
        let val = e.target.value;
        if (val.length > 3) e.target.value = val.slice(0, 3);

        if (parseInt(e.target.value) > 150) {
            chargeWarning.classList.remove('hidden');
        } else {
            chargeWarning.classList.add('hidden');
        }
    });

    // BUG-28: Toggle charge details visibility based on "charges levied" selection
    chargesLeviedSelect.addEventListener('change', () => {
        if (chargesLeviedSelect.value === 'No') {
            chargeDetailsDiv.classList.add('hidden');
            document.getElementById('secB-chargeType').required = false;
            document.getElementById('secB-chargeAmount').required = false;
        } else {
            chargeDetailsDiv.classList.remove('hidden');
            document.getElementById('secB-chargeType').required = true;
            document.getElementById('secB-chargeAmount').required = true;
        }
    });

    // BUG-27: Validate schools piped cannot exceed total
    function validateSchoolsPiped() {
        const total = parseInt(schoolsTotalInput.value) || 0;
        const piped = parseInt(schoolsPipedInput.value) || 0;
        if (piped > total && total > 0) {
            schoolsError.classList.remove('hidden');
            schoolsPipedInput.setCustomValidity('Cannot exceed total count');
        } else {
            schoolsError.classList.add('hidden');
            schoolsPipedInput.setCustomValidity('');
        }
    }
    schoolsTotalInput.addEventListener('input', validateSchoolsPiped);
    schoolsPipedInput.addEventListener('input', validateSchoolsPiped);

    // MISS-11: Helper to disable/enable a button with loading text
    function withLoading(btn, asyncFn) {
        return async (...args) => {
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Saving...';
            try {
                await asyncFn(...args);
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        };
    }

    // Save Draft
    const saveDraftBtn = document.getElementById('save-draft-btn');
    saveDraftBtn.addEventListener('click', withLoading(saveDraftBtn, async () => {
        await saveAssessment('Draft');
        _setIsFormDirty(false);
        showToast('Draft Saved Successfully!');
    }));

    // Save & Exit
    const saveExitBtn = document.getElementById('save-exit-btn');
    saveExitBtn.addEventListener('click', withLoading(saveExitBtn, async () => {
        await saveAssessment('Draft');
        _setIsFormDirty(false);
        showToast('Draft Saved!');
        _switchAppView('dashboard');
    }));

    // Submit Assessment (enters preview mode)
    document.getElementById('submit-assessment-btn').addEventListener('click', async (e) => {
        e.preventDefault();

        const form = document.getElementById('assessment-form');

        // Strict Validation Check
        const village = document.getElementById('secA-village').value;
        if (!village) {
            alert('Please select a Village to submit the assessment.');
            return;
        }

        if (q1.value !== 'Yes' || q2.value !== 'Yes' || !declCheckbox.checked) {
            alert('Cannot submit unless Institutional Validation is complete (both questions must be Yes and declaration checked).');
            return;
        }

        const imageUrl = document.getElementById('inst-image-url').value;
        const videoUrl = document.getElementById('inst-video-url').value;
        if (!imageUrl || !videoUrl) {
            alert('Please upload both Image and Video proofs for Institutional Validation.');
            return;
        }

        const checkboxGroups = [
            { name: 'membersPresent', label: window.t ? window.t('members_present') || 'Members Present' : 'Members Present' },
            { name: 'waterSource', label: window.t ? window.t('water_source') || 'Source of water supply' : 'Source of water supply' },
            { name: 'leakDetect', label: window.t ? window.t('leak_methods') || 'Leak detection methods' : 'Leak detection methods' },
            { name: 'gpIssues', label: window.t ? window.t('gp_issues') || 'Checklist of GP Issues' : 'Checklist of GP Issues' }
        ];

        for (const group of checkboxGroups) {
            const checkedCount = document.querySelectorAll(`input[name="${group.name}"]:checked`).length;
            if (checkedCount === 0) {
                alert(`Please select at least one option for: ${group.label}`);
                return;
            }
        }

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (confirm(window.t ? window.t('preview_confirm') || 'Are you sure you want to review your assessment before final submission?' : 'Are you sure you want to review your assessment before final submission?')) {
            setFormReadOnly(true);
            document.getElementById('gp-actions').classList.add('hidden');
            document.getElementById('preview-actions').classList.remove('hidden');
            
            // Show preview banner
            document.getElementById('preview-banner').classList.remove('hidden');
            document.body.classList.add('preview-banner-active');
            
            // Fallback texts if translations missing
            const bannerTitle = document.querySelector('#preview-banner strong');
            if (bannerTitle && bannerTitle.textContent === 'preview_mode_title') {
                bannerTitle.textContent = 'Preview Mode — Review Your Assessment';
            }
            const bannerDesc = document.querySelector('#preview-banner p');
            if (bannerDesc && bannerDesc.textContent === 'preview_mode_desc') {
                bannerDesc.textContent = 'All fields are read-only. Review your details carefully before final submission.';
            }

            document.getElementById('form-title-mode').textContent = '📋 Preview — Review Your Assessment';
            window.scrollTo(0, 0);
            showToast(window.t ? window.t('preview_mode') || 'Preview Mode Activated — Review your details below' : 'Preview Mode Activated — Review your details below');
        }
    });

    // Edit Form (exit preview mode)
    document.getElementById('edit-form-btn').addEventListener('click', () => {
        setFormReadOnly(false);
        document.getElementById('gp-actions').classList.remove('hidden');
        document.getElementById('preview-actions').classList.add('hidden');
        // Hide preview banner
        document.getElementById('preview-banner').classList.add('hidden');
        document.body.classList.remove('preview-banner-active');
        // Restore form title
        const village = document.getElementById('secA-village').value;
        document.getElementById('form-title-mode').textContent = village ? 'Assessment for ' + village : 'Edit Assessment';

        // Re-apply Section A locks if it's an existing draft
        const isNew = document.getElementById('recordId').value.startsWith('REC-');
        if (!isNew) {
            document.getElementById('secA-state').disabled = true;
            document.getElementById('secA-district').disabled = true;
            document.getElementById('secA-subdistrict').disabled = true;
            document.getElementById('secA-village').disabled = true;
        }
    });

    // Preview Save Draft
    document.getElementById('preview-save-draft-btn')?.addEventListener('click', async () => {
        await saveAssessment('Draft');
        _setIsFormDirty(false);
        showToast('Draft Saved Successfully from Preview!');
    });

    // Final Submit — now opens consent modal instead of directly submitting
    const finalSubmitBtn = document.getElementById('final-submit-btn');
    finalSubmitBtn.addEventListener('click', () => {
        // Open consent modal
        const consentModal = document.getElementById('consent-modal');
        const consentInput = document.getElementById('consent-agree-input');
        const consentCheckbox = document.getElementById('consent-declaration-checkbox');
        const consentSubmitBtn = document.getElementById('consent-submit-btn');

        // Reset consent modal state
        consentInput.value = '';
        consentInput.className = 'consent-text-input';
        consentCheckbox.checked = false;
        consentSubmitBtn.disabled = true;
        document.getElementById('consent-agree-hint').className = 'consent-hint';
        document.getElementById('consent-agree-hint').textContent = 'You must type exactly "AGREE" (case-sensitive)';

        // Fallback texts if translations missing
        const title = document.getElementById('consent-modal-title');
        if (title && title.textContent === 'final_consent_title') title.textContent = 'Final Consent Required';
        
        const desc = document.querySelector('.consent-description');
        if (desc && desc.textContent.trim() === 'consent_desc') {
            desc.textContent = 'By submitting this assessment, you confirm that all the information provided is accurate and complete to the best of your knowledge. This assessment will be sent to the District Admin for approval. Once submitted, you will not be able to edit this form.';
        }
        
        const typeLabel = document.querySelector('label[for="consent-agree-input"]');
        if (typeLabel && typeLabel.textContent.includes('consent_type_agree')) {
            typeLabel.innerHTML = 'Type <strong>"AGREE"</strong> below to confirm your consent:';
        }

        const checkboxLabel = document.querySelector('.consent-checkbox-label span');
        if (checkboxLabel && checkboxLabel.textContent.trim() === 'consent_checkbox_text') {
            checkboxLabel.textContent = 'I hereby declare that all the information furnished in this assessment form is true, correct, and complete. I understand that submitting false information may lead to rejection of this assessment and further action.';
        }

        const goBack = document.getElementById('consent-cancel-btn');
        if (goBack && goBack.textContent.includes('go_back')) goBack.textContent = '← Go Back to Preview';

        const submitBtn = document.getElementById('consent-submit-btn');
        if (submitBtn && submitBtn.textContent.trim() === 'confirm_submit') submitBtn.textContent = 'Confirm & Submit';

        consentModal.classList.remove('hidden');
    });

    // --- Consent Modal Logic ---
    const consentAgreeInput = document.getElementById('consent-agree-input');
    const consentDeclCheckbox = document.getElementById('consent-declaration-checkbox');
    const consentSubmitBtn = document.getElementById('consent-submit-btn');
    const consentHint = document.getElementById('consent-agree-hint');

    function validateConsentForm() {
        const agreeTyped = consentAgreeInput.value.trim() === 'AGREE';
        const checkboxChecked = consentDeclCheckbox.checked;

        // Visual feedback for text input
        if (consentAgreeInput.value.trim().length === 0) {
            consentAgreeInput.className = 'consent-text-input';
            consentHint.className = 'consent-hint';
            consentHint.textContent = 'You must type exactly "AGREE" (case-sensitive)';
        } else if (agreeTyped) {
            consentAgreeInput.className = 'consent-text-input valid';
            consentHint.className = 'consent-hint valid';
            consentHint.textContent = '✓ Consent text verified';
        } else {
            consentAgreeInput.className = 'consent-text-input invalid';
            consentHint.className = 'consent-hint invalid';
            consentHint.textContent = '✗ Please type exactly "AGREE" (case-sensitive)';
        }

        // Enable/disable submit button
        consentSubmitBtn.disabled = !(agreeTyped && checkboxChecked);
    }

    consentAgreeInput.addEventListener('input', validateConsentForm);
    consentDeclCheckbox.addEventListener('change', validateConsentForm);

    // Cancel consent → go back to preview
    document.getElementById('consent-cancel-btn').addEventListener('click', () => {
        document.getElementById('consent-modal').classList.add('hidden');
    });

    // Confirm & Submit from consent modal
    consentSubmitBtn.addEventListener('click', withLoading(consentSubmitBtn, async () => {
        // Double-check consent conditions
        if (consentAgreeInput.value.trim() !== 'AGREE' || !consentDeclCheckbox.checked) {
            showToast('Please complete all consent requirements before submitting.', 'error');
            return;
        }

        await saveAssessment('Submitted');
        _setIsFormDirty(false);

        // Close consent modal and hide preview banner
        document.getElementById('consent-modal').classList.add('hidden');
        document.getElementById('preview-banner').classList.add('hidden');
        document.body.classList.remove('preview-banner-active');

        _successModal.classList.remove('hidden');
    }));

    // Approve Assessment (admin) — MISS-7: Added confirmation + MISS-11: loading state
    const approveBtn = document.getElementById('approve-assessment-btn');
    approveBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to approve this assessment? This action cannot be undone.')) return;

        const originalText = approveBtn.textContent;
        approveBtn.disabled = true;
        approveBtn.textContent = 'Approving...';

        const id = document.getElementById('recordId').value;
        const { error } = await supabase.from('assessments').update({ status: 'Approved' }).eq('id', id);

        approveBtn.disabled = false;
        approveBtn.textContent = originalText;

        if (error) {
            alert('Failed to approve assessment: ' + error.message);
        } else {
            showToast('Assessment Approved Successfully!');
            _switchAppView('dashboard');
        }
    });

    // Reject Assessment (admin) — MISS-11: loading state
    const rejectBtn = document.getElementById('reject-assessment-btn');
    rejectBtn.addEventListener('click', async () => {
        const reason = prompt('Please enter the reason for rejection:');
        if (!reason) {
            alert('Reason is required to reject a form.');
            return;
        }

        const originalText = rejectBtn.textContent;
        rejectBtn.disabled = true;
        rejectBtn.textContent = 'Rejecting...';

        const id = document.getElementById('recordId').value;

        const { error } = await supabase.from('assessments').update({
            status: 'Rejected',
            rejection_reason: reason
        }).eq('id', id);

        rejectBtn.disabled = false;
        rejectBtn.textContent = originalText;

        if (error) {
            alert('Failed to reject assessment: ' + error.message);
        } else {
            showToast('Assessment Rejected');
            _switchAppView('dashboard');
        }
    });
}
