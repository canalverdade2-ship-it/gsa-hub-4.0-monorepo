import { useState, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarNumero, getRangeDatas, exportarCSV } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

const TIPO_LABELS: Record<string,string> = { geracao_fatura:'Geração Fatura', conversao_dinheiro:'Conversão Dinheiro', uso_fatura:'Uso em Fatura', ajuste_manual:'Ajuste Manual', estorno:'Estorno', bonus_boas_vindas:'Bônus Boas-vindas', indicacao:'Indicação', bonus:'Bônus', resgate:'Resgate' };
const TIPO_COLORS: Record<string,string> = { geracao_fatura:'bg-emerald-500', conversao_dinheiro:'bg-amber-500', uso_fatura:'bg-indigo-500', ajuste_manual:'bg-slate-500', estorno:'bg-red-500', bonus_boas_vindas:'bg-pink-500', indicacao:'bg-cyan-500', bonus:'bg-violet-500', resgate:'bg-orange-500' };

export function RelatorioGamificacao({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const [movRes, cliRes, nivRes, premRes] = await Promise.all([
        supabase.from('pontos_movimentacoes').select('tipo, pontos, valor_convertido, data_movimentacao').gte('data_movimentacao', inicio).lte('data_movimentacao', fim),
        supabase.from('clientes').select('saldo_pontos, pontos_totais, nivel_id'),
        supabase.from('client_levels').select('id, nome_nivel, cor, pontos_minimos'),
        supabase.from('cliente_premios').select('id, status, pontos_custo, data_resgate').gte('created_at', inicio).lte('created_at', fim),
      ]);

      const mov = movRes.data || [];
      const cli = cliRes.data || [];
      const niv = nivRes.data || [];
      const prem = premRes.data || [];

      // Totalizadores
      const saldoCirculacao = cli.reduce((s,c)=>s+(Number(c.saldo_pontos)||0),0);
      const totalGerados = mov.filter(m=>['geracao_fatura','bonus_boas_vindas','indicacao','bonus'].includes(m.tipo)).reduce((s,m)=>s+Math.abs(Number(m.pontos)),0);
      const totalConvertidos = mov.filter(m=>m.tipo==='conversao_dinheiro').reduce((s,m)=>s+Math.abs(Number(m.pontos)),0);
      const totalUsados = mov.filter(m=>m.tipo==='uso_fatura').reduce((s,m)=>s+Math.abs(Number(m.pontos)),0);
      const valorConvertidoTotal = mov.filter(m=>m.tipo==='conversao_dinheiro').reduce((s,m)=>s+(Number(m.valor_convertido)||0),0);

      // Por tipo
      const porTipo: Record<string,number> = {};
      mov.forEach(m=>{ porTipo[m.tipo] = (porTipo[m.tipo]||0)+Math.abs(Number(m.pontos)); });
      const maxTipo = Math.max(...Object.values(porTipo), 1);

      // Por nível
      const porNivel: Record<string,{nome:string;cor:string;total:number}> = {};
      niv.forEach(n=>{ porNivel[n.id] = {nome:n.nome_nivel, cor:n.cor||'#94a3b8', total:0}; });
      porNivel['sem_nivel'] = {nome:'Sem Nível',cor:'#94a3b8',total:0};
      cli.forEach(c=>{ const key = c.nivel_id && porNivel[c.nivel_id] ? c.nivel_id : 'sem_nivel'; porNivel[key].total++; });

      // Prêmios
      const premResgatados = prem.filter(p=>p.status==='resgatado').length;
      const premDisp = prem.filter(p=>p.status==='disponivel').length;
      const pontosCustoPrem = prem.filter(p=>p.status==='resgatado').reduce((s,p)=>s+(Number(p.pontos_custo)||0),0);

      setDados({ saldoCirculacao, totalGerados, totalConvertidos, totalUsados, valorConvertidoTotal, porTipo, maxTipo, porNivel, premResgatados, premDisp, pontosCustoPrem, mov });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_,i)=><div key={i} className="h-24 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV((dados?.mov||[]).map((m:any)=>({ tipo:m.tipo, pontos:m.pontos, valor_convertido:m.valor_convertido||'—', data:m.data_movimentacao })),'relatorio_gamificacao');
  const totalNivel = Object.values(dados?.porNivel||{}).reduce((s:any,v:any)=>s+v.total,0) as number;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-neutral-900">Gamificação & Pontos</h2>
        <div className="flex gap-2">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Pontos em Circulação', valor: formatarNumero(dados?.saldoCirculacao)+'pts', color:'text-amber-600', bg:'bg-amber-50' },
          { label:'Gerados (período)', valor: formatarNumero(dados?.totalGerados)+'pts', color:'text-emerald-600', bg:'bg-emerald-50' },
          { label:'Convertidos R$', valor: `R$${(dados?.valorConvertidoTotal||0).toFixed(2)}`, color:'text-blue-600', bg:'bg-blue-50' },
          { label:'Usados em faturas', valor: formatarNumero(dados?.totalUsados)+'pts', color:'text-indigo-600', bg:'bg-indigo-50' },
        ].map((k,i)=>(
          <div key={i} className={`rounded-2xl ${k.bg} p-5`}>
            <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Movimentação por Tipo */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">📊 Movimentação por Tipo</h3>
        <div className="space-y-3">
          {Object.entries(dados?.porTipo||{}).sort((a:any,b:any)=>b[1]-a[1]).map(([tipo,pontos]:any)=>{
            const pct = ((pontos/dados?.maxTipo)*100).toFixed(1);
            return (
              <div key={tipo}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-neutral-600">{TIPO_LABELS[tipo]||tipo}</span>
                  <span className="font-bold text-neutral-900">{formatarNumero(pontos)} pts</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div className={`h-full rounded-full ${TIPO_COLORS[tipo]||'bg-neutral-400'}`} style={{width:`${pct}%`}}/>
                </div>
              </div>
            );
          })}
          {Object.keys(dados?.porTipo||{}).length===0 && <p className="text-sm text-neutral-400">Sem movimentação no período.</p>}
        </div>
      </div>

      {/* Distribuição por Nível */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
        <h3 className="font-bold text-neutral-900 mb-4">🏆 Clientes por Nível</h3>
        <div className="space-y-3">
          {Object.entries(dados?.porNivel||{}).filter(([,v]:any)=>v.total>0).sort((a:any,b:any)=>b[1].total-a[1].total).map(([id,val]:any)=>{
            const pct = totalNivel>0 ? (val.total/totalNivel*100).toFixed(1) : '0';
            return (
              <div key={id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full inline-block" style={{backgroundColor:val.cor}}/>
                    {val.nome}
                  </span>
                  <span className="font-bold text-neutral-900">{val.total} <span className="text-neutral-400 font-normal">({pct}%)</span></span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${pct}%`,backgroundColor:val.cor}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prêmios */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label:'Prêmios Resgatados', valor:dados?.premResgatados, color:'text-emerald-600', bg:'bg-emerald-50' },
          { label:'Prêmios Disponíveis', valor:dados?.premDisp, color:'text-blue-600', bg:'bg-blue-50' },
          { label:'Custo Total (pts)', valor:formatarNumero(dados?.pontosCustoPrem), color:'text-amber-600', bg:'bg-amber-50' },
        ].map((k,i)=>(
          <div key={i} className={`rounded-2xl ${k.bg} p-5 text-center`}>
            <p className={`text-3xl font-black ${k.color}`}>{k.valor}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
