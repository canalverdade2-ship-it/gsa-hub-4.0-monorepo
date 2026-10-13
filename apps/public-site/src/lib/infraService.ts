import { supabase } from './supabase';

export interface VpsMetrics {
  cpu: { usage: number; system: number; user: number; wait: number };
  memory: { total: number; used: number; free: number; cached: number; swap_used: number };
  disk: { total: number; used: number; free: number; inodes_used: number };
  network: { tx_bytes: number; rx_bytes: number };
  uptime: number;
  status: string;
}

class InfraService {
  async getVpsMetrics(): Promise<VpsMetrics> {
    const { data, error } = await supabase.functions.invoke('vps-api/metrics', { method: 'GET' });
    if (error) throw error;
    return data;
  }

  async sendVpsPowerCommand(action: 'start' | 'stop' | 'reboot'): Promise<unknown> {
    const { data, error } = await supabase.functions.invoke('vps-api/power', {
      method: 'POST',
      body: { action },
    });
    if (error) throw error;
    return data;
  }
}

export const infraService = new InfraService();
