import { supabase } from './supabase';

export type ProviderSessionAccessState = {
  success: true;
  provider_id: string;
  provider_name?: string;
  status?: string;
  session_id?: string;
};

export async function validateProviderSessionAccess(expectedProviderId: string) {
  const { data, error } = await supabase.rpc('gsa_provider_session_access_state');
  const access = data as ProviderSessionAccessState | null;

  if (
    error
    || !access?.success
    || !access.provider_id
    || access.provider_id !== expectedProviderId
  ) {
    return null;
  }

  return access;
}
