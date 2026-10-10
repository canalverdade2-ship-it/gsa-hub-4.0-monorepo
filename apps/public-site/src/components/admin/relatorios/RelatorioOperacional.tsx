import { useState, useEffect } from 'react';
import { Download, RefreshCw, Users, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarNumero, getRangeDatas, exportarCSV, formatarData } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioOperacional({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);
      const hoje = new Date().toISOString();

      const [colabRes, solExcRes, oaRes, ocRes, assRes] = await Promise.all([
        supabase.from('colaboradores').select('id, nome, status, funcao_id, created_at'),
        supabase.from('solicitacoes_exclusao').select('id, tabela, status, created_at').gte('created_at', inicio).lte('created_at', fim),
        supabase.from('ordens_assinatura').select('id, status, data_vencimento, data_criacao'),
        supabase.from('ordens_compra').select('id, status, data_criacao').gte('data_criacao', inicio).lte('data_criacao', fim),
        supabase.from('assinaturas').select('id, nome, status'),
      ]);

      const colab = colabRes.data || [];
      const solExc = solExcRes.data || [];
      const oa = oaRes.data || [];
      const oc = ocRes.data || [];
      const ass = assRes.data || [];

      // Colaboradores
      const colAtivos = colab.filter(c=>c.status==='ativo').length;
      const colInativos = colab.filter(c=>c.status==='inativo').length;

      // Solicitações exclusão
      const solPend = solExc.filter(s=>s.status==='pendente').length;
      const solAprov = solExc.filter(s=>s.status==='aprovado').length;
      const solRecus = solExc.filter(s=>s.status==='recusado').length;

      // Ordens assinatura
      const oaAtiva = oa.filter(o=>o.status==='concluido' && o.data_vencimento && new Date(o.data_vencimento)>new Date()).length;
      const oaVencida = oa.filter(o=>o.status==='concluido' && o.data_vencimento && new Date(o.data_vencimento)<=new Date()).length;
      const oaCancelamento = oa.filter(o=>o.status==='em_cancelamento').length;

      // Catálogo
      const assAtivas = ass.filter(a=>a.status==='ativo').length;
      const assInativas = ass.filter(a=>a.status==='inativo').length;

      // Compras produto
      const ocAnalise = oc.filter(o=>o.status==='em_analise').length;
      const ocConcluido = oc.filter(o=>o.status==='concluido').length;
      const ocCancelado = oc.filter(o=>o.status==='cancelado').length;

      setDados({ colAtivos, colInativos, solPend, solAprov, solRecus, oaAtiva, oaVencida, oaCancelamento, assAtivas, assInativas, ocAnalise, ocConcluido, ocCancelado, colab, solExc });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_,i)=><div key={i} className="h-24 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportarColab = () => exportarCSV((dados?.colab||[]).map((c:any)=>({ nome:c.nome, status:c.status })), 'relatorio_colaboradores');
  const exportarSol = () => exportarCSV((dados?.solExc||[]).map((s:any)=>({ tabela:s.tabela, status:s.status, data:formatarData(s.created_at) })), 'relatorio_exclusoes');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-black text-neutral-900">Relatório Operacional</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportarColab} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-all"><Download className="h-3 w-3"/>Colab. CSV</button>
          <button onClick={exportarSol} className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-all"><Download className="h-3 w-3"/>Excl. CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* Colaboradores */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-indigo-500"/>Colaboradores</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-emerald-50 p-4 text-center">
            <p className="text-2xl font-black text-emerald-600">{dados?.colAtivos}</p>
            <p className="text-xs text-emerald-600 mt-1">Ativos</p>
          </div>
          <div className="rounded-xl bg-red-50 p-4 text-center">
            <p className="text-2xl font-black text-red-500">{dados?.colInativos}</p>
            <p className="text-xs text-red-500 mt-1">Inativos</p>
          </div>
        </div>
      </div>

      {/* Solicitações de Exclusão */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🗑️ Solicitações de Exclusão (período)</h3>
        <div className="grid grid-cols-3 gap-3">
          {[{ label:'Pendentes', valor:dados?.solPend, icon:Clock, color:'text-amber-600', bg:'bg-amber-50' },
            { label:'Aprovadas', valor:dados?.solAprov, icon:CheckCircle, color:'text-emerald-600', bg:'bg-emerald-50' },
            { label:'Recusadas', valor:dados?.solRecus, icon:XCircle, color:'text-red-500', bg:'bg-red-50' },
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl ${k.bg} p-4 text-center`}>
              <k.icon className={`h-5 w-5 mx-auto mb-1 ${k.color}`}/>
              <p className={`text-xl font-black ${k.color}`}>{k.valor}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        {dados?.solPend > 0 && <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200"><p className="text-amber-700 text-sm font-bold">⚠️ {dados?.solPend} solicitação(ões) aguardando análise</p></div>}
      </div>

      {/* Assinaturas */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">📋 Ordens de Assinatura</h3>
        <div className="grid grid-cols-3 gap-3">
          {[{ label:'Vigentes (ativas)', valor:dados?.oaAtiva, color:'text-emerald-600', bg:'bg-emerald-50' },
            { label:'Vencidas', valor:dados?.oaVencida, color:'text-red-500', bg:'bg-red-50' },
            { label:'Em Cancelamento', valor:dados?.oaCancelamento, color:'text-amber-600', bg:'bg-amber-50' },
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl ${k.bg} p-4 text-center`}>
              <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-neutral-100 grid grid-cols-2 gap-3">
          <div className="text-center"><p className="font-bold text-neutral-900">{dados?.assAtivas}</p><p className="text-xs text-neutral-400">Assinaturas ativas no catálogo</p></div>
          <div className="text-center"><p className="font-bold text-neutral-900">{dados?.assInativas}</p><p className="text-xs text-neutral-400">Assinaturas inativas</p></div>
        </div>
      </div>

      {/* Compras de Produto */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🛒 Compras de Produto (período)</h3>
        <div className="grid grid-cols-3 gap-3">
          {[{ label:'Em Análise', valor:dados?.ocAnalise, color:'text-blue-600', bg:'bg-blue-50' },
            { label:'Concluídas', valor:dados?.ocConcluido, color:'text-emerald-600', bg:'bg-emerald-50' },
            { label:'Canceladas', valor:dados?.ocCancelado, color:'text-red-500', bg:'bg-red-50' },
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl ${k.bg} p-4 text-center`}>
              <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
