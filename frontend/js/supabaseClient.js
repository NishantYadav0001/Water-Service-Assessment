/**
 * Supabase Client — singleton initialization.
 *
 * Every other module that needs Supabase should import from here:
 *   import { supabase } from './supabaseClient.js';
 */

const SUPABASE_URL = 'https://qhveywofcqrqoldtoffv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_meCCJDiUjETM4rpQNMSMng_oxRp84Wc';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
