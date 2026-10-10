import { callAdminRpc } from './adminRpc';
export type GsaTvExtended = {
  execution: any[];
  watchdog: any[];
  graphics: any[];
  live_sources: any[];
  rights: any[];
  campaigns: any[];
  ai_projects: any[];
  ai_jobs: any[];
  presenters: any[];
  editorial_policies: any[];
  server_time?: string;
};
export const EMPTY_GSA_TV_EXTENDED: GsaTvExtended = { execution: [], watchdog: [], graphics: [], live_sources: [], rights: [], campaigns: [], ai_projects: [], ai_jobs: [], presenters: [], editorial_policies: [] };
export async function getGsaTvExtended() {
  return callAdminRpc<GsaTvExtended>('gsa_admin_gsa_tv_extended');
}
export async function mutateGsaTvExtended(action: string, payload: Record<string, unknown>) {
  return callAdminRpc('gsa_admin_gsa_tv_extended_mutate', { p_action: action, p_payload: payload });
}
