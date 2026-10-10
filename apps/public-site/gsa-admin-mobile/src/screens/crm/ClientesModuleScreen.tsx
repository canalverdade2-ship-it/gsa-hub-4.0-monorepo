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

export interface ClienteItem {
  id: string;
  nome?: string;
  nome_razao?: string;
  cpf?: string;
  cnpj?: string;
  tipo?: 'pf' | 'pj';
  email?: string;
  telefone?: string;
  status?: string;
  saldo_carteira?: number;
  saldo_pontos?: number;
  pontos_totais?: number;
  codigo_cliente?: string;
  nivel_vip?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  observacoes?: string;
  data_cadastro?: string;
  created_at?: string;
}

export const ClientesModuleScreen = () => {
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo' | 'pendente' | 'bloqueado'>('todos');

  // Selected client for detail view
  const [selectedClient, setSelectedClient] = useState<ClienteItem | null>(null);
  const [activeTab, setActiveTab] = useState<'Dados' | 'Carteira' | 'Pontos' | 'Orçamentos' | 'Faturas' | 'OS'>('Dados');

  // Related data for tabs
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [ordensServico, setOrdensServico] = useState<any[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);

  // Edit client modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({
    nome: '',
    documento: '',
    email: '',
    telefone: '',
    cidade: '',
    estado: '',
    status: 'ativo',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Adjust balance modal
  const [balanceModalVisible, setBalanceModalVisible] = useState(false);
  const [balanceAction, setBalanceAction] = useState<'add' | 'sub'>('add');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);

  // Adjust points modal
  const [pointsModalVisible, setPointsModalVisible] = useState(false);
  const [pointsAction, setPointsAction] = useState<'add' | 'sub'>('add');
  const [pointsAmount, setPointsAmount] = useState('');
  const [pointsReason, setPointsReason] = useState('');
  const [savingPoints, setSavingPoints] = useState(false);

  // New budget modal
  const [orcamentoModalVisible, setOrcamentoModalVisible] = useState(false);
  const [orcamentoForm, setOrcamentoForm] = useState({ total: '', descricao: '', status: 'aberto' });
  const [savingOrcamento, setSavingOrcamento] = useState(false);

  const fetchClientes = useCallback(async () => {
    try {
      let query = supabase
        .from('clientes')
        .select('*')
        .order('data_cadastro', { ascending: false })
        .limit(100);

      if (statusFilter !== 'todos') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('Silencioso: aviso ao carregar clientes:', error.message);
      } else {
        setClientes((data as ClienteItem[]) || []);
      }
    } catch (err: any) {
      console.warn('Silencioso: erro ao carregar clientes:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  // Load related data when detail tab changes
  useEffect(() => {
    if (!selectedClient) return;

    const fetchTabData = async () => {
      setLoadingTab(true);
      try {
        if (activeTab === 'Orçamentos') {
          const { data, error } = await supabase
            .from('orcamentos')
            .select('*')
            .eq('cliente_id', selectedClient.id)
            .order('data_criacao', { ascending: false });
          if (error) throw error;
          setOrcamentos(data || []);
        } else if (activeTab === 'Faturas') {
          const { data, error } = await supabase
            .from('faturas')
            .select('*')
            .eq('cliente_id', selectedClient.id)
            .order('data_criacao', { ascending: false });
          if (error) throw error;
          setFaturas(data || []);
        } else if (activeTab === 'OS') {
          const { data, error } = await supabase
            .from('ordens_servico')
            .select('*')
            .eq('cliente_id', selectedClient.id)
            .order('data_abertura', { ascending: false });
          if (error) throw error;
          setOrdensServico(data || []);
        }
      } catch (err: any) {
        console.warn('Erro ao carregar aba:', err.message);
      } finally {
        setLoadingTab(false);
      }
    };

    fetchTabData();
  }, [activeTab, selectedClient]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchClientes();
  };

  // Filter clientes based on search query
  const filteredClientes = clientes.filter(item => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const name = (item.nome || item.nome_razao || '').toLowerCase();
    const doc = (item.cpf || item.cnpj || '').toLowerCase();
    const email = (item.email || '').toLowerCase();
    const phone = (item.telefone || '').toLowerCase();
    const code = (item.codigo_cliente || '').toLowerCase();
    return name.includes(term) || doc.includes(term) || email.includes(term) || phone.includes(term) || code.includes(term);
  });

  // Calculate summary stats
  const totalBalance = clientes.reduce((acc, c) => acc + (Number(c.saldo_carteira) || 0), 0);
  const totalPoints = clientes.reduce((acc, c) => acc + (Number(c.saldo_pontos || c.pontos_totais) || 0), 0);

  // Edit client handlers
  const openEditModal = (client: ClienteItem) => {
    setEditForm({
      nome: client.nome || client.nome_razao || '',
      documento: client.cpf || client.cnpj || '',
      email: client.email || '',
      telefone: client.telefone || '',
      cidade: client.cidade || '',
      estado: client.estado || '',
      status: client.status || 'ativo',
    });
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedClient) return;
    if (!editForm.nome.trim()) {
      Alert.alert('Validação', 'O nome é obrigatório.');
      return;
    }

    setSavingEdit(true);
    try {
      const isPJ = selectedClient.tipo === 'pj' || editForm.documento.length > 14;
      const updatePayload: Record<string, any> = {
        email: editForm.email.trim(),
        telefone: editForm.telefone.trim(),
        cidade: editForm.cidade.trim(),
        estado: editForm.estado.trim().toUpperCase(),
        status: editForm.status,
      };

      if (isPJ) {
        updatePayload.nome_razao = editForm.nome.trim();
        updatePayload.cnpj = editForm.documento.trim();
      } else {
        updatePayload.nome = editForm.nome.trim();
        updatePayload.cpf = editForm.documento.trim();
      }

      const { error } = await supabase
        .from('clientes')
        .update(updatePayload)
        .eq('id', selectedClient.id);

      if (error) throw error;

      const updatedClient: ClienteItem = { ...selectedClient, ...updatePayload };
      setSelectedClient(updatedClient);
      setClientes(prev => prev.map(c => (c.id === selectedClient.id ? updatedClient : c)));
      setEditModalVisible(false);
      Alert.alert('Sucesso', 'Cadastro do cliente atualizado com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao atualizar', err.message || 'Falha ao salvar dados');
    } finally {
      setSavingEdit(false);
    }
  };

  // Adjust balance
  const handleSaveBalance = async () => {
    if (!selectedClient) return;
    const amount = Number(balanceAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor numérico positivo.');
      return;
    }

    setSavingBalance(true);
    try {
      const current = Number(selectedClient.saldo_carteira || 0);
      const nextBalance = balanceAction === 'add' ? current + amount : Math.max(0, current - amount);

      const { error } = await supabase
        .from('clientes')
        .update({ saldo_carteira: nextBalance })
        .eq('id', selectedClient.id);

      if (error) throw error;

      const updated = { ...selectedClient, saldo_carteira: nextBalance };
      setSelectedClient(updated);
      setClientes(prev => prev.map(c => (c.id === selectedClient.id ? updated : c)));
      setBalanceModalVisible(false);
      setBalanceAmount('');
      setBalanceReason('');
      Alert.alert(
        'Saldo Atualizado',
        `Saldo ${balanceAction === 'add' ? 'adicionado' : 'debitado'} com sucesso! Novo saldo: R$ ${nextBalance.toFixed(2)}`
      );
    } catch (err: any) {
      Alert.alert('Erro ao atualizar saldo', err.message);
    } finally {
      setSavingBalance(false);
    }
  };

  // Adjust points
  const handleSavePoints = async () => {
    if (!selectedClient) return;
    const amount = parseInt(pointsAmount.replace(/\D/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Quantidade inválida', 'Informe uma quantidade inteira positiva.');
      return;
    }

    setSavingPoints(true);
    try {
      const current = Number(selectedClient.saldo_pontos || selectedClient.pontos_totais || 0);
      const nextPoints = pointsAction === 'add' ? current + amount : Math.max(0, current - amount);

      const { error } = await supabase
        .from('clientes')
        .update({ saldo_pontos: nextPoints, pontos_totais: nextPoints })
        .eq('id', selectedClient.id);

      if (error) throw error;

      const updated = { ...selectedClient, saldo_pontos: nextPoints, pontos_totais: nextPoints };
      setSelectedClient(updated);
      setClientes(prev => prev.map(c => (c.id === selectedClient.id ? updated : c)));
      setPointsModalVisible(false);
      setPointsAmount('');
      setPointsReason('');
      Alert.alert(
        'Pontos Atualizados',
        `${amount} pontos ${pointsAction === 'add' ? 'adicionados' : 'debitados'} com sucesso! Novo total: ${nextPoints} pts`
      );
    } catch (err: any) {
      Alert.alert('Erro ao atualizar pontos', err.message);
    } finally {
      setSavingPoints(false);
    }
  };

  // New budget
  const handleSaveOrcamento = async () => {
    if (!selectedClient) return;
    const total = Number(orcamentoForm.total.replace(',', '.'));
    if (isNaN(total) || total <= 0) {
      Alert.alert('Total inválido', 'Informe um valor numérico válido.');
      return;
    }

    setSavingOrcamento(true);
    try {
      const { data, error } = await supabase
        .from('orcamentos')
        .insert([
          {
            cliente_id: selectedClient.id,
            total,
            status: orcamentoForm.status,
            observacoes: orcamentoForm.descricao || null,
            data_criacao: new Date().toISOString(),
          },
        ])
        .select();

      if (error) throw error;

      setOrcamentoModalVisible(false);
      setOrcamentoForm({ total: '', descricao: '', status: 'aberto' });
      if (activeTab === 'Orçamentos') {
        setOrcamentos(prev => [data[0], ...prev]);
      }
      Alert.alert('Sucesso', 'Orçamento cadastrado com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar orçamento', err.message);
    } finally {
      setSavingOrcamento(false);
    }
  };

  const getStatusBadgeColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'ativo':
        return { bg: '#dcfce7', text: '#15803d' };
      case 'inativo':
        return { bg: '#f1f5f9', text: '#64748b' };
      case 'pendente':
        return { bg: '#fef3c7', text: '#b45309' };
      case 'bloqueado':
        return { bg: '#fee2e2', text: '#b91c1c' };
      default:
        return { bg: '#e0e7ff', text: '#4338ca' };
    }
  };

  const renderClientCard = ({ item }: { item: ClienteItem }) => {
    const statusColor = getStatusBadgeColor(item.status);
    const displayName = item.nome || item.nome_razao || 'Cliente sem nome';
    const document = item.cpf || item.cnpj || 'Sem documento';
    const isPj = item.tipo === 'pj' || (item.cnpj && item.cnpj.length > 0);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderMain}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
                <Text style={[styles.badgeText, { color: statusColor.text }]}>
                  {item.status ? item.status.toUpperCase() : 'ATIVO'}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: '#ede9fe' }]}>
                <Text style={[styles.badgeText, { color: '#6d28d9' }]}>
                  {isPj ? 'PJ' : 'PF'}
                </Text>
              </View>
              {item.codigo_cliente ? (
                <View style={[styles.badge, { backgroundColor: '#f1f5f9' }]}>
                  <Text style={[styles.badgeText, { color: '#475569' }]}>
                    #{item.codigo_cliente}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardInfoText}>📄 {document}</Text>
          {item.telefone ? <Text style={styles.cardInfoText}>📞 {item.telefone}</Text> : null}
          {item.email ? <Text style={styles.cardInfoText} numberOfLines={1}>✉️ {item.email}</Text> : null}
          {item.cidade ? (
            <Text style={styles.cardInfoText}>📍 {item.cidade}{item.estado ? ` - ${item.estado}` : ''}</Text>
          ) : null}
        </View>

        <View style={styles.financePillsRow}>
          <View style={styles.financePill}>
            <Text style={styles.financePillLabel}>Carteira</Text>
            <Text style={[styles.financePillValue, { color: '#10b981' }]}>
              R$ {Number(item.saldo_carteira || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.financePill}>
            <Text style={styles.financePillLabel}>Pontos</Text>
            <Text style={[styles.financePillValue, { color: '#6366f1' }]}>
              {Number(item.saldo_pontos || item.pontos_totais || 0)} pts
            </Text>
          </View>
        </View>

        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => {
              setSelectedClient(item);
              setActiveTab('Dados');
            }}
          >
            <Text style={styles.actionBtnSecondaryText}>🔍 Detalhes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtnPrimary}
            onPress={() => {
              setSelectedClient(item);
              openEditModal(item);
            }}
          >
            <Text style={styles.actionBtnPrimaryText}>✏️ Editar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Detail screen view
  if (selectedClient && !editModalVisible && !balanceModalVisible && !pointsModalVisible && !orcamentoModalVisible) {
    const statusColor = getStatusBadgeColor(selectedClient.status);
    const displayName = selectedClient.nome || selectedClient.nome_razao || 'Cliente';

    return (
      <SafeAreaView style={styles.container}>
        {/* Detail Top Header */}
        <View style={styles.detailHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedClient(null)}
          >
            <Text style={styles.backButtonText}>← Voltar</Text>
          </TouchableOpacity>
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => openEditModal(selectedClient)}
            >
              <Text style={styles.headerActionBtnText}>✏️ Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: '#4f46e5' }]}
              onPress={() => setOrcamentoModalVisible(true)}
            >
              <Text style={[styles.headerActionBtnText, { color: '#fff' }]}>+ Orçamento</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Client Hero Banner */}
        <View style={styles.clientHero}>
          <Text style={styles.heroName} numberOfLines={1}>{displayName}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.badgeText, { color: statusColor.text }]}>
                {selectedClient.status ? selectedClient.status.toUpperCase() : 'ATIVO'}
              </Text>
            </View>
            {selectedClient.codigo_cliente ? (
              <View style={[styles.badge, { backgroundColor: '#e2e8f0' }]}>
                <Text style={[styles.badgeText, { color: '#334155' }]}>
                  CÓD: {selectedClient.codigo_cliente}
                </Text>
              </View>
            ) : null}
            {selectedClient.nivel_vip ? (
              <View style={[styles.badge, { backgroundColor: '#fef08a' }]}>
                <Text style={[styles.badgeText, { color: '#854d0e' }]}>
                  👑 {selectedClient.nivel_vip}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Sub-Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabScrollContent}
        >
          {(['Dados', 'Carteira', 'Pontos', 'Orçamentos', 'Faturas', 'OS'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.subTabItem, activeTab === tab && styles.subTabItemActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.subTabText, activeTab === tab && styles.subTabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sub-Tab Content */}
        <ScrollView contentContainerStyle={styles.tabBodyContent}>
          {activeTab === 'Dados' && (
            <View style={styles.detailSectionCard}>
              <Text style={styles.sectionHeading}>Informações Pessoais / Cadastrais</Text>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Documento</Text>
                <Text style={styles.fieldValue}>
                  {selectedClient.cpf || selectedClient.cnpj || 'Não cadastrado'}
                </Text>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>E-mail</Text>
                <Text style={styles.fieldValue}>{selectedClient.email || 'Não informado'}</Text>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Telefone / WhatsApp</Text>
                <Text style={styles.fieldValue}>{selectedClient.telefone || 'Não informado'}</Text>
              </View>

              <Text style={[styles.sectionHeading, { marginTop: 16 }]}>Endereço</Text>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Logradouro</Text>
                <Text style={styles.fieldValue}>
                  {selectedClient.logradouro
                    ? `${selectedClient.logradouro}, ${selectedClient.numero || 'S/N'} ${selectedClient.complemento ? `(${selectedClient.complemento})` : ''}`
                    : 'Endereço não cadastrado'}
                </Text>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>Bairro / Cidade / UF</Text>
                <Text style={styles.fieldValue}>
                  {[selectedClient.bairro, selectedClient.cidade, selectedClient.estado].filter(Boolean).join(' - ') || 'Não informado'}
                </Text>
              </View>
              <View style={styles.detailField}>
                <Text style={styles.fieldLabel}>CEP</Text>
                <Text style={styles.fieldValue}>{selectedClient.cep || 'Não informado'}</Text>
              </View>

              {selectedClient.observacoes ? (
                <View style={styles.detailField}>
                  <Text style={styles.fieldLabel}>Observações Internas</Text>
                  <Text style={styles.fieldValue}>{selectedClient.observacoes}</Text>
                </View>
              ) : null}
            </View>
          )}

          {activeTab === 'Carteira' && (
            <View style={styles.detailSectionCard}>
              <Text style={styles.sectionHeading}>Carteira Digital do Cliente</Text>
              <View style={styles.balanceBigCard}>
                <Text style={styles.balanceBigLabel}>Saldo Atual Disponível</Text>
                <Text style={styles.balanceBigAmount}>
                  R$ {Number(selectedClient.saldo_carteira || 0).toFixed(2)}
                </Text>
              </View>
              <View style={styles.balanceActionRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: '#10b981' }]}
                  onPress={() => {
                    setBalanceAction('add');
                    setBalanceModalVisible(true);
                  }}
                >
                  <Text style={styles.modalBtnText}>+ Adicionar Saldo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: '#ef4444' }]}
                  onPress={() => {
                    setBalanceAction('sub');
                    setBalanceModalVisible(true);
                  }}
                >
                  <Text style={styles.modalBtnText}>- Debitar Saldo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'Pontos' && (
            <View style={styles.detailSectionCard}>
              <Text style={styles.sectionHeading}>Programa de Fidelidade & Gamificação</Text>
              <View style={[styles.balanceBigCard, { backgroundColor: '#ede9fe' }]}>
                <Text style={[styles.balanceBigLabel, { color: '#6d28d9' }]}>Pontos Acumulados</Text>
                <Text style={[styles.balanceBigAmount, { color: '#4338ca' }]}>
                  {Number(selectedClient.saldo_pontos || selectedClient.pontos_totais || 0)} pts
                </Text>
              </View>
              <View style={styles.balanceActionRow}>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: '#6366f1' }]}
                  onPress={() => {
                    setPointsAction('add');
                    setPointsModalVisible(true);
                  }}
                >
                  <Text style={styles.modalBtnText}>+ Adicionar Pontos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: '#f43f5e' }]}
                  onPress={() => {
                    setPointsAction('sub');
                    setPointsModalVisible(true);
                  }}
                >
                  <Text style={styles.modalBtnText}>- Resgatar / Debitar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'Orçamentos' && (
            <View>
              <View style={styles.tabListHeader}>
                <Text style={styles.sectionHeading}>Orçamentos ({orcamentos.length})</Text>
                <TouchableOpacity
                  style={styles.smallActionBtn}
                  onPress={() => setOrcamentoModalVisible(true)}
                >
                  <Text style={styles.smallActionBtnText}>+ Novo</Text>
                </TouchableOpacity>
              </View>
              {loadingTab ? (
                <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 20 }} />
              ) : orcamentos.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum orçamento emitido para este cliente.</Text>
              ) : (
                orcamentos.map((orc, index) => (
                  <View key={orc.id || index} style={styles.itemRowCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemRowTitle}>Orçamento #{String(orc.id).slice(0, 8)}</Text>
                      <Text style={styles.itemRowSubtitle}>
                        Status: {orc.status || 'aberto'} • {orc.data_criacao ? new Date(orc.data_criacao).toLocaleDateString('pt-BR') : 'Data não informada'}
                      </Text>
                      {orc.observacoes ? (
                        <Text style={styles.itemRowDesc}>{orc.observacoes}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.itemRowPrice}>
                      R$ {Number(orc.total || orc.valor_total || 0).toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'Faturas' && (
            <View>
              <Text style={styles.sectionHeading}>Faturas & Cobranças ({faturas.length})</Text>
              {loadingTab ? (
                <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 20 }} />
              ) : faturas.length === 0 ? (
                <Text style={styles.emptyText}>Nenhuma fatura registrada para este cliente.</Text>
              ) : (
                faturas.map((fat, index) => (
                  <View key={fat.id || index} style={styles.itemRowCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemRowTitle}>Fatura #{String(fat.id).slice(0, 8)}</Text>
                      <Text style={styles.itemRowSubtitle}>
                        Status: {fat.status || 'pendente'} • Vencimento: {fat.data_vencimento || 'N/A'}
                      </Text>
                    </View>
                    <Text style={[styles.itemRowPrice, { color: fat.status === 'pago' ? '#10b981' : '#b91c1c' }]}>
                      R$ {Number(fat.valor_total || fat.valor || 0).toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'OS' && (
            <View>
              <Text style={styles.sectionHeading}>Ordens de Serviço ({ordensServico.length})</Text>
              {loadingTab ? (
                <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 20 }} />
              ) : ordensServico.length === 0 ? (
                <Text style={styles.emptyText}>Nenhuma ordem de serviço vinculada a este cliente.</Text>
              ) : (
                ordensServico.map((os, index) => (
                  <View key={os.id || index} style={styles.itemRowCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemRowTitle}>OS #{os.numero_os || String(os.id).slice(0, 8)}</Text>
                      <Text style={styles.itemRowSubtitle}>
                        Status: {os.status || 'aberta'} • {os.data_abertura ? new Date(os.data_abertura).toLocaleDateString('pt-BR') : ''}
                      </Text>
                      {os.descricao ? (
                        <Text style={styles.itemRowDesc}>{os.descricao}</Text>
                      ) : null}
                    </View>
                    {os.valor_total ? (
                      <Text style={styles.itemRowPrice}>
                        R$ {Number(os.valor_total).toFixed(2)}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>CRM 360 Clientes</Text>
        <Text style={styles.screenSubtitle}>
          {filteredClientes.length} cliente(s) listados
        </Text>
      </View>

      {/* Quick Metrics Bar */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Clientes</Text>
          <Text style={styles.metricValue}>{clientes.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Saldo Total</Text>
          <Text style={[styles.metricValue, { color: '#10b981' }]}>
            R$ {totalBalance.toFixed(0)}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Pontos</Text>
          <Text style={[styles.metricValue, { color: '#6366f1' }]}>
            {totalPoints} pts
          </Text>
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchBoxContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome, documento, e-mail ou cód..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterChipsScroll}
        contentContainerStyle={styles.filterChipsContent}
      >
        {(['todos', 'ativo', 'inativo', 'pendente', 'bloqueado'] as const).map(status => (
          <TouchableOpacity
            key={status}
            style={[styles.chip, statusFilter === status && styles.chipActive]}
            onPress={() => setStatusFilter(status)}
          >
            <Text style={[styles.chipText, statusFilter === status && styles.chipTextActive]}>
              {status === 'todos' ? 'Todos' : status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Main List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Carregando clientes...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredClientes}
          keyExtractor={item => item.id}
          renderItem={renderClientCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum cliente encontrado</Text>
              <Text style={styles.emptySubtitle}>
                Tente ajustar os filtros ou o termo de busca.
              </Text>
            </View>
          }
        />
      )}

      {/* Edit Client Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Dados do Cliente</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormScroll}>
              <Text style={styles.inputLabel}>Nome / Razão Social *</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.nome}
                onChangeText={text => setEditForm(prev => ({ ...prev, nome: text }))}
                placeholder="Nome completo ou Razão Social"
              />

              <Text style={styles.inputLabel}>CPF / CNPJ</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.documento}
                onChangeText={text => setEditForm(prev => ({ ...prev, documento: text }))}
                placeholder="000.000.000-00"
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>E-mail</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.email}
                onChangeText={text => setEditForm(prev => ({ ...prev, email: text }))}
                placeholder="cliente@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.telefone}
                onChangeText={text => setEditForm(prev => ({ ...prev, telefone: text }))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Cidade</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.cidade}
                onChangeText={text => setEditForm(prev => ({ ...prev, cidade: text }))}
                placeholder="Cidade"
              />

              <Text style={styles.inputLabel}>Estado (UF)</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.estado}
                onChangeText={text => setEditForm(prev => ({ ...prev, estado: text }))}
                placeholder="SP"
                maxLength={2}
                autoCapitalize="characters"
              />

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.statusSelectRow}>
                {(['ativo', 'inativo', 'pendente', 'bloqueado'] as const).map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusOptionBtn,
                      editForm.status === st && styles.statusOptionBtnActive,
                    ]}
                    onPress={() => setEditForm(prev => ({ ...prev, status: st }))}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        editForm.status === st && styles.statusOptionTextActive,
                      ]}
                    >
                      {st.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Salvar Alterações</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Adjust Balance Modal */}
      <Modal visible={balanceModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <Text style={styles.modalTitle}>
              {balanceAction === 'add' ? 'Adicionar Saldo em Carteira' : 'Debitar Saldo em Carteira'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {selectedClient?.nome || selectedClient?.nome_razao}
            </Text>

            <Text style={styles.inputLabel}>Valor (R$)</Text>
            <TextInput
              style={styles.modalInput}
              value={balanceAmount}
              onChangeText={setBalanceAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Motivo / Justificativa</Text>
            <TextInput
              style={styles.modalInput}
              value={balanceReason}
              onChangeText={setBalanceReason}
              placeholder="Ex: Bonificação promocional, estorno, etc."
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setBalanceModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: balanceAction === 'add' ? '#10b981' : '#ef4444' },
                ]}
                onPress={handleSaveBalance}
                disabled={savingBalance}
              >
                {savingBalance ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Adjust Points Modal */}
      <Modal visible={pointsModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <Text style={styles.modalTitle}>
              {pointsAction === 'add' ? 'Adicionar Pontos' : 'Debitar Pontos'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {selectedClient?.nome || selectedClient?.nome_razao}
            </Text>

            <Text style={styles.inputLabel}>Quantidade de Pontos</Text>
            <TextInput
              style={styles.modalInput}
              value={pointsAmount}
              onChangeText={setPointsAmount}
              placeholder="Ex: 50"
              keyboardType="number-pad"
            />

            <Text style={styles.inputLabel}>Motivo / Justificativa</Text>
            <TextInput
              style={styles.modalInput}
              value={pointsReason}
              onChangeText={setPointsReason}
              placeholder="Ex: Campanha de indicação, resgate, etc."
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setPointsModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: pointsAction === 'add' ? '#6366f1' : '#f43f5e' },
                ]}
                onPress={handleSavePoints}
                disabled={savingPoints}
              >
                {savingPoints ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New Budget Modal */}
      <Modal visible={orcamentoModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <Text style={styles.modalTitle}>Novo Orçamento</Text>
            <Text style={styles.modalSubtitle}>
              Cliente: {selectedClient?.nome || selectedClient?.nome_razao}
            </Text>

            <Text style={styles.inputLabel}>Valor Total (R$) *</Text>
            <TextInput
              style={styles.modalInput}
              value={orcamentoForm.total}
              onChangeText={text => setOrcamentoForm(prev => ({ ...prev, total: text }))}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />

            <Text style={styles.inputLabel}>Descrição dos Serviços</Text>
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              value={orcamentoForm.descricao}
              onChangeText={text => setOrcamentoForm(prev => ({ ...prev, descricao: text }))}
              placeholder="Detalhes dos itens / serviços orçados..."
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setOrcamentoModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveOrcamento}
                disabled={savingOrcamento}
              >
                {savingOrcamento ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Salvar Orçamento</Text>
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
  screenHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  metricsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginVertical: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },
  searchBoxContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 46,
  },
  filterChipsScroll: {
    maxHeight: 42,
    marginBottom: 8,
  },
  filterChipsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
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
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardHeaderMain: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    marginVertical: 8,
    gap: 4,
  },
  cardInfoText: {
    fontSize: 13,
    color: '#475569',
  },
  financePillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
  },
  financePill: {
    flex: 1,
  },
  financePillLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  financePillValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  actionBtnPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
  },
  actionBtnSecondaryText: {
    color: '#334155',
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
    marginTop: 12,
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
  // Detail screen styles
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4f46e5',
  },
  headerRightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  clientHero: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  tabScroll: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 46,
  },
  tabScrollContent: {
    paddingHorizontal: 12,
    gap: 6,
  },
  subTabItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  subTabItemActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#4f46e5',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  subTabTextActive: {
    color: '#4f46e5',
    fontWeight: '800',
  },
  tabBodyContent: {
    padding: 16,
  },
  detailSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  detailField: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    marginTop: 2,
  },
  balanceBigCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginVertical: 8,
  },
  balanceBigLabel: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '600',
  },
  balanceBigAmount: {
    fontSize: 30,
    fontWeight: '900',
    color: '#065f46',
    marginTop: 4,
  },
  balanceActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  tabListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  smallActionBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  smallActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  itemRowCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  itemRowSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  itemRowDesc: {
    fontSize: 12,
    color: '#334155',
    marginTop: 4,
    fontStyle: 'italic',
  },
  itemRowPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginVertical: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalContentSmall: {
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
  modalCloseText: {
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
  statusSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 12,
  },
  statusOptionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
    justifyContent: 'center',
  },
  statusOptionBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  statusOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statusOptionTextActive: {
    color: '#ffffff',
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
