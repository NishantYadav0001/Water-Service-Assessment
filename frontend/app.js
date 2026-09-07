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
    const DB_ASSESSMENTS = 'db_assessments';

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
        btnNewForm.addEventListener('click', () => {
            const assessments = JSON.parse(localStorage.getItem(DB_ASSESSMENTS)) || [];
            const draftCount = assessments.filter(a => a.status === 'Draft').length;
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

    async function initSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await loadCurrentUserProfile(session.user.email);
        } else {
            showAuth();
        }
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            await loadCurrentUserProfile(session.user.email);
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showAuth();
        }
    });

    async function logout() {
        await supabase.auth.signOut();
        showDraftsOnly = false;
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
        
        const filterCard = document.querySelector('.filter-card');
        if (filterCard) {
            filterCard.style.display = (currentUser.role === 'GP User') ? 'none' : '';
        }
        
        // Fetch all assessments from localStorage since that is where they are saved
        let assessments = JSON.parse(localStorage.getItem(DB_ASSESSMENTS)) || [];
        let filtered = assessments;
        
        // Map the data structure to match what the rest of the code expects
        filtered = filtered.map(a => ({
            id: a.id,
            status: a.status,
            payload: a.data,
            village: a.data.village,
            sub_district: a.data.subdistrict,
            district: a.data.district,
            state: a.data.state,
            user_id: currentUser.email // We don't save user_id in localStorage currently, but we can mock it or ignore it since GP users only see their own local storage
        }));

        // Role-based filtering
        if (currentUser.role === 'District Admin') {
            filtered = filtered.filter(a => a.district === currentUser.district && a.status === 'Submitted');
        } else if (currentUser.role === 'State Admin') {
            filtered = filtered.filter(a => a.state === currentUser.state);
        }
        if (showDraftsOnly) {
            filtered = filtered.filter(a => a.status === 'Draft');
        } else if (currentUser.role === 'GP User') {
            filtered = filtered.filter(a => a.status !== 'Draft');
        }
        
        // Also apply location filters if set
        const fState = document.getElementById('filter-state').value;
        const fDist = document.getElementById('filter-district').value;
        const fSub = document.getElementById('filter-subdistrict').value;
        const fVill = document.getElementById('filter-village').value;
        
        filtered = filtered.filter(r => {
            if (fState && r.state !== fState) return false;
            if (fDist && r.district !== fDist) return false;
            if (fSub && r.sub_district !== fSub) return false;
            if (fVill && r.village !== fVill) return false;
            return true;
        });
        
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" data-i18n="no_records">${window.t('no_records')}</td></tr>`;
            return;
        }
        
        filtered.forEach(record => {
            const tr = document.createElement('tr');
            
            let statusBadge = '';
            let displayStatus = window.t(record.status.toLowerCase()) || record.status;
            
            if (record.status === 'Submitted') {
                statusBadge = 'bg-primary';
                if (currentUser.role === 'GP User') {
                    displayStatus = window.t ? window.t('pending') || 'Pending' : 'Pending';
                    statusBadge = 'bg-warning text-dark';
                }
            }
            else if (record.status === 'Approved') statusBadge = 'bg-success';
            else if (record.status === 'Rejected') statusBadge = 'bg-danger';
            else statusBadge = 'bg-warning text-dark';
            
            let actionBtn = '';
            if (record.status === 'Draft' && currentUser.role === 'GP User') {
                actionBtn = `
                    <button class="btn-outline btn-small view-record" data-id="${record.id}" data-i18n="edit">${window.t('edit') || 'Edit'}</button>
                    <button class="btn-outline btn-small delete-record text-danger" style="margin-left:5px;" data-id="${record.id}" data-i18n="delete">${window.t('delete') || 'Delete'}</button>
                `;
            } else if (record.status === 'Submitted' && (currentUser.role === 'District Admin' || currentUser.role === 'State Admin')) {
                actionBtn = `<button class="btn-outline btn-small view-record" data-id="${record.id}" data-i18n="review">${window.t('review') || 'Review'}</button>`;
            } else {
                actionBtn = `<button class="btn-outline btn-small view-record" data-id="${record.id}" data-i18n="view">${window.t('view') || 'View'}</button>`;
            }
            
            // Logic for date: if draft, show updatedAt, else show date_discussion
            let displayDate = new Date().toLocaleDateString();
            if (record.status === 'Draft' && record.updatedAt) {
                displayDate = new Date(record.updatedAt).toLocaleDateString();
            } else if (record.submittedAt) {
                displayDate = new Date(record.submittedAt).toLocaleDateString();
            } else if (record.payload && record.payload.date_discussion) {
                displayDate = record.payload.date_discussion;
            }
            
            tr.innerHTML = `
                <td>${displayDate}</td>
                <td>${record.village || 'N/A'}</td>
                <td><span class="badge ${statusBadge}" data-i18n="${record.status.toLowerCase()}">${displayStatus}</span></td>
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
            btn.addEventListener('click', (e) => {
                if (confirm(window.t ? window.t('delete_confirm') || 'Are you sure you want to delete this draft?' : 'Are you sure you want to delete this draft?')) {
                    const id = e.target.getAttribute('data-id');
                    let localAssessments = JSON.parse(localStorage.getItem(DB_ASSESSMENTS)) || [];
                    localAssessments = localAssessments.filter(a => a.id !== id);
                    localStorage.setItem(DB_ASSESSMENTS, JSON.stringify(localAssessments));
                    showToast(window.t ? window.t('draft_deleted') || 'Draft Deleted!' : 'Draft Deleted!');
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
    function openAssessmentForm(id = null) {
        isFormDirty = false;
        switchAppView('assessment');
        document.getElementById('assessment-form').reset();
        
        // Listen to form inputs to mark form as dirty
        const form = document.getElementById('assessment-form');
        form.removeEventListener('input', markFormDirty);
        form.removeEventListener('change', markFormDirty);
        form.addEventListener('input', markFormDirty);
        form.addEventListener('change', markFormDirty);
        document.getElementById('secA-date').max = new Date().toISOString().split('T')[0];
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
            loadAssessmentData(id);
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
        
        switchAppView('assessment');
    }

    function collectFormData() {
        const form = document.getElementById('assessment-form');
        
        // Temporarily enable all fields to ensure FormData captures everything (especially in Preview Mode)
        const disabledElements = form.querySelectorAll(':disabled');
        disabledElements.forEach(el => el.disabled = false);
        
        const formData = new FormData(form);
        const fullData = {};
        
        // Process FormData for named elements
        formData.forEach((value, key) => {
            if(!fullData[key]){
                fullData[key] = value;
            } else {
                fullData[key] = fullData[key] + "," + value;
            }
        });

        // Re-disable elements
        disabledElements.forEach(el => el.disabled = true);

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
        
        // Ensure cascading dropdowns are explicitly captured
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

    function saveAssessment(status) {
        const id = document.getElementById('recordId').value;
        const assessments = JSON.parse(localStorage.getItem(DB_ASSESSMENTS)) || [];
        const existingIndex = assessments.findIndex(a => a.id === id);
        
        const record = {
            id: id,
            status: status,
            data: collectFormData(),
            updatedAt: new Date().toISOString()
        };
        
        if (status === 'Submitted') {
            record.submittedAt = record.updatedAt;
        }

        // Bug 9: Preserve rejection history from existing record
        if (existingIndex >= 0) {
            const existing = assessments[existingIndex];
            if (existing.rejectionReason) {
                record.rejectionHistory = existing.rejectionHistory || [];
                record.rejectionHistory.push({
                    reason: existing.rejectionReason,
                    date: existing.updatedAt
                });
            } else if (existing.rejectionHistory) {
                record.rejectionHistory = existing.rejectionHistory;
            }
            assessments[existingIndex] = record;
        } else {
            assessments.push(record);
        }

        localStorage.setItem(DB_ASSESSMENTS, JSON.stringify(assessments));
    }

    function loadAssessmentData(id) {
        const assessments = JSON.parse(localStorage.getItem(DB_ASSESSMENTS)) || [];
        const record = assessments.find(a => a.id === id);
        if(!record) return;

        // Populate location dropdowns manually so values can be set
        const state = record.data['state'];
        const district = record.data['district'];
        const subdistrict = record.data['subdistrict'];
        const village = record.data['village'];
        
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
        const savedHabs = record.data['secA-habitations'] || record.data['habitations'];
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
        Object.keys(record.data).forEach(key => {
            const val = record.data[key];
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
            document.getElementById('rejection-reason-text').textContent = record.rejectionReason || 'No reason provided.';
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

        // Visual feedback for uploaded proofs
        if (record.data['inst-image-url']) {
            const help = document.getElementById('inst-image-url').nextElementSibling;
            if (help) help.innerHTML = `<a href="${record.data['inst-image-url']}" target="_blank" class="text-success" data-i18n="view_uploaded_image">View Uploaded Image</a>`;
        }
        if (record.data['inst-video-url']) {
            const help = document.getElementById('inst-video-url').nextElementSibling;
            if (help) help.innerHTML = `<a href="${record.data['inst-video-url']}" target="_blank" class="text-success" data-i18n="view_uploaded_video">View Uploaded Video</a>`;
        }
        
        // Re-trigger checks
        checkValidationHeader();
    }

    function markFormDirty() {
        isFormDirty = true;
    }

    document.getElementById('save-draft-btn').addEventListener('click', () => {
        saveAssessment('Draft');
        isFormDirty = false;
        showToast('Draft Saved Successfully!');
    });

    document.getElementById('save-exit-btn').addEventListener('click', () => {
        saveAssessment('Draft');
        isFormDirty = false;
        showToast('Draft Saved!');
        switchAppView('dashboard');
    });

    document.getElementById('submit-assessment-btn').addEventListener('click', (e) => {
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

    document.getElementById('preview-save-draft-btn')?.addEventListener('click', () => {
        saveAssessment('Draft');
        isFormDirty = false;
        showToast('Draft Saved Successfully from Preview!');
    });

    document.getElementById('final-submit-btn').addEventListener('click', () => {
        saveAssessment('Submitted');
        isFormDirty = false;
        successModal.classList.remove('hidden');
    });

    document.getElementById('approve-assessment-btn').addEventListener('click', () => {
        // Bug 3 fix: Update only the status — don't re-collect from disabled form fields
        const id = document.getElementById('recordId').value;
        const assessments = JSON.parse(localStorage.getItem(DB_ASSESSMENTS)) || [];
        const existingIndex = assessments.findIndex(a => a.id === id);
        
        if (existingIndex >= 0) {
            assessments[existingIndex].status = 'Approved';
            assessments[existingIndex].updatedAt = new Date().toISOString();
            localStorage.setItem(DB_ASSESSMENTS, JSON.stringify(assessments));
            showToast('Assessment Approved Successfully!');
            switchAppView('dashboard');
        }
    });

    document.getElementById('reject-assessment-btn').addEventListener('click', () => {
        const reason = prompt('Please enter the reason for rejection:');
        if (!reason) {
            alert('Reason is required to reject a form.');
            return;
        }
        
        const id = document.getElementById('recordId').value;
        const assessments = JSON.parse(localStorage.getItem(DB_ASSESSMENTS)) || [];
        const existingIndex = assessments.findIndex(a => a.id === id);
        
        if (existingIndex >= 0) {
            assessments[existingIndex].status = 'Rejected';
            assessments[existingIndex].rejectionReason = reason;
            localStorage.setItem(DB_ASSESSMENTS, JSON.stringify(assessments));
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
    initSession();


    
    
    
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
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.email.split('@')[0]}</td>
                    <td>${u.email}</td>
                    <td><span class="badge ${u.role === 'GP User' ? 'bg-primary' : 'bg-success'}">${u.role}</span></td>
                    <td><small>${loc}</small></td>
                    <td>
                        <button class="btn-outline btn-small view-id-btn" data-email="${u.email}">View Details</button>
                        <button class="btn-primary btn-small approve-user-btn" data-email="${u.email}" style="background-color: var(--success); border-color: var(--success);">Approve</button>
                        <button class="btn-outline btn-small reject-user-btn text-danger" data-email="${u.email}">Reject</button>
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
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.email.split('@')[0]}</td>
            <td>${u.email}</td>
            <td><span class="badge ${u.role === 'GP User' ? 'bg-primary' : 'bg-success'}">${u.role}</span></td>
            <td><small>${loc}</small></td>
            <td>
                <span class="badge ${u.account_status === 'approved' ? 'bg-success' : 'bg-danger'}">${u.account_status}</span>
            </td>
            <td>
                <button class="btn-outline btn-small delete-user-btn text-danger" data-email="${u.email}">Delete</button>
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
                
                console.log("Modal forced to show!", modal);
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