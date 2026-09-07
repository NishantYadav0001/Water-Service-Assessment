document.addEventListener('DOMContentLoaded', async () => {
    
    // --- State & Constants ---
    
    // --- Supabase Init ---
    const supabaseUrl = 'https://qhveywofcqrqoldtoffv.supabase.co';
    const supabaseKey = 'sb_publishable_meCCJDiUjETM4rpQNMSMng_oxRp84Wc';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    let currentUser = null;

    let locationData = {};
    let isLocationDataLoaded = false;
    let isRegistering = false;
    let isFormDirty = false;
    let filterLockedForRole = false; // Flag to ensure filter locking runs only once per login

    // BUG-06: Sanitize user input before inserting into innerHTML
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }

    // BUG-02: Safe translation helper that never throws
    function safeT(key, fallback) {
        try {
            if (window.t) return window.t(key) || fallback || key;
        } catch(e) { /* ignore */ }
        return fallback || key;
    }

    // Views
    const authLayout = document.getElementById('auth-layout');
    const appLayout = document.getElementById('app-layout');
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const assessmentView = document.getElementById('form-view');
    const superadminView = document.getElementById('user-management-view');
    const navToggleBtn = document.getElementById('nav-toggle-btn');
    const idProofModal = document.getElementById('id-proof-modal');
    const successModal = document.getElementById('success-modal');

    if (window.initLanguage) {
        await window.initLanguage();
    }

    // Navigation Events
    const btnNewForm = document.getElementById('btn-new-form');
    if (btnNewForm) {
        btnNewForm.addEventListener('click', async () => {
            // BUG-09: user-scoped draft count, now querying Supabase
            const { data: drafts, error } = await supabase.from('assessments').select('id').eq('user_id', currentUser.email).eq('status', 'Draft');
            if (error) {
                // If table doesn't exist yet (code 42P01) or no rows, allow creation
                console.warn("Draft count check returned error (table may not exist yet):", error.message);
            }
            const draftCount = (drafts && !error) ? drafts.length : 0;
            if (draftCount >= 2) {
                alert('You can only have up to 2 unfinished drafts. Please submit or delete an existing draft before starting a new one.');
                return;
            }
            openAssessmentForm(null);
        });
    }
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        if (isFormDirty) {
            if (!confirm('You have unsaved changes. Are you sure you want to leave? Your filled data may be lost.')) return;
        }
        switchAppView('dashboard');
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        if (isFormDirty) {
            if (!confirm('You have unsaved changes. Are you sure you want to logout? Your filled data may be lost.')) return;
        }
        logout();
    });
    
    document.getElementById('close-modal-btn').addEventListener('click', () => {
        successModal.classList.add('hidden');
        switchAppView('dashboard');
    });
    
    window.addEventListener('beforeunload', (e) => {
        if (isFormDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    document.addEventListener('languageChanged', () => {
        if (!dashboardView.classList.contains('hidden')) {
            renderDashboard();
        }
    });

    // Navigation Functions
    function switchAppView(view) {
        dashboardView.classList.add('hidden');
        dashboardView.classList.remove('active');
        assessmentView.classList.add('hidden');
        assessmentView.classList.remove('active');
        if (superadminView) {
            superadminView.classList.add('hidden');
            superadminView.classList.remove('active');
        }

        if (view === 'dashboard') {
            // BUG-23: Reset draft filter when returning to dashboard
            showDraftsOnly = false;
            const draftsBtn = document.getElementById('btn-view-drafts');
            if (draftsBtn) {
                draftsBtn.textContent = safeT('view_drafts', 'View Unfinished Forms');
                draftsBtn.classList.replace('btn-secondary', 'btn-outline');
            }
            const recordsTitle = document.getElementById('records-card-title');
            if (recordsTitle) recordsTitle.textContent = safeT('assessment_records', 'Assessment Records');

            dashboardView.classList.remove('hidden');
            dashboardView.classList.add('active');
            renderDashboard();
        } else if (view === 'superadmin') {
            if (superadminView) {
                superadminView.classList.remove('hidden');
                superadminView.classList.add('active');
                renderSuperAdminDashboard();
            }
        } else {
            assessmentView.classList.remove('hidden');
            assessmentView.classList.add('active');
        }
    }

    if (navToggleBtn) {
        navToggleBtn.addEventListener('click', () => {
            const isUserManagement = superadminView && superadminView.classList.contains('active');
            if (isUserManagement) {
                switchAppView('dashboard');
                navToggleBtn.setAttribute('data-i18n', 'manage_users');
                navToggleBtn.textContent = window.t ? window.t('manage_users') : 'Manage Users';
            } else {
                switchAppView('superadmin');
                navToggleBtn.setAttribute('data-i18n', 'dashboard');
                navToggleBtn.textContent = window.t ? window.t('dashboard') : 'Dashboard';
            }
        });
    }

    function showApp() {
        authLayout.classList.remove('active');
        authLayout.classList.add('hidden');
        appLayout.classList.remove('hidden');
        appLayout.classList.add('active');
        document.getElementById('current-user-name').textContent = currentUser.email.split('@')[0] || currentUser.email;
        
        // Show nav toggle for State Admin and District Admin
        if (['State Admin', 'District Admin'].includes(currentUser.role)) {
            if (navToggleBtn) navToggleBtn.classList.remove('hidden');
        } else {
            if (navToggleBtn) navToggleBtn.classList.add('hidden');
        }

        // Hide "New Assessment" button for non-GP Users
        const btnNewFormEl = document.getElementById('btn-new-form');
        if (btnNewFormEl) {
            if (currentUser.role === 'GP User') {
                btnNewFormEl.classList.remove('hidden');
            } else {
                btnNewFormEl.classList.add('hidden');
            }
        }

        // Hide "View Drafts" button for non-GP Users (admins don't create drafts)
        const viewDraftsBtnEl = document.getElementById('btn-view-drafts');
        if (viewDraftsBtnEl) {
            if (currentUser.role === 'GP User') {
                viewDraftsBtnEl.classList.remove('hidden');
            } else {
                viewDraftsBtnEl.classList.add('hidden');
            }
        }
        
        if (currentUser.role === 'SuperAdmin' || currentUser.role === 'Super Admin') {
            switchAppView('superadmin');
            if (navToggleBtn) {
                navToggleBtn.setAttribute('data-i18n', 'dashboard');
                navToggleBtn.textContent = window.t ? window.t('dashboard') : 'Dashboard';
            }
        } else {
            switchAppView('dashboard');
            if (navToggleBtn) {
                navToggleBtn.setAttribute('data-i18n', 'manage_users');
                navToggleBtn.textContent = window.t ? window.t('manage_users') : 'Manage Users';
            }
        }
    }

    function showAuth() {
        appLayout.classList.remove('active');
        appLayout.classList.add('hidden');
        authLayout.classList.remove('hidden');
        authLayout.classList.add('active');
        loginView.classList.remove('hidden');
        loginView.classList.add('active');
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('register-view').classList.remove('active');
    }

    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        loginView.classList.add('hidden');
        loginView.classList.remove('active');
        document.getElementById('register-view').classList.remove('hidden');
        document.getElementById('register-view').classList.add('active');
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('register-view').classList.add('hidden');
        document.getElementById('register-view').classList.remove('active');
        loginView.classList.remove('hidden');
        loginView.classList.add('active');
    });

    // --- Authentication ---
    
    async function loadCurrentUserProfile(email) {
        const { data: profile, error } = await supabase.from('profiles').select('*').eq('email', email).single();
        if (error || !profile) {
            if (!isRegistering) {
                alert("Profile not found.");
                await supabase.auth.signOut();
            }
            return;
        }
        
        if (profile.account_status === 'pending') {
            alert('Access Denied: Your account is still pending Super Admin approval.');
            await supabase.auth.signOut();
            return;
        }
        if (profile.account_status === 'rejected') {
            alert('Access Denied: Your registration was rejected.');
            await supabase.auth.signOut();
            return;
        }
        
        currentUser = profile;
        showApp();
    }

    // BUG-03: Consolidated session init — use onAuthStateChange only to prevent double-load race condition
    let sessionInitialized = false;

    supabase.auth.onAuthStateChange(async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            if (!sessionInitialized || event === 'SIGNED_IN') {
                sessionInitialized = true;
                await loadCurrentUserProfile(session.user.email);
            }
        } else if (event === 'SIGNED_OUT') {
            sessionInitialized = false;
            currentUser = null;
            showAuth();
        } else if (event === 'INITIAL_SESSION' && !session) {
            showAuth();
        }
    });

    async function logout() {
        await supabase.auth.signOut();
        showDraftsOnly = false;
        filterLockedForRole = false; // Reset so filter locking runs again on next login
        // showAuth is called by onAuthStateChange
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const pwd = document.getElementById('loginPwd').value;
        
        const { data, error } = await supabase.auth.signInWithPassword({ email: email, password: pwd });
        if (error) {
            alert('Login failed: ' + error.message);
        } else {
            e.target.reset();
        }
    });


    document.getElementById('reg-role').addEventListener('change', (e) => {
        const role = e.target.value;
        const locGroup = document.getElementById('reg-location-group');
        const distGroup = document.getElementById('reg-district-group');
        const subGroup = document.getElementById('reg-subdistrict-group');
        const villGroup = document.getElementById('reg-village-group');
        
        if (!role) {
            locGroup.classList.add('hidden');
            return;
        }
        if (!isLocationDataLoaded) {
            alert('Geographic data is still loading. Please wait a moment and try again.');
            e.target.value = '';
            return;
        }
        locGroup.classList.remove('hidden');
        
        distGroup.classList.remove('hidden');
        subGroup.classList.remove('hidden');
        villGroup.classList.remove('hidden');
        
        document.getElementById('reg-district').required = true;
        document.getElementById('reg-subdistrict').required = true;
        document.getElementById('reg-village').required = true;
        
        if (role === 'State Admin') {
            distGroup.classList.add('hidden');
            subGroup.classList.add('hidden');
            villGroup.classList.add('hidden');
            document.getElementById('reg-district').required = false;
            document.getElementById('reg-subdistrict').required = false;
            document.getElementById('reg-village').required = false;
        } else if (role === 'District Admin') {
            subGroup.classList.add('hidden');
            villGroup.classList.add('hidden');
            document.getElementById('reg-subdistrict').required = false;
            document.getElementById('reg-village').required = false;
        }
    });

    
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('regEmail').value.trim();
        const idProofFile = document.getElementById('regIdProof').files[0];
        const pwd = document.getElementById('regPwd').value;
        const role = document.getElementById('reg-role').value;
        const state = document.getElementById('reg-state').value;
        const district = document.getElementById('reg-district').value;
        const subdistrict = document.getElementById('reg-subdistrict').value;
        const village = document.getElementById('reg-village').value;
        
        if (!state) { alert('Please select a State.'); return; }
        if ((role === 'District Admin' || role === 'GP User') && !district) { alert('Please select a District.'); return; }
        if (role === 'GP User' && !subdistrict) { alert('Please select a Sub-District.'); return; }
        if (role === 'GP User' && !village) { alert('Please select a Village.'); return; }
        if (!idProofFile) { alert('Please upload an ID proof.'); return; }
        
        // Upload ID proof
        const fileName = `${Date.now()}_${idProofFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('id-proofs').upload(fileName, idProofFile);
        
        if (uploadError) {
            alert('Failed to upload ID proof: ' + uploadError.message);
            return;
        }
        const { data: publicUrlData } = supabase.storage.from('id-proofs').getPublicUrl(fileName);
        const idProofUrl = publicUrlData.publicUrl;

        // Sign Up Auth
        isRegistering = true;
        const { data: authData, error: authError } = await supabase.auth.signUp({ 
            email, 
            password: pwd,
            options: {
                emailRedirectTo: window.location.origin + '/verified.html'
            }
        });
        
        if (authError) {
            isRegistering = false;
            alert('Registration failed: ' + authError.message);
            return;
        }
        
        // Insert Profile
        const { error: profileError } = await supabase.from('profiles').insert([{
            email: email,
            role: role,
            state: state,
            district: district,
            sub_district: subdistrict,
            village: village,
            account_status: 'pending',
            id_proof_url: idProofUrl
        }]);
        
        if (profileError) {
            isRegistering = false;
            alert('Failed to create profile: ' + profileError.message);
            return;
        }
        
        alert('Registration successful. Your account is pending verification by the Super Admin. You will be able to log in once approved.');
        document.getElementById('show-login').click();
        e.target.reset();
        
        // Ensure the session is cleared because their account is pending
        await supabase.auth.signOut();
        isRegistering = false;
    });


    // --- Location Data Fetching & Cascading Logic ---
    async function loadLocations() {
        try {
            const response = await fetch('all_india_locations.json');
            locationData = await response.json();
            isLocationDataLoaded = true;
            initCascadingDropdowns();
            
            // Hide loaders and show fields
            document.getElementById('dashboard-location-loader').classList.add('hidden');
            document.getElementById('dashboard-location-fields').classList.remove('hidden');
            
            document.getElementById('form-location-loader').classList.add('hidden');
            document.getElementById('form-location-fields').classList.remove('hidden');
            
        } catch (error) {
            console.error('Failed to load locations dataset:', error);
            document.getElementById('dashboard-location-loader').innerHTML = `<span class="text-danger">Failed to load geographic dataset. Please ensure all_india_locations.json is present.</span>`;
            document.getElementById('form-location-loader').innerHTML = `<span class="text-danger">Failed to load geographic dataset.</span>`;
        }
    }

    function populateSelect(selectEl, options, defaultText) {
        selectEl.innerHTML = `<option value="">${defaultText}</option>`;
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            selectEl.appendChild(option);
        });
        selectEl.disabled = options.length === 0;
    }

    function setupCascading(stateId, districtId, subdistrictId, villageId, isFilter = false) {
        const stateEl = document.getElementById(stateId);
        const districtEl = document.getElementById(districtId);
        const subdistrictEl = document.getElementById(subdistrictId);
        const villageEl = document.getElementById(villageId);
        
        const defaultText = isFilter ? 'All' : 'Select';

        stateEl.addEventListener('change', () => {
            const state = stateEl.value;
            if (state && locationData[state]) {
                populateSelect(districtEl, Object.keys(locationData[state]).sort(), `${defaultText} District`);
            } else {
                populateSelect(districtEl, [], `${defaultText} District`);
            }
            populateSelect(subdistrictEl, [], `${defaultText} Sub-District`);
            populateSelect(villageEl, [], `${defaultText} Village`);
        });

        districtEl.addEventListener('change', () => {
            const state = stateEl.value;
            const district = districtEl.value;
            if (district && locationData[state] && locationData[state][district]) {
                populateSelect(subdistrictEl, Object.keys(locationData[state][district]).sort(), `${defaultText} Sub-District`);
            } else {
                populateSelect(subdistrictEl, [], `${defaultText} Sub-District`);
            }
            populateSelect(villageEl, [], `${defaultText} Village`);
        });

        subdistrictEl.addEventListener('change', () => {
            const state = stateEl.value;
            const district = districtEl.value;
            const subdistrict = subdistrictEl.value;
            
            let villageText = defaultText + ' Village';
            if (window.t) {
                villageText = defaultText === 'All' ? window.t('all') + ' ' + window.t('village') : window.t('select_village');
            }

            if (subdistrict && locationData[state] && locationData[state][district] && locationData[state][district][subdistrict]) {
                populateSelect(villageEl, locationData[state][district][subdistrict].sort(), villageText);
            } else {
                populateSelect(villageEl, [], villageText);
            }
        });
    }

    function initCascadingDropdowns() {
        const states = Object.keys(locationData).sort();
        
        let selectStateText = window.t ? window.t('select_state') : 'Select State';
        let allStatesText = window.t ? (window.t('all') + ' ' + window.t('state')) : 'All States';
        
        const formState = document.getElementById('secA-state');
        if(formState) populateSelect(formState, states, selectStateText);
        
        const filterState = document.getElementById('filter-state');
        if(filterState) populateSelect(filterState, states, allStatesText);

        setupCascading('secA-state', 'secA-district', 'secA-subdistrict', 'secA-village');
        setupCascading('filter-state', 'filter-district', 'filter-subdistrict', 'filter-village', true);
        
        const regState = document.getElementById('reg-state');
        if(regState) populateSelect(regState, states, selectStateText);
        setupCascading('reg-state', 'reg-district', 'reg-subdistrict', 'reg-village');
    }
    
    // --- Dashboard ---
    let showDraftsOnly = false;
    
    const viewDraftsBtn = document.getElementById('btn-view-drafts');
    if (viewDraftsBtn) {
        viewDraftsBtn.addEventListener('click', (e) => {
            showDraftsOnly = !showDraftsOnly;
            if(showDraftsOnly) {
                e.target.textContent = window.t ? (window.t('all') + ' ' + window.t('assessment_records')) : 'View All Records';
                e.target.classList.replace('btn-outline', 'btn-secondary');
                document.getElementById('records-card-title').textContent = window.t ? window.t('view_drafts') : 'Unfinished Assessment Forms';
            } else {
                e.target.textContent = window.t ? window.t('view_drafts') : 'View Unfinished Forms';
                e.target.classList.replace('btn-secondary', 'btn-outline');
                document.getElementById('records-card-title').textContent = window.t ? window.t('assessment_records') : 'Assessment Records';
            }
            renderDashboard();
        });
    }

    
    async function renderDashboard() {
        const tbody = document.querySelector('#records-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
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

        // Also apply location filters if set
        const fState = document.getElementById('filter-state').value;
        const fDist = document.getElementById('filter-district').value;
        const fSub = document.getElementById('filter-subdistrict').value;
        const fVill = document.getElementById('filter-village').value;
        
        if (fState) query = query.eq('state', fState);
        if (fDist) query = query.eq('district', fDist);
        if (fSub) query = query.eq('sub_district', fSub);
        if (fVill) query = query.eq('village', fVill);

        const { data: dbRecords, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.warn("Error fetching assessments (table may not exist yet):", error.message);
            // If table doesn't exist yet, just show no records instead of an error
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
                openAssessmentForm(id);
            });
        });
        
        document.querySelectorAll('.delete-record').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                // BUG-02 + BUG-05: Safe translations + database delete
            if (confirm(safeT('delete_confirm', 'Are you sure you want to delete this draft?'))) {
                    const id = e.target.getAttribute('data-id');
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


    const searchRecordsBtn = document.getElementById('search-records-btn');
    if (searchRecordsBtn) searchRecordsBtn.addEventListener('click', renderDashboard);

    // --- Form Logic ---
    const q1 = document.getElementById('q1-vwsc');
    const q2 = document.getElementById('q2-gramsabha');
    const declCheckbox = document.getElementById('validation-declaration');
    const declLabel = document.getElementById('declaration-label');

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
    q1.addEventListener('change', checkValidationHeader);
    q2.addEventListener('change', checkValidationHeader);

    // Image and Video Proof Validation & Upload
    const instImageProof = document.getElementById('inst-image-proof');
    const instImageUrl = document.getElementById('inst-image-url');

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

    const instVideoProof = document.getElementById('inst-video-proof');
    const instVideoUrl = document.getElementById('inst-video-url');

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
        video.onloadedmetadata = async function() {
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
        video.src = URL.createObjectURL(file);
    });

    // Dynamic Village Title & Habitations
    const secAVillage = document.getElementById('secA-village');
    const habSelect = document.getElementById('secA-habitations');
    const addHabBtn = document.getElementById('add-habitation-btn');
    const habFhtcTableBody = document.querySelector('#habitations-fhtc-table tbody');
    const habAdequacyTableBody = document.querySelector('#habitations-adequacy-table tbody');

    secAVillage.addEventListener('change', () => {
        const v = secAVillage.value;
        if(v) {
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

    function renderHabitationTables() {
        const selected = Array.from(habSelect.selectedOptions).map(o => o.value);
        habFhtcTableBody.innerHTML = '';
        habAdequacyTableBody.innerHTML = '';

        selected.forEach((hab, index) => {
            // FHTC Table
            const tr1 = document.createElement('tr');
            tr1.innerHTML = `<td>${hab}</td><td><input type="number" name="hab_fhtc_${index}" class="table-input" min="0" required></td>`;
            habFhtcTableBody.appendChild(tr1);

            // Adequacy Table
            const tr2 = document.createElement('tr');
            tr2.innerHTML = `<td>${hab}</td><td><input type="number" name="hab_adeq_${index}" class="table-input" min="0" required></td>`;
            habAdequacyTableBody.appendChild(tr2);
        });
    }

    // --- Specific Form Validations ---
    const chargeAmountInput = document.getElementById('secB-chargeAmount');
    const chargeWarning = document.getElementById('charge-warning');
    chargeAmountInput.addEventListener('input', (e) => {
        let val = e.target.value;
        if(val.length > 3) e.target.value = val.slice(0, 3);
        
        if (parseInt(e.target.value) > 150) {
            chargeWarning.classList.remove('hidden');
        } else {
            chargeWarning.classList.add('hidden');
        }
    });

    // BUG-28: Toggle charge details visibility based on "charges levied" selection
    const chargesLeviedSelect = document.getElementById('secB-chargesLevied');
    const chargeDetailsDiv = document.getElementById('charge-details');
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
    const schoolsTotalInput = document.getElementById('secB-schoolsTotal');
    const schoolsPipedInput = document.getElementById('secB-schoolsPiped');
    const schoolsError = document.getElementById('schools-error');

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
        const addHabBtn = document.getElementById('add-habitation-btn');
        if (addHabBtn) addHabBtn.style.display = isReadOnly ? 'none' : 'block';
    }

    // --- Form Save/Submit ---
    async function openAssessmentForm(id = null) {
        isFormDirty = false;
        switchAppView('assessment');
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
        
        const session = currentUser;
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
            
            // Auto-fill and lock location for GP User
            if (session.role === 'GP User') {
                if (session.state) {
                    document.getElementById('secA-state').value = session.state;
                    document.getElementById('secA-state').dispatchEvent(new Event('change'));
                }
                setTimeout(() => {
                    if (session.district) {
                        document.getElementById('secA-district').value = session.district;
                        document.getElementById('secA-district').dispatchEvent(new Event('change'));
                    }
                }, 50);
                setTimeout(() => {
                    if (session.sub_district) {
                        document.getElementById('secA-subdistrict').value = session.sub_district;
                        document.getElementById('secA-subdistrict').dispatchEvent(new Event('change'));
                    }
                }, 100);
                setTimeout(() => {
                    if (session.village) {
                        document.getElementById('secA-village').value = session.village;
                        document.getElementById('secA-village').dispatchEvent(new Event('change'));
                    }
                }, 150);
                
                setTimeout(() => {
                    document.getElementById('secA-state').disabled = true;
                    document.getElementById('secA-district').disabled = true;
                    document.getElementById('secA-subdistrict').disabled = true;
                    document.getElementById('secA-village').disabled = true;
                }, 200);
            }
        }
        
        // BUG-20: Removed duplicate switchAppView('assessment') call — already called at top of function
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
                if(!fullData[key]){
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
        const habSelect = document.getElementById('secA-habitations');
        const savedHabs = record.payload['secA-habitations'] || record.payload['habitations'];
        if (savedHabs) {
            const habsArr = savedHabs.split(',');
            habSelect.innerHTML = '';
            habsArr.forEach(hab => {
                const opt = document.createElement('option');
                opt.value = hab;
                opt.textContent = hab;
                opt.selected = true;
                habSelect.appendChild(opt);
            });
            // Calling this creates the input elements for the tables below
            // Note: renderHabitationTables is defined in the same scope
            if (typeof renderHabitationTables === 'function') {
                renderHabitationTables();
            }
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
                            // For inputs with same name (like disrupt_reason array)
                            // This naive approach sets all to the last value or needs index handling
                            // For simplicity, we assume single input if not checkbox/radio
                            nameEl.value = val;
                        }
                    });
                }
            }
        });
        
        const session = currentUser;
        const role = session.role;
        
        if (record.status === 'Rejected') {
            document.getElementById('rejection-alert').classList.remove('hidden');
            document.getElementById('rejection-reason-text').textContent = record.rejection_reason || 'No reason provided.';
            // BUG-F: For GP User, allow editing and re-submitting rejected forms
            if (role === 'GP User') {
                setFormReadOnly(false);
                document.getElementById('gp-actions').style.display = 'flex';
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

    function markFormDirty() {
        isFormDirty = true;
    }

    document.getElementById('save-draft-btn').addEventListener('click', async () => {
        await saveAssessment('Draft');
        isFormDirty = false;
        showToast('Draft Saved Successfully!');
    });

    document.getElementById('save-exit-btn').addEventListener('click', async () => {
        await saveAssessment('Draft');
        isFormDirty = false;
        showToast('Draft Saved!');
        switchAppView('dashboard');
    });

    document.getElementById('submit-assessment-btn').addEventListener('click', async (e) => {
        e.preventDefault(); 
        
        const form = document.getElementById('assessment-form');
        
        // Strict Validation Check
        const village = document.getElementById('secA-village').value;
        if(!village) {
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

        if(!form.checkValidity()) {
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

    document.getElementById('preview-save-draft-btn')?.addEventListener('click', async () => {
        await saveAssessment('Draft');
        isFormDirty = false;
        showToast('Draft Saved Successfully from Preview!');
    });

    document.getElementById('final-submit-btn').addEventListener('click', async () => {
        await saveAssessment('Submitted');
        isFormDirty = false;
        successModal.classList.remove('hidden');
    });

    document.getElementById('approve-assessment-btn').addEventListener('click', async () => {
        const id = document.getElementById('recordId').value;
        const { error } = await supabase.from('assessments').update({ status: 'Approved' }).eq('id', id);
        
        if (error) {
            alert('Failed to approve assessment: ' + error.message);
        } else {
            showToast('Assessment Approved Successfully!');
            switchAppView('dashboard');
        }
    });

    document.getElementById('reject-assessment-btn').addEventListener('click', async () => {
        const reason = prompt('Please enter the reason for rejection:');
        if (!reason) {
            alert('Reason is required to reject a form.');
            return;
        }
        
        const id = document.getElementById('recordId').value;
        
        const { error } = await supabase.from('assessments').update({ 
            status: 'Rejected', 
            rejection_reason: reason
        }).eq('id', id);

        if (error) {
            alert('Failed to reject assessment: ' + error.message);
        } else {
            showToast('Assessment Rejected');
            switchAppView('dashboard');
        }
    });

    function showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // Run Initialization
    loadLocations();
    // BUG-03: initSession() removed — onAuthStateChange with INITIAL_SESSION handles this


    
    
    
    // --- Super Admin Logic ---
    let currentPendingUsers = [];

    // Event Delegation for the table
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
                if (confirm(`Are you sure you want to delete the user ${email}? This action cannot be undone.`)) {
                    const { error } = await supabase.from('profiles').delete().eq('email', email);
                    if (error) {
                        alert('Error deleting user: ' + error.message);
                    } else {
                        alert('User deleted successfully.');
                        renderSuperAdminDashboard();
                    }
                }
            }
        });
    }

    async function renderSuperAdminDashboard() {
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
                
                // BUG-06: Escape user-supplied data + BUG-13: use correct badge classes
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(u.email.split('@')[0])}</td>
                    <td>${escapeHtml(u.email)}</td>
                    <td><span class="badge ${u.role === 'GP User' ? 'badge-submitted' : 'badge-approved'}">${escapeHtml(u.role)}</span></td>
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
                
                // Modal shown
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


    if (document.getElementById('close-id-modal-btn')) {
        document.getElementById('close-id-modal-btn').addEventListener('click', () => {
            const modal = document.getElementById('id-proof-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
        });
    }

});