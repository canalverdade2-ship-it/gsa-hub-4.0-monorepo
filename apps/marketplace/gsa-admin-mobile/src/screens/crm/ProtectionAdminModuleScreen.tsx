import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../../supabase';

type Domain = 'saude' | 'seguros';
type ProtectionTab = 'dashboard' | 'contratos' | 'cotacoes' | 'propostas' | 'parceiros';

export const ProtectionAdminModuleScreen = () => {
  const [domain, setDomain] = useState<Domain>('saude');
  const [activeTab, setActiveTab] = useState<ProtectionTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Domain theme colors
  const accentColor = domain === 'saude' ? '#0d9488' : '#2563eb';
  const domainLabel = domain === 'saude' ? 'GSA Saúde' : 'GSA Seguros';

  // Counts
  const [counts, setCounts] = useState({
    contratos: 0,
    cotacoes: 0,
    propostas: 0,
    parceiros: 0,
  });

  // Current list items
  const [items, setItems] = useState<any[]>([]);

  // Modals
  const [newProposalModal, setNewProposalModal] = useState(false);
  const [proposalForm, setProposalForm] = useState({
    titular: '',
    tipo_plano: '',
    valor: '',
    parceiro: '',
    observacoes: '',
  });
  const [submittingProposal, setSubmittingProposal] = useState(false);

  const [newPartnerModal, setNewPartnerModal] = useState(false);
  const [partnerForm, setPartnerForm] = useState({
    nome: '',
    cnpj: '',
    telefone: '',
    cidade: '',
    uf: 'SP',
  });
  const [submittingPartner, setSubmittingPartner] = useState(false);

  const [statusModalItem, setStatusModalItem] = useState<any | null>(null);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Determine current table name
  const getTableName = useCallback((d: Domain, tab: ProtectionTab) => {
    if (tab === 'contratos') return d === 'saude' ? 'saude_contratos' : 'seguros_apolices';
    if (tab === 'cotacoes') return `${d}_cotacoes`;
    if (tab === 'propostas') return `${d}_propostas`;
    if (tab === 'parceiros') return `${d}_parceiros`;
    return `${d}_contratos`;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch counts for dashboard
      const tableContratos = domain === 'saude' ? 'saude_contratos' : 'seguros_apolices';
      const [
        { count: countContr },
        { count: countCot },
        { count: countProp },
        { count: countParc },
      ] = await Promise.all([
        supabase.from(tableContratos).select('id', { count: 'exact', head: true }),
        supabase.from(`${domain}_cotacoes`).select('id', { count: 'exact', head: true }),
        supabase.from(`${domain}_propostas`).select('id', { count: 'exact', head: true }),
        supabase.from(`${domain}_parceiros`).select('id', { count: 'exact', head: true }),
      ]);

      setCounts({
        contratos: countContr || 0,
        cotacoes: countCot || 0,
        propostas: countProp || 0,
        parceiros: countParc || 0,
      });

      // 2. Fetch list items if not in dashboard
      if (activeTab !== 'dashboard') {
        const currentTable = getTableName(domain, activeTab);
        const { data, error } = await supabase
          .from(currentTable)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          setItems(data);
        } else {
          // Fallback mock check or RPC
          setItems([]);
        }
      }
    } catch (err: any) {
      console.warn('Erro ao carregar proteção:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [domain, activeTab, getTableName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Create Proposal
  const handleSaveProposal = async () => {
    if (!proposalForm.titular.trim()) {
      Alert.alert('Validação', 'Informe o nome do titular / beneficiário.');
      return;
    }
    setSubmittingProposal(true);
    try {
      const table = `${domain}_propostas`;
      const valorNum = Number(proposalForm.valor.replace(',', '.')) || 0;
      const payload: any = {
        titular: proposalForm.titular.trim(),
        nome: proposalForm.titular.trim(),
        plano: proposalForm.tipo_plano.trim() || 'Padrão',
        valor: valorNum,
        parceiro_nome: proposalForm.parceiro.trim() || null,
        status: 'enviada',
        resumo: proposalForm.observacoes.trim() || null,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from(table).insert([payload]).select();
      if (error) throw error;

      Alert.alert('Sucesso', 'Proposta cadastrada com sucesso!');
      setNewProposalModal(false);
      setProposalForm({ titular: '', tipo_plano: '', valor: '', parceiro: '', observacoes: '' });
      if (activeTab === 'propostas' && data) {
        setItems(prev => [data[0], ...prev]);
      } else {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert('Erro ao salvar proposta', err.message);
    } finally {
      setSubmittingProposal(false);
    }
  };

  // Create Partner
  const handleSavePartner = async () => {
    if (!partnerForm.nome.trim()) {
      Alert.alert('Validação', 'Informe a razão social ou nome do parceiro.');
      return;
    }
    setSubmittingPartner(true);
    try {
      const table = `${domain}_parceiros`;
      const payload: any = {
        nome: partnerForm.nome.trim(),
        cnpj: partnerForm.cnpj.trim() || null,
        telefone: partnerForm.telefone.trim() || null,
        cidade: partnerForm.cidade.trim() || null,
        estado: partnerForm.uf.trim().toUpperCase() || 'SP',
        status: 'ativo',
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from(table).insert([payload]).select();
      if (error) throw error;

      Alert.alert('Sucesso', 'Parceiro credenciado com sucesso!');
      setNewPartnerModal(false);
      setPartnerForm({ nome: '', cnpj: '', telefone: '', cidade: '', uf: 'SP' });
      if (activeTab === 'parceiros' && data) {
        setItems(prev => [data[0], ...prev]);
      } else {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar parceiro', err.message);
    } finally {
      setSubmittingPartner(false);
    }
  };

  // Update Status
  const handleSaveStatus = async () => {
    if (!statusModalItem || !selectedStatus) return;
    setUpdatingStatus(true);
    try {
      const table = getTableName(domain, activeTab);

      // Attempt RPC first
      try {
        await supabase.rpc('gsa_admin_update_resource_status', {
          p_resource: table,
          p_id: statusModalItem.id,
          p_status: selectedStatus,
          p_reason: 'Atualização via app mobile administrativo',
        });
      } catch (rpcErr) {
        // Direct table update fallback
        const { error } = await supabase
          .from(table)
          .update({ status: selectedStatus })
          .eq('id', statusModalItem.id);
        if (error) throw error;
      }

      setItems(prev =>
        prev.map(i => (i.id === statusModalItem.id ? { ...i, status: selectedStatus } : i))
      );
      setStatusModalItem(null);
      Alert.alert('Sucesso', 'Status atualizado!');
    } catch (err: any) {
      Alert.alert('Erro ao atualizar status', err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Status badge style
  const getStatusBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'ativo':
      case 'aprovada':
      case 'aceita':
      case 'ativada':
        return { bg: '#dcfce7', text: '#15803d' };
      case 'em_analise':
      case 'enviada':
      case 'consultando_parceiros':
      case 'propostas_disponiveis':
        return { bg: '#dbeafe', text: '#1d4ed8' };
      case 'cancelado':
      case 'recusada':
      case 'encerrada':
        return { bg: '#fee2e2', text: '#b91c1c' };
      default:
        return { bg: '#fef3c7', text: '#b45309' };
    }
  };

  const filteredItems = items.filter(item => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const name = (item.nome || item.titular || item.titulo || item.protocolo || '').toLowerCase();
    const sub = (item.plano || item.resumo || item.email || item.cnpj || '').toLowerCase();
    return name.includes(term) || sub.includes(term);
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Domain Switcher */}
      <View style={styles.domainSwitcherContainer}>
        <TouchableOpacity
          style={[
            styles.domainBtn,
            domain === 'saude' && { backgroundColor: '#0d9488', borderColor: '#0d9488' },
          ]}
          onPress={() => {
            setDomain('saude');
            setActiveTab('dashboard');
          }}
        >
          <Text style={[styles.domainBtnText, domain === 'saude' && { color: '#ffffff' }]}>
            🏥 GSA Saúde
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.domainBtn,
            domain === 'seguros' && { backgroundColor: '#2563eb', borderColor: '#2563eb' },
          ]}
          onPress={() => {
            setDomain('seguros');
            setActiveTab('dashboard');
          }}
        >
          <Text style={[styles.domainBtnText, domain === 'seguros' && { color: '#ffffff' }]}>
            🛡️ GSA Seguros
          </Text>
        </TouchableOpacity>
      </View>

      {/* Domain Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{domainLabel}</Text>
          <Text style={styles.headerSubtitle}>
            Gestão de planos, cotações, propostas e apólices
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.actionTopBtn, { backgroundColor: accentColor }]}
          onPress={() => {
            if (activeTab === 'parceiros') {
              setNewPartnerModal(true);
            } else {
              setNewProposalModal(true);
            }
          }}
        >
          <Text style={styles.actionTopBtnText}>
            {activeTab === 'parceiros' ? '+ Parceiro' : '+ Proposta'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sub Tabs Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabScrollContent}
      >
        {[
          { id: 'dashboard', label: 'Visão Geral' },
          { id: 'contratos', label: domain === 'saude' ? 'Contratações' : 'Apólices' },
          { id: 'cotacoes', label: 'Cotações' },
          { id: 'propostas', label: 'Propostas' },
          { id: 'parceiros', label: 'Parceiros' },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[
              styles.subTabItem,
              activeTab === t.id && [styles.subTabItemActive, { borderBottomColor: accentColor }],
            ]}
            onPress={() => setActiveTab(t.id as ProtectionTab)}
          >
            <Text
              style={[
                styles.subTabText,
                activeTab === t.id && [styles.subTabTextActive, { color: accentColor }],
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      {activeTab === 'dashboard' ? (
        <ScrollView
          contentContainerStyle={styles.dashboardContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accentColor]} />
          }
        >
          <Text style={styles.dashboardHeading}>Indicadores Operacionais</Text>
          <View style={styles.dashboardGrid}>
            <TouchableOpacity
              style={styles.gridCard}
              onPress={() => setActiveTab('contratos')}
            >
              <Text style={styles.gridCardEmoji}>📄</Text>
              <Text style={styles.gridCardCount}>{counts.contratos}</Text>
              <Text style={styles.gridCardTitle}>
                {domain === 'saude' ? 'Contratos Ativos' : 'Apólices Emitidas'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridCard}
              onPress={() => setActiveTab('cotacoes')}
            >
              <Text style={styles.gridCardEmoji}>🔍</Text>
              <Text style={styles.gridCardCount}>{counts.cotacoes}</Text>
              <Text style={styles.gridCardTitle}>Cotações em Análise</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridCard}
              onPress={() => setActiveTab('propostas')}
            >
              <Text style={styles.gridCardEmoji}>💼</Text>
              <Text style={styles.gridCardCount}>{counts.propostas}</Text>
              <Text style={styles.gridCardTitle}>Propostas Enviadas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gridCard}
              onPress={() => setActiveTab('parceiros')}
            >
              <Text style={styles.gridCardEmoji}>🏢</Text>
              <Text style={styles.gridCardCount}>{counts.parceiros}</Text>
              <Text style={styles.gridCardTitle}>Rede de Parceiros</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerTitle}>Regras & Conformidade GSA Protection</Text>
            <Text style={styles.infoBannerText}>
              • Todas as emissões de apólices e contratações de saúde passam por verificação cadastral.
              {'\n'}• Propostas aceitas geram automaticamente notificação e protocolo auditado.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={`Buscar em ${activeTab}...`}
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={accentColor} />
              <Text style={styles.loadingText}>Carregando registros...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item, index) => item.id || String(index)}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accentColor]} />
              }
              renderItem={({ item }) => {
                const sBadge = getStatusBadge(item.status);
                const title = item.nome || item.titular || item.titulo || item.protocolo || `Registro #${String(item.id).slice(0, 8)}`;
                const subtitle = item.plano || item.resumo || item.email || item.categoria || item.cnpj || 'Detalhes não informados';

                return (
                  <View style={styles.itemCard}>
                    <View style={styles.itemCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemCardTitle}>{title}</Text>
                        <Text style={styles.itemCardSubtitle}>{subtitle}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: sBadge.bg }]}>
                        <Text style={[styles.badgeText, { color: sBadge.text }]}>
                          {item.status ? String(item.status).replace('_', ' ').toUpperCase() : 'PENDENTE'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.itemCardBottom}>
                      {item.valor != null ? (
                        <Text style={[styles.itemCardPrice, { color: accentColor }]}>
                          R$ {Number(item.valor).toFixed(2)}
                        </Text>
                      ) : (
                        <Text style={styles.itemCardDate}>
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : ''}
                        </Text>
                      )}

                      <TouchableOpacity
                        style={styles.changeStatusBtn}
                        onPress={() => {
                          setStatusModalItem(item);
                          setSelectedStatus(item.status || 'ativo');
                        }}
                      >
                        <Text style={styles.changeStatusBtnText}>Alterar Status</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyTitle}>Nenhum registro encontrado</Text>
                  <Text style={styles.emptySubtitle}>
                    Use o botão acima para adicionar um novo registro.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* Modal: Nova Proposta */}
      <Modal visible={newProposalModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Proposta ({domainLabel})</Text>
              <TouchableOpacity onPress={() => setNewProposalModal(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormScroll}>
              <Text style={styles.inputLabel}>Titular / Beneficiário Principal *</Text>
              <TextInput
                style={styles.modalInput}
                value={proposalForm.titular}
                onChangeText={text => setProposalForm(prev => ({ ...prev, titular: text }))}
                placeholder="Nome completo do segurado / conveniado"
              />

              <Text style={styles.inputLabel}>Plano / Modalidade</Text>
              <TextInput
                style={styles.modalInput}
                value={proposalForm.tipo_plano}
                onChangeText={text => setProposalForm(prev => ({ ...prev, tipo_plano: text }))}
                placeholder={domain === 'saude' ? 'Ex: Individual, Familiar, Coparticipação' : 'Ex: Auto Completo, Vida, Residencial'}
              />

              <Text style={styles.inputLabel}>Valor Mensal / Prêmio (R$)</Text>
              <TextInput
                style={styles.modalInput}
                value={proposalForm.valor}
                onChangeText={text => setProposalForm(prev => ({ ...prev, valor: text }))}
                placeholder="0,00"
                keyboardType="decimal-pad"
              />

              <Text style={styles.inputLabel}>Operadora / Seguradora Parceira</Text>
              <TextInput
                style={styles.modalInput}
                value={proposalForm.parceiro}
                onChangeText={text => setProposalForm(prev => ({ ...prev, parceiro: text }))}
                placeholder="Nome da seguradora ou operadora"
              />

              <Text style={styles.inputLabel}>Observações e Coberturas</Text>
              <TextInput
                style={[styles.modalInput, { height: 80 }]}
                value={proposalForm.observacoes}
                onChangeText={text => setProposalForm(prev => ({ ...prev, observacoes: text }))}
                placeholder="Detalhes da franquia, carência ou coberturas..."
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setNewProposalModal(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: accentColor }]}
                onPress={handleSaveProposal}
                disabled={submittingProposal}
              >
                {submittingProposal ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Criar Proposta</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Novo Parceiro */}
      <Modal visible={newPartnerModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Parceiro Credenciado</Text>
              <TouchableOpacity onPress={() => setNewPartnerModal(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormScroll}>
              <Text style={styles.inputLabel}>Razão Social / Nome da Entidade *</Text>
              <TextInput
                style={styles.modalInput}
                value={partnerForm.nome}
                onChangeText={text => setPartnerForm(prev => ({ ...prev, nome: text }))}
                placeholder="Ex: Clínica Saúde Total ou Corretora Alfa"
              />

              <Text style={styles.inputLabel}>CNPJ</Text>
              <TextInput
                style={styles.modalInput}
                value={partnerForm.cnpj}
                onChangeText={text => setPartnerForm(prev => ({ ...prev, cnpj: text }))}
                placeholder="00.000.000/0000-00"
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.modalInput}
                value={partnerForm.telefone}
                onChangeText={text => setPartnerForm(prev => ({ ...prev, telefone: text }))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Cidade</Text>
              <TextInput
                style={styles.modalInput}
                value={partnerForm.cidade}
                onChangeText={text => setPartnerForm(prev => ({ ...prev, cidade: text }))}
                placeholder="Cidade"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setNewPartnerModal(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: accentColor }]}
                onPress={handleSavePartner}
                disabled={submittingPartner}
              >
                {submittingPartner ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Cadastrar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Atualizar Status */}
      <Modal visible={!!statusModalItem} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardSmall}>
            <Text style={styles.modalTitle}>Alterar Status</Text>
            <Text style={styles.modalSubtitle}>
              {statusModalItem?.nome || statusModalItem?.titular || statusModalItem?.protocolo}
            </Text>

            <View style={styles.statusOptionsList}>
              {['ativo', 'em_analise', 'proposta_aceita', 'cancelado'].map(st => (
                <TouchableOpacity
                  key={st}
                  style={[
                    styles.statusOptionBtn,
                    selectedStatus === st && [styles.statusOptionBtnActive, { borderColor: accentColor }],
                  ]}
                  onPress={() => setSelectedStatus(st)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      selectedStatus === st && { color: accentColor, fontWeight: '800' },
                    ]}
                  >
                    {st.replace('_', ' ').toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setStatusModalItem(null)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: accentColor }]}
                onPress={handleSaveStatus}
                disabled={updatingStatus}
              >
                {updatingStatus ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  domainSwitcherContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  domainBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  domainBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  actionTopBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionTopBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  tabScroll: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 46,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subTabItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  subTabItemActive: {
    borderBottomWidth: 3,
  },
  subTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  subTabTextActive: {
    fontWeight: '800',
  },
  dashboardContent: {
    padding: 16,
    gap: 14,
  },
  dashboardHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  gridCardEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  gridCardCount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
  },
  gridCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  infoBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 44,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  itemCardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  itemCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  itemCardPrice: {
    fontSize: 16,
    fontWeight: '800',
  },
  itemCardDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  changeStatusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    minHeight: 36,
    justifyContent: 'center',
  },
  changeStatusBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalCardSmall: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  closeBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748b',
    padding: 4,
  },
  modalFormScroll: {
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 44,
  },
  statusOptionsList: {
    gap: 8,
    marginVertical: 12,
  },
  statusOptionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
    justifyContent: 'center',
  },
  statusOptionBtnActive: {
    backgroundColor: '#ffffff',
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  modalBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
