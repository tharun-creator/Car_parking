import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isPlaceholder = (val: string) => {
  return !val || 
         val.includes('your_supabase') || 
         val.includes('placeholder') || 
         val.includes('project_url_here') || 
         val.includes('service_role_key_here');
};

export const supabase = (supabaseUrl && supabaseServiceKey && !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseServiceKey))
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;
