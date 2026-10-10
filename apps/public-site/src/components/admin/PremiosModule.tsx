import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Gift, Plus, Search, Clock, CheckCircle, XCircle, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format, addDays, addMonths, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Modal } from '../ui/Modal';
import { GlobalFilter } from '../ui/GlobalFilter';
import { generateCode } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { logService } from '../../lib/logService';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';

interface Premio {
  id: string;
  cliente_id: string;
  codigo_premio: string;
  nome: string;
  tipo: 'servico' | 'produto' | 'assinatura';
  descricao: string;
  data_cadastro: string;
  data_validade: string;
  status: 'pendente' | 'resgatado' | 'cancelado';
  data_resgate?: string;
  data_cancelamento?: string;
  motivo_cancelamento?: string;
  forma_resgate?: 'online' | 'fisico' | null;
  instrucoes_resgate?: string | null;
  clientes?: { nome: string; codigo_cliente: string };
}

interface Cliente {
  id: string;
  nome: string;
  codigo_cliente: string;
  telefone?: string;
}

export default function PremiosModule({ activeSubTab, initialItemId, colaboradorId, colaboradorNome }: { activeSubTab?: 'pendente' | 'resgatado' | 'cancelado', initialItemId?: string, colaboradorId?: string, colaboradorNome?: string | null }) {
  const { refreshCounts } = useAdminNotifications();
  const [premios, setPremios] = useState<Premio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pendente' | 'resgatado' | 'cancelado'>('pendente');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isInstrucoesModalOpen, setIsInstrucoesModalOpen] = useState(false);
  const [selectedPremio, setSelectedPremio] = useState<Premio | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [formaResgate, setFormaResgate] = useState<'online' | 'fisico'>('online');
  const [instrucoesResgate, setInstrucoesResgate] = useState('');

  const [newPremio, setNewPremio] = useState({
    cliente_id: '',
    nome: '',
    tipo: 'servico' as 'servico' | 'produto' | 'assinatura',
    descricao: '',
    validade_valor: 30,
    validade_tipo: 'dias' as 'dias' | 'meses' | 'anos'
  });

  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && premios.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`prem-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          hasAutoOpened.current = initialItemId;
          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, premios]);

  const selectedPremioRef = useRef(selectedPremio);
  useEffect(() => { selectedPremioRef.current = selectedPremio; }, [selectedPremio]);

  useEffect(() => {
    let isMounted = true;
    fetchPremios(isMounted);
    fetchClientes(isMounted);
    return () => { isMounted = false; };
  }, [activeTab, search, filters]);

  // Stable Realtime Subscription
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchPremios();
      }, 300);
    };

    const channel = supabase
      .channel(`admin-premios-rt-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cliente_premios'
      }, () => {
        debouncedFetch();
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array for stability

  const fetchPremios = async (isMounted = true) => {
    if (isMounted) setLoading(true);
    try {
      // Primeiro, verifica e cancela os expirados
      const { data: expirados } = await supabase
        .from('cliente_premios')
        .select('id, cliente_id, nome')
        .eq('status', 'pendente')
        .lt('data_validade', new Date().toISOString());

      if (expirados && expirados.length > 0) {
        await supabase
          .from('cliente_premios')
          .update({
            status: 'cancelado',
            data_cancelamento: new Date().toISOString(),
            motivo_cancelamento: 'Prazo para resgate expirado.'
          })
          .in('id', expirados.map(p => p.id))
          .throwOnError();

        // Notificar cada cliente
        for (const p of expirados) {
          await notificationService.notifyClient(
            p.cliente_id,
            '⏰ Prêmio expirado',
            `O prêmio "${p.nome}" expirou e não pode mais ser resgatado. ⌛`,
            'premios',
            'premio_expirado',
            { prioridade: 'normal', contexto: { premio_nome: p.nome } }
          );
        }
      }

      let query = supabase
        .from('cliente_premios')
        .select('*, clientes(nome, codigo_cliente, telefone)')
        .eq('status', activeTab);

      if (search) {
        query = query.or(`nome.ilike.%${search}%,codigo_premio.ilike.%${search}%`);
      }

      if (filters.mes) {
        const year = filters.ano || new Date().getFullYear();
        const startDate = `${year}-${filters.mes}-01`;
        const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
        query = query.gte('data_cadastro', startDate).lte('data_cadastro', endDate);
      }

      const { data, error } = await query.order('data_cadastro', { ascending: false });

      if (error) throw error;
      if (isMounted && data) setPremios(data as Premio[]);
    } catch (error) {
      console.error('Error fetching premios:', error);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  const fetchClientes = async (isMounted = true) => {
    try {
      const { data, error } = await supabase.from('clientes').select('id, nome, codigo_cliente').order('nome');
      if (error) throw error;
      if (isMounted && data) setClientes(data);
    } catch (err) {
      toast.error('Erro ao carregar clientes.');
    }
  };

  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const handleCreatePremio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingForm) return;
    if (!newPremio.cliente_id || !newPremio.nome || !newPremio.descricao) {
      return toast.error('Preencha todos os campos obrigatórios.');
    }
    setIsSubmittingForm(true);

    let dataValidade = new Date();
    if (newPremio.validade_tipo === 'dias') {
      dataValidade = addDays(dataValidade, newPremio.validade_valor);
    } else if (newPremio.validade_tipo === 'meses') {
      dataValidade = addMonths(dataValidade, newPremio.validade_valor);
    } else {
      dataValidade = addYears(dataValidade, newPremio.validade_valor);
    }

    try {
      const { data, error } = await supabase
        .from('cliente_premios')
        .insert([{
          cliente_id: newPremio.cliente_id,
          codigo_premio: generateCode('PRM'),
          nome: newPremio.nome,
          tipo: newPremio.tipo,
          descricao: newPremio.descricao,
          data_validade: dataValidade.toISOString(),
          status: 'pendente'
        }]).select().single();

      if (error) throw error;
      
      const createdPremio = data;

      // Log Action
      await logService.logAction({
        acao: 'CRIAR_PREMIO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Concedeu o prêmio: ${newPremio.nome} (${newPremio.tipo}) para o cliente ${clientes.find(c => c.id === newPremio.cliente_id)?.nome || 'ID: ' + newPremio.cliente_id}`
      });
      
      // Notificar o cliente
      await notificationService.notifyClient(
        newPremio.cliente_id,
        '🎁 Novo prêmio disponível!',
        `Você recebeu um novo prêmio: ${newPremio.nome}. Resgate-o antes que expire! 🚀`,
        'premios',
        'premio_criado',
        { prioridade: 'alta', contexto: { premio_nome: newPremio.nome, tipo: newPremio.tipo } }
      );

      toast.success('Prêmio cadastrado com sucesso!');
      refreshCounts?.();
      setIsModalOpen(false);
      setNewPremio({
        cliente_id: '',
        nome: '',
        tipo: 'servico',
        descricao: '',
        validade_valor: 30,
        validade_tipo: 'dias'
      });
      fetchPremios();
    } catch (error: any) {
      console.error('Error creating premio:', error);
      toast.error(error.message || 'Erro ao cadastrar prêmio.');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const [isCanceling, setIsCanceling] = useState(false);

  const handleCancelPremio = async () => {
    if (!selectedPremio || !cancelMotivo || isCanceling) return;
    setIsCanceling(true);

    try {
      const { error } = await supabase
        .from('cliente_premios')
        .update({
          status: 'cancelado',
          data_cancelamento: new Date().toISOString(),
          motivo_cancelamento: cancelMotivo
        })
        .eq('id', selectedPremio.id);

      if (error) throw error;

      // Log Action
      await logService.logAction({
        acao: 'CANCELAR_PREMIO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Cancelou o prêmio ${selectedPremio.nome}. Motivo: ${cancelMotivo}`
      });

      // Notificar o cliente
      await notificationService.notifyClient(
        selectedPremio.cliente_id,
        '❌ Prêmio cancelado',
        `O prêmio "${selectedPremio.nome}" foi cancelado. Motivo: ${cancelMotivo} ⚠️`,
        'premios',
        'premio_cancelado',
        { contexto: { premio_nome: selectedPremio.nome, motivo: cancelMotivo } }
      );

      toast.success('Prêmio cancelado com sucesso!');
      refreshCounts?.();
      setIsCancelModalOpen(false);
      setCancelMotivo('');
      setSelectedPremio(null);
      fetchPremios();
    } catch (error) {
      toast.error('Erro ao cancelar prêmio.');
    } finally {
      setIsCanceling(false);
    }
  };

  const [isSendingInstrucoes, setIsSendingInstrucoes] = useState(false);

  const handleEnviarInstrucoes = async () => {
    if (!selectedPremio || !instrucoesResgate || isSendingInstrucoes) return;
    setIsSendingInstrucoes(true);

    try {
      const { error } = await supabase
        .from('cliente_premios')
        .update({
          forma_resgate: formaResgate,
          instrucoes_resgate: instrucoesResgate
        })
        .eq('id', selectedPremio.id);

      if (error) throw error;

      // Log Action
      await logService.logAction({
        acao: 'DEFINIR_INSTRUCOES_PREMIO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Definiu instruções de resgate para o prêmio ${selectedPremio.nome}. Forma: ${formaResgate}`
      });

      // Notificar o cliente
      await notificationService.notifyClient(
        selectedPremio.cliente_id,
        '📝 Instruções de resgate enviadas!',
        `As instruções para resgatar seu prêmio "${selectedPremio.nome}" já estão disponíveis. Confira agora! ✨`,
        'premios',
        'premio_resgatado',
        { itemId: selectedPremio.id, prioridade: 'alta', contexto: { premio_nome: selectedPremio.nome, forma: formaResgate } }
      );

      toast.success('Instruções enviadas com sucesso!');
      setIsInstrucoesModalOpen(false);
      setInstrucoesResgate('');
      setFormaResgate('online');
      setSelectedPremio(null);
      fetchPremios();
    } catch (error) {
      toast.error('Erro ao enviar instruções.');
    } finally {
      setIsSendingInstrucoes(false);
    }
  };



  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-end gap-3 px-2 mb-6">
        <GlobalFilter 
          searchValue={search}
          onSearch={setSearch}
          currentFilters={filters}
          onFilterChange={setFilters}
          onClear={() => {
            setSearch('');
            setFilters({ mes: '', ano: new Date().getFullYear().toString() });
          }}
          options={[
            {
              id: 'mes',
              label: 'Mês de Cadastro',
              type: 'select',
              options: [
                { value: '01', label: 'Janeiro' },
                { value: '02', label: 'Fevereiro' },
                { value: '03', label: 'Março' },
                { value: '04', label: 'Abril' },
                { value: '05', label: 'Maio' },
                { value: '06', label: 'Junho' },
                { value: '07', label: 'Julho' },
                { value: '08', label: 'Agosto' },
                { value: '09', label: 'Setembro' },
                { value: '10', label: 'Outubro' },
                { value: '11', label: 'Novembro' },
                { value: '12', label: 'Dezembro' }
              ]
            },
            {
              id: 'ano',
              label: 'Ano',
              type: 'select',
              options: [
                { value: '2024', label: '2024' },
                { value: '2025', label: '2025' },
                { value: '2026', label: '2026' }
              ]
            }
          ]}
        />
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-3 rounded-[2rem] bg-[#1a1a1a] px-8 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-black active:scale-95 group whitespace-nowrap"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          Novo Prêmio
        </button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : premios.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2.5rem] bg-white border border-neutral-100 py-32 text-center px-6 animate-in fade-in zoom-in duration-500">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-50 text-neutral-200 mb-6 ring-1 ring-neutral-100">
            <Gift className="h-10 w-10" />
          </div>
          <h3 className="text-xl font-black text-neutral-900 mb-2 tracking-tight">Nenhum prêmio encontrado</h3>
          <p className="text-sm font-bold text-neutral-400 max-w-xs mx-auto uppercase tracking-widest leading-loose">Não há registros para esta categoria ou termo de busca.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3 px-4">
          {premios.map((premio) => (
            <div 
              key={premio.id} 
              id={`prem-${premio.id}`}
              className={`group relative rounded-[2.5rem] bg-white p-8 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1 overflow-hidden ${
                highlightedId === premio.id 
                  ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg' 
                  : ''
              }`}
            >
              {/* Status Ribbon (Subtle) */}
              <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rotate-45 opacity-10 transition-opacity group-hover:opacity-20 ${
                premio.status === 'resgatado' ? 'bg-emerald-500' :
                premio.status === 'cancelado' ? 'bg-red-500' : 'bg-amber-500'
              }`} />

              <div className="relative z-10 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ${
                      premio.tipo === 'servico' ? 'bg-blue-50 text-blue-600 ring-blue-100' :
                      premio.tipo === 'produto' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' :
                      'bg-purple-50 text-purple-600 ring-purple-100'
                    }`}>
                      <Gift className="h-7 w-7" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-neutral-900 tracking-tight leading-tight group-hover:text-indigo-600 transition-colors uppercase">
                        {premio.nome}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                          {premio.tipo}
                        </span>
                        <div className="h-1 w-1 rounded-full bg-neutral-200" />
                        <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-md ring-1 ring-indigo-100">
                          {premio.codigo_premio}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cliente Section */}
                <div className="rounded-3xl bg-neutral-50/50 p-5 ring-1 ring-neutral-100 transition-colors group-hover:bg-neutral-50/80">
                  <p className="text-[9px] font-black text-neutral-400 uppercase tracking-[0.2em] mb-3">Cliente Beneficiário</p>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white shadow-sm ring-1 ring-black/5 flex items-center justify-center font-black text-indigo-600 text-xs">
                      {premio.clientes?.nome.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-black text-neutral-900">{premio.clientes?.nome}</p>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{premio.clientes?.codigo_cliente}</p>
                    </div>
                  </div>
                </div>

                {/* Info Display */}
                <div className="space-y-4">
                  <p className="text-sm font-bold text-neutral-500 leading-relaxed line-clamp-3">
                    {premio.descricao}
                  </p>

                  <div className="pt-4 border-t border-dashed border-neutral-100 space-y-3">
                    {premio.status === 'pendente' && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Válido até</span>
                        <span className="text-[11px] font-black text-neutral-900 bg-neutral-100 px-3 py-1 rounded-full uppercase tracking-tight">
                          {format(new Date(premio.data_validade), "dd/MM/yyyy")}
                        </span>
                      </div>
                    )}
                    
                    {premio.status === 'resgatado' && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Resgatado em</span>
                        <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full tracking-tighter ring-1 ring-emerald-100">
                          {premio.data_resgate ? format(new Date(premio.data_resgate), "dd/MM/yyyy") : '-'}
                        </span>
                      </div>
                    )}

                    {premio.status === 'cancelado' && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest uppercase">Cancelado em</span>
                        <span className="text-[11px] font-black text-red-600 bg-red-50 px-3 py-1 rounded-full tracking-tighter ring-1 ring-red-100">
                          {premio.data_cancelamento ? format(new Date(premio.data_cancelamento), "dd/MM/yyyy") : '-'}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status Atual</span>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm ring-1 ring-inset ${
                        premio.status === 'pendente' ? 'bg-amber-50 text-amber-600 ring-amber-100' :
                        premio.status === 'resgatado' ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' :
                        'bg-red-50 text-red-600 ring-red-100'
                      }`}>
                        {premio.status === 'pendente' ? 'Aguardando' : premio.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2">
                  {premio.status === 'pendente' && (
                    <button
                      onClick={() => {
                        setSelectedPremio(premio);
                        setIsCancelModalOpen(true);
                      }}
                      className="w-full rounded-2xl border border-red-100 py-4 text-[10px] font-black uppercase tracking-widest text-red-500 transition-all hover:bg-red-50 active:scale-[0.98]"
                    >
                      Cancelar Prêmio
                    </button>
                  )}

                  {premio.status === 'resgatado' && (
                    <button
                      onClick={() => {
                        setSelectedPremio(premio);
                        setFormaResgate(premio.forma_resgate || 'online');
                        setInstrucoesResgate(premio.instrucoes_resgate || '');
                        setIsInstrucoesModalOpen(true);
                      }}
                      className={`w-full rounded-2xl py-4 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-[0.98] ${
                        !premio.instrucoes_resgate 
                          ? 'bg-amber-500 text-white shadow-xl shadow-amber-200 hover:bg-amber-600'
                          : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 hover:bg-emerald-100'
                      }`}
                    >
                      {!premio.instrucoes_resgate ? (
                        <>
                          <Info className="h-4 w-4" />
                          Definir Instruções
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Instruções Enviadas
                        </>
                      )}
                    </button>
                  )}

                  {premio.status === 'cancelado' && premio.motivo_cancelamento && (
                    <div className="bg-red-50 p-4 rounded-2xl ring-1 ring-red-100 mb-3">
                      <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">Motivo do Cancelamento</p>
                      <p className="text-xs font-bold text-red-800 line-clamp-2">{premio.motivo_cancelamento}</p>
                    </div>
                  )}

                  {(premio.clientes as any)?.telefone && (
                    <div className="flex justify-center scale-90 origin-center mt-3">
                      <AdminWhatsAppButton
                        telefone={(premio.clientes as any).telefone}
                        mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                          tipo: 'premio',
                          clienteNome: premio.clientes.nome,
                          codigo: premio.codigo_premio,
                          status: premio.status
                        })}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Instruções */}
      <Modal
        isOpen={isInstrucoesModalOpen}
        onClose={() => {
          setIsInstrucoesModalOpen(false);
          setSelectedPremio(null);
          setInstrucoesResgate('');
          setFormaResgate('online');
        }}
        title={selectedPremio?.instrucoes_resgate ? "Editar Instruções" : "Enviar Instruções de Resgate"}
        size="md"
      >
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="rounded-[2rem] bg-indigo-50/50 p-6 ring-1 ring-indigo-100/50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Prêmio Selecionado</p>
                <h3 className="text-lg font-black text-neutral-900 tracking-tight">{selectedPremio?.nome}</h3>
              </div>
              <span className="text-[10px] font-black text-indigo-600 bg-white px-3 py-1.5 rounded-xl shadow-sm ring-1 ring-indigo-100">
                {selectedPremio?.codigo_premio}
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-hidden">
               <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center text-[10px] font-black text-indigo-500 shadow-sm ring-1 ring-black/5">
                 {selectedPremio?.clientes?.nome.charAt(0)}
               </div>
               <p className="text-sm font-bold text-neutral-600 truncate">Destinatário: {selectedPremio?.clientes?.nome}</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Modalidade de Entrega</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'online', label: 'Entrega Digital', icon: Info },
                  { id: 'fisico', label: 'Entrega Física', icon: Gift }
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setFormaResgate(type.id as any)}
                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ring-1 ${
                      formaResgate === type.id 
                        ? 'bg-indigo-600 text-white ring-indigo-600 shadow-lg shadow-indigo-200' 
                        : 'bg-neutral-50 text-neutral-400 ring-neutral-100 hover:bg-neutral-100'
                    }`}
                  >
                    <type.icon className="h-4 w-4" />
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Instruções Passo a Passo</label>
              <textarea
                value={instrucoesResgate}
                onChange={(e) => setInstrucoesResgate(e.target.value)}
                placeholder="Descreva detalhadamente como o cliente deve proceder para usufruir do prêmio..."
                rows={6}
                className="w-full rounded-[2rem] border border-neutral-100 bg-neutral-50 px-8 py-6 text-sm font-black text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder-neutral-300 resize-none"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-neutral-100">
            <button
              onClick={() => {
                setIsInstrucoesModalOpen(false);
                setSelectedPremio(null);
                setInstrucoesResgate('');
                setFormaResgate('online');
              }}
              className="rounded-2xl px-8 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Descartar
            </button>
            <button
              onClick={handleEnviarInstrucoes}
              disabled={!instrucoesResgate || isSendingInstrucoes}
              className="rounded-2xl bg-indigo-600 px-10 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-30 transition-all hover:-translate-y-0.5"
            >
              {isSendingInstrucoes ? 'Enviando...' : (selectedPremio?.instrucoes_resgate ? 'Atualizar Instruções' : 'Enviar agora para o Cliente')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Prêmio para Cliente" size="lg">
        <form onSubmit={handleCreatePremio} className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Selecionar Cliente Beneficiário</label>
                <select
                  required
                  value={newPremio.cliente_id}
                  onChange={e => setNewPremio({...newPremio, cliente_id: e.target.value})}
                  className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-4 text-sm font-black text-neutral-900 focus:border-indigo-500 focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">Buscar cliente...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} ({c.codigo_cliente})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Título do Prêmio</label>
                <input
                  type="text"
                  required
                  value={newPremio.nome}
                  onChange={e => setNewPremio({...newPremio, nome: e.target.value})}
                  className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-4 text-sm font-black text-neutral-900 focus:border-indigo-500 focus:outline-none transition-all"
                  placeholder="Ex: Consultoria Exclusiva"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Categoria do Benefício</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['servico', 'produto', 'assinatura'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNewPremio({...newPremio, tipo: type})}
                      className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ring-1 ${
                        newPremio.tipo === type 
                          ? 'bg-indigo-600 text-white ring-indigo-600' 
                          : 'bg-white text-neutral-400 ring-neutral-100 hover:bg-neutral-50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Descrição do Prêmio</label>
                <textarea
                  required
                  rows={4}
                  value={newPremio.descricao}
                  onChange={e => setNewPremio({...newPremio, descricao: e.target.value})}
                  className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-4 text-sm font-black text-neutral-900 focus:border-indigo-500 focus:outline-none transition-all resize-none"
                  placeholder="Descreva o que o cliente ganhará..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Prazo de Validade para Resgate</label>
                <div className="flex gap-3">
                  <input 
                    type="number"
                    min="1"
                    required
                    value={newPremio.validade_valor}
                    inputMode="numeric"
onChange={(e) => setNewPremio({...newPremio, validade_valor: parseInt(e.target.value) || 1})}
                    className="w-24 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-4 text-sm font-black text-neutral-900 focus:border-indigo-500 focus:outline-none text-center"
                  />
                  <select
                    required
                    value={newPremio.validade_tipo}
                    onChange={e => setNewPremio({...newPremio, validade_tipo: e.target.value as any})}
                    className="flex-1 rounded-2xl border border-neutral-100 bg-neutral-50 px-6 py-4 text-sm font-black text-neutral-900 focus:border-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value="dias">Dias Corridos</option>
                    <option value="meses">Meses</option>
                    <option value="anos">Anos</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-8 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-2xl px-10 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingForm}
              className="rounded-2xl bg-[#1a1a1a] px-12 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-black/10 hover:bg-indigo-600 transition-all hover:-translate-y-0.5 disabled:opacity-50"
            >
              {isSubmittingForm ? 'Confirmando...' : 'Confirmar Cadastro'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Anular Prêmio Vigente">
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <div className="rounded-[2rem] bg-red-50 p-6 ring-1 ring-red-200 border-l-4 border-red-500 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <XCircle className="h-6 w-6 text-red-600" />
              <p className="text-[10px] font-black text-red-700 uppercase tracking-[0.2em]">Cuidado! Ação Irreversível</p>
            </div>
            <p className="text-sm font-bold text-red-900 leading-relaxed">
              O cancelamento do prêmio <span className="underline decoration-red-300 decoration-2 underline-offset-4">"{selectedPremio?.nome}"</span> impedirá permanentemente que o cliente o resgate. Certifique-se desta decisão.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 ml-1">Justificativa do Cancelamento</label>
            <textarea
              required
              rows={4}
              value={cancelMotivo}
              onChange={e => setCancelMotivo(e.target.value)}
              className="w-full rounded-[2rem] border border-neutral-100 bg-neutral-50 px-8 py-6 text-sm font-black text-neutral-900 focus:border-red-500 focus:outline-none transition-all placeholder-neutral-300 resize-none"
              placeholder="Descreva o motivo que será enviado ao cliente..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-neutral-100">
            <button
              onClick={() => setIsCancelModalOpen(false)}
              className="rounded-2xl px-8 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleCancelPremio}
              disabled={!cancelMotivo || isCanceling}
              className="rounded-2xl bg-red-600 px-10 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-red-200 hover:bg-red-700 disabled:opacity-30 transition-all hover:-translate-y-0.5"
            >
              {isCanceling ? 'Confirmando...' : 'Confirmar Anulação'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
