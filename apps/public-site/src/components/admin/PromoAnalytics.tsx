import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, TrendingUp, Users, DollarSign, Activity } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { toast } from 'react-hot-toast';

export function PromoAnalytics() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEconomia: 0,
    totalUsos: 0,
    clientesImpactados: 0,
    topPromocoes: [] as any[]
  });

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      // Fetch usages with promo details and client info
      const { data, error } = await supabase
        .from('promocoes_quantidade_uso')
        .select(`
          economia_gerada,
          quantidade_usada,
          cliente_id,
          promocoes_quantidade(nome)
        `);

      if (error) throw error;

      let economiaTotal = 0;
      let usosTotal = 0;
      const clientesSet = new Set();
      const promoContagem: Record<string, { usos: number, economia: number }> = {};

      data?.forEach((row: any) => {
        economiaTotal += row.economia_gerada || 0;
        usosTotal += row.quantidade_usada || 1;
        if (row.cliente_id) clientesSet.add(row.cliente_id);
        
        const promoNome = row.promocoes_quantidade?.nome || 'Promoção Excluída';
        if (!promoContagem[promoNome]) {
          promoContagem[promoNome] = { usos: 0, economia: 0 };
        }
        promoContagem[promoNome].usos += row.quantidade_usada || 1;
        promoContagem[promoNome].economia += row.economia_gerada || 0;
      });

      const topPromocoes = Object.entries(promoContagem)
        .map(([nome, stats]) => ({ nome, ...stats }))
        .sort((a, b) => b.economia - a.economia)
        .slice(0, 5);

      setStats({
        totalEconomia: economiaTotal,
        totalUsos: usosTotal,
        clientesImpactados: clientesSet.size,
        topPromocoes
      });

    } catch (e) {
      console.error('Erro ao buscar analytics', e);
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center items-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-indigo-100 font-bold uppercase tracking-widest text-xs mb-1">Economia Gerada</p>
              <h3 className="text-3xl font-black">{formatCurrency(stats.totalEconomia)}</h3>
            </div>
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs mb-1">Total de Vendas VIP</p>
              <h3 className="text-3xl font-black text-neutral-900">{stats.totalUsos} <span className="text-sm font-bold text-neutral-400">aplicações</span></h3>
            </div>
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-500" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-neutral-500 font-bold uppercase tracking-widest text-xs mb-1">Clientes Engajados</p>
              <h3 className="text-3xl font-black text-neutral-900">{stats.clientesImpactados} <span className="text-sm font-bold text-neutral-400">pessoas</span></h3>
            </div>
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-neutral-100">
          <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-base font-black text-neutral-900">Ranking das Promoções</h3>
        </div>
        
        {stats.topPromocoes.length === 0 ? (
          <div className="text-center py-10 text-neutral-500 font-medium">Nenhuma venda gerada ainda pelas promoções.</div>
        ) : (
          <div className="space-y-4">
            {stats.topPromocoes.map((promo, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100/50 hover:bg-neutral-100 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs">
                    {idx + 1}
                  </div>
                  <div>
                    <h4 className="font-bold text-neutral-900">{promo.nome}</h4>
                    <p className="text-xs text-neutral-500 font-medium">{promo.usos} vezes utilizada</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Valor Convertido</p>
                  <p className="font-black text-emerald-600">{formatCurrency(promo.economia)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
