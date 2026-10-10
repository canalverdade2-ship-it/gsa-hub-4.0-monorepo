import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { VIP_LEVELS, VIPLevel } from '../constants';

export function useVipLevels() {
  const [levels, setLevels] = useState<VIPLevel[]>(VIP_LEVELS);
  const [loading, setLoading] = useState(true);

  const fetchLevels = async () => {
    try {
      const { data, error } = await supabase
        .from('client_levels')
        .select('*')
        .order('pontos_minimos', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const mappedLevels: VIPLevel[] = data.map(dbLevel => ({
          id: dbLevel.nome_nivel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
          name: dbLevel.nome_nivel,
          dbId: dbLevel.id, // UUID from database - used for realtime matching
          minPoints: dbLevel.pontos_minimos,
          maxPoints: dbLevel.pontos_maximos,
          multiplier: Number(dbLevel.pontos_por_real),
          color: dbLevel.cor || '#f5f5f5',
          textColor: dbLevel.cor_texto || '#1a1a1a',
          visualStyle: (dbLevel.visual_style as any) || 'clean',
          feePercentage: 5,
          price: Number(dbLevel.preco),
          discountPercentage: 0,
          benefits: [`Multiplicador de pontos: ${Number(dbLevel.pontos_por_real)}x`],
          exclusiveBenefits: [`Multiplicador de pontos: ${Number(dbLevel.pontos_por_real)}x`]
        }));
        setLevels(mappedLevels);
      }
    } catch (error) {
      console.error('Error fetching levels:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevels();

    // Nome único por instância: um nome fixo faz o Supabase reutilizar o mesmo
    // canal já inscrito e lançar "cannot add postgres_changes callbacks ... after subscribe()".
    const channel = supabase
      .channel(`vip-changes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_levels' }, () => {
        fetchLevels();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  return { levels, loading, refreshLevels: fetchLevels };
}
