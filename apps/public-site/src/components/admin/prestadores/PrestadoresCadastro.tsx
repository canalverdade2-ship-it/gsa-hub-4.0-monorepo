import React, { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';
import { Search, Filter, MoreVertical, CheckCircle, XCircle, Clock, AlertCircle, Eye, Trash2, UserPlus, Tag, Copy, Wallet, History, PlusCircle, MinusCircle, ArrowUpCircle, ArrowDownCircle, CreditCard, Building2, FileText, ClipboardList, Gift, Phone, Mail, Pencil, Save } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { formatCurrency, maskCPF, maskCNPJ, maskPhone, formatDate, formatDateTime, maskCEP } from '../../../lib/utils';
import { validarCPF, validarCNPJ, validarEmail } from '../../../utils/cpfValidator';
import { AdminPrestadorDocumentos } from './AdminPrestadorDocumentos';
import { AdminPrestadorVouchers } from './AdminPrestadorVouchers';
import { AdminPrestadorPremios } from './AdminPrestadorPremios';
import { AdminPrestadorPromocoes } from './AdminPrestadorPromocoes';
import { canDeleteRecord } from '../../../lib/deleteRequest';
import { toast } from 'react-hot-toast';
import { useAdminNotifications } from '../../../hooks/useAdminNotifications';
import { logService } from '../../../lib/logService';
import { notificationService } from '../../../lib/notificationService';
import { callAdminRpc } from '../../../lib/adminRpc';

export function PrestadoresCadastro({ 
  subTab, 
  initialItemId, 
  initialDetailsTab,
  colaboradorId, 
  colaboradorNome 
}: { 
  subTab?: string, 
  initialItemId?: string, 
  initialDetailsTab?: 'info' | 'documentos' | 'demandas' | 'carteira' | 'vouchers' | 'premios',
  colaboradorId?: string, 
  colaboradorNome?: string | null 
}) {
  const { pendencies, refreshCounts } = useAdminNotifications();
  const [prestadores, setPrestadores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(subTab || 'ativo');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'em_analise' | 'suspenso' | 'reprovado'>('all');

  useEffect(() => {
    if (subTab) setActiveTab(subTab);
  }, [subTab]);

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && prestadores.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`prestador-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente
          const prestador = prestadores.find(p => p.id === initialItemId);
          if (prestador) {
            setSelectedPrestador(prestador);
            if (initialDetailsTab) {
              setActiveDetailsTab(initialDetailsTab);
            }
            setIsModalOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, prestadores]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPrestador, setSelectedPrestador] = useState<any>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'info' | 'documentos' | 'demandas' | 'carteira' | 'vouchers' | 'premios'>('info');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [activeRegisterTab, setActiveRegisterTab] = useState<'basico' | 'contato' | 'atuacao'>('basico');
  const [prestadorToDelete, setPrestadorToDelete] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [newPrestadorData, setNewPrestadorData] = useState({
    tipo_cadastro: 'cpf' as 'cpf' | 'cnpj',
    nome_razao: '',
    nome_responsavel: '',
    documento: '',
    email: '',
    telefone: '',
    cep: '',
    numero: '',
    area_servico: '',
    observacoes: ''
  });

  useEffect(() => {
    fetchPrestadores();

    const channel = supabase
      .channel('prestadores-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'prestadores' }, (payload) => {
        setPrestadores(prev => {
          if (prev.some(p => p.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prestadores' }, (payload) => {
        setPrestadores(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'prestadores' }, (payload) => {
        setPrestadores(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPrestadores = async () => {
    try {
      const { data, error } = await supabase
        .from('prestadores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPrestadores(data || []);
    } catch (error) {
      console.error('Erro ao buscar prestadores:', error);
      toast.error('Erro ao carregar prestadores.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      let updateData: any = { status: newStatus };
      
      if (newStatus === 'ativo') {
        const credencial = Math.floor(100000 + Math.random() * 900000).toString();
        updateData.credencial_acesso = credencial;
      }

      const { error } = await supabase
        .from('prestadores')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await supabase.from('prestador_historico').insert([{
        prestador_id: id,
        acao: `Status alterado para ${newStatus}`,
        descricao: `Status atualizado pelo administrador.`
      }]).throwOnError();

      toast.success(`Status atualizado para ${newStatus}.`);

      // Notificar Prestador sobre a mudança de status
      const statusMessages: Record<string, { titulo: string; msg: string }> = {
        ativo: { titulo: '🎉 Cadastro Aprovado!', msg: 'Seu cadastro foi aprovado. Bem-vindo(a)! Você já pode acessar o painel.' },
        suspenso: { titulo: '⚠️ Conta Suspensa', msg: 'Sua conta foi suspensa temporariamente. Entre em contato com a administração.' },
        reprovado: { titulo: '❌ Cadastro Reprovado', msg: 'Seu cadastro foi reprovado. Entre em contato com o suporte para mais informações.' },
        em_analise: { titulo: '🔍 Cadastro em Análise', msg: 'Seus dados estão sendo analisados pela nossa equipe. Aguarde.' },
        pendente: { titulo: '⏳ Cadastro Pendente', msg: 'Seu cadastro requer informações adicionais. Verifique seu painel.' }
      };
      const notif = statusMessages[newStatus];
      if (notif) {
        await notificationService.notifyProvider(
          id,
          notif.titulo,
          notif.msg,
          'perfil',
          newStatus === 'ativo' ? 'prestador_cadastro_aprovado' : newStatus === 'suspenso' ? 'prestador_suspenso' : 'prestador_cadastro_rejeitado',
          { tab: 'info', prioridade: ['suspenso', 'reprovado'].includes(newStatus) ? 'alta' : 'normal' }
        );
      }

      // Log Action
      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ALTERAR_STATUS_PRESTADOR',
        detalhes: `Alterou status do prestador ID: ${id} para ${newStatus}`
      });

      refreshCounts?.();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDeletePrestador = (prestador: any) => {
    setPrestadorToDelete(prestador);
    setIsDeleteConfirmOpen(true);
  };
  const executeDeletePrestador = async () => {
    if (!prestadorToDelete || actionLoading) return;
    
    // VERIFICAÇÃO DE REGRA DE NEGÓCIO: Colaboradores não podem excluir diretamente.
    // O utilitário canDeleteRecord verificará o papel e criará uma solicitação de exclusão se necessário.
    const canProceed = await canDeleteRecord('prestadores', prestadorToDelete.id);
    if (!canProceed) {
      setIsDeleteConfirmOpen(false);
      setPrestadorToDelete(null);
      return; 
    }

    setActionLoading(true);
    const toastId = toast.loading('Verificando pendências e excluindo prestador...');

    try {
      const pId = prestadorToDelete.id;
      console.log('Iniciando exclusão do prestador ID:', pId);

      // 1. Verificar se o prestador existe
      const { data: prestadorCheck, error: prestadorCheckError } = await supabase
        .from('prestadores')
        .select('id, status')
        .eq('id', pId)
        .single();

      if (prestadorCheckError || !prestadorCheck) {
        console.error('Prestador não encontrado no banco antes da exclusão:', prestadorCheckError);
        throw new Error('O registro do prestador não foi encontrado no banco de dados. Ele pode ter sido excluído por outro administrador.');
      }

      // A exclusão é feita somente no registro raiz. Relacionamentos devem usar
      // ON DELETE CASCADE ou RESTRICT no banco, evitando limpezas parciais.
      const { error: mainError, count } = await supabase
        .from('prestadores')
        .delete({ count: 'exact' })
        .eq('id', pId);
      
      if (mainError) {
        console.error('Erro de banco ao excluir prestador principal:', mainError);
        if (mainError.code === '23503') {
          throw new Error('A exclusão foi bloqueada por uma restrição interna (dados vinculados).');
        }
        throw mainError;
      }

      console.log('Resultado da exclusão principal - Count:', count);

      if (count === 0) {
        throw new Error('O registro do prestador não foi encontrado no banco de dados ou a exclusão foi bloqueada por uma restrição interna.');
      }

      toast.success('Prestador excluído com sucesso.', { id: toastId });
      
      // Log Action
      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EXCLUIR_PRESTADOR',
        detalhes: `Excluiu permanentemente o prestador: ${prestadorToDelete.nome_razao} (#${pId.slice(0, 8)})`
      });

      refreshCounts?.();
      
      // Atualizar estado local imediatamente
      setPrestadores(prev => prev.filter(p => p.id !== pId));
      
      setIsDeleteConfirmOpen(false);
      setIsModalOpen(false);
      setPrestadorToDelete(null);
      setSelectedPrestador(null);
    } catch (error: any) {
      console.error('Erro ao excluir prestador:', error);
      toast.error(`Erro ao excluir prestador: ${error.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterPrestador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading) return;
    setActionLoading(true);
    const toastId = toast.loading('Cadastrando prestador...');
    try {
      const cleanDoc = newPrestadorData.documento.replace(/\D/g, '');
      const cleanPhone = newPrestadorData.telefone.replace(/\D/g, '');
      const cleanCep = newPrestadorData.cep.replace(/\D/g, '');

      if (newPrestadorData.tipo_cadastro === 'cpf' && cleanDoc.length !== 11) {
        toast.error('CPF inválido.', { id: toastId });
        setActionLoading(false);
        return;
      }
      if (newPrestadorData.tipo_cadastro === 'cnpj' && cleanDoc.length !== 14) {
        toast.error('CNPJ inválido.', { id: toastId });
        setActionLoading(false);
        return;
      }


      const { data, error } = await supabase.from('prestadores').insert([{
        tipo_cadastro: newPrestadorData.tipo_cadastro,
        nome_razao: newPrestadorData.nome_razao,
        nome_responsavel: newPrestadorData.tipo_cadastro === 'cnpj' ? newPrestadorData.nome_responsavel : null,
        documento: cleanDoc,
        email: newPrestadorData.email,
        telefone: cleanPhone,
        cep: cleanCep,
        numero: newPrestadorData.numero,
        area_servico: newPrestadorData.area_servico,
        observacoes: newPrestadorData.observacoes,
        status: 'ativo'
      }]).select().single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Este documento já está cadastrado.');
        } else {
          throw error;
        }
      }

      // Registrar no histórico
      await supabase.from('prestador_historico').insert([{
        prestador_id: data.id,
        acao: 'Cadastro realizado pelo administrador',
        descricao: 'Prestador cadastrado diretamente pelo painel administrativo com status ATIVO.'
      }]).throwOnError();

      toast.success('Prestador cadastrado com sucesso!', { id: toastId, duration: 6000 });
      
      // Notificar Prestador do novo cadastro
      await notificationService.notifyProvider(
        data.id,
        '👋 Bem-vindo(a) ao Sistema!',
        'Seu cadastro foi realizado pelo administrador. Acesse o painel com sua credencial de acesso.',
        'perfil',
        'prestador_cadastro_aprovado',
        { tab: 'info' }
      );

      // Log Action
      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CRIAR_PRESTADOR',
        detalhes: `Cadastrou o prestador: ${data.nome_razao} (${data.tipo_cadastro.toUpperCase()}: ${data.documento})`
      });

      setIsRegisterModalOpen(false);
      setNewPrestadorData({
        tipo_cadastro: 'cpf',
        nome_razao: '',
        nome_responsavel: '',
        documento: '',
        email: '',
        telefone: '',
        cep: '',
        numero: '',
        area_servico: '',
        observacoes: ''
      });
    } catch (error: any) {
      console.error('Erro ao cadastrar prestador:', error);
      toast.error(`Erro ao cadastrar prestador: ${error.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdatePrestador = async () => {
    if (!selectedPrestador) return;
    setActionLoading(true);
    const toastId = toast.loading('Atualizando prestador...');
    try {
      const { error } = await supabase
        .from('prestadores')
        .update(editData)
        .eq('id', selectedPrestador.id);

      if (error) throw error;

      setSelectedPrestador({ ...selectedPrestador, ...editData });
      setPrestadores(prev => prev.map(p => p.id === selectedPrestador.id ? { ...p, ...editData } : p));
      setIsEditing(false);
      toast.success('Prestador atualizado com sucesso!', { id: toastId });

      // Log Action
      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EDITAR_PRESTADOR',
        detalhes: `Editou o perfil do perfil do prestador ${selectedPrestador.nome_razao}`
      });
    } catch (error: any) {
      console.error('Erro ao atualizar prestador:', error);
      toast.error(`Erro ao atualizar prestador: ${error.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setActionLoading(false);
    }
  };

  const startEditing = () => {
    if (!selectedPrestador) return;
    setEditData({
      nome_razao: selectedPrestador.nome_razao,
      nome_responsavel: selectedPrestador.nome_responsavel,
      documento: selectedPrestador.documento,
      email: selectedPrestador.email,
      telefone: selectedPrestador.telefone,
      cep: selectedPrestador.cep,
      numero: selectedPrestador.numero || '',
      area_servico: selectedPrestador.area_servico,
      observacoes: selectedPrestador.observacoes
    });
    setIsEditing(true);
  };

  const filteredPrestadores = prestadores.filter(p => {
    let matchesTab = false;
    
    if (activeTab === 'pendente') {
      // Se estiver na aba Pendentes, mostramos itens com status irregular/pendente
      const isIrregular = ['pendente', 'em_analise', 'suspenso', 'reprovado'].includes(p.status);
      
      if (statusFilter === 'all') {
        matchesTab = isIrregular;
      } else {
        matchesTab = p.status === statusFilter;
      }
    } else {
      matchesTab = p.status === activeTab;
    }

    const matchesSearch = (p.nome_razao?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.documento?.includes(searchTerm));
    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Gestão de Prestadores</h2>
          <p className="text-sm text-neutral-500">Cadastre e gerencie os prestadores de serviço do sistema.</p>
        </div>
        <button
          onClick={() => setIsRegisterModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-95"
        >
          <UserPlus className="h-5 w-5" />
          Novo Prestador
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar prestador..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {activeTab === 'pendente' && (
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'Todos', color: 'bg-neutral-100 text-neutral-600' },
              { id: 'pendente', label: 'Aguardando', color: 'bg-amber-100 text-amber-700' },
              { id: 'em_analise', label: 'Em Análise', color: 'bg-indigo-100 text-indigo-700' },
              { id: 'suspenso', label: 'Suspensos', color: 'bg-red-100 text-red-700' },
              { id: 'reprovado', label: 'Reprovados', color: 'bg-neutral-900 text-white' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border
                  ${statusFilter === f.id 
                    ? `${f.color} border-transparent ring-2 ring-indigo-500/20` 
                    : 'bg-white text-neutral-400 border-neutral-100 hover:border-neutral-200'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        {activeTab === 'promocoes' ? (
          <div className="p-6">
            <AdminPrestadorPromocoes />
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-48 animate-pulse rounded-3xl bg-neutral-100" />
                ))
              ) : filteredPrestadores.length === 0 ? (
                <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem]">
                  <Building2 className="h-16 w-16 text-neutral-100 mx-auto mb-4" />
                  <p className="text-sm font-black text-neutral-300 uppercase tracking-widest">Nenhum prestador {activeTab} encontrado</p>
                </div>
              ) : (
                filteredPrestadores.map((prestador) => (
                  <div 
                    key={prestador.id} 
                    id={`prestador-${prestador.id}`}
                    className={`group relative rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 transition-all hover:shadow-md border-b-4 border-transparent hover:border-indigo-500 ${
                      highlightedId === prestador.id 
                        ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg' 
                        : ''
                    }`}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${prestador.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg ring-1 ring-indigo-100">
                          {prestador.credencial_acesso || prestador.id?.slice(0, 6).toUpperCase()}
                        </span>
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            const code = prestador.credencial_acesso || prestador.id?.slice(0, 6).toUpperCase();
                            const success = await copyToClipboard(code);
                            if (success) {
                              toast.success('Código copiado!');
                            } else {
                              toast.error('Erro ao copiar.');
                            }
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-neutral-400 shadow-sm ring-1 ring-neutral-200 transition-all hover:bg-neutral-50 hover:text-indigo-600 hover:ring-indigo-200"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="text-lg font-black text-neutral-900 uppercase tracking-tight line-clamp-1 group-hover:text-indigo-600 transition-colors">
                        {prestador.nome_razao}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 ring-1 ring-inset ring-indigo-600/10">
                          {prestador.area_servico}
                        </span>
                      </div>
                    </div>
    
                    <div className="mt-6 flex items-center justify-end border-t border-neutral-50 pt-4">
                      <button 
                         onClick={() => {
                          setSelectedPrestador(prestador);
                          setActiveDetailsTab('info');
                          setIsModalOpen(true);
                        }}
                        className="rounded-xl bg-neutral-100 p-3 text-neutral-400 hover:bg-[#1a1a1a] hover:text-white hover:shadow-lg transition-all active:scale-95 group/btn"
                      >
                        <Eye className="h-5 w-5 transition-transform group-hover/btn:scale-110" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Detalhes do Prestador"
        size="full"
      >
        {selectedPrestador && (
          <div className="flex flex-col h-full bg-neutral-50/50">
            {/* Modal Header */}
            <div className="bg-white px-8 py-6 border-b border-neutral-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-[2rem] shadow-sm ring-1 ring-black/5 transition-transform group-hover:scale-110 ${selectedPrestador.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    <Building2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tight">{selectedPrestador.nome_razao}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-mono text-[10px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg ring-1 ring-indigo-100">
                        {selectedPrestador.credencial_acesso || selectedPrestador.id?.slice(0, 6).toUpperCase()}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                        selectedPrestador.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 
                        selectedPrestador.status === 'pendente' ? 'bg-amber-50 text-amber-600' :
                        'bg-red-50 text-red-600'
                      }`}>
                        {selectedPrestador.status}
                      </span>
                    </div>
                  </div>
                </div>
                 <div className="flex items-center gap-3">
                   {!isEditing ? (
                     <button
                       onClick={startEditing}
                       className="flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors"
                     >
                       <Pencil className="h-4 w-4" />
                       Editar
                     </button>
                   ) : (
                     <button
                       onClick={handleUpdatePrestador}
                       className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-600 transition-colors"
                     >
                       <Save className="h-4 w-4" />
                       Salvar
                     </button>
                   )}
                    <button
                     onClick={() => confirmDeletePrestador(selectedPrestador)}
                     className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                   >
                     <Trash2 className="h-4 w-4" />
                     Excluir
                   </button>
                 </div>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar Tabs */}
              <div className="w-64 bg-white border-r border-neutral-200 p-4 space-y-1">
                {[
                  { id: 'info', label: 'Perfil', icon: Building2 },
                  { id: 'documentos', label: 'Documentos', icon: FileText },
                  { id: 'demandas', label: 'Demandas', icon: ClipboardList },
                  { id: 'carteira', label: 'Carteira Digital', icon: Wallet },
                  { id: 'vouchers', label: 'Vouchers', icon: Tag },
                  { id: 'premios', label: 'Prêmios', icon: Gift }
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveDetailsTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        activeDetailsTab === tab.id 
                          ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
                          : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-8">
                {activeDetailsTab === 'info' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    {isEditing ? (
                      <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                        <h3 className="text-lg font-black text-neutral-900 uppercase tracking-tight mb-6">Editando Perfil do Prestador</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Nome Fantasia / Razão Social</label>
                            <input 
                              type="text" 
                              value={editData.nome_razao || ''} 
                              onChange={e => setEditData({...editData, nome_razao: e.target.value})}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Documento (CPF/CNPJ)</label>
                            <input 
                              type="text" 
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={editData.documento || ''} 
                              onChange={e => setEditData({...editData, documento: selectedPrestador.tipo_cadastro === 'cpf' ? maskCPF(e.target.value) : maskCNPJ(e.target.value)})}
                              onBlur={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                if (val) {
                                  if (selectedPrestador.tipo_cadastro === 'cpf' && !validarCPF(val)) { toast.error('CPF inválido'); setEditData({ ...editData, documento: '' }); }
                                  if (selectedPrestador.tipo_cadastro === 'cnpj' && !validarCNPJ(val)) { toast.error('CNPJ inválido'); setEditData({ ...editData, documento: '' }); }
                                }
                              }}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          {selectedPrestador.tipo_cadastro === 'cnpj' && (
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Nome do Responsável</label>
                              <input 
                                type="text" 
                                value={editData.nome_responsavel || ''} 
                                onChange={e => setEditData({...editData, nome_responsavel: e.target.value})}
                                className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                              />
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">E-mail</label>
                            <input 
                              type="email" 
                              value={editData.email || ''} 
                              onChange={e => setEditData({...editData, email: e.target.value})}
                              onBlur={(e) => {
                                if (e.target.value && !validarEmail(e.target.value)) {
                                  toast.error('E-mail inválido');
                                  setEditData({ ...editData, email: '' });
                                }
                              }}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Telefone</label>
                            <input 
                              type="text" 
                              inputMode="tel"
                              maxLength={15}
                              placeholder="(00) 00000-0000"
                              value={editData.telefone || ''} 
                              onChange={e => setEditData({...editData, telefone: maskPhone(e.target.value)})}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">CEP</label>
                            <input 
                              type="text" 
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={editData.cep || ''} 
                              onChange={e => {
                                let v = e.target.value.replace(/\D/g, '');
                                if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
                                setEditData({...editData, cep: v});
                              }}
                              maxLength={9}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Número</label>
                            <input 
                              type="text" 
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={editData.numero || ''} 
                              onChange={e => setEditData({...editData, numero: e.target.value})}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Área de Serviço</label>
                            <input 
                              type="text" 
                              value={editData.area_servico || ''} 
                              onChange={e => setEditData({...editData, area_servico: e.target.value})}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Observações</label>
                            <textarea 
                              rows={3}
                              value={editData.observacoes || ''} 
                              onChange={e => setEditData({...editData, observacoes: e.target.value})}
                              className="w-full rounded-xl bg-neutral-50 border-transparent px-4 py-3 text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200 resize-none"
                            />
                          </div>
                        </div>
                        <div className="flex gap-4 mt-8 pt-6 border-t border-neutral-100">
                          <button 
                            onClick={() => setIsEditing(false)}
                            className="flex-1 rounded-2xl border border-neutral-200 py-4 text-xs font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 transition-all"
                          >
                            Descartar Alterações
                          </button>
                          <button 
                            onClick={handleUpdatePrestador}
                            className="flex-1 rounded-2xl bg-indigo-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                          >
                            Salvar Alterações
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Informações de Cadastro</p>
                            <div className="space-y-4">
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Documento ({selectedPrestador.tipo_cadastro.toUpperCase()})</p>
                                <p className="text-sm font-black text-neutral-900">
                                  {selectedPrestador.tipo_cadastro === 'cpf' ? maskCPF(selectedPrestador.documento) : maskCNPJ(selectedPrestador.documento)}
                                </p>
                              </div>
                              {selectedPrestador.tipo_cadastro === 'cnpj' && (
                                <div>
                                  <p className="text-[10px] font-bold text-neutral-400 uppercase">Responsável</p>
                                  <p className="text-sm font-black text-neutral-900">{selectedPrestador.nome_responsavel}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Área de Serviço</p>
                                <p className="text-sm font-black text-indigo-600">{selectedPrestador.area_servico}</p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Contato e Endereço</p>
                            <div className="space-y-4">
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">E-mail</p>
                                <p className="text-sm font-black text-neutral-900">{selectedPrestador.email}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Telefone</p>
                                <p className="text-sm font-black text-neutral-900">{maskPhone(selectedPrestador.telefone)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">CEP</p>
                                <p className="text-sm font-black text-neutral-900">{selectedPrestador.cep ? maskCEP(selectedPrestador.cep) : 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Número</p>
                                <p className="text-sm font-black text-neutral-900">{selectedPrestador.numero || 'N/A'}</p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                            <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Sistema</p>
                            <div className="space-y-4">
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Data de Cadastro</p>
                                <p className="text-sm font-black text-neutral-900">{formatDateTime(selectedPrestador.created_at)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-neutral-400 uppercase">Última Atualização</p>
                                <p className="text-sm font-black text-neutral-900">{formatDateTime(selectedPrestador.updated_at || selectedPrestador.created_at)}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Observações Adicionais</p>
                          <p className="text-sm text-neutral-600 leading-relaxed font-medium">
                            {selectedPrestador.observacoes || 'Nenhum registro de observação adicional foi encontrado para este prestador.'}
                          </p>
                        </div>

                        <div className="pt-6 border-t border-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6 ml-2">Ações de Gestão</p>
                          <div className="flex flex-wrap gap-4">
                            {selectedPrestador.status === 'pendente' && (
                              <button
                                onClick={() => handleStatusChange(selectedPrestador.id, 'em_analise')}
                                className="flex-1 rounded-2xl bg-indigo-50 py-4 text-xs font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-100 transition-all"
                              >
                                Colocar em Análise
                              </button>
                            )}
                            
                            {(selectedPrestador.status === 'pendente' || selectedPrestador.status === 'em_analise') && (
                              <>
                                <button
                                  onClick={() => handleStatusChange(selectedPrestador.id, 'ativo')}
                                  className="flex-1 rounded-2xl bg-emerald-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                                >
                                  Aprovar Cadastro
                                </button>
                                <button
                                  onClick={() => handleStatusChange(selectedPrestador.id, 'reprovado')}
                                  className="flex-1 rounded-2xl bg-rose-50 py-4 text-xs font-black uppercase tracking-widest text-rose-600 hover:bg-rose-100 transition-all"
                                >
                                  Reprovar
                                </button>
                              </>
                            )}

                            {selectedPrestador.status === 'ativo' && (
                              <>
                                <button
                                  onClick={() => handleStatusChange(selectedPrestador.id, 'suspenso')}
                                  className="flex-1 rounded-2xl bg-amber-50 py-4 text-xs font-black uppercase tracking-widest text-amber-600 hover:bg-amber-100 transition-all"
                                >
                                  Suspender Prestador
                                </button>
                                <button
                                  onClick={() => handleStatusChange(selectedPrestador.id, 'desligado')}
                                  className="flex-1 rounded-2xl bg-rose-50 py-4 text-xs font-black uppercase tracking-widest text-rose-600 hover:bg-rose-100 transition-all"
                                >
                                  Desligar Definitivo
                                </button>
                              </>
                            )}

                            {(selectedPrestador.status === 'suspenso' || selectedPrestador.status === 'desligado' || selectedPrestador.status === 'reprovado') && (
                              <button
                                onClick={() => handleStatusChange(selectedPrestador.id, 'ativo')}
                                className="flex-1 rounded-2xl bg-emerald-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                              >
                                Reativar / Aprovar
                              </button>
                            )}

                            {/* PIN Management */}
                            <button
                              onClick={async () => {
                                if (!confirm('Tem certeza que deseja resetar a senha de acesso deste prestador? O prestador precisará criar uma nova senha no próximo login.')) return;
                                try {
                                  const success = await callAdminRpc<boolean>('gsa_admin_reset_actor_pin', {
                                    p_actor_id: selectedPrestador.id,
                                    p_actor_type: 'prestador',
                                  });
                                  if (success) {
                                    toast.success('Senha de acesso resetada com sucesso!');
                                    await logService.logAction({
                                      ator_tipo: 'colaborador',
                                      ator_id: colaboradorId,
                                      ator_nome: colaboradorNome || 'Administrador',
                                      acao: 'RESETAR_SENHA_PRESTADOR',
                                      detalhes: `Resetou a senha de acesso do prestador: ${selectedPrestador.nome_razao}`
                                    });
                                  } else {
                                    toast.error('Erro ao resetar senha.');
                                  }
                                } catch (err: any) {
                                  toast.error('Erro ao resetar senha: ' + (err.message || ''));
                                }
                              }}
                              className="flex-1 rounded-2xl bg-amber-50 py-4 text-xs font-black uppercase tracking-widest text-amber-600 hover:bg-amber-100 transition-all"
                            >
                              Resetar Senha
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const { error } = await supabase
                                    .from('prestadores')
                                    .update({ pin_bloqueado: false, pin_tentativas: 0 })
                                    .eq('id', selectedPrestador.id);
                                  if (error) throw error;
                                  toast.success('Acesso desbloqueado com sucesso!');
                                  await logService.logAction({
                                    ator_tipo: 'colaborador',
                                    ator_id: (window as any).colaboradorId,
                                    ator_nome: colaboradorNome || 'Administrador',
                                    acao: 'DESBLOQUEAR_PIN_PRESTADOR',
                                    detalhes: `Desbloqueou o acesso (PIN) do prestador: ${selectedPrestador.nome_razao}`
                                  });
                                } catch (err: any) {
                                  toast.error('Erro ao desbloquear: ' + (err.message || ''));
                                }
                              }}
                              className="flex-1 rounded-2xl bg-emerald-50 py-4 text-xs font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-100 transition-all"
                            >
                              Desbloquear Acesso (PIN)
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
                
                {activeDetailsTab === 'documentos' && (
                  <div className="animate-in fade-in slide-in-from-right-4">
                    <AdminPrestadorDocumentos 
                      prestadorId={selectedPrestador.id} 
                      prestadorNome={selectedPrestador.nome_razao}
                      colaboradorId={colaboradorId}
                      colaboradorNome={colaboradorNome}
                      prestadorTelefone={selectedPrestador.telefone}
                    />
                  </div>
                )}
                
                {activeDetailsTab === 'demandas' && (
                  <div className="animate-in fade-in slide-in-from-right-4">
                    <AdminPrestadorDemandas prestadorId={selectedPrestador.id} />
                  </div>
                )}
                
                {activeDetailsTab === 'carteira' && (
                  <div className="animate-in fade-in slide-in-from-right-4">
                    <AdminPrestadorCarteira prestadorId={selectedPrestador.id} prestadorNome={selectedPrestador.nome_razao} colaboradorId={colaboradorId} colaboradorNome={colaboradorNome} />
                  </div>
                )}
                
                {activeDetailsTab === 'vouchers' && (
                  <div className="animate-in fade-in slide-in-from-right-4">
                    <AdminPrestadorVouchers 
                      prestadorId={selectedPrestador.id} 
                      prestadorNome={selectedPrestador.nome_razao}
                      colaboradorId={colaboradorId}
                      colaboradorNome={colaboradorNome}
                    />
                  </div>
                )}
                
                {activeDetailsTab === 'premios' && (
                  <div className="animate-in fade-in slide-in-from-right-4">
                    <AdminPrestadorPremios 
                      prestadorId={selectedPrestador.id} 
                      prestadorNome={selectedPrestador.nome_razao}
                      colaboradorId={colaboradorId}
                      colaboradorNome={colaboradorNome}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Confirmar Exclusão"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Tem certeza que deseja excluir o prestador <span className="font-bold text-neutral-900">{prestadorToDelete?.nome_razao}</span> permanentemente? Esta ação não pode ser desfeita e removerá todos os dados vinculados.
          </p>
          <div className="flex gap-4 pt-2">
            <button 
              onClick={() => setIsDeleteConfirmOpen(false)} 
              className="btn-secondary flex-1"
              disabled={actionLoading}
            >
              Cancelar
            </button>
            <button 
              onClick={executeDeletePrestador} 
              disabled={actionLoading} 
              className="btn-primary flex-1 bg-red-600 hover:bg-red-700"
            >
              {actionLoading ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => {
          setIsRegisterModalOpen(false);
          setActiveRegisterTab('basico');
        }}
        title="Novo Cadastro de Prestador"
        size="full"
      >
        <form onSubmit={handleRegisterPrestador} className="flex flex-col h-full bg-neutral-50/50 -m-6">
          {/* Modal Header Premium - Black Style */}
          <div className="bg-[#1a1a1a] px-8 py-10 border-b border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-[2rem] bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-transform group-hover:scale-110">
                  <UserPlus className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tight">
                    Novo Cadastro de Prestador
                  </h2>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">
                    Fluxo de Credenciamento Centralizado
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterModalOpen(false);
                    setActiveRegisterTab('basico');
                  }}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-500 hover:bg-neutral-100 transition-all"
                >
                  Descartar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                >
                  <CheckCircle className="h-4 w-4" />
                  {actionLoading ? 'Processando...' : 'Finalizar Cadastro'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Centered Tabs inside Header (Card Style) */}
            <div className="bg-white border-b border-neutral-200 px-8 py-4">
              <div className="flex items-center gap-2 p-1.5 bg-neutral-100 rounded-2xl w-fit mx-auto">
                {[
                  { id: 'basico', label: 'Dados Básicos', icon: Building2 },
                  { id: 'contato', label: 'Contato e Local', icon: Phone },
                  { id: 'atuacao', label: 'Área de Atuação', icon: ClipboardList }
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveRegisterTab(tab.id as any)}
                      className={`flex items-center gap-3 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        activeRegisterTab === tab.id 
                          ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' 
                          : 'text-neutral-500 hover:text-neutral-900'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-12">
              <div className="max-w-3xl mx-auto">
                {activeRegisterTab === 'basico' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6">Tipo de Identificação</p>
                      <div className="flex gap-4 p-1.5 bg-neutral-100 rounded-2xl mb-8">
                        <button
                          type="button"
                          onClick={() => setNewPrestadorData({ ...newPrestadorData, tipo_cadastro: 'cpf', documento: '' })}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${newPrestadorData.tipo_cadastro === 'cpf' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                        >
                          Pessoa Física (CPF)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewPrestadorData({ ...newPrestadorData, tipo_cadastro: 'cnpj', documento: '' })}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${newPrestadorData.tipo_cadastro === 'cnpj' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                        >
                          Pessoa Jurídica (CNPJ)
                        </button>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                            {newPrestadorData.tipo_cadastro === 'cpf' ? 'Nome Completo *' : 'Razão Social *'}
                          </label>
                          <input
                            type="text"
                            required
                            value={newPrestadorData.nome_razao}
                            onChange={e => setNewPrestadorData({ ...newPrestadorData, nome_razao: e.target.value })}
                            className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-neutral-300 transition-all outline-none ring-1 ring-neutral-200"
                            placeholder={newPrestadorData.tipo_cadastro === 'cpf' ? "Digite o nome completo" : "Digite a razão social"}
                          />
                        </div>

                        {newPrestadorData.tipo_cadastro === 'cnpj' && (
                          <div>
                            <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Nome do Responsável *</label>
                            <input
                              type="text"
                              required
                              value={newPrestadorData.nome_responsavel}
                              onChange={e => setNewPrestadorData({ ...newPrestadorData, nome_responsavel: e.target.value })}
                              className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-neutral-300 transition-all outline-none ring-1 ring-neutral-200"
                              placeholder="Nome do sócio ou representante"
                            />
                          </div>
                        )}

                        <div>
                          <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                            {newPrestadorData.tipo_cadastro === 'cpf' ? 'CPF *' : 'CNPJ *'}
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            required
                            value={newPrestadorData.documento}
                            onChange={e => setNewPrestadorData({
                              ...newPrestadorData,
                              documento: newPrestadorData.tipo_cadastro === 'cpf' ? maskCPF(e.target.value) : maskCNPJ(e.target.value)
                            })}
                            onBlur={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              if (val) {
                                if (newPrestadorData.tipo_cadastro === 'cpf' && !validarCPF(val)) { toast.error('CPF inválido'); setNewPrestadorData({ ...newPrestadorData, documento: '' }); }
                                if (newPrestadorData.tipo_cadastro === 'cnpj' && !validarCNPJ(val)) { toast.error('CNPJ inválido'); setNewPrestadorData({ ...newPrestadorData, documento: '' }); }
                              }
                            }}
                            placeholder={newPrestadorData.tipo_cadastro === 'cpf' ? "000.000.000-00" : "00.000.000/0000-00"}
                            className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-black text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeRegisterTab === 'contato' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6">Canais de Comunicação</p>
                      <div className="space-y-6">
                        <div>
                          <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">E-mail de Trabalho *</label>
                          <input
                            type="email"
                            required
                            value={newPrestadorData.email}
                            onChange={e => setNewPrestadorData({ ...newPrestadorData, email: e.target.value })}
                            onBlur={(e) => {
                              if (e.target.value && !validarEmail(e.target.value)) {
                                toast.error('E-mail inválido');
                                setNewPrestadorData({ ...newPrestadorData, email: '' });
                              }
                            }}
                            className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-neutral-300 transition-all outline-none ring-1 ring-neutral-200"
                            placeholder="exemplo@email.com"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                            <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Telefone / WhatsApp *</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              required
                              value={newPrestadorData.telefone}
                              onChange={e => setNewPrestadorData({ ...newPrestadorData, telefone: maskPhone(e.target.value) })}
                              maxLength={15}
                              className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-neutral-300 transition-all outline-none ring-1 ring-neutral-200"
                              placeholder="(00) 00000-0000"
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">CEP *</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              required
                              value={newPrestadorData.cep}
                              onChange={e => {
                                let v = e.target.value.replace(/\D/g, '');
                                if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
                                setNewPrestadorData({ ...newPrestadorData, cep: v });
                              }}
                              maxLength={9}
                              placeholder="00000-000"
                              className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                          <div>
                            <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Número *</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              required
                              value={newPrestadorData.numero}
                              onChange={e => setNewPrestadorData({ ...newPrestadorData, numero: e.target.value })}
                              placeholder="Nº"
                              className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeRegisterTab === 'atuacao' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6">Expertise e Notas</p>
                      <div className="space-y-6">
                        <div>
                          <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Área de prestação de serviço *</label>
                          <input
                            type="text"
                            required
                            value={newPrestadorData.area_servico}
                            onChange={e => setNewPrestadorData({ ...newPrestadorData, area_servico: e.target.value })}
                            placeholder="Ex: Manutenção Elétrica, Limpeza, etc"
                            className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Observações Internas (Opcional)</label>
                          <textarea
                            rows={4}
                            value={newPrestadorData.observacoes}
                            onChange={e => setNewPrestadorData({ ...newPrestadorData, observacoes: e.target.value })}
                            className="w-full rounded-3xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-medium text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200 resize-none"
                            placeholder="Notas importantes sobre o perfil ou referências..."
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-indigo-950 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl"></div>
                       <div className="relative z-10 flex items-center gap-6">
                         <div className="h-16 w-16 rounded-2xl bg-white/10 flex items-center justify-center">
                            <CheckCircle className="h-8 w-8 text-indigo-300" />
                         </div>
                         <div>
                            <p className="text-xl font-black uppercase tracking-tight">Quase lá!</p>
                            <p className="text-sm text-indigo-200 font-medium">Revise os dados antes de finalizar o cadastro no sistema.</p>
                         </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function AdminPrestadorDemandas({ prestadorId }: { prestadorId: string }) {
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDemandas();
  }, [prestadorId]);

  const fetchDemandas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('prestador_demandas')
      .select('*')
      .eq('prestador_id', prestadorId)
      .order('created_at', { ascending: false });

    if (!error && data) setDemandas(data);
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: any = {
      'aberta': { color: 'bg-blue-50 text-blue-700 ring-blue-600/20', label: 'Aberta' },
      'em_negociacao': { color: 'bg-amber-50 text-amber-700 ring-amber-600/20', label: 'Negociação' },
      'ativa': { color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', label: 'Ativa' },
      'concluida': { color: 'bg-neutral-50 text-neutral-700 ring-neutral-600/20', label: 'Concluída' },
      'cancelada': { color: 'bg-red-50 text-red-700 ring-red-600/20', label: 'Cancelada' }
    };

    const config = statusMap[status] || { color: 'bg-neutral-50 text-neutral-600', label: status };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${config.color}`}>
        {config.label}
      </span>
    );
  };

  if (loading) return <div className="flex justify-center p-8"><Clock className="h-6 w-6 animate-spin text-neutral-400" /></div>;

  return (
    <div className="space-y-4">
      {demandas.length === 0 ? (
        <div className="text-center py-12 bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-200">
          <History className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-500">Nenhuma demanda encontrada para este prestador.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Código / Título</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 bg-white">
              {demandas.map(demanda => (
                <tr key={demanda.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-neutral-900">#{demanda.id?.slice(0, 8)}</div>
                    <div className="text-xs text-neutral-500">{demanda.titulo}</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-neutral-900">
                    {formatCurrency(demanda.valor_final || 0)}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(demanda.status)}
                  </td>
                  <td className="px-6 py-4 text-xs text-neutral-500">
                    {formatDate(demanda.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminPrestadorCarteira({ prestadorId, prestadorNome, colaboradorId, colaboradorNome }: { prestadorId: string, prestadorNome: string, colaboradorId?: string, colaboradorNome?: string | null }) {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isLancarModalOpen, setIsLancarModalOpen] = useState(false);
  const [lancarData, setLancarData] = useState({ tipo: 'credito', valor: '', descricao: '' });

  useEffect(() => {
    fetchCarteira();
  }, [prestadorId]);

  const fetchCarteira = async () => {
    setLoading(true);
    const { data: txs, error: e1 } = await supabase
      .from('prestador_transacoes')
      .select('*')
      .eq('prestador_id', prestadorId)
      .order('created_at', { ascending: false });

    if (!e1 && txs) {
      setTransacoes(txs);
      const total = txs.reduce((acc, tx) => {
        if (tx.status === 'cancelado') return acc;
        return tx.tipo === 'credito' ? acc + Number(tx.valor) : acc - Number(tx.valor);
      }, 0);
      setSaldo(total);
    }
    setLoading(false);
  };

  const handleLancar = async (e: React.FormEvent) => {
    e.preventDefault();
    const valorNum = Number(lancarData.valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) return toast.error('Informe um valor válido.');

    const { error } = await supabase
      .from('prestador_transacoes')
      .insert([{
        prestador_id: prestadorId,
        tipo: lancarData.tipo,
        valor: valorNum,
        descricao: lancarData.descricao || `Lançamento manual de ${lancarData.tipo}`,
        status: 'concluido'
      }]);

    if (error) {
      toast.error('Erro ao realizar lançamento.');
    } else {
      toast.success('Lançamento realizado com sucesso!');
      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome || 'Administrador',
        acao: lancarData.tipo === 'credito' ? 'CREDITO_MANUAL_PRESTADOR' : 'DEBITO_MANUAL_PRESTADOR',
        detalhes: `Realizou lançamento manual de ${formatCurrency(valorNum)} na carteira de ${prestadorNome}. Descrição: ${lancarData.descricao}`
      });
      setIsLancarModalOpen(false);
      setLancarData({ tipo: 'credito', valor: '', descricao: '' });
      fetchCarteira();
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Clock className="h-6 w-6 animate-spin text-neutral-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-2xl bg-indigo-600 p-6 text-white shadow-xl shadow-indigo-600/20">
          <div className="flex items-center gap-2 text-white/70 mb-1">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Saldo Atual Disponível</span>
          </div>
          <div className="text-4xl font-black">{formatCurrency(saldo)}</div>
        </div>
        <button 
          onClick={() => setIsLancarModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-white p-6 text-indigo-600 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition-all font-bold"
        >
          <PlusCircle className="h-5 w-5" />
          Lançar Manual
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-2">
          <History className="h-4 w-4" />
          Extrato Detalhado
        </h3>
        {transacoes.length === 0 ? (
          <p className="text-center py-8 text-neutral-400 bg-neutral-50 rounded-xl border border-dashed border-neutral-200 italic">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="space-y-3">
            {transacoes.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-white border border-neutral-100 shadow-sm transition-all hover:border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${tx.tipo === 'credito' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {tx.tipo === 'credito' ? <ArrowUpCircle className="h-5 w-5" /> : <ArrowDownCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-neutral-900">{tx.descricao}</div>
                    <div className="text-[10px] text-neutral-500">{formatDate(tx.created_at)} {formatDateTime(tx.created_at)}</div>
                  </div>
                </div>
                <div className={`text-sm font-black ${tx.tipo === 'credito' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {tx.tipo === 'credito' ? '+' : '-'} {formatCurrency(tx.valor)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={isLancarModalOpen}
        onClose={() => setIsLancarModalOpen(false)}
        title={`Novo Lançamento - ${prestadorNome}`}
      >
        <form onSubmit={handleLancar} className="space-y-4">
          <div className="flex gap-2 p-1 bg-neutral-100 rounded-lg">
            <button
              type="button"
              onClick={() => setLancarData({ ...lancarData, tipo: 'credito' })}
              className={`flex-1 py-2 text-sm rounded-md transition-all ${lancarData.tipo === 'credito' ? 'bg-white shadow text-emerald-600 font-bold' : 'text-neutral-500'}`}
            >
              Crédito
            </button>
            <button
              type="button"
              onClick={() => setLancarData({ ...lancarData, tipo: 'debito' })}
              className={`flex-1 py-2 text-sm rounded-md transition-all ${lancarData.tipo === 'debito' ? 'bg-white shadow text-red-600 font-bold' : 'text-neutral-500'}`}
            >
              Débito
            </button>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-600">Valor *</label>
            <input
              type="text"
              required
              placeholder="0,00"
              value={lancarData.valor}
              onChange={e => setLancarData({ ...lancarData, valor: e.target.value.replace(/[^\d,]/g, '') })}
              className="input-field text-xl font-bold"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-600">Descrição / Motivo *</label>
            <textarea
              required
              rows={3}
              placeholder="Ex: Pagamento de demanda #123 ou Bônus por produtividade"
              value={lancarData.descricao}
              onChange={e => setLancarData({ ...lancarData, descricao: e.target.value })}
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              type="button" 
              onClick={() => setIsLancarModalOpen(false)} 
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className={`btn-primary flex-1 ${lancarData.tipo === 'credito' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              Confirmar Lançamento
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
