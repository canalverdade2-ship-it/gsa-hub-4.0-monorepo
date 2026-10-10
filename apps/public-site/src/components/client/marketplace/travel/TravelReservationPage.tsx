import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Lock,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import TravelCheckoutModal from '../../store/TravelCheckoutModal';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

const DOCUMENT_BUCKET = 'viagens-documentos';
const VOUCHER_BUCKET = 'viagens-vouchers';
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_EDITABLE_STATUSES = [
  'pendente',
  'pagamento_confirmado',
  'compra_fornecedor_pendente',
  'compra_fornecedor_em_andamento',
  'pacote_adquirido',
  'emissao_em_andamento',
];

const statusLabels: Record<string, string> = {
  pendente: 'Aguardando pagamento',
  pagamento_confirmado: 'Pagamento confirmado',
  compra_fornecedor_pendente: 'Compra no fornecedor pendente',
  compra_fornecedor_em_andamento: 'Compra no fornecedor em andamento',
  pacote_adquirido: 'Pacote adquirido',
  emissao_em_andamento: 'Emissão em andamento',
  documentos_disponiveis: 'Documentos disponíveis',
  viagem_confirmada: 'Viagem confirmada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  reembolso_em_analise: 'Reembolso em análise',
  reembolsada: 'Reembolsada',
};

function sanitizeFilename(filename: string) {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');
}

export function TravelReservationPage({
  transacaoId,
  clientId,
  onBack,
}: {
  transacaoId: string;
  clientId: string;
  onBack: () => void;
}) {
  const [trip, setTrip] = useState<any>(null);
  const [passageiros, setPassageiros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPassengerForm, setShowPassengerForm] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [savingPassenger, setSavingPassenger] = useState(false);
  const [deletingPassengerId, setDeletingPassengerId] = useState<string | null>(null);
  const [uploadingPassengerId, setUploadingPassengerId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [downloadingVoucherId, setDownloadingVoucherId] = useState<string | null>(null);
  const [passengerForm, setPassengerForm] = useState({
    nome_completo: '',
    data_nascimento: '',
    numero_documento: '',
    tipo_documento: 'RG',
    tipo_passageiro: 'adulto',
  });

  const expectedPassengerCount = Math.max(
    Number(trip?.viagens_propostas?.quantidade_passageiros) || 1,
    1,
  );
  const canEditPassengers = trip?.status === 'pendente';
  const canManageDocuments = DOCUMENT_EDITABLE_STATUSES.includes(String(trip?.status || ''));
  const passengerCountComplete = passageiros.length === expectedPassengerCount;
  const canAddPassenger = canEditPassengers && passageiros.length < expectedPassengerCount;

  useEffect(() => {
    fetchTripDetails();
  }, [transacaoId, clientId]);

  const fetchTripDetails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('viagens_transacoes')
        .select(`
          *,
          viagens_propostas (
            id,
            snapshot_completo,
            quantidade_passageiros,
            parcelamento_permitido,
            viagens_passageiros (
              id,
              nome_completo,
              data_nascimento,
              tipo_documento,
              numero_documento,
              tipo_passageiro,
              viagens_passageiro_documentos (
                id,
                tipo_documento,
                verificado,
                storage_path,
                file_name,
                file_type,
                file_size
              )
            )
          ),
          viagens_vouchers (
            id,
            storage_path,
            file_name,
            descricao,
            created_at
          )
        `)
        .eq('id', transacaoId)
        .eq('cliente_id', clientId)
        .single();

      if (error) throw error;
      setTrip(data);
      setPassageiros(data?.viagens_propostas?.viagens_passageiros || []);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar os detalhes da viagem.');
      onBack();
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSubscription(
    [
      {
        table: 'viagens_transacoes',
        filter: transacaoId ? `id=eq.${transacaoId}` : undefined,
        debounceMs: 300,
        onChange: fetchTripDetails,
      },
      {
        table: 'viagens_passageiros',
        debounceMs: 300,
        onChange: fetchTripDetails,
      },
      {
        table: 'viagens_passageiro_documentos',
        debounceMs: 300,
        onChange: fetchTripDetails,
      },
      {
        table: 'viagens_vouchers',
        debounceMs: 300,
        onChange: fetchTripDetails,
      },
    ],
    [transacaoId, clientId]
  );

  const handleOpenPassengerForm = () => {
    if (!canEditPassengers) {
      toast.error('Os passageiros não podem mais ser alterados após o pagamento.');
      return;
    }
    if (passageiros.length >= expectedPassengerCount) {
      toast.error(`A proposta permite exatamente ${expectedPassengerCount} passageiro(s).`);
      return;
    }
    setShowPassengerForm((value) => !value);
  };

  const handleSavePassenger = async () => {
    if (!trip?.viagens_propostas?.id) return;
    if (!canEditPassengers) {
      toast.error('Os passageiros não podem mais ser alterados após o pagamento.');
      return;
    }
    if (passageiros.length >= expectedPassengerCount) {
      toast.error(`A proposta permite exatamente ${expectedPassengerCount} passageiro(s).`);
      setShowPassengerForm(false);
      return;
    }
    if (
      !passengerForm.nome_completo.trim() ||
      !passengerForm.data_nascimento ||
      !passengerForm.numero_documento.trim()
    ) {
      toast.error('Preencha nome, nascimento e documento do passageiro.');
      return;
    }

    try {
      setSavingPassenger(true);
      const { error } = await supabase.from('viagens_passageiros').insert({
        proposta_id: trip.viagens_propostas.id,
        cliente_id: clientId,
        nome_completo: passengerForm.nome_completo.trim(),
        data_nascimento: passengerForm.data_nascimento,
        tipo_documento: passengerForm.tipo_documento,
        numero_documento: passengerForm.numero_documento.trim(),
        tipo_passageiro: passengerForm.tipo_passageiro,
      });

      if (error) throw error;

      toast.success('Passageiro cadastrado com sucesso!');
      setPassengerForm({
        nome_completo: '',
        data_nascimento: '',
        numero_documento: '',
        tipo_documento: 'RG',
        tipo_passageiro: 'adulto',
      });
      setShowPassengerForm(false);
      await fetchTripDetails();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível salvar o passageiro.');
    } finally {
      setSavingPassenger(false);
    }
  };

  const handleDeletePassenger = async (passenger: any) => {
    if (!canEditPassengers) {
      toast.error('Os passageiros não podem mais ser alterados após o pagamento.');
      return;
    }
    if ((passenger.viagens_passageiro_documentos || []).length > 0) {
      toast.error('Remova os documentos deste passageiro antes de excluí-lo.');
      return;
    }

    try {
      setDeletingPassengerId(passenger.id);
      const { error } = await supabase
        .from('viagens_passageiros')
        .delete()
        .eq('id', passenger.id)
        .eq('cliente_id', clientId);

      if (error) throw error;
      toast.success('Passageiro removido.');
      await fetchTripDetails();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível remover o passageiro.');
    } finally {
      setDeletingPassengerId(null);
    }
  };

  const handleDocumentUpload = async (passengerId: string, file?: File) => {
    if (!file) return;
    if (!canManageDocuments) {
      toast.error('Os documentos desta viagem não podem mais ser alterados.');
      return;
    }
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      toast.error('Envie um arquivo PDF, JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE) {
      toast.error('O documento deve ter no máximo 10 MB.');
      return;
    }

    const storagePath = `${clientId}/${passengerId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

    try {
      setUploadingPassengerId(passengerId);
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(storagePath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: metadataError } = await supabase
        .from('viagens_passageiro_documentos')
        .insert({
          passageiro_id: passengerId,
          tipo_documento: 'identificacao',
          storage_path: storagePath,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
        });

      if (metadataError) {
        await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
        throw metadataError;
      }

      toast.success('Documento enviado com segurança.');
      await fetchTripDetails();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível enviar o documento.');
    } finally {
      setUploadingPassengerId(null);
    }
  };

  const handleDeleteDocument = async (document: any) => {
    if (!canManageDocuments) {
      toast.error('Os documentos desta viagem não podem mais ser alterados.');
      return;
    }

    try {
      setDeletingDocumentId(document.id);
      const { error } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .remove([document.storage_path]);

      if (error) throw error;

      // O trigger do banco remove o metadado na mesma operação do Storage.
      toast.success('Documento removido.');
      await fetchTripDetails();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível remover o documento.');
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const handleDownloadVoucher = async (voucher: any) => {
    try {
      setDownloadingVoucherId(voucher.id);
      const { data, error } = await supabase.storage
        .from(VOUCHER_BUCKET)
        .createSignedUrl(voucher.storage_path, 60);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Link de download não gerado.');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Não foi possível baixar o voucher.');
    } finally {
      setDownloadingVoucherId(null);
    }
  };

  const handleCheckout = () => {
    if (!passengerCountComplete) {
      toast.error(
        `Cadastre exatamente ${expectedPassengerCount} passageiro(s). Atualmente: ${passageiros.length}.`,
      );
      return;
    }
    setShowCheckout(true);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f1ea]">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#0c2340]" />
        <p className="font-bold text-[#0c2340]">Carregando viagem...</p>
      </div>
    );
  }

  if (!trip) return null;

  const snapshot = trip.viagens_propostas?.snapshot_completo || {};
  const maxInstallments = Math.max(
    Number(trip.viagens_propostas?.parcelamento_permitido) || 1,
    1,
  );
  const installmentValue = Number(trip.valor_pago || 0) / maxInstallments;
  const vouchers = trip.viagens_vouchers || [];
  const isPendingPayment = trip.status === 'pendente';
  const statusLabel = statusLabels[trip.status] || String(trip.status).replace(/_/g, ' ');

  return (
    <div className="min-h-screen bg-[#f4f1ea] pb-32 font-sans">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-5">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a]">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar</span>
          </button>
          <div className="mx-4 h-5 w-px bg-black/10" />
          <span className="text-sm font-black tracking-tight text-[#0c2340]">Gestão da Viagem</span>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h1 className="mb-2 text-3xl font-black text-[#0c2340] sm:text-4xl" style={{ fontFamily: '"Cinzel", serif' }}>
              {snapshot.titulo || 'Viagem Personalizada'}
            </h1>
            <p className="font-medium text-neutral-600">{snapshot.destino || 'Destino em definição'}</p>
          </div>
          <div className="flex flex-col items-end rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <span className="mb-1 text-xs font-bold uppercase text-neutral-400">Status atual</span>
            <span className={`rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider ${isPendingPayment ? 'bg-yellow-100 text-yellow-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black text-[#0c2340]"><Users className="h-5 w-5" /> Passageiros</h2>
                  <p className="mt-1 text-xs font-medium text-neutral-500">
                    {passageiros.length} de {expectedPassengerCount} cadastrado(s)
                  </p>
                </div>
                {canAddPassenger && (
                  <button onClick={handleOpenPassengerForm} className="text-sm font-bold text-[#168ac1] hover:text-[#0c2340]">
                    + Adicionar passageiro
                  </button>
                )}
              </div>

              {!canEditPassengers && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                  <p className="text-xs font-medium text-neutral-600">A lista de passageiros foi bloqueada após o pagamento.</p>
                </div>
              )}

              {passageiros.length === 0 ? (
                <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-8 text-center">
                  <AlertCircle className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
                  <p className="font-medium text-neutral-500">Nenhum passageiro adicionado.</p>
                  <p className="mt-1 text-xs text-neutral-400">Cadastre exatamente {expectedPassengerCount} viajante(s) antes do pagamento.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {passageiros.map((passenger) => {
                    const documents = passenger.viagens_passageiro_documentos || [];
                    return (
                      <div key={passenger.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div>
                            <h3 className="font-bold text-[#1a1a1a]">{passenger.nome_completo}</h3>
                            <p className="text-sm text-neutral-500">{passenger.tipo_documento}: {passenger.numero_documento}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {canManageDocuments && (
                              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#0c2340]/10 bg-white px-3 py-2 text-xs font-bold text-[#0c2340] hover:border-[#168ac1]">
                                {uploadingPassengerId === passenger.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                {uploadingPassengerId === passenger.id ? 'Enviando...' : 'Anexar documento'}
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                                  disabled={uploadingPassengerId === passenger.id}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    handleDocumentUpload(passenger.id, file);
                                  }}
                                  className="hidden"
                                />
                              </label>
                            )}
                            {canEditPassengers && (
                              <button
                                onClick={() => handleDeletePassenger(passenger)}
                                disabled={deletingPassengerId === passenger.id}
                                aria-label={`Remover ${passenger.nome_completo}`}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-white text-red-500 hover:bg-red-50 disabled:opacity-50"
                              >
                                {deletingPassengerId === passenger.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {documents.length > 0 && (
                          <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4">
                            {documents.map((document: any) => (
                              <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs">
                                <div className="flex min-w-0 items-center gap-2">
                                  <FileText className="h-4 w-4 shrink-0 text-[#168ac1]" />
                                  <span className="truncate font-bold text-neutral-700">{document.file_name}</span>
                                  {document.verificado && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}
                                </div>
                                {canManageDocuments && (
                                  <button
                                    onClick={() => handleDeleteDocument(document)}
                                    disabled={deletingDocumentId === document.id}
                                    aria-label="Remover documento"
                                    className="text-neutral-400 hover:text-red-500 disabled:opacity-50"
                                  >
                                    {deletingDocumentId === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {showPassengerForm && canAddPassenger && (
              <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-3xl border border-[#38bdf8]/30 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="mb-4 font-black text-[#0c2340]">Novo passageiro</h2>
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <input type="text" placeholder="Nome completo" value={passengerForm.nome_completo} onChange={(event) => setPassengerForm((value) => ({ ...value, nome_completo: event.target.value }))} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none" />
                  <input type="date" value={passengerForm.data_nascimento} onChange={(event) => setPassengerForm((value) => ({ ...value, data_nascimento: event.target.value }))} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none" />
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <select value={passengerForm.tipo_documento} onChange={(event) => setPassengerForm((value) => ({ ...value, tipo_documento: event.target.value }))} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 outline-none">
                      <option value="RG">RG</option><option value="CPF">CPF</option><option value="Passaporte">Passaporte</option>
                    </select>
                    <input type="text" placeholder="Número" value={passengerForm.numero_documento} onChange={(event) => setPassengerForm((value) => ({ ...value, numero_documento: event.target.value }))} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none" />
                  </div>
                  <select value={passengerForm.tipo_passageiro} onChange={(event) => setPassengerForm((value) => ({ ...value, tipo_passageiro: event.target.value }))} className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 outline-none">
                    <option value="adulto">Adulto</option><option value="crianca">Criança</option><option value="bebe">Bebê</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowPassengerForm(false)} disabled={savingPassenger} className="px-4 py-2 text-sm font-bold text-neutral-500">Cancelar</button>
                  <button onClick={handleSavePassenger} disabled={savingPassenger} className="flex items-center gap-2 rounded-xl bg-[#0c2340] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                    {savingPassenger && <Loader2 className="h-4 w-4 animate-spin" />}{savingPassenger ? 'Salvando...' : 'Salvar passageiro'}
                  </button>
                </div>
              </motion.section>
            )}

            <section className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="mb-5 flex items-center gap-2 text-xl font-black text-[#0c2340]"><FileText className="h-5 w-5" /> Vouchers e comprovantes</h2>
              {vouchers.length === 0 ? (
                <p className="rounded-2xl bg-neutral-50 p-5 text-sm text-neutral-500">Os vouchers aparecerão aqui assim que a emissão for concluída pela equipe GSA.</p>
              ) : (
                <div className="space-y-3">
                  {vouchers.map((voucher: any) => (
                    <div key={voucher.id} className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="min-w-0"><p className="truncate font-bold text-neutral-800">{voucher.descricao || voucher.file_name}</p><p className="truncate text-xs text-neutral-500">{voucher.file_name}</p></div>
                      <button onClick={() => handleDownloadVoucher(voucher)} disabled={downloadingVoucherId === voucher.id} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0c2340] text-white disabled:opacity-60">
                        {downloadingVoucherId === voucher.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-24 rounded-3xl border border-black/5 bg-white p-6 shadow-xl sm:p-8">
              <h2 className="mb-6 text-xl font-black text-[#0c2340]">Resumo financeiro</h2>
              <div className="mb-6 space-y-4">
                <div className="flex justify-between text-sm"><span className="text-neutral-500">Valor do pacote</span><span className="font-bold text-[#1a1a1a]">{formatCurrency(trip.valor_pago)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-neutral-500">Condição de pagamento</span><span className="font-bold text-[#1a1a1a]">{maxInstallments}x de {formatCurrency(installmentValue)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-neutral-500">Passageiros</span><span className="font-bold text-[#1a1a1a]">{passageiros.length}/{expectedPassengerCount}</span></div>
                <div className="flex justify-between text-sm"><span className="text-neutral-500">Taxas de emissão</span><span className="font-bold text-emerald-600">Inclusas</span></div>
                <div className="h-px bg-neutral-100" />
                <div className="flex justify-between text-lg"><span className="font-black text-[#0c2340]">Total</span><span className="font-black text-[#0c2340]">{formatCurrency(trip.valor_pago)}</span></div>
              </div>

              {isPendingPayment ? (
                <>
                  <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                    <p className="text-xs font-medium text-blue-800">Pagamento seguro pelo Checkout GSA. Cadastre exatamente {expectedPassengerCount} passageiro(s) antes de continuar.</p>
                  </div>
                  <button onClick={handleCheckout} disabled={!passengerCountComplete} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0c2340] py-4 font-black text-white shadow-lg transition hover:bg-[#134e78] disabled:cursor-not-allowed disabled:opacity-50">
                    <CreditCard className="h-5 w-5" /> Ir para pagamento
                  </button>
                </>
              ) : (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center">
                  <CheckCircle className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                  <h3 className="mb-1 font-bold text-emerald-800">Pagamento processado</h3>
                  <p className="text-xs text-emerald-600">Acompanhe nesta tela a emissão e os documentos finais.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {showCheckout && (
        <TravelCheckoutModal
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          clientId={clientId}
          cartItems={[{
            item_id: trip.viagens_propostas?.id,
            tipo: 'pacote_viagem',
            quantidade: 1,
            item_detalhes: {
              nome: snapshot.titulo || 'Pacote de viagem',
              titulo: snapshot.titulo,
              valor: trip.valor_pago,
              preco_venda: trip.valor_pago,
              valor_total_contrato: trip.valor_pago,
              parcelamento_permitido: maxInstallments,
              is_digital: true,
            },
          }]}
          onSuccess={() => {
            setShowCheckout(false);
            fetchTripDetails();
          }}
        />
      )}
    </div>
  );
}
