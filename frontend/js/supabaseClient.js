/**
 * Supabase Client — singleton initialization.
 *
 * Every other module that needs Supabase should import from here:
 *   import { supabase } from './supabaseClient.js';
 *
 * ⚠️  SECURITY (BUG-C1): Verify that SUPABASE_KEY below is the **anon/public** key.
 *     Standard Supabase anon keys are JWTs starting with "eyJ...".
 *     If this is the service_role key, it grants full database access to anyone
 *     who inspects the page source. NEVER expose the service_role key client-side.
 *
 * ⚠️  SECURITY (BUG-C2): Row-Level Security (RLS) policies MUST be enabled on
 *     both the `profiles` and `assessments` tables in the Supabase dashboard.
 *     Without RLS, all role-based filtering is client-side only and can be bypassed.
 *
 *     Required RLS policies:
 *
 *     TABLE: assessments
 *       - SELECT: GP User → own rows only (user_id = auth.email())
 *                 District Admin → rows matching their district, status != 'Draft'
 *                 State Admin → rows matching their state, status != 'Draft'
 *       - INSERT: GP User only
 *       - UPDATE: GP User → own rows, status in ('Draft','Rejected')
 *                 District Admin → status from 'Submitted' → 'Approved'/'Rejected'
 *                 State Admin → status from 'Submitted' → 'Approved'/'Rejected'
 *       - DELETE: GP User → own rows, status = 'Draft' only
 *
 *     TABLE: profiles
 *       - SELECT: Super Admin / State Admin / District Admin → scoped by location
 *       - UPDATE: Super Admin → account_status changes
 *       - DELETE: Super Admin only
 */

const SUPABASE_URL = 'https://qhveywofcqrqoldtoffv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_meCCJDiUjETM4rpQNMSMng_oxRp84Wc';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
