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

type IndicacaoStatus = 'aberta' | 'concluída' | 'cancelada' | 'todas';

export const IndicacoesModuleScreen = () => {
  const [activeTab, setActiveTab] = useState<IndicacaoStatus>('aberta');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Data
  const [indicacoes, setIndicacoes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);

  // Modals
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    indicador_id: '',
    indicado_nome: '',
    whatsapp_indicado: '',
    observacao: '',
  });
  const [submittingNew, setSubmittingNew] = useState(false);

  const [convertModalItem, setConvertModalItem] = useState<any | null>(null);
  const [convertBonusPoints, setConvertBonusPoints] = useState('50');
  const [converting, setConverting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch indicacoes with joined indicador and voucher
      let query = supabase
        .from('indicacoes')
        .select(`
          *,
          indicador:clientes!indicador_id (id, nome, cpf, telefone)
        `)
        .order('created_at', { ascending: false });

      if (activeTab !== 'todas') {
        query = query.eq('status', activeTab);
      }

      const { data, error } = await query;
      if (!error && data) {
        setIndicacoes(data);
      } else {
        // Fallback simple query if joins fail
        const { data: simpleData } = await supabase
          .from('indicacoes')
          .select('*')
          .order('created_at', { ascending: false });
        setIndicacoes(simpleData || []);
      }

      // 2. Fetch clients for indicator selector
      const { data: cliData } = await supabase
        .from('clientes')
        .select('id, nome, cpf, telefone')
        .eq('status', 'ativo')
        .order('nome')
        .limit(100);

      if (cliData) setClientes(cliData);
    } catch (err: any) {
      console.warn('Erro ao carregar indicações:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Create new referral
  const handleCreateIndicacao = async () => {
    if (!newForm.indicador_id) {
      Alert.alert('Validação', 'Selecione o cliente que realizou a indicação.');
      return;
    }
    if (!newForm.indicado_nome.trim()) {
      Alert.alert('Validação', 'Informe o nome da pessoa indicada.');
      return;
    }
    const cleanPhone = newForm.whatsapp_indicado.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Validação', 'Informe um número de WhatsApp válido com DDD.');
      return;
    }

    setSubmittingNew(true);
    try {
      const payload: any = {
        indicador_id: newForm.indicador_id,
        indicado_nome: newForm.indicado_nome.trim(),
        whatsapp_indicado: newForm.whatsapp_indicado.trim(),
        observacao: newForm.observacao.trim() || null,
        status: 'aberta',
        data_indicacao: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('indicacoes').insert([payload]).select();
      if (error) throw error;

      Alert.alert('Sucesso', 'Indicação cadastrada no sistema!');
      setNewModalVisible(false);
      setNewForm({ indicador_id: '', indicado_nome: '', whatsapp_indicado: '', observacao: '' });
      fetchData();
    } catch (err: any) {
      Alert.alert('Erro ao salvar indicação', err.message);
    } finally {
      setSubmittingNew(false);
    }
  };

  // Convert referral
  const handleConfirmConvert = async () => {
    if (!convertModalItem) return;
    setConverting(true);
    try {
      const points = Number(convertBonusPoints) || 50;

      // 1. Update status to concluída
      const { error: indErr } = await supabase
        .from('indicacoes')
        .update({
          status: 'concluída',
          data_conversao: new Date().toISOString(),
        })
        .eq('id', convertModalItem.id);

      if (indErr) throw indErr;

      // 2. Award bonus points to the indicator client if present
      if (convertModalItem.indicador_id) {
        const { data: clientObj } = await supabase
          .from('clientes')
          .select('saldo_pontos, pontos_totais')
          .eq('id', convertModalItem.indicador_id)
          .maybeSingle();

        if (clientObj) {
          const currentPts = Number(clientObj.saldo_pontos || 0);
          await supabase
            .from('clientes')
            .update({
              saldo_pontos: currentPts + points,
              pontos_totais: Number(clientObj.pontos_totais || 0) + points,
            })
            .eq('id', convertModalItem.indicador_id);
        }
      }

      Alert.alert(
        'Indicação Convertida',
        `Indicação aprovada com sucesso! ${points} pontos creditados ao indicador.`
      );
      setConvertModalItem(null);
      fetchData();
    } catch (err: any) {
      Alert.alert('Erro ao converter indicação', err.message);
    } finally {
      setConverting(false);
    }
  };

  // Cancel referral
  const handleCancelIndicacao = async (item: any) => {
    Alert.alert(
      'Cancelar Indicação',
      `Deseja realmente marcar a indicação de ${item.indicado_nome} como cancelada?`,
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('indicacoes')
                .update({ status: 'cancelada' })
                .eq('id', item.id);
              if (error) throw error;
              setIndicacoes(prev =>
                prev.map(i => (i.id === item.id ? { ...i, status: 'cancelada' } : i))
              );
            } catch (err: any) {
              Alert.alert('Erro ao cancelar', err.message);
            }
          },
        },
      ]
    );
  };

  // Status badge styling
  const getStatusStyle = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'concluída':
      case 'convertida':
        return { bg: '#dcfce7', text: '#15803d' };
      case 'cancelada':
        return { bg: '#fee2e2', text: '#b91c1c' };
      default:
        return { bg: '#fef3c7', text: '#b45309' };
    }
  };

  // Filter list
  const filteredIndicacoes = indicacoes.filter(item => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const indicado = (item.indicado_nome || '').toLowerCase();
    const phone = (item.whatsapp_indicado || '').toLowerCase();
    const indicador = (item.indicador?.nome || '').toLowerCase();
    return indicado.includes(term) || phone.includes(term) || indicador.includes(term);
  });

  const countAbertas = indicacoes.filter(i => i.status === 'aberta').length;
  const countConvertidas = indicacoes.filter(i => i.status === 'concluída').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🎁 Indique & Ganhe</Text>
          <Text style={styles.headerSubtitle}>
            Gestão de indicações de clientes, leads e bonificações
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setNewModalVisible(true)}
        >
          <Text style={styles.newBtnText}>+ Nova Indicação</Text>
        </TouchableOpacity>
      </View>

      {/* KPI Counters */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Abertas</Text>
          <Text style={[styles.kpiValue, { color: '#b45309' }]}>{countAbertas}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Convertidas</Text>
          <Text style={[styles.kpiValue, { color: '#15803d' }]}>{countConvertidas}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total</Text>
          <Text style={[styles.kpiValue, { color: '#4f46e5' }]}>{indicacoes.length}</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por indicado, telefone ou indicador..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabBar}>
        {(['aberta', 'concluída', 'cancelada', 'todas'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Carregando indicações...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredIndicacoes}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
          }
          renderItem={({ item }) => {
            const sStyle = getStatusStyle(item.status);
            const isAberta = item.status === 'aberta';

            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.indicado_nome}</Text>
                    <Text style={styles.cardPhone}>📱 {item.whatsapp_indicado}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: sStyle.bg }]}>
                    <Text style={[styles.badgeText, { color: sStyle.text }]}>
                      {item.status ? item.status.toUpperCase() : 'ABERTA'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.cardInfo}>
                    👤 <Text style={{ fontWeight: '700' }}>Indicado por:</Text> {item.indicador?.nome || 'Cliente não vinculado'}
                  </Text>
                  {item.data_indicacao ? (
                    <Text style={styles.cardInfo}>
                      📅 Data: {new Date(item.data_indicacao).toLocaleDateString('pt-BR')}
                    </Text>
                  ) : null}
                  {item.observacao ? (
                    <Text style={styles.cardObs}>"{item.observacao}"</Text>
                  ) : null}
                </View>

                {isAberta ? (
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={[styles.cardBtn, { backgroundColor: '#10b981' }]}
                      onPress={() => setConvertModalItem(item)}
                    >
                      <Text style={styles.cardBtnText}>✓ Converter Lead</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cardBtn, { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }]}
                      onPress={() => handleCancelIndicacao(item)}
                    >
                      <Text style={[styles.cardBtnText, { color: '#b91c1c' }]}>✕ Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhuma indicação encontrada</Text>
              <Text style={styles.emptySubtitle}>
                Cadastre uma nova indicação ou ajuste o filtro.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal: Nova Indicação */}
      <Modal visible={newModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Indicação Manual</Text>
              <TouchableOpacity onPress={() => setNewModalVisible(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormScroll}>
              <Text style={styles.inputLabel}>Cliente Indicador *</Text>
              <View style={styles.indicatorSelectBox}>
                <Text style={styles.indicatorSelectLabel}>
                  {newForm.indicador_id
                    ? clientes.find(c => c.id === newForm.indicador_id)?.nome
                    : 'Toque para selecionar um cliente indicador abaixo:'}
                </Text>
                <ScrollView style={{ maxHeight: 120, marginTop: 6 }}>
                  {clientes.map(cli => (
                    <TouchableOpacity
                      key={cli.id}
                      style={[
                        styles.indicatorOption,
                        newForm.indicador_id === cli.id && styles.indicatorOptionActive,
                      ]}
                      onPress={() => setNewForm(prev => ({ ...prev, indicador_id: cli.id }))}
                    >
                      <Text
                        style={[
                          styles.indicatorOptionText,
                          newForm.indicador_id === cli.id && { color: '#ffffff', fontWeight: '800' },
                        ]}
                      >
                        {cli.nome} ({cli.cpf || 'Sem CPF'})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.inputLabel}>Nome do Amigo / Indicado *</Text>
              <TextInput
                style={styles.modalInput}
                value={newForm.indicado_nome}
                onChangeText={text => setNewForm(prev => ({ ...prev, indicado_nome: text }))}
                placeholder="Nome completo do lead indicado"
              />

              <Text style={styles.inputLabel}>WhatsApp do Indicado *</Text>
              <TextInput
                style={styles.modalInput}
                value={newForm.whatsapp_indicado}
                onChangeText={text => setNewForm(prev => ({ ...prev, whatsapp_indicado: text }))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Observações / Interesse</Text>
              <TextInput
                style={[styles.modalInput, { height: 70 }]}
                value={newForm.observacao}
                onChangeText={text => setNewForm(prev => ({ ...prev, observacao: text }))}
                placeholder="Ex: Interessado em plano familiar ou serviços..."
                multiline
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setNewModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleCreateIndicacao}
                disabled={submittingNew}
              >
                {submittingNew ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Salvar Indicação</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Confirmar Conversão & Pontos */}
      <Modal visible={!!convertModalItem} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardSmall}>
            <Text style={styles.modalTitle}>Converter Indicação</Text>
            <Text style={styles.modalSubtitle}>
              Indicado: {convertModalItem?.indicado_nome}
            </Text>

            <Text style={styles.inputLabel}>Pontos de Bonificação para o Indicador</Text>
            <TextInput
              style={styles.modalInput}
              value={convertBonusPoints}
              onChangeText={setConvertBonusPoints}
              placeholder="50"
              keyboardType="number-pad"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setConvertModalItem(null)}
              >
                <Text style={styles.modalBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#10b981' }]}
                onPress={handleConfirmConvert}
                disabled={converting}
              >
                {converting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Confirmar Bônus</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
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
  newBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  newBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginVertical: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 6,
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#4f46e5',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabBtnTextActive: {
    color: '#4f46e5',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardPhone: {
    fontSize: 13,
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
  cardBody: {
    marginVertical: 10,
    gap: 4,
  },
  cardInfo: {
    fontSize: 13,
    color: '#475569',
  },
  cardObs: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#64748b',
    marginTop: 4,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cardBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cardBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
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
  // Modal
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
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 10,
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748b',
    padding: 4,
  },
  modalFormScroll: {
    maxHeight: 380,
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
  indicatorSelectBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 10,
  },
  indicatorSelectLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  indicatorOption: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    marginBottom: 4,
    minHeight: 36,
    justifyContent: 'center',
  },
  indicatorOptionActive: {
    backgroundColor: '#4f46e5',
  },
  indicatorOptionText: {
    fontSize: 12,
    color: '#334155',
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
