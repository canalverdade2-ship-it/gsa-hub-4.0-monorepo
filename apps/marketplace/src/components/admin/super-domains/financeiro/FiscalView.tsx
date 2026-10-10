import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Receipt, Upload, FileText, CheckCircle2, XCircle, Clock, 
  Archive, RefreshCw, Eye, Download, Printer, ShieldCheck, 
  AlertTriangle, Filter, Check, X, FileSpreadsheet
} from 'lucide-react';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { formatCurrency, formatDate, formatDateTime } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { removePrivateDocument, uploadPrivateDocument } from '../../../../lib/privateStorage';
import { SecureAttachmentButton } from '../../../ui/SecureAttachmentButton';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';
import { StatusBadge } from '../shared/StatusBadge';

export interface FiscalViewProps {
  initialItemId?: string;
  colaboradorNome?: string;
  colaboradorId?: string;
}

type FiscalTab = 'pendentes' | 'emitidas' | 'canceladas' | 'todas';

const statusByTab: Record<FiscalTab, string | null> = {
  pendentes: 'pendente_emissao',
  emitidas: 'emitida',
  canceladas: 'cancelada',
  todas: null,
};

export function FiscalView({ initialItemId }: FiscalViewProps) {
  const [activeTab, setActiveTab] = useState<FiscalTab>('pendentes');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawers
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Upload Drawer
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [numeroNota, setNumeroNota] = useState('');
  const [savingUpload, setSavingUpload] = useState(false);

  // Status Change Drawer
  const [isStatusDrawerOpen, setIsStatusDrawerOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('emitida');
  const [statusReason, setStatusReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdminRpc<any>('gsa_admin_list_resource', {
        p_resource: 'ordens_fiscais',
        p_page: 1,
        p_page_size: 100,
        p_search: null,
        p_status: statusByTab[activeTab],
      });

      const list = Array.isArray(data?.items) ? data.items : [];
      setOrders(list);

      if (initialItemId) {
        const target = list.find((it: any) => it.id === initialItemId);
        if (target) {
          setSelectedItem(target);
          setIsDetailOpen(true);
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar ordens fiscais:', err);
      toast.error(err?.message || 'Não foi possível carregar as ordens fiscais.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, initialItemId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useRealtimeSubscription({ table: 'ordens_fiscais', onChange: loadData }, [loadData]);

  // Submit Upload XML/PDF
  const submitUpload = async () => {
    if (!selectedItem || (!pdfFile && !xmlFile)) {
      toast.error('Selecione ao menos o PDF ou XML da nota fiscal.');
      return;
    }

    setSavingUpload(true);
    const uploadedReferences: string[] = [];
    try {
      let pdfReference = selectedItem.arquivo_nf_url || null;
      let xmlReference = selectedItem.arquivo_nf_xml_url || null;

      if (pdfFile) {
        const uploaded = await uploadPrivateDocument(pdfFile, {
          scope: 'fiscal',
          ownerId: selectedItem.id,
          context: 'notas-fiscais',
          contextId: selectedItem.id
        });
        pdfReference = uploaded.reference;
        uploadedReferences.push(uploaded.reference);
      }

      if (xmlFile) {
        const uploaded = await uploadPrivateDocument(xmlFile, {
          scope: 'fiscal',
          ownerId: selectedItem.id,
          context: 'notas-fiscais',
          contextId: selectedItem.id
        });
        xmlReference = uploaded.reference;
        uploadedReferences.push(uploaded.reference);
      }

      await callAdminRpc('gsa_admin_fiscal_update', {
        p_ordem_id: selectedItem.id,
        p_action: 'anexar',
        p_payload: {
          pdf_reference: pdfReference,
          xml_reference: xmlReference,
          numero_nota: numeroNota.trim() || null
        },
      });

      toast.success('Nota fiscal anexada com sucesso!');
      setIsUploadDrawerOpen(false);
      setIsDetailOpen(false);
      setSelectedItem(null);
      loadData();
    } catch (error: any) {
      await Promise.all(uploadedReferences.map((reference) => removePrivateDocument(reference).catch(() => undefined)));
      toast.error(error?.message || 'Não foi possível registrar a nota fiscal.');
    } finally {
      setSavingUpload(false);
    }
  };

  // Submit Status Change
  const submitStatus = async () => {
    if (!selectedItem) return;
    if (['cancelada', 'inutilizada'].includes(newStatus) && statusReason.trim().length < 3) {
      toast.error('Informe o motivo da alteração de status.');
      return;
    }

    setSavingStatus(true);
    try {
      await callAdminRpc('gsa_admin_fiscal_update', {
        p_ordem_id: selectedItem.id,
        p_action: 'status',
        p_payload: { status: newStatus, observacoes: statusReason.trim() || null },
      });

      toast.success('Status fiscal atualizado!');
      setIsStatusDrawerOpen(false);
      setIsDetailOpen(false);
      setSelectedItem(null);
      loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o status.');
    } finally {
      setSavingStatus(false);
    }
  };

  // Grid Columns
  const columns: GridColumn<any>[] = [
    {
      key: 'codigo_fiscal',
      header: 'Protocolo / NF',
      width: '150px',
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-slate-900 text-xs">
            #{row.codigo_fiscal || row.id.slice(0, 8)}
          </span>
          {row.numero_nota && (
            <div className="text-[10px] text-indigo-600 font-mono font-bold">
              NF-e Nº {row.numero_nota}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'cliente',
      header: 'Tomador / Cliente',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 text-xs truncate">
            {row.cliente_nome || 'Cliente não identificado'}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            {row.cliente_documento || '—'}
          </p>
        </div>
      )
    },
    {
      key: 'tipo_compra',
      header: 'Tipo',
      width: '110px',
      render: (row) => (
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
          {row.tipo_compra || 'Serviço'}
        </span>
      )
    },
    {
      key: 'valor_total',
      header: 'Valor Bruto',
      align: 'right',
      width: '130px',
      sortable: true,
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {formatCurrency(row.valor_total)}
        </span>
      )
    },
    {
      key: 'status_emissao',
      header: 'Status Fiscal',
      align: 'center',
      width: '140px',
      sortable: true,
      render: (row) => <StatusBadge status={row.status_emissao} size="xs" />
    },
    {
      key: 'documentos',
      header: 'Documentos',
      align: 'center',
      width: '130px',
      render: (row) => (
        <div className="flex items-center justify-center gap-1.5">
          {row.arquivo_nf_url ? (
            <SecureAttachmentButton
              reference={row.arquivo_nf_url}
              label="PDF"
              className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200"
            />
          ) : (
            <span className="text-[10px] text-slate-400">Sem PDF</span>
          )}

          {row.arquivo_nf_xml_url ? (
            <SecureAttachmentButton
              reference={row.arquivo_nf_xml_url}
              label="XML"
              className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200"
            />
          ) : null}
        </div>
      )
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      width: '150px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setSelectedItem(row);
              setNumeroNota(row.numero_nota || '');
              setPdfFile(null);
              setXmlFile(null);
              setIsUploadDrawerOpen(true);
            }}
            title="Anexar Nota Fiscal"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <Upload className="h-3 w-3" />
            <span>Anexar</span>
          </button>

          <button
            onClick={() => {
              setSelectedItem(row);
              setIsDetailOpen(true);
            }}
            title="Inspecionar Detalhes"
            className="p-1.5 rounded text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      {/* ── Sub-Navigation Tabs ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-200 gap-1">
          {(['pendentes', 'emitidas', 'canceladas', 'todas'] as FiscalTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all capitalize flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'pendentes' && <Clock className="h-3.5 w-3.5 text-amber-500" />}
              {tab === 'emitidas' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              {tab === 'canceladas' && <XCircle className="h-3.5 w-3.5 text-rose-500" />}
              <span>{tab}</span>
            </button>
          ))}
        </div>

        <button
          onClick={loadData}
          title="Recarregar Dados Fiscais"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* ── Main DataGrid ── */}
      <TacticalDataGrid
        title="Gestão Fiscal & Emissão de NF-e / NFS-e"
        subtitle="Controle de documentos fiscais, custódia de XML/PDF e validação de tributação."
        data={orders}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => {
          setSelectedItem(row);
          setIsDetailOpen(true);
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 1: INSPECTION DRAWER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedItem ? `Ordem Fiscal #${selectedItem.codigo_fiscal || selectedItem.id.slice(0, 8)}` : 'Detalhes'}
        subtitle={selectedItem ? `Tomador: ${selectedItem.cliente_nome}` : ''}
        badge={selectedItem ? <StatusBadge status={selectedItem.status_emissao} size="sm" /> : undefined}
        width="md"
        footer={
          selectedItem && (
            <div className="flex items-center justify-end gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  setNewStatus(selectedItem.status_emissao || 'emitida');
                  setStatusReason('');
                  setIsStatusDrawerOpen(true);
                }}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >
                Alterar Status Fiscal
              </button>

              <button
                type="button"
                onClick={() => {
                  setNumeroNota(selectedItem.numero_nota || '');
                  setPdfFile(null);
                  setXmlFile(null);
                  setIsUploadDrawerOpen(true);
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-2xs"
              >
                Anexar Documentos
              </button>
            </div>
          )
        }
      >
        {selectedItem && (
          <div className="space-y-5 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor da Ordem Fiscal</span>
              <p className="text-xl font-mono font-bold text-slate-900">
                {formatCurrency(selectedItem.valor_total)}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Tomador / Sacado</h4>
              <div className="space-y-1">
                <p className="font-bold text-slate-900">{selectedItem.cliente_nome || '—'}</p>
                <p className="text-slate-500 font-mono">{selectedItem.cliente_documento || '—'}</p>
                <p className="text-slate-500">{selectedItem.cliente_telefone || '—'}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Item / Descrição da Operação</h4>
              <p className="text-slate-700">{selectedItem.descricao_item || 'Prestação de serviços / venda de mercadoria'}</p>
            </div>

            {selectedItem.observacoes && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-500">Observações Fiscais</span>
                <p className="text-slate-800">{selectedItem.observacoes}</p>
              </div>
            )}
          </div>
        )}
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 2: UPLOAD XML / PDF DRAWER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isUploadDrawerOpen}
        onClose={() => setIsUploadDrawerOpen(false)}
        title="Anexar Documentos Fiscais (PDF / XML)"
        subtitle={selectedItem ? `Ordem #${selectedItem.codigo_fiscal || selectedItem.id.slice(0, 8)}` : ''}
        width="sm"
        primaryAction={{
          label: 'Salvar Documentos',
          onClick: submitUpload,
          loading: savingUpload,
          variant: 'primary',
          icon: <Upload className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsUploadDrawerOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Número da Nota Fiscal (NF-e / NFS-e)
            </label>
            <input
              type="text"
              placeholder="Ex: 00012345"
              value={numeroNota}
              onChange={(e) => setNumeroNota(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Arquivo PDF da Nota (DANFE / Recibo)
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Arquivo XML da Nota Fiscal
            </label>
            <input
              type="file"
              accept=".xml"
              onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 3: CHANGE FISCAL STATUS
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isStatusDrawerOpen}
        onClose={() => setIsStatusDrawerOpen(false)}
        title="Atualizar Status Fiscal"
        width="sm"
        primaryAction={{
          label: 'Confirmar Alteração',
          onClick: submitStatus,
          loading: savingStatus,
          variant: 'primary'
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsStatusDrawerOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Novo Status Fiscal *
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
            >
              <option value="pendente_emissao">Pendente Emissão</option>
              <option value="emitida">Emitida</option>
              <option value="cancelada">Cancelada</option>
              <option value="inutilizada">Inutilizada</option>
              <option value="arquivada">Arquivada</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Justificativa / Observações
            </label>
            <textarea
              rows={3}
              placeholder="Descreva o motivo da alteração..."
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-900 shadow-2xs"
            />
          </div>
        </div>
      </CommandSlideOver>
    </div>
  );
}
