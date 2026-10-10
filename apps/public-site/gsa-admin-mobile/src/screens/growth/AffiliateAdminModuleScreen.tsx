import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface AffiliateRecord {
  id: string;
  cliente_id?: string;
  nome_divulgacao: string;
  codigo_publico?: string;
  status: 'ativo' | 'inativo' | 'suspenso' | string;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  created_at?: string;
  cliques?: number;
  conversoes?: number;
  comissao_total?: number;
  comissao_pendente?: number;
  saldo_disponivel?: number;
  clientes?: { nome: string; email?: string; telefone?: string };
}

export interface AffiliatePayout {
  id: string;
  afiliado_id?: string;
  afiliado_nome?: string;
  valor: number;
  status: 'solicitado' | 'aprovado' | 'pago' | 'rejeitado' | string;
  pix_tipo?: string | null;
  pix_chave?: string | null;
  solicitado_em?: string;
  aprovado_em?: string | null;
  pago_em?: string | null;
  notas?: string | null;
}

export interface AffiliateProgram {
  id: string;
  codigo: string;
  nome: string;
  percentual: number;
  saque_minimo: number;
  ativo: boolean;
}

export const AffiliateAdminModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'afiliados' | 'saques' | 'programas'>('afiliados');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  const [affiliates, setAffiliates] = useState<AffiliateRecord[]>([]);
  const [payouts, setPayouts] = useState<AffiliatePayout[]>([]);
  const [programs, setPrograms] = useState<AffiliateProgram[]>([]);

  // Selected for inspection / action
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateRecord | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    nome_divulgacao: '',
    codigo_publico: '',
    pix_tipo: 'cpf',
    pix_chave: '',
    status: 'ativo',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const [selectedPayout, setSelectedPayout] = useState<AffiliatePayout | null>(null);
  const [payoutModalVisible, setPayoutModalVisible] = useState(false);
  const [payoutAction, setPayoutAction] = useState<'aprovar' | 'marcar_pago' | 'rejeitar'>('aprovar');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch Affiliates
      const { data: affData, error: affErr } = await supabase
        .from('gsa_afiliados')
        .select('*, clientes(nome, email, telefone)')
        .order('created_at', { ascending: false });

      if (affErr) {
        // Fallback to simpler select if join fails
        const { data: simpleData } = await supabase
          .from('gsa_afiliados')
          .select('*')
          .order('created_at', { ascending: false });
        setAffiliates(simpleData || []);
      } else {
        setAffiliates(affData || []);
      }

      // 2. Fetch Payouts
      const { data: payData, error: payErr } = await supabase
        .from('gsa_afiliado_saques')
        .select('*')
        .order('solicitado_em', { ascending: false });

      if (!payErr && payData) {
        setPayouts(payData);
      }

      // 3. Fetch Programs
      const { data: progData, error: progErr } = await supabase
        .from('gsa_afiliado_programas')
        .select('*')
        .order('nome', { ascending: true });

      if (!progErr && progData) {
        setPrograms(progData);
      }
    } catch (e: any) {
      console.warn('AffiliateAdminModule load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // KPIs
  const totalAffiliates = affiliates.length;
  const activeAffiliates = affiliates.filter((a) => a.status === 'ativo').length;
  const pendingPayouts = payouts.filter((p) => p.status === 'solicitado');
  const pendingPayoutsTotal = pendingPayouts.reduce((sum, p) => sum + Number(p.valor || 0), 0);

  // Filtered Affiliates
  const filteredAffiliates = useMemo(() => {
    return affiliates.filter((a) => {
      const matchSearch =
        !search ||
        a.nome_divulgacao?.toLowerCase().includes(search.toLowerCase()) ||
        a.codigo_publico?.toLowerCase().includes(search.toLowerCase()) ||
        a.pix_chave?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'todos' || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [affiliates, search, statusFilter]);

  // Filtered Payouts
  const filteredPayouts = useMemo(() => {
    return payouts.filter((p) => {
      const matchSearch =
        !search ||
        p.afiliado_nome?.toLowerCase().includes(search.toLowerCase()) ||
        p.pix_chave?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'todos' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [payouts, search, statusFilter]);

  // Edit affiliate handler
  const handleOpenEdit = (aff: AffiliateRecord) => {
    setSelectedAffiliate(aff);
    setEditForm({
      nome_divulgacao: aff.nome_divulgacao || '',
      codigo_publico: aff.codigo_publico || '',
      pix_tipo: aff.pix_tipo || 'cpf',
      pix_chave: aff.pix_chave || '',
      status: aff.status || 'ativo',
    });
    setEditModalVisible(true);
  };

  const handleSaveAffiliate = async () => {
    if (!selectedAffiliate) return;
    if (!editForm.nome_divulgacao.trim()) {
      Alert.alert('Atenção', 'Informe o nome de divulgação.');
      return;
    }
    setSavingEdit(true);
    try {
      // Try RPC first
      const { error: rpcErr } = await supabase.rpc('gsa_admin_update_affiliate_details', {
        p_affiliate_id: selectedAffiliate.id,
        p_nome_divulgacao: editForm.nome_divulgacao.trim(),
        p_codigo_publico: editForm.codigo_publico.trim() || null,
        p_pix_tipo: editForm.pix_tipo,
        p_pix_chave: editForm.pix_chave.trim() || null,
      });

      if (rpcErr) {
        // Direct table update fallback
        const { error: tblErr } = await supabase
          .from('gsa_afiliados')
          .update({
            nome_divulgacao: editForm.nome_divulgacao.trim(),
            codigo_publico: editForm.codigo_publico.trim() || null,
            pix_tipo: editForm.pix_tipo,
            pix_chave: editForm.pix_chave.trim() || null,
            status: editForm.status,
          })
          .eq('id', selectedAffiliate.id);

        if (tblErr) throw tblErr;
      }

      Alert.alert('Sucesso', 'Afiliado atualizado com sucesso.');
      setEditModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Payout actions
  const handleOpenPayout = (p: AffiliatePayout) => {
    setSelectedPayout(p);
    setPayoutAction('aprovar');
    setPayoutNotes('');
    setPayoutModalVisible(true);
  };

  const handleProcessPayout = async () => {
    if (!selectedPayout) return;
    setSavingPayout(true);
    try {
      const newStatus =
        payoutAction === 'aprovar' ? 'aprovado' : payoutAction === 'marcar_pago' ? 'pago' : 'rejeitado';

      const updatePayload: Record<string, any> = {
        status: newStatus,
        notas: payoutNotes || selectedPayout.notas,
      };

      if (newStatus === 'aprovado') {
        updatePayload.aprovado_em = new Date().toISOString();
      } else if (newStatus === 'pago') {
        updatePayload.pago_em = new Date().toISOString();
      }

      // Try RPC first
      const { error: rpcErr } = await supabase.rpc('gsa_admin_process_payout', {
        p_payout_id: selectedPayout.id,
        p_action: payoutAction,
        p_notes: payoutNotes,
      });

      if (rpcErr) {
        // Direct table fallback
        const { error: tblErr } = await supabase
          .from('gsa_afiliado_saques')
          .update(updatePayload)
          .eq('id', selectedPayout.id);

        if (tblErr) throw tblErr;
      }

      Alert.alert('Sucesso', `Saque atualizado para: ${newStatus}`);
      setPayoutModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao processar saque.');
    } finally {
      setSavingPayout(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    let bg = '#f1f5f9';
    let text = '#475569';
    if (status === 'ativo' || status === 'pago' || status === 'aprovado') {
      bg = '#ecfdf5';
      text = '#059669';
    } else if (status === 'solicitado' || status === 'pendente') {
      bg = '#fffbeb';
      text = '#d97706';
    } else if (status === 'rejeitado' || status === 'suspenso' || status === 'cancelado') {
      bg = '#fef2f2';
      text = '#dc2626';
    }
    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: text }]}>{status.toUpperCase()}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>CRESCIMENTO & PARCERIAS</Text>
            <Text style={styles.headerTitle}>Rede de Afiliados</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Atualizar dados"
          >
            <Text style={styles.refreshButtonText}>{refreshing ? '...' : '↻'}</Text>
          </TouchableOpacity>
        </View>

        {/* Metric Cards Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsContainer}
        >
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Afiliados</Text>
            <Text style={styles.metricValue}>{totalAffiliates}</Text>
            <Text style={styles.metricSub}>{activeAffiliates} ativos</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Saques Pendentes</Text>
            <Text style={[styles.metricValue, { color: '#d97706' }]}>{pendingPayouts.length}</Text>
            <Text style={styles.metricSub}>R$ {pendingPayoutsTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Programas</Text>
            <Text style={styles.metricValue}>{programs.length}</Text>
            <Text style={styles.metricSub}>configurados</Text>
          </View>
        </ScrollView>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'afiliados' && styles.tabItemActive]}
            onPress={() => {
              setActiveTab('afiliados');
              setStatusFilter('todos');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'afiliados' && styles.tabTextActive]}>
              Afiliados ({affiliates.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'saques' && styles.tabItemActive]}
            onPress={() => {
              setActiveTab('saques');
              setStatusFilter('todos');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'saques' && styles.tabTextActive]}>
              Saques ({payouts.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'programas' && styles.tabItemActive]}
            onPress={() => {
              setActiveTab('programas');
              setStatusFilter('todos');
            }}
          >
            <Text style={[styles.tabText, activeTab === 'programas' && styles.tabTextActive]}>
              Programas ({programs.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search and Filters */}
        {activeTab !== 'programas' && (
          <View style={styles.filterSection}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nome, código ou PIX..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#94a3b8"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {['todos', 'ativo', 'inativo', 'solicitado', 'pago', 'rejeitado'].map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.chip, statusFilter === st && styles.chipActive]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[styles.chipText, statusFilter === st && styles.chipTextActive]}>
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Main Content Area */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Carregando dados de afiliados...</Text>
          </View>
        ) : activeTab === 'afiliados' ? (
          <FlatList
            data={filteredAffiliates}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.nome_divulgacao || 'Afiliado sem nome'}</Text>
                    <Text style={styles.cardSubtitle}>
                      Código: {item.codigo_publico || 'N/A'} • {item.clientes?.nome || 'Sem cliente vinculado'}
                    </Text>
                  </View>
                  {renderStatusBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>PIX ({item.pix_tipo || 'CPF'}):</Text>
                    <Text style={styles.cardColValue}>{item.pix_chave || 'Não cadastrado'}</Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Saldo Disponível:</Text>
                    <Text style={[styles.cardColValue, { color: '#059669', fontWeight: 'bold' }]}>
                      R$ {Number(item.saldo_disponivel || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButtonOutline}
                    onPress={() => handleOpenEdit(item)}
                  >
                    <Text style={styles.actionButtonOutlineText}>Editar / PIX</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonPrimary}
                    onPress={() => {
                      Alert.alert(
                        'Detalhes do Afiliado',
                        `Nome: ${item.nome_divulgacao}\n` +
                          `Código: ${item.codigo_publico || '—'}\n` +
                          `Status: ${item.status}\n` +
                          `PIX: [${item.pix_tipo || 'CPF'}] ${item.pix_chave || 'Não cadastrado'}\n` +
                          `Comissão Total: R$ ${Number(item.comissao_total || 0).toFixed(2)}\n` +
                          `Saldo Disponível: R$ ${Number(item.saldo_disponivel || 0).toFixed(2)}`
                      );
                    }}
                  >
                    <Text style={styles.actionButtonPrimaryText}>Ver Detalhes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhum afiliado encontrado</Text>
                <Text style={styles.emptySubtitle}>Ajuste a busca ou o filtro de status.</Text>
              </View>
            }
          />
        ) : activeTab === 'saques' ? (
          <FlatList
            data={filteredPayouts}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.afiliado_nome || 'Afiliado'}</Text>
                    <Text style={styles.cardSubtitle}>
                      Solicitado em: {item.solicitado_em ? new Date(item.solicitado_em).toLocaleDateString('pt-BR') : '—'}
                    </Text>
                  </View>
                  {renderStatusBadge(item.status)}
                </View>

                <View style={styles.divider} />

                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>Chave PIX:</Text>
                    <Text style={styles.cardColValue}>
                      [{item.pix_tipo || 'PIX'}] {item.pix_chave || 'Não informada'}
                    </Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Valor:</Text>
                    <Text style={[styles.cardColValue, { color: '#0f172a', fontWeight: '900', fontSize: 16 }]}>
                      R$ {Number(item.valor || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {item.notas ? (
                  <Text style={styles.notesText}>Nota: {item.notas}</Text>
                ) : null}

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButtonPrimary}
                    onPress={() => handleOpenPayout(item)}
                  >
                    <Text style={styles.actionButtonPrimaryText}>Processar Saque</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhum saque registrado</Text>
                <Text style={styles.emptySubtitle}>Não há solicitações com o filtro atual.</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            data={programs}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.nome}</Text>
                    <Text style={styles.cardSubtitle}>Código: {item.codigo}</Text>
                  </View>
                  {renderStatusBadge(item.ativo ? 'ativo' : 'inativo')}
                </View>
                <View style={styles.divider} />
                <View style={styles.cardRow}>
                  <View style={styles.cardCol}>
                    <Text style={styles.cardColLabel}>Comissão:</Text>
                    <Text style={[styles.cardColValue, { color: '#059669', fontWeight: 'bold' }]}>
                      {item.percentual}% por venda
                    </Text>
                  </View>
                  <View style={styles.cardColRight}>
                    <Text style={styles.cardColLabel}>Saque Mínimo:</Text>
                    <Text style={styles.cardColValue}>R$ {Number(item.saque_minimo || 0).toFixed(2)}</Text>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhum programa configurado</Text>
                <Text style={styles.emptySubtitle}>Os programas de comissão padrão aparecerão aqui.</Text>
              </View>
            }
          />
        )}

        {/* Modal: Edit Affiliate */}
        <Modal visible={editModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Editar Afiliado</Text>
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={styles.inputLabel}>Nome de Divulgação *</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.nome_divulgacao}
                  onChangeText={(t) => setEditForm({ ...editForm, nome_divulgacao: t })}
                  placeholder="Nome público"
                />

                <Text style={styles.inputLabel}>Código Público</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.codigo_publico}
                  onChangeText={(t) => setEditForm({ ...editForm, codigo_publico: t })}
                  placeholder="Ex: AFIL-123"
                  autoCapitalize="characters"
                />

                <Text style={styles.inputLabel}>Tipo de Chave PIX</Text>
                <View style={styles.chipRowModal}>
                  {['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chipModal, editForm.pix_tipo === type && styles.chipModalActive]}
                      onPress={() => setEditForm({ ...editForm, pix_tipo: type })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          editForm.pix_tipo === type && styles.chipModalTextActive,
                        ]}
                      >
                        {type.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Chave PIX</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.pix_chave}
                  onChangeText={(t) => setEditForm({ ...editForm, pix_chave: t })}
                  placeholder="Chave para transferências"
                />

                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.chipRowModal}>
                  {['ativo', 'inativo', 'suspenso'].map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[styles.chipModal, editForm.status === st && styles.chipModalActive]}
                      onPress={() => setEditForm({ ...editForm, status: st })}
                    >
                      <Text
                        style={[
                          styles.chipModalText,
                          editForm.status === st && styles.chipModalTextActive,
                        ]}
                      >
                        {st.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={handleSaveAffiliate}
                  disabled={savingEdit}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingEdit ? 'Salvando...' : 'Salvar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Process Payout */}
        <Modal visible={payoutModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Processar Solicitação de Saque</Text>
              {selectedPayout && (
                <View style={styles.payoutSummaryBox}>
                  <Text style={styles.payoutSummaryText}>
                    Afiliado: {selectedPayout.afiliado_nome || 'Afiliado'}
                  </Text>
                  <Text style={styles.payoutSummaryValue}>
                    Valor: R$ {Number(selectedPayout.valor || 0).toFixed(2)}
                  </Text>
                  <Text style={styles.payoutSummaryPix}>
                    PIX [{selectedPayout.pix_tipo || 'PIX'}]: {selectedPayout.pix_chave || '—'}
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Selecione a Ação</Text>
              <View style={styles.chipRowModal}>
                <TouchableOpacity
                  style={[styles.chipModal, payoutAction === 'aprovar' && styles.chipModalActive]}
                  onPress={() => setPayoutAction('aprovar')}
                >
                  <Text style={[styles.chipModalText, payoutAction === 'aprovar' && styles.chipModalTextActive]}>
                    Aprovar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chipModal, payoutAction === 'marcar_pago' && styles.chipModalActive]}
                  onPress={() => setPayoutAction('marcar_pago')}
                >
                  <Text style={[styles.chipModalText, payoutAction === 'marcar_pago' && styles.chipModalTextActive]}>
                    Marcar como Pago
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.chipModal,
                    payoutAction === 'rejeitar' && { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
                  ]}
                  onPress={() => setPayoutAction('rejeitar')}
                >
                  <Text
                    style={[
                      styles.chipModalText,
                      payoutAction === 'rejeitar' && { color: '#dc2626', fontWeight: 'bold' },
                    ]}
                  >
                    Rejeitar
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Observações / Comprovante</Text>
              <TextInput
                style={[styles.formInput, { height: 70 }]}
                value={payoutNotes}
                onChangeText={setPayoutNotes}
                placeholder="Ex: ID da transação bancária ou motivo"
                multiline
              />

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity
                  style={styles.modalButtonCancel}
                  onPress={() => setPayoutModalVisible(false)}
                >
                  <Text style={styles.modalButtonCancelText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSave}
                  onPress={handleProcessPayout}
                  disabled={savingPayout}
                >
                  <Text style={styles.modalButtonSaveText}>
                    {savingPayout ? 'Processando...' : 'Confirmar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    fontSize: 20,
    color: '#334155',
  },
  metricsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  metricCard: {
    width: 140,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 4,
  },
  metricSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabItem: {
    paddingVertical: 10,
    marginRight: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#059669',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#059669',
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    height: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
  },
  chipRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: '#059669',
  },
  chipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardCol: {
    flex: 1,
  },
  cardColRight: {
    alignItems: 'flex-end',
  },
  cardColLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  cardColValue: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    marginTop: 2,
  },
  notesText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#64748b',
    marginTop: 8,
    backgroundColor: '#f8fafc',
    padding: 6,
    borderRadius: 6,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  actionButtonOutline: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonOutlineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  actionButtonPrimary: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  formInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  chipRowModal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  chipModal: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  chipModalActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#059669',
  },
  chipModalText: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  chipModalTextActive: {
    color: '#059669',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  modalButtonCancel: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  modalButtonSave: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  payoutSummaryBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 6,
  },
  payoutSummaryText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  payoutSummaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  payoutSummaryPix: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
});

export default AffiliateAdminModuleScreen;
