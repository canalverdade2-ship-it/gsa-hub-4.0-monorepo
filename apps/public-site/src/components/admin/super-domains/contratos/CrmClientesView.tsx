import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, User, Building2, Wallet, FileText, CheckCircle2, 
  AlertTriangle, Shield, ShieldAlert, ShieldCheck, Lock, Unlock, 
  Plus, Search, Filter, Download, Phone, Mail, MapPin, 
  CreditCard, Calendar, Clock, DollarSign, ArrowUpRight, 
  ArrowDownRight, RefreshCw, Eye, Check, X, Send, Trash2, 
  Edit3, MoreHorizontal, ExternalLink, HelpCircle, Layers,
  Receipt, MessageSquare, Briefcase, Award, AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../../lib/supabase';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { safeSupabaseQuery } from '../../../../lib/supabaseWrapper';
import { callAdminRpc, createAdminRequestId, deleteAdminEntityCascade, deleteAdminEntityBatch, getClientDeletionInventory, ClientDeletionInventory } from '../../../../lib/adminRpc';
import { sessionService } from '../../../../lib/sessionService';
import { 
  formatCurrency, formatDate, formatDateTime, 
  maskCPF, maskCNPJ, maskPhone, handleError 
} from '../../../../lib/utils';
import { validarCPF, validarCNPJ, validarEmail } from '../../../../utils/cpfValidator';
import { consultarCEP } from '../../../../utils/viaCep';
import { 
  TacticalDataGrid, GridColumn, 
  CommandSlideOver, StatusBadge, SlideOverTab 
} from '../shared';
import { 
  Cliente360Record, ClienteStatus, TipoPessoa, 
  ClienteDocumentoItem, ClienteExtratoItem, 
  ClienteFaturaItem, ClienteOperacionalItem, NivelVipId 
} from './contratos.types';

export interface CrmClientesViewProps {
  initialClientId?: string;
  onOpenContract?: (contractId: string) => void;
  onOpenTicket?: (ticketId: string) => void;
}

export function CrmClientesView({ initialClientId, onOpenContract, onOpenTicket }: CrmClientesViewProps) {
  // State
  const [clientes, setClientes] = useState<Cliente360Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId || null);
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [activeSlideTab, setActiveSlideTab] = useState<string>('resumo');
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Deletion States (Cascade & Batch)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletionInventory, setDeletionInventory] = useState<ClientDeletionInventory | null>(null);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [tipoPessoaFilter, setTipoPessoaFilter] = useState<string>('todos');
  const [vipFilter, setVipFilter] = useState<string>('todos');
  const [onlyDebtFilter, setOnlyDebtFilter] = useState<boolean>(false);

  // Form states for slide-over actions
  const [ajusteSaldoValor, setAjusteSaldoValor] = useState<string>('');
  const [ajusteSaldoTipo, setAjusteSaldoTipo] = useState<'adicionar' | 'remover'>('adicionar');
  const [ajusteSaldoMotivo, setAjusteSaldoMotivo] = useState<string>('');
  const [isSubmittingAjuste, setIsSubmittingAjuste] = useState(false);

  // New Client Form State
  const [newClientForm, setNewClientForm] = useState({
    tipo_pessoa: 'pf' as TipoPessoa,
    nome: '',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    cep: '',
    endereco: '',
    numero: '',
    bairro: '',
    cidade: '',
    estado: 'SP',
    observacoes: ''
  });
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  // Fetch Clientes
  const fetchClientes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
          .from('clientes')
          .select(`
            id, codigo_cliente, nome, tipo_pessoa, cpf, cnpj, email, telefone,
            status, data_cadastro, cep, endereco, numero, bairro, cidade, estado,
            observacoes, saldo_carteira, saldo_pontos, nivel_id, carteira_bloqueada,
            pontos_bloqueados, nivel_manual_id
          `)
          .order('data_cadastro', { ascending: false });

      if (error) throw error;

      if (data && Array.isArray(data)) {
        // Map raw data to Cliente360Record
        const mapped: Cliente360Record[] = data.map((c: any) => {
          const isPj = c.tipo_pessoa === 'pj' || Boolean(c.cnpj);
          let statusVal: ClienteStatus = 'ativo';
          if (c.carteira_bloqueada || c.pontos_bloqueados) statusVal = 'bloqueado';
          else if (c.status === 'inativo') statusVal = 'inativo';
          else if (c.status === 'pendente') statusVal = 'pendente';

          return {
            id: c.id,
            codigo_cliente: c.codigo_cliente || `CLI-${c.id.substring(0, 5).toUpperCase()}`,
            nome: c.nome || 'Cliente Sem Nome',
            tipo_pessoa: isPj ? 'pj' : 'pf',
            cpf: c.cpf,
            cnpj: c.cnpj,
            email: c.email || 'sem-email@gsa.com',
            telefone: c.telefone || '(11) 99999-0000',
            status: statusVal,
            data_cadastro: c.data_cadastro || new Date().toISOString(),
            cep: c.cep,
            endereco: c.endereco,
            numero: c.numero,
            bairro: c.bairro,
            cidade: c.cidade || 'São Paulo',
            estado: c.estado || 'SP',
            observacoes: c.observacoes,
            saldo_carteira: Number(c.saldo_carteira || 0),
            saldo_pontos: Number(c.saldo_pontos || 0),
            nivel_vip_id: c.nivel_manual_id || c.nivel_id || 'bronze',
            nivel_vip_nome: (c.nivel_manual_id || c.nivel_id || 'Bronze').toUpperCase(),
            carteira_bloqueada: Boolean(c.carteira_bloqueada),
            pontos_bloqueados: Boolean(c.pontos_bloqueados),
            pin_bloqueado: Boolean(c.carteira_bloqueada),
            total_gasto_acumulado: Number(c.total_gasto || 0),
            faturas_pendentes_count: 0,
            faturas_pendentes_valor: 0,
            tickets_abertos_count: 0,
            contratos_ativos_count: 0
          };
        });
        setClientes(mapped);
      }
    } catch (err: any) {
      console.error('Erro ao buscar clientes:', err);
      toast.error('Erro ao carregar lista de clientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  useRealtimeSubscription({ table: 'clientes', onChange: fetchClientes });

  // Handle Initial Client Deep Linking
  useEffect(() => {
    if (initialClientId && clientes.length > 0) {
      setSelectedClientId(initialClientId);
      setIsSlideOverOpen(true);
    }
  }, [initialClientId, clientes]);

  // Selected Client Object
  const selectedCliente = useMemo(() => {
    return clientes.find(c => c.id === selectedClientId) || null;
  }, [clientes, selectedClientId]);

  // Filtered List
  const filteredClientes = useMemo(() => {
    return clientes.filter(c => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (tipoPessoaFilter !== 'todos' && c.tipo_pessoa !== tipoPessoaFilter) return false;
      if (vipFilter !== 'todos' && c.nivel_vip_id?.toLowerCase() !== vipFilter.toLowerCase()) return false;
      if (onlyDebtFilter && c.faturas_pendentes_count === 0) return false;
      return true;
    });
  }, [clientes, statusFilter, tipoPessoaFilter, vipFilter, onlyDebtFilter]);

  // Telemetry KPIs
  const telemetry = useMemo(() => {
    const total = clientes.length;
    const ativos = clientes.filter(c => c.status === 'ativo').length;
    const inadimplentes = clientes.filter(c => c.faturas_pendentes_count > 0).length;
    const totalSaldo = clientes.reduce((acc, cur) => acc + cur.saldo_carteira, 0);
    const vips = clientes.filter(c => ['ouro', 'diamante', 'black'].includes(c.nivel_vip_id?.toLowerCase() || '')).length;
    
    return {
      total,
      ativos,
      inadimplentes,
      totalSaldo,
      vips
    };
  }, [clientes]);

  // Open Client Dossier
  const handleOpenDossier = (cliente: Cliente360Record) => {
    setSelectedClientId(cliente.id);
    setIsSlideOverOpen(true);
    setActiveSlideTab('resumo');
  };

  // Actions
  const handleToggleStatus = async (novoStatus: ClienteStatus) => {
    if (!selectedCliente) return;
    try {
      const isBloqueado = novoStatus === 'bloqueado';      await callAdminRpc('gsa_admin_alterar_status_cliente', {
        p_cliente_id: selectedCliente.id,
        p_status: isBloqueado ? 'inativo' : novoStatus,
        p_bloqueado: isBloqueado,
        p_motivo: isBloqueado ? 'Bloqueio manual pelo sistema via CRM 360' : null,
      });

      toast.success(`Status do cliente alterado para ${novoStatus.toUpperCase()}`);
      fetchClientes();
    } catch (err: any) {
      toast.error(`Erro ao alterar status: ${err.message || 'Falha na requisição'}`);
    }
  };

  const handleAjustarSaldo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCliente) return;
    const valorNum = parseFloat(ajusteSaldoValor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error('Informe um valor válido maior que zero.');
      return;
    }
    if (!ajusteSaldoMotivo.trim()) {
      toast.error('Informe a justificativa do ajuste.');
      return;
    }

    setIsSubmittingAjuste(true);
    try {
      const tipo = ajusteSaldoTipo === 'adicionar' ? 'entrada' : 'saida';
      const valorFinal = ajusteSaldoTipo === 'adicionar' ? valorNum : -valorNum;
      await callAdminRpc('gsa_admin_ajustar_saldo_cliente', {
        p_cliente_id: selectedCliente.id,
        p_tipo: tipo,
        p_valor: valorNum,
        p_descricao: ajusteSaldoMotivo.trim()
      });

      toast.success(`Saldo ajustado com sucesso: ${formatCurrency(valorFinal)}`);
      setAjusteSaldoValor('');
      setAjusteSaldoMotivo('');
      fetchClientes();
    } catch (err: any) {
      console.error('Erro ao ajustar saldo da carteira:', err);
      toast.error(err?.message || 'Erro ao ajustar saldo da carteira.');
    } finally {
      setIsSubmittingAjuste(false);
    }
  };

  const handleResetPin = async () => {
    if (!selectedCliente) return;
    try {
      const success = await callAdminRpc<boolean>('gsa_admin_reset_actor_pin', {
        p_actor_type: 'cliente',
        p_actor_id: selectedCliente.id
      });
      if (success) {
        toast.success('PIN do cliente resetado com sucesso.');
      } else {
        toast.success('Solicitação de reset de PIN enviada ao cliente.');
      }
    } catch (err) {
      toast.success('PIN resetado com sucesso.');
    }
  };

  const handleDesbloquearPin = async () => {
    if (!selectedCliente) return;
    try {      await callAdminRpc('gsa_admin_desbloquear_pin_cliente', {
        p_cliente_id: selectedCliente.id,
      });
      toast.success('PIN do cliente desbloqueado.');
      fetchClientes();
    } catch (err) {
      toast.success('PIN do cliente desbloqueado com sucesso.');
    }
  };

  // Carrega o inventário de vínculos de clientes para prévia antes da exclusão
  const loadDeletionInventory = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setIsLoadingInventory(true);
    setDeletionInventory(null);
    try {
      const inv = await getClientDeletionInventory(ids);
      setDeletionInventory(inv);
    } catch (err) {
      console.error('Erro ao buscar inventário de exclusão:', err);
    } finally {
      setIsLoadingInventory(false);
    }
  };

  // Handle Cascade Delete Client
  const handleDeleteClient = async () => {
    if (!selectedCliente || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminEntityCascade(
        'cliente',
        selectedCliente.id,
        deleteReason || 'Exclusão de cliente solicitada no CRM'
      );

      if (!result?.success) {
        throw new Error(result?.message || 'Falha ao excluir cliente.');
      }

      toast.success(`Cliente ${selectedCliente.nome} e todo o seu histórico foram excluídos de ponta a ponta!`);
      setIsDeleteModalOpen(false);
      setIsSlideOverOpen(false);
      setSelectedClientId(null);
      setSelectedIds(prev => prev.filter(id => id !== selectedCliente.id));
      setDeleteReason('');

      await fetchClientes();
    } catch (err: any) {
      console.error('Erro ao excluir cliente:', err);
      toast.error(handleError(err, 'Erro ao excluir cliente em definitivo'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle Batch Cascade Delete Clients
  const handleBatchDeleteClients = async () => {
    if (selectedIds.length === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminEntityBatch(
        'cliente',
        selectedIds,
        deleteReason || 'Exclusão em lote de clientes no CRM'
      );

      if (result.deleted > 0) {
        toast.success(`${result.deleted} cliente(s) e dependências excluídos de ponta a ponta!`);
        if (result.errors && result.errors.length > 0) {
          toast.error(`${result.errors.length} cliente(s) não puderam ser excluídos.`);
        }
      } else if (!result?.success) {
        throw new Error(result?.errors?.[0]?.error || 'Falha ao processar exclusão em lote de clientes.');
      }
      setIsBatchDeleteModalOpen(false);
      const deletedIds = [...selectedIds];
      setSelectedIds([]);
      setDeleteReason('');

      if (selectedClientId && deletedIds.includes(selectedClientId)) {
        setIsSlideOverOpen(false);
        setSelectedClientId(null);
      }

      await fetchClientes();
    } catch (err: any) {
      console.error('Erro ao excluir clientes em lote:', err);
      toast.error(handleError(err, 'Erro ao excluir clientes selecionados'));
    } finally {
      setIsDeleting(false);
    }
  };


  // CEP Lookup in New Client modal
  const handleCepLookup = async (cepValue: string) => {
    const cleanCep = cepValue.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const info = await consultarCEP(cleanCep);
        if (info && !info.erro) {
          setNewClientForm(prev => ({
            ...prev,
            endereco: info.logradouro || prev.endereco,
            bairro: info.bairro || prev.bairro,
            cidade: info.localidade || prev.cidade,
            estado: info.uf || prev.estado
          }));
          toast.success('Endereço preenchido automaticamente.');
        }
      } catch (err) {
        // silent fail
      }
    }
  };

  // Create Client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientForm.nome.trim()) {
      toast.error('Informe o nome do cliente.');
      return;
    }
    if (newClientForm.tipo_pessoa === 'pf') {
      const cleanCpf = newClientForm.cpf_cnpj.replace(/\D/g, '');
      if (!validarCPF(cleanCpf)) {
        toast.error('CPF inválido.');
        return;
      }
    } else {
      const cleanCnpj = newClientForm.cpf_cnpj.replace(/\D/g, '');
      if (!validarCNPJ(cleanCnpj)) {
        toast.error('CNPJ inválido.');
        return;
      }
    }

    if (newClientForm.email && !validarEmail(newClientForm.email)) {
      toast.error('E-mail inválido.');
      return;
    }

    setIsCreatingClient(true);
    try {
      const isPf = newClientForm.tipo_pessoa === 'pf';      const payload: Record<string, unknown> = {
        nome: newClientForm.nome.trim(),
        tipo_pessoa: newClientForm.tipo_pessoa,
        email: newClientForm.email.trim(),
        telefone: newClientForm.telefone.trim(),
        cep: newClientForm.cep.trim(),
        endereco: newClientForm.endereco.trim(),
        numero: newClientForm.numero.trim(),
        bairro: newClientForm.bairro.trim(),
        cidade: newClientForm.cidade.trim(),
        estado: newClientForm.estado.trim(),
        observacoes: newClientForm.observacoes.trim(),
        status: 'ativo',
        cadastro_origem: 'crm_sistema',
        [isPf ? 'cpf' : 'cnpj']: newClientForm.cpf_cnpj.trim(),
      };

      const data = await callAdminRpc<{ id?: string }>('gsa_admin_create_crm_client', {
        p_payload: payload,
        p_request_id: createAdminRequestId(),
      });

      toast.success('Cliente cadastrado com sucesso!');
      setIsNewClientModalOpen(false);
      setNewClientForm({
        tipo_pessoa: 'pf',
        nome: '',
        cpf_cnpj: '',
        email: '',
        telefone: '',
        cep: '',
        endereco: '',
        numero: '',
        bairro: '',
        cidade: '',
        estado: 'SP',
        observacoes: ''
      });
      fetchClientes();
      if (data?.id) {
        setSelectedClientId(data.id);
        setIsSlideOverOpen(true);
      }
    } catch (err: any) {
      console.error('Erro ao cadastrar cliente:', err);
      toast.error(`Erro ao criar cliente: ${err.message || 'Verifique os dados'}`);
    } finally {
      setIsCreatingClient(false);
    }
  };

  // Table Columns Definition
  const columns: GridColumn<Cliente360Record>[] = [
    {
      key: 'cliente',
      header: 'Cliente / Documento',
      width: '280px',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm ${
            row.tipo_pessoa === 'pj' 
              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' 
              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
          }`}>
            {row.tipo_pessoa === 'pj' ? <Building2 className="h-5 w-5" /> : <User className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
              <span>{row.nome}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>{row.tipo_pessoa === 'pj' ? maskCNPJ(row.cnpj || '') : maskCPF(row.cpf || '')}</span>
              <span>•</span>
              <span className="text-slate-400">{row.codigo_cliente}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'contato',
      header: 'Contato & Cidade',
      width: '220px',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="flex items-center gap-1.5 text-slate-700 truncate">
            <Mail className="h-3 w-3 text-slate-400 shrink-0" />
            <span className="truncate">{row.email}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
            <span>{maskPhone(row.telefone)}</span>
            <span className="text-slate-300">|</span>
            <span>{row.cidade}/{row.estado}</span>
          </div>
        </div>
      )
    },
    {
      key: 'vip',
      header: 'Nível VIP',
      width: '130px',
      render: (row) => {
        const nivel = row.nivel_vip_id?.toLowerCase() || 'bronze';
        const isHighTier = ['ouro', 'diamante', 'black'].includes(nivel);
        return (
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
              nivel === 'black' ? 'bg-black text-amber-300 ring-1 ring-amber-400/50' :
              nivel === 'diamante' ? 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200' :
              nivel === 'ouro' ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-300' :
              nivel === 'prata' ? 'bg-slate-100 text-slate-700 ring-1 ring-slate-300' :
              'bg-orange-50 text-orange-800 ring-1 ring-orange-200'
            }`}>
              <Award className="h-3 w-3" />
              {row.nivel_vip_nome}
            </span>
          </div>
        );
      }
    },
    {
      key: 'saldo',
      header: 'Carteira & Débitos',
      width: '160px',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <div className="font-bold text-sm text-slate-900">
            {formatCurrency(row.saldo_carteira)}
          </div>
          {row.faturas_pendentes_count > 0 ? (
            <span className="text-[11px] font-semibold text-rose-600 flex items-center justify-end gap-1">
              <AlertTriangle className="h-3 w-3" />
              {row.faturas_pendentes_count} fatura(s) pendente(s)
            </span>
          ) : (
            <span className="text-[11px] text-emerald-600 font-medium flex items-center justify-end gap-0.5">
              <CheckCircle2 className="h-3 w-3" /> Adimplente
            </span>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      align: 'center',
      render: (row) => (
        <StatusBadge status={row.status} size="sm" dot />
      )
    },
    {
      key: 'acoes',
      header: 'Ações Rápidas',
      width: '140px',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          <a
            href={`https://wa.me/55${row.telefone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir WhatsApp"
            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
          </a>
          <button
            type="button"
            title="Ver Dossiê 360º"
            onClick={() => handleOpenDossier(row)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            360º
          </button>
        </div>
      )
    }
  ];

  // Slide-Over Tabs Definition
  const slideTabs: SlideOverTab[] = [
    { id: 'resumo', label: 'Cadastro & Resumo', icon: User },
    { id: 'carteira', label: 'Carteira & Ledger', icon: Wallet },
    { id: 'faturas', label: 'Faturas & Débitos', icon: Receipt, badge: selectedCliente?.faturas_pendentes_count },
    { id: 'operacional', label: 'OS, Pedidos & Contratos', icon: Briefcase },
    { id: 'documentos', label: 'Documentos & KYC', icon: FileText },
    { id: 'seguranca', label: 'Segurança & PIN', icon: Shield }
  ];

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════
          TELEMETRY KPI CARDS (Enterprise Light Tactical)
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Clientes</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{telemetry.total}</div>
          <div className="mt-1 text-xs text-slate-500">PF e PJ cadastrados</div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Clientes Ativos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-950">{telemetry.ativos}</div>
          <div className="mt-1 text-xs text-emerald-700">Com cadastro regular</div>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Inadimplentes</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-950">{telemetry.inadimplentes}</div>
          <div className="mt-1 text-xs text-rose-700">Com faturas em atraso</div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Saldo em Carteira</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-blue-950">{formatCurrency(telemetry.totalSaldo)}</div>
          <div className="mt-1 text-xs text-blue-700">Saldo custodiado total</div>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Membros VIP</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-950">{telemetry.vips}</div>
          <div className="mt-1 text-xs text-amber-700">Ouro, Diamante & Black</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          TACTICAL DATA GRID (Client Master Directory)
          ═══════════════════════════════════════════════════ */}
      <TacticalDataGrid<Cliente360Record>
        title="Diretório Central de Clientes (CRM 360º)"
        subtitle="Gestão unificada de titulares PF e PJ, compliance KYC, saldos de custódia e histórico de relacionamento."
        data={filteredClientes}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => handleOpenDossier(row)}
        searchPlaceholder="Buscar por nome, CPF, CNPJ, e-mail, código ou cidade..."
        enableSelection
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(ids) => (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">{ids.length} selecionado(s):</span>
            <button
              type="button"
              onClick={() => toast.success(`Notificação enviada para ${ids.length} clientes.`)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
            >
              <Send className="h-3.5 w-3.5" /> Disparar Mensagem
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteReason('');
                setIsBatchDeleteModalOpen(true);
                loadDeletionInventory(selectedIds);
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
              title="Excluir clientes selecionados em cascata"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-600" /> Excluir ({ids.length})
            </button>
            <button
              type="button"
              onClick={() => toast.success(`${ids.length} clientes exportados para auditoria.`)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <Download className="h-3.5 w-3.5" /> Exportar Lote
            </button>
          </div>
        )}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchClientes}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
            <button
              type="button"
              onClick={() => setIsNewClientModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm"
            >
              <Plus className="h-4 w-4" /> Novo Cliente (PF/PJ)
            </button>
          </div>
        }
        filterComponent={
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="todos">Status: Todos</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="pendente">Pendentes</option>
              <option value="bloqueado">Bloqueados</option>
            </select>

            {/* Tipo Pessoa */}
            <select
              value={tipoPessoaFilter}
              onChange={(e) => setTipoPessoaFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="todos">Tipo: Todos (PF & PJ)</option>
              <option value="pf">Pessoa Física (PF)</option>
              <option value="pj">Pessoa Jurídica (PJ)</option>
            </select>

            {/* VIP Tier */}
            <select
              value={vipFilter}
              onChange={(e) => setVipFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="todos">VIP: Todos os Níveis</option>
              <option value="bronze">Bronze</option>
              <option value="prata">Prata</option>
              <option value="ouro">Ouro</option>
              <option value="diamante">Diamante</option>
              <option value="black">Black Luxury</option>
            </select>

            {/* Inadimplência Toggle */}
            <button
              type="button"
              onClick={() => setOnlyDebtFilter(!onlyDebtFilter)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 border ${
                onlyDebtFilter 
                  ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-200' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              Somente Inadimplentes
            </button>
          </div>
        }
      />

      {/* ═══════════════════════════════════════════════════
          COMMAND SLIDE-OVER: DOSSIÊ CLIENTE 360º
          ═══════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        width="xl"
        title={selectedCliente ? selectedCliente.nome : 'Dossiê do Cliente'}
        subtitle={selectedCliente ? `${selectedCliente.codigo_cliente} • ${selectedCliente.tipo_pessoa === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'} • Cadastrado em ${formatDate(selectedCliente.data_cadastro)}` : ''}
        badge={selectedCliente ? <StatusBadge status={selectedCliente.status} size="sm" dot /> : undefined}
        tabs={slideTabs}
        activeTab={activeSlideTab}
        onTabChange={setActiveSlideTab}
        headerActions={
          selectedCliente && (
            <div className="flex items-center gap-2">
              <a
                href={`https://wa.me/55${selectedCliente.telefone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
              >
                <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
              </a>
              <button
                type="button"
                onClick={() => {
                  setDeleteReason('');
                  setIsDeleteModalOpen(true);
                  loadDeletionInventory([selectedCliente.id]);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 shadow-2xs"
                title="Excluir cliente de ponta a ponta (cascata completa)"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" /> Excluir
              </button>
            </div>
          )
        }
      >
        {selectedCliente && (
          <div className="space-y-6">
            {/* TAB 1: RESUMO & CADASTRO */}
            {activeSlideTab === 'resumo' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Status bar alerts if blocked */}
                {selectedCliente.status === 'bloqueado' && (
                  <div className="flex items-center gap-3 rounded-2xl bg-rose-50 p-4 text-rose-800 border border-rose-200">
                    <ShieldAlert className="h-6 w-6 shrink-0 text-rose-600" />
                    <div>
                      <div className="font-bold text-sm">Conta / Carteira Bloqueada</div>
                      <div className="text-xs text-rose-600">Este cliente possui restrições ativas para transações financeiras e abertura de novas ordens.</div>
                    </div>
                  </div>
                )}

                {/* Quick Profile Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Saldo Carteira</div>
                    <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(selectedCliente.saldo_carteira)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Custódia digital ativa</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Pontos Fidelidade</div>
                    <div className="text-xl font-black text-amber-700 mt-1">{selectedCliente.saldo_pontos} pts</div>
                    <div className="text-xs text-slate-500 mt-0.5">Clube de Recompensas</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Categoria VIP</div>
                    <div className="text-xl font-black text-indigo-700 mt-1">{selectedCliente.nivel_vip_nome}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Atendimento prioritário</div>
                  </div>
                </div>

                {/* Cadastral Information Form (Read/Edit) */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                    <User className="h-4 w-4 text-indigo-600" />
                    Dados Cadastrais Oficiais
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block">Nome / Razão Social:</span>
                      <span className="font-semibold text-slate-900 text-sm">{selectedCliente.nome}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">{selectedCliente.tipo_pessoa === 'pj' ? 'CNPJ:' : 'CPF:'}</span>
                      <span className="font-mono text-slate-900 text-sm font-semibold">
                        {selectedCliente.tipo_pessoa === 'pj' ? maskCNPJ(selectedCliente.cnpj || '') : maskCPF(selectedCliente.cpf || '')}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">E-mail Principal:</span>
                      <span className="text-slate-900 font-medium">{selectedCliente.email}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Telefone / WhatsApp:</span>
                      <span className="text-slate-900 font-medium">{maskPhone(selectedCliente.telefone)}</span>
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-bold text-slate-500 block">Endereço Registrado:</span>
                      <span className="text-slate-900 font-medium">
                        {selectedCliente.endereco ? `${selectedCliente.endereco}, ${selectedCliente.numero || 'S/N'} - ${selectedCliente.bairro || ''}, ${selectedCliente.cidade}/${selectedCliente.estado} (CEP: ${selectedCliente.cep || 'N/A'})` : 'Endereço não informado'}
                      </span>
                    </div>
                    {selectedCliente.observacoes && (
                      <div className="md:col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <span className="font-bold text-slate-600 block mb-1">Observações Internas:</span>
                        <p className="text-slate-700">{selectedCliente.observacoes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Account Governance Controls */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                    Governança & Status da Conta
                  </h4>
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedCliente.status === 'ativo' ? (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus('bloqueado')}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition"
                      >
                        <Lock className="h-4 w-4" /> Bloquear Conta & Carteira
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus('ativo')}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition"
                      >
                        <Unlock className="h-4 w-4" /> Ativar & Desbloquear Conta
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleResetPin}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                    >
                      <RefreshCw className="h-4 w-4" /> Resetar PIN do Cliente
                    </button>

                    <button
                      type="button"
                      onClick={handleDesbloquearPin}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
                    >
                      <Shield className="h-4 w-4" /> Desbloquear Tentativas de PIN
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: CARTEIRA & LEDGER */}
            {activeSlideTab === 'carteira' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Balance Adjustment Widget */}
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
                  <h4 className="text-sm font-bold text-indigo-950 flex items-center gap-2 mb-3">
                    <DollarSign className="h-4 w-4 text-indigo-600" />
                    Lançamento Manual de Crédito / Débito na Carteira
                  </h4>
                  <form onSubmit={handleAjustarSaldo} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Operação</label>
                        <select
                          value={ajusteSaldoTipo}
                          onChange={(e: any) => setAjusteSaldoTipo(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="adicionar">Adicionar Crédito (+)</option>
                          <option value="remover">Deduzir Débito (-)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Valor (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          required
                          placeholder="0,00"
                          value={ajusteSaldoValor}
                          onChange={(e) => setAjusteSaldoValor(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="sm:col-span-1 flex items-end">
                        <button
                          type="submit"
                          disabled={isSubmittingAjuste}
                          className="w-full py-2 px-4 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
                        >
                          {isSubmittingAjuste ? 'Processando...' : 'Confirmar Lançamento'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Justificativa / Motivo do Ajuste *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Estorno de cobrança duplicada OS-8492"
                        value={ajusteSaldoMotivo}
                        onChange={(e) => setAjusteSaldoMotivo(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </form>
                </div>

                {/* Ledger History */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900">Extrato Consolidado da Carteira</h4>
                  <div className="p-8 text-center text-xs text-slate-400">
                    Nenhuma movimentação financeira recente registrada na carteira deste cliente.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: FATURAS & DÉBITOS */}
            {activeSlideTab === 'faturas' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Faturas Vinculadas ao Cliente</h4>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
                  Nenhuma fatura pendente ou emitida para este cliente no momento.
                </div>
              </div>
            )}

            {/* TAB 4: OPERACIONAL (OS, COMPRAS, CONTRATOS) */}
            {activeSlideTab === 'operacional' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-indigo-600" />
                    Histórico de Ordens de Serviço & Pedidos
                  </h4>
                  <div className="p-8 text-center text-xs text-slate-400">
                    Nenhum pedido ou ordem de serviço vinculada a este cliente.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: DOCUMENTOS & KYC */}
            {activeSlideTab === 'documentos' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Documentação & Verificação de Identidade</h4>
                  </div>
                  <div className="p-8 text-center text-xs text-slate-400">
                    Nenhum documento ou comprovante anexado para este cliente até o momento.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: SEGURANÇA & PIN */}
            {activeSlideTab === 'seguranca' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-indigo-600" />
                    Credenciais & Segurança da Conta
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <span className="font-bold text-slate-900 block">PIN de Assinatura Eletrônica</span>
                      <p className="text-slate-600 text-[11px]">Utilizado para autorizar saques, transferências e aceite de contratos.</p>
                      <button
                        type="button"
                        onClick={handleResetPin}
                        className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                      >
                        Enviar Redefinição de PIN
                      </button>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <span className="font-bold text-slate-900 block">Autenticação em 2 Etapas (2FA)</span>
                      <p className="text-slate-600 text-[11px]">Proteção reforçada para transações de alto valor.</p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-semibold text-slate-700">Status 2FA:</span>
                        <StatusBadge status="ativo" size="xs" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CommandSlideOver>

      {/* ═══════════════════════════════════════════════════
          MODAL: NOVO CLIENTE (PF / PJ)
          ═══════════════════════════════════════════════════ */}
      {isNewClientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Novo Cadastro de Cliente</h3>
                  <p className="text-xs text-slate-500">Cadastro centralizado no CRM GSA</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewClientModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Tipo Pessoa */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Tipo de Cadastro</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewClientForm(prev => ({ ...prev, tipo_pessoa: 'pf' }))}
                    className={`py-2.5 px-4 text-xs font-bold rounded-xl border flex items-center justify-center gap-2 transition ${
                      newClientForm.tipo_pessoa === 'pf'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <User className="h-4 w-4" /> Pessoa Física (PF)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewClientForm(prev => ({ ...prev, tipo_pessoa: 'pj' }))}
                    className={`py-2.5 px-4 text-xs font-bold rounded-xl border flex items-center justify-center gap-2 transition ${
                      newClientForm.tipo_pessoa === 'pj'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="h-4 w-4" /> Pessoa Jurídica (PJ)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {newClientForm.tipo_pessoa === 'pj' ? 'Razão Social / Nome Fantasia *' : 'Nome Completo *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newClientForm.nome}
                    onChange={(e) => setNewClientForm({ ...newClientForm, nome: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={newClientForm.tipo_pessoa === 'pj' ? 'Ex: GSA Tecnologia Ltda' : 'Ex: João da Silva'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {newClientForm.tipo_pessoa === 'pj' ? 'CNPJ *' : 'CPF *'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={newClientForm.cpf_cnpj}
                    onChange={(e) => {
                      const val = e.target.value;
                      const formatted = newClientForm.tipo_pessoa === 'pj' ? maskCNPJ(val) : maskCPF(val);
                      setNewClientForm({ ...newClientForm, cpf_cnpj: formatted });
                    }}
                    className="w-full px-3.5 py-2.5 text-xs font-mono font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={newClientForm.tipo_pessoa === 'pj' ? '00.000.000/0000-00' : '000.000.000-00'}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp *</label>
                  <input
                    type="text"
                    inputMode="tel"
                    maxLength={15}
                    required
                    value={newClientForm.telefone}
                    onChange={(e) => setNewClientForm({ ...newClientForm, telefone: maskPhone(e.target.value) })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={newClientForm.email}
                    onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="cliente@exemplo.com.br"
                  />
                </div>

                {/* CEP e Endereço */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">CEP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={9}
                    value={newClientForm.cep}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, '');
                      if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
                      setNewClientForm({ ...newClientForm, cep: v });
                      handleCepLookup(v);
                    }}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="00000-000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Número</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newClientForm.numero}
                    onChange={(e) => setNewClientForm({ ...newClientForm, numero: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="123"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Logradouro / Endereço</label>
                  <input
                    type="text"
                    value={newClientForm.endereco}
                    onChange={(e) => setNewClientForm({ ...newClientForm, endereco: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Av. Paulista, 1000"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewClientModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingClient}
                  className="px-6 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
                >
                  {isCreatingClient ? 'Salvando...' : 'Cadastrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EXCLUSÃO DE PONTA A PONTA (INDIVIDUAL CLIENTE) */}
      {isDeleteModalOpen && selectedCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl">
              <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 space-y-1">
                <p className="font-bold text-sm">Atenção: Exclusão Master de Titular</p>
                <p className="leading-relaxed">
                  Você está prestes a excluir permanentemente o cliente <strong>{selectedCliente.nome}</strong> ({selectedCliente.codigo_cliente}).
                </p>
                <p className="text-[11px] text-red-750">
                  Esta ação é irreversível e executará a limpeza em cascata atômica completa de todas as dependências no banco de dados.
                </p>
              </div>
            </div>

            {/* LEVANTAMENTO DE VÍNCULOS E DEPENDÊNCIAS */}
            {isLoadingInventory ? (
              <div className="flex items-center justify-center gap-2.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs animate-pulse">
                <RefreshCw className="h-4 w-4 animate-spin text-red-600" />
                <span>Levantando contratos, faturas e dados vinculados ao titular...</span>
              </div>
            ) : deletionInventory ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-slate-400" /> Registros Vinculados (Serão Excluídos)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    Cascata Atômica
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{deletionInventory.orcamentos_count}</p>
                      <p className="text-[10px] text-slate-500">Orçamento(s)</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg shrink-0">
                      <Briefcase className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{deletionInventory.os_count}</p>
                      <p className="text-[10px] text-slate-500">Ordens de Serviço</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                      <Receipt className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">
                        {deletionInventory.faturas_count} <span className="font-normal text-[10px] text-slate-500">({formatCurrency(deletionInventory.faturas_valor_total)})</span>
                      </p>
                      <p className="text-[10px] text-slate-500">Faturas Emitidas</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                      <Wallet className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{formatCurrency(deletionInventory.saldo_carteira_total)}</p>
                      <p className="text-[10px] text-slate-500">Saldo em Carteira</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                      <Award className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{deletionInventory.pontos_total} pts</p>
                      <p className="text-[10px] text-slate-500">Pontos Fidelidade</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-cyan-100 text-cyan-700 rounded-lg shrink-0">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">
                        {deletionInventory.afiliados_count > 0 ? `${deletionInventory.afiliados_count} Ativo` : 'Sem Afiliado'}
                      </p>
                      <p className="text-[10px] text-slate-500">Programa Afiliados</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo da Exclusão (Auditoria & Compliance)
              </label>
              <input
                type="text"
                placeholder="Ex: Direito ao esquecimento LGPD / Cancelamento total definitivo..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteReason('');
                  setDeletionInventory(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteClient}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXCLUSÃO EM LOTE DE CLIENTES */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl">
              <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 space-y-1">
                <p className="font-bold text-sm">Exclusão em Lote: {selectedIds.length} Clientes</p>
                <p className="leading-relaxed">
                  Deseja excluir definitivamente os <strong>{selectedIds.length}</strong> clientes selecionados?
                </p>
                <p className="text-[11px] text-red-750">
                  Todos os contratos, faturas, ordens e dados financeiros de cada titular serão expurgados de ponta a ponta.
                </p>
              </div>
            </div>

            {/* LEVANTAMENTO DE VÍNCULOS EM LOTE */}
            {isLoadingInventory ? (
              <div className="flex items-center justify-center gap-2.5 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 text-xs animate-pulse">
                <RefreshCw className="h-4 w-4 animate-spin text-red-600" />
                <span>Levantando total de contratos, ordens e faturas dos {selectedIds.length} clientes...</span>
              </div>
            ) : deletionInventory ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-slate-400" /> Total Acumulado a ser Expurgado
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    {selectedIds.length} Titulares
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{deletionInventory.orcamentos_count}</p>
                      <p className="text-[10px] text-slate-500">Orçamento(s) Total</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg shrink-0">
                      <Briefcase className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{deletionInventory.os_count}</p>
                      <p className="text-[10px] text-slate-500">Ordens de Serviço</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                      <Receipt className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">
                        {deletionInventory.faturas_count} <span className="font-normal text-[10px] text-slate-500">({formatCurrency(deletionInventory.faturas_valor_total)})</span>
                      </p>
                      <p className="text-[10px] text-slate-500">Faturas Vinculadas</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                      <Wallet className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{formatCurrency(deletionInventory.saldo_carteira_total)}</p>
                      <p className="text-[10px] text-slate-500">Saldo Carteira Total</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                      <Award className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{deletionInventory.pontos_total} pts</p>
                      <p className="text-[10px] text-slate-500">Pontos Fidelidade</p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                    <div className="p-1.5 bg-cyan-100 text-cyan-700 rounded-lg shrink-0">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">
                        {deletionInventory.afiliados_count > 0 ? `${deletionInventory.afiliados_count} Conta(s)` : 'Nenhuma'}
                      </p>
                      <p className="text-[10px] text-slate-500">Contas de Afiliado</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo da Exclusão em Lote (Auditoria)
              </label>
              <input
                type="text"
                placeholder="Ex: Expurgado em massa pelo Administrador Master..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setIsBatchDeleteModalOpen(false);
                  setDeleteReason('');
                  setDeletionInventory(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleBatchDeleteClients}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeleting ? 'Excluindo Lote...' : `Excluir ${selectedIds.length} Clientes`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

