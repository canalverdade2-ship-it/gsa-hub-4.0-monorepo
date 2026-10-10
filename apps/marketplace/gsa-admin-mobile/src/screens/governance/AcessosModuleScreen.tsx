import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface AcessosModuleScreenProps {
  adminType?: string;
  colaboradorId?: string;
}

interface ColaboradorItem {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  status: 'ativo' | 'inativo';
  cargo?: string;
  modulos?: string[];
  created_at?: string;
}

interface ActiveSessionItem {
  id: string;
  colaborador_nome?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  last_activity?: string;
}

interface DeletionRequestItem {
  id: string;
  colaborador_nome?: string;
  tabela: string;
  registro_id: string;
  motivo?: string;
  status: string;
  created_at: string;
}

const ALL_MODULES = [
  { key: 'cadastro', label: 'Cadastros (Clientes e Prestadores)' },
  { key: 'operacoes', label: 'Operações (Orçamentos, OS e Compras)' },
  { key: 'demandas', label: 'Demandas Operacionais' },
  { key: 'financeiro', label: 'Financeiro Geral e Faturas' },
  { key: 'cobranca', label: 'Cobrança e Inadimplência' },
  { key: 'fornecedores', label: 'Fornecedores e Pedidos' },
  { key: 'atendimento', label: 'Atendimento e Suporte' },
  { key: 'loja', label: 'Loja GSA Store e Catálogo' },
  { key: 'promocoes', label: 'Promoções e Vouchers' },
  { key: 'relatorios', label: 'Relatórios Analíticos' },
  { key: 'governanca', label: 'Governança e Configurações' },
];

export const AcessosModuleScreen: React.FC<AcessosModuleScreenProps> = () => {
  const [activeTab, setActiveTab] = useState<'colaboradores' | 'sessoes' | 'exclusoes'>('colaboradores');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [colaboradores, setColaboradores] = useState<ColaboradorItem[]>([]);
  const [sessoes, setSessoes] = useState<ActiveSessionItem[]>([]);
  const [exclusoes, setExclusoes] = useState<DeletionRequestItem[]>([]);

  // Modais
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedColab, setSelectedColab] = useState<ColaboradorItem | null>(null);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [generatedPin, setGeneratedPin] = useState('');

  // Form novo colaborador
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTelefone, setFormTelefone] = useState('');
  const [formCargo, setFormCargo] = useState('Atendente Operacional');
  const [formModulos, setFormModulos] = useState<string[]>(['cadastro', 'operacoes']);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('gsa_admin_access_snapshot', {});

      if (!rpcError && rpcData) {
        if (Array.isArray(rpcData.collaborators)) {
          setColaboradores(
            rpcData.collaborators.map((c: any) => ({
              id: c.id,
              nome: c.nome,
              email: c.email,
              telefone: c.telefone,
              status: c.status || 'ativo',
              cargo: c.funcoes?.nome || c.cargo || 'Colaborador',
              modulos: Array.isArray(c.modulos) ? c.modulos : ['operacoes'],
              created_at: c.created_at,
            }))
          );
        }
        if (Array.isArray(rpcData.sessions)) {
          setSessoes(rpcData.sessions);
        }
        if (Array.isArray(rpcData.deletion_requests)) {
          setExclusoes(rpcData.deletion_requests);
        }
      } else {
        // Fallback queries
        const [
          { data: cols },
          { data: sessionsList },
          { data: delList },
        ] = await Promise.all([
          supabase.from('colaboradores').select('*').order('nome'),
          supabase.from('admin_sessoes_ativas').select('*').limit(20),
          supabase.from('solicitacoes_exclusao').select('*').limit(20),
        ]);

        if (Array.isArray(cols)) {
          setColaboradores(
            cols.map((c: any) => ({
              id: c.id,
              nome: c.nome,
              email: c.email,
              telefone: c.telefone,
              status: c.status || 'ativo',
              cargo: c.cargo || 'Colaborador',
              modulos: Array.isArray(c.modulos) ? c.modulos : ['operacoes'],
              created_at: c.created_at,
            }))
          );
        }
        if (Array.isArray(sessionsList)) {
          setSessoes(sessionsList);
        }
        if (Array.isArray(delList)) {
          setExclusoes(delList);
        }
      }
    } catch (e: any) {
      console.warn('Erro ao carregar acessos:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleStatus = async (colab: ColaboradorItem) => {
    const nextStatus = colab.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('colaboradores')
        .update({ status: nextStatus })
        .eq('id', colab.id);

      if (error) {
        await supabase.rpc('gsa_admin_toggle_collaborator_status', {
          p_colaborador_id: colab.id,
          p_status: nextStatus,
        });
      }

      Alert.alert('Sucesso', `Colaborador marcado como ${nextStatus}.`);
      setColaboradores((prev) =>
        prev.map((c) => (c.id === colab.id ? { ...c, status: nextStatus } : c))
      );
    } catch (e: any) {
      Alert.alert('Erro ao alterar status', e?.message || 'Falha na operação.');
    }
  };

  const handleGeneratePin = async (colab: ColaboradorItem) => {
    try {
      const newPin = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase
        .from('colaboradores')
        .update({ pin_hash: newPin })
        .eq('id', colab.id);

      if (error) {
        await supabase.rpc('gsa_admin_generate_collaborator_pin', {
          p_colaborador_id: colab.id,
        });
      }

      setGeneratedPin(newPin);
      setSelectedColab(colab);
      setPinModalVisible(true);
    } catch (e: any) {
      Alert.alert('Erro ao gerar PIN', e?.message || 'Falha na operação.');
    }
  };

  const handleSaveNewCollaborator = async () => {
    if (!formNome.trim()) {
      Alert.alert('Atenção', 'O nome do colaborador é obrigatório.');
      return;
    }
    setSubmitting(true);
    try {
      const generatedPinInitial = Math.floor(100000 + Math.random() * 900000).toString();
      const { data, error } = await supabase.from('colaboradores').insert({
        nome: formNome.trim(),
        email: formEmail.trim() || null,
        telefone: formTelefone.trim() || null,
        cargo: formCargo,
        modulos: formModulos,
        status: 'ativo',
        pin_hash: generatedPinInitial,
      }).select().single();

      if (error) {
        await supabase.rpc('gsa_admin_save_collaborator', {
          p_colaborador: {
            nome: formNome.trim(),
            email: formEmail.trim(),
            telefone: formTelefone.trim(),
            cargo: formCargo,
            modulos: formModulos,
          },
        });
      }

      Alert.alert('Sucesso', `Colaborador criado com sucesso! PIN inicial: ${generatedPinInitial}`);
      setCreateModalVisible(false);
      setFormNome('');
      setFormEmail('');
      setFormTelefone('');
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao criar', e?.message || 'Falha ao salvar colaborador.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!selectedColab) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('colaboradores')
        .update({ modulos: formModulos })
        .eq('id', selectedColab.id);

      if (error) throw error;

      Alert.alert('Sucesso', 'Permissões do colaborador atualizadas!');
      setEditModalVisible(false);
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao atualizar', e?.message || 'Falha na operação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const { error } = await supabase.from('admin_sessoes_ativas').delete().eq('id', sessionId);
      if (error) {
        await supabase.rpc('gsa_admin_terminate_session', { p_session_id: sessionId });
      }
      Alert.alert('Sessão Encerrada', 'O acesso remoto foi desativado.');
      setSessoes((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao derrubar sessão.');
    }
  };

  const toggleModuleSelection = (modKey: string) => {
    if (formModulos.includes(modKey)) {
      setFormModulos(formModulos.filter((m) => m !== modKey));
    } else {
      setFormModulos([...formModulos, modKey]);
    }
  };

  const filteredColaboradores = colaboradores.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} colors={['#17345f']} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Segurança & Governança</Text>
          <Text style={styles.headerTitle}>Gestão de Acessos RBAC</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            setFormModulos(['cadastro', 'operacoes']);
            setCreateModalVisible(true);
          }}
        >
          <Text style={styles.addBtnText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'colaboradores' && styles.tabBtnActive]}
          onPress={() => setActiveTab('colaboradores')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'colaboradores' && styles.tabBtnTextActive]}>
            Colaboradores ({colaboradores.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'sessoes' && styles.tabBtnActive]}
          onPress={() => setActiveTab('sessoes')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'sessoes' && styles.tabBtnTextActive]}>
            Sessões ({sessoes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'exclusoes' && styles.tabBtnActive]}
          onPress={() => setActiveTab('exclusoes')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'exclusoes' && styles.tabBtnTextActive]}>
            Auditoria ({exclusoes.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search for Collaborators */}
      {activeTab === 'colaboradores' && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loaderArea}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loaderText}>Carregando colaboradores e acessos...</Text>
        </View>
      ) : (
        <>
          {/* TAB 1: COLABORADORES */}
          {activeTab === 'colaboradores' && (
            <View style={styles.listContainer}>
              {filteredColaboradores.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Nenhum colaborador encontrado</Text>
                  <Text style={styles.emptyText}>Tente ajustar a busca ou cadastre um novo usuário.</Text>
                </View>
              ) : (
                filteredColaboradores.map((colab) => (
                  <View key={colab.id} style={styles.colabCard}>
                    <View style={styles.colabTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.colabNome}>{colab.nome}</Text>
                        <Text style={styles.colabCargo}>{colab.cargo}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          colab.status === 'ativo' ? styles.statusBadgeAtivo : styles.statusBadgeInativo,
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>{colab.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    {colab.email ? (
                      <Text style={styles.colabContact}>✉ {colab.email}</Text>
                    ) : null}
                    {colab.telefone ? (
                      <Text style={styles.colabContact}>📞 {colab.telefone}</Text>
                    ) : null}

                    {/* Módulos Liberados */}
                    <Text style={styles.modulosLabel}>Módulos Permitidos:</Text>
                    <View style={styles.modulosChipsWrap}>
                      {(colab.modulos || []).map((mod) => (
                        <View key={mod} style={styles.moduloChip}>
                          <Text style={styles.moduloChipText}>{mod}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Quick Actions */}
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        style={styles.actionBtnSecondary}
                        onPress={() => {
                          setSelectedColab(colab);
                          setFormModulos(colab.modulos || []);
                          setEditModalVisible(true);
                        }}
                      >
                        <Text style={styles.actionBtnSecondaryText}>Permissões</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnSecondary}
                        onPress={() => handleGeneratePin(colab)}
                      >
                        <Text style={styles.actionBtnSecondaryText}>Gerar PIN</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionBtnStatus,
                          colab.status === 'ativo' ? styles.actionBtnDanger : styles.actionBtnSuccess,
                        ]}
                        onPress={() => handleToggleStatus(colab)}
                      >
                        <Text style={styles.actionBtnStatusText}>
                          {colab.status === 'ativo' ? 'Desativar' : 'Ativar'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 2: SESSÕES ATIVAS */}
          {activeTab === 'sessoes' && (
            <View style={styles.listContainer}>
              {sessoes.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Nenhuma sessão externa ativa</Text>
                  <Text style={styles.emptyText}>Todas as sessões estão em conformidade de logout.</Text>
                </View>
              ) : (
                sessoes.map((s) => (
                  <View key={s.id} style={styles.sessionCard}>
                    <View style={styles.colabTopRow}>
                      <Text style={styles.colabNome}>{s.colaborador_nome || 'Sessão Administrativa'}</Text>
                      <TouchableOpacity
                        style={styles.terminateBtn}
                        onPress={() => handleTerminateSession(s.id)}
                      >
                        <Text style={styles.terminateBtnText}>Derrubar</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.sessionDetail}>IP: {s.ip_address || '127.0.0.1'}</Text>
                    <Text style={styles.sessionDetail}>Início: {new Date(s.created_at).toLocaleString('pt-BR')}</Text>
                    {s.user_agent ? (
                      <Text style={styles.sessionDetail} numberOfLines={1}>Agente: {s.user_agent}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 3: AUDITORIA DE EXCLUSÕES */}
          {activeTab === 'exclusoes' && (
            <View style={styles.listContainer}>
              {exclusoes.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Nenhuma solicitação de exclusão</Text>
                  <Text style={styles.emptyText}>O histórico de auditoria de dados está limpo.</Text>
                </View>
              ) : (
                exclusoes.map((item) => (
                  <View key={item.id} style={styles.sessionCard}>
                    <Text style={styles.colabNome}>Tabela: {item.tabela}</Text>
                    <Text style={styles.sessionDetail}>ID Registro: {item.registro_id}</Text>
                    <Text style={styles.sessionDetail}>Solicitante: {item.colaborador_nome || 'Colaborador'}</Text>
                    <Text style={styles.sessionDetail}>Motivo: {item.motivo || 'Não informado'}</Text>
                    <Text style={[styles.sessionDetail, { fontWeight: 'bold', color: '#17345f' }]}>
                      Status: {item.status}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </>
      )}

      {/* Modal Novo Colaborador */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Colaborador</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.inputLabel}>Nome Completo *</Text>
              <TextInput
                style={styles.textInput}
                value={formNome}
                onChangeText={setFormNome}
                placeholder="Ex: Carlos Eduardo"
              />

              <Text style={styles.inputLabel}>E-mail</Text>
              <TextInput
                style={styles.textInput}
                value={formEmail}
                onChangeText={setFormEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="carlos@grupogsa.com.br"
              />

              <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.textInput}
                value={formTelefone}
                onChangeText={setFormTelefone}
                keyboardType="phone-pad"
                placeholder="(11) 99999-9999"
              />

              <Text style={styles.inputLabel}>Cargo / Função</Text>
              <TextInput
                style={styles.textInput}
                value={formCargo}
                onChangeText={setFormCargo}
                placeholder="Ex: Gestor de Orçamentos"
              />

              <Text style={styles.inputLabel}>Módulos Liberados:</Text>
              {ALL_MODULES.map((mod) => (
                <TouchableOpacity
                  key={mod.key}
                  style={styles.checkboxRow}
                  onPress={() => toggleModuleSelection(mod.key)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      formModulos.includes(mod.key) && styles.checkboxActive,
                    ]}
                  >
                    {formModulos.includes(mod.key) ? (
                      <Text style={styles.checkmark}>✓</Text>
                    ) : null}
                  </View>
                  <Text style={styles.checkboxLabel}>{mod.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleSaveNewCollaborator}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Cadastrar e Gerar PIN</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelModalBtn}
              onPress={() => setCreateModalVisible(false)}
            >
              <Text style={styles.cancelModalBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Editar Permissões */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Permissões</Text>
            <Text style={styles.modalSubtitle}>{selectedColab?.nome}</Text>

            <ScrollView style={{ maxHeight: 380 }}>
              {ALL_MODULES.map((mod) => (
                <TouchableOpacity
                  key={mod.key}
                  style={styles.checkboxRow}
                  onPress={() => toggleModuleSelection(mod.key)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      formModulos.includes(mod.key) && styles.checkboxActive,
                    ]}
                  >
                    {formModulos.includes(mod.key) ? (
                      <Text style={styles.checkmark}>✓</Text>
                    ) : null}
                  </View>
                  <Text style={styles.checkboxLabel}>{mod.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleUpdatePermissions}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Salvar Permissões</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelModalBtn}
              onPress={() => setEditModalVisible(false)}
            >
              <Text style={styles.cancelModalBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal PIN Gerado */}
      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pinModalContent}>
            <Text style={styles.pinModalTitle}>PIN de Acesso Gerado</Text>
            <Text style={styles.pinModalDesc}>
              Compartilhe este PIN com {selectedColab?.nome} para que ele possa acessar o aplicativo administrativo:
            </Text>

            <View style={styles.pinDisplayBox}>
              <Text style={styles.pinDisplayText}>{generatedPin}</Text>
            </View>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={() => {
                setPinModalVisible(false);
                Alert.alert('Copiado', 'PIN de acesso pronto para envio.');
              }}
            >
              <Text style={styles.primaryModalBtnText}>Entendido / Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  addBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    backgroundColor: '#17345f',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  tabsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 6,
  },
  tabBtnActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchInput: {
    minHeight: 44,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0f172a',
  },
  loaderArea: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  listContainer: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10b981',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  colabCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  colabTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  colabNome: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  colabCargo: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeAtivo: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeInativo: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
  },
  colabContact: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  modulosLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
  },
  modulosChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  moduloChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  moduloChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  actionBtnSecondary: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  actionBtnStatus: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnSuccess: {
    backgroundColor: '#059669',
  },
  actionBtnDanger: {
    backgroundColor: '#dc2626',
  },
  actionBtnStatusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  sessionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  terminateBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  terminateBtnText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 12,
  },
  sessionDetail: {
    fontSize: 13,
    color: '#64748b',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  textInput: {
    minHeight: 44,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 6,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
  },
  primaryModalBtn: {
    minHeight: 48,
    backgroundColor: '#17345f',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  primaryModalBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelModalBtn: {
    minHeight: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelModalBtnText: {
    color: '#475569',
    fontWeight: '700',
  },
  pinModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  pinModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 8,
  },
  pinModalDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  pinDisplayBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#17345f',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginVertical: 18,
  },
  pinDisplayText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 6,
    color: '#17345f',
  },
});
