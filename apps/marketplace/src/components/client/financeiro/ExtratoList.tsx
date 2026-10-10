import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowDownCircle, 
  ArrowUpRight, 
  Info,
  Send,
  User,
  CheckCircle2,
  Clock,
  XCircle,
  HelpCircle,
  History,
  ShieldCheck
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { formatCurrency, formatDate, formatDateTime, formatLancamentoDescricao } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import { callClientRpc } from '../../../lib/clientRpc';
import { useWhatsAppDocument } from '../../../hooks/useWhatsAppDocument';
import { generateExtratoPDF } from '../../../lib/pdf';
import { whatsappNotificationService } from '../../../lib/whatsappNotificationService';

interface ExtratoListProps {
  clientId: string;
  initialItemId?: string;
}

export function ExtratoList({ clientId, initialItemId, clienteNome, clienteTelefone }: ExtratoListProps & { clienteNome?: string, clienteTelefone?: string }) {
  const [extrato, setExtrato] = useState<any[]>([]);
  const { isSendingWhatsApp, sendToWhatsApp } = useWhatsAppDocument();
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [selectedTransferencia, setSelectedTransferencia] = useState<any>(null);
  const [isTransferenciaModalOpen, setIsTransferenciaModalOpen] = useState(false);
  const [isEstornando, setIsEstornando] = useState(false);
  const [isEstornoModalOpen, setIsEstornoModalOpen] = useState(false);

  useEffect(() => {
    fetchExtrato();
    const channel = supabase.channel('extrato-upd').on('postgres_changes', { event: '*', schema: 'public', table: 'extrato_financeiro', filter: `cliente_id=eq.${clientId}` }, () => fetchExtrato()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, monthFilter]);

  const fetchExtrato = async () => {
    let { data } = await supabase.from('extrato_financeiro').select('*').eq('cliente_id', clientId).order('data', { ascending: false });
    if (data && monthFilter) {
      data = data.filter(item => String(item.data).includes(monthFilter));
    }
    setExtrato(data || []);
  };

  const handleEstornar = async () => {
    if (!selectedTransferencia) return;
    setIsEstornando(true);

    try {
      await callClientRpc('gsa_client_reverse_transfer', {
        p_transferencia_id: selectedTransferencia.id,
      });
      toast.success('Transferência estornada com sucesso!');

      setIsEstornoModalOpen(false);
      setIsTransferenciaModalOpen(false);
      fetchExtrato();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao estornar transferência.');
    } finally {
      setIsEstornando(false);
    }
  };

  const fetchTransferDetails = async (item: any) => {
    const { data } = await supabase.from('transferencias').select('*, cliente_origem:clientes!cliente_origem_id(nome), cliente_destino:clientes!cliente_destino_id(nome)').eq('id', item.referencia_id).maybeSingle();
    if (data) {
      setSelectedTransferencia(data);
      setIsTransferenciaModalOpen(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl ring-1 ring-neutral-300 shadow-md flex flex-col sm:flex-row items-center gap-4">
        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-full sm:flex-1 rounded-xl border p-2 text-sm" />
        
        <button
          onClick={async () => {
            try {
              const doc = await generateExtratoPDF(extrato, clienteNome || 'Cliente', { returnDoc: true }) as any;
              const pdfBase64 = doc.output('datauristring');
              
              const mensagemBase = whatsappNotificationService.gerarMensagemWhatsApp({
                tipo: 'extrato' as any,
                clienteNome: clienteNome,
              });
              
              await sendToWhatsApp(
                clienteTelefone,
                mensagemBase,
                pdfBase64,
                `extrato_financeiro_${new Date().getTime()}.pdf`
              );
            } catch (err) {
              console.error(err);
              toast.error("Erro ao gerar extrato.");
            }
          }}
          disabled={isSendingWhatsApp || extrato.length === 0}
          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-emerald-100 px-6 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-200 border border-emerald-200 transition-all disabled:opacity-50"
        >
          {isSendingWhatsApp ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" /> : <Send className="h-4 w-4" />}
          {isSendingWhatsApp ? 'Enviando...' : 'Enviar p/ WhatsApp'}
        </button>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-md ring-1 ring-neutral-300">
        {extrato.map(item => {
          const info = formatLancamentoDescricao(item.descricao);
          return (
          <div key={item.id} className="flex items-center justify-between border-b border-neutral-100 py-4 last:border-0">
            <div className="flex items-center gap-4">
              <div className={`h-10 w-10 flex items-center justify-center rounded-full ${item.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                {item.tipo === 'entrada' ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-neutral-900">{info.titulo}</p>
                  {info.autor && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600">
                      {info.autor}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-500">{formatDateTime(item.data)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-bold ${item.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>{item.tipo === 'entrada' ? '+' : '-'} {formatCurrency(item.valor)}</p>
              {(item.modulo_referencia === 'transferencias' || item.descricao?.includes('Transferência')) && (
                <button onClick={() => fetchTransferDetails(item)} className="text-[10px] font-bold text-indigo-600 uppercase">Detalhes</button>
              )}
            </div>
          </div>
          );
        })}
      </div>

      <Modal 
        isOpen={isTransferenciaModalOpen} 
        onClose={() => setIsTransferenciaModalOpen(false)} 
        title="Detalhes da Movimentação"
        size="md"
      >
        {selectedTransferencia && (
          <div className="space-y-6 py-2">
            {/* Header Info */}
            <div className="flex items-center gap-4 p-5 rounded-3xl bg-neutral-50 border border-neutral-100 ring-1 ring-neutral-200/50">
              <div className={`h-14 w-14 rounded-2xl shadow-sm flex items-center justify-center border ${
                selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                ['recusado', 'cancelado', 'estornado'].includes(selectedTransferencia.status) ? 'bg-rose-50 border-rose-100 text-rose-600' :
                'bg-amber-50 border-amber-100 text-amber-600'
              }`}>
                {selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? <CheckCircle2 className="h-7 w-7" /> :
                 ['recusado', 'cancelado', 'estornado'].includes(selectedTransferencia.status) ? <XCircle className="h-7 w-7" /> :
                 <Clock className="h-7 w-7" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Status da Transação</p>
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                    selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' :
                    ['recusado', 'cancelado', 'estornado'].includes(selectedTransferencia.status) ? 'bg-rose-100 text-rose-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'Finalizada' :
                     selectedTransferencia.status === 'estornado' ? 'Estornada' :
                     selectedTransferencia.status === 'recusado' ? 'Recusada' :
                     selectedTransferencia.status === 'cancelado' ? 'Cancelada' : 'Em Análise'}
                  </span>
                </div>
                <p className="text-sm font-black text-neutral-900">
                  {selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido' ? 'Transferência Processada com Sucesso' :
                   selectedTransferencia.status === 'estornado' ? 'Transferência Estornada' :
                   selectedTransferencia.status === 'recusado' ? 'Transferência Recusada' :
                   selectedTransferencia.status === 'cancelado' ? 'Transferência Cancelada' :
                   'Aguardando Aprovação do Sistema'}
                </p>
              </div>
            </div>

            {/* Envolvidos */}
            <div className="flex flex-col gap-3">
              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <User className="h-12 w-12" />
                </div>
                <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Send className="h-3 w-3" /> Origem
                </p>
                <p className="text-sm font-black text-neutral-900 truncate">{selectedTransferencia.cliente_origem?.nome}</p>
                <p className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Remetente</p>
              </div>

              <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5 text-indigo-600">
                  <ShieldCheck className="h-12 w-12" />
                </div>
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <User className="h-3 w-3" /> Destino
                </p>
                <p className="text-sm font-black text-neutral-900 truncate">{selectedTransferencia.cliente_destino?.nome}</p>
                <p className="text-[10px] text-neutral-400 font-bold uppercase mt-0.5">Destinatário</p>
              </div>
            </div>

            {/* Financeiro */}
            <div className="rounded-3xl bg-neutral-900 p-6 text-white shadow-2xl shadow-neutral-900/20">
              <div className="space-y-4">
                <div className="flex justify-between items-center text-neutral-400">
                  <span className="text-[10px] font-black uppercase tracking-widest">Valor Bruto</span>
                  <span className="text-sm font-bold">{formatCurrency(selectedTransferencia.valor)}</span>
                </div>
                
                {Number(selectedTransferencia.taxa_aplicada || 0) > 0 && (
                  <div className="flex justify-between items-center text-rose-400">
                    <span className="text-[10px] font-black uppercase tracking-widest">Taxa de Serviço</span>
                    <span className="text-sm font-bold">- {formatCurrency(selectedTransferencia.taxa_aplicada)}</span>
                  </div>
                )}

                <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest mb-1">Valor Final Creditado</p>
                    <p className="text-3xl font-black text-white leading-none">
                      {formatCurrency(selectedTransferencia.valor_liquido || selectedTransferencia.valor)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-neutral-500 uppercase tracking-tighter mb-1">Solicitado em</p>
                    <p className="text-[11px] font-bold text-neutral-300">{formatDateTime(selectedTransferencia.data_solicitacao || selectedTransferencia.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações / Rodapé */}
            <div className="space-y-3 pt-2">
              {(selectedTransferencia.status === 'aprovado' || selectedTransferencia.status === 'concluido') && selectedTransferencia.cliente_destino_id === clientId && (
                <button 
                  onClick={() => setIsEstornoModalOpen(true)} 
                  className="w-full rounded-2xl bg-rose-600 hover:bg-rose-700 py-4 text-white font-black uppercase tracking-widest text-[10px] shadow-xl shadow-rose-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <History className="h-4 w-4" />
                  ESTORNAR TRANSAÇÃO
                </button>
              )}
              
              <button 
                onClick={() => setIsTransferenciaModalOpen(false)} 
                className="w-full rounded-2xl border-2 border-neutral-100 py-4 text-neutral-400 font-black uppercase tracking-widest text-[10px] hover:bg-neutral-50 hover:text-neutral-600 transition-all flex items-center justify-center gap-2"
              >
                <HelpCircle className="h-4 w-4" />
                Fechar Detalhes
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isEstornoModalOpen} onClose={() => setIsEstornoModalOpen(false)} title="Confirmar Estorno">
        <div className="space-y-4">
          <p className="text-sm">Deseja realmente devolver este valor ao remetente?</p>
          <div className="flex gap-2">
            <button onClick={() => setIsEstornoModalOpen(false)} className="flex-1 rounded-xl bg-neutral-200 py-2 font-bold">Não</button>
            <button onClick={handleEstornar} disabled={isEstornando} className="flex-1 rounded-xl bg-red-600 py-2 text-white font-bold">{isEstornando ? '...' : 'Sim, Estornar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
