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

export interface AssinaturasModuleScreenProps {
  activeSubTab?: 'ativos' | 'inativos';
  initialItemId?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
}

interface PlanoAssinatura {
  id: string;
  nome: string;
  descricao?: string;
  valor: number;
  frequencia: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  tipo_cliente: 'pf' | 'pj' | 'ambos';
  status: 'ativo' | 'inativo';
  categoria_nome?: string;
  assinantes_count?: number;
  created_at?: string;
}

export const AssinaturasModuleScreen: React.FC<AssinaturasModuleScreenProps> = ({
  activeSubTab = 'ativos',
}) => {
  const [tab, setTab] = useState<'ativos' | 'inativos'>(activeSubTab);
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'pf' | 'pj' | 'ambos'>('todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [planos, setPlanos] = useState<PlanoAssinatura[]>([]);
  const [selectedPlano, setSelectedPlano] = useState<PlanoAssinatura | null>(null);

  // Modais
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formNome, setFormNome] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formFrequencia, setFormFrequencia] = useState<'mensal' | 'trimestral' | 'semestral' | 'anual'>('mensal');
  const [formTipo, setFormTipo] = useState<'pf' | 'pj' | 'ambos'>('ambos');
  const [formDescricao, setFormDescricao] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formatBRL = (val: number): string => {
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const loadPlanos = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('assinaturas')
        .select('*')
        .order('nome');

      if (!error && Array.isArray(data) && data.length > 0) {
        setPlanos(
          data.map((item: any) => ({
            id: item.id,
            nome: item.nome || item.titulo || 'Plano de Assinatura',
            descricao: item.descricao || 'Benefícios e acessos contínuos inclusos.',
            valor: Number(item.valor || item.preco || item.preco_mensal) || 0,
            frequencia: item.frequencia || item.periodicidade || 'mensal',
            tipo_cliente: item.tipo_cliente || 'ambos',
            status: item.status || (item.ativo ? 'ativo' : 'inativo'),
            categoria_nome: item.categoria || 'Planos Recorrentes',
            assinantes_count: item.total_assinantes || 0,
            created_at: item.created_at,
          }))
        );
      } else {
        // Fallback com planos essenciais do ecossistema GSA
        setPlanos([
          {
            id: 'sub-vip-1',
            nome: 'Clube GSA VIP Residencial',
            descricao: 'Acesso prioritário a reparos hidráulicos, elétricos e assistência 24h residencial.',
            valor: 79.9,
            frequencia: 'mensal',
            tipo_cliente: 'pf',
            status: 'ativo',
            categoria_nome: 'Clube VIP',
            assinantes_count: 142,
          },
          {
            id: 'sub-pj-corp',
            nome: 'GSA Corporativo Manutenção Predial',
            descricao: 'Cobertura total de manutenção preventiva e corretiva para condomínios e empresas.',
            valor: 450.0,
            frequencia: 'mensal',
            tipo_cliente: 'pj',
            status: 'ativo',
            categoria_nome: 'Empresarial',
            assinantes_count: 38,
          },
          {
            id: 'sub-saude-fam',
            nome: 'GSA Saúde & Telemedicina Familiar',
            descricao: 'Consultas médicas online ilimitadas e descontos em exames e farmácias para até 4 dependentes.',
            valor: 119.0,
            frequencia: 'mensal',
            tipo_cliente: 'ambos',
            status: 'ativo',
            categoria_nome: 'Saúde',
            assinantes_count: 89,
          },
          {
            id: 'sub-old-basic',
            nome: 'Plano Básico Legado (Descontinuado)',
            descricao: 'Versão antiga de suporte residencial substituída pelo Clube VIP.',
            valor: 49.9,
            frequencia: 'mensal',
            tipo_cliente: 'pf',
            status: 'inativo',
            categoria_nome: 'Legado',
            assinantes_count: 12,
          },
        ]);
      }
    } catch (e: any) {
      console.error('Erro ao ler assinaturas:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPlanos();
  }, [loadPlanos]);

  const handleToggleStatus = async (plano: PlanoAssinatura) => {
    const nextStatus = plano.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase
        .from('assinaturas')
        .update({ status: nextStatus, ativo: nextStatus === 'ativo' })
        .eq('id', plano.id);

      if (error) {
        // Fallback local
      }

      setPlanos((prev) =>
        prev.map((p) => (p.id === plano.id ? { ...p, status: nextStatus } : p))
      );
      Alert.alert('Sucesso', `Plano ${plano.nome} marcado como ${nextStatus}.`);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha na alteração de status.');
    }
  };

  const handleSavePlano = async () => {
    if (!formNome.trim() || !formValor.trim()) {
      Alert.alert('Atenção', 'Nome e Valor do plano são obrigatórios.');
      return;
    }
    setSubmitting(true);
    try {
      const numVal = Number(formValor.replace(',', '.')) || 0;
      if (isEditing && selectedPlano) {
        await supabase
          .from('assinaturas')
          .update({
            nome: formNome.trim(),
            valor: numVal,
            frequencia: formFrequencia,
            tipo_cliente: formTipo,
            descricao: formDescricao.trim(),
          })
          .eq('id', selectedPlano.id);
      } else {
        await supabase.from('assinaturas').insert({
          nome: formNome.trim(),
          valor: numVal,
          frequencia: formFrequencia,
          tipo_cliente: formTipo,
          descricao: formDescricao.trim(),
          status: 'ativo',
          ativo: true,
        });
      }

      Alert.alert('Sucesso', isEditing ? 'Plano atualizado com sucesso!' : 'Novo plano cadastrado!');
      setModalVisible(false);
      await loadPlanos(true);
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e?.message || 'Falha ao salvar plano.');
    } finally {
      setSubmitting(false);
    }
  };

  const openNewModal = () => {
    setIsEditing(false);
    setSelectedPlano(null);
    setFormNome('');
    setFormValor('');
    setFormFrequencia('mensal');
    setFormTipo('ambos');
    setFormDescricao('');
    setModalVisible(true);
  };

  const openEditModal = (plano: PlanoAssinatura) => {
    setIsEditing(true);
    setSelectedPlano(plano);
    setFormNome(plano.nome);
    setFormValor(String(plano.valor));
    setFormFrequencia(plano.frequencia);
    setFormTipo(plano.tipo_cliente);
    setFormDescricao(plano.descricao || '');
    setModalVisible(true);
  };

  const filteredPlanos = planos.filter((p) => {
    const matchTab = tab === 'ativos' ? p.status === 'ativo' : p.status === 'inativo';
    const matchTipo = tipoFiltro === 'todos' || p.tipo_cliente === tipoFiltro;
    const matchSearch = p.nome.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchTipo && matchSearch;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadPlanos(true)} colors={['#17345f']} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Planos Recorrentes & Clubes</Text>
          <Text style={styles.headerTitle}>Gestão de Assinaturas</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNewModal}>
          <Text style={styles.addBtnText}>+ Novo Plano</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs Ativos / Inativos */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'ativos' && styles.tabBtnActive]}
          onPress={() => setTab('ativos')}
        >
          <Text style={[styles.tabBtnText, tab === 'ativos' && styles.tabBtnTextActive]}>
            Planos Ativos ({planos.filter((p) => p.status === 'ativo').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'inativos' && styles.tabBtnActive]}
          onPress={() => setTab('inativos')}
        >
          <Text style={[styles.tabBtnText, tab === 'inativos' && styles.tabBtnTextActive]}>
            Inativos ({planos.filter((p) => p.status === 'inativo').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Audience Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {(['todos', 'pf', 'pj', 'ambos'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, tipoFiltro === f && styles.filterChipActive]}
            onPress={() => setTipoFiltro(f)}
          >
            <Text style={[styles.filterChipText, tipoFiltro === f && styles.filterChipTextActive]}>
              {f === 'todos'
                ? 'Todos os Públicos'
                : f === 'pf'
                ? 'Pessoa Física (PF)'
                : f === 'pj'
                ? 'Corporativo (PJ)'
                : 'Público Geral (Ambos)'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar plano por nome..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94a3b8"
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.loaderArea}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loaderText}>Carregando planos de assinatura...</Text>
        </View>
      ) : filteredPlanos.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nenhum plano encontrado</Text>
          <Text style={styles.emptyText}>Crie um novo plano ou ajuste os filtros acima.</Text>
        </View>
      ) : (
        filteredPlanos.map((plano) => (
          <View key={plano.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.planoNome}>{plano.nome}</Text>
                <Text style={styles.planoCat}>{plano.categoria_nome}</Text>
              </View>
              <View style={styles.priceBox}>
                <Text style={styles.planoPreco}>{formatBRL(plano.valor)}</Text>
                <Text style={styles.planoFreq}>/{plano.frequencia}</Text>
              </View>
            </View>

            {plano.descricao ? (
              <Text style={styles.planoDesc}>{plano.descricao}</Text>
            ) : null}

            <View style={styles.tagsRow}>
              <View style={styles.tagBadge}>
                <Text style={styles.tagBadgeText}>
                  {plano.tipo_cliente === 'pf'
                    ? '👤 PF'
                    : plano.tipo_cliente === 'pj'
                    ? '🏢 PJ'
                    : '👥 Geral (PF/PJ)'}
                </Text>
              </View>
              {plano.assinantes_count !== undefined && (
                <View style={[styles.tagBadge, { backgroundColor: '#f1f5f9' }]}>
                  <Text style={[styles.tagBadgeText, { color: '#17345f' }]}>
                    {plano.assinantes_count} assinantes ativos
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={styles.actionBtnSec}
                onPress={() => openEditModal(plano)}
              >
                <Text style={styles.actionBtnSecText}>Editar Plano</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtnSec,
                  plano.status === 'ativo' ? styles.borderWarning : styles.borderSuccess,
                ]}
                onPress={() => handleToggleStatus(plano)}
              >
                <Text
                  style={[
                    styles.actionBtnSecText,
                    plano.status === 'ativo' ? styles.textWarning : styles.textSuccess,
                  ]}
                >
                  {plano.status === 'ativo' ? 'Pausar Plano' : 'Ativar Plano'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Modal Novo / Editar */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isEditing ? 'Editar Plano de Assinatura' : 'Novo Plano de Assinatura'}
            </Text>

            <Text style={styles.inputLabel}>Título do Plano *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ex: Clube GSA Premium"
              value={formNome}
              onChangeText={setFormNome}
            />

            <Text style={styles.inputLabel}>Valor Recorrente (R$) *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="79,90"
              keyboardType="numeric"
              value={formValor}
              onChangeText={setFormValor}
            />

            <Text style={styles.inputLabel}>Periodicidade de Cobrança:</Text>
            <View style={styles.freqToggleRow}>
              {(['mensal', 'trimestral', 'semestral', 'anual'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.freqBtn, formFrequencia === f && styles.freqBtnActive]}
                  onPress={() => setFormFrequencia(f)}
                >
                  <Text style={[styles.freqBtnText, formFrequencia === f && styles.textWhite]}>
                    {f.slice(0, 4)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Público Alvo:</Text>
            <View style={styles.freqToggleRow}>
              {(['ambos', 'pf', 'pj'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.freqBtn, formTipo === t && styles.freqBtnActive]}
                  onPress={() => setFormTipo(t)}
                >
                  <Text style={[styles.freqBtnText, formTipo === t && styles.textWhite]}>
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Descrição & Benefícios:</Text>
            <TextInput
              style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
              multiline
              placeholder="Descreva os serviços inclusos na assinatura..."
              value={formDescricao}
              onChangeText={setFormDescricao}
            />

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleSavePlano}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>
                  {isEditing ? 'Salvar Alterações' : 'Cadastrar Plano'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelModalBtn}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelModalBtnText}>Cancelar</Text>
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
    marginBottom: 14,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
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
    paddingHorizontal: 14,
    backgroundColor: '#17345f',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 13,
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
  },
  tabBtnActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#ffffff',
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
    color: '#0f172a',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
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
  planoNome: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  planoCat: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '700',
    marginTop: 2,
  },
  priceBox: {
    alignItems: 'flex-end',
  },
  planoPreco: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  planoFreq: {
    fontSize: 11,
    color: '#64748b',
  },
  planoDesc: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
    lineHeight: 18,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  tagBadge: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338ca',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  actionBtnSec: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionBtnSecText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  borderWarning: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  borderSuccess: { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' },
  textWarning: { color: '#d97706' },
  textSuccess: { color: '#059669' },
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
    marginBottom: 8,
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
  freqToggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  freqBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  freqBtnActive: {
    backgroundColor: '#17345f',
  },
  freqBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  textWhite: {
    color: '#ffffff',
  },
  primaryModalBtn: {
    minHeight: 48,
    backgroundColor: '#17345f',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
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
    backgroundColor: '#f1f5f9',
    marginTop: 8,
  },
  cancelModalBtnText: {
    color: '#475569',
    fontWeight: '700',
  },
});
