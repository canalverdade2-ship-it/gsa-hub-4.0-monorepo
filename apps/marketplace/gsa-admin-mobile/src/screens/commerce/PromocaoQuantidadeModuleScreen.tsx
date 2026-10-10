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
} from 'react-native';
import { supabase } from '../../../supabase';

export interface PromocaoQuantidadeItem {
  id: string;
  nome: string;
  descricao?: string | null;
  tipo_promocao?: 'unidade_gratis' | 'desconto_proxima' | 'ganhe_outro_produto' | 'combo' | string | null;
  escopo_gatilho?: 'produto' | 'categoria' | 'geral' | string | null;
  produto_gatilho_id?: string | null;
  categoria_gatilho_id?: string | null;
  quantidade_minima?: number | null;
  produto_brinde_id?: string | null;
  quantidade_brinde?: number | null;
  desconto_tipo?: 'porcentagem' | 'valor' | string | null;
  desconto_valor?: number | null;
  uso_maximo_por_cliente?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  status?: 'ativa' | 'suspensa' | 'encerrada' | string | null;
  created_at?: string | null;
  produto_gatilho?: { nome?: string | null } | null;
  categoria_gatilho?: { nome?: string | null } | null;
}

export const PromocaoQuantidadeModuleScreen = () => {
  const [promocoes, setPromocoes] = useState<PromocaoQuantidadeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativas' | 'suspensas' | 'encerradas' | 'todas'>('ativas');

  // Detail Modal
  const [selectedPromo, setSelectedPromo] = useState<PromocaoQuantidadeItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchPromocoes = useCallback(async () => {
    try {
      let query = supabase
        .from('promocoes_quantidade')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter === 'ativas') {
        query = query.eq('status', 'ativa');
      } else if (statusFilter === 'suspensas') {
        query = query.eq('status', 'suspensa');
      } else if (statusFilter === 'encerradas') {
        query = query.eq('status', 'encerrada');
      }

      const { data, error } = await query;
      if (error) throw error;
      setPromocoes((data || []) as PromocaoQuantidadeItem[]);
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar promoções progressivas:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchPromocoes();
  }, [fetchPromocoes]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPromocoes();
  };

  const filteredPromocoes = promocoes.filter((p) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return (p.nome && p.nome.toLowerCase().includes(term)) || (p.tipo_promocao && p.tipo_promocao.toLowerCase().includes(term));
  });

  const handleToggleStatus = async (item: PromocaoQuantidadeItem) => {
    const newStatus = item.status === 'ativa' ? 'suspensa' : 'ativa';
    try {
      const { error } = await supabase
        .from('promocoes_quantidade')
        .update({ status: newStatus })
        .eq('id', item.id);

      if (error) throw error;

      setPromocoes((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: newStatus } : p))
      );
      if (selectedPromo?.id === item.id) {
        setSelectedPromo({ ...selectedPromo, status: newStatus });
      }
    } catch (err: any) {
      Alert.alert('Erro ao alterar status', err.message);
    }
  };

  const handleDelete = (item: PromocaoQuantidadeItem) => {
    Alert.alert(
      'Confirmar Exclusão',
      `Deseja realmente excluir a promoção de volume "${item.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('promocoes_quantidade')
                .delete()
                .eq('id', item.id);

              if (error) {
                await supabase
                  .from('promocoes_quantidade')
                  .update({ status: 'encerrada' })
                  .eq('id', item.id);
                Alert.alert('Promoção Encerrada', 'A regra foi inativada.');
              } else {
                Alert.alert('Sucesso', 'Promoção excluída com sucesso.');
              }
              setDetailModalVisible(false);
              fetchPromocoes();
            } catch (err: any) {
              Alert.alert('Erro', err.message);
            }
          },
        },
      ]
    );
  };

  const getTipoBadgeInfo = (tipo?: string | null) => {
    switch (tipo) {
      case 'unidade_gratis':
        return { icon: '🎁', label: 'Unidade Grátis', bg: '#ffedd5', text: '#c2410c' };
      case 'desconto_proxima':
        return { icon: '🛍️', label: 'Desconto Progressivo', bg: '#dcfce7', text: '#15803d' };
      case 'ganhe_outro_produto':
        return { icon: '✨', label: 'Brinde Especial', bg: '#f3e8ff', text: '#7e22ce' };
      default:
        return { icon: '📦', label: 'Combo de Volume', bg: '#dbeafe', text: '#1d4ed8' };
    }
  };

  const renderCard = ({ item }: { item: PromocaoQuantidadeItem }) => {
    const isAtiva = item.status === 'ativa';
    const isSuspensa = item.status === 'suspensa';
    const badgeInfo = getTipoBadgeInfo(item.tipo_promocao);

    return (
      <View style={styles.card}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.cardContent}
          onPress={() => {
            setSelectedPromo(item);
            setDetailModalVisible(true);
          }}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.typeBadge, { backgroundColor: badgeInfo.bg }]}>
              <Text style={[styles.typeBadgeText, { color: badgeInfo.text }]}>
                {badgeInfo.icon} {badgeInfo.label}
              </Text>
            </View>

            <View
              style={[
                styles.statusBadge,
                isAtiva ? styles.badgeActive : isSuspensa ? styles.badgeSuspended : styles.badgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  isAtiva ? styles.textActive : isSuspensa ? styles.textSuspended : styles.textInactive,
                ]}
              >
                {item.status?.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.promoName}>{item.nome}</Text>

          <View style={styles.ruleBox}>
            <Text style={styles.ruleTitle}>
              Gatilho: A partir de {item.quantidade_minima || 1} unidade(s)
            </Text>
            {item.desconto_valor ? (
              <Text style={styles.ruleSub}>
                Benefício: {item.desconto_valor}
                {item.desconto_tipo === 'porcentagem' ? '%' : ' R$'} de desconto
              </Text>
            ) : item.quantidade_brinde ? (
              <Text style={styles.ruleSub}>
                Benefício: Leve +{item.quantidade_brinde} unidade(s) sem custo
              </Text>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Escopo: {(item.escopo_gatilho || 'produto').toUpperCase()}
            </Text>
            {item.data_fim ? (
              <Text style={styles.metaText}>
                Até {new Date(item.data_fim).toLocaleDateString('pt-BR')}
              </Text>
            ) : (
              <Text style={styles.metaText}>Sem data limite</Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtnToggle, isAtiva ? styles.btnDeactivate : styles.btnActivate]}
            onPress={() => handleToggleStatus(item)}
          >
            <Text style={isAtiva ? styles.btnDeactivateText : styles.btnActivateText}>
              {isAtiva ? 'Suspender Regra' : 'Reativar Regra'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Descontos por Quantidade</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar promoção por volume..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'ativas' && styles.chipActive]}
            onPress={() => setStatusFilter('ativas')}
          >
            <Text style={[styles.chipText, statusFilter === 'ativas' && styles.chipTextActive]}>Ativas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'suspensas' && styles.chipActive]}
            onPress={() => setStatusFilter('suspensas')}
          >
            <Text style={[styles.chipText, statusFilter === 'suspensas' && styles.chipTextActive]}>Suspensas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'encerradas' && styles.chipActive]}
            onPress={() => setStatusFilter('encerradas')}
          >
            <Text style={[styles.chipText, statusFilter === 'encerradas' && styles.chipTextActive]}>Encerradas</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'todas' && styles.chipActive]}
            onPress={() => setStatusFilter('todas')}
          >
            <Text style={[styles.chipText, statusFilter === 'todas' && styles.chipTextActive]}>Todas</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Carregando regras de volume...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPromocoes}
          keyExtractor={(item) => item.id}
          renderItem={renderCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎁</Text>
              <Text style={styles.emptyTitle}>Nenhuma regra progressiva encontrada</Text>
              <Text style={styles.emptySubtitle}>Cadastre regras de desconto por volume no formulário de faixas.</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes da Promoção de Volume</Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedPromo && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nome da Regra:</Text>
                  <Text style={styles.detailValueBold}>{selectedPromo.nome}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Mecânica:</Text>
                  <Text style={styles.detailValue}>
                    {getTipoBadgeInfo(selectedPromo.tipo_promocao).label}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Qtd Mínima Gatilho:</Text>
                  <Text style={styles.detailValueBold}>
                    {selectedPromo.quantidade_minima || 1} unidade(s)
                  </Text>
                </View>

                {selectedPromo.desconto_valor ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Desconto Concedido:</Text>
                    <Text style={[styles.detailValueBold, { color: '#16a34a' }]}>
                      {selectedPromo.desconto_valor}
                      {selectedPromo.desconto_tipo === 'porcentagem' ? '%' : ' R$'}
                    </Text>
                  </View>
                ) : null}

                {selectedPromo.quantidade_brinde ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Unidades Bonificadas:</Text>
                    <Text style={[styles.detailValueBold, { color: '#9333ea' }]}>
                      +{selectedPromo.quantidade_brinde} grátis
                    </Text>
                  </View>
                ) : null}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Escopo:</Text>
                  <Text style={styles.detailValue}>
                    {(selectedPromo.escopo_gatilho || 'PRODUTO').toUpperCase()}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={selectedPromo.status === 'ativa' ? styles.textActive : styles.textInactive}>
                    {selectedPromo.status?.toUpperCase()}
                  </Text>
                </View>

                {selectedPromo.descricao ? (
                  <View style={styles.descBox}>
                    <Text style={styles.detailLabel}>Descrição da Regra:</Text>
                    <Text style={styles.descText}>{selectedPromo.descricao}</Text>
                  </View>
                ) : null}

                <View style={styles.modalActionButtons}>
                  <TouchableOpacity
                    style={[
                      styles.modalToggleBtn,
                      selectedPromo.status === 'ativa' ? styles.btnDeactivate : styles.btnActivate,
                    ]}
                    onPress={() => handleToggleStatus(selectedPromo)}
                  >
                    <Text style={selectedPromo.status === 'ativa' ? styles.btnDeactivateText : styles.btnActivateText}>
                      {selectedPromo.status === 'ativa' ? 'Suspender Regra' : 'Reativar Regra'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDelete(selectedPromo)}
                  >
                    <Text style={styles.modalDeleteBtnText}>Excluir</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
  },
  searchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterSection: {
    backgroundColor: '#ffffff',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterChipsRow: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#dcfce7',
  },
  badgeSuspended: {
    backgroundColor: '#fef3c7',
  },
  badgeInactive: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textActive: {
    color: '#16a34a',
  },
  textSuspended: {
    color: '#b45309',
  },
  textInactive: {
    color: '#dc2626',
  },
  promoName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  ruleBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  ruleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  ruleSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtnToggle: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDeactivate: {
    backgroundColor: '#fee2e2',
  },
  btnDeactivateText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 12,
  },
  btnActivate: {
    backgroundColor: '#dcfce7',
  },
  btnActivateText: {
    color: '#15803d',
    fontWeight: '600',
    fontSize: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 18,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  detailValue: {
    fontSize: 14,
    color: '#0f172a',
    maxWidth: '65%',
    textAlign: 'right',
  },
  detailValueBold: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    maxWidth: '65%',
    textAlign: 'right',
  },
  descBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  descText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginTop: 4,
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalToggleBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDeleteBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDeleteBtnText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 14,
  },
});
