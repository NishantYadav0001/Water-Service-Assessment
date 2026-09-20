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
    elements.forEach(el => {
        if (el.id !== 'approve-assessment-btn' && el.id !== 'reject-assessment-btn') {
            el.disabled = isReadOnly;
        }
    });
    document.getElementById('gp-actions').style.display = isReadOnly ? 'none' : 'flex';

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
        id: id,
        status: status,
        payload: payload,
        user_id: currentUser.email,
        state: payload['secA-state'] || currentUser.state,
        district: payload['secA-district'] || currentUser.district,
        sub_district: payload['secA-subdistrict'] || currentUser.sub_district,
        village: payload['secA-village'] || currentUser.village
    };

    const { error } = await supabase.from('assessments').upsert(record);
    if (error) {
        console.error("Failed to save assessment:", error);
        alert('Failed to save assessment: ' + error.message);
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
    const role = session.role;

    if (record.status === 'Rejected') {
        document.getElementById('rejection-alert').classList.remove('hidden');
        document.getElementById('rejection-reason-text').textContent = record.rejection_reason || 'No reason provided.';
        // BUG-F + BUG-S2: For GP User, allow editing and re-submitting rejected forms
        if (role === 'GP User') {
            setFormReadOnly(false);
            document.getElementById('gp-actions').style.display = 'flex';
            // BUG-S2: Disable "Save Draft" for rejected forms to prevent losing rejection context
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
        }
    }

    if (role === 'State Admin' || record.status === 'Approved' || (role === 'GP User' && record.status === 'Submitted')) {
        setFormReadOnly(true);
    } else if (role === 'District Admin' && record.status === 'Submitted') {
        setFormReadOnly(true);
        document.getElementById('admin-actions').classList.remove('hidden');
        document.getElementById('admin-actions').style.display = 'flex';
    }

    // Lock location fields for all users when editing an existing draft to maintain data consistency
    document.getElementById('secA-state').disabled = true;
    document.getElementById('secA-district').disabled = true;
    document.getElementById('secA-subdistrict').disabled = true;
    document.getElementById('secA-village').disabled = true;

    // Visual feedback for uploaded proofs (BUG-H: escape URLs to prevent XSS)
    if (record.payload['inst-image-url']) {
        const help = document.getElementById('inst-image-url').nextElementSibling;
        if (help) help.innerHTML = `<a href="${escapeHtml(record.payload['inst-image-url'])}" target="_blank" class="text-success" data-i18n="view_uploaded_image">View Uploaded Image</a>`;
    }
    if (record.payload['inst-video-url']) {
        const help = document.getElementById('inst-video-url').nextElementSibling;
        if (help) help.innerHTML = `<a href="${escapeHtml(record.payload['inst-video-url'])}" target="_blank" class="text-success" data-i18n="view_uploaded_video">View Uploaded Video</a>`;
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
    document.getElementById('gp-actions').style.display = 'flex';
    document.getElementById('preview-actions').style.display = 'none';
    document.getElementById('admin-actions').classList.add('hidden');
    document.getElementById('admin-actions').style.display = '';
    document.getElementById('rejection-alert').classList.add('hidden');
    setFormReadOnly(false);

    // Reset action bars
    document.getElementById('gp-actions').style.display = 'flex';
    document.getElementById('preview-actions').style.display = 'none';

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
        const saveDraftBtn = document.getElementById('save-draft-btn');
        if (saveDraftBtn) { saveDraftBtn.disabled = false; saveDraftBtn.title = ''; }
        const saveExitBtn = document.getElementById('save-exit-btn');
        if (saveExitBtn) { saveExitBtn.disabled = false; saveExitBtn.title = ''; }

        // Auto-fill and lock location for GP User
        // BUG-S3: Replaced fragile setTimeout chain with event-driven cascading
        if (session.role === 'GP User') {
            await autofillLocationCascade(session);

            document.getElementById('secA-state').disabled = true;
            document.getElementById('secA-district').disabled = true;
            document.getElementById('secA-subdistrict').disabled = true;
            document.getElementById('secA-village').disabled = true;
        }
    }

    // BUG-20: Removed duplicate switchAppView('assessment') call — already called at top of function
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
        if (help) help.innerHTML = `<a href="${publicUrlData.publicUrl}" target="_blank" class="text-success" data-i18n="view_uploaded_image">View Uploaded Image</a>`;
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
            if (help) help.innerHTML = `<a href="${publicUrlData.publicUrl}" target="_blank" class="text-success" data-i18n="view_uploaded_video">View Uploaded Video</a>`;
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
            document.getElementById('gp-actions').style.display = 'none';
            document.getElementById('preview-actions').style.display = 'flex';
            window.scrollTo(0, 0);
            showToast(window.t ? window.t('preview_mode') || 'Preview Mode Activated' : 'Preview Mode Activated');
        }
    });

    // Edit Form (exit preview mode)
    document.getElementById('edit-form-btn').addEventListener('click', () => {
        setFormReadOnly(false);
        document.getElementById('gp-actions').style.display = 'flex';
        document.getElementById('preview-actions').style.display = 'none';

        // Always lock location on edit to prevent accidental reassignment
        document.getElementById('secA-state').disabled = true;
        document.getElementById('secA-district').disabled = true;
        document.getElementById('secA-subdistrict').disabled = true;
        document.getElementById('secA-village').disabled = true;
    });

    // Preview Save Draft
    document.getElementById('preview-save-draft-btn')?.addEventListener('click', async () => {
        await saveAssessment('Draft');
        _setIsFormDirty(false);
        showToast('Draft Saved Successfully from Preview!');
    });

    // Final Submit (MISS-11: loading state)
    const finalSubmitBtn = document.getElementById('final-submit-btn');
    finalSubmitBtn.addEventListener('click', withLoading(finalSubmitBtn, async () => {
        await saveAssessment('Submitted');
        _setIsFormDirty(false);
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
