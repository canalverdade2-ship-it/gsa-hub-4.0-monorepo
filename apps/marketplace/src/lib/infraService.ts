import { supabase } from './supabase';

export interface VpsMetrics {
  cpu: { usage: number; system: number; user: number; wait: number };
  memory: { total: number; used: number; free: number; cached: number; swap_used: number };
  disk: { total: number; used: number; free: number; inodes_used: number };
  network: { tx_bytes: number; rx_bytes: number };
  uptime: number;
  status: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  development_mode: number;
  original_name_servers: string[];
  name_servers: string[];
}

export interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxiable: boolean;
  proxied: boolean;
  ttl: number;
}

export interface CloudflareMetrics {
  requests: {
    total: number;
    cached: number;
    uncached: number;
    cacheHitRatio: number;
  };
  bandwidth: {
    totalBytes: number;
    cachedBytes: number;
    savedBytesRatio: number;
  };
  security: {
    threatsBlocked: number;
    captchaChallenges: number;
    botMitigations: number;
  };
  pagesAndStorage: {
    pagesRequests: number;
    storageUsedMb: number;
    r2LimitMb: number;
  };
}

export interface StorageFileItem {
  key: string;
  name: string;
  folder: string;
  size: number;
  uploadedAt: string;
  isPrivate: boolean;
  publicUrl?: string;
}

class InfraService {
  async getVpsMetrics(): Promise<VpsMetrics> {
    const { data, error } = await supabase.functions.invoke('vps-api/metrics', { method: 'GET' });
    if (error) throw error;
    return data;
  }

  async getCloudflareMetrics(): Promise<CloudflareMetrics> {
    const { data, error } = await supabase.functions.invoke('cloudflare-api/analytics', { method: 'GET' });
    if (error) throw error;
    return data;
  }

  async listR2Files(): Promise<StorageFileItem[]> {
    // Compatibilidade de nome para o módulo de infraestrutura; os arquivos agora
    // vivem exclusivamente no Storage local da Supabase da VPS.
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError || !buckets) return [];
    const files: StorageFileItem[] = [];
    for (const bucket of buckets) {
      const { data: objects } = await supabase.storage.from(bucket.name).list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      for (const object of objects || []) {
        if (!object.name || object.id === null) continue;
        files.push({ key: `${bucket.name}/${object.name}`, name: object.name, folder: bucket.name, size: object.metadata?.size || 0, uploadedAt: object.created_at || new Date().toISOString(), isPrivate: !bucket.public, publicUrl: bucket.public ? supabase.storage.from(bucket.name).getPublicUrl(object.name).data.publicUrl : undefined });
      }
    }
    return files;
  }

  async sendVpsPowerCommand(action: 'start' | 'stop' | 'reboot'): Promise<any> {
    const { data, error } = await supabase.functions.invoke('vps-api/power', {
      method: 'POST',
      body: { action }
    });
    if (error) throw error;
    return data;
  }

  async getCloudflareZone(): Promise<{ result: CloudflareZone }> {
    const { data, error } = await supabase.functions.invoke('cloudflare-api/zone', { method: 'GET' });
    if (error) throw error;
    return data;
  }

  async getCloudflareDns(): Promise<{ result: CloudflareDnsRecord[] }> {
    const { data, error } = await supabase.functions.invoke('cloudflare-api/dns', { method: 'GET' });
    if (error) throw error;
    return data;
  }

  async purgeCloudflareCache(files?: string[]): Promise<any> {
    const { data, error } = await supabase.functions.invoke('cloudflare-api/purge-cache', {
      method: 'POST',
      body: files ? { files } : {}
    });
    if (error) throw error;
    return data;
  }

  async setDevelopmentMode(on: boolean): Promise<any> {
    const { data, error } = await supabase.functions.invoke('cloudflare-api/dev-mode', {
      method: 'POST',
      body: { value: on ? 'on' : 'off' }
    });
    if (error) throw error;
    return data;
  }

  async setUnderAttackMode(on: boolean): Promise<any> {
    const { data, error } = await supabase.functions.invoke('cloudflare-api/under-attack', {
      method: 'POST',
      body: { value: on ? 'under_attack' : 'essentially_off' }
    });
    if (error) throw error;
    return data;
  }
}

export const infraService = new InfraService();
