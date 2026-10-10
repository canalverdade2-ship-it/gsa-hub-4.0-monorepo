import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtimeSubscription } from './useRealtime';

export interface PublicRegistrationSettings {
  ativo: boolean;
  codigo: string;
  tipo: 'pontos' | 'credito';
  valor: number;
}

const DEFAULT_SETTINGS: PublicRegistrationSettings = {
  ativo: false,
  codigo: '',
  tipo: 'pontos',
  valor: 0,
};

export function usePublicRegistrationSettings(enabled: boolean) {
  const [settings, setSettings] = useState<PublicRegistrationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('gsa_public_registration_settings');
      if (error) throw error;
      setSettings({
        ativo: Boolean(data?.ativo),
        codigo: typeof data?.codigo === 'string' ? data.codigo : '',
        tipo: data?.tipo === 'credito' ? 'credito' : 'pontos',
        valor: Number(data?.valor || 0),
      });
    } catch {
      // Fallback: consulta diretamente da tabela system_settings se o RPC falhar
      try {
        const { data: rows } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['codigo_cadastro_padrao_ativo', 'codigo_cadastro_padrao', 'bonus_cadastro_tipo', 'bonus_cadastro_valor']);
        
        if (rows && rows.length > 0) {
          const map: Record<string, string> = {};
          rows.forEach(r => { map[r.key] = r.value; });
          setSettings({
            ativo: map.codigo_cadastro_padrao_ativo?.toLowerCase() === 'true',
            codigo: map.codigo_cadastro_padrao || '',
            tipo: map.bonus_cadastro_tipo === 'credito' ? 'credito' : 'pontos',
            valor: Number(map.bonus_cadastro_valor || 0),
          });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useRealtimeSubscription(
    {
      table: 'system_settings',
      debounceMs: 300,
      enabled,
      onChange: refresh,
    },
    [enabled, refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { settings, loading, refresh };
}
