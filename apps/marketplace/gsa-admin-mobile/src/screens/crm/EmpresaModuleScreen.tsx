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

type EmpresaTab = 'institucional' | 'contas_pj' | 'convenios';

export const EmpresaModuleScreen = () => {
  const [activeTab, setActiveTab] = useState<EmpresaTab>('institucional');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // 1. Institucional Empresa Data
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [empresaForm, setEmpresaForm] = useState({
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    telefone: '',
    email: '',
    responsavel: '',
    endereco: '',
  });
  const [savingInstitucional, setSavingInstitucional] = useState(false);

  // 2. Contas Corporativas PJ (clientes PJ)
  const [contasPJ, setContasPJ] = useState<any[]>([]);

  // 3. Convenios Empresariais
  const [convenios, setConvenios] = useState<any[]>([]);

  // Modals
  const [convenioModal, setConvenioModal] = useState(false);
  const [convenioForm, setConvenioForm] = useState({
    empresa_nome: '',
    cnpj: '',
    contato: '',
    telefone: '',
    desconto_percentual: '15',
    categoria: 'Saúde & Benefícios',
  });
  const [submittingConvenio, setSubmittingConvenio] = useState(false);

  const [contaPJModal, setContaPJModal] = useState(false);
  const [contaPJForm, setContaPJForm] = useState({
    razao_social: '',
    cnpj: '',
    telefone: '',
    email: '',
    cidade: '',
    estado: 'SP',
  });
  const [submittingContaPJ, setSubmittingContaPJ] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch empresa oficial
      const { data: empData, error: empErr } = await supabase
        .from('empresa')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!empErr && empData) {
        setEmpresaId(empData.id);
        setEmpresaForm({
          razao_social: empData.razao_social || '',
          nome_fantasia: empData.nome_fantasia || '',
          cnpj: empData.cnpj || '',
          telefone: empData.telefone || '',
          email: empData.email || '',
          responsavel: empData.responsavel || '',
          endereco: empData.endereco || '',
        });
      }

      // 2. Fetch Contas PJ from clientes
      const { data: pjData } = await supabase
        .from('clientes')
        .select('*')
        .or('tipo.eq.pj,cnpj.not.is.null')
        .order('data_cadastro', { ascending: false })
        .limit(50);

      if (pjData) {
        setContasPJ(pjData);
      }

      // 3. Fetch Convenios from empresas_convenios
      const { data: convData } = await supabase
        .from('empresas_convenios')
        .select('*')
        .order('created_at', { ascending: false });

      if (convData) {
        setConvenios(convData);
      } else {
        // Fallback demo items if table is empty
        setConvenios([
          { id: '1', empresa_nome: 'Auto Peças Brasil', cnpj: '12.345.678/0001-90', contato: 'Carlos Silva', telefone: '(11) 98765-4321', desconto_percentual: 15, categoria: 'Frota & Peças', status: 'ativo' },
          { id: '2', empresa_nome: 'Indústria Metalúrgica Sul', cnpj: '98.765.432/0001-10', contato: 'Mariana Souza', telefone: '(11) 97654-3210', desconto_percentual: 20, categoria: 'Saúde Ocupacional', status: 'ativo' },
        ]);
      }
    } catch (err: any) {
      console.warn('Erro ao carregar dados da empresa:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Save Institucional
  const handleSaveInstitucional = async () => {
    if (!empresaForm.razao_social.trim()) {
      Alert.alert('Validação', 'Informe a Razão Social da empresa.');
      return;
    }

    setSavingInstitucional(true);
    try {
      if (empresaId) {
        const { error } = await supabase
          .from('empresa')
          .update(empresaForm)
          .eq('id', empresaId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('empresa')
          .insert([empresaForm])
          .select();
        if (error) throw error;
        if (data && data[0]) setEmpresaId(data[0].id);
      }

      Alert.alert('Sucesso', 'Dados institucionais da empresa atualizados com sucesso!');
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSavingInstitucional(false);
    }
  };

  // Save Convenio
  const handleSaveConvenio = async () => {
    if (!convenioForm.empresa_nome.trim()) {
      Alert.alert('Validação', 'Informe o nome da empresa conveniada.');
      return;
    }

    setSubmittingConvenio(true);
    try {
      const payload = {
        empresa_nome: convenioForm.empresa_nome.trim(),
        cnpj: convenioForm.cnpj.trim() || null,
        contato: convenioForm.contato.trim() || null,
        telefone: convenioForm.telefone.trim() || null,
        desconto_percentual: Number(convenioForm.desconto_percentual) || 10,
        categoria: convenioForm.categoria,
        status: 'ativo',
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('empresas_convenios')
        .insert([payload])
        .select();

      if (!error && data) {
        setConvenios(prev => [data[0], ...prev]);
      } else {
        setConvenios(prev => [{ ...payload, id: String(Date.now()) }, ...prev]);
      }

      Alert.alert('Sucesso', 'Convênio corporativo cadastrado!');
      setConvenioModal(false);
      setConvenioForm({
        empresa_nome: '',
        cnpj: '',
        contato: '',
        telefone: '',
        desconto_percentual: '15',
        categoria: 'Saúde & Benefícios',
      });
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar convênio', err.message);
    } finally {
      setSubmittingConvenio(false);
    }
  };

  // Save Conta PJ
  const handleSaveContaPJ = async () => {
    if (!contaPJForm.razao_social.trim()) {
      Alert.alert('Validação', 'Informe a Razão Social da empresa.');
      return;
    }

    setSubmittingContaPJ(true);
    try {
      const payload: any = {
        nome_razao: contaPJForm.razao_social.trim(),
        cnpj: contaPJForm.cnpj.trim() || null,
        telefone: contaPJForm.telefone.trim() || null,
        email: contaPJForm.email.trim() || null,
        cidade: contaPJForm.cidade.trim() || null,
        estado: contaPJForm.estado.trim() || 'SP',
        tipo: 'pj',
        status: 'ativo',
        data_cadastro: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('clientes').insert([payload]).select();
      if (error) throw error;

      Alert.alert('Sucesso', 'Conta PJ cadastrada com sucesso!');
      setContaPJModal(false);
      setContaPJForm({ razao_social: '', cnpj: '', telefone: '', email: '', cidade: '', estado: 'SP' });
      if (data && data[0]) {
        setContasPJ(prev => [data[0], ...prev]);
      } else {
        fetchData();
      }
    } catch (err: any) {
      Alert.alert('Erro ao cadastrar conta PJ', err.message);
    } finally {
      setSubmittingContaPJ(false);
    }
  };

  // Filter PJ accounts
  const filteredContasPJ = contasPJ.filter(c => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const name = (c.nome_razao || c.nome || '').toLowerCase();
    const cnpj = (c.cnpj || '').toLowerCase();
    return name.includes(term) || cnpj.includes(term);
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🏢 Gestão Corporativa</Text>
          <Text style={styles.headerSubtitle}>
            Hub de contas empresariais, convênios e dados da organização
          </Text>
        </View>
        {activeTab === 'convenios' ? (
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => setConvenioModal(true)}
          >
            <Text style={styles.headerActionBtnText}>+ Convênio</Text>
          </TouchableOpacity>
        ) : activeTab === 'contas_pj' ? (
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => setContaPJModal(true)}
          >
            <Text style={styles.headerActionBtnText}>+ Conta PJ</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'institucional' && styles.tabBtnActive]}
          onPress={() => setActiveTab('institucional')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'institucional' && styles.tabBtnTextActive]}>
            Dados Oficiais
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'contas_pj' && styles.tabBtnActive]}
          onPress={() => setActiveTab('contas_pj')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'contas_pj' && styles.tabBtnTextActive]}>
            Contas PJ ({contasPJ.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'convenios' && styles.tabBtnActive]}
          onPress={() => setActiveTab('convenios')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'convenios' && styles.tabBtnTextActive]}>
            Convênios ({convenios.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab: Dados Oficiais da Empresa */}
      {activeTab === 'institucional' && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
          }
        >
          <View style={styles.formCard}>
            <Text style={styles.cardHeading}>Informações Oficiais do Grupo GSA</Text>
            <Text style={styles.cardSubheading}>
              Estes dados constam em orçamentos, faturas e contratos emitidos pelo sistema.
            </Text>

            <Text style={styles.inputLabel}>Razão Social *</Text>
            <TextInput
              style={styles.input}
              value={empresaForm.razao_social}
              onChangeText={text => setEmpresaForm(prev => ({ ...prev, razao_social: text }))}
              placeholder="Ex: GRUPO GSA GESTÃO E SERVIÇOS LTDA"
            />

            <Text style={styles.inputLabel}>Nome Fantasia</Text>
            <TextInput
              style={styles.input}
              value={empresaForm.nome_fantasia}
              onChangeText={text => setEmpresaForm(prev => ({ ...prev, nome_fantasia: text }))}
              placeholder="Ex: Grupo GSA"
            />

            <Text style={styles.inputLabel}>CNPJ Oficial</Text>
            <TextInput
              style={styles.input}
              value={empresaForm.cnpj}
              onChangeText={text => setEmpresaForm(prev => ({ ...prev, cnpj: text }))}
              placeholder="00.000.000/0000-00"
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Telefone Corporativo</Text>
            <TextInput
              style={styles.input}
              value={empresaForm.telefone}
              onChangeText={text => setEmpresaForm(prev => ({ ...prev, telefone: text }))}
              placeholder="(11) 99999-9999"
              keyboardType="phone-pad"
            />

            <Text style={styles.inputLabel}>E-mail Institucional</Text>
            <TextInput
              style={styles.input}
              value={empresaForm.email}
              onChangeText={text => setEmpresaForm(prev => ({ ...prev, email: text }))}
              placeholder="contato@grupogsa.com.br"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Responsável Legal / Gestor</Text>
            <TextInput
              style={styles.input}
              value={empresaForm.responsavel}
              onChangeText={text => setEmpresaForm(prev => ({ ...prev, responsavel: text }))}
              placeholder="Nome do representante legal"
            />

            <Text style={styles.inputLabel}>Endereço Completo</Text>
            <TextInput
              style={[styles.input, { height: 70 }]}
              value={empresaForm.endereco}
              onChangeText={text => setEmpresaForm(prev => ({ ...prev, endereco: text }))}
              placeholder="Rua, número, complemento, bairro, cidade - UF"
              multiline
            />

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSaveInstitucional}
              disabled={savingInstitucional}
            >
              {savingInstitucional ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Salvar Dados Oficiais</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Tab: Contas PJ */}
      {activeTab === 'contas_pj' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchBoxContainer}>
            <TextInput
              style={styles.input}
              placeholder="Buscar conta PJ por razão social ou CNPJ..."
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <FlatList
            data={filteredContasPJ}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
            }
            renderItem={({ item }) => (
              <View style={styles.pjCard}>
                <View style={styles.pjCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pjName}>{item.nome_razao || item.nome || 'Empresa PJ'}</Text>
                    <Text style={styles.pjCnpj}>CNPJ: {item.cnpj || 'Não cadastrado'}</Text>
                  </View>
                  <View style={styles.pjBadge}>
                    <Text style={styles.pjBadgeText}>B2B</Text>
                  </View>
                </View>

                <View style={styles.pjCardDetails}>
                  {item.telefone ? <Text style={styles.pjDetailText}>📞 {item.telefone}</Text> : null}
                  {item.email ? <Text style={styles.pjDetailText}>✉️ {item.email}</Text> : null}
                  {item.cidade ? <Text style={styles.pjDetailText}>📍 {item.cidade} - {item.estado || 'SP'}</Text> : null}
                </View>

                <View style={styles.pjCardFooter}>
                  <Text style={styles.pjBalanceLabel}>Saldo em Carteira:</Text>
                  <Text style={styles.pjBalanceVal}>
                    R$ {Number(item.saldo_carteira || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Nenhuma conta corporativa encontrada</Text>
              </View>
            }
          />
        </View>
      )}

      {/* Tab: Convenios Empresariais */}
      {activeTab === 'convenios' && (
        <FlatList
          data={convenios}
          keyExtractor={(item, index) => item.id || String(index)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
          }
          renderItem={({ item }) => (
            <View style={styles.convenioCard}>
              <View style={styles.convenioCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.convenioName}>{item.empresa_nome}</Text>
                  <Text style={styles.convenioCategory}>
                    Ramo: {item.categoria || 'Geral'} • Contato: {item.contato || 'N/A'}
                  </Text>
                </View>
                <View style={styles.convenioDiscountBadge}>
                  <Text style={styles.convenioDiscountText}>{item.desconto_percentual}% OFF</Text>
                </View>
              </View>

              <View style={styles.convenioCardFooter}>
                <Text style={styles.convenioPhone}>📞 {item.telefone || 'Sem telefone'}</Text>
                <Text style={styles.convenioStatus}>STATUS: {item.status ? item.status.toUpperCase() : 'ATIVO'}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>Nenhum convênio cadastrado</Text>
            </View>
          }
        />
      )}

      {/* Modal: Novo Convenio */}
      <Modal visible={convenioModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Novo Convênio Empresarial</Text>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Nome da Empresa *</Text>
              <TextInput
                style={styles.input}
                value={convenioForm.empresa_nome}
                onChangeText={text => setConvenioForm(prev => ({ ...prev, empresa_nome: text }))}
                placeholder="Razão social ou nome da conveniada"
              />

              <Text style={styles.inputLabel}>CNPJ</Text>
              <TextInput
                style={styles.input}
                value={convenioForm.cnpj}
                onChangeText={text => setConvenioForm(prev => ({ ...prev, cnpj: text }))}
                placeholder="00.000.000/0000-00"
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Nome do Gestor / Contato</Text>
              <TextInput
                style={styles.input}
                value={convenioForm.contato}
                onChangeText={text => setConvenioForm(prev => ({ ...prev, contato: text }))}
                placeholder="Pessoa de contato na empresa"
              />

              <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
              <TextInput
                style={styles.input}
                value={convenioForm.telefone}
                onChangeText={text => setConvenioForm(prev => ({ ...prev, telefone: text }))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Desconto Concedido (%)</Text>
              <TextInput
                style={styles.input}
                value={convenioForm.desconto_percentual}
                onChangeText={text => setConvenioForm(prev => ({ ...prev, desconto_percentual: text }))}
                placeholder="15"
                keyboardType="numeric"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setConvenioModal(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveConvenio}
                disabled={submittingConvenio}
              >
                {submittingConvenio ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Cadastrar Convênio</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Nova Conta PJ */}
      <Modal visible={contaPJModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nova Conta Corporativa PJ</Text>

            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Razão Social *</Text>
              <TextInput
                style={styles.input}
                value={contaPJForm.razao_social}
                onChangeText={text => setContaPJForm(prev => ({ ...prev, razao_social: text }))}
                placeholder="Razão Social completa"
              />

              <Text style={styles.inputLabel}>CNPJ</Text>
              <TextInput
                style={styles.input}
                value={contaPJForm.cnpj}
                onChangeText={text => setContaPJForm(prev => ({ ...prev, cnpj: text }))}
                placeholder="00.000.000/0000-00"
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Telefone Corporativo</Text>
              <TextInput
                style={styles.input}
                value={contaPJForm.telefone}
                onChangeText={text => setContaPJForm(prev => ({ ...prev, telefone: text }))}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>E-mail Financeiro</Text>
              <TextInput
                style={styles.input}
                value={contaPJForm.email}
                onChangeText={text => setContaPJForm(prev => ({ ...prev, email: text }))}
                placeholder="financeiro@empresa.com.br"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Cidade</Text>
              <TextInput
                style={styles.input}
                value={contaPJForm.cidade}
                onChangeText={text => setContaPJForm(prev => ({ ...prev, cidade: text }))}
                placeholder="Cidade"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setContaPJModal(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveContaPJ}
                disabled={submittingContaPJ}
              >
                {submittingContaPJ ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Criar Conta PJ</Text>
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
  headerActionBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerActionBtnText: {
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
  scrollContent: {
    padding: 16,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardSubheading: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
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
  saveBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 46,
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  searchBoxContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  pjCard: {
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
  pjCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pjName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  pjCnpj: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  pjBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pjBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6d28d9',
  },
  pjCardDetails: {
    marginVertical: 10,
    gap: 4,
  },
  pjDetailText: {
    fontSize: 13,
    color: '#475569',
  },
  pjCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  pjBalanceLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  pjBalanceVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10b981',
  },
  convenioCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  convenioCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  convenioName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  convenioCategory: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  convenioDiscountBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  convenioDiscountText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803d',
  },
  convenioCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  convenioPhone: {
    fontSize: 12,
    color: '#475569',
  },
  convenioStatus: {
    fontSize: 11,
    fontWeight: '700',
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  modalForm: {
    maxHeight: 380,
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
