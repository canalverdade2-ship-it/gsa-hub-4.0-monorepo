import { useState, useEffect } from 'react';
import { Download, RefreshCw, DollarSign, TrendingUp, TrendingDown, CreditCard, ArrowUpCircle, ArrowDownCircle, Repeat } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

const FORMAS = ['pix','credito','debito','carteira','pontos','voucher','indicacao','dinheiro'];
const CORES_FORMAS: Record<string,string> = { pix:'bg-emerald-500', credito:'bg-blue-500', debito:'bg-indigo-500', carteira:'bg-violet-500', pontos:'bg-amber-500', voucher:'bg-rose-500', indicacao:'bg-cyan-500', dinheiro:'bg-teal-500' };

export function RelatorioFinanceiro({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [faturas, pgtos, saques, transf, carteira, ordensAssinaturas, assinaturas] = await Promise.all([
        supabase.from('faturas').select('valor_total, valor_pago, status, tipo, data_pagamento').gte('created_at', inicio).lte('created_at', fim),
        supabase.from('pagamentos').select('metodo, valor, data_pagamento').gte('data_pagamento', inicio).lte('data_pagamento', fim),
        supabase.from('saques').select('valor, valor_liquido, taxa_aplicada, status, data_solicitacao').gte('data_solicitacao', inicio).lte('data_solicitacao', fim),
        supabase.from('transferencias').select('valor, tipo, status, data_solicitacao').gte('data_solicitacao', inicio).lte('data_solicitacao', fim),
        supabase.from('clientes').select('saldo_carteira'),
        supabase.from('ordens_assinatura').select('status, assinatura_id, data_cancelamento'),
        supabase.from('assinaturas').select('id, valor'),
      ]);

      const fat = faturas.data || [];
      const pg = pgtos.data || [];
      const saq = saques.data || [];
      const tr = transf.data || [];

      const total = fat.reduce((s, f) => s + (f.status === 'pago' ? Number(f.valor_pago)||0 : 0), 0);
      const pendente = fat.reduce((s, f) => s + (['pendente','vencida','aguardando_link','pendente_pagamento'].includes(f.status) ? Number(f.valor_total)||0 : 0), 0);
      const cancelado = fat.reduce((s, f) => s + (f.status === 'cancelado' ? Number(f.valor_total)||0 : 0), 0);

      // Por tipo de fatura
      const porTipo: Record<string, number> = {};
      fat.filter(f => f.status === 'pago').forEach(f => {
        const t = f.tipo || 'servico';
        porTipo[t] = (porTipo[t] || 0) + (Number(f.valor_pago)||0);
      });

      // Por forma de pagamento
      const porForma: Record<string, number> = {};
      pg.forEach(p => { porForma[p.metodo] = (porForma[p.metodo] || 0) + (Number(p.valor)||0); });
      const totalFormas = Object.values(porForma).reduce((s, v) => s + v, 0) || 1;

      // Saques
      const saqPago = saq.filter(s => s.status === 'pago').reduce((sum, s) => sum + (Number(s.valor_liquido)||0), 0);
      const saqPendente = saq.filter(s => s.status === 'pendente').reduce((sum, s) => sum + (Number(s.valor)||0), 0);
      const saqCancelado = saq.filter(s => s.status === 'cancelado').reduce((sum, s) => sum + (Number(s.valor)||0), 0);
      const taxasSaq = saq.reduce((sum, s) => sum + (Number(s.taxa_aplicada)||0), 0);

      // Transferências
      const trSaldo = tr.filter(t => t.tipo === 'saldo').reduce((s, t) => s + (Number(t.valor)||0), 0);
      const trPontos = tr.filter(t => t.tipo === 'pontos').reduce((s, t) => s + (Number(t.valor)||0), 0);

      // Saldo total carteira
      const saldoCarteira = (carteira.data || []).reduce((s, c) => s + (Number(c.saldo_carteira)||0), 0);

      // Assinaturas (MRR & Churn)
      const ordensAss = ordensAssinaturas.data || [];
      const catAss = assinaturas.data || [];
      const mapValoresAss: Record<string, number> = {};
      catAss.forEach(a => mapValoresAss[a.id] = Number(a.valor) || 0);

      const assinaturasAtivas = ordensAss.filter(o => o.status === 'concluido');
      const mrr = assinaturasAtivas.reduce((acc, o) => acc + (mapValoresAss[o.assinatura_id] || 0), 0);
      
      const churnPeriodo = ordensAss.filter(o => o.status === 'cancelado' && o.data_cancelamento >= inicio && o.data_cancelamento <= fim).length;
      const totalAssinaturasAtivas = assinaturasAtivas.length;

      setDados({ total, pendente, cancelado, porTipo, porForma, totalFormas, saqPago, saqPendente, saqCancelado, taxasSaq, trSaldo, trPontos, saldoCarteira, fat, saq, mrr, totalAssinaturasAtivas, churnPeriodo });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(5)].map((_,i)=><div key={i} className="h-24 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => {
    if (!dados?.fat) return;
    exportarCSV(dados.fat.map((f: any) => ({
      status: f.status, tipo: f.tipo || '—', valor_total: f.valor_total, valor_pago: f.valor_pago,
    })), 'relatorio_financeiro');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Relatório Financeiro</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/> CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/> Atualizar</button>
        </div>
      </div>

      {/* Receita */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Receita Recebida', valor: formatarMoeda(dados?.total||0), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'A Receber (Pendente)', valor: formatarMoeda(dados?.pendente||0), icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Cancelado/Perdido', valor: formatarMoeda(dados?.cancelado||0), icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' },
        ].map((k, i) => (
          <div key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${k.bg} ${k.color} mb-3`}><k.icon className="h-5 w-5"/></div>
            <p className="text-2xl font-black text-neutral-900">{k.valor}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Por Tipo de Fatura */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">Receita por Tipo</h3>
        <div className="space-y-3">
          {Object.entries(dados?.porTipo || {}).map(([tipo, val]: [string, any]) => {
            const pct = dados?.total > 0 ? (val / dados.total * 100).toFixed(1) : '0';
            return (
              <div key={tipo}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-neutral-700 capitalize">{tipo}</span>
                  <span className="font-bold text-neutral-900">{formatarMoeda(val)} <span className="text-neutral-400 font-normal">({pct}%)</span></span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {Object.keys(dados?.porTipo || {}).length === 0 && <p className="text-sm text-neutral-400">Sem dados no período.</p>}
        </div>
      </div>

      {/* Formas de Pagamento */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><CreditCard className="h-4 w-4 text-indigo-500"/> Formas de Pagamento</h3>
        <div className="space-y-3">
          {FORMAS.filter(f => dados?.porForma?.[f]).map(forma => {
            const val = dados?.porForma?.[forma] || 0;
            const pct = ((val / dados?.totalFormas) * 100).toFixed(1);
            return (
              <div key={forma} className="flex items-center gap-3">
                <div className={`h-2.5 w-2.5 rounded-full ${CORES_FORMAS[forma] || 'bg-neutral-400'}`} />
                <span className="text-sm text-neutral-600 capitalize w-24">{forma}</span>
                <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div className={`h-full rounded-full ${CORES_FORMAS[forma] || 'bg-neutral-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-bold text-neutral-900 w-28 text-right">{formatarMoeda(val)}</span>
              </div>
            );
          })}
          {Object.keys(dados?.porForma || {}).length === 0 && <p className="text-sm text-neutral-400">Sem pagamentos no período.</p>}
        </div>
      </div>

      {/* Assinaturas (MRR & Churn) */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><Repeat className="h-4 w-4 text-indigo-500"/> Assinaturas (MRR & Churn)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-xs font-bold text-indigo-800">MRR (Receita Recorrente Mensal)</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">{formatarMoeda(dados?.mrr || 0)}</p>
            <p className="text-[10px] text-indigo-500 mt-1">Valor base de todas assinaturas ativas</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs font-bold text-emerald-800">Assinaturas Ativas</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{formatarNumero(dados?.totalAssinaturasAtivas || 0)}</p>
            <p className="text-[10px] text-emerald-500 mt-1">Total de contratos em andamento</p>
          </div>
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
            <p className="text-xs font-bold text-rose-800">Cancelamentos (Churn) no Período</p>
            <p className="text-2xl font-black text-rose-600 mt-1">{formatarNumero(dados?.churnPeriodo || 0)}</p>
            <p className="text-[10px] text-rose-500 mt-1">Assinaturas canceladas nestas datas</p>
          </div>
        </div>
      </div>

      {/* Saques e Transferências */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><ArrowUpCircle className="h-4 w-4 text-rose-500"/> Saques de Clientes</h3>
          <div className="space-y-3">
            {[{ label: 'Pago', valor: dados?.saqPago, color: 'text-emerald-600' },{ label: 'Pendente', valor: dados?.saqPendente, color: 'text-amber-600' },{ label: 'Cancelado', valor: dados?.saqCancelado, color: 'text-red-500' },{ label: 'Taxas Arrecadadas', valor: dados?.taxasSaq, color: 'text-indigo-600' }].map((r,i)=>(
              <div key={i} className="flex justify-between border-b border-neutral-50 pb-2 last:border-0">
                <span className="text-sm text-neutral-500">{r.label}</span>
                <span className={`font-bold text-sm ${r.color}`}>{formatarMoeda(r.valor||0)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-blue-500"/> Transferências e Carteira</h3>
          <div className="space-y-3">
            {[{ label: 'Transferências de Saldo', valor: dados?.trSaldo, color: 'text-blue-600' },{ label: 'Transferências de Pontos', valor: dados?.trPontos, color: 'text-amber-600', suffix: ' pts' },{ label: 'Saldo Total em Carteiras', valor: dados?.saldoCarteira, color: 'text-violet-600' }].map((r,i)=>(
              <div key={i} className="flex justify-between border-b border-neutral-50 pb-2 last:border-0">
                <span className="text-sm text-neutral-500">{r.label}</span>
                <span className={`font-bold text-sm ${r.color}`}>{r.suffix ? formatarNumero(r.valor||0)+r.suffix : formatarMoeda(r.valor||0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
