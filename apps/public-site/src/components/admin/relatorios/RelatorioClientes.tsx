import { useState, useEffect } from 'react';
import { Download, RefreshCw, Users, UserCheck, UserX, Wallet } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioClientes({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [clientes, niveis, topFat] = await Promise.all([
        supabase.from('clientes').select('id, nome, status, tipo_pessoa, data_cadastro, saldo_carteira, saldo_pontos, carteira_bloqueada, pontos_bloqueados, nivel_id, pontos_totais'),
        supabase.from('client_levels').select('id, nome_nivel, cor'),
        supabase.from('faturas').select('cliente_id, valor_pago').eq('status','pago'),
      ]);

      const cli = clientes.data || [];
      const niv = niveis.data || [];
      const fat = topFat.data || [];

      const ativos = cli.filter(c => c.status === 'ativo').length;
      const inativos = cli.filter(c => c.status === 'inativo').length;
      const pendentes = cli.filter(c => c.status === 'pendente').length;
      const novos = cli.filter(c => c.data_cadastro >= inicio && c.data_cadastro <= fim).length;
      const pf = cli.filter(c => c.tipo_pessoa === 'pf').length;
      const pj = cli.filter(c => c.tipo_pessoa === 'pj').length;
      const bloquCar = cli.filter(c => c.carteira_bloqueada).length;
      const bloquPts = cli.filter(c => c.pontos_bloqueados).length;
      const saldoTotal = cli.reduce((s, c) => s + (Number(c.saldo_carteira)||0), 0);
      const pontosTotal = cli.reduce((s, c) => s + (Number(c.saldo_pontos)||0), 0);

      // Top 10 clientes por faturamento
      const fatPorCli: Record<string, number> = {};
      fat.forEach(f => { fatPorCli[f.cliente_id] = (fatPorCli[f.cliente_id]||0) + (Number(f.valor_pago)||0); });
      const top10 = cli
        .map(c => ({ id: c.id, nome: c.nome, total: fatPorCli[c.id] || 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      // Por nível
      const porNivel: Record<string, { nome: string; cor: string; total: number }> = {};
      cli.forEach(c => {
        const n = niv.find(nv => nv.id === c.nivel_id);
        const key = n?.nome_nivel || 'Sem nível';
        const cor = n?.cor || '#94a3b8';
        porNivel[key] = { nome: key, cor, total: (porNivel[key]?.total||0) + 1 };
      });

      setDados({ ativos, inativos, pendentes, novos, pf, pj, bloquCar, bloquPts, saldoTotal, pontosTotal, top10, porNivel, cli });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(4)].map((_,i)=><div key={i} className="h-28 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV(
    (dados?.cli || []).map((c: any) => ({ nome: c.nome, status: c.status, tipo: c.tipo_pessoa, saldo_carteira: c.saldo_carteira, saldo_pontos: c.saldo_pontos })),
    'relatorio_clientes'
  );

  const totalNivel = Object.values(dados?.porNivel || {}).reduce((s: any, v: any) => s + v.total, 0) as number;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Relatório de Clientes</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Ativos', valor: dados?.ativos, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Inativos', valor: dados?.inativos, icon: UserX, color: 'text-red-500', bg: 'bg-red-50' },
          { label: 'Pendentes', valor: dados?.pendentes, icon: Users, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Novos (período)', valor: dados?.novos, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map((k,i)=>(
          <div key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${k.bg} ${k.color} mb-3`}><k.icon className="h-5 w-5"/></div>
            <p className="text-2xl font-black text-neutral-900">{formatarNumero(k.valor||0)}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Saldo e pontos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Saldo Total em Carteiras', valor: formatarMoeda(dados?.saldoTotal||0), icon: Wallet, color: 'text-violet-600', bg:'bg-violet-50' },
          { label: 'Pontos em Circulação', valor: formatarNumero(dados?.pontosTotal||0)+' pts', icon: () => <span>🏆</span>, color: 'text-amber-600', bg:'bg-amber-50' },
          { label: 'PF / PJ', valor: `${dados?.pf} PF / ${dados?.pj} PJ`, icon: Users, color: 'text-blue-600', bg:'bg-blue-50' },
        ].map((k,i)=>(
          <div key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <p className="text-2xl font-black text-neutral-900">{k.valor}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Bloqueios */}
      {(dados?.bloquCar > 0 || dados?.bloquPts > 0) && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-5">
          <h3 className="font-bold text-red-800 mb-3">⚠️ Contas com Bloqueio</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-2xl font-black text-red-700">{dados?.bloquCar}</p><p className="text-xs text-red-500">Carteira bloqueada</p></div>
            <div><p className="text-2xl font-black text-red-700">{dados?.bloquPts}</p><p className="text-xs text-red-500">Pontos bloqueados</p></div>
          </div>
        </div>
      )}

      {/* Por Nível */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">Distribuição por Nível</h3>
        <div className="space-y-3">
          {Object.entries(dados?.porNivel || {}).sort((a: any, b: any) => b[1].total - a[1].total).map(([key, val]: [string, any]) => {
            const pct = totalNivel > 0 ? (val.total / totalNivel * 100).toFixed(1) : '0';
            return (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-neutral-700">{val.nome}</span>
                  <span className="font-bold text-neutral-900">{val.total} <span className="text-neutral-400 font-normal">({pct}%)</span></span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: val.cor }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top 10 Clientes */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 overflow-x-auto">
        <h3 className="font-bold text-neutral-900 mb-4">🥇 Top 10 Clientes por Faturamento</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-400 uppercase border-b border-neutral-100">
              <th className="pb-2 font-bold">#</th><th className="pb-2 font-bold">Cliente</th><th className="pb-2 font-bold text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {dados?.top10.map((c: any, i: number) => (
              <tr key={c.id} className="border-b border-neutral-50 last:border-0">
                <td className="py-2 text-neutral-400 font-bold">{i+1}</td>
                <td className="py-2 font-medium text-neutral-800">{c.nome}</td>
                <td className="py-2 font-black text-right text-emerald-600">{formatarMoeda(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
