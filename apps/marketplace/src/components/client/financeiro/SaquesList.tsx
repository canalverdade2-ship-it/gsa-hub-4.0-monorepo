import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Info, 
  ArrowUpRight, 
  Globe, 
  Ticket, 
  Calendar, 
  RefreshCw 
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { formatCurrency, formatDate, formatDateTime, generateUUID, maskCPF, maskCNPJ, maskPhone } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import { callClientRpc } from '../../../lib/clientRpc';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';

interface Saque {
  id: string;
  cliente_id: string;
  valor: number;
  taxa_aplicada: number;
  valor_liquido: number;
  tipo_chave_pix: string;
  chave_pix: string;
  status: string;
  data_solicitacao: string;
  data_pagamento?: string;
  data_vencimento?: string;
  motivo_cancelamento?: string;
  motivo_prorrogacao?: string;
  observacoes?: string;
}

interface SaquesListProps {
  clientId: string;
  saldo: number;
  cliente: any;
  onRefresh: () => void;
  shouldOpenModal: boolean;
  onModalOpen: () => void;
  initialItemId?: string;
  feePercentage: number;
  minSaque: number;
  hasPaidFatura: boolean;
}

export function SaquesList({ 
  clientId, 
  saldo, 
  cliente, 
  onRefresh,
  shouldOpenModal,
  onModalOpen,
  initialItemId,
  feePercentage,
  minSaque,
  hasPaidFatura
}: SaquesListProps) {
  const [saques, setSaques] = useState<Saque[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ tipo_chave_pix: '', chave_pix: '' });
  const [selectedSaque, setSelectedSaque] = useState<Saque | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const hasAutoOpened = useRef<string | null>(null);
  const withdrawalRequestId = useRef<string>(generateUUID());

  useEffect(() => {
    if (shouldOpenModal) {
      setStep(1);
      setIsModalOpen(true);
      onModalOpen();
    }
  }, [shouldOpenModal]);

  const fetchSaques = async () => {
    const { data } = await supabase.from('saques').select('*').eq('cliente_id', clientId).order('data_solicitacao', { ascending: false });
    if (data) setSaques(data);
  };

  useEffect(() => {
    void fetchSaques();
  }, [clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'saques',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        debounceMs: 300,
        onChange: () => {
          fetchSaques();
          onRefresh();
        },
      },
    ],
    [clientId]
  );

    const isPixValid = () => {
      const { tipo_chave_pix, chave_pix } = formData;
      if (!tipo_chave_pix || !chave_pix) return false;

      const cleanChave = chave_pix.replace(/\D/g, '');

      switch (tipo_chave_pix) {
        case 'cpf':
          return cleanChave.length === 11;
        case 'cnpj':
          return cleanChave.length === 14;
        case 'email':
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave_pix);
        case 'telefone':
          return cleanChave.length >= 10 && cleanChave.length <= 11;
        case 'aleatoria':
          return chave_pix.length >= 32;
        default:
          return true;
      }
    };

    const handleRequestWithdrawal = async () => {
      if (isSubmitting) return;
      
      if (saldo < minSaque) {
        toast.error(`O valor mínimo para saque é ${formatCurrency(minSaque)}.`);
        return;
      }

      if (!hasPaidFatura && !cliente?.saque_liberado_manual) {
        toast.error('O saque só é liberado após o pagamento da primeira fatura.');
        return;
      }

      if (!isPixValid()) {
        toast.error('Por favor, informe uma chave PIX válida.');
        return;
      }

      setIsSubmitting(true);
      try {
        const saqueResult = await callClientRpc<any>('gsa_client_request_withdrawal', {
          p_request_id: withdrawalRequestId.current,
          p_valor: saldo,                          // valor total do saldo a sacar
          p_chave_pix: formData.chave_pix,
          p_tipo_chave: formData.tipo_chave_pix,   // corrigido: p_tipo_chave (não p_tipo_chave_pix)
        });

        withdrawalRequestId.current = generateUUID();
        toast.success('Solicitação de saque enviada com sucesso!');
        setIsModalOpen(false);
        onRefresh();
        fetchSaques();
        
      } catch (err: any) {
        toast.error(err.message || 'Erro ao solicitar saque.');
      } finally {
        setIsSubmitting(false);
      }
    };
    const confirmCancelSaque = async () => {
      if (!selectedSaque || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await callClientRpc('gsa_client_cancel_withdrawal', {
          p_saque_id: selectedSaque.id,
          p_motivo: cancelReason || 'Cancelado pelo cliente'
        });

        toast.success('Saque cancelado e valor estornado para sua carteira.');
        setIsDetailOpen(false);
        setCancelReason('');
        onRefresh();
        fetchSaques();

      } catch (err: any) {
        toast.error(err.message || 'Erro ao cancelar saque.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const openWithdrawalModal = () => {
      if (cliente?.carteira_bloqueada) {
        toast.error('Sua carteira está bloqueada para saques.');
        return;
      }

      if (saldo < minSaque) {
        toast.error(`O valor mínimo para saque é ${formatCurrency(minSaque)}.`);
        return;
      }

      if (!hasPaidFatura && !cliente?.saque_liberado_manual) {
        toast.error('O saque só é liberado após o pagamento da primeira fatura.');
        return;
      }

      setStep(1);
      setIsModalOpen(true);
    };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-bold text-neutral-900">Histórico de Saques</h3>
        </div>
        <div className="space-y-4">
          {saques.length === 0 ? (
            <div className="rounded-3xl bg-white shadow-md ring-1 ring-neutral-300 overflow-hidden">
              <p className="py-12 text-center text-neutral-400">Nenhum saque solicitado.</p>
            </div>
          ) : (
            saques.map(saque => (
              <div key={saque.id} className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-neutral-300">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shrink-0">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Saque Solicitado</p>
                    <p className="text-xs text-neutral-500">{formatDate(saque.data_solicitacao)}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="font-bold text-neutral-900">{formatCurrency(saque.valor)}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${saque.status === 'pendente' ? 'bg-amber-100 text-amber-700' : saque.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {saque.status}
                    </span>
                    <button onClick={() => { setSelectedSaque(saque); setIsDetailOpen(true); }} className="text-xs font-bold text-indigo-600 hover:underline">Detalhes</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Solicitar Saque" size="wide">
          <div className="space-y-8">
            {step === 1 ? (
              <div className="space-y-6">
                <div className="rounded-2xl bg-indigo-50 p-6 ring-1 ring-indigo-100">
                  <h4 className="font-bold text-indigo-900 mb-4 flex items-center gap-2"><Info className="h-5 w-5" />Confirme seus dados</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-xs font-bold text-indigo-400 uppercase">Nome</p><p className="font-bold text-indigo-900">{cliente?.nome}</p></div>
                    <div><p className="text-xs font-bold text-indigo-400 uppercase">CPF</p><p className="font-bold text-indigo-900">{cliente?.cpf}</p></div>
                  </div>
                </div>
                <button onClick={() => setStep(2)} className="w-full rounded-2xl bg-indigo-600 py-4 font-bold text-white">Confirmar e Prosseguir</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl bg-neutral-100 p-6 ring-1 ring-neutral-300">
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-1">Valor do Saque</p>
                  <p className="text-3xl font-black text-neutral-900">{formatCurrency(saldo)}</p>
                  <div className="mt-4 pt-4 border-t border-neutral-200">
                    <div className="flex justify-between text-base font-bold"><span>Líquido a Receber</span><span className="text-emerald-600">{formatCurrency(saldo * (1 - feePercentage/100))}</span></div>
                  </div>
                </div>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-bold text-neutral-700">Tipo de Chave PIX</label>
                      <select 
                        value={formData.tipo_chave_pix} 
                        onChange={e => {
                          const tipo = e.target.value;
                          let chave = formData.chave_pix;
                          if (tipo === 'cpf') chave = cliente?.cpf || '';
                          if (tipo === 'cnpj') chave = cliente?.cnpj || '';
                          if (tipo === 'email') chave = cliente?.email || '';
                          if (tipo === 'telefone') chave = cliente?.telefone || '';
                          if (tipo === 'aleatoria') chave = '';
                          setFormData({...formData, tipo_chave_pix: tipo, chave_pix: chave});
                        }} 
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">Selecione...</option>
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="telefone">Telefone</option>
                        <option value="aleatoria">Chave Aleatória</option>
                      </select>
                    </div>
                    {formData.tipo_chave_pix && (
                      <div>
                        <label className="mb-1 block text-sm font-bold text-neutral-700">Chave PIX</label>
                        <input 
                          type="text" 
                          inputMode={['cpf', 'cnpj', 'telefone'].includes(formData.tipo_chave_pix) ? 'numeric' : 'text'}
                          pattern={['cpf', 'cnpj', 'telefone'].includes(formData.tipo_chave_pix) ? '[0-9]*' : undefined}
                          placeholder={
                            formData.tipo_chave_pix === 'cpf' ? '000.000.000-00' :
                            formData.tipo_chave_pix === 'cnpj' ? '00.000.000/0000-00' :
                            formData.tipo_chave_pix === 'telefone' ? '(00) 00000-0000' :
                            formData.tipo_chave_pix === 'email' ? 'exemplo@email.com' :
                            'Informe sua chave PIX...'
                          }
                          maxLength={formData.tipo_chave_pix === 'cpf' ? 14 : formData.tipo_chave_pix === 'cnpj' ? 18 : formData.tipo_chave_pix === 'telefone' ? 15 : undefined}
                          value={formData.chave_pix} 
                          onChange={e => {
                            let val = e.target.value;
                            if (formData.tipo_chave_pix === 'cpf') val = maskCPF(val);
                            else if (formData.tipo_chave_pix === 'cnpj') val = maskCNPJ(val);
                            else if (formData.tipo_chave_pix === 'telefone') val = maskPhone(val);
                            setFormData({...formData, chave_pix: val});
                          }} 
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none" 
                        />
                      </div>
                    )}
                  </div>
                <button disabled={!isPixValid() || isSubmitting} onClick={handleRequestWithdrawal} className="w-full rounded-xl bg-indigo-600 py-4 font-bold text-white">Solicitar Saque</button>
              </div>
            )}
          </div>
        </Modal>

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes do Saque" size="wide">
        {selectedSaque && (
          <div className="space-y-6">
            <div className="rounded-3xl bg-[#1a1a1a] p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
              <div className="relative z-10 flex flex-col items-center text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">Status do Saque</p>
                <div className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider mb-6 ${
                  selectedSaque.status === 'pendente' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  selectedSaque.status === 'pago' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {selectedSaque.status}
                </div>
                
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-1">Valor Líquido</p>
                <h4 className="text-4xl sm:text-5xl font-black tracking-tighter">
                  {formatCurrency(selectedSaque.valor_liquido || selectedSaque.valor)}
                </h4>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Dados da Transação</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-500">Valor Bruto</span>
                    <span className="text-sm font-bold text-neutral-900">{formatCurrency(selectedSaque.valor)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-500">Taxa Administrativa ({selectedSaque.taxa_aplicada}%)</span>
                    <span className="text-sm font-bold text-rose-600">-{formatCurrency(selectedSaque.valor - (selectedSaque.valor_liquido || selectedSaque.valor))}</span>
                  </div>
                  <div className="pt-3 border-t border-neutral-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-neutral-900">Total a Receber</span>
                    <span className="text-lg font-black text-emerald-600">{formatCurrency(selectedSaque.valor_liquido || selectedSaque.valor)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Dados do Destino</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-neutral-500">Tipo de Chave</span>
                    <span className="text-sm font-bold text-neutral-900 uppercase">{selectedSaque.tipo_chave_pix || 'Não informado'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-neutral-500 mb-1">Chave PIX</span>
                    <span className="text-sm font-black text-indigo-600 break-all">{selectedSaque.chave_pix}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Cronograma</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-neutral-400">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Solicitado em</p>
                    <p className="text-sm font-bold text-neutral-900">{formatDateTime(selectedSaque.data_solicitacao)}</p>
                  </div>
                </div>
                {selectedSaque.data_pagamento && (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-50 shadow-sm flex items-center justify-center text-emerald-600">
                      <CheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest">Pago em</p>
                      <p className="text-sm font-bold text-neutral-900">{formatDateTime(selectedSaque.data_pagamento)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedSaque.status === 'pendente' && (
              <div className="pt-4 space-y-4">
                <div className="relative">
                  <textarea 
                    value={cancelReason} 
                    onChange={e => setCancelReason(e.target.value)} 
                    placeholder="Descreva o motivo do cancelamento (opcional)..." 
                    className="w-full rounded-2xl border-neutral-200 bg-neutral-50 p-4 text-sm focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all min-h-[100px]" 
                  />
                </div>
                <button 
                  onClick={confirmCancelSaque} 
                  disabled={isSubmitting}
                  className="w-full rounded-2xl bg-red-600 py-4 text-white font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmitting ? 'Processando...' : 'Cancelar Solicitação'}
                </button>
              </div>
            )}

            {selectedSaque.motivo_cancelamento && (
              <div className="rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-100">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2">Motivo do Cancelamento</p>
                <p className="text-sm text-rose-900 font-medium">{selectedSaque.motivo_cancelamento}</p>
              </div>
            )}

            <button 
              onClick={() => setIsDetailOpen(false)} 
              className="w-full rounded-2xl bg-neutral-100 py-4 font-black uppercase tracking-widest text-neutral-600 hover:bg-neutral-200 transition-all"
            >
              Fechar Detalhes
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function CarteiraInfo({ saldo }: { saldo: number }) {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-neutral-300">
      <h3 className="mb-6 text-xl font-bold text-neutral-900">Sobre sua Carteira</h3>
      <div className="space-y-6">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><CheckCircle className="h-5 w-5" /></div>
          <div><p className="font-bold text-neutral-900">Pagamentos Instantâneos</p><p className="text-sm text-neutral-500">Saldo da carteira quita faturas na hora.</p></div>
        </div>
      </div>
    </div>
  );
}
