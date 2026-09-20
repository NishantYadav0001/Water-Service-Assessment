/**
 * Authentication — login, registration, session management, and profile loading.
 *
 * Exports:
 *   getCurrentUser()       — accessor for the current user profile
 *   setCurrentUser(user)   — mutator
 *   getIsFormDirty()       — accessor
 *   setIsFormDirty(val)    — mutator
 *   logout()               — sign out and reset state
 *   initAuth(deps)         — wire up auth event listeners + onAuthStateChange
 */

import { supabase } from './supabaseClient.js';
import { isLocationDataReady } from './locations.js';

let currentUser = null;
let isRegistering = false;
let isFormDirty = false;
let isRecoveringPassword = false;

// Injected dependencies
let _showApp = null;
let _showAuth = null;
let _setShowDraftsOnly = null;
let _resetFilterLock = null;

export function getCurrentUser() {
    return currentUser;
}

export function setCurrentUser(user) {
    currentUser = user;
}

export function getIsFormDirty() {
    return isFormDirty;
}

export function setIsFormDirty(val) {
    isFormDirty = val;
}

export async function logout() {
    await supabase.auth.signOut();
    if (_setShowDraftsOnly) _setShowDraftsOnly(false);
    if (_resetFilterLock) _resetFilterLock();
    // showAuth is called by onAuthStateChange
}

async function loadCurrentUserProfile(email) {
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('email', email).single();
    if (error || !profile) {
        if (!isRegistering) {
            alert("Profile not found. If your account was deleted by an admin, please register again using your existing password.");
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
    _showApp();
}

/**
 * Wire up authentication event listeners.
 *
 * @param {Object} deps
 * @param {Function} deps.showApp
 * @param {Function} deps.showAuth
 * @param {Function} deps.setShowDraftsOnly
 * @param {Function} deps.resetFilterLock
 */
export function initAuth(deps) {
    _showApp = deps.showApp;
    _showAuth = deps.showAuth;
    _setShowDraftsOnly = deps.setShowDraftsOnly;
    _resetFilterLock = deps.resetFilterLock;

    // BUG-03: Consolidated session init — use onAuthStateChange only to prevent double-load race condition
    let sessionInitialized = false;

    supabase.auth.onAuthStateChange(async (event, session) => {
        // BUG-C5: Prevent the auth state listener from hijacking the UI during a password reset.
        // When verifyOtp(type: 'recovery') succeeds, Supabase emits SIGNED_IN/PASSWORD_RECOVERY.
        if (isRecoveringPassword) {
            return; // Stay on the forgot password view!
        }

        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
            if (!sessionInitialized || event === 'SIGNED_IN') {
                sessionInitialized = true;
                await loadCurrentUserProfile(session.user.email);
            }
        } else if (event === 'SIGNED_OUT') {
            sessionInitialized = false;
            currentUser = null;
            _showAuth();
        } else if (event === 'INITIAL_SESSION' && !session) {
            _showAuth();
        }
    });

    // Login form
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

    // ===== OTP-Based Password Reset Flow =====

    // State for the OTP flow
    let otpEmail = '';
    let resendCooldownTimer = null;

    // Helper: update step indicators
    function setOtpStep(step) {
        const dots = [
            document.getElementById('step-dot-1'),
            document.getElementById('step-dot-2'),
            document.getElementById('step-dot-3')
        ];
        const lines = document.querySelectorAll('#otp-step-indicator .step-line');

        dots.forEach((dot, i) => {
            dot.classList.remove('active', 'completed');
            if (i + 1 < step) dot.classList.add('completed');
            else if (i + 1 === step) dot.classList.add('active');
        });

        lines.forEach((line, i) => {
            line.classList.remove('completed');
            if (i + 1 < step) line.classList.add('completed');
        });

        document.getElementById('otp-step-1').classList.add('hidden');
        document.getElementById('otp-step-2').classList.add('hidden');
        document.getElementById('otp-step-3').classList.add('hidden');
        document.getElementById('otp-step-' + step).classList.remove('hidden');
    }

    // Helper: start resend cooldown (60 seconds)
    function startResendCooldown() {
        const timerEl = document.getElementById('resend-timer');
        const resendBtn = document.getElementById('resend-otp-btn');
        let seconds = 60;

        resendBtn.classList.add('hidden');
        timerEl.textContent = `Resend OTP in ${seconds}s`;

        if (resendCooldownTimer) clearInterval(resendCooldownTimer);
        resendCooldownTimer = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(resendCooldownTimer);
                resendCooldownTimer = null;
                timerEl.textContent = '';
                resendBtn.classList.remove('hidden');
            } else {
                timerEl.textContent = `Resend OTP in ${seconds}s`;
            }
        }, 1000);
    }

    // Helper: setup OTP input UX (auto-advance, backspace, paste)
    function setupOtpInputs() {
        const inputs = document.querySelectorAll('#otp-inputs .otp-input');

        inputs.forEach((input, index) => {
            input.value = '';
            input.classList.remove('filled', 'error');

            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                e.target.value = val;

                if (val) {
                    e.target.classList.add('filled');
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                } else {
                    e.target.classList.remove('filled');
                }

                // Hide error when user types
                document.getElementById('otp-error').classList.add('hidden');
                inputs.forEach(inp => inp.classList.remove('error'));
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                    inputs[index - 1].value = '';
                    inputs[index - 1].classList.remove('filled');
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
                for (let i = 0; i < Math.min(pastedData.length, inputs.length); i++) {
                    inputs[i].value = pastedData[i];
                    inputs[i].classList.add('filled');
                }
                const focusIndex = Math.min(pastedData.length, inputs.length - 1);
                inputs[focusIndex].focus();
            });
        });

        // Focus first input
        if (inputs.length > 0) inputs[0].focus();
    }

    // Helper: get OTP value from inputs
    function getOtpValue() {
        const inputs = document.querySelectorAll('#otp-inputs .otp-input');
        return Array.from(inputs).map(i => i.value).join('');
    }

    // Helper: reset the entire forgot-password view to step 1
    function resetOtpFlow() {
        otpEmail = '';
        isRecoveringPassword = false;
        if (resendCooldownTimer) {
            clearInterval(resendCooldownTimer);
            resendCooldownTimer = null;
        }
        setOtpStep(1);
        const forgotForm = document.getElementById('forgot-password-form');
        if (forgotForm) forgotForm.reset();
        const inputs = document.querySelectorAll('#otp-inputs .otp-input');
        inputs.forEach(i => { i.value = ''; i.classList.remove('filled', 'error'); });
        document.getElementById('otp-error').classList.add('hidden');
        document.getElementById('password-match-error').classList.add('hidden');
        document.getElementById('resend-timer').textContent = '';
        document.getElementById('resend-otp-btn').classList.add('hidden');
    }

    // Step 1: Send OTP
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Set flag so auth listener ignores the resulting SIGNED_IN event from OTP verification
            isRecoveringPassword = true;

            const email = document.getElementById('forgotEmail').value.trim();
            const btn = document.getElementById('send-reset-btn');

            const originalText = btn.textContent;
            btn.textContent = 'Sending...';
            btn.disabled = true;

            const { data, error } = await supabase.auth.resetPasswordForEmail(email);

            btn.textContent = originalText;
            btn.disabled = false;

            if (error) {
                alert('Failed to send OTP: ' + error.message);
            } else {
                otpEmail = email;
                setOtpStep(2);
                setupOtpInputs();
                startResendCooldown();
            }
        });
    }

    // Step 2: Verify OTP
    const verifyOtpForm = document.getElementById('verify-otp-form');
    if (verifyOtpForm) {
        verifyOtpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const token = getOtpValue();
            const otpError = document.getElementById('otp-error');
            const inputs = document.querySelectorAll('#otp-inputs .otp-input');

            if (token.length !== 8) {
                otpError.textContent = 'Please enter all 8 digits.';
                otpError.classList.remove('hidden');
                inputs.forEach(i => i.classList.add('error'));
                return;
            }

            const btn = document.getElementById('verify-otp-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Verifying...';
            btn.disabled = true;

            const { data, error } = await supabase.auth.verifyOtp({
                email: otpEmail,
                token: token,
                type: 'recovery'
            });

            btn.textContent = originalText;
            btn.disabled = false;

            if (error) {
                otpError.textContent = 'Invalid or expired OTP. Please try again.';
                otpError.classList.remove('hidden');
                inputs.forEach(i => i.classList.add('error'));
            } else {
                // Clear cooldown
                if (resendCooldownTimer) {
                    clearInterval(resendCooldownTimer);
                    resendCooldownTimer = null;
                }
                setOtpStep(3);
            }
        });
    }

    // Step 2: Resend OTP
    const resendOtpBtn = document.getElementById('resend-otp-btn');
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            resendOtpBtn.classList.add('hidden');

            const { error } = await supabase.auth.resetPasswordForEmail(otpEmail);
            if (error) {
                alert('Failed to resend OTP: ' + error.message);
                resendOtpBtn.classList.remove('hidden');
            } else {
                // Clear old inputs
                const inputs = document.querySelectorAll('#otp-inputs .otp-input');
                inputs.forEach(i => { i.value = ''; i.classList.remove('filled', 'error'); });
                document.getElementById('otp-error').classList.add('hidden');
                if (inputs.length > 0) inputs[0].focus();
                startResendCooldown();
            }
        });
    }

    // Step 2: Back to Step 1 (change email)
    const backToStep1 = document.getElementById('back-to-step1');
    if (backToStep1) {
        backToStep1.addEventListener('click', (e) => {
            e.preventDefault();
            if (resendCooldownTimer) {
                clearInterval(resendCooldownTimer);
                resendCooldownTimer = null;
            }
            setOtpStep(1);
        });
    }

    // Step 3: Update Password
    const updatePasswordForm = document.getElementById('update-password-form');
    if (updatePasswordForm) {
        updatePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const matchError = document.getElementById('password-match-error');

            if (newPassword !== confirmPassword) {
                matchError.classList.remove('hidden');
                return;
            }
            matchError.classList.add('hidden');

            const btn = document.getElementById('update-password-btn');
            const originalText = btn.textContent;
            btn.textContent = 'Updating...';
            btn.disabled = true;

            const { data, error } = await supabase.auth.updateUser({
                password: newPassword
            });

            btn.textContent = originalText;
            btn.disabled = false;

            if (error) {
                alert('Failed to update password: ' + error.message);
            } else {
                await supabase.auth.signOut();
                alert('Password updated successfully! Please log in with your new password.');
                resetOtpFlow();
                // Navigate to login view
                document.getElementById('show-login-from-forgot').click();
            }
        });
    }

    // Expose resetOtpFlow for navigation module
    window._resetOtpFlow = resetOtpFlow;

    // Registration role-change handler (show/hide location fields)
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
        if (!isLocationDataReady()) {
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

    // Registration form
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

        // MISS-10: Validate ID proof file size (max 2 MB)
        if (idProofFile.size > 2 * 1024 * 1024) {
            alert('ID proof file must be less than 2 MB.');
            return;
        }

        // MISS-5: Password strength validation
        if (pwd.length < 6) {
            alert('Password must be at least 6 characters long.');
            return;
        }

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
            if (authError.message.includes("already registered") || authError.message.includes("already exists")) {
                const { data: profileCheck } = await supabase.from('profiles').select('email').eq('email', email).single();
                if (!profileCheck) {
                    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pwd });
                    if (signInError) {
                        alert('This email is already registered but your profile was deleted by an admin. However, the password you entered is incorrect. If you forgot your old password, please use the "Forgot Password" link on the login page to reset it, then try registering again.');
                        isRegistering = false;
                        return;
                    }
                } else {
                    isRegistering = false;
                    alert('Registration failed: User already exists. Please login instead.');
                    return;
                }
            } else {
                isRegistering = false;
                alert('Registration failed: ' + authError.message);
                return;
            }
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
}
