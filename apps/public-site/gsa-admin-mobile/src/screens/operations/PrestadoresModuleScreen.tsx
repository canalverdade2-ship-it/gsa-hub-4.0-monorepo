import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface PrestadorItem {
  id: string;
  nome_razao?: string;
  nome_responsavel?: string;
  documento?: string;
  cpf?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  area_servico?: string;
  status: string;
  saldo_carteira?: number;
  credencial_acesso?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  chave_pix?: string;
  observacoes?: string;
  created_at?: string;
}

export const PrestadoresModuleScreen = () => {
  const [data, setData] = useState<PrestadorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'ativo' | 'pendente' | 'suspenso'>('todos');

  // Selected item
  const [selectedItem, setSelectedItem] = useState<PrestadorItem | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Wallet adjustment modal
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletType, setWalletType] = useState<'add' | 'sub'>('add');
  const [walletReason, setWalletReason] = useState('');

  // New Provider Modal
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome_razao: '',
    nome_responsavel: '',
    documento: '',
    telefone: '',
    email: '',
    area_servico: '',
    cidade: '',
    estado: 'SP',
  });

  const [saving, setSaving] = useState(false);

  const fetchPrestadores = useCallback(async () => {
    try {
      let query = supabase
        .from('prestadores')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (activeTab === 'ativo') {
        query = query.eq('status', 'ativo');
      } else if (activeTab === 'pendente') {
        query = query.in('status', ['pendente', 'em_analise', 'aguardando_documentos']);
      } else if (activeTab === 'suspenso') {
        query = query.in('status', ['suspenso', 'desligado', 'inativo', 'reprovado']);
      }

      const { data: result, error } = await query;

      if (error) {
        console.error('Erro ao buscar prestadores:', error);
        Alert.alert('Erro', 'Não foi possível carregar prestadores: ' + error.message);
      } else {
        setData((result as PrestadorItem[]) || []);
      }
    } catch (err: any) {
      console.error('Exceção ao buscar prestadores:', err);
      Alert.alert('Erro', 'Erro inesperado ao consultar prestadores.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchPrestadores();
  }, [fetchPrestadores]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPrestadores();
  };

  const filteredData = data.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const nome = (item.nome_razao || '').toLowerCase();
    const resp = (item.nome_responsavel || '').toLowerCase();
    const doc = (item.documento || item.cpf || item.cnpj || '').toLowerCase();
    const area = (item.area_servico || '').toLowerCase();
    const cred = (item.credencial_acesso || '').toLowerCase();
    return (
      nome.includes(term) ||
      resp.includes(term) ||
      doc.includes(term) ||
      area.includes(term) ||
      cred.includes(term)
    );
  });

  // KPIs
  const ativosCount = data.filter((i) => i.status === 'ativo').length;
  const pendentesCount = data.filter((i) => ['pendente', 'em_analise'].includes(i.status)).length;
  const saldoTotalCarteira = data.reduce((acc, curr) => acc + (Number(curr.saldo_carteira) || 0), 0);

  const handleHomologar = async (item: PrestadorItem) => {
    Alert.alert(
      'Homologar Prestador',
      `Deseja aprovar e homologar o cadastro de ${item.nome_razao || item.nome_responsavel}? O prestador receberá acesso operacional.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Homologar',
          style: 'default',
          onPress: async () => {
            setSaving(true);
            try {
              const credencial = item.credencial_acesso || Math.floor(100000 + Math.random() * 900000).toString();
              const { error } = await supabase
                .from('prestadores')
                .update({
                  status: 'ativo',
                  credencial_acesso: credencial,
                })
                .eq('id', item.id);

              if (error) throw error;

              Alert.alert('Sucesso', `Prestador homologado! Código de acesso gerado: ${credencial}`);
              setDetailModalVisible(false);
              fetchPrestadores();
            } catch (err: any) {
              Alert.alert('Erro ao homologar', err.message || 'Falha ao atualizar status.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleToggleStatus = async (item: PrestadorItem, novoStatus: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('prestadores')
        .update({ status: novoStatus })
        .eq('id', item.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Status alterado para ${novoStatus.toUpperCase()}!`);
      setDetailModalVisible(false);
      fetchPrestadores();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Falha ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleWalletSubmit = async () => {
    if (!selectedItem) return;
    const amount = Number(walletAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Atenção', 'Informe um valor válido.');
      return;
    }

    setSaving(true);
    try {
      const saldoAtual = Number(selectedItem.saldo_carteira || 0);
      const novoSaldo = walletType === 'add' ? saldoAtual + amount : Math.max(0, saldoAtual - amount);

      const { error } = await supabase
        .from('prestadores')
        .update({ saldo_carteira: novoSaldo })
        .eq('id', selectedItem.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Carteira atualizada: Novo Saldo R$ ${novoSaldo.toFixed(2)}`);
      setWalletModalVisible(false);
      setDetailModalVisible(false);
      fetchPrestadores();
    } catch (err: any) {
      Alert.alert('Erro na carteira', err.message || 'Falha ao ajustar saldo.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePrestador = async () => {
    if (!newForm.nome_razao.trim()) {
      Alert.alert('Atenção', 'Informe o nome ou razão social.');
      return;
    }

    setSaving(true);
    try {
      const credencial = Math.floor(100000 + Math.random() * 900000).toString();
      const { error } = await supabase.from('prestadores').insert([
        {
          nome_razao: newForm.nome_razao,
          nome_responsavel: newForm.nome_responsavel || newForm.nome_razao,
          documento: newForm.documento,
          telefone: newForm.telefone,
          email: newForm.email,
          area_servico: newForm.area_servico,
          cidade: newForm.cidade,
          estado: newForm.estado,
          status: 'ativo',
          credencial_acesso: credencial,
          saldo_carteira: 0,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      Alert.alert('Sucesso', `Prestador cadastrado com sucesso! Credencial de acesso: ${credencial}`);
      setNewModalVisible(false);
      setNewForm({
        nome_razao: '',
        nome_responsavel: '',
        documento: '',
        telefone: '',
        email: '',
        area_servico: '',
        cidade: '',
        estado: 'SP',
      });
      fetchPrestadores();
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar', err.message || 'Falha ao salvar no banco.');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'ativo':
        return { bg: '#dcfce7', text: '#16a34a' };
      case 'suspenso':
      case 'desligado':
      case 'reprovado':
        return { bg: '#fee2e2', text: '#dc2626' };
      default:
        return { bg: '#fef3c7', text: '#d97706' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar prestador por nome, documento ou especialidade..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearch('')}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Ativos</Text>
          <Text style={[styles.kpiValue, { color: '#16a34a' }]}>{ativosCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Pendentes</Text>
          <Text style={[styles.kpiValue, { color: '#d97706' }]}>{pendentesCount}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Saldo em Carteira</Text>
          <Text style={[styles.kpiValue, { color: '#17345f' }]}>
            R$ {saldoTotalCarteira >= 1000 ? `${(saldoTotalCarteira / 1000).toFixed(1)}k` : saldoTotalCarteira.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['todos', 'ativo', 'pendente', 'suspenso'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabChipText, activeTab === tab && styles.tabChipTextActive]}>
                {tab === 'todos' ? 'Todos' : tab === 'ativo' ? 'Ativos' : tab === 'pendente' ? 'Pendentes' : 'Suspensos'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.newButton} onPress={() => setNewModalVisible(true)}>
          <Text style={styles.newButtonText}>+ Prestador</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loadingText}>Carregando prestadores...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum prestador encontrado</Text>
              <Text style={styles.emptySubtitle}>Ajuste os termos de busca ou cadastre um novo prestador.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusStyle = getStatusColor(item.status);
            const nomePrincipal = item.nome_razao || item.nome_responsavel || 'Sem Razão Social';
            const docFormatado = item.documento || item.cpf || item.cnpj || 'Doc não informado';
            const area = item.area_servico || 'Serviços Gerais';

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedItem(item);
                  setDetailModalVisible(true);
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {nomePrincipal}
                    </Text>
                    <Text style={styles.cardSubTitle}>
                      {docFormatado} {item.credencial_acesso ? `• PIN: ${item.credencial_acesso}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.areaText} numberOfLines={1}>
                    🛠️ {area}
                  </Text>
                  {item.telefone && (
                    <Text style={styles.contactText} numberOfLines={1}>
                      📞 {item.telefone} {item.cidade ? `(${item.cidade}-${item.estado || 'UF'})` : ''}
                    </Text>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.cardDate}>
                    Cadastrado: {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'N/A'}
                  </Text>
                  <Text style={styles.cardBalance}>
                    Saldo: R$ {Number(item.saldo_carteira || 0).toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Details Modal */}
      <Modal visible={detailModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ficha do Prestador</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nome / Razão Social:</Text>
                  <Text style={styles.detailValueBold}>{selectedItem.nome_razao || 'N/A'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status Cadastral:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedItem.status).bg }]}>
                    <Text style={[styles.statusBadgeText, { color: getStatusColor(selectedItem.status).text }]}>
                      {selectedItem.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Informações e Documentos</Text>
                  <Text style={styles.detailValue}>Responsável: {selectedItem.nome_responsavel || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Documento: {selectedItem.documento || selectedItem.cpf || selectedItem.cnpj || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Área de Atuação: {selectedItem.area_servico || 'Não especificada'}</Text>
                  <Text style={styles.detailValue}>Credencial de Acesso: {selectedItem.credencial_acesso || 'Sem PIN gerado'}</Text>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Contato & Localização</Text>
                  <Text style={styles.detailValue}>Telefone: {selectedItem.telefone || 'N/A'}</Text>
                  <Text style={styles.detailValue}>Email: {selectedItem.email || 'N/A'}</Text>
                  <Text style={styles.detailValue}>
                    Localidade: {selectedItem.cidade || 'N/A'} - {selectedItem.estado || 'N/A'} {selectedItem.cep ? `(CEP: ${selectedItem.cep})` : ''}
                  </Text>
                  {selectedItem.chave_pix && <Text style={styles.detailValue}>Chave PIX: {selectedItem.chave_pix}</Text>}
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.sectionHeader}>Carteira Operacional</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Saldo Disponível:</Text>
                    <Text style={[styles.detailValueBold, { color: '#10b981', fontSize: 18 }]}>
                      R$ {Number(selectedItem.saldo_carteira || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Operations Action Group */}
                <View style={styles.modalActionGroup}>
                  {selectedItem.status !== 'ativo' && (
                    <TouchableOpacity
                      style={[styles.primaryActionButton, saving && { opacity: 0.6 }]}
                      disabled={saving}
                      onPress={() => handleHomologar(selectedItem)}
                    >
                      <Text style={styles.actionButtonText}>✓ Homologar / Ativar Cadastro</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => {
                      setWalletAmount('');
                      setWalletReason('');
                      setWalletModalVisible(true);
                    }}
                  >
                    <Text style={styles.secondaryActionText}>💰 Ajustar Saldo Carteira</Text>
                  </TouchableOpacity>

                  {selectedItem.status === 'ativo' ? (
                    <TouchableOpacity
                      style={styles.dangerActionButton}
                      onPress={() => handleToggleStatus(selectedItem, 'suspenso')}
                    >
                      <Text style={styles.dangerActionText}>⚠️ Suspender Cadastro</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.secondaryActionButton}
                      onPress={() => handleToggleStatus(selectedItem, 'ativo')}
                    >
                      <Text style={styles.secondaryActionText}>🔄 Reativar Prestador</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Wallet Adjustment Sub-Modal */}
      <Modal visible={walletModalVisible} animationType="fade" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.smallModalCard}>
            <Text style={styles.modalTitle}>Ajustar Saldo da Carteira</Text>
            <Text style={styles.smallModalDesc}>Selecione o tipo de ajuste e o valor:</Text>
            <View style={styles.categorySelectRow}>
              <TouchableOpacity
                style={[styles.categoryOption, walletType === 'add' && styles.categoryOptionActive]}
                onPress={() => setWalletType('add')}
              >
                <Text style={[styles.categoryOptionText, walletType === 'add' && styles.categoryOptionTextActive]}>
                  + ADICIONAR CRÉDITO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.categoryOption, walletType === 'sub' && styles.categoryOptionActive]}
                onPress={() => setWalletType('sub')}
              >
                <Text style={[styles.categoryOptionText, walletType === 'sub' && styles.categoryOptionTextActive]}>
                  - SUBTRAIR / DÉBITO
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.formInput, { marginTop: 8 }]}
              keyboardType="numeric"
              placeholder="Valor (Ex: 150.00)"
              placeholderTextColor="#9ca3af"
              value={walletAmount}
              onChangeText={setWalletAmount}
            />

            <TextInput
              style={[styles.formInput, { marginTop: 8 }]}
              placeholder="Justificativa do ajuste..."
              placeholderTextColor="#9ca3af"
              value={walletReason}
              onChangeText={setWalletReason}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setWalletModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleWalletSubmit}>
                <Text style={styles.confirmBtnText}>Salvar Saldo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* New Prestador Modal */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cadastrar Novo Prestador</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setNewModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Nome ou Razão Social *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Alfa Manutenção Elétrica LTDA"
                placeholderTextColor="#9ca3af"
                value={newForm.nome_razao}
                onChangeText={(t) => setNewForm({ ...newForm, nome_razao: t })}
              />

              <Text style={styles.formLabel}>Nome do Responsável Técnico</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Carlos Eduardo"
                placeholderTextColor="#9ca3af"
                value={newForm.nome_responsavel}
                onChangeText={(t) => setNewForm({ ...newForm, nome_responsavel: t })}
              />

              <Text style={styles.formLabel}>CPF / CNPJ</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="numeric"
                placeholder="Apenas números..."
                placeholderTextColor="#9ca3af"
                value={newForm.documento}
                onChangeText={(t) => setNewForm({ ...newForm, documento: t })}
              />

              <Text style={styles.formLabel}>Área de Atuação / Especialidade</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Elétrica, Hidráulica, TI, Climatização"
                placeholderTextColor="#9ca3af"
                value={newForm.area_servico}
                onChangeText={(t) => setNewForm({ ...newForm, area_servico: t })}
              />

              <Text style={styles.formLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="phone-pad"
                placeholder="(00) 00000-0000"
                placeholderTextColor="#9ca3af"
                value={newForm.telefone}
                onChangeText={(t) => setNewForm({ ...newForm, telefone: t })}
              />

              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={styles.formInput}
                keyboardType="email-address"
                placeholder="prestador@email.com"
                placeholderTextColor="#9ca3af"
                value={newForm.email}
                onChangeText={(t) => setNewForm({ ...newForm, email: t })}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.formLabel}>Cidade</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Cidade"
                    placeholderTextColor="#9ca3af"
                    value={newForm.cidade}
                    onChangeText={(t) => setNewForm({ ...newForm, cidade: t })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>UF</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="UF"
                    placeholderTextColor="#9ca3af"
                    maxLength={2}
                    value={newForm.estado}
                    onChangeText={(t) => setNewForm({ ...newForm, estado: t.toUpperCase() })}
                  />
                </View>
              </View>

              <View style={[styles.modalButtonsRow, { marginTop: 20 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setNewModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} disabled={saving} onPress={handleCreatePrestador}>
                  <Text style={styles.confirmBtnText}>Cadastrar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#111827',
  },
  clearSearchBtn: {
    marginLeft: 8,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  tabChip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabChipActive: {
    backgroundColor: '#17345f',
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  tabChipTextActive: {
    color: '#fff',
  },
  newButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    backgroundColor: '#10b981',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 14,
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#4f46e5',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  cardSubTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardBody: {
    marginVertical: 4,
    gap: 4,
  },
  areaText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  contactText: {
    fontSize: 12,
    color: '#6b7280',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  cardDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  cardBalance: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10b981',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  smallModalCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  smallModalDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginVertical: 8,
  },
  modalCloseBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#374151',
    marginVertical: 2,
  },
  detailValueBold: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  detailSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#17345f',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  modalActionGroup: {
    marginTop: 20,
    gap: 10,
    paddingBottom: 20,
  },
  primaryActionButton: {
    minHeight: 48,
    backgroundColor: '#10b981',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  secondaryActionButton: {
    minHeight: 48,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#c4b5fd',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#7c3aed',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dangerActionButton: {
    minHeight: 48,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerActionText: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: 14,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 10,
    marginBottom: 4,
  },
  formInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  categorySelectRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  categoryOption: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  categoryOptionActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  categoryOptionText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4b5563',
    textAlign: 'center',
  },
  categoryOptionTextActive: {
    color: '#fff',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  cancelBtnText: {
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: '#17345f',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
