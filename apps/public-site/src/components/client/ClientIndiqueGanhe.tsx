import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Indicacao, Cliente } from '../../types';
import { formatCurrency, formatDate, maskCPF, maskPhone, copyToClipboard } from '../../lib/utils';
import { Users, Plus, Clock, CheckCircle, XCircle, Info, UserCheck, Ticket, ChevronRight, Copy, MessageCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import {
  fetchReferralSettings,
  formatIndicadorReward,
  formatIndicadoReward,
  type ReferralSettings
} from '../../utils/referralHelpers';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

export function ClientIndiqueGanhe({ 
  clientId,
  initialTab,
  initialItemId 
}: { 
  clientId: string,
  initialTab?: string,
  initialItemId?: string
}) {
  const { containerRef: indicacoesTabsRef, setButtonRef: setIndicacoesTabButtonRef } = useAutoFitTabs(16, 10);
  const [activeTab, setActiveTab] = useState<'aberta' | 'concluída'>(
    (initialTab as any) || 'aberta'
  );
  const [indicacoes, setIndicacoes] = useState<Indicacao[]>([]);
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIndicacao, setSelectedIndicacao] = useState<Indicacao | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as any);
  }, [initialTab]);

  useEffect(() => {
    if (initialItemId) {
      const detectStatusAndSwitch = async () => {
        const { data, error } = await supabase
          .from('indicacoes')
          .select('status')
          .eq('id', initialItemId)
          .single();
        
        if (data && data.status) {
          setActiveTab(data.status as any);
        }
      };
      detectStatusAndSwitch();
    }
  }, [initialItemId]);

  useEffect(() => {
    if (initialItemId && indicacoes.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = indicacoes.find(i => i.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        // Scroll and highlight
        setTimeout(() => {
          const element = document.getElementById(`ind-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 400);
      }
    }
  }, [initialItemId, indicacoes.length]);
  const [settings, setSettings] = useState<ReferralSettings>({
    indicador_tipo: 'carteira',
    indicador_limite_carteira: 20,
    indicador_valor_pontos: 50,
    indicado_tipo: 'desconto',
    indicado_desconto_porcentagem: 10,
    indicado_valor_pontos: 50,
    template_mensagem: 'Olá! Você acabou de ganhar uma recompensa especial no Grupo GSA por ter sido indicado pelo {nome_indicador}! Ao realizar seu primeiro acesso, valide seu número de celular {codigo} para garantir {recompensa_indicado} na sua conta!'
  });
  const [formData, setFormData] = useState({
    indicado_nome: '',
    whatsapp_indicado: '',
    data_indicacao: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchIndicacoes();
    fetchCliente();
    fetchSettings();
  }, [clientId, activeTab]);

  useRealtimeSubscription(
    [
      {
        table: 'indicacoes',
        filter: clientId ? `indicador_id=eq.${clientId}` : undefined,
        debounceMs: 150,
        onChange: fetchIndicacoes,
        onPayload: (payload) => {
          fetchIndicacoes();
          if (payload.new && selectedIndicacao && (payload.new as any).id === selectedIndicacao.id) {
            setSelectedIndicacao(prev => prev ? ({ ...prev, ...payload.new } as Indicacao) : null);
          }
        },
      },
      {
        table: 'vouchers',
        debounceMs: 150,
        onChange: fetchIndicacoes,
      },
      {
        table: 'clientes',
        filter: clientId ? `id=eq.${clientId}` : undefined,
        debounceMs: 150,
        onChange: () => {
          fetchCliente();
          fetchIndicacoes();
        },
      },
    ],
    [clientId, activeTab, selectedIndicacao?.id]
  );

  async function fetchCliente() {
    try {
      const { data } = await supabase.from('clientes').select('*').eq('id', clientId).single();
      if (data) setCliente(data);
    } catch (e) { console.error("Erro capturado:", e); }
  };

  async function fetchSettings() {
    try {
      const s = await fetchReferralSettings();
      setSettings(s);
    } catch (e) { console.error("Erro capturado:", e); }
  };

  async function fetchIndicacoes() {
    try {
      // 1. Cleanup expired indications (Lazy Cleanup)
      const today = new Date();
      const limitDate = new Date();
      limitDate.setDate(today.getDate() - 15);
      const limitStr = limitDate.toISOString().split('T')[0];

      // Cleanup de expiradas sera tratado pelo backend; esta tela nao faz escrita direta.

      // 2. Fetch fresh data
      let query = supabase
        .from('indicacoes')
        .select('*, vouchers(codigo_voucher, validade)')
        .eq('indicador_id', clientId)
        .order('data_criacao', { ascending: false });

      if (activeTab === 'concluída') {
        query = query.in('status', ['concluída', 'cancelada']);
      } else {
        query = query.eq('status', 'aberta');
      }

      const { data } = await query;
      
      if (data) setIndicacoes(data as any);
    } catch (e) {
      toast.error('Erro ao carregar indicações.');
    }
  };

  const handleCancelIndicacao = async (id: string) => {
    try {
      await clientOperationalWrite(clientId, 'indicacoes', 'update', { status: 'cancelada' }, { id });
      toast.success('Indicação cancelada.');
      setIsDetailOpen(false);
      fetchIndicacoes();
    } catch (e) {
      toast.error('Ocorreu um erro inesperado.');
    }
  };

  const handleCreateIndicacao = async () => {
    if (!formData.whatsapp_indicado) return toast.error('Informe o WhatsApp do indicado.');
    
    const cleanPhone = formData.whatsapp_indicado.replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
      return toast.error('O WhatsApp deve conter exatamente 11 números (DDD + 9 dígitos).');
    }

    // New validation: Check for self-referral
    if (cliente && cliente.telefone && cleanPhone === cliente.telefone.replace(/\D/g, '')) {
      return toast.error('Você não pode indicar o seu próprio número de celular.');
    }

    // New validation: Check if already a client
    const { data: existingClient } = await supabase
      .from('clientes')
      .select('id')
      .eq('telefone', cleanPhone)
      .maybeSingle();

    if (existingClient) {
      return toast.error('Este número já pertence a um cliente cadastrado no Grupo GSA.');
    }

    // 1. Check for duplicate indication
    const { data: existingIndicacao } = await supabase
      .from('indicacoes')
      .select('id, status')
      .eq('whatsapp_indicado', cleanPhone)
      .in('status', ['aberta', 'concluída'])
      .maybeSingle();

    if (existingIndicacao) {
      if (existingIndicacao.status === 'aberta') {
        return toast.error('Este número já possui uma indicação ativa e aguardando cadastro.');
      } else {
        return toast.error('Este número já concluiu um cadastro através de uma indicação anterior.');
      }
    }

    // 2. Create Voucher (WhatsApp as code)
    let voucherData: any = null;
    try {
      voucherData = await clientOperationalWrite(clientId, 'vouchers', 'insert', {
        codigo_voucher: cleanPhone,
        tipo_desconto: 'porcentagem',
        valor_desconto: settings.indicado_desconto_porcentagem,
        validade: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        uso_unico: true,
        status: 'ativo',
        descricao: 'Voucher de Indicacao: ' + formData.indicado_nome
      });
    } catch (vError) {
      toast.error('Houve um problema com a criacao do voucher, mas a indicacao continuara.');
    }

    // 3. Create Indicacao
    const iData = await clientOperationalWrite<any>(clientId, 'indicacoes', 'insert', {
      indicado_nome: formData.indicado_nome,
      whatsapp_indicado: cleanPhone,
      data_indicacao: formData.data_indicacao,
      bonus_indicador: settings.indicador_limite_carteira,
      bonus_indicado: 0,
      voucher_id: voucherData?.id || null,
      status: 'aberta'
    });

    if (iData) {
      // Notify Admin
      await createNotification(
        null,
        'Nova Indicação Recebida',
        `O cliente ${cliente?.nome || clientId} indicou ${formData.indicado_nome}.`,
        'indique-ganhe',
        'indicacoes',
        iData?.id
      );

      // Notify Client (Referrer)
      const recompensaIndicadorTexto = formatIndicadorReward(settings);
      await createNotification(
        clientId,
        'Indicação Registrada! 🎉',
        `Sua indicação para ${formData.indicado_nome} foi registrada! Você ganhará ${recompensaIndicadorTexto} após o pagamento da 1ª fatura.`,
        'vouchers'
      );

      toast.success('Indicação registrada com sucesso!');
      
      // WhatsApp Message
      handleResendWhatsApp({ 
        whatsapp_indicado: cleanPhone, 
        indicado_nome: formData.indicado_nome 
      } as any);

      setIsModalOpen(false);
      setStep(1);
      setFormData({ indicado_nome: '', whatsapp_indicado: '', data_indicacao: new Date().toISOString().split('T')[0] });
      fetchIndicacoes();
    }
  };

  const handleResendWhatsApp = (ind: Indicacao) => {
    let message = settings.template_mensagem || '';
    const cleanPhone = ind.whatsapp_indicado.replace(/\D/g, '');
    const recompensaIndicado = formatIndicadoReward(settings);
    const recompensaIndicador = formatIndicadorReward(settings);
    
    message = message.replace(/{nome_indicador}/g, cliente?.nome || 'um amigo')
                     .replace(/{whatsapp_cliente_indicado}/g, maskPhone(cleanPhone))
                     .replace(/{whatsapp_indicador}/g, maskPhone(cliente?.telefone || ''))
                     .replace(/{bonus_cadastrado}/g, formatCurrency(settings.indicador_limite_carteira))
                     .replace(/{telefone_suporte}/g, maskPhone('11920857756'))
                     .replace(/{desconto}/g, settings.indicado_desconto_porcentagem.toString())
                     .replace(/{codigo}/g, maskPhone(cleanPhone))
                     .replace(/{nome_indicado}/g, ind.indicado_nome || 'amigo')
                     .replace(/{recompensa_indicado}/g, recompensaIndicado)
                     .replace(/{recompensa_indicador}/g, recompensaIndicador)
                     .replace(/{bonus_indicador}/g, formatCurrency(settings.indicador_limite_carteira));
    
    const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        <button 
          onClick={() => setIsAnnouncementOpen(true)}
          className="btn-primary w-full sm:w-auto self-start"
        >
          <Plus className="h-4 w-4" />
          Nova Indicação
        </button>

        <div className="w-full min-w-0 sm:w-auto self-start overflow-hidden">
          <div ref={indicacoesTabsRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">
            {['aberta', 'concluída'].map((t, index) => (
              <button 
                key={t}
                ref={setIndicacoesTabButtonRef(index)}
                onClick={() => setActiveTab(t as any)}
                className={`min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize leading-none transition-all sm:px-6 ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
              >
                {t === 'aberta' ? 'Pendente' : 'Concluída'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {indicacoes.map((ind) => (
          <div 
            id={`ind-${ind.id}`}
            key={ind.id} 
            onClick={() => { setSelectedIndicacao(ind); setIsDetailOpen(ind.status !== 'cancelada'); }}
            className={`group relative cursor-pointer rounded-2xl p-6 shadow-md transition-all duration-500 overflow-hidden ${
              highlightedItemId === ind.id 
                ? 'bg-indigo-50 ring-4 ring-indigo-500 shadow-2xl shadow-indigo-500/20 scale-[1.02] z-10' 
                : 'bg-white ring-1 ring-neutral-300 hover:shadow-xl hover:-translate-y-1'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${ind.status === 'aberta' ? 'bg-amber-50 text-amber-600' : ind.status === 'concluída' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {ind.status}
              </span>
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[#1a1a1a]/40">Ref: {ind.id.slice(0, 8)}</span>
            </div>
            
            {ind.status === 'aberta' && (() => {
                const dataIndicacao = new Date(ind.data_indicacao);
                const dataExpiracao = new Date(dataIndicacao);
                dataExpiracao.setDate(dataExpiracao.getDate() + 15);
                const hoje = new Date();
                const diffTime = dataExpiracao.getTime() - hoje.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays <= 5) {
                  return (
                    <div className="absolute -top-2 -right-2 flex h-6 items-center rounded-full bg-red-500 px-2 text-[8px] font-bold text-white shadow-lg animate-bounce">
                      {diffDays <= 0 ? 'EXPIRANDO' : `${diffDays}D`}
                    </div>
                  );
                }
                return null;
            })()}
            
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[#1a1a1a]">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-[#1a1a1a]">{ind.indicado_nome || ind.whatsapp_indicado}</h4>
                <p className="text-xs text-[#1a1a1a]/60">{ind.indicado_nome ? maskPhone(ind.whatsapp_indicado) : formatDate(ind.data_indicacao)}</p>
                {ind.indicado_nome && <p className="text-[10px] text-[#1a1a1a]/40">{formatDate(ind.data_indicacao)}</p>}
              </div>
            </div>
 
            <div className="flex items-center justify-between border-t border-black/5 pt-4">
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Seu Bônus</p>
                <p className="text-sm font-medium text-[#1a1a1a]">
                  {ind.status === 'concluída'
                    ? formatCurrency(ind.bonus_indicador)
                    : formatIndicadorReward(settings)}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 transition-colors group-hover:bg-[#1a1a1a] group-hover:text-white">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {indicacoes.length === 0 && (
        <div className="py-24 text-center">
          <Users className="mx-auto h-12 w-12 text-[#1a1a1a]/20" />
          <p className="mt-4 text-[#1a1a1a]/40 font-medium">Nenhuma indicação encontrada.</p>
        </div>
      )}

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes da Indicação" size="full">
        {selectedIndicacao && (
          <div className="space-y-8">
            <div className="rounded-2xl bg-neutral-100 p-6 ring-1 ring-neutral-300">
              <div className="flex items-center justify-between mb-4">
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${selectedIndicacao.status === 'aberta' ? 'bg-amber-100 text-amber-700' : selectedIndicacao.status === 'concluída' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {selectedIndicacao.status}
                </span>
                <span className="text-xs font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">ID: {selectedIndicacao.id.slice(0, 8)}</span>
              </div>
              <h3 className="text-xl font-medium text-[#1a1a1a]">Indicado: {selectedIndicacao.indicado_nome || selectedIndicacao.whatsapp_indicado}</h3>
              {selectedIndicacao.indicado_nome && (
                <p className="text-sm text-[#1a1a1a]/80 font-medium">{maskPhone(selectedIndicacao.whatsapp_indicado)}</p>
              )}
              <p className="text-sm text-[#1a1a1a]/60">Data da Indicação: {formatDate(selectedIndicacao.data_indicacao)}</p>
              
              {selectedIndicacao.status === 'aberta' && (() => {
                const dataIndicacao = new Date(selectedIndicacao.data_indicacao);
                const dataExpiracao = new Date(dataIndicacao);
                dataExpiracao.setDate(dataExpiracao.getDate() + 15);
                const hoje = new Date();
                const diffTime = dataExpiracao.getTime() - hoje.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                return (
                  <div className="mt-4 flex items-center justify-between border-t border-black/5 pt-4">
                    <div>
                      <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Prazo para Cadastro</p>
                      <p className="text-sm font-medium text-[#1a1a1a]">{formatDate(dataExpiracao.toISOString().split('T')[0])}</p>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-widest uppercase ${diffDays <= 3 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-amber-100 text-amber-600'}`}>
                      {diffDays > 0 ? `${diffDays} ${diffDays === 1 ? 'dia restante' : 'dias restantes'}` : 'Expira hoje'}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-[#1a1a1a]">Etapas para Liberação</h4>
                <div className="flex items-center gap-1 text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">
                  <Clock className="h-3 w-3" />
                  Atualizado em Tempo Real
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { 
                    label: 'Indicação Realizada', 
                    desc: 'A indicação foi registrada com sucesso.', 
                    done: true,
                    icon: UserCheck
                  },
                  { 
                    label: 'Cadastro do Indicado', 
                    desc: 'O indicado deve realizar o cadastro no sistema.', 
                    done: !!selectedIndicacao.data_cadastro_indicado,
                    date: selectedIndicacao.data_cadastro_indicado,
                    icon: UserCheck
                  },
                  { 
                    label: 'Conclusão do Serviço', 
                    desc: 'O bônus é liberado após o primeiro pagamento do indicado.', 
                    done: selectedIndicacao.status === 'concluída',
                    date: selectedIndicacao.data_conclusao,
                    icon: CheckCircle
                  }
                ].map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-white transition-all ${step.done ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-[#f8f7f5] text-[#1a1a1a]/30'}`}>
                        {step.done ? <CheckCircle className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
                      </div>
                      {i < 2 && <div className={`h-full w-0.5 ${step.done ? 'bg-emerald-500' : 'bg-black/5'}`} />}
                    </div>
                    <div className="pb-6">
                      <p className={`font-medium transition-colors ${step.done ? 'text-[#1a1a1a]' : 'text-[#1a1a1a]/40'}`}>{step.label}</p>
                      <p className="text-xs text-[#1a1a1a]/60">{step.desc}</p>
                      {step.date && <p className="mt-1 text-[10px] font-semibold tracking-widest text-emerald-600 uppercase">Concluído em {formatDate(step.date)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-neutral-100 p-4 ring-1 ring-neutral-300">
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Seu Ganho</p>
                <p className="text-lg font-medium text-[#1a1a1a]">
                  {selectedIndicacao.status === 'concluída'
                    ? formatCurrency(selectedIndicacao.bonus_indicador)
                    : formatIndicadorReward(settings)}
                </p>
              </div>
              <div className="rounded-2xl bg-neutral-100 p-4 ring-1 ring-neutral-300">
                <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Ganho do Amigo</p>
                <p className="text-lg font-medium text-emerald-600">{formatIndicadoReward(settings)}</p>
              </div>
            </div>

            {selectedIndicacao.status === 'aberta' && (
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleResendWhatsApp(selectedIndicacao)}
                  className="w-full rounded-2xl bg-indigo-600 py-4 font-medium text-white transition-all hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
                >
                  <MessageCircle className="mr-2 inline-block h-5 w-5" />
                  Reencaminhar via WhatsApp
                </button>
                <button 
                  onClick={() => handleCancelIndicacao(selectedIndicacao.id)}
                  className="w-full rounded-2xl bg-red-50 py-4 font-medium text-red-600 transition-all hover:bg-red-100"
                >
                  <XCircle className="mr-2 inline-block h-5 w-5" />
                  Cancelar Indicação
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal isOpen={isAnnouncementOpen} onClose={() => setIsAnnouncementOpen(false)} title="Campanha Indique e Ganhe" size="full">
        <div className="space-y-4 md:space-y-6">
          <div className="rounded-3xl md:rounded-[2rem] bg-[#1a1a1a] p-4 md:p-6 text-white shadow-lg md:shadow-xl">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="flex shrink-0 h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
                <Users className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <div>
                <h3 className="text-base md:text-xl font-bold tracking-tight">Como funciona a campanha?</h3>
                <p className="mt-1 md:mt-2 text-xs md:text-sm text-white/70 leading-relaxed">
                  Indique seus amigos para os serviços do Grupo GSA e ambos ganham benefícios exclusivos!
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:gap-4">
            <div className="rounded-xl md:rounded-2xl bg-emerald-50 p-3 md:p-5 ring-1 ring-emerald-100 flex flex-col justify-center">
              <p className="text-[9px] md:text-[10px] font-semibold tracking-widest text-emerald-600 uppercase">Você Ganha</p>
              <p className="text-base sm:text-lg md:text-2xl font-bold text-emerald-700 mt-0.5 md:mt-1">{formatIndicadorReward(settings)}</p>
              <p className="mt-1 md:mt-2 text-[9px] md:text-[10px] text-emerald-600/80 leading-tight">10% do valor da 1ª fatura do indicado</p>
            </div>
            <div className="rounded-xl md:rounded-2xl bg-indigo-50 p-3 md:p-5 ring-1 ring-indigo-100 flex flex-col justify-center">
              <p className="text-[9px] md:text-[10px] font-semibold tracking-widest text-indigo-600 uppercase">Seu Amigo Ganha</p>
              <p className="text-base sm:text-lg md:text-2xl font-bold text-indigo-700 mt-0.5 md:mt-1">{formatIndicadoReward(settings)}</p>
              <p className="mt-1 md:mt-2 text-[9px] md:text-[10px] text-indigo-600/80 leading-tight">Benefício no cadastro</p>
            </div>
          </div>

          <div className="space-y-2 md:space-y-4">
            <h4 className="text-sm md:text-base font-medium text-[#1a1a1a]">Regras da Recompensa</h4>
            <ul className="space-y-1.5 md:space-y-2 text-xs md:text-sm text-[#1a1a1a]/70">
              <li className="flex items-start gap-2">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span>O indicador ganha <strong>{formatIndicadorReward(settings)}</strong> após o pagamento da 1ª fatura do indicado (10% do valor bruto, limitado ao teto).</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span>O indicado recebe <strong>{formatIndicadoReward(settings)}</strong> automaticamente ao contratar o 1º serviço.</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                <span>O beneficio do indicado é aplicado antes da 1ª fatura.</span>
              </li>
            </ul>
          </div>

          <button 
            onClick={() => { setIsAnnouncementOpen(false); setIsModalOpen(true); }}
            className="btn-primary w-full py-3 md:py-4 text-sm md:text-base mt-2"
          >
            Entendi e Quero Indicar
          </button>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Indicação" size="full">
        <div className="space-y-8">
          {step === 1 ? (
            <div className="space-y-6">
              <div className="rounded-2xl bg-neutral-100 p-6 ring-1 ring-neutral-300">
                <h4 className="font-medium text-[#1a1a1a] mb-4 flex items-center gap-2">
                  <Info className="h-5 w-5 text-[#1a1a1a]/60" />
                  Confirme seus dados
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Seu Nome</p>
                    <p className="font-medium text-[#1a1a1a] mt-1">{cliente?.nome}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Seu CPF</p>
                    <p className="font-medium text-[#1a1a1a] mt-1">{cliente?.cpf}</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-[#1a1a1a]/60 leading-relaxed">Para indicar um amigo e ganhar bônus, confirme se seus dados acima estão corretos. O bônus será creditado em sua carteira após a conclusão do primeiro serviço do indicado.</p>
              <button 
                onClick={() => setStep(2)}
                className="btn-primary w-full py-4 text-base"
              >
                Confirmar e Prosseguir
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1a1a1a]/60">Nome do Indicado</label>
                  <input 
                    type="text" 
                    placeholder="Nome completo ou apelido" 
                    value={formData.indicado_nome}
                    onChange={e => {
                      const value = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').toUpperCase();
                      setFormData({...formData, indicado_nome: value});
                    }}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1a1a1a]/60">WhatsApp do Indicado *</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="(00) 00000-0000" 
                    value={formData.whatsapp_indicado}
                    onChange={e => setFormData({...formData, whatsapp_indicado: maskPhone(e.target.value)})}
                    maxLength={15}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-100 flex gap-4">
                <Users className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 leading-relaxed">
                  Ao confirmar, a indicação será vinculada ao número informado com validade de <strong className="font-semibold">15 dias</strong>. 
                  O indicado deve informar este mesmo número de Celular ao realizar seu primeiro acesso para liberar o cadastro.
                </p>
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  onClick={() => setStep(1)}
                  className="btn-secondary flex-1"
                >
                  Voltar
                </button>
                <button 
                  disabled={!formData.whatsapp_indicado}
                  onClick={handleCreateIndicacao}
                  className="btn-primary flex-1"
                >
                  Confirmar Indicação
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
