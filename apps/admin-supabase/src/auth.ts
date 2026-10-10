import type { Session } from '@supabase/supabase-js';
import { requireSupabase, supabase } from './lib/supabase';

export type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'client';
  clientId?: string | null;
  adminRole?: string;
  permissions?: string[];
};

type ProfileRow = {
  id: string;
  role: 'admin' | 'client';
  admin_role: string | null;
  permissions: string[] | null;
  customer_id: string | null;
  full_name: string;
  active: boolean;
};

async function profileForSession(session: Session | null): Promise<PortalUser | null> {
  if (!session || !supabase) return null;
  const { data: profile, error } = await supabase
    .from('gsa_profiles')
    .select('id, role, admin_role, permissions, customer_id, full_name, active')
    .eq('id', session.user.id)
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return null;
  }
  return {
    id: profile.id,
    name: profile.full_name || session.user.email || 'Usuário',
    email: session.user.email || '',
    role: profile.role,
    clientId: profile.customer_id,
    adminRole: profile.admin_role || undefined,
    permissions: profile.permissions || []
  };
}

export async function currentPortalUser() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return profileForSession(data.session);
}

export async function signInPortal(input: { portal: 'admin' | 'client'; email?: string; password?: string; login?: string }) {
  const client = requireSupabase();
  if (input.portal === 'admin') {
    const { data, error } = await client.auth.signInWithPassword({
      email: String(input.email || '').trim().toLowerCase(),
      password: String(input.password || '')
    });
    if (error) throw error;
    const user = await profileForSession(data.session);
    if (!user || user.role !== 'admin') {
      await client.auth.signOut();
      throw new Error('Este acesso não pertence a um usuário administrativo.');
    }
    return user;
  }

  const login = String(input.login || '').replace(/\D/g, '');
  if (![5, 6].includes(login.length)) throw new Error('Informe os 6 primeiros dígitos do CPF ou os 5 primeiros do CNPJ.');
  const { data, error } = await client.functions.invoke('client-login', { body: { login } });
  if (error) throw error;
  if (!data?.token_hash) throw new Error(data?.error || 'Não foi possível iniciar a sessão do cliente.');
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.token_hash,
    type: 'magiclink'
  });
  if (verifyError) throw verifyError;
  const user = await profileForSession(verified.session);
  if (!user || user.role !== 'client') {
    await client.auth.signOut();
    throw new Error('Este acesso não pertence a um cliente.');
  }
  return user;
}

export async function signOutPortal() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function onPortalSessionChange(callback: (user: PortalUser | null) => void) {
  const client = requireSupabase();
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    // Defer the profile query out of the auth callback to avoid locking the
    // Supabase client's auth mutex during token refresh.
    queueMicrotask(() => {
      void profileForSession(session).then(callback).catch(() => callback(null));
    });
  });
  return data.subscription;
}
