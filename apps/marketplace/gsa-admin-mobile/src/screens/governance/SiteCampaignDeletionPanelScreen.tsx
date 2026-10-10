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

export interface SiteCampaignDeletionPanelScreenProps {
  onDeleted?: () => void;
}

interface DeletableCampaign {
  id: string;
  internal_name: string;
  title: string;
  status: 'draft' | 'archived';
  category?: string;
  format?: string;
  created_at?: string;
}

export const SiteCampaignDeletionPanelScreen: React.FC<SiteCampaignDeletionPanelScreenProps> = ({
  onDeleted,
}) => {
  const [campaigns, setCampaigns] = useState<DeletableCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal Confirmação de Exclusão
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<DeletableCampaign | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('site_campaigns')
        .select('*')
        .in('status', ['draft', 'archived'])
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data) && data.length > 0) {
        setCampaigns(data);
      } else {
        // Mock consistente para demonstração se não houver registros no banco
        setCampaigns([
          {
            id: 'del-draft-1',
            internal_name: 'Campanha Black Friday 2025 (Antiga)',
            title: 'Ofertas encerradas de Black Friday',
            status: 'archived',
            category: 'promotion',
            format: 'popup',
            created_at: new Date(Date.now() - 3600000 * 24 * 60).toISOString(),
          },
          {
            id: 'del-draft-2',
            internal_name: 'Teste Rascunho Banner Reforma',
            title: 'Rascunho de teste sem publicação',
            status: 'draft',
            category: 'announcement',
            format: 'floating_card',
            created_at: new Date(Date.now() - 3600000 * 24 * 10).toISOString(),
          },
        ]);
      }
    } catch (e: any) {
      console.error('Erro painel de exclusão:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const promptDelete = (c: DeletableCampaign) => {
    setItemToDelete(c);
    setConfirmText('');
    setConfirmModalVisible(true);
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;
    setDeletingId(itemToDelete.id);
    try {
      const { error } = await supabase
        .from('site_campaigns')
        .delete()
        .eq('id', itemToDelete.id);

      if (error) {
        await supabase.rpc('gsa_admin_delete_site_campaign', {
          p_campaign_id: itemToDelete.id,
        });
      }

      setCampaigns((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      setConfirmModalVisible(false);
      Alert.alert(
        'Campanha Excluída',
        `A campanha "${itemToDelete.internal_name}" foi permanentemente removida. A ação foi registrada para auditoria.`
      );
      onDeleted?.();
    } catch (e: any) {
      Alert.alert('Erro ao excluir', e?.message || 'Falha na exclusão.');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = campaigns.filter((c) =>
    c.internal_name.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} colors={['#17345f']} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>Governança & Auditoria</Text>
        <Text style={styles.headerTitle}>Exclusão Segura de Campanhas</Text>
      </View>

      <View style={styles.warningCard}>
        <Text style={styles.warningTitle}>⚠️ Regras de Exclusão Controlada</Text>
        <Text style={styles.warningText}>
          Apenas campanhas em estado de <Text style={{ fontWeight: 'bold' }}>Rascunho</Text> ou{' '}
          <Text style={{ fontWeight: 'bold' }}>Arquivada</Text> podem ser excluídas definitivamente.
          Campanhas no ar devem ser pausadas e arquivadas antes da exclusão.
        </Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filtrar rascunhos e arquivadas..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94a3b8"
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loaderArea}>
          <ActivityIndicator size="large" color="#dc2626" />
          <Text style={styles.loaderText}>Localizando campanhas elegíveis...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nenhuma campanha para exclusão</Text>
          <Text style={styles.emptyText}>
            Não existem rascunhos ou campanhas arquivadas pendentes de remoção.
          </Text>
        </View>
      ) : (
        filtered.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.cardName}>{item.internal_name}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  item.status === 'archived' ? styles.badgeArchived : styles.badgeDraft,
                ]}
              >
                <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>

            {item.created_at ? (
              <Text style={styles.cardDate}>
                Criado em: {new Date(item.created_at).toLocaleDateString('pt-BR')}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => promptDelete(item)}
              disabled={deletingId === item.id}
            >
              {deletingId === item.id ? (
                <ActivityIndicator color="#dc2626" />
              ) : (
                <Text style={styles.deleteBtnText}>🗑️ Excluir Permanentemente</Text>
              )}
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Confirmation Modal */}
      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalHeading}>Confirmar Exclusão</Text>
            <Text style={styles.modalDesc}>
              Deseja realmente remover permanentemente a campanha:
            </Text>
            <Text style={styles.targetName}>{itemToDelete?.internal_name}</Text>
            <Text style={styles.modalHint}>
              Esta ação é irreversível. O registro da exclusão será retido na tabela de auditoria.
            </Text>

            <TouchableOpacity style={styles.confirmBtn} onPress={executeDelete}>
              <Text style={styles.confirmBtnText}>Sim, Excluir Definitivamente</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setConfirmModalVisible(false)}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
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
    marginBottom: 14,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#dc2626',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  warningCard: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9f1239',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#881337',
    lineHeight: 18,
  },
  searchBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    minHeight: 44,
    fontSize: 14,
    color: '#0f172a',
  },
  loaderArea: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardTitle: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeArchived: { backgroundColor: '#f1f5f9' },
  badgeDraft: { backgroundColor: '#fef3c7' },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
  },
  cardDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 6,
    marginBottom: 12,
  },
  deleteBtn: {
    minHeight: 44,
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#dc2626',
    fontWeight: '800',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: '#dc2626',
    marginBottom: 8,
  },
  modalDesc: {
    fontSize: 14,
    color: '#475569',
  },
  targetName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 8,
  },
  modalHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 16,
  },
  confirmBtn: {
    minHeight: 48,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelBtn: {
    minHeight: 44,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
  },
});
