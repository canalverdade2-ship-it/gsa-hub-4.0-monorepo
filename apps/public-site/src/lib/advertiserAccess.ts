import { supabase } from './supabase';
import { routes } from '../routing/routeCatalog';
import type { AdvertiserPortalSnapshot } from '../types/advertising';

export const advertiserAccess = {
  async requestMagicLink(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      throw new Error('Informe um e-mail válido.');
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}${routes.login.advertiser()}`,
      },
    });
    if (error) throw error;
  },

  async getSnapshot(): Promise<AdvertiserPortalSnapshot | null> {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError || !authData.session?.user) return null;
    const { data, error } = await supabase.rpc('gsa_advertiser_portal_snapshot');
    if (error) {
      if (error.code === '42501') return null;
      throw error;
    }
    const snapshot = data as AdvertiserPortalSnapshot;
    // Defense in depth for environments that still expose the legacy payment row.
    // Provider webhook payloads are operational data and must never remain in portal state.
    snapshot.campaigns = (snapshot.campaigns || []).map((campaign) => {
      if (!campaign.payment) return campaign;
      const sanitizedPayment = { ...campaign.payment } as typeof campaign.payment & { raw_payload?: unknown };
      delete sanitizedPayment.raw_payload;
      return { ...campaign, payment: sanitizedPayment };
    });
    return snapshot;
  },

  async signOut() {
    await supabase.auth.signOut({ scope: 'local' });
  },
};
