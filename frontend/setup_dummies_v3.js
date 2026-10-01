const url = 'https://qhveywofcqrqoldtoffv.supabase.co';
const key = 'sb_publishable_meCCJDiUjETM4rpQNMSMng_oxRp84Wc';

async function setup() {
    // 1. Log in as Super Admin to get JWT
    const loginRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'superadmin@jalseva.in', password: 'admin' })
    });
    
    const loginData = await loginRes.json();
    const saToken = loginData.access_token;
    
    const gpEmail = `gpuser_${Date.now()}@example.com`;

    // 2. Sign up new GP User
    const signupRes = await fetch(`${url}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: gpEmail, password: 'Password123!', data: { role: 'GP User' } })
    });
    
    // Wait for the trigger to create the profile (if they have one) or we create it
    await new Promise(r => setTimeout(r, 2000));
    
    // Attempt to PATCH the existing profile
    let profRes = await fetch(`${url}/rest/v1/profiles?email=eq.${gpEmail}`, {
        method: 'PATCH',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${saToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ account_status: 'approved' })
    });
    
    console.log(`Profile PATCH ${gpEmail}:`, profRes.status);
    
    // If it didn't exist, we must create it. But wait, RLS blocks SuperAdmin from INSERTing.
    // However, if the user registers via the frontend, the frontend does the INSERT!
    // So let's get the user's JWT by logging in as the new user, and do the INSERT as the user.
    if (profRes.status !== 204 && profRes.status !== 200) {
        console.log("Patch failed, trying to insert as the user...");
    } else {
        console.log("Checking if row was updated...");
        const check = await fetch(`${url}/rest/v1/profiles?email=eq.${gpEmail}`, {
            headers: { 'apikey': key, 'Authorization': `Bearer ${saToken}` }
        });
        const rows = await check.json();
        if (rows.length === 0) {
            console.log("No profile row found. We must insert it as the user.");
            // Login as the user
            const uLogin = await fetch(`${url}/auth/v1/token?grant_type=password`, {
                method: 'POST',
                headers: { 'apikey': key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: gpEmail, password: 'Password123!' })
            });
            const uData = await uLogin.json();
            
            // Insert as user
            const uInsert = await fetch(`${url}/rest/v1/profiles`, {
                method: 'POST',
                headers: { 'apikey': key, 'Authorization': `Bearer ${uData.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: gpEmail, role: 'GP User', account_status: 'pending', state: 'Delhi', district: 'New Delhi', sub_district: 'Delhi', village: 'Test Village', id_proof_url: 'dummy.jpg' })
            });
            console.log("User Insert Profile:", uInsert.status);
            
            // Now patch as Super Admin
            profRes = await fetch(`${url}/rest/v1/profiles?email=eq.${gpEmail}`, {
                method: 'PATCH',
                headers: { 'apikey': key, 'Authorization': `Bearer ${saToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_status: 'approved' })
            });
            console.log("Super Admin Approve:", profRes.status);
        }
    }
    
    console.log(`\n\n--- SUCCESS ---\nGP User: ${gpEmail}\nPassword: Password123!`);
}

setup().catch(console.error);
