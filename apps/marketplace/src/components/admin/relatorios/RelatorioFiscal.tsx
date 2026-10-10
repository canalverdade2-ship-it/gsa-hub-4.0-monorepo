import { useState, useEffect } from 'react';
import { Download, RefreshCw, FileText } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatarMoeda, formatarNumero, getRangeDatas, exportarCSV, exportarPDF, formatarData } from './utils/relatorioExport';

interface Props { periodo: string; dataInicio?: string; dataFim?: string; }

export function RelatorioFiscal({ periodo, dataInicio, dataFim }: Props) {
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<any>(null);

  useEffect(() => { carregar(); }, [periodo, dataInicio, dataFim]);

  const carregar = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = getRangeDatas(periodo, dataInicio, dataFim);

      const { data: ordens } = await supabase
        .from('ordens_fiscais')
        .select('id, codigo_fiscal, cliente_nome, tipo_compra, valor_bruto, valor_desconto, valor_total, forma_pagamento, status_pagamento, status_emissao, numero_nota, data_emissao, data_pagamento, created_at')
        .gte('created_at', inicio)
        .lte('created_at', fim)
        .order('created_at', { ascending: false });

      const ords = ordens || [];
      const totalBruto = ords.reduce((s,o)=>s+(Number(o.valor_bruto)||0),0);
      const totalDesconto = ords.reduce((s,o)=>s+(Number(o.valor_desconto)||0),0);
      const totalLiquido = ords.reduce((s,o)=>s+(Number(o.valor_total)||0),0);

      // Por status emissão
      const pendEm = ords.filter(o=>o.status_emissao==='pendente_emissao').length;
      const emitidas = ords.filter(o=>o.status_emissao==='emitida').length;
      const cancelEm = ords.filter(o=>['cancelada','inutilizada'].includes(o.status_emissao)).length;

      // Por status pagamento
      const pagPend = ords.filter(o=>o.status_pagamento==='pendente').length;
      const pagPago = ords.filter(o=>o.status_pagamento==='pago').length;
      const pagCanc = ords.filter(o=>o.status_pagamento==='cancelado').length;

      // Por tipo de compra
      const porTipo: Record<string,number> = {};
      ords.forEach(o=>{ const t = o.tipo_compra||'outro'; porTipo[t]=(porTipo[t]||0)+1; });

      // Por forma de pagamento
      const porForma: Record<string,number> = {};
      ords.forEach(o=>{ if(o.forma_pagamento) porForma[o.forma_pagamento]=(porForma[o.forma_pagamento]||0)+(Number(o.valor_total)||0); });

      setDados({ totalBruto, totalDesconto, totalLiquido, pendEm, emitidas, cancelEm, pagPend, pagPago, pagCanc, porTipo, porForma, ords });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_,i)=><div key={i} className="h-24 bg-neutral-100 rounded-2xl"/>)}</div>;

  const exportar = () => exportarCSV(
    (dados?.ords||[]).map((o:any)=>({ codigo:o.codigo_fiscal, cliente:o.cliente_nome||'—', tipo:o.tipo_compra||'—', valor_bruto:o.valor_bruto, valor_desconto:o.valor_desconto, valor_total:o.valor_total, forma_pgto:o.forma_pagamento||'—', status_pag:o.status_pagamento, status_emissao:o.status_emissao, numero_nota:o.numero_nota||'—', data_emissao:formatarData(o.data_emissao) })),
    'relatorio_fiscal'
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-black text-neutral-900">Relatório Fiscal</h2>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportar} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-all"><Download className="h-3 w-3"/>CSV</button>
          <button onClick={exportarPDF} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-all"><FileText className="h-3 w-3"/>Imprimir PDF</button>
          <button onClick={carregar} className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-black transition-all"><RefreshCw className="h-3 w-3"/>Atualizar</button>
        </div>
      </div>

      {/* Totalizadores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label:'Valor Bruto Total', valor:formatarMoeda(dados?.totalBruto||0), color:'text-neutral-700', bg:'bg-neutral-100' },
          { label:'Descontos (-)' , valor:formatarMoeda(dados?.totalDesconto||0), color:'text-red-500', bg:'bg-red-50' },
          { label:'Valor Fiscal Total', valor:formatarMoeda(dados?.totalLiquido||0), color:'text-emerald-600', bg:'bg-emerald-50' },
        ].map((k,i)=>(
          <div key={i} className={`rounded-2xl ${k.bg} p-5 text-center`}>
            <p className={`text-2xl font-black ${k.color}`}>{k.valor}</p>
            <p className="text-xs text-neutral-500 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Status NF e Pagamento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4">📄 Status de Emissão NF</h3>
          <div className="space-y-3">
            {[{ label:'Pendente emissão', valor:dados?.pendEm, color:'text-amber-600' },
              { label:'Emitidas', valor:dados?.emitidas, color:'text-emerald-600' },
              { label:'Canceladas/Inutilizadas', valor:dados?.cancelEm, color:'text-red-500' },
            ].map((k,i)=>(
              <div key={i} className="flex justify-between border-b border-neutral-50 pb-2 last:border-0">
                <span className="text-sm text-neutral-500">{k.label}</span>
                <span className={`font-black text-lg ${k.color}`}>{formatarNumero(k.valor||0)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4">💳 Status de Pagamento</h3>
          <div className="space-y-3">
            {[{ label:'Pendente', valor:dados?.pagPend, color:'text-amber-600' },
              { label:'Pago', valor:dados?.pagPago, color:'text-emerald-600' },
              { label:'Cancelado', valor:dados?.pagCanc, color:'text-red-500' },
            ].map((k,i)=>(
              <div key={i} className="flex justify-between border-b border-neutral-50 pb-2 last:border-0">
                <span className="text-sm text-neutral-500">{k.label}</span>
                <span className={`font-black text-lg ${k.color}`}>{formatarNumero(k.valor||0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Por tipo */}
      {Object.keys(dados?.porTipo||{}).length > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <h3 className="font-bold text-neutral-900 mb-4">Ordens por Tipo de Compra</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(dados?.porTipo||{}).map(([tipo,total]:any)=>(
              <div key={tipo} className="rounded-xl bg-indigo-50 px-4 py-3 text-center min-w-[100px]">
                <p className="text-xl font-black text-indigo-700">{total}</p>
                <p className="text-xs text-indigo-500 capitalize">{tipo}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela detalhada */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 overflow-x-auto">
        <h3 className="font-bold text-neutral-900 mb-4">📋 Ordens Fiscais Detalhadas</h3>
        {dados?.ords?.length === 0
          ? <p className="text-sm text-neutral-400">Nenhuma ordem fiscal no período.</p>
          : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-neutral-400 uppercase border-b border-neutral-100">
                {['Código','Cliente','Tipo','Valor Total','Status Pag.','Status NF','Nº Nota','Data Emissão'].map(h=><th key={h} className="pb-2 pr-2 font-bold">{h}</th>)}
              </tr></thead>
              <tbody>
                {dados?.ords?.slice(0,20).map((o:any)=>{
                  const stColor = o.status_pagamento==='pago' ? 'bg-emerald-100 text-emerald-700' : o.status_pagamento==='pendente' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                  const emColor = o.status_emissao==='emitida' ? 'bg-emerald-100 text-emerald-700' : o.status_emissao==='pendente_emissao' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                  return (
                    <tr key={o.id} className="border-b border-neutral-50 last:border-0">
                      <td className="py-2 pr-2 font-mono text-neutral-500">{o.codigo_fiscal}</td>
                      <td className="py-2 pr-2 text-neutral-800 max-w-[120px] truncate">{o.cliente_nome||'—'}</td>
                      <td className="py-2 pr-2 capitalize text-neutral-600">{o.tipo_compra||'—'}</td>
                      <td className="py-2 pr-2 font-bold text-neutral-900">{formatarMoeda(o.valor_total)}</td>
                      <td className="py-2 pr-2"><span className={`px-1.5 py-0.5 rounded-full font-bold ${stColor}`}>{o.status_pagamento}</span></td>
                      <td className="py-2 pr-2"><span className={`px-1.5 py-0.5 rounded-full font-bold ${emColor}`}>{o.status_emissao?.replace('_',' ')}</span></td>
                      <td className="py-2 pr-2 text-neutral-500">{o.numero_nota||'—'}</td>
                      <td className="py-2 text-neutral-500">{formatarData(o.data_emissao)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }
        {(dados?.ords?.length||0) > 20 && <p className="text-xs text-neutral-400 mt-3">Exibindo 20 de {dados?.ords?.length} registros. Exporte CSV para ver todos.</p>}
      </div>
    </div>
  );
}
