import React, { useState, useEffect, useCallback } from 'react';
import { 
  Gift, Ticket, Percent, RefreshCcw, 
  Plus, RefreshCw, Eye, Sparkles, Tag, Edit, Trash2, Copy,
  Ban, Play
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn, StatusBadge, CommandSlideOver } from '../shared';
import { supabase } from '../../../../lib/supabase';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { formatCurrency, formatDate, formatDateTime, maskCPF } from '../../../../lib/utils';
import { logService } from '../../../../lib/logService';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

type LoyaltySubTab = 'premios' | 'vouchers' | 'cupons' | 'trocas' | 'indicacoes';

export interface FidelidadePromocoesSectionProps {
  initialSubTab?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function FidelidadePromocoesSection({
  initialSubTab,
  colaboradorId,
  colaboradorNome
}: FidelidadePromocoesSectionProps) {
  const [activeTab, setActiveTab] = useState<LoyaltySubTab>((initialSubTab as any) || 'premios');

  const [premios, setPremios] = useState<any[]>([]);
  const [loadingPremios, setLoadingPremios] = useState(true);

  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(true);

  const [cupons, setCupons] = useState<any[]>([]);
  const [loadingCupons, setLoadingCupons] = useState(true);

  const [trocas, setTrocas] = useState<any[]>([]);
  const [loadingTrocas, setLoadingTrocas] = useState(true);

  const [indicacoes, setIndicacoes] = useState<any[]>([]);
  const [loadingIndicacoes, setLoadingIndicacoes] = useState(true);

  const [selectedVoucher, setSelectedVoucher] = useState<any | null>(null);
  const [isVoucherDetailsOpen, setIsVoucherDetailsOpen] = useState(false);
  const [isVoucherFormOpen, setIsVoucherFormOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<any | null>(null);
  const [voucherForm, setVoucherForm] = useState({
    codigo_voucher: '',
    nome: '',
    tipo: 'porcentagem' as 'porcentagem' | 'fixo',
    valor: 10,
    categoria: 'desconto',
    usage_limit: 1,
    validade: '',
    cpf_cliente: '',
    status: 'ativo'
  });
  const [savingVoucher, setSavingVoucher] = useState(false);

  const [selectedCoupon, setSelectedCoupon] = useState<any | null>(null);
  const [isCouponDetailsOpen, setIsCouponDetailsOpen] = useState(false);
  const [isCouponFormOpen, setIsCouponFormOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any | null>(null);
  const [couponForm, setCouponForm] = useState({
    codigo_cupom: '',
    nome_cupom: '',
    categoria_cupom: 'desconto',
    tipo_desconto: 'porcentagem' as 'porcentagem' | 'fixo',
    valor_desconto: 10,
    tipo_entrega: 'nenhum',
    valor_minimo_compra: '',
    limite_usos: 1,
    data_validade: '',
    status: 'ativo'
  });
  const [savingCoupon, setSavingCoupon] = useState(false);

  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [pointsClientDoc, setPointsClientDoc] = useState('');
  const [pointsDelta, setPointsDelta] = useState('');
  const [pointsReason, setPointsReason] = useState('');

  const fetchPremios = useCallback(async () => {
    try {
      setLoadingPremios(true);
      const { data, error } = await supabase
        .from('cliente_premios')
        .select(`*, cliente:clientes(nome, email, cpf, cnpj)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPremios(data || []);
    } catch (err) {
      console.error('Erro ao buscar prêmios:', err);
    } finally {
      setLoadingPremios(false);
    }
  }, []);

  const fetchVouchers = useCallback(async () => {
    try {
      setLoadingVouchers(true);
      const { data, error } = await supabase
        .from('vouchers')
        .select(`*, cliente:clientes(nome, email, cpf)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setVouchers(data || []);
    } catch (err) {
      console.error('Erro ao buscar vouchers:', err);
    } finally {
      setLoadingVouchers(false);
    }
  }, []);

  const fetchCupons = useCallback(async () => {
    try {
      setLoadingCupons(true);
      const { data, error } = await supabase
        .from('cupons_loja')
        .select(`*, cliente:clientes(nome, email)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCupons(data || []);
    } catch (err) {
      console.error('Erro ao buscar cupons:', err);
    } finally {
      setLoadingCupons(false);
    }
  }, []);

  const fetchTrocas = useCallback(async () => {
    try {
      setLoadingTrocas(true);
      const { data, error } = await supabase
        .from('loja_solicitacoes')
        .select(`*, cliente:clientes(nome, email)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTrocas(data || []);
    } catch (err) {
      console.error('Erro ao buscar trocas:', err);
    } finally {
      setLoadingTrocas(false);
    }
  }, []);

  const fetchIndicacoes = useCallback(async () => {
    try {
      setLoadingIndicacoes(true);
      const { data, error } = await supabase
        .from('indicacoes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIndicacoes(data || []);
    } catch (err) {
      console.error('Erro ao buscar indicações:', err);
    } finally {
      setLoadingIndicacoes(false);
    }
  }, []);

  useEffect(() => {
    fetchPremios();
    fetchVouchers();
    fetchCupons();
    fetchTrocas();
    fetchIndicacoes();
  }, [fetchPremios, fetchVouchers, fetchCupons, fetchTrocas, fetchIndicacoes]);

  useRealtimeSubscription([
    { table: 'vouchers', onChange: () => { fetchVouchers(); fetchPremios(); } },
    { table: 'cliente_premios', onChange: () => fetchPremios() },
    { table: 'pontos_movimentacoes', onChange: () => { fetchPremios(); fetchIndicacoes(); } },
    { table: 'cupons_loja', onChange: () => fetchCupons() },
    { table: 'loja_solicitacoes', onChange: () => fetchTrocas() },
    { table: 'indicacoes', onChange: () => fetchIndicacoes() }
  ]);

  const handleCopy = (text: string, label = 'Código') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const generateVoucherCode = () => `VCH-${Math.floor(10000000 + Math.random() * 90000000)}`;

  const generateCouponCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let res = 'CUPOM-';
    for (let i = 0; i < 6; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
  };

  const handleOpenNewVoucher = () => {
    setEditingVoucher(null);
    setVoucherForm({
      codigo_voucher: generateVoucherCode(),
      nome: '',
      tipo: 'porcentagem',
      valor: 10,
      categoria: 'desconto',
      usage_limit: 1,
      validade: '',
      cpf_cliente: '',
      status: 'ativo'
    });
    setIsVoucherFormOpen(true);
  };

  const handleOpenEditVoucher = (voucher: any) => {
    setEditingVoucher(voucher);
    setVoucherForm({
      codigo_voucher: voucher.codigo_voucher || voucher.codigo || '',
      nome: voucher.nome || '',
      tipo: voucher.tipo || 'porcentagem',
      valor: voucher.valor || 0,
      categoria: voucher.categoria || 'desconto',
      usage_limit: voucher.usage_limit || 1,
      validade: voucher.validade ? voucher.validade.slice(0, 10) : '',
      cpf_cliente: voucher.cliente?.cpf || '',
      status: voucher.status || 'ativo'
    });
    setIsVoucherDetailsOpen(false);
    setIsVoucherFormOpen(true);
  };

  const handleSaveVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherForm.codigo_voucher.trim()) { toast.error('Informe o código do voucher.'); return; }
    if (voucherForm.valor <= 0) { toast.error('Informe um valor válido.'); return; }
    setSavingVoucher(true);
    const toastId = toast.loading(editingVoucher ? 'Atualizando...' : 'Criando...');
    try {
      let clienteId: string | null = null;
      if (voucherForm.cpf_cliente.trim()) {
        const { data: client } = await supabase.from('clientes').select('id').eq('cpf', voucherForm.cpf_cliente.replace(/\D/g, '')).maybeSingle();
        if (client) clienteId = client.id;
      }
      const payload: any = {
        codigo_voucher: voucherForm.codigo_voucher.trim().toUpperCase(),
        nome: voucherForm.nome.trim() || 'Voucher',
        tipo: voucherForm.tipo,
        valor: Number(voucherForm.valor),
        categoria: voucherForm.categoria,
        usage_limit: Number(voucherForm.usage_limit),
        validade: voucherForm.validade || null,
        cliente_id: clienteId,
        status: voucherForm.status
      };
      if (editingVoucher) {
        await supabase.from('vouchers').update(payload).eq('id', editingVoucher.id);
        toast.success('Atualizado!', { id: toastId });
      } else {
        payload.usage_count = 0;
        await supabase.from('vouchers').insert([payload]);
        toast.success('Emitido!', { id: toastId });
      }
      setIsVoucherFormOpen(false);
      fetchVouchers();
    } catch (err: any) {
      toast.error(`Falha: ${err.message}`, { id: toastId });
    } finally {
      setSavingVoucher(false);
    }
  };

  const handleToggleVoucherStatus = async (voucher: any) => {
    const newStatus = voucher.status === 'ativo' ? 'cancelado' : 'ativo';
    try {
      await supabase.from('vouchers').update({ status: newStatus }).eq('id', voucher.id);
      toast.success(`Status alterado para ${newStatus}`);
      fetchVouchers();
      if (selectedVoucher?.id === voucher.id) setSelectedVoucher({ ...selectedVoucher, status: newStatus });
    } catch (err: any) {
      toast.error('Erro ao alterar status');
    }
  };

  const handleDeleteVoucher = async (voucher: any) => {
    if (!window.confirm('Excluir este voucher?')) return;
    try {
      await supabase.from('vouchers').delete().eq('id', voucher.id);
      toast.success('Excluído');
      setIsVoucherDetailsOpen(false);
      fetchVouchers();
    } catch (err: any) {
      toast.error('Erro ao excluir');
    }
  };

  const handleOpenNewCoupon = () => {
    setEditingCoupon(null);
    setCouponForm({
      codigo_cupom: generateCouponCode(),
      nome_cupom: '',
      categoria_cupom: 'desconto',
      tipo_desconto: 'porcentagem',
      valor_desconto: 10,
      tipo_entrega: 'nenhum',
      valor_minimo_compra: '',
      limite_usos: 5,
      data_validade: '',
      status: 'ativo'
    });
    setIsCouponFormOpen(true);
  };

  const handleOpenEditCoupon = (coupon: any) => {
    setEditingCoupon(coupon);
    setCouponForm({
      codigo_cupom: coupon.codigo_cupom || coupon.codigo || '',
      nome_cupom: coupon.nome_cupom || '',
      categoria_cupom: coupon.categoria_cupom || 'desconto',
      tipo_desconto: coupon.tipo_desconto || 'porcentagem',
      valor_desconto: coupon.valor_desconto || 0,
      tipo_entrega: coupon.tipo_entrega || 'nenhum',
      valor_minimo_compra: coupon.valor_minimo_compra ? String(coupon.valor_minimo_compra) : '',
      limite_usos: coupon.limite_usos || 1,
      data_validade: coupon.data_validade ? coupon.data_validade.slice(0, 10) : '',
      status: coupon.status || 'ativo'
    });
    setIsCouponDetailsOpen(false);
    setIsCouponFormOpen(true);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCoupon(true);
    const toastId = toast.loading('Salvando...');
    try {
      const payload: any = {
        codigo_cupom: couponForm.codigo_cupom.trim().toUpperCase(),
        nome_cupom: couponForm.nome_cupom.trim() || 'Cupom',
        categoria_cupom: couponForm.categoria_cupom,
        tipo_desconto: couponForm.categoria_cupom === 'entrega' ? null : couponForm.tipo_desconto,
        valor_desconto: couponForm.categoria_cupom === 'entrega' ? null : Number(couponForm.valor_desconto),
        tipo_entrega: couponForm.categoria_cupom === 'entrega' ? couponForm.tipo_entrega : null,
        valor_minimo_compra: couponForm.valor_minimo_compra ? Number(couponForm.valor_minimo_compra) : null,
        limite_usos: Number(couponForm.limite_usos),
        data_validade: couponForm.data_validade || null,
        status: couponForm.status
      };
      if (!editingCoupon) payload.total_usos = 0;
      await callAdminRpc('gsa_admin_save_store_coupon', {
        p_cupom_id: editingCoupon?.id || null,
        p_payload: payload,
      });
      toast.success('Salvo com sucesso!', { id: toastId });
      setIsCouponFormOpen(false);
      fetchCupons();
    } catch (err: any) {
      toast.error('Erro ao salvar', { id: toastId });
    } finally {
      setSavingCoupon(false);
    }
  };

  const handleDeleteCoupon = async (coupon: any) => {
    if (!window.confirm('Excluir este cupom?')) return;
    try {
      await callAdminRpc('gsa_admin_delete_store_coupon', { p_cupom_id: coupon.id });
      toast.success('Excluído');
      setIsCouponDetailsOpen(false);
      fetchCupons();
    } catch (err: any) {
      toast.error('Erro ao excluir');
    }
  };

  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDoc = pointsClientDoc.replace(/\D/g, '');
    const pts = parseInt(pointsDelta, 10);
    if (!cleanDoc || isNaN(pts) || !pointsReason.trim()) {
      toast.error('Preencha todos os campos.');
      return;
    }
    const toastId = toast.loading('Ajustando...');
    try {
      const { data: client } = await supabase.from('clientes').select('id, nome').eq('cpf', cleanDoc).maybeSingle();
      if (!client) throw new Error('Cliente não encontrado');
      await callAdminRpc('gsa_admin_adjust_points', { p_cliente_id: client.id, p_pontos: pts, p_motivo: pointsReason });
      await logService.logAction({ ator_tipo: 'admin', ator_id: colaboradorId || 'admin', ator_nome: colaboradorNome || 'Admin', acao: 'AJUSTAR_PONTOS', detalhes: `Ajustou ${pts} pts para ${client.nome}` });
      toast.success('Sucesso!', { id: toastId });
      setIsPointsModalOpen(false);
      setPointsClientDoc(''); setPointsDelta(''); setPointsReason('');
      fetchPremios();
    } catch (err: any) {
      toast.error(`Falha: ${err.message}`, { id: toastId });
    }
  };

  const premiosColumns: GridColumn<any>[] = [
    {
      key: 'premio',
      header: 'Prêmio / Código',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900">{row.nome || row.premio_nome || 'Prêmio Fidelidade'}</div>
          <div className="font-mono text-[11px] text-slate-500">
            Código: <span className="font-bold text-slate-700">{row.codigo_premio || row.codigo || `#${row.id.slice(0, 6).toUpperCase()}`}</span>
          </div>
        </div>
      )
    },
    {
      key: 'cliente',
      header: 'Cliente / Beneficiário',
      render: (row) => (
        <div className="text-xs text-slate-800">
          <div className="font-bold">{row.cliente?.nome || row.cliente_nome || 'Cliente'}</div>
          <div className="text-[11px] text-slate-500">{row.cliente?.cpf || row.cliente?.email || '—'}</div>
        </div>
      )
    },
    {
      key: 'pontos',
      header: 'Pontos Resgatados',
      sortable: true,
      align: 'right',
      width: '150px',
      render: (row) => (
        <div className="font-mono font-bold text-amber-600">
          {Number(row.pontos_resgatados || row.pontos_necessarios || 0).toLocaleString('pt-BR')} pts
        </div>
      )
    },
    {
      key: 'created_at',
      header: 'Data de Resgate',
      sortable: true,
      width: '140px',
      render: (row) => (
        <div className="text-xs text-slate-600 font-mono">
          {formatDate(row.created_at)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '130px',
      render: (row) => <StatusBadge status={row.status || 'ativo'} size="sm" />
    }
  ];

  const voucherColumns: GridColumn<any>[] = [
    {
      key: 'codigo_voucher',
      header: 'Código do Voucher',
      sortable: true,
      render: (row) => {
        const code = row.codigo_voucher || row.codigo || row.id.slice(0, 8);
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Tag className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-slate-900 text-xs">{code}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCopy(code, 'Código do voucher'); }}
                  className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                  title="Copiar código"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">{row.nome || 'Voucher de Desconto'}</div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'valor',
      header: 'Valor do Desconto',
      sortable: true,
      align: 'right',
      width: '150px',
      render: (row) => {
        const isPercent = row.tipo === 'porcentagem';
        return (
          <div className="text-right">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${
              isPercent ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            }`}>
              {isPercent ? `${row.valor}% OFF` : formatCurrency(row.valor || 0)}
            </span>
          </div>
        );
      }
    },
    {
      key: 'cliente',
      header: 'Atribuído a',
      render: (row) => (
        <div className="text-xs text-slate-700">
          {row.cliente?.nome ? (
            <div>
              <span className="font-semibold text-slate-900">{row.cliente.nome}</span>
              <div className="text-[10px] text-slate-400">{row.cliente.cpf || row.cliente.email}</div>
            </div>
          ) : (
            <span className="text-slate-400 italic">Voucher Geral / Avulso</span>
          )}
        </div>
      )
    },
    {
      key: 'usage',
      header: 'Usos / Limite',
      align: 'center',
      width: '120px',
      render: (row) => (
        <span className="text-xs font-mono font-semibold text-slate-700">
          {row.usage_count || 0} / {row.usage_limit || 1}
        </span>
      )
    },
    {
      key: 'validade',
      header: 'Validade',
      sortable: true,
      width: '130px',
      render: (row) => {
        const val = row.validade || row.data_validade;
        return (
          <div className="text-xs text-slate-600 font-mono">
            {val ? formatDate(val) : <span className="text-slate-400">Indeterminada</span>}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '110px',
      render: (row) => <StatusBadge status={row.status || 'ativo'} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      width: '140px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => { setSelectedVoucher(row); setIsVoucherDetailsOpen(true); }}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
            title="Ver Detalhes do Voucher"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleOpenEditVoucher(row)}
            className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
            title="Editar Voucher"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleToggleVoucherStatus(row)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              row.status === 'ativo' ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
            }`}
            title={row.status === 'ativo' ? 'Inativar Voucher' : 'Reativar Voucher'}
          >
            {row.status === 'ativo' ? <Ban className="h-3.5 w-3.5 text-rose-500" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => handleDeleteVoucher(row)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            title="Excluir Voucher"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  const couponColumns: GridColumn<any>[] = [
    {
      key: 'codigo_cupom',
      header: 'Código Promocional',
      sortable: true,
      render: (row) => {
        const code = row.codigo_cupom || row.codigo || row.id.slice(0, 8);
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <Percent className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-slate-900 text-xs uppercase tracking-wider">{code}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleCopy(code, 'Código do cupom'); }}
                  className="text-slate-400 hover:text-amber-600 transition-colors cursor-pointer"
                  title="Copiar cupom"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">{row.nome_cupom || 'Cupom da Loja'}</div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'desconto',
      header: 'Benefício Concedido',
      sortable: true,
      align: 'right',
      width: '160px',
      render: (row) => {
        if (row.categoria_cupom === 'entrega') {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
              Frete Grátis
            </span>
          );
        }
        const isPercent = row.tipo_desconto === 'porcentagem';
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-100">
            {isPercent ? `${row.valor_desconto}% OFF` : formatCurrency(row.valor_desconto || 0)}
          </span>
        );
      }
    },
    {
      key: 'regras',
      header: 'Regras de Uso',
      render: (row) => (
        <div className="text-xs text-slate-600">
          {row.valor_minimo_compra ? (
            <span>Mínimo: <strong className="text-slate-800">{formatCurrency(row.valor_minimo_compra)}</strong></span>
          ) : (
            <span className="text-slate-400 italic">Sem valor mínimo</span>
          )}
        </div>
      )
    },
    {
      key: 'usos',
      header: 'Usos / Limite',
      align: 'center',
      width: '120px',
      render: (row) => (
        <span className="text-xs font-mono font-semibold text-slate-700">
          {row.total_usos || 0} / {row.limite_usos || 1}
        </span>
      )
    },
    {
      key: 'data_validade',
      header: 'Validade',
      sortable: true,
      width: '130px',
      render: (row) => (
        <div className="text-xs text-slate-600 font-mono">
          {row.data_validade ? formatDate(row.data_validade) : <span className="text-slate-400">Sem expiração</span>}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '110px',
      render: (row) => <StatusBadge status={row.status || 'ativo'} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      width: '140px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => { setSelectedCoupon(row); setIsCouponDetailsOpen(true); }}
            className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
            title="Ver Detalhes do Cupom"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleOpenEditCoupon(row)}
            className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
            title="Editar Cupom"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleDeleteCoupon(row)}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            title="Excluir Cupom"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      {/* Top Header / Subtabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('premios')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'premios' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Gift className="h-3.5 w-3.5" />
            <span>Prêmios & Resgates ({premios.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vouchers')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'vouchers' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Ticket className="h-3.5 w-3.5" />
            <span>Vouchers & Cortesias ({vouchers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cupons')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'cupons' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Percent className="h-3.5 w-3.5" />
            <span>Cupons da Loja ({cupons.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trocas')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeTab === 'trocas' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            <span>Trocas & Devoluções ({trocas.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'vouchers' && (
            <button
              type="button"
              onClick={handleOpenNewVoucher}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-indigo-700 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Emitir Novo Voucher</span>
            </button>
          )}

          {activeTab === 'cupons' && (
            <button
              type="button"
              onClick={handleOpenNewCoupon}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-amber-700 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Criar Novo Cupom</span>
            </button>
          )}

          {activeTab === 'premios' && (
            <button
              type="button"
              onClick={() => setIsPointsModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-amber-700 transition-all cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Ajustar Pontos</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'premios') fetchPremios();
              if (activeTab === 'vouchers') fetchVouchers();
              if (activeTab === 'cupons') fetchCupons();
              if (activeTab === 'trocas') fetchTrocas();
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all cursor-pointer"
            title="Atualizar dados"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Tables based on active tab */}
      {activeTab === 'premios' && (
        <TacticalDataGrid
          title="Catálogo & Resgates de Prêmios Fidelidade"
          subtitle="Resgates solicitados por clientes associados ao programa de fidelidade e pontuação GSA"
          data={premios}
          columns={premiosColumns}
          keyExtractor={(item) => item.id}
          isLoading={loadingPremios}
          pageSize={15}
          searchPlaceholder="Buscar por prêmio, código ou cliente..."
        />
      )}

      {activeTab === 'vouchers' && (
        <TacticalDataGrid
          title="Vouchers de Desconto & Cortesias"
          subtitle="Emissão de títulos promocionais, vouchers de valor monetário e créditos especiais com gestão completa"
          data={vouchers}
          columns={voucherColumns}
          keyExtractor={(item) => item.id}
          isLoading={loadingVouchers}
          pageSize={15}
          searchPlaceholder="Buscar por código do voucher ou titular..."
        />
      )}

      {activeTab === 'cupons' && (
        <TacticalDataGrid
          title="Cupons de Desconto da Loja Virtual"
          subtitle="Códigos promocionais para campanhas de marketing e descontos sazonais na loja GSA"
          data={cupons}
          columns={couponColumns}
          keyExtractor={(item) => item.id}
          isLoading={loadingCupons}
          pageSize={15}
          searchPlaceholder="Buscar por código de cupom..."
        />
      )}

      {activeTab === 'trocas' && (
        <TacticalDataGrid
          title="Trocas, Devoluções & Garantia da Loja"
          subtitle="Chamados de assistência pós-venda, devolução por arrependimento e trocas de mercadoria"
          data={trocas}
          columns={[
            {
              key: 'cliente',
              header: 'Cliente / Solicitante',
              sortable: true,
              render: (row) => (
                <div>
                  <div className="font-bold text-slate-900">{row.cliente?.nome || 'Cliente'}</div>
                  <div className="text-[11px] text-slate-500 font-mono">Ref #{row.id.slice(0, 8)}</div>
                </div>
              )
            },
            {
              key: 'motivo',
              header: 'Motivo / Descrição',
              render: (row) => (
                <div className="text-xs text-slate-700 max-w-md truncate">
                  {row.motivo || row.descricao_detalhada || 'Sem descrição'}
                </div>
              )
            },
            {
              key: 'created_at',
              header: 'Data de Abertura',
              sortable: true,
              width: '140px',
              render: (row) => (
                <div className="text-xs text-slate-600 font-mono">
                  {formatDate(row.created_at)}
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
          ]}
          keyExtractor={(item) => item.id}
          isLoading={loadingTrocas}
          pageSize={15}
          searchPlaceholder="Buscar por cliente ou motivo..."
        />
      )}

      {/* SlideOver: Detalhes do Voucher */}
      <CommandSlideOver
        isOpen={isVoucherDetailsOpen}
        onClose={() => setIsVoucherDetailsOpen(false)}
        title="Detalhes do Voucher"
        subtitle="Visualização completa de informações, regras e histórico de resgate"
        width="md"
      >
        {selectedVoucher && (
          <div className="space-y-6 text-xs p-1">
            {/* Voucher Card Showcase */}
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-slate-50 to-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Código Oficial</span>
                <StatusBadge status={selectedVoucher.status || 'ativo'} size="sm" />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-xl font-black text-slate-900 tracking-wider">
                  {selectedVoucher.codigo_voucher || selectedVoucher.codigo || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(selectedVoucher.codigo_voucher || selectedVoucher.codigo, 'Código do voucher')}
                  className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-all cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copiar</span>
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-indigo-100/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Benefício</span>
                  <p className="font-bold text-slate-800 text-sm">
                    {selectedVoucher.tipo === 'porcentagem' ? `${selectedVoucher.valor}% de Desconto` : formatCurrency(selectedVoucher.valor || 0)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Categoria</span>
                  <p className="font-bold text-slate-800 uppercase text-xs">{selectedVoucher.categoria || 'Desconto'}</p>
                </div>
              </div>
            </div>

            {/* Grid of Key Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Limite de Usos</span>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {selectedVoucher.usage_count || 0} / {selectedVoucher.usage_limit || 1} usos
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Data de Validade</span>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {selectedVoucher.validade ? formatDate(selectedVoucher.validade) : 'Indeterminada'}
                </p>
              </div>
            </div>

            {/* Client Info */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-2">Destinatário do Voucher</span>
              {selectedVoucher.cliente ? (
                <div className="space-y-1">
                  <p className="font-bold text-slate-900 text-sm">{selectedVoucher.cliente.nome}</p>
                  <p className="text-slate-600">CPF: <span className="font-mono">{selectedVoucher.cliente.cpf || '—'}</span></p>
                  <p className="text-slate-600">Email: {selectedVoucher.cliente.email || '—'}</p>
                </div>
              ) : (
                <p className="text-slate-500 italic">Voucher Avulso / Não restrito a um cliente específico.</p>
              )}
            </div>

            {/* Timestamps */}
            <div className="space-y-1.5 text-[11px] text-slate-500 font-mono bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>Emitido em: {formatDateTime(selectedVoucher.created_at)}</div>
              {selectedVoucher.data_uso && <div>Utilizado em: {formatDateTime(selectedVoucher.data_uso)}</div>}
              {selectedVoucher.data_cancelamento && (
                <div className="text-rose-600">
                  Cancelado em: {formatDateTime(selectedVoucher.data_cancelamento)}
                  {selectedVoucher.motivo_cancelamento && ` (${selectedVoucher.motivo_cancelamento})`}
                </div>
              )}
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => handleDeleteVoucher(selectedVoucher)}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Excluir</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleVoucherStatus(selectedVoucher)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                    selectedVoucher.status === 'ativo' 
                      ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {selectedVoucher.status === 'ativo' ? <Ban className="h-3.5 w-3.5 text-rose-500" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{selectedVoucher.status === 'ativo' ? 'Inativar' : 'Reativar'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenEditVoucher(selectedVoucher)}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  <Edit className="h-3.5 w-3.5" />
                  <span>Editar Voucher</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* SlideOver: Emitir / Editar Voucher */}
      <CommandSlideOver
        isOpen={isVoucherFormOpen}
        onClose={() => setIsVoucherFormOpen(false)}
        title={editingVoucher ? 'Editar Voucher' : 'Emitir Novo Voucher'}
        subtitle={editingVoucher ? 'Altere as condições, validade ou limites deste voucher' : 'Preencha os dados para criar um novo voucher de desconto ou cortesia'}
        width="md"
      >
        <form onSubmit={handleSaveVoucher} className="space-y-4 text-xs p-1">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold uppercase text-slate-600">
                Código do Voucher <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setVoucherForm((prev) => ({ ...prev, codigo_voucher: generateVoucherCode() }))}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                Gerar Novo Código
              </button>
            </div>
            <input
              type="text"
              required
              value={voucherForm.codigo_voucher}
              onChange={(e) => setVoucherForm((prev) => ({ ...prev, codigo_voucher: e.target.value.toUpperCase() }))}
              placeholder="Ex: VCH-12345678 ou VIP50"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono font-bold uppercase"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
              Nome / Identificação do Voucher
            </label>
            <input
              type="text"
              value={voucherForm.nome}
              onChange={(e) => setVoucherForm((prev) => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Bônus de Boas-Vindas ou Cortesia VIP"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Tipo de Desconto <span className="text-rose-500">*</span>
              </label>
              <select
                value={voucherForm.tipo}
                onChange={(e) => setVoucherForm((prev) => ({ ...prev, tipo: e.target.value as any }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
              >
                <option value="porcentagem">Porcentagem (%)</option>
                <option value="fixo">Valor Fixo (R$)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Valor do Desconto <span className="text-rose-500">*</span>
              </label>
              <input 
                type="number"
                min="1"
                step={voucherForm.tipo === 'porcentagem' ? '1' : '0.01'}
                required
                value={voucherForm.valor}
                inputMode="numeric"
onChange={(e) => setVoucherForm((prev) => ({ ...prev, valor: Number(e.target.value) }))}
                placeholder="Ex: 10 ou 50"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Limite de Usos <span className="text-rose-500">*</span>
              </label>
              <input 
                type="number"
                min="1"
                required
                value={voucherForm.usage_limit}
                inputMode="numeric"
onChange={(e) => setVoucherForm((prev) => ({ ...prev, usage_limit: Number(e.target.value) }))}
                placeholder="Ex: 1 ou 100"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Data de Validade (opcional)
              </label>
              <input
                type="date"
                value={voucherForm.validade}
                onChange={(e) => setVoucherForm((prev) => ({ ...prev, validade: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Categoria
              </label>
              <select
                value={voucherForm.categoria}
                onChange={(e) => setVoucherForm((prev) => ({ ...prev, categoria: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
              >
                <option value="desconto">Desconto</option>
                <option value="cortesia">Cortesia</option>
                <option value="recompensa">Recompensa</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Status
              </label>
              <select
                value={voucherForm.status}
                onChange={(e) => setVoucherForm((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
              >
                <option value="ativo">Ativo</option>
                <option value="expirado">Expirado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
              Vincular a CPF do Cliente (opcional)
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={14}
              value={voucherForm.cpf_cliente}
              onChange={(e) => setVoucherForm((prev) => ({ ...prev, cpf_cliente: maskCPF(e.target.value) }))}
              placeholder="000.000.000-00 (deixe em branco para voucher geral)"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsVoucherFormOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingVoucher}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            >
              {savingVoucher ? 'Salvando...' : editingVoucher ? 'Atualizar Voucher' : 'Emitir Voucher'}
            </button>
          </div>
        </form>
      </CommandSlideOver>

      {/* SlideOver: Detalhes do Cupom */}
      <CommandSlideOver
        isOpen={isCouponDetailsOpen}
        onClose={() => setIsCouponDetailsOpen(false)}
        title="Detalhes do Cupom"
        subtitle="Visualização de regras e métricas de utilização na Loja GSA"
        width="md"
      >
        {selectedCoupon && (
          <div className="space-y-6 text-xs p-1">
            <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/70 via-slate-50 to-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Cupom de Loja</span>
                <StatusBadge status={selectedCoupon.status || 'ativo'} size="sm" />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-xl font-black text-slate-900 tracking-wider uppercase">
                  {selectedCoupon.codigo_cupom || selectedCoupon.codigo || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(selectedCoupon.codigo_cupom || selectedCoupon.codigo, 'Código do cupom')}
                  className="flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition-all cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copiar</span>
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-amber-100/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Benefício</span>
                  <p className="font-bold text-slate-800 text-sm">
                    {selectedCoupon.categoria_cupom === 'entrega' ? 'Frete Grátis' : (
                      selectedCoupon.tipo_desconto === 'porcentagem' ? `${selectedCoupon.valor_desconto}% OFF` : formatCurrency(selectedCoupon.valor_desconto || 0)
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Categoria</span>
                  <p className="font-bold text-slate-800 uppercase text-xs">{selectedCoupon.categoria_cupom || 'Desconto'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Total de Usos</span>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {selectedCoupon.total_usos || 0} / {selectedCoupon.limite_usos || 1} usos
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="text-[10px] font-bold uppercase text-slate-400">Data de Validade</span>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {selectedCoupon.data_validade ? formatDate(selectedCoupon.data_validade) : 'Sem expiração'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Regra de Compra</span>
              <p className="font-semibold text-slate-800">
                {selectedCoupon.valor_minimo_compra ? `Pedido mínimo de ${formatCurrency(selectedCoupon.valor_minimo_compra)}` : 'Sem restrição de valor mínimo de pedido.'}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => handleDeleteCoupon(selectedCoupon)}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Excluir</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenEditCoupon(selectedCoupon)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition-colors cursor-pointer"
              >
                <Edit className="h-3.5 w-3.5" />
                <span>Editar Cupom</span>
              </button>
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* SlideOver: Criar / Editar Cupom */}
      <CommandSlideOver
        isOpen={isCouponFormOpen}
        onClose={() => setIsCouponFormOpen(false)}
        title={editingCoupon ? 'Editar Cupom' : 'Criar Novo Cupom'}
        subtitle={editingCoupon ? 'Atualize as regras promocionais do cupom da loja' : 'Preencha os dados do cupom promocional para a Loja Virtual GSA'}
        width="md"
      >
        <form onSubmit={handleSaveCoupon} className="space-y-4 text-xs p-1">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold uppercase text-slate-600">
                Código do Cupom <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setCouponForm((prev) => ({ ...prev, codigo_cupom: generateCouponCode() }))}
                className="text-[10px] font-bold text-amber-600 hover:text-amber-800 cursor-pointer"
              >
                Gerar Sugestão
              </button>
            </div>
            <input
              type="text"
              required
              value={couponForm.codigo_cupom}
              onChange={(e) => setCouponForm((prev) => ({ ...prev, codigo_cupom: e.target.value.toUpperCase() }))}
              placeholder="Ex: PROMO10 ou FRETEGRATIS"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono font-bold uppercase"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
              Nome do Cupom
            </label>
            <input
              type="text"
              value={couponForm.nome_cupom}
              onChange={(e) => setCouponForm((prev) => ({ ...prev, nome_cupom: e.target.value }))}
              placeholder="Ex: Desconto Black Friday"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Categoria do Cupom
              </label>
              <select
                value={couponForm.categoria_cupom}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, categoria_cupom: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
              >
                <option value="desconto">Desconto no Produto</option>
                <option value="entrega">Frete / Entrega</option>
              </select>
            </div>

            {couponForm.categoria_cupom === 'desconto' ? (
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Tipo de Desconto
                </label>
                <select
                  value={couponForm.tipo_desconto}
                  onChange={(e) => setCouponForm((prev) => ({ ...prev, tipo_desconto: e.target.value as any }))}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                >
                  <option value="porcentagem">Porcentagem (%)</option>
                  <option value="fixo">Valor Fixo (R$)</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Tipo de Entrega
                </label>
                <select
                  value={couponForm.tipo_entrega}
                  onChange={(e) => setCouponForm((prev) => ({ ...prev, tipo_entrega: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
                >
                  <option value="frete_gratis">Frete 100% Grátis</option>
                  <option value="frete_gratis_minimo">Frete Grátis com Mínimo</option>
                </select>
              </div>
            )}
          </div>

          {couponForm.categoria_cupom === 'desconto' && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Valor do Desconto <span className="text-rose-500">*</span>
              </label>
              <input 
                type="number"
                min="1"
                required
                value={couponForm.valor_desconto}
                inputMode="numeric"
onChange={(e) => setCouponForm((prev) => ({ ...prev, valor_desconto: Number(e.target.value) }))}
                placeholder="Ex: 10"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono font-bold"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Limite de Usos Totais
              </label>
              <input 
                type="number"
                min="1"
                required
                value={couponForm.limite_usos}
                inputMode="numeric"
onChange={(e) => setCouponForm((prev) => ({ ...prev, limite_usos: Number(e.target.value) }))}
                placeholder="Ex: 100"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Valor Mínimo Compra (R$)
              </label>
              <input 
                type="number"
                min="0"
                step="0.01"
                value={couponForm.valor_minimo_compra}
                inputMode="numeric"
onChange={(e) => setCouponForm((prev) => ({ ...prev, valor_minimo_compra: e.target.value }))}
                placeholder="Ex: 150.00"
                className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Data de Validade (opcional)
              </label>
              <input
                type="date"
                value={couponForm.data_validade}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, data_validade: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Status
              </label>
              <select
                value={couponForm.status}
                onChange={(e) => setCouponForm((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="usado">Esgotado / Usado</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsCouponFormOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingCoupon}
              className="rounded-lg bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            >
              {savingCoupon ? 'Salvando...' : editingCoupon ? 'Atualizar Cupom' : 'Criar Cupom'}
            </button>
          </div>
        </form>
      </CommandSlideOver>

      {/* Adjust Points Modal Drawer */}
      <CommandSlideOver
        isOpen={isPointsModalOpen}
        onClose={() => setIsPointsModalOpen(false)}
        title="Ajuste Manual de Pontos de Fidelidade"
        subtitle="Adicione ou subtraia pontos da conta de um cliente com justificativa auditável"
        width="md"
      >
        <form onSubmit={handleAdjustPoints} className="space-y-4 text-xs p-1">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
              CPF do Cliente <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={pointsClientDoc}
              onChange={(e) => setPointsClientDoc(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
              Quantidade de Pontos (positivo ou negativo) <span className="text-rose-500">*</span>
            </label>
            <input 
              type="number"
              required
              value={pointsDelta}
              inputMode="numeric"
onChange={(e) => setPointsDelta(e.target.value)}
              placeholder="Ex: 500 ou -200"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
              Motivo / Justificativa <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={pointsReason}
              onChange={(e) => setPointsReason(e.target.value)}
              placeholder="Ex: Bonificação por indicação de cliente PJ"
              className="w-full rounded-lg border border-slate-300 p-2 text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setIsPointsModalOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 uppercase tracking-wider cursor-pointer"
            >
              Confirmar Ajuste
            </button>
          </div>
        </form>
      </CommandSlideOver>
    </div>
  );
}
