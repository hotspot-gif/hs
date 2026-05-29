import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://xcdnpbtwnuavrhqtjhyz.supabase.co';
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjZG5wYnR3bnVhdnJocXRqaHl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MTI4MzksImV4cCI6MjA5MDE4ODgzOX0.bk83nXdwk9dnh3_b-XWowsAE6aB-_vVUKbxzj83eXzg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
