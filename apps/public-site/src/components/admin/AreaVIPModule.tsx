import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Crown, 
  Trophy, 
  Medal, 
  Zap, 
  Users, 
  Settings, 
  Plus, 
  Save, 
  Trash2, 
  Edit2, 
  Search,
  Filter,
  UserCheck,
  AlertTriangle,
  Star,
  Check,
  Power,
  EyeOff,
  Eye,
  ShieldAlert,
  ShieldCheck,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { VIP_LEVELS, VIPLevel } from '../../constants';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { logService } from '../../lib/logService';
import { formatDate } from '../../lib/utils';
import { callAdminRpc } from '../../lib/adminRpc';

const getLevelStyles = (level: VIPLevel) => {
  switch (level.visualStyle) {
    case 'copper':
      return {
        bg: 'bg-gradient-to-br from-[#804a00] via-[#cd7f32] to-[#804a00]',
        text: 'text-white',
        accent: 'bg-white/20 hover:bg-white/30',
        glow: 'bg-orange-500/30',
        border: 'border-orange-500/30'
      };
    case 'silver':
      return {
        bg: 'bg-gradient-to-br from-[#a0a0a0] via-[#e0e0e0] to-[#b0b0b0]',
        text: 'text-neutral-900',
        accent: 'bg-white/40 hover:bg-white/60',
        glow: 'bg-white/50',
        border: 'border-white/50'
      };
    case 'gold-black':
      return {
        bg: 'bg-gradient-to-br from-[#000000] via-[#1a1a1a] to-[#000000]',
        text: 'text-[#ffd700]',
        accent: 'bg-[#ffd700]/10 hover:bg-[#ffd700]/20',
        glow: 'bg-[#ffd700]/10',
        border: 'border-[#ffd700]/30'
      };
    case 'diamond':
      return {
        bg: 'bg-gradient-to-br from-[#004e92] via-[#000428] to-[#004e92]',
        text: 'text-[#b9f2ff]',
        accent: 'bg-[#b9f2ff]/10 hover:bg-[#b9f2ff]/20',
        glow: 'bg-[#b9f2ff]/30',
        border: 'border-[#b9f2ff]/40'
      };
    case 'black-luxury':
      return {
        bg: 'bg-gradient-to-br from-[#000000] via-[#111111] to-[#000000]',
        text: 'text-white',
        accent: 'bg-white/10 hover:bg-white/20',
        glow: 'bg-white/10',
        border: 'border-white/20'
      };
    default: // clean
      return {
        bg: 'bg-white',
        text: 'text-neutral-900',
        accent: 'bg-neutral-100 hover:bg-neutral-200',
        glow: 'bg-indigo-500/5',
        border: 'border-neutral-200'
      };
  }
};

export function AreaVIPModule({ initialItemId, colaboradorId, colaboradorNome }: { initialItemId?: string, colaboradorId?: string, colaboradorNome?: string }) {
  const [levels, setLevels] = useState<VIPLevel[]>(VIP_LEVELS);
  const [editingLevel, setEditingLevel] = useState<VIPLevel | null>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    distribution: [] as { level: string; count: number; color: string }[]
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [manualLevelModal, setManualLevelModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'painel' | 'niveis' | 'controle'>('painel');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Estado de controle do módulo ---
  const [moduloAtivo, setModuloAtivo] = useState(true);
  const [moduloOculto, setModuloOculto] = useState(false);
  const [savingModuleState, setSavingModuleState] = useState(false);
  const [confirmDesativar, setConfirmDesativar] = useState(false);

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && clients.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`client-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente
          const client = clients.find(c => c.id === initialItemId);
          if (client) {
            setSelectedClient(client);
            setManualLevelModal(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, clients]);

  useEffect(() => {
    const isMounted = { current: true };
    fetchLevels(isMounted);
    fetchStats(isMounted);
    fetchClients(isMounted);
    fetchModuleConfig(isMounted);

    // Adiciona assinatura em tempo real para sincronizar dados automaticamente
    const channel = supabase
      .channel('area-vip-admin-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_levels',
        },
        () => {
          fetchLevels();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'clientes',
        },
        () => {
          fetchClients();
          fetchStats();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system_settings',
        },
        () => {
          fetchModuleConfig();
        }
      )
      .subscribe();

    return () => {
      isMounted.current = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchModuleConfig = async (isMounted = { current: true }) => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['modulo_area_vip_ativo', 'modulo_area_vip_oculto']);
      if (data && isMounted.current) {
        const ativo = data.find(s => s.key === 'modulo_area_vip_ativo')?.value;
        const oculto = data.find(s => s.key === 'modulo_area_vip_oculto')?.value;
        setModuloAtivo(ativo !== 'false');
        setModuloOculto(oculto === 'true');
      }
    } catch (error) {
      console.error('Erro ao carregar configuração do módulo VIP:', error);
    }
  };

  const handleToggleAtivo = async () => {
    if (moduloAtivo && !confirmDesativar) {
      setConfirmDesativar(true);
      return;
    }
    setSavingModuleState(true);
    try {
      const novoAtivo = !moduloAtivo;
      const settingsToSave: { key: string; value: string }[] = [
        { key: 'modulo_area_vip_ativo', value: String(novoAtivo) }
      ];
      // Se reativando, garante que o módulo não fique oculto
      if (novoAtivo) {
        settingsToSave.push({ key: 'modulo_area_vip_oculto', value: 'false' });
      }
      const success = await callAdminRpc<boolean>('gsa_admin_upsert_settings', {
        p_settings: settingsToSave
      });
      if (!success) throw new Error('Erro ao salvar');

      await logService.logAction({
        acao: novoAtivo ? 'ATIVAR_MODULO_AREA_VIP' : 'DESATIVAR_MODULO_AREA_VIP',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Módulo Área VIP foi ${novoAtivo ? 'ativado' : 'desativado'} pelo administrador.`
      });

      toast.success(novoAtivo ? '✅ Módulo Área VIP ativado com sucesso!' : '🔴 Módulo Área VIP desativado. Clientes não poderão acessá-lo.');
      setConfirmDesativar(false);
      fetchModuleConfig();
    } catch (error: any) {
      toast.error('Erro ao alterar estado do módulo: ' + error.message);
    } finally {
      setSavingModuleState(false);
    }
  };

  const handleToggleOculto = async () => {
    if (moduloAtivo) {
      toast.error('Desative o módulo antes de ocultá-lo.');
      return;
    }
    setSavingModuleState(true);
    try {
      const novoOculto = !moduloOculto;
      const success = await callAdminRpc<boolean>('gsa_admin_upsert_settings', {
        p_settings: [{ key: 'modulo_area_vip_oculto', value: String(novoOculto) }]
      });
      if (!success) throw new Error('Erro ao salvar');

      await logService.logAction({
        acao: novoOculto ? 'OCULTAR_MODULO_AREA_VIP' : 'EXIBIR_MODULO_AREA_VIP',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Módulo Área VIP foi ${novoOculto ? 'ocultado do' : 'exibido no'} painel do cliente.`
      });

      toast.success(novoOculto ? '👁️ Módulo ocultado do painel dos clientes.' : '👁️ Módulo agora visível no painel dos clientes.');
      fetchModuleConfig();
    } catch (error: any) {
      toast.error('Erro ao alterar visibilidade: ' + error.message);
    } finally {
      setSavingModuleState(false);
    }
  };

  const fetchLevels = async (isMounted = { current: true }) => {
    try {
      const { data, error } = await supabase
        .from('client_levels')
        .select('*')
        .order('pontos_minimos', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const mappedLevels: VIPLevel[] = data.map(dbLevel => ({
          id: dbLevel.nome_nivel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
          name: dbLevel.nome_nivel,
          minPoints: dbLevel.pontos_minimos,
          maxPoints: dbLevel.pontos_maximos,
          multiplier: Number(dbLevel.pontos_por_real),
          color: dbLevel.cor || '#f5f5f5',
          textColor: dbLevel.cor_texto || '#1a1a1a',
          visualStyle: (dbLevel.visual_style as any) || 'clean',
          discountPercentage: 0,
          feePercentage: 5,
          price: Number(dbLevel.preco),
          benefits: [`Multiplicador de pontos: ${Number(dbLevel.pontos_por_real)}x`],
          exclusiveBenefits: [`Multiplicador de pontos: ${Number(dbLevel.pontos_por_real)}x`]
        }));
        if (isMounted.current) {
          setLevels(mappedLevels);
        }
      }
    } catch (error) {
      console.error('Error fetching levels:', error);
    }
  };

  const fetchClients = async (isMounted = { current: true }) => {
    try {
      if (isMounted.current) setLoading(true);
      // Tenta buscar com todas as colunas (incluindo as de ajuste manual e nível automático)
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, pontos_totais, nivel_manual_id, nivel_manual_info, nivel_id, auto_level:client_levels!nivel_id(*), manual_level:client_levels!nivel_manual_id(*)')
        .order('nome');
      
      if (error) {
        // Se falhar (provavelmente colunas faltando no banco), tenta busca com menos colunas
        const { data: basicData, error: basicError } = await supabase
          .from('clientes')
          .select('id, nome, pontos_totais, nivel_manual_id, nivel_manual_info, nivel_id')
          .order('nome');
        
        if (basicError) throw basicError;
        if (isMounted.current) setClients(basicData || []);
      } else {
        if (isMounted.current) setClients(data || []);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Erro ao carregar lista de clientes');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleManualLevelUpdate = async (clientId: string, levelId: string | null) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const levelName = levelId ? levels.find(l => l.id === levelId)?.name : null;
      const auditTag = colaboradorNome ? ` [POR: ${colaboradorNome}]` : '';
      const info = levelId ? `Ajuste manual realizado pelo administrativo em ${formatDate(new Date())}${auditTag}` : null;

      const updateData: any = { 
        nivel_manual_id: null,
        nivel_manual_info: info
      };

      // If we are setting a level, find the corresponding UUID in the database
      if (levelName) {
        const { data: dbLevel } = await supabase
          .from('client_levels')
          .select('id')
          .eq('nome_nivel', levelName)
          .maybeSingle();
        
        if (dbLevel) {
          updateData.nivel_id = dbLevel.id;
          updateData.nivel_manual_id = dbLevel.id;
          // NOTE: plano_vip column does not exist — do not set it
        } else {
          toast.error('Nível não encontrado no banco de dados');
          return;
        }
      }

      // Get current level and points before update for history
      let cData;
      try {
        const { data, error } = await supabase.from('clientes').select('nivel_id, pontos_totais').eq('id', clientId).single();
        if (error) throw error;
        cData = data;
      } catch (err) {
        toast.error('Erro ao buscar dados do cliente.');
        return;
      }
      const currentLevelId = cData?.nivel_id;
      const clientPoints = cData?.pontos_totais || 0;

      let targetLevelId = updateData.nivel_id;

      // If we are restoring to organic level, find what it should be based on points
      if (!targetLevelId) {
        const { data: autoLvl } = await supabase
          .from('client_levels')
          .select('id')
          .lte('pontos_minimos', clientPoints)
          .order('pontos_minimos', { ascending: false })
          .limit(1)
          .single();
        
        targetLevelId = autoLvl?.id;
        // Update the main level_id to the organic one
        updateData.nivel_id = targetLevelId;
        // NOTE: plano_vip column does not exist — do not set it
      }

      const { error } = await supabase
        .from('clientes')
        .update(updateData)
        .eq('id', clientId);

      if (error) throw error;

      // Record in history so that client realtime subscription (level_history INSERT) fires
      try {
        const { error: histError } = await supabase.from('level_history').insert([{
          cliente_id: clientId,
          nivel_anterior_id: currentLevelId,
          nivel_novo_id: targetLevelId
        }]);
        if (histError) throw histError;
      } catch (err) {
        toast.error('Erro ao salvar o histórico de nível.');
      }

      if (levelName) {
        await notificationService.notifyClient(
          clientId,
          'Nível VIP Atualizado',
          `Seu nível VIP foi ajustado manualmente para ${levelName}.`,
          'area_vip',
          'nivel_alterado',
          { prioridade: 'normal', contexto: { nivel: levelName, tipo: 'manual' } }
        );
      } else {
        await notificationService.notifyClient(
          clientId,
          'Nível VIP Restaurado',
          `Seu nível VIP voltou a ser calculado automaticamente com base nos seus pontos.`,
          'area_vip',
          'nivel_alterado',
          { prioridade: 'normal', contexto: { tipo: 'automatico' } }
        );
      }
      
      // Log Action
      await logService.logAction({
        acao: 'ALTERAR_NIVEL_VIP_MANUAL',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Ajuste manual de nível VIP para o cliente #${clientId.slice(0, 8)} para o nível: ${levelName || 'Automático'}`
      });

      toast.success('Nível do cliente ajustado manualmente!');
      setManualLevelModal(false);
      setSelectedClient(null);
      fetchClients();
      fetchStats();
    } catch (error: any) {
      console.error('Erro ao ajustar nível:', error);
      toast.error(error.message || 'Erro ao ajustar nível');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchStats = async (isMounted = { current: true }) => {
    try {
      if (isMounted.current) setLoading(true);
      const { data: clientes, error } = await supabase
        .from('clientes')
        .select('pontos_totais, nivel_manual_id, nivel_id, auto_level:client_levels!nivel_id(*), manual_level:client_levels!nivel_manual_id(*)');

      if (error) throw error;

      const total = clientes?.length || 0;
      const distribution = levels.map(level => {
        const count = clientes?.filter(c => {
          const points = c.pontos_totais || 0;
          const autoLevelData = c.auto_level as any;
          const manualLevelData = c.manual_level as any;
          
          const autoLevel = autoLevelData ? levels.find(l => 
            l.name.toLowerCase() === autoLevelData.nome_nivel?.toLowerCase()
          ) : levels.find(l => points >= l.minPoints && (l.maxPoints === null || points <= l.maxPoints)) || levels[0];

          const manualLevel = manualLevelData ? levels.find(l => 
            l.name.toLowerCase() === manualLevelData.nome_nivel?.toLowerCase()
          ) : null;
          
          const currentLevel = manualLevel || autoLevel;

          return currentLevel?.name === level.name;
        }).length || 0;

        return {
          level: level.name,
          count,
          color: level.color
        };
      });

      if (isMounted.current) {
        setStats({
          totalUsers: total,
          distribution
        });
      }
    } catch (error) {
      console.error('Error fetching VIP stats:', error);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const handleSaveLevel = async () => {
    if (!editingLevel || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('client_levels')
        .update({
          pontos_minimos: editingLevel.minPoints,
          pontos_maximos: editingLevel.maxPoints,
          pontos_por_real: editingLevel.multiplier,
          taxa_saque_transferencia: 5,
          desconto_porcentagem: 0,
          cor: editingLevel.color,
          cor_texto: editingLevel.textColor,
          visual_style: editingLevel.visualStyle,
          preco: editingLevel.price,
          benefits: [`Multiplicador de pontos: ${editingLevel.multiplier}x`],
          exclusive_benefits: [`Multiplicador de pontos: ${editingLevel.multiplier}x`]
        })
        .eq('nome_nivel', editingLevel.name);

      if (error) throw error;

      const normalizedLevel = { ...editingLevel, discountPercentage: 0, feePercentage: 5, benefits: [`Multiplicador de pontos: ${editingLevel.multiplier}x`], exclusiveBenefits: [`Multiplicador de pontos: ${editingLevel.multiplier}x`] };
      const newLevels = levels.map(l => l.name === editingLevel.name ? normalizedLevel : l);
      setLevels(newLevels);
      
      // Log Action
      await logService.logAction({
        acao: 'CONFIGURAR_NIVEL_VIP',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Configurações do nível VIP ${editingLevel.name} foram atualizadas.`
      });

      setEditingLevel(null);
      toast.success('Nível VIP atualizado com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar nível: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4">
      {/* Module Header */}
      <div className="bg-[#1a1a1a] p-3 md:p-4 rounded-[2rem] md:rounded-[2.5rem] text-white relative shadow-2xl mb-3">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-3 md:gap-3">
          <div className="flex flex-row items-center justify-between gap-6 border-b border-white/5 pb-3">
            <div className="flex items-center gap-4">
              <div className="h-6 w-1 bg-amber-500 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.6)]"></div>
              <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-100 to-neutral-400 whitespace-nowrap overflow-hidden">
                Ecossistema VIP
              </h1>
            </div>
            <Crown className="hidden md:block h-8 w-8 text-white/5" />
          </div>

          {/* Indicador de status do módulo */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest w-fit ${
            moduloAtivo 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : moduloOculto 
                ? 'bg-neutral-500/20 text-neutral-400'
                : 'bg-red-500/20 text-red-400'
          }`}>
            {moduloAtivo 
              ? <><ShieldCheck className="h-3 w-3" /> Módulo Ativo</> 
              : moduloOculto 
                ? <><EyeOff className="h-3 w-3" /> Oculto para Clientes</>
                : <><ShieldAlert className="h-3 w-3" /> Módulo Desativado</>
            }
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-1.5">
            {[
              { id: 'painel', label: 'Painel Geral', icon: Zap },
              { id: 'niveis', label: 'Configurar Níveis', icon: Settings },
              { id: 'controle', label: 'Controle do Módulo', icon: Power }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex flex-1 md:flex-none items-center justify-center gap-2 py-2.5 px-3 md:px-4 rounded-xl transition-all text-[9px] md:text-[10px] uppercase tracking-widest border
                    ${isActive 
                      ? tab.id === 'controle'
                        ? 'bg-white text-red-600 shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-white border-b-4 border-b-red-500'
                        : 'bg-white text-amber-600 shadow-[0_10px_20px_rgba(0,0,0,0.3)] border-white border-b-4 border-b-amber-500' 
                      : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-white/5'}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">

        {/* ===================== ABA CONTROLE ===================== */}
        {activeTab === 'controle' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

            {/* Banner de status atual */}
            <div className={`rounded-3xl p-6 ring-1 flex items-start gap-4 ${
              moduloAtivo 
                ? 'bg-emerald-50 ring-emerald-200'
                : 'bg-red-50 ring-red-200'
            }`}>
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
                moduloAtivo ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
              }`}>
                {moduloAtivo ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
              </div>
              <div>
                <h3 className={`text-lg font-black ${
                  moduloAtivo ? 'text-emerald-900' : 'text-red-900'
                }`}>
                  {moduloAtivo ? 'Módulo Ativo' : 'Módulo Desativado'}
                </h3>
                <p className={`text-sm mt-1 ${
                  moduloAtivo ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {moduloAtivo 
                    ? 'O módulo Área VIP está ativo. Todos os clientes podem acessá-lo normalmente.' 
                    : moduloOculto
                      ? 'O módulo está desativado e oculto. Ele não aparece no painel dos clientes.'
                      : 'O módulo está desativado. Clientes veem uma mensagem de indisponibilidade ao tentarem acessá-lo.'
                  }
                </p>
              </div>
            </div>

            {/* Card: Ativar / Desativar */}
            <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                    moduloAtivo ? 'bg-emerald-100 text-emerald-600' : 'bg-neutral-100 text-neutral-400'
                  }`}>
                    <Power size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-neutral-900">Ativação do Módulo</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {moduloAtivo 
                        ? 'Clique para desativar o módulo em todo o sistema' 
                        : 'Clique para reativar o módulo para todos os clientes'
                      }
                    </p>
                  </div>
                </div>
                <button
                  id="btn-toggle-vip-ativo"
                  onClick={handleToggleAtivo}
                  disabled={savingModuleState}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none disabled:opacity-50 ${
                    moduloAtivo ? 'bg-emerald-500' : 'bg-neutral-300'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                    moduloAtivo ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Confirmação de desativação */}
              <AnimatePresence>
                {confirmDesativar && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-6 rounded-2xl bg-red-50 ring-1 ring-red-200 p-5"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-black text-red-900">Confirmar Desativação</p>
                        <p className="text-xs text-red-700 mt-1">
                          Ao desativar, <strong>nenhum cliente</strong> conseguirá acessar o módulo Área VIP. 
                          Eles verão uma mensagem de "Módulo desativado por tempo indeterminado".
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmDesativar(false)}
                        className="flex-1 py-2.5 rounded-xl bg-white text-neutral-700 font-bold text-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        id="btn-confirmar-desativar-vip"
                        onClick={handleToggleAtivo}
                        disabled={savingModuleState}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 disabled:opacity-50"
                      >
                        {savingModuleState ? 'Desativando...' : 'Sim, Desativar'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Card: Ocultar / Exibir */}
            <div className={`rounded-3xl bg-white p-8 shadow-sm ring-1 transition-all ${
              moduloAtivo ? 'ring-neutral-100 opacity-50' : 'ring-neutral-200'
            }`}>
              <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                    moduloOculto ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    {moduloOculto ? <EyeOff size={24} /> : <Eye size={24} />}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-neutral-900">Ocultar do Painel do Cliente</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {moduloAtivo 
                        ? '⚠️ Desative o módulo antes de ocultá-lo'
                        : moduloOculto 
                          ? 'O módulo está oculto. Clientes não o veem no menu nem no dashboard'
                          : 'O módulo aparece no menu, mas mostra mensagem de desativado'
                      }
                    </p>
                  </div>
                </div>
                <button
                  id="btn-toggle-vip-oculto"
                  onClick={handleToggleOculto}
                  disabled={savingModuleState || moduloAtivo}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
                    moduloOculto ? 'bg-neutral-800' : 'bg-neutral-300'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                    moduloOculto ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Informativo sobre dependência */}
              {moduloAtivo && (
                <div className="mt-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <p className="text-[11px] text-amber-800 font-medium">
                    Para ocultar o módulo, é necessário primeiro <strong>desativá-lo</strong>.
                  </p>
                </div>
              )}

              {/* Informativo sobre o que acontece com clientes */}
              {!moduloAtivo && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className={`rounded-xl p-4 ring-1 transition-all ${
                    !moduloOculto ? 'ring-indigo-200 bg-indigo-50' : 'ring-neutral-100 bg-neutral-50 opacity-50'
                  }`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">Visível (desativado)</p>
                    <p className="text-xs text-neutral-600">Módulo aparece no menu, mas ao clicar exibe mensagem de indisponibilidade</p>
                  </div>
                  <div className={`rounded-xl p-4 ring-1 transition-all ${
                    moduloOculto ? 'ring-neutral-900/20 bg-neutral-100' : 'ring-neutral-100 bg-neutral-50 opacity-50'
                  }`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-700 mb-1">Oculto</p>
                    <p className="text-xs text-neutral-600">Módulo removido completamente do menu lateral e do dashboard do cliente</p>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {activeTab === 'painel' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 md:p-5 rounded-3xl shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-4 mb-2">
            <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Total de Clientes</p>
              <h4 className="text-2xl font-black text-neutral-900">{stats.totalUsers}</h4>
            </div>
          </div>
          <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden flex">
            {stats.distribution.map((d, i) => (
              <div 
                key={i}
                style={{ 
                  width: `${(d.count / (stats.totalUsers || 1)) * 100}%`,
                  backgroundColor: d.color 
                }}
                className="h-full"
              />
            ))}
          </div>
        </div>

        <div className="bg-white p-4 md:p-5 rounded-3xl shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-4 mb-2">
            <div className="h-10 w-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Trophy size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Nível Mais Comum</p>
              <h4 className="text-2xl font-black text-neutral-900">
                {stats.distribution.sort((a, b) => b.count - a.count)[0]?.level || 'N/A'}
              </h4>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 md:p-5 rounded-3xl shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-4 mb-2">
            <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Crown size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-500 uppercase tracking-wider">Membros Black</p>
              <h4 className="text-2xl font-black text-neutral-900">
                {stats.distribution.find(d => d.level === 'Black')?.count || 0}
              </h4>
            </div>
          </div>
        </div>
      </div>

      {/* Busca de Clientes */}
      <div className="flex justify-end px-2">
        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text"
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white shadow-sm border border-neutral-200 rounded-xl py-3 pl-10 pr-4 text-xs font-medium text-neutral-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder-neutral-300"
          />
        </div>
      </div>

          </div>
        )}

        {activeTab === 'niveis' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
        {/* Client Management Panel */}
        <div className="lg:col-span-3 bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-sm ring-1 ring-black/5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2">
                  <UserCheck size={24} className="text-indigo-600" />
                  Ajuste Manual de Nível
                </h3>
                <p className="text-sm text-neutral-500 font-medium">Gerencie o nível VIP de clientes específicos manualmente.</p>
              </div>
            </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="pb-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cliente</th>
                  <th className="pb-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Pontos Atuais</th>
                  <th className="pb-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Nível Atual</th>
                  <th className="pb-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status de Ajuste</th>
                  <th className="pb-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
                      <p className="text-xs font-black text-neutral-400 uppercase tracking-widest mt-4">Carregando clientes...</p>
                    </td>
                  </tr>
                ) : (
                  <>
                    {clients.filter(c => c.nome.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10).map((client) => {
                      const points = client.pontos_totais || 0;
                      const autoLevelData = client.auto_level as any;
                      const manualLevelData = client.manual_level as any;

                      const autoLevel = autoLevelData ? levels.find(l => 
                        l.name.toLowerCase() === autoLevelData.nome_nivel?.toLowerCase()
                      ) : levels.find(l => points >= l.minPoints && (l.maxPoints === null || points <= l.maxPoints)) || levels[0];
                      
                      const manualLevel = manualLevelData ? levels.find(l => 
                        l.name.toLowerCase() === manualLevelData.nome_nivel?.toLowerCase()
                      ) : null;
                      
                      const currentLevel = manualLevel || autoLevel;

                      return (
                        <tr 
                          key={client.id} 
                          id={`client-${client.id}`}
                          className={`group transition-colors ${
                            highlightedId === client.id 
                              ? 'bg-indigo-50 ring-2 ring-indigo-500 z-10' 
                              : ''
                          }`}
                        >
                          <td className="py-4">
                            <p className="font-black text-neutral-900">{client.nome}</p>
                          </td>
                          <td className="py-4">
                            <span className="font-bold text-neutral-600">{points.toLocaleString()} pts</span>
                          </td>
                          <td className="py-4">
                            <span 
                              className="px-3 py-1 rounded-full text-[10px] font-black text-white shadow-sm"
                              style={{ backgroundColor: currentLevel.color }}
                            >
                              {currentLevel.name}
                            </span>
                          </td>
                          <td className="py-4">
                            {client.nivel_manual_id ? (
                              <div className="flex items-center gap-2 text-amber-600">
                                <AlertTriangle size={14} />
                                <span className="text-[10px] font-black uppercase tracking-wider">Ajuste Manual</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-black text-neutral-300 uppercase tracking-wider">Automático</span>
                            )}
                          </td>
                          <td className="py-4 text-right">
                            <button 
                              onClick={() => {
                                setSelectedClient(client);
                                setManualLevelModal(true);
                              }}
                              className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
                            >
                              Ajustar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {clients.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-neutral-400 font-medium">
                          Nenhum cliente encontrado no sistema.
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Levels List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2">
              <Settings size={20} className="text-indigo-600" />
              Configuração de Níveis
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {levels.map((level, index) => {
              const levelStyles = getLevelStyles(level);
              return (
              <motion.div
                key={level.name}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4, ease: "easeOut" }}
                className={`relative overflow-hidden p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 group border text-left ${levelStyles.border} ${levelStyles.bg}`}
              >
                {/* Subtle Glow inside the card */}
                <div className={`absolute -top-12 -right-12 w-48 h-48 ${levelStyles.glow} rounded-full blur-3xl opacity-50 group-hover:scale-110 group-hover:opacity-80 transition-all duration-700`}></div>
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div 
                      className={`h-16 w-16 md:h-20 md:w-20 rounded-2xl md:rounded-[1.5rem] flex items-center justify-center shadow-lg ring-1 ring-white/20 backdrop-blur-md ${levelStyles.accent} transition-transform duration-500 group-hover:scale-110`}
                    >
                      {index === 0 ? <Star size={32} className={`${levelStyles.text} drop-shadow-md`} /> : 
                       index === levels.length - 1 ? <Crown size={32} className={`${levelStyles.text} drop-shadow-md`} /> : <Medal size={40} className={`${levelStyles.text} drop-shadow-md`} />}
                    </div>
                    <div>
                      <h4 className={`text-2xl md:text-3xl font-black ${levelStyles.text} tracking-tight drop-shadow-sm`}>{level.name}</h4>
                      <p className={`text-sm font-medium ${levelStyles.text} opacity-70 mt-1`}>
                        A partir de <span className="font-black text-lg ml-1">{level.minPoints.toLocaleString()} pts</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-end md:items-center gap-4 border-t border-white/10 pt-4 mt-6">
                    <div className="flex gap-6 w-full justify-between md:justify-end">
                      <div className="text-left md:text-right">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${levelStyles.text} opacity-60 mb-0.5`}>Valor de Compra</p>
                        <p className={`text-xl font-black tracking-tighter ${levelStyles.text} drop-shadow-sm`}>
                          {level.price > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(level.price) : 'Gratuito'}
                        </p>
                      </div>
                      <div className="text-right md:border-l border-white/10 md:pl-6">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${levelStyles.text} opacity-60 mb-0.5`}>Multiplicador</p>
                        <p className={`text-xl font-black tracking-tighter ${levelStyles.text} drop-shadow-sm`}>{level.multiplier}x</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setEditingLevel(level)}
                      className={`p-4 rounded-2xl transition-all duration-300 active:scale-95 shadow-sm ring-1 ring-white/10 ${levelStyles.accent} flex items-center justify-center shrink-0 w-full md:w-auto mt-4 md:mt-0`}
                      title="Editar Nível VIP"
                    >
                      <Edit2 size={20} className={`${levelStyles.text} opacity-80 group-hover:opacity-100 transition-opacity mr-2 md:mr-0`} />
                      <span className="md:hidden font-bold">Editar Nível</span>
                    </button>
                  </div>
                </div>

                <div className="relative z-10 mt-8 flex flex-wrap gap-2">
                  {level.benefits.map((benefit, bIndex) => (
                    <span 
                      key={bIndex}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold ${levelStyles.text} ${levelStyles.accent} ring-1 ring-white/10 backdrop-blur-sm shadow-sm`}
                    >
                      {benefit}
                    </span>
                  ))}
                </div>
              </motion.div>
            )})}
          </div>
        </div>

        {/* Edit Panel */}
        <div className="lg:col-span-1">
          {editingLevel ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-8 rounded-[2.5rem] shadow-xl ring-1 ring-black/5 sticky top-8"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-neutral-900">Editar Nível</h3>
                <button 
                  onClick={() => setEditingLevel(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  Cancelar
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-neutral-400 uppercase tracking-widest mb-2">Nome do Nível</label>
                  <input 
                    type="text"
                    value={editingLevel.name}
                    onChange={(e) => setEditingLevel({...editingLevel, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-50 border-none ring-1 ring-neutral-200 focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black text-neutral-500 uppercase tracking-widest mb-2">
                      Pontos Necessários para Alcance
                    </label>
                    <input  
                      type="number"
                      value={editingLevel.minPoints}
                      inputMode="numeric"
onChange={(e) => setEditingLevel({...editingLevel, minPoints: parseInt(e.target.value)})}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-50 border-none ring-1 ring-neutral-200 focus:ring-2 focus:ring-indigo-500 font-bold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-400 uppercase tracking-widest mb-2">Mult. Pontos</label>
                    <input  
                      type="number"
                      step="0.1"
                      value={editingLevel.multiplier}
                      inputMode="numeric"
onChange={(e) => setEditingLevel({...editingLevel, multiplier: parseFloat(e.target.value)})}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-50 border-none ring-1 ring-neutral-200 focus:ring-2 focus:ring-indigo-500 font-bold"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                  O nível altera somente os pontos recebidos por real gasto. Taxas e descontos são iguais para todos.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black text-neutral-500 uppercase tracking-widest mb-2">
                      Valor da Compra do Nível (R$)
                    </label>
                    <input  
                      type="number"
                      value={editingLevel.price}
                      inputMode="numeric"
onChange={(e) => setEditingLevel({...editingLevel, price: parseFloat(e.target.value)})}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-50 border-none ring-1 ring-neutral-200 focus:ring-2 focus:ring-indigo-500 font-bold text-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-neutral-400 uppercase tracking-widest mb-2">Cor do Nível</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color"
                        value={editingLevel.color}
                        onChange={(e) => setEditingLevel({...editingLevel, color: e.target.value})}
                        className="h-10 w-10 rounded-lg cursor-pointer"
                      />
                      <span className="text-sm font-mono font-bold text-neutral-500 uppercase">{editingLevel.color}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-400 uppercase tracking-widest mb-2">Cor do Texto</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color"
                        value={editingLevel.textColor}
                        onChange={(e) => setEditingLevel({...editingLevel, textColor: e.target.value})}
                        className="h-10 w-10 rounded-lg cursor-pointer"
                      />
                      <span className="text-sm font-mono font-bold text-neutral-500 uppercase">{editingLevel.textColor}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-400 uppercase tracking-widest mb-2">Estilo Visual</label>
                  <select 
                    value={editingLevel.visualStyle}
                    onChange={(e) => setEditingLevel({...editingLevel, visualStyle: e.target.value as any})}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-50 border-none ring-1 ring-neutral-200 focus:ring-2 focus:ring-indigo-500 font-bold capitalize"
                  >
                    <option value="clean">Clean (White)</option>
                    <option value="copper">Bronze (Copper Gradient)</option>
                    <option value="silver">Prata (Silver Gradient)</option>
                    <option value="gold-black">Ouro (Gold-Black Gradient)</option>
                    <option value="diamond">Diamante (Diamond Gradient)</option>
                    <option value="black-luxury">Black (Luxury Black)</option>
                  </select>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
                  Benefício deste nível: multiplicador de pontos de {editingLevel.multiplier}x.
                </div>

                <button 
                  onClick={handleSaveLevel}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save size={18} />
                  Salvar Alterações
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="bg-neutral-50 border-2 border-dashed border-neutral-200 rounded-[2.5rem] p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-white flex items-center justify-center text-neutral-300 mx-auto mb-4 shadow-sm">
                <Edit2 size={24} />
              </div>
              <h4 className="text-lg font-bold text-neutral-400">Selecione um nível para editar</h4>
              <p className="text-sm text-neutral-400 mt-2">Configure os limites e o multiplicador de pontos de cada nível.</p>
            </div>
          )}
        </div>
          </div>
        )}
      </div>

      {/* Manual Level Modal */}
      {manualLevelModal && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-[96vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl bg-white rounded-[3rem] p-6 md:p-10 shadow-2xl max-h-[90vh] flex flex-col"
          >
            <div className="flex-shrink-0">
              <h3 className="text-2xl font-black text-neutral-900 mb-2">Ajustar Nível VIP</h3>
              <p className="text-neutral-500 mb-6">
                Alterando o nível de <span className="text-neutral-900 font-bold">{selectedClient.nome}</span>.
                Esta alteração será exibida como ajuste manual.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              <button
                onClick={() => handleManualLevelUpdate(selectedClient.id, null)}
                disabled={isSubmitting}
                className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between disabled:opacity-50 ${!selectedClient.nivel_manual_id ? 'border-indigo-600 bg-indigo-50' : 'border-neutral-100 hover:border-neutral-200'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full bg-neutral-200"></div>
                  <span className="font-black text-neutral-900">Restaurar Automático</span>
                </div>
                {!selectedClient.nivel_manual_id ? (
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Atual</span>
                ) : (
                  <Check size={20} className="text-neutral-300" />
                )}
              </button>

              {levels.map((level, idx) => {
                const points = selectedClient.pontos_totais || 0;
                
                // Recalcula o nível atual do cliente para comparação
                const autoLevelData = selectedClient.auto_level as any;
                const manualLevelData = selectedClient.manual_level as any;
                const autoLevel = autoLevelData ? levels.find(l => 
                  l.name.toLowerCase() === autoLevelData.nome_nivel?.toLowerCase()
                ) : levels.find(l => points >= l.minPoints && (l.maxPoints === null || points <= l.maxPoints)) || levels[0];
                const manualLevel = manualLevelData ? levels.find(l => 
                  l.name.toLowerCase() === manualLevelData.nome_nivel?.toLowerCase()
                ) : null;
                const currentLevel = manualLevel || autoLevel;
                
                const currentIdx = levels.findIndex(l => l.id === currentLevel?.id);
                const isCurrent = currentLevel?.id === level.id;
                
                return (
                  <button
                    key={level.id}
                    onClick={() => handleManualLevelUpdate(selectedClient.id, level.id)}
                    disabled={isSubmitting}
                    className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between disabled:opacity-50 ${isCurrent ? 'border-indigo-600 bg-indigo-50' : 'border-neutral-100 hover:border-neutral-200'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-4 rounded-full" style={{ backgroundColor: level.color }}></div>
                      <div className="text-left">
                        <span className="font-black text-neutral-900 block">{level.name}</span>
                        {idx > currentIdx ? (
                          <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-wider">↑ Upgrade</span>
                        ) : idx < currentIdx ? (
                          <span className="text-[8px] font-bold text-rose-600 uppercase tracking-wider">↓ Downgrade</span>
                        ) : (
                          <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-wider">Nível Atual</span>
                        )}
                      </div>
                    </div>
                    {isCurrent ? (
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Atual</span>
                    ) : (
                      <Check size={20} className="text-transparent group-hover:text-neutral-200" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-shrink-0 pt-6">
              <button 
                onClick={() => {
                  setManualLevelModal(false);
                  setSelectedClient(null);
                }}
                className="w-full py-4 rounded-2xl bg-neutral-100 text-neutral-600 font-black uppercase tracking-widest hover:bg-neutral-200 transition-all"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
