import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

export function useStoreConfig() {
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('19,90');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'loja_frete_gratis_valor')
          .maybeSingle();

        if (isMounted && data?.value) {
          setFreeShippingThreshold(data.value);
        }
      } catch (error) {
        console.warn('Falha ao carregar configurações da loja', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    void fetchConfig();
    return () => { isMounted = false; };
  }, []);

  return {
    freeShippingThreshold,
    loading
  };
}
