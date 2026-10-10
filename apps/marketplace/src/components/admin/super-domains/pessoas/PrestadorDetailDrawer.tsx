import React, { useState, useEffect } from 'react';
import { 
  User, Building2, Phone, Mail, MapPin, ShieldCheck, 
  FileText, Briefcase, DollarSign, Gift, Key, CheckCircle, 
  XCircle, AlertTriangle, Trash2, Edit, Save, Clock, Copy, Sparkles, Star
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { CommandSlideOver, StatusBadge } from '../shared';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime, maskCPF, maskCNPJ, maskPhone, maskCEP, copyToClipboard } from '../../../../lib/utils';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { notificationService } from '../../../../lib/notificationService';
import { logService } from '../../../../lib/logService';
import { canDeleteRecord } from '../../../../lib/deleteRequest';
import { AdminPrestadorDocumentos } from '../../prestadores/AdminPrestadorDocumentos';
import { AdminPrestadorVouchers } from '../../prestadores/AdminPrestadorVouchers';
import { AdminPrestadorPremios } from '../../prestadores/AdminPrestadorPremios';
import { AdminPrestadorPromocoes } from '../../prestadores/AdminPrestadorPromocoes';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

export interface PrestadorItem {
  id: string;
  nome_razao: string;
  nome_responsavel?: string | null;
  tipo_cadastro: 'cpf' | 'cnpj';
  documento: string;
  email: string;
  telefone: string;
  cep?: string | null;
  numero?: string | null;
  area_servico?: string | null;
  observacoes?: string | null;
  status: 'ativo' | 'pendente' | 'em_analise' | 'suspenso' | 'reprovado' | 'desligado' | string;
  saldo_carteira?: number;
  saldo_bloqueado?: number;
  avaliacao_media?: number;
  credencial_acesso?: string | null;
  created_at: string;
}

export interface PrestadorDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  prestador: PrestadorItem | null;
  onUpdated: () => void;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  initialTab?: string;
}

export function PrestadorDetailDrawer({
  isOpen,
  onClose,
  prestador,
  onUpdated,
  colaboradorId,
  colaboradorNome,
  initialTab
}: PrestadorDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'dossie' | 'documentos' | 'demandas' | 'financeiro' | 'beneficios' | 'seguranca'>(
    (initialTab as any) || 'dossie'
  );
  const [isEditing, setIsEditing] = useState(false);
  useRealtimeSubscription(
    [
      {
        table: 'prestadores',
        filter: prestador?.id ? `id=eq.${prestador.id}` : undefined,
        enabled: Boolean(isOpen && prestador?.id),
        onChange: onUpdated,
      },
      {
        table: 'prestador_demandas',
        filter: prestador?.id ? `prestador_id=eq.${prestador.id}` : undefined,
        enabled: Boolean(isOpen && prestador?.id),
        onChange: () => {
          if (prestador?.id) fetchDemandas(prestador.id);
        },
      },
    ],
    [isOpen, prestador?.id]
  );
  const [editForm, setEditForm] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  // Demandas do prestador
  const [demandas, setDemandas] = useState<any[]>([]);
  const [loadingDemandas, setLoadingDemandas] = useState(false);

  useEffect(() => {
    if (prestador) {
      setEditForm({
        nome_razao: prestador.nome_razao || '',
        nome_responsavel: prestador.nome_responsavel || '',
        documento: prestador.documento || '',
        email: prestador.email || '',
        telefone: prestador.telefone || '',
        cep: prestador.cep || '',
        numero: prestador.numero || '',
        area_servico: prestador.area_servico || '',
        observacoes: prestador.observacoes || ''
      });
      setIsEditing(false);
      setActiveTab((initialTab as any) || 'dossie');
      fetchDemandas(prestador.id);
    }
  }, [prestador, initialTab]);

  if (!prestador) return null;

  const fetchDemandas = async (prestadorId: string) => {
    try {
      setLoadingDemandas(true);
      const { data, error } = await supabase
        .from('prestador_demandas')
        .select('*')
        .eq('prestador_id', prestadorId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDemandas(data || []);
    } catch (err) {
      console.error('Erro ao carregar demandas do prestador:', err);
    } finally {
      setLoadingDemandas(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    const toastId = toast.loading('Salvando alterações do perfil...');
    try {
      const { error } = await supabase
        .from('prestadores')
        .update(editForm)
        .eq('id', prestador.id);

      if (error) throw error;

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EDITAR_PRESTADOR',
        detalhes: `Atualizou os dados cadastrais do prestador: ${editForm.nome_razao} (#${prestador.id.slice(0, 8)})`
      });

      toast.success('Perfil atualizado com sucesso!', { id: toastId });
      setIsEditing(false);
      onUpdated();
    } catch (err: any) {
      console.error('Erro ao salvar prestador:', err);
      toast.error(`Falha ao salvar: ${err.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeStatus = async (newStatus: string) => {
    setIsSaving(true);
    const toastId = toast.loading(`Alterando status para ${newStatus}...`);
    try {
      const updatePayload: any = { status: newStatus };
      if (newStatus === 'ativo' && !prestador.credencial_acesso) {
        updatePayload.credencial_acesso = Math.floor(100000 + Math.random() * 900000).toString();
      }

      const { error } = await supabase
        .from('prestadores')
        .update(updatePayload)
        .eq('id', prestador.id);

      if (error) throw error;

      await supabase.from('prestador_historico').insert([{
        prestador_id: prestador.id,
        acao: `Status alterado para ${newStatus}`,
        descricao: `Status atualizado no painel de controle pelo administrador.`
      }]).throwOnError();

      // Notificação ao prestador
      const statusLabels: Record<string, { title: string; desc: string }> = {
        ativo: { title: '🎉 Cadastro Aprovado!', desc: 'Seu cadastro de prestador foi aprovado. Você já pode receber demandas.' },
        suspenso: { title: '⚠️ Conta Suspensa', desc: 'Sua conta foi suspensa temporariamente pela administração.' },
        reprovado: { title: '❌ Cadastro Reprovado', desc: 'Seu cadastro de prestador foi reprovado pela administração.' }
      };

      if (statusLabels[newStatus]) {
        await notificationService.notifyProvider(
          prestador.id,
          statusLabels[newStatus].title,
          statusLabels[newStatus].desc,
          'perfil',
          newStatus === 'ativo' ? 'prestador_cadastro_aprovado' : 'prestador_suspenso',
          { tab: 'info' }
        );
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ALTERAR_STATUS_PRESTADOR',
        detalhes: `Alterou status do prestador ${prestador.nome_razao} para ${newStatus}`
      });

      toast.success(`Status atualizado para ${newStatus.toUpperCase()}!`, { id: toastId });
      onUpdated();
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
      toast.error(`Falha ao alterar status: ${err.message || 'Erro'}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPin = async () => {
    if (!window.confirm('Deseja realmente redefinir o PIN/senha de acesso deste prestador para o padrão (1234)?')) {
      return;
    }

    setIsResettingPin(true);
    const toastId = toast.loading('Redefinindo PIN de segurança...');
    try {
      const success = await callAdminRpc<boolean>('gsa_admin_reset_actor_pin', {
        p_actor_type: 'prestador',
        p_actor_id: prestador.id
      });

      if (!success) {
        throw new Error('Não foi possível redefinir o PIN.');
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'RESETAR_PIN_PRESTADOR',
        detalhes: `Redefiniu o PIN de acesso do prestador: ${prestador.nome_razao}`
      });

      toast.success('PIN redefinido para "1234" com sucesso!', { id: toastId });
      onUpdated();
    } catch (err: any) {
      console.error('Erro ao resetar PIN:', err);
      toast.error(`Falha ao resetar PIN: ${err.message || 'Erro'}`, { id: toastId });
    } finally {
      setIsResettingPin(false);
    }
  };

  const handleDeletePrestador = async () => {
    if (!window.confirm(`Tem certeza que deseja excluir o prestador "${prestador.nome_razao}"? Esta ação removerá os acessos vinculados.`)) {
      return;
    }

    const canProceed = await canDeleteRecord('prestadores', prestador.id);
    if (!canProceed) return;

    setIsSaving(true);
    const toastId = toast.loading('Excluindo prestador do sistema...');
    try {
      const { error } = await supabase
        .from('prestadores')
        .delete()
        .eq('id', prestador.id);

      if (error) throw error;

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EXCLUIR_PRESTADOR',
        detalhes: `Excluiu o prestador: ${prestador.nome_razao} (#${prestador.id.slice(0, 8)})`
      });

      toast.success('Prestador excluído com sucesso!', { id: toastId });
      onUpdated();
      onClose();
    } catch (err: any) {
      console.error('Erro ao excluir:', err);
      toast.error(`Erro ao excluir prestador: ${err.message || 'Erro'}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <CommandSlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={prestador.nome_razao}
      subtitle={`${prestador.tipo_cadastro.toUpperCase()}: ${prestador.documento.length > 11 ? maskCNPJ(prestador.documento) : maskCPF(prestador.documento)} • Membro desde ${formatDate(prestador.created_at)}`}
      badge={<StatusBadge status={prestador.status} size="sm" />}
      width="xl"
      tabs={[
        { id: 'dossie', label: 'Dossiê & Perfil', icon: User },
        { id: 'documentos', label: 'Documentação', icon: FileText },
        { id: 'demandas', label: `Demandas (${demandas.length})`, icon: Briefcase },
        { id: 'financeiro', label: 'Carteira', icon: DollarSign },
        { id: 'beneficios', label: 'Benefícios', icon: Gift },
        { id: 'seguranca', label: 'Ações & PIN', icon: Key }
      ]}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as any)}
    >
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Status Operacional</span>
            <div className="mt-1">
              <StatusBadge status={prestador.status} size="sm" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Saldo em Carteira</span>
            <div className="mt-1 font-mono font-bold text-sm text-slate-900 tabular-nums">
              {formatCurrency(prestador.saldo_carteira || 0)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Avaliação Média</span>
            <div className="mt-1 flex items-center gap-1 font-bold text-sm text-amber-600">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span>{prestador.avaliacao_media ? prestador.avaliacao_media.toFixed(1) : '5.0'}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Credencial / Código</span>
            <div className="mt-1 font-mono font-bold text-xs text-slate-700">
              {prestador.credencial_acesso || `#${prestador.id.slice(0, 6).toUpperCase()}`}
            </div>
          </div>
        </div>

        {/* Tab 1: Dossier / Profile */}
        {activeTab === 'dossie' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Informações Cadastrais
              </h4>
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Edit className="h-3.5 w-3.5" />
                  Editar Dados
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Salvar
                  </button>
                </div>
              )}
            </div>

            {!isEditing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Razão Social / Nome</span>
                  <span className="font-semibold text-slate-900">{prestador.nome_razao}</span>
                </div>

                {prestador.nome_responsavel && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Nome do Responsável</span>
                    <span className="font-medium text-slate-800">{prestador.nome_responsavel}</span>
                  </div>
                )}

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Documento ({prestador.tipo_cadastro.toUpperCase()})</span>
                  <span className="font-mono font-medium text-slate-900">
                    {prestador.documento.length > 11 ? maskCNPJ(prestador.documento) : maskCPF(prestador.documento)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">E-mail</span>
                  <span className="text-slate-800">{prestador.email}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Telefone</span>
                  <span className="text-slate-800">{maskPhone(prestador.telefone)}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Área / Especialidade</span>
                  <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 font-bold text-indigo-700 text-[11px]">
                    {prestador.area_servico || 'Geral'}
                  </span>
                </div>

                {prestador.cep && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">CEP & Endereço</span>
                    <span className="text-slate-800">
                      {maskCEP(prestador.cep)} {prestador.numero ? `• Nº ${prestador.numero}` : ''}
                    </span>
                  </div>
                )}

                {prestador.observacoes && (
                  <div className="sm:col-span-2 border-t border-slate-100 pt-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Observações Internas</span>
                    <p className="mt-1 text-slate-600 italic">{prestador.observacoes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Nome / Razão Social</label>
                  <input
                    type="text"
                    value={editForm.nome_razao}
                    onChange={(e) => setEditForm({ ...editForm, nome_razao: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Nome do Responsável</label>
                  <input
                    type="text"
                    value={editForm.nome_responsavel}
                    onChange={(e) => setEditForm({ ...editForm, nome_responsavel: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={editForm.telefone}
                    onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Área de Atuação</label>
                  <input
                    type="text"
                    value={editForm.area_servico}
                    onChange={(e) => setEditForm({ ...editForm, area_servico: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">CEP</label>
                  <input
                    type="text"
                    value={editForm.cep}
                    onChange={(e) => setEditForm({ ...editForm, cep: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Observações</label>
                  <textarea
                    rows={2}
                    value={editForm.observacoes}
                    onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Documentos */}
        {activeTab === 'documentos' && (
          <div className="space-y-4">
            <AdminPrestadorDocumentos
              prestadorId={prestador.id}
              prestadorNome={prestador.nome_razao}
              prestadorTelefone={prestador.telefone}
              colaboradorId={colaboradorId}
              colaboradorNome={colaboradorNome}
            />
          </div>
        )}

        {/* Tab 3: Demandas */}
        {activeTab === 'demandas' && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Demandas Atribuídas ao Prestador ({demandas.length})
            </h4>

            {loadingDemandas ? (
              <div className="py-8 text-center text-xs text-slate-500">Carregando histórico de demandas...</div>
            ) : demandas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
                Nenhuma demanda atribuída até o momento.
              </div>
            ) : (
              <div className="space-y-2">
                {demandas.map((dem) => (
                  <div key={dem.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{dem.titulo || dem.descricao || 'Demanda Operacional'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Protocolo #{dem.codigo || dem.id.slice(0, 8)} • Criado em {formatDate(dem.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {dem.valor_prestador != null && (
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {formatCurrency(dem.valor_prestador)}
                        </span>
                      )}
                      <StatusBadge status={dem.status} size="xs" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Financeiro */}
        {activeTab === 'financeiro' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Saldo Disponível</span>
                  <div className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                    {formatCurrency(prestador.saldo_carteira || 0)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Saldo Bloqueado / Pendente</span>
                  <div className="text-lg font-bold text-slate-600 font-mono tabular-nums">
                    {formatCurrency(prestador.saldo_bloqueado || 0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-xs text-slate-600">
              <p>
                Os pagamentos e liquidações são gerenciados centralizadamente na <strong>Central de Saques & Repasses</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Tab 5: Benefícios */}
        {activeTab === 'beneficios' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 border-b border-slate-100 pb-2">
                Vouchers do Prestador
              </h4>
              <AdminPrestadorVouchers prestadorId={prestador.id} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 border-b border-slate-100 pb-2">
                Prêmios & Resgates
              </h4>
              <AdminPrestadorPremios prestadorId={prestador.id} />
            </div>
          </div>
        )}

        {/* Tab 6: Segurança & Governança */}
        {activeTab === 'seguranca' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                Credenciais & Acesso ao Portal
              </h4>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-800">Redefinição de PIN de Segurança</div>
                  <div className="text-[11px] text-slate-500">
                    Restaura a senha de 4 dígitos de acesso do prestador para o padrão do sistema (1234).
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetPin}
                  disabled={isResettingPin}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Key className="h-3.5 w-3.5 text-amber-600" />
                  {isResettingPin ? 'Redefinindo...' : 'Resetar PIN para 1234'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-2">
                Transição de Status Administrativo
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleChangeStatus('ativo')}
                  disabled={isSaving || prestador.status === 'ativo'}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                >
                  <CheckCircle className="h-4 w-4" />
                  Ativar / Aprovar
                </button>

                <button
                  type="button"
                  onClick={() => handleChangeStatus('suspenso')}
                  disabled={isSaving || prestador.status === 'suspenso'}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Suspender Acesso
                </button>

                <button
                  type="button"
                  onClick={() => handleChangeStatus('reprovado')}
                  disabled={isSaving || prestador.status === 'reprovado'}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                >
                  <XCircle className="h-4 w-4" />
                  Reprovar Cadastro
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                Zona de Risco: Exclusão de Cadastro
              </h4>
              <p className="text-[11px] text-rose-700">
                A exclusão definitiva desassocia os dados do prestador. Se você não possuir permissão master, uma solicitação de exclusão será enviada para auditoria da governança.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDeletePrestador}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow-sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir Prestador
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CommandSlideOver>
  );
}
