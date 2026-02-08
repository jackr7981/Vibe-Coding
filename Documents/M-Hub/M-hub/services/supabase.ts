import { createClient } from '@supabase/supabase-js';

// Access environment variables for Supabase configuration securely
// Using optional chaining and fallback to empty object to prevent "process is not defined" error
const getEnvVar = (key: string) => {
  try {
    return process.env[key];
  } catch (e) {
    return undefined;
  }
};

const supabaseUrl = getEnvVar('SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_ANON_KEY');

export const isMockMode = !supabaseUrl || !supabaseKey || supabaseUrl === 'https://your-project.supabase.co';

// Fallback for development/preview to prevent crash if keys aren't set
// This allows the UI to render, though backend features won't work without valid keys.
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseKey || 'placeholder-key';

if (isMockMode) {
  console.warn("Supabase credentials missing! Running in Mock Mode with simulated data.");
}

export const supabase = createClient(url, key);

// Helper to construct public URL for images
export const getStorageUrl = (bucket: string, path: string) => {
  if (!path) return '';
  if (path.startsWith('http')) return path; // Already a URL
  // If we are using placeholder, return a generic placeholder or nothing
  if (isMockMode) return path.startsWith('data:') ? path : `https://placehold.co/400?text=${path}`; 
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};