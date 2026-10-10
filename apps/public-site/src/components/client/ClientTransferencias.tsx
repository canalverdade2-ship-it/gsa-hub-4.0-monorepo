import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, CheckCircle, Search, Send, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDateTime, maskCNPJ, maskCPF, generateUUID } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import { Cliente } from '../../types';
import { callClientRpc } from '../../lib/clientRpc';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

type TransferType = 'saldo' | 'pontos';

export function ClientTransferencias({
  clientId,
  cliente: clienteProp,
  initialItemId
}: {
  clientId: string;
  cliente?: Cliente | null;
  initialTab?: string;
  initialItemId?: string;
}) {
  const [transferencias, setTransferencias] = useState<any[]>([]);
  const [clienteData, setClienteData] = useState<Cliente | null>(clienteProp || null);
  const [selectedTransferencia, setSelectedTransferencia] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isEstornoModalOpen, setIsEstornoModalOpen] = useState(false);
  const [tipo, setTipo] = useState<TransferType>('saldo');
  const [docType, setDocType] = useState<'cpf' | 'cnpj'>('cpf');
  const [destinoDoc, setDestinoDoc] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [destinoNome, setDestinoNome] = useState('');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEstornando, setIsEstornando] = useState(false);
  const hasAutoOpened = useRef<string | null>(null);
  const transferRequestId = useRef<string>(generateUUID());

  const fetchClienteData = async () => {
    const { data } = await supabase.from('clientes').select('*').eq('id', clientId).single();
    if (data) setClienteData(data as Cliente);
  };

  const fetchTransferencias = async () => {
    const { data, error } = await supabase
      .from('transferencias')
      .select('*, cliente_origem:clientes!cliente_origem_id(nome, cpf, cnpj), cliente_destino:clientes!cliente_destino_id(nome, cpf, cnpj)')
      .or(`cliente_origem_id.eq.${clientId},cliente_destino_id.eq.${clientId}`)
      .order('data_solicitacao', { ascending: false });

    if (error) {
      toast.error('Erro ao carregar transferencias.');
      return;
    }
    setTransferencias(data || []);
  };

  useEffect(() => {
    fetchClienteData();
    fetchTransferencias();
  }, [clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'transferencias',
        onChange: () => {
          fetchClienteData();
          fetchTransferencias();
        },
      },
      {
        table: 'clientes',
        filter: clientId ? `id=eq.${clientId}` : undefined,
        onChange: fetchClienteData,
      },
      {
        table: 'pontos_movimentacoes',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchClienteData,
      },
      {
        table: 'saques',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: fetchClienteData,
      },
    ],
    [clientId]
  );

  useEffect(() => {
    if (!initialItemId || hasAutoOpened.current === initialItemId || transferencias.length === 0) return;
    const item = transferencias.find(t => t.id === initialItemId);
    if (item) {
      hasAutoOpened.current = initialItemId;
      setSelectedTransferencia(item);
      setIsDetailModalOpen(true);
    }
  }, [initialItemId, transferencias]);

  const resetForm = () => {
    transferRequestId.current = generateUUID();
    setTipo('saldo');
    setDocType('cpf');
    setDestinoDoc('');
    setDestinoId('');
    setDestinoNome('');
    setValor('');
    setMotivo('');
  };

  const cleanDoc = (doc: string) => doc.replace(/\D/g, '');

  const handleDocChange = (value: string) => {
    const digits = cleanDoc(value);
    setDestinoDoc(docType === 'cpf' ? maskCPF(digits.slice(0, 11)) : maskCNPJ(digits.slice(0, 14)));
    setDestinoId('');
    setDestinoNome('');
  };

  const handleValorChange = (value: string) => {
    const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
    const numeric = Number(normalized || 0);
    const max = tipo === 'saldo' ? Number(clienteData?.saldo_carteira || 0) : Number(clienteData?.saldo_pontos || 0);
    setValor(String(Math.min(numeric, max || numeric)));
  };

  const handleVerifyDoc = async () => {
    const digits = cleanDoc(destinoDoc);
    const expected = docType === 'cpf' ? 11 : 14;
    if (digits.length !== expected) {
      toast.error(`Informe um ${docType.toUpperCase()} valido.`);
      return;
    }

    setLoading(true);
    try {
      const data = await callClientRpc<any>('gsa_client_lookup_transfer_recipient', {
        p_tipo_documento: docType,
        p_documento: digits,
      });
      setDestinoId(data.id);
      setDestinoNome(data.nome);
      toast.success('Destinatario encontrado.');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao localizar destinatario.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const valorNum = Number(valor);
    if (!destinoId) return toast.error('Valide o destinatario antes de continuar.');
    if (!valorNum || valorNum <= 0) return toast.error('Informe um valor valido.');
    if (!motivo.trim()) return toast.error('Informe o motivo da transferencia.');

    setLoading(true);
    try {
      const data = await callClientRpc<any>('gsa_client_request_transfer', {
        p_request_id: transferRequestId.current,
        p_destino_id: destinoId,
        p_tipo: tipo,
        p_valor: valorNum,
        p_motivo: motivo.trim(),
      });

      if (!data?.success) throw new Error('Não foi possível concluir a transferência.');

      toast.success('Transferência concluída instantaneamente.');
      setIsConfirmModalOpen(false);
      setIsModalOpen(false);
      resetForm();
      fetchClienteData();
      fetchTransferencias();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao concluir transferência.');
    } finally {
      setLoading(false);
    }
  };

  const handleEstornar = async () => {
    if (!selectedTransferencia) return;
    setIsEstornando(true);
    try {
      await callClientRpc('gsa_client_reverse_transfer', {
        p_transferencia_id: selectedTransferencia.id,
      });

      toast.success('Transferencia estornada com sucesso.');
      setIsEstornoModalOpen(false);
      setIsDetailModalOpen(false);
      fetchClienteData();
      fetchTransferencias();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao estornar transferencia.');
    } finally {
      setIsEstornando(false);
    }
  };

  const statusLabel = (status: string) => ({
    em_analise: 'Em Analise',
    aprovado: 'Aprovada',
    recusado: 'Recusada',
    reprovado: 'Reprovada',
    concluido: 'Concluida',
    estornado: 'Estornada',
    cancelado: 'Cancelada'
  }[status] || status);

  const renderValue = (transferencia: any) => {
    const isOut = transferencia.cliente_origem_id === clientId;
    const raw = isOut ? transferencia.valor : transferencia.valor_liquido || transferencia.valor;
    return transferencia.tipo === 'pontos' ? `${isOut ? '-' : '+'} ${raw} pts` : `${isOut ? '-' : '+'} ${formatCurrency(raw)}`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Transferencias</h2>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
        >
          <Send className="h-4 w-4" /> Transferir Agora
        </button>
      </div>

      <div className="rounded-3xl bg-white p-5 shadow-md ring-1 ring-neutral-200">
        {transferencias.length === 0 ? (
          <div className="py-10 text-center text-sm font-bold text-neutral-400">Nenhuma transferencia encontrada.</div>
        ) : (
          <div className="space-y-3">
            {transferencias.map(t => {
              const isOut = t.cliente_origem_id === clientId;
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTransferencia(t); setIsDetailModalOpen(true); }}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-neutral-100 bg-white p-4 text-left shadow-sm transition hover:border-neutral-200 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isOut ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {isOut ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-neutral-900">{isOut ? t.cliente_destino?.nome : t.cliente_origem?.nome}</p>
                      <p className="text-xs font-bold text-neutral-400">{formatDateTime(t.data_solicitacao)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${isOut ? 'text-rose-600' : 'text-emerald-600'}`}>{renderValue(t)}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">{statusLabel(t.status)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Transferência Instantânea">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
            {(['saldo', 'pontos'] as TransferType[]).map(option => (
              <button key={option} onClick={() => setTipo(option)} className={`rounded-xl py-3 text-sm font-black ${tipo === option ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}>
                {option === 'saldo' ? 'Saldo' : 'Pontos'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
            {(['cpf', 'cnpj'] as const).map(option => (
              <button key={option} onClick={() => { setDocType(option); setDestinoDoc(''); }} className={`rounded-xl py-3 text-sm font-black ${docType === option ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}>
                {option.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input value={destinoDoc} onChange={e => handleDocChange(e.target.value)} inputMode="numeric" className="min-w-0 flex-1 rounded-2xl border border-neutral-200 px-4 py-3 font-bold outline-none focus:border-indigo-500" placeholder={`Documento do destinatario`} />
            <button onClick={handleVerifyDoc} disabled={loading} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white disabled:bg-neutral-300">
              <Search className="h-4 w-4" />
            </button>
          </div>

          {destinoNome && <div className="rounded-2xl bg-indigo-50 p-4 text-sm font-bold text-indigo-900">Destinatario: {destinoNome}</div>}

          <input value={valor} onChange={e => handleValorChange(e.target.value)} inputMode="decimal" className="w-full rounded-2xl border border-neutral-200 px-4 py-3 font-bold outline-none focus:border-indigo-500" placeholder={tipo === 'saldo' ? 'Valor em R$' : 'Quantidade de pontos'} />
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} className="min-h-[96px] w-full rounded-2xl border border-neutral-200 px-4 py-3 font-bold outline-none focus:border-indigo-500" placeholder="Motivo da transferencia" />

          <button onClick={() => setIsConfirmModalOpen(true)} disabled={!destinoId || !valor || !motivo.trim() || loading} className="w-full rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white disabled:bg-neutral-300">
            Continuar
          </button>
        </div>
      </Modal>

      <Modal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)} title="Confirmar Transferencia">
        <div className="space-y-4">
          <p className="text-sm font-bold text-neutral-600">Confirma a transferencia para <span className="text-neutral-950">{destinoNome}</span>?</p>
          <div className="rounded-2xl bg-neutral-50 p-4 text-2xl font-black text-indigo-600">
            {tipo === 'saldo' ? formatCurrency(Number(valor || 0)) : `${valor || 0} pts`}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsConfirmModalOpen(false)} className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-bold text-neutral-700">Voltar</button>
            <button onClick={handleSubmit} disabled={loading} className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white disabled:bg-neutral-300">Confirmar</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title="Detalhes da Transferencia">
        {selectedTransferencia && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><ArrowLeftRight className="h-5 w-5" /></div>
              <div>
                <p className="text-lg font-black text-neutral-950">{renderValue(selectedTransferencia)}</p>
                <p className="text-xs font-bold text-neutral-400">{statusLabel(selectedTransferencia.status)}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-neutral-50 p-4 text-sm font-bold text-neutral-700">
              <p>Origem: {selectedTransferencia.cliente_origem?.nome}</p>
              <p>Destino: {selectedTransferencia.cliente_destino?.nome}</p>
              <p>Motivo: {selectedTransferencia.motivo || '-'}</p>
            </div>
            {selectedTransferencia.cliente_destino_id === clientId && ['aprovado', 'concluido'].includes(selectedTransferencia.status) && (
              <button onClick={() => setIsEstornoModalOpen(true)} className="w-full rounded-2xl bg-neutral-950 py-3 text-sm font-black text-white">
                Solicitar Estorno
              </button>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={isEstornoModalOpen} onClose={() => setIsEstornoModalOpen(false)} title="Confirmar Estorno">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-rose-700">
            <XCircle className="h-5 w-5" />
            <p className="text-sm font-bold">O estorno reverte os saldos da origem e do destino em uma transacao no banco.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsEstornoModalOpen(false)} className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-bold text-neutral-700">Voltar</button>
            <button onClick={handleEstornar} disabled={isEstornando} className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white disabled:bg-neutral-300">
              {isEstornando ? 'Processando...' : 'Estornar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={false} onClose={() => undefined} title="">
        <CheckCircle className="hidden" />
      </Modal>
    </div>
  );
}
