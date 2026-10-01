const url = 'https://qhveywofcqrqoldtoffv.supabase.co';
const key = 'sb_publishable_meCCJDiUjETM4rpQNMSMng_oxRp84Wc';

async function setup() {
    const timestamp = Date.now();
    const users = [
        { email: `superadmin_${timestamp}@example.com`, role: 'Super Admin' },
        { email: `gpuser_${timestamp}@example.com`, role: 'GP User', state: 'Delhi', district: 'New Delhi', sub_district: 'Delhi', village: 'Test Village' }
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
        const token = authData?.session?.access_token || key;
        
        console.log(`Signup ${u.email}:`, authRes.status);

        // 2. Insert Profile
        const profilePayload = {
            email: u.email,
            role: u.role,
            account_status: 'approved',
            state: u.state || null,
            district: u.district || null,
            sub_district: u.sub_district || null,
            village: u.village || null,
            id_proof_url: 'dummy.jpg'
        };
        
        const profRes = await fetch(`${url}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profilePayload)
        });
        
        console.log(`Profile Insert ${u.email}:`, profRes.status);
    }
}

setup().catch(console.error);
