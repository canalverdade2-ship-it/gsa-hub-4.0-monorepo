import { useState, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioMarketing({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [voRes, indRes, promoRes, cliPromoRes] = await Promise.all([
        supabase.from('vouchers').select('id, tipo, valor, status, categoria, data_uso, created_at').gte('created_at', inicio).lte('created_at', fim),
        supabase.from('indicacoes').select('id, status, bonus_indicador, bonus_indicado, data_conclusao, data_criacao').gte('data_criacao', inicio).lte('data_criacao', fim),
        supabase.from('promocoes').select('id, titulo, tipo, status, created_at'),
        supabase.from('cliente_promocoes').select('id, status, created_at').gte('created_at', inicio).lte('created_at', fim),
      ]);

      const vo = voRes.data || [];
      const ind = indRes.data || [];
      const promo = promoRes.data || [];
      const cliPromo = cliPromoRes.data || [];

      // Vouchers
      const vouAtivo = vo.filter(v=>v.status==='ativo').length;
      const vouUsado = vo.filter(v=>v.status==='usado').length;
      const vouExpirado = vo.filter(v=>['expirado','cancelado'].includes(v.status)).length;
      const vouDesconto = vo.filter(v=>v.categoria==='desconto');
      const vouSaque = vo.filter(v=>v.categoria==='saque');
      const valorDescontos = vouDesconto.filter(v=>v.status==='usado').reduce((s,v)=>s+(Number(v.valor)||0),0);
      const valorSaquesVou = vouSaque.filter(v=>v.status==='usado').reduce((s,v)=>s+(Number(v.valor)||0),0);

      // Indicações
      const indAbertas = ind.filter(i=>i.status==='aberta').length;
      const indConcluidas = ind.filter(i=>i.status==='concluída').length;
      const indCanceladas = ind.filter(i=>i.status==='cancelada').length;
      const bonusTotalInd = ind.filter(i=>i.status==='concluída')
        .reduce((s,i)=>s+(Number(i.bonus_indicador)||0)+(Number(i.bonus_indicado)||0), 0);

      // Promoções
      const promoAtiva = promo.filter(p=>p.status==='ativa').length;
      const promoSuspensa = promo.filter(p=>p.status==='suspensa').length;
      const promoEncerrada = promo.filter(p=>p.status==='encerrada').length;
      const cliPromoAtiva = cliPromo.filter(c=>c.status==='ativa').length;
      const cliPromoUsada = cliPromo.filter(c=>c.status==='usada').length;

      setDados({ vouAtivo, vouUsado, vouExpirado, valorDescontos, valorSaquesVou, indAbertas, indConcluidas, indCanceladas, bonusTotalInd, promoAtiva, promoSuspensa, promoEncerrada, cliPromoAtiva, cliPromoUsada, vo, ind });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_,i)=><div key={i} className="h-24 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportarVou = () => exportarCSV((dados?.vo||[]).map((v:any)=>({ tipo:v.tipo, valor:v.valor, status:v.status, categoria:v.categoria||'—' })), 'relatorio_vouchers');
  const exportarInd = () => exportarCSV((dados?.ind||[]).map((i:any)=>({ status:i.status, bonus_indicador:i.bonus_indicador, bonus_indicado:i.bonus_indicado })), 'relatorio_indicacoes');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-black text-neutral-900">Marketing & Promoções</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportarVou} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-all"><Download className="h-3 w-3"/>Vouchers CSV</button>
          <button onClick={exportarInd} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-700 transition-all"><Download className="h-3 w-3"/>Indicações CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* Vouchers */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🎟️ Vouchers</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[{ label:'Ativos', valor:dados?.vouAtivo, color:'text-emerald-600', bg:'bg-emerald-50' },
            { label:'Usados', valor:dados?.vouUsado, color:'text-indigo-600', bg:'bg-indigo-50' },
            { label:'Expirados/Cancelados', valor:dados?.vouExpirado, color:'text-red-500', bg:'bg-red-50' }
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl ${k.bg} p-4 text-center`}>
              <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-3 border-t border-neutral-100">
          <div className="flex justify-between text-sm"><span className="text-neutral-500">Descontos concedidos (vouchers usados)</span><span className="font-bold text-rose-600">{formatarMoeda(dados?.valorDescontos||0)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-neutral-500">Saques via voucher</span><span className="font-bold text-violet-600">{formatarMoeda(dados?.valorSaquesVou||0)}</span></div>
        </div>
      </div>

      {/* Indicações */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🤝 Programa de Indicações</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[{ label:'Abertas', valor:dados?.indAbertas, color:'text-blue-600', bg:'bg-blue-50' },
            { label:'Concluídas', valor:dados?.indConcluidas, color:'text-emerald-600', bg:'bg-emerald-50' },
            { label:'Canceladas', valor:dados?.indCanceladas, color:'text-red-500', bg:'bg-red-50' }
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl ${k.bg} p-4 text-center`}>
              <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-neutral-100">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Bônus total pagos (indicador + indicado)</span>
            <span className="font-bold text-emerald-600 text-base">{formatarMoeda(dados?.bonusTotalInd||0)}</span>
          </div>
        </div>
      </div>

      {/* Promoções */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🎯 Promoções</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {[{ label:'Ativas', valor:dados?.promoAtiva, color:'text-emerald-600', bg:'bg-emerald-50' },
            { label:'Suspensas', valor:dados?.promoSuspensa, color:'text-amber-600', bg:'bg-amber-50' },
            { label:'Encerradas', valor:dados?.promoEncerrada, color:'text-neutral-500', bg:'bg-neutral-100' }
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl ${k.bg} p-4 text-center`}>
              <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-3 border-t border-neutral-100">
          <div className="flex justify-between text-sm"><span className="text-neutral-500">Promoções ativas em clientes</span><span className="font-bold text-indigo-600">{formatarNumero(dados?.cliPromoAtiva||0)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-neutral-500">Promoções utilizadas</span><span className="font-bold text-emerald-600">{formatarNumero(dados?.cliPromoUsada||0)}</span></div>
        </div>
      </div>
    </div>
  );
}
