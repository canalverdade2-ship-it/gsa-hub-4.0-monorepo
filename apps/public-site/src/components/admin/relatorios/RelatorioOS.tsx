import { useState, useEffect } from 'react';
import { Download, RefreshCw, ClipboardList, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioOS({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [osRes, orcRes] = await Promise.all([
        supabase.from('ordens_servico').select('id, status, data_inicio, data_fim, tipo_entrega').gte('data_inicio', inicio).lte('data_inicio', fim),
        supabase.from('orcamentos').select('id, status, total, categoria, data_criacao').gte('data_criacao', inicio).lte('data_criacao', fim),
      ]);

      const os = osRes.data || [];
      const orc = orcRes.data || [];

      const andamento = os.filter(o => o.status === 'andamento').length;
      const concluidas = os.filter(o => o.status === 'concluido').length;
      const canceladas = os.filter(o => o.status === 'cancelado').length;
      const total = os.length;
      const taxaConclusao = total > 0 ? ((concluidas / total) * 100).toFixed(1) : '0';
      const taxaCancelamento = total > 0 ? ((canceladas / total) * 100).toFixed(1) : '0';

      // Tempo médio
      const concl = os.filter(o => o.status === 'concluido' && o.data_inicio && o.data_fim);
      const tempoMedioMs = concl.length > 0
        ? concl.reduce((s, o) => s + (new Date(o.data_fim!).getTime() - new Date(o.data_inicio).getTime()), 0) / concl.length
        : 0;
      const tempoMedioDias = (tempoMedioMs / (1000*60*60*24)).toFixed(1);

      // Tipo entrega
      const whatsapp = os.filter(o => o.tipo_entrega === 'whatsapp').length;
      const online = os.filter(o => o.tipo_entrega === 'online').length;

      // Orçamentos
      const orcAberto = orc.filter(o => o.status === 'aberto').length;
      const orcAprovado = orc.filter(o => o.status === 'aprovado').length;
      const orcCancelado = orc.filter(o => o.status === 'cancelado').length;
      const orcNegociacao = orc.filter(o => o.status === 'negociação').length;
      const valorTotalOrc = orc.filter(o=>o.status==='aprovado').reduce((s,o)=>s+(Number(o.total)||0),0);

      // Por categoria orçamento
      const porCategoria: Record<string, number> = {};
      orc.forEach(o => { const c = o.categoria || 'outro'; porCategoria[c] = (porCategoria[c]||0)+1; });

      setDados({ andamento, concluidas, canceladas, total, taxaConclusao, taxaCancelamento, tempoMedioDias, whatsapp, online, orcAberto, orcAprovado, orcCancelado, orcNegociacao, valorTotalOrc, porCategoria, os, orc });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(4)].map((_,i)=><div key={i} className="h-24 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportarOS = () => exportarCSV((dados?.os||[]).map((o:any)=>({ status:o.status, tipo_entrega:o.tipo_entrega||'—', data_inicio:o.data_inicio, data_fim:o.data_fim||'—' })), 'relatorio_os');
  const exportarOrc = () => exportarCSV((dados?.orc||[]).map((o:any)=>({ status:o.status, categoria:o.categoria, total:o.total })), 'relatorio_orcamentos');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-black text-neutral-900">Relatório de OS & Orçamentos</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportarOS} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-all"><Download className="h-3 w-3"/>OS CSV</button>
          <button onClick={exportarOrc} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>Orç. CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs OS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Em Andamento', valor: dados?.andamento, icon: Clock, color:'text-blue-600', bg:'bg-blue-50' },
          { label: 'Concluídas', valor: dados?.concluidas, icon: CheckCircle, color:'text-emerald-600', bg:'bg-emerald-50' },
          { label: 'Canceladas', valor: dados?.canceladas, icon: XCircle, color:'text-red-500', bg:'bg-red-50' },
          { label: 'Total', valor: dados?.total, icon: ClipboardList, color:'text-indigo-600', bg:'bg-indigo-50' },
        ].map((k,i)=>(
          <div key={i} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${k.bg} ${k.color} mb-3`}><k.icon className="h-5 w-5"/></div>
            <p className="text-2xl font-black text-neutral-900">{formatarNumero(k.valor||0)}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Métricas Qualidade */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200 text-center">
          <p className="text-3xl font-black text-emerald-600">{dados?.taxaConclusao}%</p>
          <p className="text-sm text-neutral-500 mt-1">Taxa de Conclusão</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200 text-center">
          <p className="text-3xl font-black text-indigo-600">{dados?.tempoMedioDias} dias</p>
          <p className="text-sm text-neutral-500 mt-1">Tempo Médio de Execução</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-neutral-200 text-center">
          <p className="text-3xl font-black text-red-500">{dados?.taxaCancelamento}%</p>
          <p className="text-sm text-neutral-500 mt-1">Taxa de Cancelamento</p>
        </div>
      </div>

      {/* Tipo de Entrega */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">Tipo de Entrega</h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="rounded-xl bg-green-50 p-4">
            <p className="text-2xl font-black text-green-700">📱 {dados?.whatsapp}</p>
            <p className="text-xs text-green-600 mt-1">WhatsApp</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-2xl font-black text-blue-700">🌐 {dados?.online}</p>
            <p className="text-xs text-blue-600 mt-1">Online</p>
          </div>
        </div>
      </div>

      {/* Orçamentos */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">📄 Orçamentos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label:'Abertos', valor:dados?.orcAberto, color:'text-blue-600', bg:'bg-blue-50' },
            { label:'Aprovados', valor:dados?.orcAprovado, color:'text-emerald-600', bg:'bg-emerald-50' },
            { label:'Cancelados', valor:dados?.orcCancelado, color:'text-red-500', bg:'bg-red-50' },
            { label:'Em Negociação', valor:dados?.orcNegociacao, color:'text-amber-600', bg:'bg-amber-50' },
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl ${k.bg} p-4 text-center`}>
              <p className={`text-2xl font-black ${k.color}`}>{k.valor||0}</p>
              <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
          {Object.entries(dados?.porCategoria||{}).map(([cat, total]: [string,any])=>(
            <div key={cat} className="flex justify-between text-sm">
              <span className="text-neutral-600 capitalize">{cat}</span>
              <span className="font-bold text-neutral-900">{total} orçamentos</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
