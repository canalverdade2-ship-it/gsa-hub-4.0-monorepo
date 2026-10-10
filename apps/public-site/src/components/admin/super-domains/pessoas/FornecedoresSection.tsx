import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Building2, PackageCheck, ShoppingCart, Truck, 
  WalletCards, Plus, Search, Filter, RefreshCw, 
  Eye, EyeOff, CheckCircle2, XCircle, FileText, Phone, Mail, MapPin, 
  Globe2, ShieldCheck, Key, Upload, DollarSign, ExternalLink, Sparkles, Users,
  Image as ImageIcon, Trash2, Loader2, Gift, Ticket, Link2, Copy, Check, MessageSquare, Download, Calendar,
  Send, Clock, Edit3, AlertCircle, AlertTriangle, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn, StatusBadge, CommandSlideOver } from '../shared';
import { Modal } from '../../../ui/Modal';
import { 
  getAdminSupplierSnapshot, 
  setAdminSupplierStatus, 
  createAdminSupplierOrder,
  reviewAdminSupplierProduct,
  reviewAdminSupplierDelivery,
  updateAdminSupplierPayable,
  uploadAdminSupplierPaymentProof
} from '../../../../lib/supplierOperations';
import { uploadPublicStoreImage } from '../../../../lib/publicStoreImage';
import { 
  listAdminPartners, 
  savePartner, 
  setPartnerStatus, 
  listPartnerRedemptions,
  completePartnerRedemption
} from '../../../../features/partners/service';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { Partner, PartnerFormData, PartnerRedemption } from '../../../../features/partners/types';
import { PartnerRedemptionDetailModal } from './PartnerRedemptionDetailModal';
import { AdminSupplierSnapshot } from '../../../../types/supplier';
import { formatCurrency, formatDate, formatDateTime, maskCNPJ, maskCPF, maskPhone, maskCEP } from '../../../../lib/utils';
import { consultarCEP } from '../../../../utils/viaCep';

export interface FornecedoresSectionProps {
  initialSubTab?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

const EMPTY_SNAPSHOT: AdminSupplierSnapshot = {
  suppliers: [],
  requests: [],
  supplier_products: [],
  orders: [],
  deliveries: [],
  payables: [],
  products: []
};

export function FornecedoresSection({
  initialSubTab,
  colaboradorId,
  colaboradorNome
}: FornecedoresSectionProps) {
  const [activeMainTab, setActiveMainTab] = useState<'fornecedores' | 'pedidos' | 'entregas' | 'contas' | 'parceiros'>(
    (initialSubTab as any) || 'fornecedores'
  );

  // Supplier Snapshot State
  const [snapshot, setSnapshot] = useState<AdminSupplierSnapshot>(EMPTY_SNAPSHOT);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);

  // Partners State
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [partnerToDelete, setPartnerToDelete] = useState<Partner | null>(null);

  // Supplier Details / Approval Drawer
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  const [supplierPin, setSupplierPin] = useState('');
  const [supplierReason, setSupplierReason] = useState('');
  const [isProcessingSupplier, setIsProcessingSupplier] = useState(false);

  // Partner Modal / Drawer
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [isPartnerDrawerOpen, setIsPartnerDrawerOpen] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [partnerForm, setPartnerForm] = useState<PartnerFormData>({
    slug: '',
    name: '',
    legal_name: '',
    category: '',
    short_description: '',
    description: '',
    logo_url: '',
    cover_url: '',
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    instagram: '',
    facebook: '',
    linkedin: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: '',
    maps_url: '',
    business_hours: '',
    service_mode: 'hibrido',
    service_regions: [],
    services: [],
    products: [],
    benefits: '',
    contact_person: '',
    internal_notes: '',
    featured: false,
    display_order: 0,
    status: 'ativo'
  });
  const [isSavingPartner, setIsSavingPartner] = useState(false);

  // Estados da Aba de Resgates do Parceiro
  const [partnerDrawerTab, setPartnerDrawerTab] = useState<'dados' | 'resgates'>('dados');
  const [partnerRedemptions, setPartnerRedemptions] = useState<PartnerRedemption[]>([]);
  const [isLoadingRedemptions, setIsLoadingRedemptions] = useState(false);
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [copiedRedemptionCode, setCopiedRedemptionCode] = useState<string | null>(null);
  const [editingRedemptionId, setEditingRedemptionId] = useState<string | null>(null);
  const [activationLinkInput, setActivationLinkInput] = useState('');
  const [isSavingActivation, setIsSavingActivation] = useState(false);
  const [reSendingWhatsappId, setReSendingWhatsappId] = useState<string | null>(null);
  const [selectedRedemptionForModal, setSelectedRedemptionForModal] = useState<PartnerRedemption | null>(null);

  const loadSupplierData = useCallback(async () => {
    try {
      setLoadingSnapshot(true);
      const data = await getAdminSupplierSnapshot();
      setSnapshot(data || EMPTY_SNAPSHOT);
    } catch (err: any) {
      console.error('Erro ao carregar dados de fornecedores:', err);
      toast.error('Erro ao carregar fornecedores.');
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  const loadPartnerData = useCallback(async () => {
    try {
      setLoadingPartners(true);
      const data = await listAdminPartners();
      setPartners(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar parceiros:', err);
      toast.error('Erro ao carregar rede de parceiros.');
    } finally {
      setLoadingPartners(false);
    }
  }, []);

  const loadRedemptions = useCallback(async (partnerId: string) => {
    setIsLoadingRedemptions(true);
    try {
      const list = await listPartnerRedemptions(partnerId);
      setPartnerRedemptions(list);
    } catch (err) {
      console.error('Erro ao carregar resgates do parceiro:', err);
      toast.error('Não foi possível carregar a lista de resgates.');
    } finally {
      setIsLoadingRedemptions(false);
    }
  }, []);

  // Synchronize selected modal item when list is updated (e.g. by realtime)
  useEffect(() => {
    if (selectedRedemptionForModal) {
      const updated = partnerRedemptions.find(r => r.id === selectedRedemptionForModal.id);
      if (updated) {
        setSelectedRedemptionForModal(updated);
      }
    }
  }, [partnerRedemptions]);

  const handleOpenActivationForm = (resgate: PartnerRedemption) => {
    setEditingRedemptionId(resgate.id);
    setActivationLinkInput(resgate.link_ativacao || '');
  };

  const handleSaveActivationLink = async (resgate: PartnerRedemption) => {
    const link = activationLinkInput.trim();
    if (!link) {
      toast.error('Por favor, informe o link de ativação gerado no site do parceiro.');
      return;
    }

    setIsSavingActivation(true);
    try {
      const success = await completePartnerRedemption({
        resgateId: resgate.id,
        linkAtivacao: link,
        partnerName: selectedPartner?.name || 'Parceiro Comercial GSA',
        partnerCover: selectedPartner?.cover_url || undefined,
        partnerLogo: selectedPartner?.logo_url || undefined,
        benefitName: selectedPartner?.benefits || undefined,
        customerName: resgate.nome_completo,
        customerPhone: resgate.telefone,
        customerEmail: resgate.email || undefined
      });

      if (success) {
        toast.success(`Link salvo e notificação de WhatsApp enviada com sucesso para ${maskPhone(resgate.telefone)}!`, { duration: 5000 });
      } else {
        toast.success('Link de ativação salvo no cadastro!', { duration: 4000 });
      }

      setEditingRedemptionId(null);
      setActivationLinkInput('');
      if (selectedPartner?.id) {
        await loadRedemptions(selectedPartner.id);
      }
    } catch (err: any) {
      console.error('Erro ao salvar ativação:', err);
      toast.error(err?.message || 'Erro ao salvar link de ativação.');
    } finally {
      setIsSavingActivation(false);
    }
  };

  const handleResendActivationWhatsApp = async (resgate: PartnerRedemption) => {
    if (!resgate.link_ativacao) {
      toast.error('Nenhum link de ativação cadastrado para este resgate.');
      return;
    }
    setReSendingWhatsappId(resgate.id);
    try {
      const success = await completePartnerRedemption({
        resgateId: resgate.id,
        linkAtivacao: resgate.link_ativacao,
        partnerName: selectedPartner?.name || 'Parceiro Comercial GSA',
        partnerCover: selectedPartner?.cover_url || undefined,
        partnerLogo: selectedPartner?.logo_url || undefined,
        benefitName: selectedPartner?.benefits || undefined,
        customerName: resgate.nome_completo,
        customerPhone: resgate.telefone,
        customerEmail: resgate.email || undefined
      });

      if (success) {
        toast.success(`Notificação reenviada com sucesso para o WhatsApp de ${resgate.nome_completo}!`, { duration: 4000 });
      } else {
        toast.success('Notificação reenviada!', { duration: 3000 });
      }
    } catch (err: any) {
      console.error('Erro ao reenviar WhatsApp:', err);
      toast.error('Erro ao reenviar mensagem pelo WhatsApp.');
    } finally {
      setReSendingWhatsappId(null);
    }
  };

  const filteredPartnerRedemptions = useMemo(() => {
    const term = redemptionSearch.trim().toLowerCase();
    if (!term) return partnerRedemptions;
    return partnerRedemptions.filter((r) => 
      (r.nome_completo && r.nome_completo.toLowerCase().includes(term)) ||
      (r.telefone && r.telefone.toLowerCase().includes(term)) ||
      (r.codigo_gerado && r.codigo_gerado.toLowerCase().includes(term)) ||
      (r.tipo_resgate && r.tipo_resgate.toLowerCase().includes(term))
    );
  }, [partnerRedemptions, redemptionSearch]);

  const handleExportRedemptionsCsv = () => {
    if (partnerRedemptions.length === 0) {
      toast.error('Não há resgates para exportar.');
      return;
    }
    const headers = ['ID', 'Cliente', 'Telefone', 'Tipo de Resgate', 'Codigo / Cupom', 'Data e Hora', 'Link Destino'];
    const rows = partnerRedemptions.map(r => [
      r.id,
      `"${(r.nome_completo || '').replace(/"/g, '""')}"`,
      `"${r.telefone || ''}"`,
      r.tipo_resgate || 'link',
      r.codigo_gerado || '',
      formatDateTime(r.created_at),
      `"${(r.link_destino || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `resgates_${selectedPartner?.slug || 'parceiro'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório CSV exportado com sucesso!');
  };

  const handleCopyRedemptionCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedRedemptionCode(code);
    toast.success(`Código "${code}" copiado!`);
    setTimeout(() => setCopiedRedemptionCode(null), 3000);
  };

  useEffect(() => {
    loadSupplierData();
    loadPartnerData();
  }, [loadSupplierData, loadPartnerData]);

  useRealtimeSubscription([
    { table: 'parceiros', onChange: loadPartnerData, debounceMs: 300 },
    {
      table: 'parceiros_resgates',
      onChange: () => {
        if (selectedPartner?.id) void loadRedemptions(selectedPartner.id);
      },
      debounceMs: 300,
    },
    { table: 'fornecedores', onChange: loadSupplierData, debounceMs: 300 },
  ], [selectedPartner?.id, loadPartnerData, loadRedemptions, loadSupplierData]);

  // Supplier Actions
  const handleOpenSupplier = (supplier: any) => {
    setSelectedSupplier(supplier);
    setSupplierPin('');
    setSupplierReason('');
    setIsSupplierDrawerOpen(true);
  };

  const handleUpdateSupplierStatus = async (status: string) => {
    if (!selectedSupplier) return;
    if (status === 'ativo' && !/^\d{4}$/.test(supplierPin)) {
      toast.error('Informe um PIN de 4 dígitos para liberação do acesso.');
      return;
    }
    if (status !== 'ativo' && supplierReason.trim().length < 3) {
      toast.error('Informe o motivo da alteração de status.');
      return;
    }

    setIsProcessingSupplier(true);
    const toastId = toast.loading(`Alterando status do fornecedor para ${status}...`);

    try {
      await setAdminSupplierStatus(
        selectedSupplier.id,
        status,
        supplierReason.trim() || undefined,
        status === 'ativo' ? supplierPin : undefined
      );

      toast.success(status === 'ativo' ? 'Fornecedor homologado e PIN liberado!' : 'Status do fornecedor atualizado.', { id: toastId });
      setIsSupplierDrawerOpen(false);
      setSelectedSupplier(null);
      loadSupplierData();
    } catch (err: any) {
      console.error('Erro ao atualizar fornecedor:', err);
      toast.error(`Falha: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsProcessingSupplier(false);
    }
  };

  // Partner Actions
  const handleOpenNewPartner = () => {
    setSelectedPartner(null);
    setPartnerDrawerTab('dados');
    setPartnerRedemptions([]);
    setRedemptionSearch('');
    setPartnerForm({
      slug: '',
      name: '',
      legal_name: '',
      category: 'Serviços & Conveniência',
      short_description: '',
      description: '',
      logo_url: '',
      cover_url: '',
      phone: '',
      whatsapp: '',
      email: '',
      website: '',
      instagram: '',
      facebook: '',
      linkedin: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zip_code: '',
      maps_url: '',
      business_hours: '',
      service_mode: 'hibrido',
      service_regions: [],
      services: [],
      products: [],
      benefits: '',
      contact_person: '',
      internal_notes: '',
      featured: false,
      display_order: 0,
      status: 'ativo',
      redemption_has_coupon: false,
      redemption_coupon_code: '',
      redemption_has_voucher: false,
      redemption_has_link: true,
      redemption_link: '',
      redemption_auto_redirect: false,
      redemption_instructions: '',
      redemption_delay_24h: false
    });
    setIsPartnerDrawerOpen(true);
  };

  const handleOpenEditPartner = (partner: Partner) => {
    setSelectedPartner(partner);
    setPartnerDrawerTab('dados');
    setRedemptionSearch('');
    void loadRedemptions(partner.id);
    setPartnerForm({
      slug: partner.slug || '',
      name: partner.name || '',
      legal_name: partner.legal_name || '',
      category: partner.category || '',
      short_description: partner.short_description || '',
      description: partner.description || '',
      logo_url: partner.logo_url || '',
      cover_url: partner.cover_url || '',
      phone: partner.phone || '',
      whatsapp: partner.whatsapp || '',
      email: partner.email || '',
      website: partner.website || '',
      instagram: partner.instagram || '',
      facebook: partner.facebook || '',
      linkedin: partner.linkedin || '',
      street: partner.street || '',
      number: partner.number || '',
      complement: partner.complement || '',
      neighborhood: partner.neighborhood || '',
      city: partner.city || '',
      state: partner.state || '',
      zip_code: partner.zip_code || '',
      maps_url: partner.maps_url || '',
      business_hours: partner.business_hours || '',
      service_mode: partner.service_mode || 'hibrido',
      service_regions: partner.service_regions || [],
      services: partner.services || [],
      products: partner.products || [],
      benefits: partner.benefits || '',
      contact_person: partner.contact_person || '',
      internal_notes: partner.internal_notes || '',
      featured: partner.featured || false,
      display_order: partner.display_order || 0,
      status: partner.status || 'ativo',
      redemption_has_coupon: Boolean(partner.redemption_has_coupon),
      redemption_coupon_code: partner.redemption_coupon_code || '',
      redemption_has_voucher: Boolean(partner.redemption_has_voucher),
      redemption_has_link: Boolean(partner.redemption_has_link),
      redemption_link: partner.redemption_link || '',
      redemption_auto_redirect: Boolean(partner.redemption_auto_redirect),
      redemption_instructions: partner.redemption_instructions || '',
      redemption_delay_24h: Boolean(partner.redemption_delay_24h)
    });
    setIsPartnerDrawerOpen(true);
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerForm.name.trim()) {
      toast.error('Informe o nome do parceiro comercial.');
      return;
    }

    setIsSavingPartner(true);
    const toastId = toast.loading('Salvando parceiro comercial...');

    try {
      const slug = partnerForm.slug.trim() || partnerForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const shortDesc = partnerForm.short_description?.trim() || partnerForm.description?.trim() || partnerForm.benefits?.trim() || partnerForm.name.trim();

      await savePartner({
        ...partnerForm,
        short_description: shortDesc,
        slug,
        id: selectedPartner?.id
      } as any, selectedPartner?.id);

      toast.success('Parceiro comercial salvo com sucesso!', { id: toastId });
      setIsPartnerDrawerOpen(false);
      setSelectedPartner(null);
      loadPartnerData();
    } catch (err: any) {
      console.error('Erro ao salvar parceiro:', err);
      toast.error(`Erro ao salvar: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsSavingPartner(false);
    }
  };

  const handleTogglePartnerStatus = async (partner: Partner, newStatus?: Partner['status']) => {
    const targetStatus: Partner['status'] = newStatus || (partner.status === 'ativo' ? 'inativo' : 'ativo');
    const actionLabel = targetStatus === 'ativo' ? 'ativado' : 'desativado';
    const toastId = toast.loading(`${targetStatus === 'ativo' ? 'Ativando' : 'Desativando'} parceiro ${partner.name}...`);
    try {
      await setPartnerStatus(partner.id, targetStatus);
      toast.success(`Parceiro ${partner.name} foi ${actionLabel} com sucesso!`, { id: toastId });
      if (selectedPartner?.id === partner.id) {
        setSelectedPartner({ ...selectedPartner, status: targetStatus });
        setPartnerForm((prev) => ({ ...prev, status: targetStatus }));
      }
      loadPartnerData();
    } catch (err: any) {
      console.error('Erro ao alterar status do parceiro:', err);
      toast.error(`Erro ao alterar status: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    }
  };

  const handleDeletePartner = async (partner: Partner) => {
    const toastId = toast.loading(`Excluindo parceiro ${partner.name}...`);
    try {
      await setPartnerStatus(partner.id, 'excluido');
      toast.success(`Parceiro ${partner.name} excluído com sucesso!`, { id: toastId });
      if (selectedPartner?.id === partner.id) {
        setIsPartnerDrawerOpen(false);
        setSelectedPartner(null);
      }
      loadPartnerData();
    } catch (err: any) {
      console.error('Erro ao excluir parceiro:', err);
      toast.error(`Erro ao excluir parceiro: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingCover(true);
    const toastId = toast.loading('Enviando imagem de capa...');
    try {
      const publicUrl = await uploadPublicStoreImage(file, 'parceiros/capas');
      setPartnerForm((prev) => ({ ...prev, cover_url: publicUrl }));
      toast.success('Imagem de capa enviada com sucesso!', { id: toastId });
    } catch (err: any) {
      console.error('Erro no upload da capa:', err);
      toast.error(err?.message || 'Falha ao enviar imagem de capa.', { id: toastId });
    } finally {
      setIsUploadingCover(false);
      e.target.value = '';
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    const toastId = toast.loading('Enviando logotipo...');
    try {
      const publicUrl = await uploadPublicStoreImage(file, 'parceiros/logos');
      setPartnerForm((prev) => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logotipo enviado com sucesso!', { id: toastId });
    } catch (err: any) {
      console.error('Erro no upload do logo:', err);
      toast.error(err?.message || 'Falha ao enviar logotipo.', { id: toastId });
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  // CEP Lookup for partner
  const handleCepLookup = async (cepValue: string) => {
    const clean = cepValue.replace(/\D/g, '');
    if (clean.length === 8) {
      try {
        const address = await consultarCEP(clean);
        if (address && !address.erro) {
          setPartnerForm((prev) => ({
            ...prev,
            street: address.logradouro || prev.street,
            neighborhood: address.bairro || prev.neighborhood,
            city: address.localidade || prev.city,
            state: address.uf || prev.state
          }));
          toast.success('Endereço preenchido automaticamente.');
        }
      } catch (err) {
        console.error('Erro ao consultar CEP:', err);
      }
    }
  };

  // Columns for Suppliers
  const supplierColumns: GridColumn<any>[] = [
    {
      key: 'razao_social',
      header: 'Fornecedor / Razão Social',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            {row.razao_social}
            {row.status === 'ativo' && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {row.nome_fantasia ? `${row.nome_fantasia} " ` : ''}CNPJ: {maskCNPJ(row.documento || '')}
          </div>
        </div>
      )
    },
    {
      key: 'contato',
      header: 'Contato',
      render: (row) => (
        <div className="text-xs text-slate-600 space-y-0.5">
          <div className="flex items-center gap-1">
            <Phone className="h-3 w-3 text-slate-400" />
            <span>{maskPhone(row.telefone || '')}</span>
          </div>
          {row.email && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-[170px]">
              <Mail className="h-3 w-3 text-slate-400" />
              <span className="truncate">{row.email}</span>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'localidade',
      header: 'Cidade / UF',
      render: (row) => (
        <div className="text-xs text-slate-700">
          {row.cidade ? `${row.cidade} - ${row.estado}` : <span className="text-slate-400 italic">Não informada</span>}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '130px',
      render: (row) => <StatusBadge status={row.status} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'center',
      width: '90px',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenSupplier(row);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Ver
        </button>
      )
    }
  ];

  // Columns for Purchase Orders
  const orderColumns: GridColumn<any>[] = [
    {
      key: 'numero_ordem',
      header: 'Pedido / Fornecedor',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900 font-mono">{row.numero_ordem || `#PO-${row.id.slice(0, 6).toUpperCase()}`}</div>
          <div className="text-[11px] text-slate-500">{row.fornecedor?.razao_social || 'Fornecedor'}</div>
        </div>
      )
    },
    {
      key: 'valor_total',
      header: 'Valor Total',
      sortable: true,
      align: 'right',
      width: '140px',
      render: (row) => (
        <div className="font-mono font-bold text-slate-900 tabular-nums">
          {formatCurrency(row.valor_total || 0)}
        </div>
      )
    },
    {
      key: 'previsao_entrega',
      header: 'Previsão Entrega',
      sortable: true,
      render: (row) => (
        <div className="text-xs text-slate-600 font-mono">
          {row.previsao_entrega ? formatDate(row.previsao_entrega) : ''}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '130px',
      render: (row) => <StatusBadge status={row.status} size="sm" />
    }
  ];

  // Columns for Partners
  const partnerColumns: GridColumn<Partner>[] = [
    {
      key: 'name',
      header: 'Parceiro Comercial / Nome',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            {row.name}
            {row.featured && (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                VIP Destaque
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            {row.category || 'Geral'} {row.city ? `" ${row.city}/${row.state}` : ''}
          </div>
        </div>
      )
    },
    {
      key: 'benefits',
      header: 'Benefício / Desconto Oferecido',
      render: (row) => (
        <div className="text-xs text-emerald-800 font-semibold truncate max-w-[240px]">
          {row.benefits || 'Desconto exclusivo para membros GSA'}
        </div>
      )
    },
    {
      key: 'contato',
      header: 'Contato / WhatsApp',
      render: (row) => (
        <div className="text-xs text-slate-600">
          {row.whatsapp ? maskPhone(row.whatsapp) : row.phone ? maskPhone(row.phone) : ''}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '130px',
      render: (row) => <StatusBadge status={row.status} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'center',
      width: '90px',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenEditPartner(row);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Editar
        </button>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Sub-navigation bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveMainTab('fornecedores')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeMainTab === 'fornecedores'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Fornecedores ({snapshot.suppliers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('pedidos')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeMainTab === 'pedidos'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span>Pedidos de Compra ({snapshot.orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMainTab('parceiros')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
              activeMainTab === 'parceiros'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Parceiros Comerciais ({partners.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeMainTab === 'parceiros' ? (
            <button
              type="button"
              onClick={handleOpenNewPartner}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 uppercase tracking-wider"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Parceiro</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              loadSupplierData();
              loadPartnerData();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loadingSnapshot || loadingPartners ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Content based on active sub-tab */}
      {activeMainTab === 'fornecedores' && (
        <TacticalDataGrid
          title="Diretório de Fornecedores Homologados"
          subtitle="Controle de compras, cadastro de empresas fornecedoras e liberação de acesso ao portal B2B"
          data={snapshot.suppliers}
          columns={supplierColumns}
          keyExtractor={(item) => item.id}
          onRowClick={handleOpenSupplier}
          isLoading={loadingSnapshot}
          pageSize={15}
          searchPlaceholder="Buscar por razão social, nome fantasia ou CNPJ..."
        />
      )}

      {activeMainTab === 'pedidos' && (
        <TacticalDataGrid
          title="Pedidos de Compra a Fornecedores"
          subtitle="Ordens de suprimento para abastecimento de estoque físico e fulfilment do e-commerce"
          data={snapshot.orders}
          columns={orderColumns}
          keyExtractor={(item) => item.id}
          isLoading={loadingSnapshot}
          pageSize={15}
          searchPlaceholder="Buscar por número do pedido ou fornecedor..."
        />
      )}

      {activeMainTab === 'parceiros' && (
        <TacticalDataGrid<Partner>
          title="Rede de Parceiros Comerciais & Convênios"
          subtitle="Empresas conveniadas que oferecem descontos, benefícios exclusivos e parcerias institucionais"
          data={partners}
          columns={partnerColumns}
          keyExtractor={(item) => item.id}
          onRowClick={handleOpenEditPartner}
          isLoading={loadingPartners}
          pageSize={15}
          searchPlaceholder="Buscar por nome do parceiro, categoria ou cidade..."
        />
      )}

      {/* Supplier Inspection & Approval SlideOver */}
      {selectedSupplier && (
        <CommandSlideOver
          isOpen={isSupplierDrawerOpen}
          onClose={() => {
            setIsSupplierDrawerOpen(false);
            setSelectedSupplier(null);
          }}
          title={selectedSupplier.razao_social}
          subtitle={`CNPJ: ${maskCNPJ(selectedSupplier.documento || '')} " Cadastrado em ${formatDate(selectedSupplier.created_at)}`}
          badge={<StatusBadge status={selectedSupplier.status} size="sm" />}
          width="lg"
        >
          <div className="space-y-5 text-xs">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                Dossiê da Empresa Fornecedora
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Razão Social</span>
                  <span className="font-semibold text-slate-900">{selectedSupplier.razao_social}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nome Fantasia</span>
                  <span className="font-medium text-slate-800">{selectedSupplier.nome_fantasia || ''}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">CNPJ</span>
                  <span className="font-mono font-medium text-slate-900">{maskCNPJ(selectedSupplier.documento || '')}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Telefone</span>
                  <span className="text-slate-800">{maskPhone(selectedSupplier.telefone || '')}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">E-mail</span>
                  <span className="text-slate-800">{selectedSupplier.email || ''}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Endereço</span>
                  <span className="text-slate-800">{selectedSupplier.endereco || ''}, {selectedSupplier.cidade || ''}</span>
                </div>
              </div>
            </div>

            {/* Approval / Accreditation Area */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Acreditação & Liberação de Acesso
              </h4>

              {selectedSupplier.status !== 'ativo' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Definir PIN de 4 dígitos para liberação do Fornecedor <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      value={supplierPin}
                      onChange={(e) => setSupplierPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 1234"
                      className="w-32 rounded-lg border border-slate-300 bg-white p-2 font-mono text-center text-sm font-bold tracking-widest"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateSupplierStatus('ativo')}
                    disabled={isProcessingSupplier}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 uppercase tracking-wider"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar e Liberar Fornecedor
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Motivo para suspensão ou inativação
                    </label>
                    <textarea
                      rows={2}
                      value={supplierReason}
                      onChange={(e) => setSupplierReason(e.target.value)}
                      placeholder="Justificativa..."
                      className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateSupplierStatus('suspenso')}
                      disabled={isProcessingSupplier}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                    >
                      Suspender
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateSupplierStatus('inativo')}
                      disabled={isProcessingSupplier}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                    >
                      Inativar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CommandSlideOver>
      )}

      {/* Partner Creation/Editing SlideOver */}
      <CommandSlideOver
        isOpen={isPartnerDrawerOpen}
        onClose={() => {
          setIsPartnerDrawerOpen(false);
          setSelectedPartner(null);
        }}
        title={selectedPartner ? `Editar: ${selectedPartner.name}` : 'Cadastrar Novo Parceiro Comercial'}
        subtitle={
          selectedPartner 
            ? 'Gerencie os dados institucionais, regras de resgate e acompanhe os clientes que resgataram o benefício.' 
            : 'Configure informações institucionais, benefícios aos associados e canais de contato'
        }
        width="lg"
      >
        <div className="space-y-4">
          {/* Navegação por Abas no Modal (apenas quando estiver editando parceiro existente) */}
          {selectedPartner && (
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={() => setPartnerDrawerTab('dados')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  partnerDrawerTab === 'dados'
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                <Building2 className="h-4 w-4" />
                <span>Dados do Parceiro</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPartnerDrawerTab('resgates');
                  if (selectedPartner?.id) void loadRedemptions(selectedPartner.id);
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  partnerDrawerTab === 'resgates'
                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                <Gift className="h-4 w-4" />
                <span>Resgates</span>
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  partnerDrawerTab === 'resgates' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {partnerRedemptions.length}
                </span>
              </button>
            </div>
          )}

          {/* ABA 1: FORMULÁRIO DE DADOS DO PARCEIRO */}
          {partnerDrawerTab === 'dados' && (
            <form onSubmit={handleSavePartner} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Nome Fantasia / Marca <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={partnerForm.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const updates: Partial<typeof partnerForm> = { name: newName };
                      if (!selectedPartner && (!partnerForm.slug || partnerForm.slug === partnerForm.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))) {
                        updates.slug = newName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      }
                      setPartnerForm({ ...partnerForm, ...updates });
                    }}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                    placeholder="Ex: Ótica Visual Prime"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-600">
                      Link / URL da Página Pública (Slug) <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const generated = partnerForm.name
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/(^-|-$)/g, '');
                        setPartnerForm({ ...partnerForm, slug: generated });
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 underline"
                    >
                      Atualizar URL com base no nome
                    </button>
                  </div>
                  <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
                    <span className="px-2.5 text-xs text-slate-500 font-mono select-none bg-slate-100/80 border-r border-slate-200 py-2">
                      /nossos-parceiros/
                    </span>
                    <input
                      type="text"
                      required
                      value={partnerForm.slug}
                      onChange={(e) => {
                        const cleanSlug = e.target.value
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/[^a-z0-9-]/g, '')
                          .replace(/-+/g, '-');
                        setPartnerForm({ ...partnerForm, slug: cleanSlug });
                      }}
                      className="w-full bg-transparent p-2 text-xs font-mono font-bold text-slate-800 focus:outline-none"
                      placeholder="nome-do-parceiro"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Endereço amigável usado para acessar a página exclusiva deste parceiro no site.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Categoria</label>
                  <input
                    type="text"
                    value={partnerForm.category}
                    onChange={(e) => setPartnerForm({ ...partnerForm, category: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    placeholder="Ex: Saúde, Óticas, Alimentação"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">WhatsApp de Atendimento</label>
                  <input 
                    type="text"
                    value={maskPhone(partnerForm.whatsapp)}
                    inputMode="numeric"
onChange={(e) => setPartnerForm({ ...partnerForm, whatsapp: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Benefício Oferecido aos Clientes GSA</label>
                  <input
                    type="text"
                    value={partnerForm.benefits}
                    onChange={(e) => setPartnerForm({ ...partnerForm, benefits: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    placeholder="Ex: 20% de desconto na primeira compra + brinde exclusivo"
                  />
                </div>

                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-700 mb-1">
                      Status do Parceiro
                    </label>
                    <select
                      value={partnerForm.status || 'ativo'}
                      onChange={(e) => setPartnerForm({ ...partnerForm, status: e.target.value as any })}
                      className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="ativo">Ativo (Publicado no site e catélogo)</option>
                      <option value="inativo">Inativo (Desativado / Oculto)</option>
                      <option value="em_analise">Em análise</option>
                      <option value="encerrado">Encerrado</option>
                      <option value="excluido">Excluído</option>
                    </select>
                  </div>
                  <div className="flex items-center pt-2 sm:pt-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={partnerForm.featured || false}
                        onChange={(e) => setPartnerForm({ ...partnerForm, featured: e.target.checked })}
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>P Parceiro em Destaque VIP (Home)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">CEP</label>
                  <input 
                    type="text"
                    value={maskCEP(partnerForm.zip_code)}
                    inputMode="numeric"
onChange={(e) => {
                      setPartnerForm({ ...partnerForm, zip_code: e.target.value });
                      handleCepLookup(e.target.value);
                    }}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    placeholder="00000-000"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Cidade / UF</label>
                  <input
                    type="text"
                    value={`${partnerForm.city} - ${partnerForm.state}`}
                    onChange={(e) => {
                      const parts = e.target.value.split('-');
                      setPartnerForm({ ...partnerForm, city: parts[0]?.trim() || '', state: parts[1]?.trim() || '' });
                    }}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    placeholder="São Paulo - SP"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Descrição Comercial</label>
                  <textarea
                    rows={3}
                    value={partnerForm.description}
                    onChange={(e) => setPartnerForm({ ...partnerForm, description: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                    placeholder="Apresentação do parceiro e condições para validação do convênio..."
                  />
                </div>

                {/* Foto de Capa / Banner */}
                <div className="sm:col-span-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-slate-700 flex items-center gap-1.5">
                      <ImageIcon className="h-3.5 w-3.5 text-indigo-600" />
                      Foto de Capa / Banner da Empresa
                    </label>
                    {partnerForm.cover_url && (
                      <button
                        type="button"
                        onClick={() => setPartnerForm((prev) => ({ ...prev, cover_url: '' }))}
                        className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remover Capa
                      </button>
                    )}
                  </div>

                  {/* Preview de Capa */}
                  {partnerForm.cover_url ? (
                    <div className="relative aspect-[21/9] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900 shadow-inner">
                      <img
                        src={partnerForm.cover_url}
                        alt="Pré-visualização da Capa"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-2.5">
                        <span className="text-[11px] font-bold text-white drop-shadow">Pré-visualização da Capa</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex aspect-[21/9] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white p-3 text-center text-slate-400">
                      <ImageIcon className="h-8 w-8 text-slate-300 mb-1" />
                      <span className="text-[11px] font-medium text-slate-600">Nenhuma imagem de capa selecionada</span>
                      <span className="text-[9px] text-slate-400">Envie um arquivo ou informe a URL direta da imagem abaixo</span>
                    </div>
                  )}

                  {/* Inputs para Capa: URL ou Upload */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div className="sm:col-span-2">
                      <input
                        type="url"
                        value={partnerForm.cover_url || ''}
                        onChange={(e) => setPartnerForm({ ...partnerForm, cover_url: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                        placeholder="https://exemplo.com/imagem-capa.jpg"
                      />
                    </div>
                    <div>
                      <label className={`flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer ${isUploadingCover ? 'opacity-50 pointer-events-none' : ''}`}>
                        {isUploadingCover ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Enviando...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            <span>Enviar Capa</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleCoverUpload}
                          disabled={isUploadingCover}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Logotipo / Marca */}
                <div className="sm:col-span-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase text-slate-700 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                      Logotipo / Marca da Empresa
                    </label>
                    {partnerForm.logo_url && (
                      <button
                        type="button"
                        onClick={() => setPartnerForm((prev) => ({ ...prev, logo_url: '' }))}
                        className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remover Logo
                      </button>
                    )}
                  </div>

                  {/* Preview e Inputs de Logo */}
                  <div className="flex items-center gap-3">
                    {partnerForm.logo_url ? (
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                        <img
                          src={partnerForm.logo_url}
                          alt="Logo"
                          className="h-full w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="h-14 w-14 shrink-0 flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-400">
                        <Building2 className="h-6 w-6 text-slate-300" />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                      <div className="sm:col-span-2">
                        <input
                          type="url"
                          value={partnerForm.logo_url || ''}
                          onChange={(e) => setPartnerForm({ ...partnerForm, logo_url: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                          placeholder="https://exemplo.com/logo.png"
                        />
                      </div>
                      <div>
                        <label className={`flex h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer ${isUploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}>
                          {isUploadingLogo ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Enviando...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-3.5 w-3.5" />
                              <span>Enviar Logo</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoUpload}
                            disabled={isUploadingLogo}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Configuração de Resgate de Benefício */}
                <div className="sm:col-span-2 space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3.5">
                  <div className="flex items-center gap-2 text-amber-950 font-black text-xs uppercase tracking-wide">
                    <Gift className="h-4 w-4 text-amber-700" />
                    <span>Configuração de Resgate de Benefício (Clientes GSA)</span>
                  </div>
                  <p className="text-[11px] text-amber-800/80 leading-relaxed">
                    Defina o que será entregue quando o cliente clicar em <strong>"Resgatar Benefício"</strong> na página da parceria.
                  </p>

                  {/* Toggles de Tipo de Resgate (Entrega Imediata) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Opção Cupom */}
                    <div className={`rounded-lg border p-3 space-y-2 transition-all ${
                      partnerForm.redemption_delay_24h
                        ? 'border-slate-200 bg-slate-50/60 opacity-60'
                        : 'border-slate-200 bg-white'
                    }`}>
                      <label className={`flex items-center gap-2 ${partnerForm.redemption_delay_24h ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={partnerForm.redemption_delay_24h || false}
                          checked={partnerForm.redemption_has_coupon || false}
                          onChange={(e) => setPartnerForm({ 
                            ...partnerForm, 
                            redemption_has_coupon: e.target.checked,
                            redemption_delay_24h: false
                          })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Ticket className="h-3.5 w-3.5 text-amber-600" />
                          Gerar Código de Cupom
                        </span>
                      </label>
                      {partnerForm.redemption_has_coupon && !partnerForm.redemption_delay_24h && (
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Código Fixo (opcional)
                          </label>
                          <input
                            type="text"
                            value={partnerForm.redemption_coupon_code || ''}
                            onChange={(e) => setPartnerForm({ ...partnerForm, redemption_coupon_code: e.target.value.toUpperCase() })}
                            placeholder="Ex: GSA20PET (vazio = dinâmico)"
                            className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono uppercase focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Opção Voucher */}
                    <div className={`rounded-lg border p-3 space-y-2 transition-all ${
                      partnerForm.redemption_delay_24h
                        ? 'border-slate-200 bg-slate-50/60 opacity-60'
                        : 'border-slate-200 bg-white'
                    }`}>
                      <label className={`flex items-center gap-2 ${partnerForm.redemption_delay_24h ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          disabled={partnerForm.redemption_delay_24h || false}
                          checked={partnerForm.redemption_has_voucher || false}
                          onChange={(e) => setPartnerForm({ 
                            ...partnerForm, 
                            redemption_has_voucher: e.target.checked,
                            redemption_delay_24h: false
                          })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Gift className="h-3.5 w-3.5 text-emerald-600" />
                          Gerar Voucher / Protocolo Digital
                        </span>
                      </label>
                      <p className="text-[10px] text-slate-500">
                        Cria um protocolo único formatado (ex: VOUCHER-GSA-PETL-9A3F) para identificação.
                      </p>
                    </div>
                  </div>

                  {/* Opção Link / Redirecionamento */}
                  <div className={`rounded-lg border p-3 space-y-2.5 transition-all ${
                    partnerForm.redemption_delay_24h
                      ? 'border-slate-200 bg-slate-50/60 opacity-60'
                      : 'border-slate-200 bg-white'
                  }`}>
                    <label className={`flex items-center gap-2 ${partnerForm.redemption_delay_24h ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        disabled={partnerForm.redemption_delay_24h || false}
                        checked={partnerForm.redemption_has_link || false}
                        onChange={(e) => setPartnerForm({ 
                          ...partnerForm, 
                          redemption_has_link: e.target.checked,
                          redemption_delay_24h: false
                        })}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Link2 className="h-3.5 w-3.5 text-indigo-600" />
                        Disponibilizar Link de Acesso / Parceria
                      </span>
                    </label>

                    {(partnerForm.redemption_has_link && !partnerForm.redemption_delay_24h) && (
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                            Link de Destino / Redirecionamento da Parceria
                          </label>
                          <input
                            type="url"
                            value={partnerForm.redemption_link || ''}
                            onChange={(e) => setPartnerForm({ ...partnerForm, redemption_link: e.target.value })}
                            placeholder="https://parceiro.com.br/promocao-gsa (ou deixe vazio para usar o site padrão)"
                            className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-500 focus:outline-none"
                          />
                        </div>

                        {/* CAIXINHA DE SELEÇÃO: Redirecionamento Automático */}
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={partnerForm.redemption_auto_redirect || false}
                              onChange={(e) => setPartnerForm({ ...partnerForm, redemption_auto_redirect: e.target.checked })}
                              className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="text-xs">
                              <strong className="block font-bold text-indigo-950">
                                Redirecionar cliente automaticamente para o parceiro ao resgatar
                              </strong>
                              <span className="text-[11px] text-indigo-800/80">
                                Quando marcado, ao preencher Nome e Telefone e clicar em "Resgatar Agora", uma nova aba abrirá automaticamente com o link da parceria. Quando desmarcado, o link  gerado no modal sem abrir sozinho.
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CAIXINHA DE ATIVAÇÃO: Modo 24 Horas via WhatsApp (Exclusivo: só pode ser ativo se Cupom, Voucher e Link estiverem desmarcados) */}
                  {(() => {
                    const hasImmediateActive = Boolean(
                      partnerForm.redemption_has_coupon || 
                      partnerForm.redemption_has_voucher || 
                      partnerForm.redemption_has_link
                    );

                    return (
                      <div className={`rounded-xl border p-3.5 transition-all ${
                        hasImmediateActive
                          ? 'border-slate-200 bg-slate-100/70 opacity-60'
                          : partnerForm.redemption_delay_24h
                          ? 'border-amber-400 bg-amber-50/90 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-amber-200'
                      }`}>
                        <label className={`flex items-start gap-3 ${hasImmediateActive ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            disabled={hasImmediateActive}
                            checked={hasImmediateActive ? false : (partnerForm.redemption_delay_24h || false)}
                            onChange={(e) => {
                              if (!hasImmediateActive) {
                                setPartnerForm({ ...partnerForm, redemption_delay_24h: e.target.checked });
                              }
                            }}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
                          />
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-amber-600" />
                              <strong className="font-bold text-slate-900">
                                Exibir pop-up informando prazo de 24 horas para ativação via WhatsApp
                              </strong>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                              {hasImmediateActive ? (
                                <span className="text-slate-500 font-medium flex items-center gap-1">
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                  <span>
                                    <strong>Bloqueado:</strong> Desmarque as opções de <em>Cupom</em>, <em>Voucher</em> e <em>Link de Acesso</em> acima para habilitar o modo 24 horas via WhatsApp.
                                  </span>
                                </span>
                              ) : partnerForm.redemption_delay_24h ? (
                                <span className="text-amber-950 font-semibold">
                                  <strong>Modo 24h Ativado:</strong> Ao clicar em "Resgatar Agora", abrirá o pop-up avisando que em até 24h o link de ativação será enviado por WhatsApp. O resgate ficará pendente no painel para inserção do link.
                                </span>
                              ) : (
                                <span className="text-slate-500">
                                  Nenhum benefício imediato selecionado. Marque esta opção para cadastrar o cliente manualmente e enviar o link em até 24h pelo WhatsApp.
                                </span>
                              )}
                            </p>
                          </div>
                        </label>
                      </div>
                    );
                  })()}

                  {/* Instruções de Utilização */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-600">
                      Instruções e Regras de Utilização do Benefício (opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={partnerForm.redemption_instructions || ''}
                      onChange={(e) => setPartnerForm({ ...partnerForm, redemption_instructions: e.target.value })}
                      placeholder="Ex: Insira o cupom no checkout ou apresente este comprovante na recepção..."
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {selectedPartner && (
                    <>
                      {partnerForm.status === 'ativo' ? (
                        <button
                          type="button"
                          disabled={isSavingPartner}
                          onClick={() => handleTogglePartnerStatus(selectedPartner, 'inativo')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                          Desativar Parceiro
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSavingPartner}
                          onClick={() => handleTogglePartnerStatus(selectedPartner, 'ativo')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ativar Parceiro
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isSavingPartner}
                        onClick={() => setPartnerToDelete(selectedPartner)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir Parceiro
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsPartnerDrawerOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPartner}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 uppercase tracking-wider"
                  >
                    {isSavingPartner ? 'Salvando...' : 'Salvar Parceiro'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* ABA 2: LISTAGEM DE CLIENTES QUE RESGATARAM O BENEFÍCIO */}
          {partnerDrawerTab === 'resgates' && selectedPartner && (
            <div className="space-y-4 text-xs">
              {/* Barra de Ações: Busca, Atualizar e Exportar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={redemptionSearch}
                    onChange={(e) => setRedemptionSearch(e.target.value)}
                    placeholder="Filtrar por nome, WhatsApp ou cupom..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-2 text-xs placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadRedemptions(selectedPartner.id)}
                    disabled={isLoadingRedemptions}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors shadow-sm disabled:opacity-50"
                    title="Atualizar lista de resgates"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingRedemptions ? 'animate-spin text-indigo-600' : ''}`} />
                    <span>Atualizar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportRedemptionsCsv}
                    disabled={partnerRedemptions.length === 0}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 transition-colors shadow-sm disabled:opacity-40"
                    title="Exportar dados para planilha CSV"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Exportar CSV</span>
                  </button>
                </div>
              </div>

              {/* Cards de Métricas Resumo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <Users className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Total de Resgates</span>
                  </div>
                  <div className="mt-1 text-2xl font-black text-slate-900">
                    {partnerRedemptions.length}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <Calendar className="h-3.5 w-3.5 text-amber-600" />
                    <span>Último Resgate</span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-slate-800 truncate">
                    {partnerRedemptions[0]?.created_at 
                      ? formatDateTime(partnerRedemptions[0].created_at) 
                      : 'Nenhum resgate ainda'}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <Gift className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Benefício Oferecido</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-700 truncate" title={selectedPartner.benefits || 'No especificado'}>
                    {selectedPartner.benefits || 'No especificado'}
                  </div>
                </div>
              </div>

              {/* Lista / Tabela de Resgates */}
              {isLoadingRedemptions ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Loader2 className="h-7 w-7 animate-spin text-indigo-600 mb-2" />
                  <span className="text-xs font-medium">Carregando relação de resgates...</span>
                </div>
              ) : filteredPartnerRedemptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-12 px-4 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 mb-3 shadow-sm">
                    <Gift className="h-6 w-6" />
                  </div>
                  <h4 className="text-sm font-black text-slate-800">
                    {redemptionSearch ? 'Nenhum resgate encontrado com este filtro' : 'Nenhum resgate registrado ainda'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    {redemptionSearch 
                      ? 'Tente buscar por outro termo ou limpe o campo de pesquisa.' 
                      : 'Assim que os clientes realizarem o resgate na página pública da parceria, os nomes, telefones e horários aparecerão listados aqui.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1 text-[11px] font-bold text-slate-500">
                    <span>{filteredPartnerRedemptions.length} {filteredPartnerRedemptions.length === 1 ? 'cliente resgatou' : 'clientes resgataram'}</span>
                    <span>Ordenado por mais recente</span>
                  </div>

                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    {filteredPartnerRedemptions.map((resgate, idx) => {
                      const cleanPhone = (resgate.telefone || '').replace(/\D/g, '');
                      const waUrl = cleanPhone.length >= 10 ? `https://wa.me/55${cleanPhone}` : null;
                      const isConcluido = Boolean(resgate.status === 'concluido' || resgate.link_ativacao);
                      
                      // Cálculo de SLA de 24h
                      const solicitadoEm = resgate.created_at ? new Date(resgate.created_at) : null;
                      const prazoLimite = solicitadoEm ? new Date(solicitadoEm.getTime() + 24 * 3600 * 1000) : null;
                      const diffMs = prazoLimite ? prazoLimite.getTime() - Date.now() : 0;
                      const isExpirado = diffMs <= 0;
                      const horasRestantes = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
                      const minutosRestantes = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));

                      return (
                        <div 
                          key={resgate.id || idx} 
                          onClick={() => setSelectedRedemptionForModal(resgate)}
                          className="p-4 sm:p-5 hover:bg-slate-50/90 transition-all flex flex-col gap-3.5 cursor-pointer group border-l-4 border-l-transparent hover:border-l-indigo-600"
                        >
                          {/* Topo do Card: Informações do Cliente, Status e Contatos */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            {/* Identificação do Cliente */}
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white font-black text-xs shadow-sm group-hover:scale-105 transition-transform">
                                  {(resgate.nome_completo || 'C').slice(0, 2).toUpperCase()}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h5 className="font-bold text-slate-900 text-sm leading-none group-hover:text-indigo-600 transition-colors">
                                      {resgate.nome_completo}
                                    </h5>
                                    {/* Badge de Status de Ativação */}
                                    {resgate.recurso?.status === 'em_analise' ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-700 border border-sky-300 animate-pulse">
                                        <FileText className="h-3 w-3 text-sky-600" />
                                        <span>Recurso em análise</span>
                                      </span>
                                    ) : resgate.status === 'recusado' ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-700 border border-rose-200">
                                        <X className="h-3 w-3 text-rose-600" />
                                        <span>Recusado</span>
                                      </span>
                                    ) : resgate.status === 'analise' || (resgate.alerta_duplicidade && !isConcluido) ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-700 border border-rose-300 animate-pulse">
                                        <AlertTriangle className="h-3 w-3 text-rose-600" />
                                        <span>Em Análise</span>
                                      </span>
                                    ) : isConcluido ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 border border-emerald-200">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        <span>Link Ativado</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800 border border-amber-300 animate-pulse">
                                        <Clock className="h-3 w-3 text-amber-600" />
                                        <span>Pendente de Link</span>
                                      </span>
                                    )}

                                    {/* Badge de SLA 24 Horas */}
                                    {resgate.recurso?.status === 'em_analise' ? (
                                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                        new Date(resgate.recurso.prazo_analise_em).getTime() < Date.now()
                                          ? 'bg-rose-100 text-rose-700 border-rose-200'
                                          : 'bg-sky-100 text-sky-700 border-sky-200'
                                      }`}>
                                        <Clock className="h-2.5 w-2.5" /> Prazo: {formatDateTime(resgate.recurso.prazo_analise_em)}
                                      </span>
                                    ) : resgate.status === 'recusado' ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200">
                                        <X className="h-2.5 w-2.5" /> Solicitação Finalizada
                                      </span>
                                    ) : isConcluido ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-500/20">
                                        <Check className="h-2.5 w-2.5" /> SLA Atendido
                                      </span>
                                    ) : isExpirado ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-500/20">
                                        <AlertTriangle className="h-3 w-3 text-rose-600" />
                                        <span>SLA Excedido (+{horasRestantes}h {minutosRestantes}m)</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-500/20">
                                        <Clock className="h-3 w-3 text-amber-600" />
                                        <span>{horasRestantes}h {minutosRestantes}m restantes (SLA 24h)</span>
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium mt-1">
                                    <span>Solicitação: <strong>{formatDateTime(resgate.created_at)}</strong></span>
                                    <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md font-mono font-bold">
                                      {resgate.codigo_gerado || `PROT-RES-${resgate.id.slice(0, 6).toUpperCase()}`}
                                    </span>
                                    {resgate.email && (
                                      <span className="text-slate-600 flex items-center gap-1 font-semibold">
                                        <Mail className="h-3 w-3 text-blue-500" />
                                        {resgate.email}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Telefone e Botão de WhatsApp */}
                            <div className="flex items-center gap-2 self-start sm:self-center shrink-0" onClick={(e) => e.stopPropagation()}>
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 text-xs font-bold transition-colors shadow-sm"
                                  title="Abrir conversa no WhatsApp"
                                >
                                  <MessageSquare className="h-3.5 w-3.5 fill-current" />
                                  <span>{maskPhone(resgate.telefone)}</span>
                                </a>
                              ) : (
                                <span className="text-xs font-bold text-slate-700">
                                  {maskPhone(resgate.telefone)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Seção do Link de Ativação / Ação Rápida */}
                          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {resgate.recurso?.status === 'em_analise' ? (
                              <div className="flex items-center gap-2 text-sky-800 min-w-0">
                                <FileText className="h-4 w-4 text-sky-600 shrink-0" />
                                <span className="text-xs font-medium truncate">
                                  <strong>Recurso:</strong> {resgate.recurso.protocolo_recurso}
                                </span>
                              </div>
                            ) : resgate.status === 'recusado' ? (
                              <div className="flex items-center gap-2 text-rose-800 min-w-0">
                                <X className="h-4 w-4 text-rose-600 shrink-0" />
                                <span className="text-xs font-medium truncate">
                                  <strong>Recusado:</strong> {resgate.motivo_recusa || 'Sem motivo registrado'}
                                </span>
                              </div>
                            ) : resgate.link_ativacao ? (
                              <div className="flex items-center gap-2 truncate min-w-0" onClick={(e) => e.stopPropagation()}>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <span className="text-slate-600 font-medium shrink-0">Link:</span>
                                <a
                                  href={resgate.link_ativacao}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-xs font-bold text-indigo-700 hover:underline truncate max-w-[240px] sm:max-w-[360px] flex items-center gap-1"
                                >
                                  <span className="truncate">{resgate.link_ativacao}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-amber-900">
                                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                                <span className="text-xs font-semibold text-amber-950">
                                  Pendente: cadastre o cliente no site da <strong>{selectedPartner.name}</strong> e insira o link gerado.
                                </span>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRedemptionForModal(resgate);
                              }}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all shadow-sm shrink-0 active:scale-[0.99] cursor-pointer ${
                                resgate.recurso?.status === 'em_analise'
                                  ? 'bg-sky-600 border border-sky-600 text-white hover:bg-sky-700'
                                  : resgate.status === 'recusado'
                                  ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                                  : resgate.link_ativacao
                                  ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                                  : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white'
                              }`}
                            >
                              {resgate.recurso?.status === 'em_analise' ? (
                                <>
                                  <FileText className="h-3.5 w-3.5" />
                                  <span>Analisar Recurso</span>
                                </>
                              ) : resgate.status === 'recusado' ? (
                                <>
                                  <X className="h-3.5 w-3.5" />
                                  <span>Ver Recusa</span>
                                </>
                              ) : (
                                <>
                                  <Link2 className="h-3.5 w-3.5" />
                                  <span>
                                    {resgate.status === 'analise' || (resgate.alerta_duplicidade && !isConcluido)
                                      ? 'Analisar Duplicidade'
                                      : resgate.link_ativacao
                                      ? 'Ver Detalhes / Alterar Link'
                                      : 'Inserir Link de Ativação'}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CommandSlideOver>

      {/* Modal Exclusivo de Detalhes do Resgate & Ativação de Parceiro */}
      <PartnerRedemptionDetailModal
        isOpen={Boolean(selectedRedemptionForModal)}
        onClose={() => setSelectedRedemptionForModal(null)}
        resgate={selectedRedemptionForModal}
        partner={selectedPartner}
        onSuccess={() => {
          if (selectedPartner?.id) {
            loadRedemptions(selectedPartner.id);
          }
        }}
      />

      {/* Modal de Confirmação de Exclusão de Parceiro */}
      {partnerToDelete && (
        <Modal
          isOpen={Boolean(partnerToDelete)}
          onClose={() => setPartnerToDelete(null)}
          title="Confirmar Exclusão de Parceiro"
          size="md"
        >
          <div className="space-y-4 p-1">
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-red-950">
              <div className="p-2 bg-red-100 rounded-xl text-red-600 shrink-0">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-red-950">
                  Deseja realmente excluir este parceiro comercial?
                </h4>
                <p className="text-xs text-red-800 leading-relaxed">
                  O parceiro <strong className="font-bold text-red-950">"{partnerToDelete.name}"</strong> será desativado e marcado como excluído. Ele não será mais exibido na página pública de parceiros nem nas pesquisas do GSA HUB.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPartnerToDelete(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = partnerToDelete;
                  setPartnerToDelete(null);
                  if (target) await handleDeletePartner(target);
                }}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition-colors"
              >
                Sim, Excluir Parceiro
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

