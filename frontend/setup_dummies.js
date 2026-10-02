const url = 'https://qhveywofcqrqoldtoffv.supabase.co';
const key = 'sb_publishable_meCCJDiUjETM4rpQNMSMng_oxRp84Wc';

async function setup() {
    const users = [
        { email: 'superadmin_test@example.com', role: 'Super Admin' },
        { email: 'stateadmin_test@example.com', role: 'State Admin', state: 'Delhi' },
        { email: 'districtadmin_test@example.com', role: 'District Admin', state: 'Delhi', district: 'New Delhi' },
        { email: 'gpuser_test@example.com', role: 'GP User', state: 'Delhi', district: 'New Delhi', sub_district: 'Delhi', village: 'Test Village' }
    ];

    for (let u of users) {
        // 1. Sign up user
        const authRes = await fetch(`${url}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: u.email,
                password: 'Password123!',
                data: { role: u.role }
            })
        });
        
        const authData = await authRes.json();
        console.log(`Signup ${u.email}:`, authRes.status);
        if (authRes.status > 299 && authData.msg !== "User already registered") {
             console.log(authData);
        }

        // 2. Upsert Profile (bypass frontend rules)
        const profilePayload = {
            email: u.email,
            role: u.role,
            account_status: 'approved',
            state: u.state || null,
            district: u.district || null,
            sub_district: u.sub_district || null,
            village: u.village || null
        };
        
        const profRes = await fetch(`${url}/rest/v1/profiles?email=eq.${u.email}`, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(profilePayload)
        });
        console.log(`Profile ${u.email}:`, profRes.status);
        
        // Also try UPDATE if POST with merge fails
        const updateRes = await fetch(`${url}/rest/v1/profiles?email=eq.${u.email}`, {
            method: 'PATCH',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ account_status: 'approved', role: u.role })
        });
        console.log(`Update Profile ${u.email}:`, updateRes.status);
    }
}

setup().catch(console.error);
