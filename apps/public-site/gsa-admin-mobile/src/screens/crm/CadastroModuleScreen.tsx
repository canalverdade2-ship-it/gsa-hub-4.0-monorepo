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

type CadastroTab = 'clientes' | 'prestadores' | 'parceiros';

export const CadastroModuleScreen = () => {
  const [currentTab, setCurrentTab] = useState<CadastroTab>('clientes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Lists
  const [clientes, setClientes] = useState<any[]>([]);
  const [prestadores, setPrestadores] = useState<any[]>([]);
  const [parceiros, setParceiros] = useState<any[]>([]);

  // Modals
  const [modalType, setModalType] = useState<'cliente' | 'prestador' | 'parceiro' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forms
  const [clienteForm, setClienteForm] = useState({
    nome: '',
    tipo: 'pf' as 'pf' | 'pj',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    cidade: '',
    estado: 'SP',
  });

  const [prestadorForm, setPrestadorForm] = useState({
    nome: '',
    especialidade: '',
    cpf: '',
    telefone: '',
    cidade: '',
    estado: 'SP',
    status: 'ativo',
  });

  const [parceiroForm, setParceiroForm] = useState({
    nome: '',
    categoria: '',
    contato: '',
    telefone: '',
    comissao: '10',
    status: 'ativo',
  });

  const fetchData = useCallback(async () => {
    try {
      if (currentTab === 'clientes') {
        const { data, error } = await supabase
          .from('clientes')
          .select('id, nome, nome_razao, cpf, cnpj, email, telefone, status, data_cadastro')
          .order('data_cadastro', { ascending: false })
          .limit(50);
        if (error) throw error;
        setClientes(data || []);
      } else if (currentTab === 'prestadores') {
        const { data, error } = await supabase
          .from('prestadores')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        setPrestadores(data || []);
      } else if (currentTab === 'parceiros') {
        const { data, error } = await supabase
          .from('parceiros')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        setParceiros(data || []);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar dados:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentTab]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Create Cliente
  const handleSaveCliente = async () => {
    if (!clienteForm.nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome ou razão social.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        tipo: clienteForm.tipo,
        email: clienteForm.email.trim() || null,
        telefone: clienteForm.telefone.trim() || null,
        cidade: clienteForm.cidade.trim() || null,
        estado: clienteForm.estado.trim() || null,
        status: 'ativo',
        data_cadastro: new Date().toISOString(),
      };
      if (clienteForm.tipo === 'pj') {
        payload.nome_razao = clienteForm.nome.trim();
        payload.cnpj = clienteForm.cpf_cnpj.trim() || null;
      } else {
        payload.nome = clienteForm.nome.trim();
        payload.cpf = clienteForm.cpf_cnpj.trim() || null;
      }

      const { data, error } = await supabase.from('clientes').insert([payload]).select();
      if (error) throw error;

      Alert.alert('Sucesso', 'Cliente cadastrado com sucesso!');
      setModalType(null);
      setClienteForm({ nome: '', tipo: 'pf', cpf_cnpj: '', email: '', telefone: '', cidade: '', estado: 'SP' });
      if (data && data[0]) {
        setClientes(prev => [data[0], ...prev]);
      } else {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar cliente', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Create Prestador
  const handleSavePrestador = async () => {
    if (!prestadorForm.nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do prestador/técnico.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        nome: prestadorForm.nome.trim(),
        especialidade: prestadorForm.especialidade.trim() || 'Geral',
        cpf: prestadorForm.cpf.trim() || null,
        telefone: prestadorForm.telefone.trim() || null,
        cidade: prestadorForm.cidade.trim() || null,
        estado: prestadorForm.estado.trim() || null,
        status: prestadorForm.status,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('prestadores').insert([payload]).select();
      if (error) throw error;

      Alert.alert('Sucesso', 'Prestador/Técnico cadastrado com sucesso!');
      setModalType(null);
      setPrestadorForm({ nome: '', especialidade: '', cpf: '', telefone: '', cidade: '', estado: 'SP', status: 'ativo' });
      if (data && data[0]) {
        setPrestadores(prev => [data[0], ...prev]);
      } else {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar prestador', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Create Parceiro
  const handleSaveParceiro = async () => {
    if (!parceiroForm.nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do parceiro ou empresa.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        nome: parceiroForm.nome.trim(),
        categoria: parceiroForm.categoria.trim() || 'Comercial',
        contato: parceiroForm.contato.trim() || null,
        telefone: parceiroForm.telefone.trim() || null,
        comissao_padrao: Number(parceiroForm.comissao) || 10,
        status: parceiroForm.status,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('parceiros').insert([payload]).select();
      if (error) throw error;

      Alert.alert('Sucesso', 'Parceiro cadastrado com sucesso!');
      setModalType(null);
      setParceiroForm({ nome: '', categoria: '', contato: '', telefone: '', comissao: '10', status: 'ativo' });
      if (data && data[0]) {
        setParceiros(prev => [data[0], ...prev]);
      } else {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar parceiro', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle status helper
  const handleToggleStatus = async (table: 'clientes' | 'prestadores' | 'parceiros', id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { error } = await supabase.from(table).update({ status: nextStatus }).eq('id', id);
      if (error) throw error;

      if (table === 'clientes') {
        setClientes(prev => prev.map(item => item.id === id ? { ...item, status: nextStatus } : item));
      } else if (table === 'prestadores') {
        setPrestadores(prev => prev.map(item => item.id === id ? { ...item, status: nextStatus } : item));
      } else if (table === 'parceiros') {
        setParceiros(prev => prev.map(item => item.id === id ? { ...item, status: nextStatus } : item));
      }
    } catch (err: any) {
      Alert.alert('Erro ao atualizar status', err.message);
    }
  };

  // Filter list
  const getFilteredList = () => {
    const term = search.toLowerCase().trim();
    if (currentTab === 'clientes') {
      return clientes.filter(item => {
        if (!term) return true;
        const name = (item.nome || item.nome_razao || '').toLowerCase();
        const doc = (item.cpf || item.cnpj || '').toLowerCase();
        return name.includes(term) || doc.includes(term);
      });
    } else if (currentTab === 'prestadores') {
      return prestadores.filter(item => {
        if (!term) return true;
        const name = (item.nome || '').toLowerCase();
        const esp = (item.especialidade || '').toLowerCase();
        return name.includes(term) || esp.includes(term);
      });
    } else {
      return parceiros.filter(item => {
        if (!term) return true;
        const name = (item.nome || '').toLowerCase();
        const cat = (item.categoria || '').toLowerCase();
        return name.includes(term) || cat.includes(term);
      });
    }
  };

  const filteredList = getFilteredList();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Central de Cadastros</Text>
          <Text style={styles.headerSubtitle}>
            Gestão unificada de clientes, prestadores e parceiros
          </Text>
        </View>
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => {
            if (currentTab === 'clientes') setModalType('cliente');
            else if (currentTab === 'prestadores') setModalType('prestador');
            else setModalType('parceiro');
          }}
        >
          <Text style={styles.newButtonText}>+ Novo</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, currentTab === 'clientes' && styles.tabButtonActive]}
          onPress={() => setCurrentTab('clientes')}
        >
          <Text style={[styles.tabButtonText, currentTab === 'clientes' && styles.tabButtonTextActive]}>
            Clientes ({clientes.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, currentTab === 'prestadores' && styles.tabButtonActive]}
          onPress={() => setCurrentTab('prestadores')}
        >
          <Text style={[styles.tabButtonText, currentTab === 'prestadores' && styles.tabButtonTextActive]}>
            Prestadores ({prestadores.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, currentTab === 'parceiros' && styles.tabButtonActive]}
          onPress={() => setCurrentTab('parceiros')}
        >
          <Text style={[styles.tabButtonText, currentTab === 'parceiros' && styles.tabButtonTextActive]}>
            Parceiros ({parceiros.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={`Buscar em ${currentTab}...`}
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.loadingText}>Carregando cadastros...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
          }
          renderItem={({ item }) => {
            const isAtivo = item.status === 'ativo';
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>
                      {item.nome || item.nome_razao || 'Registro sem nome'}
                    </Text>
                    <Text style={styles.cardSecondary}>
                      {currentTab === 'clientes'
                        ? (item.cpf || item.cnpj || item.email || 'Documento não informado')
                        : currentTab === 'prestadores'
                        ? `🛠️ ${item.especialidade || 'Geral'} • ${item.telefone || 'Sem contato'}`
                        : `🤝 ${item.categoria || 'Comercial'} • ${item.comissao_padrao || 10}% comissão`}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: isAtivo ? '#dcfce7' : '#fee2e2' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: isAtivo ? '#15803d' : '#b91c1c' },
                      ]}
                    >
                      {item.status ? item.status.toUpperCase() : 'ATIVO'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBottom}>
                  {item.cidade ? (
                    <Text style={styles.cardLocation}>
                      📍 {item.cidade}{item.estado ? ` - ${item.estado}` : ''}
                    </Text>
                  ) : (
                    <Text style={styles.cardLocation}>ID: {String(item.id).slice(0, 8)}</Text>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.toggleStatusBtn,
                      { borderColor: isAtivo ? '#ef4444' : '#10b981' },
                    ]}
                    onPress={() => handleToggleStatus(currentTab, item.id, item.status || 'ativo')}
                  >
                    <Text
                      style={[
                        styles.toggleStatusText,
                        { color: isAtivo ? '#ef4444' : '#10b981' },
                      ]}
                    >
                      {isAtivo ? 'Desativar' : 'Ativar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum registro encontrado</Text>
              <Text style={styles.emptySubtitle}>
                Cadastre um novo item ou ajuste sua busca.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal: Novo Cliente */}
      <Modal visible={modalType === 'cliente'} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Cadastro de Cliente</Text>
              <TouchableOpacity onPress={() => setModalType(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.fieldLabel}>Tipo de Pessoa</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, clienteForm.tipo === 'pf' && styles.typeBtnActive]}
                  onPress={() => setClienteForm(prev => ({ ...prev, tipo: 'pf' }))}
                >
                  <Text style={[styles.typeBtnText, clienteForm.tipo === 'pf' && styles.typeBtnTextActive]}>
                    Pessoa Física (PF)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, clienteForm.tipo === 'pj' && styles.typeBtnActive]}
                  onPress={() => setClienteForm(prev => ({ ...prev, tipo: 'pj' }))}
                >
                  <Text style={[styles.typeBtnText, clienteForm.tipo === 'pj' && styles.typeBtnTextActive]}>
                    Pessoa Jurídica (PJ)
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Nome Completo / Razão Social *</Text>
              <TextInput
                style={styles.modalInput}
                value={clienteForm.nome}
                onChangeText={text => setClienteForm(prev => ({ ...prev, nome: text }))}
                placeholder="Ex: João da Silva ou Silva & Filhos LTDA"
              />

              <Text style={styles.fieldLabel}>{clienteForm.tipo === 'pj' ? 'CNPJ' : 'CPF'}</Text>
              <TextInput
                style={styles.modalInput}
                value={clienteForm.cpf_cnpj}
                onChangeText={text => setClienteForm(prev => ({ ...prev, cpf_cnpj: text }))}
                placeholder="000.000.000-00"
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>E-mail</Text>
              <TextInput
                style={styles.modalInput}
                value={clienteForm.email}
                onChangeText={text => setClienteForm(prev => ({ ...prev, email: text }))}
                placeholder="cliente@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.modalInput}
                value={clienteForm.telefone}
                onChangeText={text => setClienteForm(prev => ({ ...prev, telefone: text }))}
                placeholder="(11) 99999-9999"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Cidade</Text>
              <TextInput
                style={styles.modalInput}
                value={clienteForm.cidade}
                onChangeText={text => setClienteForm(prev => ({ ...prev, cidade: text }))}
                placeholder="Cidade"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setModalType(null)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveCliente}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Cadastrar Cliente</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Novo Prestador */}
      <Modal visible={modalType === 'prestador'} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Prestador / Técnico</Text>
              <TouchableOpacity onPress={() => setModalType(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.fieldLabel}>Nome do Profissional *</Text>
              <TextInput
                style={styles.modalInput}
                value={prestadorForm.nome}
                onChangeText={text => setPrestadorForm(prev => ({ ...prev, nome: text }))}
                placeholder="Nome completo do técnico"
              />

              <Text style={styles.fieldLabel}>Especialidade Principal *</Text>
              <TextInput
                style={styles.modalInput}
                value={prestadorForm.especialidade}
                onChangeText={text => setPrestadorForm(prev => ({ ...prev, especialidade: text }))}
                placeholder="Ex: Eletricista, Encanador, TI, Pintura, etc."
              />

              <Text style={styles.fieldLabel}>CPF</Text>
              <TextInput
                style={styles.modalInput}
                value={prestadorForm.cpf}
                onChangeText={text => setPrestadorForm(prev => ({ ...prev, cpf: text }))}
                placeholder="000.000.000-00"
                keyboardType="numeric"
              />

              <Text style={styles.fieldLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.modalInput}
                value={prestadorForm.telefone}
                onChangeText={text => setPrestadorForm(prev => ({ ...prev, telefone: text }))}
                placeholder="(11) 99999-9999"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Cidade de Atuação</Text>
              <TextInput
                style={styles.modalInput}
                value={prestadorForm.cidade}
                onChangeText={text => setPrestadorForm(prev => ({ ...prev, cidade: text }))}
                placeholder="Cidade"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setModalType(null)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSavePrestador}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Cadastrar Prestador</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Novo Parceiro */}
      <Modal visible={modalType === 'parceiro'} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Parceiro Comercial</Text>
              <TouchableOpacity onPress={() => setModalType(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.fieldLabel}>Nome do Parceiro / Estabelecimento *</Text>
              <TextInput
                style={styles.modalInput}
                value={parceiroForm.nome}
                onChangeText={text => setParceiroForm(prev => ({ ...prev, nome: text }))}
                placeholder="Nome da empresa ou parceiro"
              />

              <Text style={styles.fieldLabel}>Ramo / Categoria</Text>
              <TextInput
                style={styles.modalInput}
                value={parceiroForm.categoria}
                onChangeText={text => setParceiroForm(prev => ({ ...prev, categoria: text }))}
                placeholder="Ex: Auto Peças, Alimentação, Saúde, etc."
              />

              <Text style={styles.fieldLabel}>Pessoa de Contato</Text>
              <TextInput
                style={styles.modalInput}
                value={parceiroForm.contato}
                onChangeText={text => setParceiroForm(prev => ({ ...prev, contato: text }))}
                placeholder="Responsável / Gerente"
              />

              <Text style={styles.fieldLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.modalInput}
                value={parceiroForm.telefone}
                onChangeText={text => setParceiroForm(prev => ({ ...prev, telefone: text }))}
                placeholder="(11) 99999-9999"
                keyboardType="phone-pad"
              />

              <Text style={styles.fieldLabel}>Percentual de Comissão (%)</Text>
              <TextInput
                style={styles.modalInput}
                value={parceiroForm.comissao}
                onChangeText={text => setParceiroForm(prev => ({ ...prev, comissao: text }))}
                placeholder="10"
                keyboardType="numeric"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setModalType(null)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveParceiro}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Cadastrar Parceiro</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    paddingBottom: 10,
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
  newButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  newButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  tabButtonActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#4f46e5',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabButtonTextActive: {
    color: '#4f46e5',
    fontWeight: '800',
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
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardSecondary: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cardLocation: {
    fontSize: 12,
    color: '#64748b',
  },
  toggleStatusBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  toggleStatusText: {
    fontSize: 12,
    fontWeight: '700',
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
  closeBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748b',
    padding: 4,
  },
  modalForm: {
    maxHeight: 400,
  },
  fieldLabel: {
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
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
    justifyContent: 'center',
  },
  typeBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  typeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  typeBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
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
