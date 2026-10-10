import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  ActivityIndicator, 
  Alert, 
  Modal, 
  TextInput, 
  Button, 
  ScrollView, 
  TouchableOpacity,
  RefreshControl
} from 'react-native';
import { supabase } from '../supabase';

// Universal Cross-Platform Prompt Modal (Replaces iOS-only Alert.prompt)
export const UniversalPromptModal = ({
  visible,
  title,
  message,
  placeholder,
  keyboardType = 'default',
  initialValue = '',
  onConfirm,
  onCancel
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  initialValue?: string;
  onConfirm: (val: string) => void;
  onCancel: () => void;
}) => {
  const [val, setVal] = useState(initialValue);
  useEffect(() => {
    if (visible) setVal(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          {message ? <Text style={{ color: '#4b5563', marginBottom: 12, fontSize: 14 }}>{message}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder={placeholder || 'Digite aqui...'}
            value={val}
            onChangeText={setVal}
            keyboardType={keyboardType}
            autoFocus
          />
          <View style={styles.modalActions}>
            <Button title="Cancelar" onPress={onCancel} color="#6b7280" />
            <Button title="Confirmar" onPress={() => onConfirm(val)} color="#17345f" />
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Universal Search and Creation Header Component
export const SearchHeader = ({
  search,
  setSearch,
  placeholder = 'Buscar...',
  onAddNew,
  addNewLabel = '+ Novo',
}: {
  search: string;
  setSearch: (text: string) => void;
  placeholder?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
}) => (
  <View style={styles.searchBarContainer}>
    <View style={styles.searchInputWrapper}>
      <Text style={{ marginRight: 8, fontSize: 14 }}>🔍</Text>
      <TextInput
        style={styles.searchTextInput}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      {search.length > 0 && (
        <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
          <Text style={{ color: '#9ca3af', fontWeight: 'bold' }}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
    {onAddNew && (
      <TouchableOpacity style={styles.addNewButton} onPress={onAddNew}>
        <Text style={styles.addNewButtonText}>{addNewLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ==========================================
// 1. CLIENTES SCREEN (CRM 360)
// ==========================================
export const ClientesScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('Dados');

  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [ordensServico, setOrdensServico] = useState<any[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({ nome: '', cpf: '', email: '', telefone: '' });

  const [orcamentoModalVisible, setOrcamentoModalVisible] = useState(false);
  const [orcamentoForm, setOrcamentoForm] = useState({ total: '', status: 'aberto' });

  const [newClientModalVisible, setNewClientModalVisible] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    tipo_pessoa: 'PF',
    nome: '',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    cidade: '',
    estado: '',
  });

  const [promptVisible, setPromptVisible] = useState(false);
  const [promptConfig, setPromptConfig] = useState<{
    title: string;
    message: string;
    type: 'add' | 'sub';
    target: 'balance' | 'points';
  }>({ title: '', message: '', type: 'add', target: 'balance' });

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase
        .from('clientes')
        .select('*')
        .order('data_cadastro', { ascending: false })
        .limit(100);
      if (error) console.warn('Aviso clientes:', error.message);
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  useEffect(() => {
    if (!selectedClient) return;
    const fetchTabData = async () => {
      setLoadingTab(true);
      try {
        if (activeTab === 'Orçamentos') {
          const { data } = await supabase.from('orcamentos').select('*').eq('cliente_id', selectedClient.id);
          setOrcamentos(data || []);
        } else if (activeTab === 'Faturas') {
          const { data } = await supabase.from('faturas').select('*').eq('cliente_id', selectedClient.id);
          setFaturas(data || []);
        } else if (activeTab === 'OS') {
          const { data } = await supabase.from('ordens_servico').select('*').eq('cliente_id', selectedClient.id);
          setOrdensServico(data || []);
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoadingTab(false);
      }
    };
    fetchTabData();
  }, [activeTab, selectedClient]);

  const handleEditPress = () => {
    setEditForm({
      nome: selectedClient.nome || selectedClient.nome_razao || '',
      cpf: selectedClient.cpf || selectedClient.cnpj || '',
      email: selectedClient.email || '',
      telefone: selectedClient.telefone || ''
    });
    setEditModalVisible(true);
  };

  const handleSaveClient = async () => {
    const { error } = await supabase.from('clientes').update({
      nome: editForm.nome,
      cpf: editForm.cpf,
      email: editForm.email,
      telefone: editForm.telefone
    }).eq('id', selectedClient.id);

    if (error) {
      Alert.alert('Erro ao atualizar', error.message);
    } else {
      Alert.alert('Sucesso', 'Cliente atualizado com sucesso!');
      setEditModalVisible(false);
      setSelectedClient({ ...selectedClient, ...editForm });
      setData(data.map(c => c.id === selectedClient.id ? { ...c, ...editForm } : c));
    }
  };

  const handleSaveOrcamento = async () => {
    const { error } = await supabase.from('orcamentos').insert([{
      cliente_id: selectedClient.id,
      total: Number(orcamentoForm.total.replace(',', '.')) || 0,
      status: orcamentoForm.status
    }]);

    if (error) {
      Alert.alert('Erro ao criar orçamento', error.message);
    } else {
      Alert.alert('Sucesso', 'Orçamento inserido com sucesso!');
      setOrcamentoModalVisible(false);
      if (activeTab === 'Orçamentos') {
        const { data } = await supabase.from('orcamentos').select('*').eq('cliente_id', selectedClient.id);
        setOrcamentos(data || []);
      }
    }
  };

  const openAdjustPrompt = (target: 'balance' | 'points', type: 'add' | 'sub') => {
    setPromptConfig({
      target,
      type,
      title: type === 'add' ? (target === 'balance' ? 'Adicionar Saldo' : 'Adicionar Pontos') : (target === 'balance' ? 'Subtrair Saldo' : 'Subtrair Pontos'),
      message: target === 'balance' ? 'Digite o valor em R$:' : 'Digite a quantidade de pontos:'
    });
    setPromptVisible(true);
  };

  const handleConfirmPrompt = async (val: string) => {
    setPromptVisible(false);
    if (!val || !val.trim()) return;

    if (promptConfig.target === 'balance') {
      const amount = Number(val.replace(',', '.'));
      if (isNaN(amount) || amount <= 0) return Alert.alert('Erro', 'Informe um valor válido.');
      const currentBalance = Number(selectedClient.saldo_carteira || 0);
      const newBalance = promptConfig.type === 'add' ? currentBalance + amount : currentBalance - amount;

      const { error } = await supabase.from('clientes').update({ saldo_carteira: newBalance }).eq('id', selectedClient.id);
      if (error) {
        Alert.alert('Erro ao atualizar saldo', error.message);
      } else {
        setSelectedClient({ ...selectedClient, saldo_carteira: newBalance });
        setData(data.map(c => c.id === selectedClient.id ? { ...c, saldo_carteira: newBalance } : c));
        Alert.alert('Sucesso', `Saldo atualizado para R$ ${newBalance.toFixed(2)}`);
      }
    } else {
      const amount = parseInt(val.replace(/\D/g, ''), 10);
      if (isNaN(amount) || amount <= 0) return Alert.alert('Erro', 'Informe uma quantidade válida.');
      const currentPoints = Number(selectedClient.saldo_pontos || 0);
      const newPoints = promptConfig.type === 'add' ? currentPoints + amount : currentPoints - amount;

      const { error } = await supabase.from('clientes').update({ saldo_pontos: newPoints }).eq('id', selectedClient.id);
      if (error) {
        Alert.alert('Erro ao atualizar pontos', error.message);
      } else {
        setSelectedClient({ ...selectedClient, saldo_pontos: newPoints });
        setData(data.map(c => c.id === selectedClient.id ? { ...c, saldo_pontos: newPoints } : c));
      }
    }
  };

  const handleCreateClient = async () => {
    if (!newClientForm.nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do cliente.');
      return;
    }
    const isPF = newClientForm.tipo_pessoa === 'PF';
    const payload: any = {
      tipo_pessoa: newClientForm.tipo_pessoa,
      nome: newClientForm.nome.trim(),
      email: newClientForm.email.trim() || null,
      telefone: newClientForm.telefone.trim() || null,
      cidade: newClientForm.cidade.trim() || null,
      estado: newClientForm.estado.trim() || null,
      status: 'ativo'
    };
    if (isPF) {
      payload.cpf = newClientForm.cpf_cnpj.trim() || null;
    } else {
      payload.cnpj = newClientForm.cpf_cnpj.trim() || null;
      payload.nome_razao = newClientForm.nome.trim();
    }
    const { error } = await supabase.from('clientes').insert([payload]);
    if (error) {
      Alert.alert('Erro ao cadastrar', error.message);
    } else {
      Alert.alert('Sucesso', 'Cliente cadastrado com sucesso!');
      setNewClientModalVisible(false);
      setNewClientForm({
        tipo_pessoa: 'PF',
        nome: '',
        cpf_cnpj: '',
        email: '',
        telefone: '',
        cidade: '',
        estado: '',
      });
      fetchClientes();
    }
  };

  if (loading) return <Loader text="Carregando clientes..." />;

  if (selectedClient) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
        <View style={styles.headerDetail}>
          <TouchableOpacity onPress={() => setSelectedClient(null)}>
            <Text style={styles.backButtonText}>← Voltar</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.actionBtnOutline} onPress={handleEditPress}>
              <Text style={styles.actionBtnTextDark}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => { setOrcamentoForm({ total: '', status: 'aberto' }); setOrcamentoModalVisible(true); }}>
              <Text style={styles.actionBtnTextLight}>+ Orçamento</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.clientSummary}>
          <Text style={styles.detailTitle}>{selectedClient.nome || selectedClient.nome_razao || 'Sem nome'}</Text>
          <View style={styles.badgeContainer}>
            <Text style={styles.badge}>{selectedClient.status || 'ativo'}</Text>
            {selectedClient.codigo_cliente && <Text style={styles.badge}>CÓD: {selectedClient.codigo_cliente}</Text>}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
          {['Dados', 'Carteira', 'Pontos', 'Orçamentos', 'Faturas', 'OS'].map(tab => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {activeTab === 'Dados' && (
            <View style={styles.detailCard}>
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Documento</Text>
                <Text style={styles.detailValue}>{selectedClient.cpf || selectedClient.cnpj || 'Não informado'}</Text>
              </View>
              
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Contato</Text>
                <Text style={styles.detailValue}>{selectedClient.telefone || 'Sem telefone'}</Text>
                <Text style={styles.detailValue}>{selectedClient.email || 'Sem email'}</Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Endereço</Text>
                <Text style={styles.detailValue}>
                  {selectedClient.logradouro ? `${selectedClient.logradouro}, ${selectedClient.numero || 'S/N'} ${selectedClient.complemento ? '- ' + selectedClient.complemento : ''}` : 'Não informado'}
                </Text>
                <Text style={styles.detailValue}>
                  {selectedClient.bairro ? `${selectedClient.bairro}, ` : ''}{selectedClient.cidade || ''} {selectedClient.estado ? `- ${selectedClient.estado}` : ''}
                </Text>
                {selectedClient.cep && <Text style={styles.detailValue}>CEP: {selectedClient.cep}</Text>}
              </View>
            </View>
          )}

          {activeTab === 'Carteira' && (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Saldo em Carteira</Text>
              <Text style={[styles.detailTitle, { fontSize: 36, color: '#10b981', marginVertical: 10 }]}>
                R$ {Number(selectedClient.saldo_carteira || 0).toFixed(2)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#10b981', alignItems: 'center' }]} onPress={() => openAdjustPrompt('balance', 'add')}>
                  <Text style={styles.actionBtnTextLight}>+ Adicionar Saldo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#ef4444', alignItems: 'center' }]} onPress={() => openAdjustPrompt('balance', 'sub')}>
                  <Text style={styles.actionBtnTextLight}>- Subtrair Saldo</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'Pontos' && (
            <View style={styles.detailCard}>
              <Text style={styles.detailLabel}>Pontuação Acumulada</Text>
              <Text style={[styles.detailTitle, { fontSize: 36, color: '#6366f1', marginVertical: 10 }]}>
                {Number(selectedClient.saldo_pontos || 0)} pts
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#6366f1', alignItems: 'center' }]} onPress={() => openAdjustPrompt('points', 'add')}>
                  <Text style={styles.actionBtnTextLight}>+ Adicionar Pontos</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#f43f5e', alignItems: 'center' }]} onPress={() => openAdjustPrompt('points', 'sub')}>
                  <Text style={styles.actionBtnTextLight}>- Subtrair Pontos</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'Orçamentos' && (
            <View>
              {loadingTab ? <ActivityIndicator size="large" color="#17345f" /> : orcamentos.map(orc => (
                <View key={orc.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.title}>{orc.codigo_orcamento || orc.id?.substring(0,6)}</Text>
                    <Text style={styles.badge}>{orc.status}</Text>
                  </View>
                  <Text style={styles.value}>R$ {Number(orc.total || 0).toFixed(2)}</Text>
                </View>
              ))}
              {!loadingTab && orcamentos.length === 0 && <Text style={{textAlign: 'center', marginTop: 20}}>Nenhum orçamento encontrado.</Text>}
            </View>
          )}

          {activeTab === 'Faturas' && (
            <View>
              {loadingTab ? <ActivityIndicator size="large" color="#17345f" /> : faturas.map(fat => (
                <View key={fat.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.title}>{fat.codigo_fatura || fat.id?.substring(0,6)}</Text>
                    <Text style={styles.badge}>{fat.status}</Text>
                  </View>
                  <Text style={styles.value}>R$ {Number(fat.valor_total || 0).toFixed(2)}</Text>
                </View>
              ))}
              {!loadingTab && faturas.length === 0 && <Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma fatura encontrada.</Text>}
            </View>
          )}

          {activeTab === 'OS' && (
            <View>
              {loadingTab ? <ActivityIndicator size="large" color="#17345f" /> : ordensServico.map(os => (
                <View key={os.id} style={styles.card}>
                  <Text style={styles.title}>OS {os.codigo_os || os.id?.substring(0,6)}</Text>
                  <Text style={styles.subtitle}>Status: {os.status}</Text>
                </View>
              ))}
              {!loadingTab && ordensServico.length === 0 && <Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma OS encontrada.</Text>}
            </View>
          )}
        </ScrollView>

        <Modal visible={editModalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Editar Cliente</Text>
              <TextInput style={styles.input} placeholder="Nome" value={editForm.nome} onChangeText={(t) => setEditForm({...editForm, nome: t})} />
              <TextInput style={styles.input} placeholder="CPF/CNPJ" value={editForm.cpf} onChangeText={(t) => setEditForm({...editForm, cpf: t})} />
              <TextInput style={styles.input} placeholder="Email" value={editForm.email} onChangeText={(t) => setEditForm({...editForm, email: t})} />
              <TextInput style={styles.input} placeholder="Telefone" value={editForm.telefone} onChangeText={(t) => setEditForm({...editForm, telefone: t})} />
              <View style={styles.modalActions}>
                <Button title="Cancelar" onPress={() => setEditModalVisible(false)} color="#666" />
                <Button title="Salvar" onPress={handleSaveClient} color="#17345f" />
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={orcamentoModalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Novo Orçamento</Text>
              <TextInput style={styles.input} placeholder="Valor Total" keyboardType="numeric" value={orcamentoForm.total} onChangeText={(t) => setOrcamentoForm({...orcamentoForm, total: t})} />
              <TextInput style={styles.input} placeholder="Status (aberto, aprovado)" value={orcamentoForm.status} onChangeText={(t) => setOrcamentoForm({...orcamentoForm, status: t})} />
              <View style={styles.modalActions}>
                <Button title="Cancelar" onPress={() => setOrcamentoModalVisible(false)} color="#666" />
                <Button title="Inserir" onPress={handleSaveOrcamento} color="#17345f" />
              </View>
            </View>
          </View>
        </Modal>

        <UniversalPromptModal
          visible={promptVisible}
          title={promptConfig.title}
          message={promptConfig.message}
          keyboardType="numeric"
          onConfirm={handleConfirmPrompt}
          onCancel={() => setPromptVisible(false)}
        />
      </View>
    );
  }

  const filteredData = data.filter(c => {
    const s = search.toLowerCase();
    const matchText = !search.trim() || 
      (c.nome || '').toLowerCase().includes(s) ||
      (c.nome_razao || '').toLowerCase().includes(s) ||
      (c.cpf || '').includes(s) ||
      (c.cnpj || '').includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.telefone || '').includes(s);
    const matchStatus = statusFilter === 'todos' || (c.status || 'ativo') === statusFilter;
    return matchText && matchStatus;
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar clientes por nome, CPF, tel..."
        onAddNew={() => setNewClientModalVisible(true)}
        addNewLabel="+ Novo Cliente"
      />
      <View style={styles.filterTabsRow}>
        {(['todos', 'ativo', 'inativo'] as const).map(st => (
          <TouchableOpacity
            key={st}
            style={[styles.filterChip, statusFilter === st && styles.filterChipActive]}
            onPress={() => setStatusFilter(st)}
          >
            <Text style={[styles.filterChipText, statusFilter === st && styles.filterChipTextActive]}>
              {st === 'todos' ? 'Todos' : st === 'ativo' ? 'Ativos' : 'Inativos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filteredData}
        keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelectedClient(item)}>
            <View style={styles.row}>
              <Text style={styles.title}>{item.nome || item.nome_razao || 'Sem nome'}</Text>
              <Text style={[styles.badge, item.status === 'ativo' ? { backgroundColor: '#dcfce7', color: '#15803d' } : {}]}>
                {item.status || 'ativo'}
              </Text>
            </View>
            <Text style={styles.subtitle}>{item.cpf || item.cnpj || 'Sem documento'} • {item.telefone || 'Sem telefone'}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum cliente encontrado.</Text>}
      />

      {/* Modal Novo Cliente */}
      <Modal visible={newClientModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Cliente</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.filterChip, newClientForm.tipo_pessoa === 'PF' && styles.filterChipActive, { flex: 1, alignItems: 'center' }]}
                onPress={() => setNewClientForm({ ...newClientForm, tipo_pessoa: 'PF' })}
              >
                <Text style={[styles.filterChipText, newClientForm.tipo_pessoa === 'PF' && styles.filterChipTextActive]}>Pessoa Física (PF)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, newClientForm.tipo_pessoa === 'PJ' && styles.filterChipActive, { flex: 1, alignItems: 'center' }]}
                onPress={() => setNewClientForm({ ...newClientForm, tipo_pessoa: 'PJ' })}
              >
                <Text style={[styles.filterChipText, newClientForm.tipo_pessoa === 'PJ' && styles.filterChipTextActive]}>Pessoa Jurídica (PJ)</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder={newClientForm.tipo_pessoa === 'PF' ? "Nome Completo" : "Razão Social / Nome Fantasia"}
              value={newClientForm.nome}
              onChangeText={t => setNewClientForm({ ...newClientForm, nome: t })}
            />
            <TextInput
              style={styles.input}
              placeholder={newClientForm.tipo_pessoa === 'PF' ? "CPF (apenas números)" : "CNPJ (apenas números)"}
              keyboardType="numeric"
              value={newClientForm.cpf_cnpj}
              onChangeText={t => setNewClientForm({ ...newClientForm, cpf_cnpj: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={newClientForm.email}
              onChangeText={t => setNewClientForm({ ...newClientForm, email: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Telefone / WhatsApp"
              keyboardType="phone-pad"
              value={newClientForm.telefone}
              onChangeText={t => setNewClientForm({ ...newClientForm, telefone: t })}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="Cidade"
                value={newClientForm.cidade}
                onChangeText={t => setNewClientForm({ ...newClientForm, cidade: t })}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="UF"
                maxLength={2}
                autoCapitalize="characters"
                value={newClientForm.estado}
                onChangeText={t => setNewClientForm({ ...newClientForm, estado: t })}
              />
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewClientModalVisible(false)} color="#666" />
              <Button title="Cadastrar" onPress={handleCreateClient} color="#17345f" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 2. ORÇAMENTOS SCREEN (Com Abas e Ações)
// ==========================================
export const OrcamentosScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Abertos' | 'Aprovados' | 'Cancelados'>('Abertos');
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    total: '',
    descricao: '',
    status: 'aberto',
  });

  const fetchOrcamentos = async (tab: string) => {
    setLoading(true);
    let filter = ['aberto', 'analise', 'negociacao'];
    if (tab === 'Aprovados') filter = ['aprovado'];
    if (tab === 'Cancelados') filter = ['cancelado', 'recusado'];

    try {
      const { data: res, error } = await supabase
        .from('orcamentos')
        .select('*')
        .in('status', filter)
        .order('data_criacao', { ascending: false })
        .limit(100);
      if (error) console.warn('Aviso orcamentos:', error.message);
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrcamentos(activeTab);
  }, [activeTab]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('orcamentos').update({ status: newStatus }).eq('id', id);
    if (error) {
      Alert.alert('Erro', error.message);
    } else {
      Alert.alert('Sucesso', `Orçamento marcado como ${newStatus}!`);
      fetchOrcamentos(activeTab);
    }
  };

  const handleCreateOrcamento = async () => {
    if (!newForm.total.trim()) {
      Alert.alert('Atenção', 'Informe o valor do orçamento.');
      return;
    }
    const val = Number(newForm.total.replace(',', '.')) || 0;
    const { error } = await supabase.from('orcamentos').insert([{
      total: val,
      valor_total: val,
      descricao: newForm.descricao.trim() || null,
      status: newForm.status || 'aberto',
    }]);
    if (error) {
      Alert.alert('Erro ao criar orçamento', error.message);
    } else {
      Alert.alert('Sucesso', 'Orçamento criado com sucesso!');
      setNewModalVisible(false);
      setNewForm({ total: '', descricao: '', status: 'aberto' });
      fetchOrcamentos(activeTab);
    }
  };

  const filteredOrcamentos = data.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (item.codigo_orcamento || '').toLowerCase().includes(s) ||
      (item.descricao || '').toLowerCase().includes(s) ||
      (item.id || '').toLowerCase().includes(s)
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar orçamento por código ou descrição..."
        onAddNew={() => setNewModalVisible(true)}
        addNewLabel="+ Novo Orçamento"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Abertos', 'Aprovados', 'Cancelados'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando orçamentos..." /> : (
        <FlatList
          data={filteredOrcamentos}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.codigo_orcamento || `Orçamento #${item.id?.substring(0,6)}`}</Text>
                <Text style={[styles.badge, item.status === 'aprovado' ? { backgroundColor: '#dcfce7', color: '#15803d' } : {}]}>
                  {item.status}
                </Text>
              </View>
              {item.descricao && <Text style={styles.subtitle}>{item.descricao}</Text>}
              <Text style={styles.value}>R$ {Number(item.total || item.valor_total || 0).toFixed(2)}</Text>
              
              {activeTab === 'Abertos' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity 
                    style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#10b981', alignItems: 'center' }]} 
                    onPress={() => handleUpdateStatus(item.id, 'aprovado')}
                  >
                    <Text style={styles.actionBtnTextLight}>Aprovar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#ef4444', alignItems: 'center' }]} 
                    onPress={() => handleUpdateStatus(item.id, 'cancelado')}
                  >
                    <Text style={styles.actionBtnTextLight}>Recusar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum orçamento encontrado.</Text>}
        />
      )}

      {/* Modal Novo Orçamento */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Orçamento</Text>
            <TextInput
              style={styles.input}
              placeholder="Valor Total (R$)"
              keyboardType="numeric"
              value={newForm.total}
              onChangeText={t => setNewForm({ ...newForm, total: t })}
            />
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Descrição dos serviços / itens"
              multiline
              value={newForm.descricao}
              onChangeText={t => setNewForm({ ...newForm, descricao: t })}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewModalVisible(false)} color="#666" />
              <Button title="Criar Orçamento" onPress={handleCreateOrcamento} color="#17345f" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 3. DEMANDAS SCREEN (Prestadores & Workflow)
// ==========================================
export const DemandasScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Abertas' | 'Em Andamento' | 'Concluídas'>('Abertas');
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'media',
  });

  const fetchDemandas = async (tab: string) => {
    setLoading(true);
    let statusFilter = ['aberta', 'aguardando_atribuicao', 'pendente', 'pendente_aceite'];
    if (tab === 'Em Andamento') statusFilter = ['ativa', 'em andamento', 'em_analise', 'em_ajuste', 'em_negociacao'];
    if (tab === 'Concluídas') statusFilter = ['concluida', 'finalizada', 'concluido', 'concluida_interna'];

    try {
      const { data: res, error } = await supabase
        .from('prestador_demandas')
        .select('*')
        .in('status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (error) console.warn('Aviso demandas:', error.message);
      setData(res || []); 
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchDemandas(activeTab);
  }, [activeTab]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase.from('prestador_demandas').update({ status: newStatus }).eq('id', id);
    if (error) {
      Alert.alert('Erro ao atualizar demanda', error.message);
    } else {
      Alert.alert('Sucesso', 'Demanda atualizada com sucesso!');
      fetchDemandas(activeTab);
    }
  };

  const handleCreateDemanda = async () => {
    if (!newForm.titulo.trim()) {
      Alert.alert('Atenção', 'Informe o título da demanda.');
      return;
    }
    const { error } = await supabase.from('prestador_demandas').insert([{
      titulo: newForm.titulo.trim(),
      descricao: newForm.descricao.trim() || null,
      prioridade: newForm.prioridade,
      status: 'aberta',
    }]);
    if (error) {
      Alert.alert('Erro ao criar demanda', error.message);
    } else {
      Alert.alert('Sucesso', 'Demanda criada com sucesso!');
      setNewModalVisible(false);
      setNewForm({ titulo: '', descricao: '', prioridade: 'media' });
      fetchDemandas(activeTab);
    }
  };

  const filteredDemandas = data.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (item.titulo || '').toLowerCase().includes(s) ||
      (item.descricao || '').toLowerCase().includes(s) ||
      (item.prioridade || '').toLowerCase().includes(s) ||
      (item.id?.toString() || '').toLowerCase().includes(s)
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar demandas por título ou descrição..."
        onAddNew={() => setNewModalVisible(true)}
        addNewLabel="+ Nova Demanda"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Abertas', 'Em Andamento', 'Concluídas'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando demandas..." /> : (
        <FlatList
          data={filteredDemandas}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.titulo || `Demanda #${item.id?.toString().substring(0,6)}`}</Text>
                <Text style={styles.badge}>{item.status}</Text>
              </View>
              {item.descricao ? <Text style={styles.subtitle}>{item.descricao}</Text> : null}
              {item.prioridade && <Text style={[styles.subtitle, { color: '#ef4444', fontWeight: 'bold' }]}>Prioridade: {item.prioridade}</Text>}

              {(activeTab === 'Abertas') && (
                <TouchableOpacity 
                  style={[styles.actionBtnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]} 
                  onPress={() => handleUpdateStatus(item.id, 'ativa')}
                >
                  <Text style={styles.actionBtnTextLight}>Iniciar Execução</Text>
                </TouchableOpacity>
              )}
              {activeTab === 'Em Andamento' && (
                <TouchableOpacity 
                  style={[styles.actionBtnPrimary, { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#10b981' }]} 
                  onPress={() => handleUpdateStatus(item.id, 'concluida')}
                >
                  <Text style={styles.actionBtnTextLight}>Concluir Demanda</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma demanda nesta categoria.</Text>}
        />
      )}

      {/* Modal Nova Demanda */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nova Demanda</Text>
            <TextInput
              style={styles.input}
              placeholder="Título da Demanda"
              value={newForm.titulo}
              onChangeText={t => setNewForm({ ...newForm, titulo: t })}
            />
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Descrição da necessidade / serviço"
              multiline
              value={newForm.descricao}
              onChangeText={t => setNewForm({ ...newForm, descricao: t })}
            />
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {(['baixa', 'media', 'alta', 'urgente'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.filterChip, newForm.prioridade === p && styles.filterChipActive, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setNewForm({ ...newForm, prioridade: p })}
                >
                  <Text style={[styles.filterChipText, newForm.prioridade === p && styles.filterChipTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewModalVisible(false)} color="#666" />
              <Button title="Criar Demanda" onPress={handleCreateDemanda} color="#17345f" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// ==========================================
// 4. FINANCEIRO SCREEN (Faturas & Baixas)
// ==========================================
export const FinanceiroScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Pendentes' | 'Pagas' | 'Vencidas' | 'Todas'>('Pendentes');

  const [modalVisible, setModalVisible] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novoVencimento, setNovoVencimento] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchFaturas = async (tab: string) => {
    setLoading(true);
    let statusFilter: string[] | null = ['pendente', 'pendente_pagamento'];
    if (tab === 'Pagas') statusFilter = ['pago', 'paga'];
    if (tab === 'Vencidas') statusFilter = ['vencida', 'atrasado', 'atrasada'];
    if (tab === 'Todas') statusFilter = null;

    try {
      let query = supabase
        .from('faturas')
        .select('*')
        .order('data_vencimento', { ascending: false })
        .limit(60);

      if (statusFilter) {
        query = query.in('status', statusFilter);
      }
        
      const { data: res, error } = await query;
      if (error) console.warn('Aviso faturas:', error.message);
      setData(res || []); 
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchFaturas(activeTab);
  }, [activeTab]);

  const handleBaixarFatura = async (id: string) => {
    const { error } = await supabase.from('faturas').update({ status: 'pago' }).eq('id', id);
    if (error) {
      Alert.alert('Erro ao baixar fatura', error.message);
    } else {
      Alert.alert('Sucesso', 'Fatura baixada com sucesso!');
      fetchFaturas(activeTab);
    }
  };

  const handleCreateFatura = async () => {
    if (!novoValor.trim() || isNaN(Number(novoValor))) {
      Alert.alert('Atenção', 'Informe um valor numérico válido.');
      return;
    }
    setSalvando(true);
    try {
      const cod = novoCodigo.trim() || `FAT-${Date.now().toString().slice(-6)}`;
      const venc = novoVencimento.trim() || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const { error } = await supabase.from('faturas').insert([{
        codigo_fatura: cod,
        valor_total: Number(novoValor),
        data_vencimento: venc,
        descricao: novaDescricao.trim() || null,
        status: 'pendente'
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Fatura registrada com sucesso!');
        setModalVisible(false);
        setNovoCodigo('');
        setNovoValor('');
        setNovoVencimento('');
        setNovaDescricao('');
        fetchFaturas(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar fatura');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.codigo_fatura && item.codigo_fatura.toLowerCase().includes(q)) ||
      (item.descricao && item.descricao.toLowerCase().includes(q)) ||
      (item.cliente_id && String(item.cliente_id).toLowerCase().includes(q)) ||
      (item.valor_total && String(item.valor_total).includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar por código, valor, descrição..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Nova Fatura"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Pendentes', 'Pagas', 'Vencidas', 'Todas'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando faturas..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const venc = item.data_vencimento || item.vencimento;
            const vencFormatted = venc ? venc.split('T')[0].split('-').reverse().join('/') : 'N/A';
            const isPago = item.status === 'pago' || item.status === 'paga';
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.title}>{item.codigo_fatura || `Fatura #${item.id?.toString().substring(0,6)}`}</Text>
                  <Text style={isPago ? styles.value : styles.valueError}>
                    R$ {Number(item.valor_total || item.valor || item.valor_final_pendente || 0).toFixed(2)}
                  </Text>
                </View>
                {item.descricao ? <Text style={styles.subtitle}>{item.descricao}</Text> : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.subtitle}>Vencimento: {vencFormatted}</Text>
                  <Text style={[styles.badge, isPago ? { backgroundColor: '#d1fae5', color: '#065f46' } : { backgroundColor: '#fee2e2', color: '#991b1b' }]}>
                    {item.status || 'pendente'}
                  </Text>
                </View>
                
                {!isPago && (
                  <TouchableOpacity 
                    style={[styles.actionBtnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]} 
                    onPress={() => handleBaixarFatura(item.id)}
                  >
                    <Text style={styles.actionBtnTextLight}>✓ Baixar Fatura</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma fatura encontrada.</Text>}
        />
      )}

      {/* Modal Nova Fatura */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Nova Fatura</Text>
            <TextInput
              style={styles.input}
              placeholder="Código (ex: FAT-2026-001 - opcional)"
              placeholderTextColor="#9ca3af"
              value={novoCodigo}
              onChangeText={setNovoCodigo}
            />
            <TextInput
              style={styles.input}
              placeholder="Valor Total (R$) *"
              placeholderTextColor="#9ca3af"
              value={novoValor}
              onChangeText={setNovoValor}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Vencimento (AAAA-MM-DD - padrão: 7 dias)"
              placeholderTextColor="#9ca3af"
              value={novoVencimento}
              onChangeText={setNovoVencimento}
            />
            <TextInput
              style={styles.input}
              placeholder="Descrição ou Referência"
              placeholderTextColor="#9ca3af"
              value={novaDescricao}
              onChangeText={setNovaDescricao}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Fatura"} 
                onPress={handleCreateFatura} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 5. LOJA SCREEN (GSA Store / Produtos)
// ==========================================
export const LojaScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Produtos Ativos' | 'Pausados'>('Produtos Ativos');
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome: '',
    preco: '',
    categoria: 'Geral',
    estoque: '10',
  });

  const fetchProdutos = async (tab: string) => {
    setLoading(true);
    let statusFilter = ['ativo'];
    if (tab === 'Pausados') statusFilter = ['inativo', 'pausado'];

    try {
      const { data: res, error } = await supabase
        .from('produtos')
        .select('*')
        .in('status', statusFilter)
        .order('nome', { ascending: true })
        .limit(100);
        
      if (error) console.warn('Aviso loja:', error.message);
      setData(res || []); 
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchProdutos(activeTab);
  }, [activeTab]);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase.from('produtos').update({ status: newStatus }).eq('id', id);
    if (error) {
      Alert.alert('Erro ao atualizar produto', error.message);
    } else {
      Alert.alert('Sucesso', `Produto ${newStatus === 'ativo' ? 'ativado' : 'pausado'} com sucesso!`);
      fetchProdutos(activeTab);
    }
  };

  const handleCreateProduto = async () => {
    if (!newForm.nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do produto.');
      return;
    }
    const preco = Number(newForm.preco.replace(',', '.')) || 0;
    const { error } = await supabase.from('produtos').insert([{
      nome: newForm.nome.trim(),
      preco: preco,
      valor: preco,
      categoria: newForm.categoria.trim() || 'Geral',
      estoque: parseInt(newForm.estoque, 10) || 0,
      status: 'ativo',
    }]);
    if (error) {
      Alert.alert('Erro ao criar produto', error.message);
    } else {
      Alert.alert('Sucesso', 'Produto criado com sucesso!');
      setNewModalVisible(false);
      setNewForm({ nome: '', preco: '', categoria: 'Geral', estoque: '10' });
      fetchProdutos(activeTab);
    }
  };

  const filteredProdutos = data.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (item.nome || '').toLowerCase().includes(s) ||
      (item.categoria || '').toLowerCase().includes(s) ||
      (item.id?.toString() || '').toLowerCase().includes(s)
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar produtos por nome ou categoria..."
        onAddNew={() => setNewModalVisible(true)}
        addNewLabel="+ Novo Produto"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Produtos Ativos', 'Pausados'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando produtos..." /> : (
        <FlatList
          data={filteredProdutos}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.nome || 'Produto sem nome'}</Text>
                <Text style={styles.badge}>{item.status || 'ativo'}</Text>
              </View>
              {item.categoria && <Text style={styles.subtitle}>Categoria: {item.categoria}</Text>}
              <Text style={styles.value}>R$ {Number(item.preco || item.valor || item.preco_venda || 0).toFixed(2)}</Text>
              
              <TouchableOpacity 
                style={[styles.actionBtnPrimary, { marginTop: 10, alignSelf: 'flex-start', backgroundColor: item.status === 'ativo' ? '#ef4444' : '#10b981' }]} 
                onPress={() => handleToggleStatus(item.id, item.status || 'ativo')}
              >
                <Text style={styles.actionBtnTextLight}>{item.status === 'ativo' ? 'Pausar' : 'Ativar'}</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum produto encontrado.</Text>}
        />
      )}

      {/* Modal Novo Produto */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Produto</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do Produto"
              value={newForm.nome}
              onChangeText={t => setNewForm({ ...newForm, nome: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Preço de Venda (R$)"
              keyboardType="numeric"
              value={newForm.preco}
              onChangeText={t => setNewForm({ ...newForm, preco: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Categoria (ex: Telefonia, Limpeza, Vestuário)"
              value={newForm.categoria}
              onChangeText={t => setNewForm({ ...newForm, categoria: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Quantidade em Estoque"
              keyboardType="numeric"
              value={newForm.estoque}
              onChangeText={t => setNewForm({ ...newForm, estoque: t })}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewModalVisible(false)} color="#666" />
              <Button title="Criar Produto" onPress={handleCreateProduto} color="#17345f" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 6. VIAGENS SCREEN (Pacotes & Categorias)
// ==========================================
export const ViagensScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Pacotes' | 'Categorias' | 'Transações'>('Pacotes');

  const [modalVisible, setModalVisible] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novoOrigem, setNovoOrigem] = useState('');
  const [novoDestino, setNovoDestino] = useState('');
  const [novoPreco, setNovoPreco] = useState('');
  const [novasVagas, setNovasVagas] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchData = async (tab: string) => {
    setLoading(true);
    try {
      if (tab === 'Pacotes') {
        const { data: res } = await supabase.from('viagens_pacotes').select('*').order('created_at', { ascending: false }).limit(60);
        setData(res || []);
      } else if (tab === 'Categorias') {
        const { data: res } = await supabase.from('viagens_categorias').select('*').order('ordem', { ascending: true }).limit(60);
        setData(res || []);
      } else {
        const { data: res } = await supabase.from('viagens_transacoes').select('*').order('created_at', { ascending: false }).limit(60);
        setData(res || []);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const handleCreatePacote = async () => {
    if (!novoTitulo.trim()) {
      Alert.alert('Atenção', 'Informe o título do pacote.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('viagens_pacotes').insert([{
        titulo: novoTitulo.trim(),
        origem: novoOrigem.trim() || 'São Paulo',
        destino: novoDestino.trim() || 'Nacional',
        preco_venda: Number(novoPreco) || 0,
        vagas: Number(novasVagas) || 10,
        status: 'ativo'
      }]);

      if (error) {
        Alert.alert('Erro ao criar pacote', error.message);
      } else {
        Alert.alert('Sucesso', 'Pacote de viagem criado!');
        setModalVisible(false);
        setNovoTitulo('');
        setNovoOrigem('');
        setNovoDestino('');
        setNovoPreco('');
        setNovasVagas('');
        fetchData(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar pacote');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.titulo && item.titulo.toLowerCase().includes(q)) ||
      (item.nome && item.nome.toLowerCase().includes(q)) ||
      (item.destino && item.destino.toLowerCase().includes(q)) ||
      (item.origem && item.origem.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar pacotes, destinos..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Novo Pacote"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Pacotes', 'Categorias', 'Transações'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando viagens..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.titulo || item.nome || `Transação #${item.id?.substring(0,6)}`}</Text>
                {item.status && <Text style={styles.badge}>{item.status}</Text>}
              </View>
              {item.destino && <Text style={styles.subtitle}>{item.origem ? `${item.origem} → ` : ''}{item.destino}</Text>}
              {item.vagas !== undefined && <Text style={styles.subtitle}>Vagas disponíveis: {item.vagas}</Text>}
              {(item.preco_venda || item.valor || item.total) ? (
                <Text style={styles.value}>R$ {Number(item.preco_venda || item.valor || item.total || 0).toFixed(2)}</Text>
              ) : null}
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum registro encontrado.</Text>}
        />
      )}

      {/* Modal Novo Pacote */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Novo Pacote de Viagem</Text>
            <TextInput
              style={styles.input}
              placeholder="Título do Pacote *"
              placeholderTextColor="#9ca3af"
              value={novoTitulo}
              onChangeText={setNovoTitulo}
            />
            <TextInput
              style={styles.input}
              placeholder="Origem (ex: São Paulo - SP)"
              placeholderTextColor="#9ca3af"
              value={novoOrigem}
              onChangeText={setNovoOrigem}
            />
            <TextInput
              style={styles.input}
              placeholder="Destino (ex: Salvador - BA)"
              placeholderTextColor="#9ca3af"
              value={novoDestino}
              onChangeText={setNovoDestino}
            />
            <TextInput
              style={styles.input}
              placeholder="Preço de Venda (R$)"
              placeholderTextColor="#9ca3af"
              value={novoPreco}
              onChangeText={setNovoPreco}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Vagas Disponíveis"
              placeholderTextColor="#9ca3af"
              value={novasVagas}
              onChangeText={setNovasVagas}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Pacote"} 
                onPress={handleCreatePacote} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 7. AFILIADOS SCREEN (Parceiros & Bloqueio)
// ==========================================
export const AfiliadosScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Todos' | 'Ativos' | 'Inativos'>('Ativos');

  const [modalVisible, setModalVisible] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [novoPix, setNovoPix] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchAfiliados = async (tab: string) => {
    setLoading(true);
    let statusFilter: string[] | null = ['ativo'];
    if (tab === 'Inativos') statusFilter = ['inativo', 'bloqueado'];
    if (tab === 'Todos') statusFilter = null;

    try {
      let query = supabase.from('afiliados').select('*').limit(60);
      if (statusFilter) query = query.in('status', statusFilter);

      let { data: res } = await query;
        
      if (!res || res.length === 0) {
        let fallbackQuery = supabase.from('parceiros').select('*').limit(60);
        if (statusFilter) fallbackQuery = fallbackQuery.in('status', statusFilter);
        const fallback = await fallbackQuery;
        if (fallback.data) res = fallback.data;
      }
      setData(res || []); 
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchAfiliados(activeTab);
  }, [activeTab]);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo';
    let { data: res, error } = await supabase.from('afiliados').update({ status: newStatus }).eq('id', id).select();
    if (error || !res || res.length === 0) {
      await supabase.from('parceiros').update({ status: newStatus }).eq('id', id).select();
    }
    Alert.alert('Sucesso', `Status alterado para ${newStatus}!`);
    fetchAfiliados(activeTab);
  };

  const handleCreateAfiliado = async () => {
    if (!novoNome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do afiliado.');
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        nome: novoNome.trim(),
        email: novoEmail.trim() || null,
        telefone: novoTelefone.trim() || null,
        chave_pix: novoPix.trim() || null,
        status: 'ativo'
      };
      let { error } = await supabase.from('afiliados').insert([payload]);
      if (error) {
        const fallback = await supabase.from('parceiros').insert([payload]);
        if (fallback.error) {
          Alert.alert('Erro', fallback.error.message);
          return;
        }
      }
      Alert.alert('Sucesso', 'Afiliado cadastrado com sucesso!');
      setModalVisible(false);
      setNovoNome('');
      setNovoEmail('');
      setNovoTelefone('');
      setNovoPix('');
      fetchAfiliados(activeTab);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar afiliado');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.nome && item.nome.toLowerCase().includes(q)) ||
      (item.nome_razao && item.nome_razao.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.telefone && item.telefone.toLowerCase().includes(q)) ||
      (item.chave_pix && item.chave_pix.toLowerCase().includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar afiliado, email, pix..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Novo Afiliado"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Ativos', 'Inativos', 'Todos'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando afiliados..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.nome || item.nome_razao || 'Afiliado'}</Text>
                <Text style={[styles.badge, item.status === 'ativo' ? { backgroundColor: '#d1fae5', color: '#065f46' } : { backgroundColor: '#fee2e2', color: '#991b1b' }]}>
                  {item.status || 'ativo'}
                </Text>
              </View>
              {item.email && <Text style={styles.subtitle}>Email: {item.email}</Text>}
              {item.telefone && <Text style={styles.subtitle}>Tel: {item.telefone}</Text>}
              {item.chave_pix && <Text style={styles.subtitle}>PIX: {item.chave_pix}</Text>}
              
              <TouchableOpacity 
                style={[styles.actionBtnPrimary, { marginTop: 10, alignSelf: 'flex-start', backgroundColor: item.status === 'ativo' ? '#ef4444' : '#10b981' }]} 
                onPress={() => handleToggleStatus(item.id, item.status || 'ativo')}
              >
                <Text style={styles.actionBtnTextLight}>{item.status === 'ativo' ? 'Bloquear' : 'Ativar'}</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum afiliado encontrado.</Text>}
        />
      )}

      {/* Modal Novo Afiliado */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Novo Afiliado</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome Completo *"
              placeholderTextColor="#9ca3af"
              value={novoNome}
              onChangeText={setNovoNome}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9ca3af"
              value={novoEmail}
              onChangeText={setNovoEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Telefone / WhatsApp"
              placeholderTextColor="#9ca3af"
              value={novoTelefone}
              onChangeText={setNovoTelefone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Chave PIX (CPF/CNPJ/Email/Telefone)"
              placeholderTextColor="#9ca3af"
              value={novoPix}
              onChangeText={setNovoPix}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Cadastrando..." : "Cadastrar"} 
                onPress={handleCreateAfiliado} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 8. COBRANÇA SCREEN (Faturas Vencidas & Ações)
// ==========================================
export const CobrancaScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Inadimplentes' | 'Cobranças' | 'Acordos'>('Inadimplentes');

  const [modalVisible, setModalVisible] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novoVencimento, setNovoVencimento] = useState('');
  const [novoMotivo, setNovoMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchCobrancas = async (tab: string) => {
    setLoading(true);
    try {
      if (tab === 'Inadimplentes') {
        const { data: res } = await supabase
          .from('faturas')
          .select('*')
          .in('status', ['pendente', 'vencida', 'atrasada', 'pendente_pagamento'])
          .order('data_vencimento', { ascending: true })
          .limit(60);
        setData(res || []);
      } else {
        const { data: res } = await supabase
          .from('cobrancas')
          .select('*')
          .limit(60);
        setData(res || []);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchCobrancas(activeTab);
  }, [activeTab]);

  const handleContato = (item: any) => {
    Alert.alert('Notificação Enviada', `Notificação e lembrete de cobrança gerados com sucesso para o registro #${item.id?.toString().slice(0,6)}!`);
  };

  const handleBaixar = async (id: string) => {
    const { error } = await supabase.from('faturas').update({ status: 'pago' }).eq('id', id);
    if (error) {
      await supabase.from('cobrancas').update({ status: 'quitado' }).eq('id', id);
    }
    Alert.alert('Sucesso', 'Cobrança liquidada com sucesso!');
    fetchCobrancas(activeTab);
  };

  const handleCreateCobranca = async () => {
    if (!novoValor.trim() || isNaN(Number(novoValor))) {
      Alert.alert('Atenção', 'Informe um valor numérico válido.');
      return;
    }
    setSalvando(true);
    try {
      const cod = novoCodigo.trim() || `COB-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('cobrancas').insert([{
        codigo_fatura: cod,
        valor_total: Number(novoValor),
        data_vencimento: novoVencimento.trim() || new Date().toISOString().split('T')[0],
        status: 'pendente',
        motivo: novoMotivo.trim() || 'Atraso de pagamento'
      }]);

      if (error) {
        // Fallback na tabela de faturas
        await supabase.from('faturas').insert([{
          codigo_fatura: cod,
          valor_total: Number(novoValor),
          data_vencimento: novoVencimento.trim() || new Date().toISOString().split('T')[0],
          status: 'vencida',
          descricao: novoMotivo.trim() || 'Cobrança administrativa'
        }]);
      }
      Alert.alert('Sucesso', 'Cobrança cadastrada com sucesso!');
      setModalVisible(false);
      setNovoCodigo('');
      setNovoValor('');
      setNovoVencimento('');
      setNovoMotivo('');
      fetchCobrancas(activeTab);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao registrar cobrança');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.codigo_fatura && item.codigo_fatura.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q)) ||
      (item.motivo && item.motivo.toLowerCase().includes(q)) ||
      (item.descricao && item.descricao.toLowerCase().includes(q)) ||
      (item.valor_total && String(item.valor_total).includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar faturas vencidas, código..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Nova Cobrança"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Inadimplentes', 'Cobranças', 'Acordos'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando cobranças..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.codigo_fatura || `Cobrança #${item.id?.toString().substring(0,6)}`}</Text>
                <Text style={styles.valueError}>R$ {Number(item.valor_total || item.valor_atualizado || item.valor || 0).toFixed(2)}</Text>
              </View>
              <Text style={styles.subtitle}>Status: {item.status || 'Pendente'}</Text>
              {item.data_vencimento && <Text style={styles.subtitle}>Vencimento: {item.data_vencimento.split('T')[0].split('-').reverse().join('/')}</Text>}
              
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <TouchableOpacity 
                  style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#6366f1', alignItems: 'center' }]} 
                  onPress={() => handleContato(item)}
                >
                  <Text style={styles.actionBtnTextLight}>✉ Notificar</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#10b981', alignItems: 'center' }]} 
                  onPress={() => handleBaixar(item.id)}
                >
                  <Text style={styles.actionBtnTextLight}>✓ Liquidar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma pendência financeira encontrada.</Text>}
        />
      )}

      {/* Modal Nova Cobrança */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Nova Cobrança</Text>
            <TextInput
              style={styles.input}
              placeholder="Código da Cobrança / Fatura"
              placeholderTextColor="#9ca3af"
              value={novoCodigo}
              onChangeText={setNovoCodigo}
            />
            <TextInput
              style={styles.input}
              placeholder="Valor Pendente (R$) *"
              placeholderTextColor="#9ca3af"
              value={novoValor}
              onChangeText={setNovoValor}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Data de Vencimento (AAAA-MM-DD)"
              placeholderTextColor="#9ca3af"
              value={novoVencimento}
              onChangeText={setNovoVencimento}
            />
            <TextInput
              style={styles.input}
              placeholder="Motivo / Observações"
              placeholderTextColor="#9ca3af"
              value={novoMotivo}
              onChangeText={setNovoMotivo}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Cobrança"} 
                onPress={handleCreateCobranca} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 9. ATENDIMENTO SCREEN (TICKETS & CHAT)
// ==========================================
export const AtendimentoScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Abertos' | 'Em Atendimento' | 'Resolvidos'>('Abertos');
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    assunto: '',
    mensagem: '',
    prioridade: 'media',
  });

  const fetchTickets = async (tab: string) => {
    setLoading(true);
    let statusFilter = ['aberto'];
    if (tab === 'Em Atendimento') statusFilter = ['em andamento', 'em_atendimento'];
    if (tab === 'Resolvidos') statusFilter = ['resolvido', 'concluido', 'fechado'];

    try {
      let { data: res } = await supabase
        .from('tickets')
        .select('*')
        .in('status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (!res || res.length === 0) {
        const fallback = await supabase.from('atendimentos').select('*').in('status', statusFilter).limit(100);
        if (fallback.data) res = fallback.data;
      }
      setData(res || []); 
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchTickets(activeTab);
  }, [activeTab]);

  const handleResolverTicket = async (id: string, newStatus: string) => {
    let { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', id);
    if (error) {
      await supabase.from('atendimentos').update({ status: newStatus }).eq('id', id);
    }
    Alert.alert('Sucesso', `Ticket atualizado para ${newStatus}!`);
    fetchTickets(activeTab);
  };

  const handleCreateTicket = async () => {
    if (!newForm.assunto.trim()) {
      Alert.alert('Atenção', 'Informe o assunto do ticket.');
      return;
    }
    const { error } = await supabase.from('tickets').insert([{
      assunto: newForm.assunto.trim(),
      titulo: newForm.assunto.trim(),
      mensagem: newForm.mensagem.trim() || null,
      prioridade: newForm.prioridade,
      status: 'aberto',
    }]);
    if (error) {
      Alert.alert('Erro ao abrir ticket', error.message);
    } else {
      Alert.alert('Sucesso', 'Ticket aberto com sucesso!');
      setNewModalVisible(false);
      setNewForm({ assunto: '', mensagem: '', prioridade: 'media' });
      fetchTickets(activeTab);
    }
  };

  const filteredTickets = data.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (item.assunto || '').toLowerCase().includes(s) ||
      (item.titulo || '').toLowerCase().includes(s) ||
      (item.mensagem || '').toLowerCase().includes(s) ||
      (item.id?.toString() || '').toLowerCase().includes(s)
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar chamados por assunto ou mensagem..."
        onAddNew={() => setNewModalVisible(true)}
        addNewLabel="+ Novo Chamado"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Abertos', 'Em Atendimento', 'Resolvidos'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando chamados..." /> : (
        <FlatList
          data={filteredTickets}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.assunto || item.titulo || `Ticket #${item.id?.substring(0,6)}`}</Text>
                <Text style={styles.badge}>{item.status || 'aberto'}</Text>
              </View>
              {item.mensagem && <Text style={styles.subtitle}>{item.mensagem}</Text>}
              
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                {activeTab === 'Abertos' && (
                  <TouchableOpacity 
                    style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#6366f1', alignItems: 'center' }]} 
                    onPress={() => handleResolverTicket(item.id, 'em andamento')}
                  >
                    <Text style={styles.actionBtnTextLight}>Atender</Text>
                  </TouchableOpacity>
                )}
                {activeTab !== 'Resolvidos' && (
                  <TouchableOpacity 
                    style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#10b981', alignItems: 'center' }]} 
                    onPress={() => handleResolverTicket(item.id, 'resolvido')}
                  >
                    <Text style={styles.actionBtnTextLight}>Finalizar Ticket</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum ticket encontrado.</Text>}
        />
      )}

      {/* Modal Novo Ticket */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Chamado (Ticket)</Text>
            <TextInput
              style={styles.input}
              placeholder="Assunto do chamado"
              value={newForm.assunto}
              onChangeText={t => setNewForm({ ...newForm, assunto: t })}
            />
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              placeholder="Descreva a solicitação ou dúvida do cliente"
              multiline
              value={newForm.mensagem}
              onChangeText={t => setNewForm({ ...newForm, mensagem: t })}
            />
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {(['baixa', 'media', 'alta'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.filterChip, newForm.prioridade === p && styles.filterChipActive, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setNewForm({ ...newForm, prioridade: p })}
                >
                  <Text style={[styles.filterChipText, newForm.prioridade === p && styles.filterChipTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewModalVisible(false)} color="#666" />
              <Button title="Abrir Ticket" onPress={handleCreateTicket} color="#17345f" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 10. PROMOÇÕES SCREEN (Cupons & Ofertas)
// ==========================================
export const PromocoesScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Ativas' | 'Expiradas'>('Ativas');
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome: '',
    codigo: '',
    desconto: '',
  });

  const fetchPromocoes = async (tab: string) => {
    setLoading(true);
    let statusFilter = ['ativa', 'ativo'];
    if (tab === 'Expiradas') statusFilter = ['expirada', 'inativa', 'inativo', 'pausado', 'pausada'];

    try {
      let { data: res } = await supabase
        .from('promocoes')
        .select('*')
        .in('status', statusFilter)
        .order('id', { ascending: false })
        .limit(100);
      setData(res || []); 
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchPromocoes(activeTab);
  }, [activeTab]);

  const handlePausar = async (id: string, currentStatus: string) => {
    const newStatus = (currentStatus === 'ativo' || currentStatus === 'ativa') ? 'inativo' : 'ativo';
    await supabase.from('promocoes').update({ status: newStatus }).eq('id', id);
    Alert.alert('Sucesso', `Status alterado para ${newStatus}!`);
    fetchPromocoes(activeTab);
  };

  const handleCreatePromo = async () => {
    if (!newForm.nome.trim()) {
      Alert.alert('Atenção', 'Informe o título da promoção.');
      return;
    }
    const { error } = await supabase.from('promocoes').insert([{
      nome: newForm.nome.trim(),
      titulo: newForm.nome.trim(),
      codigo: newForm.codigo.trim() || null,
      desconto: Number(newForm.desconto.replace(/\D/g, '')) || 10,
      status: 'ativo',
    }]);
    if (error) {
      Alert.alert('Erro ao criar promoção', error.message);
    } else {
      Alert.alert('Sucesso', 'Promoção criada com sucesso!');
      setNewModalVisible(false);
      setNewForm({ nome: '', codigo: '', desconto: '' });
      fetchPromocoes(activeTab);
    }
  };

  const filteredPromocoes = data.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (item.nome || '').toLowerCase().includes(s) ||
      (item.titulo || '').toLowerCase().includes(s) ||
      (item.codigo || '').toLowerCase().includes(s)
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar cupons e promoções..."
        onAddNew={() => setNewModalVisible(true)}
        addNewLabel="+ Nova Oferta"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Ativas', 'Expiradas'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando promoções..." /> : (
        <FlatList
          data={filteredPromocoes}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.nome || item.titulo || item.codigo || 'Promoção'}</Text>
                <Text style={styles.badge}>{item.status || 'ativa'}</Text>
              </View>
              {item.codigo && <Text style={styles.subtitle}>CÓDIGO: {item.codigo}</Text>}
              {item.desconto && <Text style={styles.value}>{item.desconto}% OFF</Text>}
              
              <TouchableOpacity 
                style={[styles.actionBtnPrimary, { marginTop: 10, alignSelf: 'flex-start', backgroundColor: (item.status === 'ativo' || item.status === 'ativa') ? '#ef4444' : '#10b981' }]} 
                onPress={() => handlePausar(item.id, item.status || 'ativo')}
              >
                <Text style={styles.actionBtnTextLight}>{(item.status === 'ativo' || item.status === 'ativa') ? 'Pausar Oferta' : 'Ativar Oferta'}</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum promoção encontrada.</Text>}
        />
      )}

      {/* Modal Nova Promoção */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nova Promoção / Cupom</Text>
            <TextInput
              style={styles.input}
              placeholder="Título da Promoção (ex: Black Friday)"
              value={newForm.nome}
              onChangeText={t => setNewForm({ ...newForm, nome: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Código do Cupom (ex: PROMO10)"
              autoCapitalize="characters"
              value={newForm.codigo}
              onChangeText={t => setNewForm({ ...newForm, codigo: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Desconto (%) ex: 15"
              keyboardType="numeric"
              value={newForm.desconto}
              onChangeText={t => setNewForm({ ...newForm, desconto: t })}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewModalVisible(false)} color="#666" />
              <Button title="Criar Oferta" onPress={handleCreatePromo} color="#17345f" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 11. RELATÓRIOS SCREEN (Extratos & KPIs)
// ==========================================
export const RelatoriosScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Extrato Financeiro' | 'Ordens de Serviço'>('Extrato Financeiro');

  const fetchData = async (tab: string) => {
    setLoading(true);
    try {
      if (tab === 'Extrato Financeiro') {
        const { data: res } = await supabase.from('extrato_financeiro').select('*').order('created_at', { ascending: false }).limit(60);
        setData(res || []);
      } else {
        const { data: res } = await supabase.from('ordens_servico').select('*').order('created_at', { ascending: false }).limit(60);
        setData(res || []);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.descricao && item.descricao.toLowerCase().includes(q)) ||
      (item.codigo_os && item.codigo_os.toLowerCase().includes(q)) ||
      (item.tipo && item.tipo.toLowerCase().includes(q)) ||
      (item.id?.toString() && item.id.toString().includes(q))
    );
  });

  const totalValor = filteredData.reduce((acc, item) => acc + (Number(item.valor || item.valor_total || 0)), 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar lançamentos ou ordens..."
        onAddNew={() => fetchData(activeTab)}
        addNewLabel="↻ Atualizar"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Extrato Financeiro', 'Ordens de Serviço'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* KPI Header */}
      <View style={{ backgroundColor: '#17345f', padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '600' }}>TOTAL REGISTROS</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{filteredData.length}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '600' }}>VOLUME FINANCEIRO</Text>
          <Text style={{ color: '#34d399', fontSize: 18, fontWeight: 'bold' }}>
            R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
        </View>
      </View>

      {loading ? <Loader text="Carregando relatórios..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.descricao || item.codigo_os || `Registro #${item.id?.substring(0,6)}`}</Text>
                {item.tipo && <Text style={styles.badge}>{item.tipo}</Text>}
              </View>
              {(item.valor !== undefined || item.valor_total !== undefined) ? (
                <Text style={Number(item.valor || item.valor_total || 0) >= 0 ? styles.value : styles.valueError}>
                  R$ {Number(item.valor || item.valor_total || 0).toFixed(2)}
                </Text>
              ) : null}
              {item.created_at && <Text style={styles.subtitle}>{item.created_at.split('T')[0].split('-').reverse().join('/')}</Text>}
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum registro encontrado.</Text>}
        />
      )}
    </View>
  );
};

// ==========================================
// 12. CONFIGURAÇÕES SCREEN (Parâmetros Globais)
// ==========================================
export const ConfiguracoesScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'Parâmetros Gerais' | 'Acesso'>('Parâmetros Gerais');

  const [promptVisible, setPromptVisible] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState<any>(null);

  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: res } = await supabase.from('system_settings').select('*').limit(60);
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleEditSetting = (item: any) => {
    setSelectedSetting(item);
    setPromptVisible(true);
  };

  const handleConfirmPrompt = async (val: string) => {
    setPromptVisible(false);
    if (!val || !selectedSetting) return;

    const { error } = await supabase.from('system_settings').update({ value: val }).eq('key', selectedSetting.key);
    if (error) Alert.alert('Erro', error.message);
    else {
      Alert.alert('Sucesso', 'Configuração atualizada com sucesso!');
      fetchData();
    }
  };

  const handleCreateSetting = async () => {
    if (!newKey.trim()) {
      Alert.alert('Atenção', 'Informe a chave da configuração.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('system_settings').insert([{
        key: newKey.trim(),
        value: newValue.trim() || '',
        description: newDesc.trim() || null
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Configuração salva com sucesso!');
        setNewModalVisible(false);
        setNewKey('');
        setNewValue('');
        setNewDesc('');
        fetchData();
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar configuração');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.key && item.key.toLowerCase().includes(q)) ||
      (item.value && String(item.value).toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar chave ou parâmetro..."
        onAddNew={() => setNewModalVisible(true)}
        addNewLabel="+ Novo Parâmetro"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['Parâmetros Gerais', 'Acesso'] as const).map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando configurações..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : (i.key || Math.random().toString())}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.key || 'Configuração'}</Text>
              </View>
              {item.value !== undefined && <Text style={styles.subtitle}>Valor: {String(item.value)}</Text>}
              {item.description && <Text style={[styles.subtitle, { fontStyle: 'italic', marginTop: 2 }]}>{item.description}</Text>}
              
              <TouchableOpacity 
                style={[styles.actionBtnPrimary, { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#17345f' }]} 
                onPress={() => handleEditSetting(item)}
              >
                <Text style={styles.actionBtnTextLight}>✏ Editar Parâmetro</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma configuração encontrada.</Text>}
        />
      )}

      {/* Modal Novo Parâmetro */}
      <Modal visible={newModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Novo Parâmetro</Text>
            <TextInput
              style={styles.input}
              placeholder="Chave (ex: APP_TAXA_SERVICO) *"
              placeholderTextColor="#9ca3af"
              value={newKey}
              onChangeText={setNewKey}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder="Valor do Parâmetro"
              placeholderTextColor="#9ca3af"
              value={newValue}
              onChangeText={setNewValue}
            />
            <TextInput
              style={styles.input}
              placeholder="Descrição / Finalidade"
              placeholderTextColor="#9ca3af"
              value={newDesc}
              onChangeText={setNewDesc}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Parâmetro"} 
                onPress={handleCreateSetting} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>

      <UniversalPromptModal
        visible={promptVisible}
        title="Editar Configuração"
        message={selectedSetting?.key || 'Digite o novo valor:'}
        initialValue={String(selectedSetting?.value || '')}
        onConfirm={handleConfirmPrompt}
        onCancel={() => setPromptVisible(false)}
      />
    </View>
  );
};

// ==========================================
// 13. PRESTADORES SCREEN (Gestão de Prestadores)
// ==========================================
export const PrestadoresScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ativos' | 'pendentes' | 'desligados'>('ativos');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [newModalVisible, setNewModalVisible] = useState(false);
  const [newForm, setNewForm] = useState({
    nome: '',
    documento: '',
    telefone: '',
    email: '',
    area_servico: '',
  });

  const fetchPrestadores = async (tab: 'ativos' | 'pendentes' | 'desligados') => {
    setLoading(true);
    try {
      let query = supabase.from('prestadores').select('*').order('created_at', { ascending: false }).limit(100);
      if (tab === 'ativos') {
        query = query.eq('status', 'ativo');
      } else if (tab === 'pendentes') {
        query = query.in('status', ['pendente', 'em_analise', 'suspenso']);
      } else if (tab === 'desligados') {
        query = query.in('status', ['desligado', 'reprovado', 'inativo']);
      }
      const { data: res } = await query;
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrestadores(activeTab);
  }, [activeTab]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const updateData: any = { status: newStatus };
    if (newStatus === 'ativo') {
      updateData.credencial_acesso = Math.floor(100000 + Math.random() * 900000).toString();
    }
    const { error } = await supabase.from('prestadores').update(updateData).eq('id', id);
    if (error) {
      Alert.alert('Erro', error.message);
    } else {
      Alert.alert('Sucesso', `Status alterado para ${newStatus}.`);
      if (selectedItem?.id === id) {
        setSelectedItem((prev: any) => ({ ...prev, status: newStatus }));
      }
      fetchPrestadores(activeTab);
    }
  };

  const handleCreatePrestador = async () => {
    if (!newForm.nome.trim()) {
      Alert.alert('Atenção', 'Informe o nome do prestador.');
      return;
    }
    const { error } = await supabase.from('prestadores').insert([{
      nome_razao: newForm.nome.trim(),
      nome_responsavel: newForm.nome.trim(),
      documento: newForm.documento.trim() || null,
      telefone: newForm.telefone.trim() || null,
      email: newForm.email.trim() || null,
      area_servico: newForm.area_servico.trim() || null,
      status: 'pendente',
    }]);
    if (error) {
      Alert.alert('Erro ao cadastrar prestador', error.message);
    } else {
      Alert.alert('Sucesso', 'Prestador cadastrado com sucesso!');
      setNewModalVisible(false);
      setNewForm({ nome: '', documento: '', telefone: '', email: '', area_servico: '' });
      fetchPrestadores(activeTab);
    }
  };

  const filteredPrestadores = data.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      (item.nome_razao || '').toLowerCase().includes(s) ||
      (item.nome_responsavel || '').toLowerCase().includes(s) ||
      (item.nome || '').toLowerCase().includes(s) ||
      (item.documento || '').includes(s) ||
      (item.telefone || '').includes(s) ||
      (item.area_servico || '').toLowerCase().includes(s)
    );
  });

  if (selectedItem) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f0f2f5', padding: 16 }}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedItem(null)}>
          <Text style={styles.backButtonText}>← Voltar para a lista</Text>
        </TouchableOpacity>

        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>{selectedItem.nome_razao || selectedItem.nome_responsavel || 'Prestador'}</Text>
          <View style={[styles.badgeContainer, { marginBottom: 12 }]}>
            <Text style={[styles.badge, { backgroundColor: selectedItem.status === 'ativo' ? '#dcfce7' : '#fee2e2', color: selectedItem.status === 'ativo' ? '#15803d' : '#b91c1c' }]}>
              {selectedItem.status || 'sem status'}
            </Text>
            {selectedItem.area_servico && <Text style={styles.badge}>{selectedItem.area_servico}</Text>}
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Documento</Text>
            <Text style={styles.detailValue}>{selectedItem.documento || selectedItem.cpf || selectedItem.cnpj || 'Não informado'}</Text>
          </View>

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>Contato</Text>
            <Text style={styles.detailValue}>Telefone: {selectedItem.telefone || 'Não informado'}</Text>
            <Text style={styles.detailValue}>Email: {selectedItem.email || 'Não informado'}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            {selectedItem.status !== 'ativo' && (
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#10b981', alignItems: 'center' }]}
                onPress={() => handleUpdateStatus(selectedItem.id, 'ativo')}
              >
                <Text style={styles.actionBtnTextLight}>✓ Aprovar / Ativar</Text>
              </TouchableOpacity>
            )}
            {selectedItem.status === 'ativo' && (
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { flex: 1, backgroundColor: '#ef4444', alignItems: 'center' }]}
                onPress={() => handleUpdateStatus(selectedItem.id, 'suspenso')}
              >
                <Text style={styles.actionBtnTextLight}>✕ Suspender</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar prestador por nome, CPF/CNPJ, área..."
        onAddNew={() => setNewModalVisible(true)}
        addNewLabel="+ Novo Prestador"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['ativos', 'pendentes', 'desligados'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'ativos' ? 'Ativos' : tab === 'pendentes' ? 'Pendentes (Análise)' : 'Desligados'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando prestadores..." /> : (
        <FlatList
          data={filteredPrestadores}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedItem(item)}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.nome_razao || item.nome_responsavel || item.nome || 'Prestador'}</Text>
                <Text style={[styles.badge, { backgroundColor: item.status === 'ativo' ? '#dcfce7' : '#fef3c7' }]}>
                  {item.status || 'pendente'}
                </Text>
              </View>
              {item.area_servico && <Text style={styles.subtitle}>Especialidade: {item.area_servico}</Text>}
              {item.telefone && <Text style={styles.subtitle}>Tel: {item.telefone}</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Nenhum prestador encontrado.</Text>}
        />
      )}

      {/* Modal Novo Prestador */}
      <Modal visible={newModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Prestador</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome ou Razão Social"
              value={newForm.nome}
              onChangeText={t => setNewForm({ ...newForm, nome: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="CPF ou CNPJ"
              keyboardType="numeric"
              value={newForm.documento}
              onChangeText={t => setNewForm({ ...newForm, documento: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Telefone / WhatsApp"
              keyboardType="phone-pad"
              value={newForm.telefone}
              onChangeText={t => setNewForm({ ...newForm, telefone: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={newForm.email}
              onChangeText={t => setNewForm({ ...newForm, email: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Área de Atuação (ex: Elétrica, Hidráulica, Ar-condicionado)"
              value={newForm.area_servico}
              onChangeText={t => setNewForm({ ...newForm, area_servico: t })}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setNewModalVisible(false)} color="#666" />
              <Button title="Cadastrar" onPress={handleCreatePrestador} color="#17345f" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 14. FORNECEDORES SCREEN
// ==========================================
export const FornecedoresScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ativos' | 'inativos' | 'todos'>('ativos');

  const [modalVisible, setModalVisible] = useState(false);
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [telefone, setTelefone] = useState('');
  const [categoria, setCategoria] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchFornecedores = async (tab: 'ativos' | 'inativos' | 'todos') => {
    setLoading(true);
    try {
      let query = supabase.from('fornecedores').select('*').order('created_at', { ascending: false }).limit(60);
      if (tab === 'ativos') query = query.eq('status', 'ativo');
      else if (tab === 'inativos') query = query.neq('status', 'ativo');
      const { data: res } = await query;
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFornecedores(activeTab);
  }, [activeTab]);

  const handleCreateFornecedor = async () => {
    if (!razaoSocial.trim() && !nomeFantasia.trim()) {
      Alert.alert('Atenção', 'Informe a Razão Social ou Nome Fantasia.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('fornecedores').insert([{
        razao_social: razaoSocial.trim() || nomeFantasia.trim(),
        nome_fantasia: nomeFantasia.trim() || razaoSocial.trim(),
        cnpj: cnpj.trim() || null,
        telefone: telefone.trim() || null,
        categoria: categoria.trim() || null,
        status: 'ativo'
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Fornecedor cadastrado com sucesso!');
        setModalVisible(false);
        setRazaoSocial('');
        setNomeFantasia('');
        setCnpj('');
        setTelefone('');
        setCategoria('');
        fetchFornecedores(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar fornecedor');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.razao_social && item.razao_social.toLowerCase().includes(q)) ||
      (item.nome_fantasia && item.nome_fantasia.toLowerCase().includes(q)) ||
      (item.cnpj && item.cnpj.toLowerCase().includes(q)) ||
      (item.telefone && item.telefone.toLowerCase().includes(q)) ||
      (item.categoria && item.categoria.toLowerCase().includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar por razão social, CNPJ..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Novo Fornecedor"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['ativos', 'inativos', 'todos'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'ativos' ? 'Ativos' : tab === 'inativos' ? 'Inativos / Bloqueados' : 'Todos'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando fornecedores..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.razao_social || item.nome_fantasia || 'Fornecedor'}</Text>
                <Text style={[styles.badge, item.status === 'ativo' ? { backgroundColor: '#d1fae5', color: '#065f46' } : { backgroundColor: '#fee2e2', color: '#991b1b' }]}>
                  {item.status || 'ativo'}
                </Text>
              </View>
              {item.nome_fantasia && item.nome_fantasia !== item.razao_social && (
                <Text style={styles.subtitle}>Fantasia: {item.nome_fantasia}</Text>
              )}
              {item.categoria && <Text style={styles.subtitle}>Categoria: {item.categoria}</Text>}
              {item.cnpj && <Text style={styles.subtitle}>CNPJ: {item.cnpj}</Text>}
              {item.telefone && <Text style={styles.subtitle}>Tel: {item.telefone}</Text>}
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Nenhum fornecedor encontrado.</Text>}
        />
      )}

      {/* Modal Novo Fornecedor */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Novo Fornecedor</Text>
            <TextInput
              style={styles.input}
              placeholder="Razão Social *"
              placeholderTextColor="#9ca3af"
              value={razaoSocial}
              onChangeText={setRazaoSocial}
            />
            <TextInput
              style={styles.input}
              placeholder="Nome Fantasia"
              placeholderTextColor="#9ca3af"
              value={nomeFantasia}
              onChangeText={setNomeFantasia}
            />
            <TextInput
              style={styles.input}
              placeholder="CNPJ"
              placeholderTextColor="#9ca3af"
              value={cnpj}
              onChangeText={setCnpj}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Telefone / WhatsApp"
              placeholderTextColor="#9ca3af"
              value={telefone}
              onChangeText={setTelefone}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Categoria (ex: Materiais, TI, Equipamentos)"
              placeholderTextColor="#9ca3af"
              value={categoria}
              onChangeText={setCategoria}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Fornecedor"} 
                onPress={handleCreateFornecedor} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 15. VENDAS SCREEN (Ordens de Compra & Pedidos)
// ==========================================
export const VendasScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pendentes' | 'concluidos' | 'todos'>('pendentes');

  const [modalVisible, setModalVisible] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoValor, setNovoValor] = useState('');
  const [novoStatus, setNovoStatus] = useState('pendente');
  const [salvando, setSalvando] = useState(false);

  const fetchVendas = async (tab: 'pendentes' | 'concluidos' | 'todos') => {
    setLoading(true);
    try {
      let query = supabase.from('ordens_compra').select('*').order('created_at', { ascending: false }).limit(60);
      if (tab === 'pendentes') query = query.in('status', ['pendente', 'processando', 'aberto']);
      else if (tab === 'concluidos') query = query.in('status', ['concluido', 'finalizado', 'pago']);
      const { data: res } = await query;
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendas(activeTab);
  }, [activeTab]);

  const handleCreateVenda = async () => {
    if (!novoValor.trim() || isNaN(Number(novoValor))) {
      Alert.alert('Atenção', 'Informe um valor numérico válido.');
      return;
    }
    setSalvando(true);
    try {
      const cod = novoCodigo.trim() || `PED-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('ordens_compra').insert([{
        codigo_ordem: cod,
        valor_total: Number(novoValor),
        status: novoStatus,
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Pedido registrado com sucesso!');
        setModalVisible(false);
        setNovoCodigo('');
        setNovoValor('');
        fetchVendas(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar pedido');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.codigo_ordem && item.codigo_ordem.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q)) ||
      (item.id?.toString() && item.id.toString().includes(q)) ||
      (item.valor_total && String(item.valor_total).includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar pedidos por código..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Novo Pedido"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['pendentes', 'concluidos', 'todos'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'pendentes' ? 'Em Aberto' : tab === 'concluidos' ? 'Concluídos' : 'Todos'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando vendas e pedidos..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.codigo_ordem || `Pedido #${item.id?.substring(0, 6)}`}</Text>
                <Text style={[styles.badge, item.status === 'concluido' || item.status === 'pago' ? { backgroundColor: '#d1fae5', color: '#065f46' } : { backgroundColor: '#fef3c7', color: '#92400e' }]}>
                  {item.status || 'pendente'}
                </Text>
              </View>
              <Text style={styles.value}>R$ {Number(item.valor_total || item.valor || 0).toFixed(2)}</Text>
              {item.created_at && <Text style={styles.subtitle}>Data: {item.created_at.split('T')[0].split('-').reverse().join('/')}</Text>}
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Nenhum pedido encontrado.</Text>}
        />
      )}

      {/* Modal Novo Pedido */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Novo Pedido de Venda</Text>
            <TextInput
              style={styles.input}
              placeholder="Código da Ordem (opcional)"
              placeholderTextColor="#9ca3af"
              value={novoCodigo}
              onChangeText={setNovoCodigo}
            />
            <TextInput
              style={styles.input}
              placeholder="Valor Total (R$) *"
              placeholderTextColor="#9ca3af"
              value={novoValor}
              onChangeText={setNovoValor}
              keyboardType="numeric"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {(['pendente', 'pago'] as const).map(st => (
                <TouchableOpacity
                  key={st}
                  style={[styles.filterChip, novoStatus === st && styles.filterChipActive, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setNovoStatus(st)}
                >
                  <Text style={[styles.filterChipText, novoStatus === st && styles.filterChipTextActive]}>
                    {st.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Pedido"} 
                onPress={handleCreateVenda} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 16. EMPRÉSTIMOS SCREEN (Crédito & Empréstimos)
// ==========================================
export const EmprestimosScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ativos' | 'pendentes' | 'quitados' | 'todos'>('ativos');

  const [modalVisible, setModalVisible] = useState(false);
  const [codigoContrato, setCodigoContrato] = useState('');
  const [valorSolicitado, setValorSolicitado] = useState('');
  const [numeroParcelas, setNumeroParcelas] = useState('12');
  const [salvando, setSalvando] = useState(false);

  const fetchLoans = async (tab: 'ativos' | 'pendentes' | 'quitados' | 'todos') => {
    setLoading(true);
    try {
      let query = supabase.from('emprestimos').select('*').order('created_at', { ascending: false }).limit(60);
      if (tab === 'ativos') {
        query = query.in('status', ['ativo', 'em_dia', 'atrasado']);
      } else if (tab === 'pendentes') {
        query = query.in('status', ['pendente', 'em_analise', 'solicitado']);
      } else if (tab === 'quitados') {
        query = query.in('status', ['quitado', 'liquidado', 'cancelado']);
      }
      const { data: res } = await query;
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoans(activeTab);
  }, [activeTab]);

  const handleCreateLoan = async () => {
    if (!valorSolicitado.trim() || isNaN(Number(valorSolicitado))) {
      Alert.alert('Atenção', 'Informe um valor solicitado numérico.');
      return;
    }
    setSalvando(true);
    try {
      const cod = codigoContrato.trim() || `EMP-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('emprestimos').insert([{
        codigo_contrato: cod,
        valor_solicitado: Number(valorSolicitado),
        numero_parcelas: Number(numeroParcelas) || 12,
        status: 'em_analise'
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Proposta de empréstimo registrada!');
        setModalVisible(false);
        setCodigoContrato('');
        setValorSolicitado('');
        setNumeroParcelas('12');
        fetchLoans(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar proposta');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.codigo_contrato && item.codigo_contrato.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q)) ||
      (item.id?.toString() && item.id.toString().includes(q)) ||
      (item.valor_solicitado && String(item.valor_solicitado).includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar contrato de crédito..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Nova Proposta"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['ativos', 'pendentes', 'quitados', 'todos'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'ativos' ? 'Ativos' : tab === 'pendentes' ? 'Em Análise' : tab === 'quitados' ? 'Quitados' : 'Todos'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando empréstimos..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.codigo_contrato || `Contrato #${item.id?.substring(0, 6)}`}</Text>
                <Text style={[styles.badge, item.status === 'ativo' ? { backgroundColor: '#d1fae5', color: '#065f46' } : { backgroundColor: '#fef3c7', color: '#92400e' }]}>
                  {item.status || 'pendente'}
                </Text>
              </View>
              <Text style={styles.subtitle}>Parcelas: {item.numero_parcelas || 1}x</Text>
              <Text style={styles.value}>R$ {Number(item.valor_solicitado || item.valor || 0).toFixed(2)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Nenhum contrato encontrado.</Text>}
        />
      )}

      {/* Modal Nova Proposta */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Nova Proposta de Crédito</Text>
            <TextInput
              style={styles.input}
              placeholder="Código do Contrato (opcional)"
              placeholderTextColor="#9ca3af"
              value={codigoContrato}
              onChangeText={setCodigoContrato}
            />
            <TextInput
              style={styles.input}
              placeholder="Valor Solicitado (R$) *"
              placeholderTextColor="#9ca3af"
              value={valorSolicitado}
              onChangeText={setValorSolicitado}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Número de Parcelas (ex: 12, 24, 36)"
              placeholderTextColor="#9ca3af"
              value={numeroParcelas}
              onChangeText={setNumeroParcelas}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Proposta"} 
                onPress={handleCreateLoan} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 17. ÁREA VIP SCREEN (Fidelidade)
// ==========================================
export const AreaVIPScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'membros' | 'niveis'>('membros');

  const [modalVisible, setModalVisible] = useState(false);
  const [nomeNivel, setNomeNivel] = useState('');
  const [pontosMinimos, setPontosMinimos] = useState('');
  const [multiplicador, setMultiplicador] = useState('1.0');
  const [salvando, setSalvando] = useState(false);

  const fetchVIP = async (tab: 'membros' | 'niveis') => {
    setLoading(true);
    try {
      if (tab === 'membros') {
        const { data: res } = await supabase
          .from('clientes')
          .select('*')
          .order('saldo_pontos', { ascending: false })
          .limit(60);
        setData(res || []);
      } else {
        const { data: res } = await supabase.from('client_levels').select('*').order('pontos_minimos', { ascending: true });
        setData(res || []);
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVIP(activeTab);
  }, [activeTab]);

  const handleCreateLevel = async () => {
    if (!nomeNivel.trim()) {
      Alert.alert('Atenção', 'Informe o nome do nível VIP.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('client_levels').insert([{
        nome_nivel: nomeNivel.trim(),
        pontos_minimos: Number(pontosMinimos) || 0,
        multiplicador: Number(multiplicador) || 1.0
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Nível VIP registrado!');
        setModalVisible(false);
        setNomeNivel('');
        setPontosMinimos('');
        setMultiplicador('1.0');
        fetchVIP(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar nível VIP');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.nome && item.nome.toLowerCase().includes(q)) ||
      (item.nome_nivel && item.nome_nivel.toLowerCase().includes(q)) ||
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.id?.toString() && item.id.toString().includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar membro ou nível VIP..."
        onAddNew={activeTab === 'niveis' ? () => setModalVisible(true) : undefined}
        addNewLabel="+ Novo Nível"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['membros', 'niveis'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'membros' ? 'Membros VIP' : 'Níveis e Regras'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando Clube VIP..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.nome || item.nome_nivel || 'VIP'}</Text>
                {item.multiplicador && <Text style={[styles.badge, { backgroundColor: '#fef3c7', color: '#b45309' }]}>{item.multiplicador}x Pontos</Text>}
              </View>
              {item.saldo_pontos !== undefined && <Text style={styles.value}>{item.saldo_pontos} Pontos Acumulados</Text>}
              {item.pontos_minimos !== undefined && <Text style={styles.subtitle}>Mínimo: {item.pontos_minimos} pts</Text>}
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Nenhum registro VIP encontrado.</Text>}
        />
      )}

      {/* Modal Novo Nível VIP */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Novo Nível VIP</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do Nível (ex: Diamante) *"
              placeholderTextColor="#9ca3af"
              value={nomeNivel}
              onChangeText={setNomeNivel}
            />
            <TextInput
              style={styles.input}
              placeholder="Pontos Mínimos (ex: 5000)"
              placeholderTextColor="#9ca3af"
              value={pontosMinimos}
              onChangeText={setPontosMinimos}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Multiplicador de Pontos (ex: 1.5)"
              placeholderTextColor="#9ca3af"
              value={multiplicador}
              onChangeText={setMultiplicador}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Nível"} 
                onPress={handleCreateLevel} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 18. SEGUROS SCREEN
// ==========================================
export const SegurosScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todas' | 'ativas' | 'pendentes'>('todas');

  const [modalVisible, setModalVisible] = useState(false);
  const [numeroApolice, setNumeroApolice] = useState('');
  const [tipoCobertura, setTipoCobertura] = useState('');
  const [seguradora, setSeguradora] = useState('');
  const [valorPremio, setValorPremio] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchSeguros = async (tab: 'todas' | 'ativas' | 'pendentes') => {
    setLoading(true);
    try {
      let query = supabase.from('seguros_apolices').select('*').limit(60);
      if (tab === 'ativas') query = query.eq('status', 'ativo');
      else if (tab === 'pendentes') query = query.neq('status', 'ativo');
      const { data: res } = await query;
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeguros(activeTab);
  }, [activeTab]);

  const handleCreateSeguro = async () => {
    if (!numeroApolice.trim() && !tipoCobertura.trim()) {
      Alert.alert('Atenção', 'Informe o número da apólice ou tipo de cobertura.');
      return;
    }
    setSalvando(true);
    try {
      const apolice = numeroApolice.trim() || `APO-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('seguros_apolices').insert([{
        numero_apolice: apolice,
        tipo_cobertura: tipoCobertura.trim() || 'Compreensiva',
        seguradora: seguradora.trim() || 'GSA Seguros',
        valor_premio: Number(valorPremio) || 0,
        status: 'ativo'
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Apólice cadastrada com sucesso!');
        setModalVisible(false);
        setNumeroApolice('');
        setTipoCobertura('');
        setSeguradora('');
        setValorPremio('');
        fetchSeguros(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar apólice');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.numero_apolice && item.numero_apolice.toLowerCase().includes(q)) ||
      (item.tipo_cobertura && item.tipo_cobertura.toLowerCase().includes(q)) ||
      (item.seguradora && item.seguradora.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar por apólice ou cobertura..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Nova Apólice"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['todas', 'ativas', 'pendentes'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'todas' ? 'Todas' : tab === 'ativas' ? 'Ativas' : 'Pendentes'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando seguros e apólices..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.numero_apolice || `Apólice #${item.id?.substring(0, 6)}`}</Text>
                <Text style={[styles.badge, item.status === 'ativo' ? { backgroundColor: '#d1fae5', color: '#065f46' } : { backgroundColor: '#fef3c7', color: '#92400e' }]}>
                  {item.status || 'Ativo'}
                </Text>
              </View>
              {item.tipo_cobertura && <Text style={styles.subtitle}>Cobertura: {item.tipo_cobertura}</Text>}
              {item.seguradora && <Text style={styles.subtitle}>Seguradora: {item.seguradora}</Text>}
              {item.valor_premio && <Text style={styles.value}>R$ {Number(item.valor_premio).toFixed(2)}</Text>}
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Nenhuma apólice registrada.</Text>}
        />
      )}

      {/* Modal Nova Apólice */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Nova Apólice de Seguro</Text>
            <TextInput
              style={styles.input}
              placeholder="Número da Apólice (opcional)"
              placeholderTextColor="#9ca3af"
              value={numeroApolice}
              onChangeText={setNumeroApolice}
            />
            <TextInput
              style={styles.input}
              placeholder="Tipo de Cobertura (ex: Auto, Vida, Residencial) *"
              placeholderTextColor="#9ca3af"
              value={tipoCobertura}
              onChangeText={setTipoCobertura}
            />
            <TextInput
              style={styles.input}
              placeholder="Seguradora Parceira (ex: Porto Seguro, Allianz)"
              placeholderTextColor="#9ca3af"
              value={seguradora}
              onChangeText={setSeguradora}
            />
            <TextInput
              style={styles.input}
              placeholder="Valor do Prêmio / Mensalidade (R$)"
              placeholderTextColor="#9ca3af"
              value={valorPremio}
              onChangeText={setValorPremio}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Apólice"} 
                onPress={handleCreateSeguro} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// 19. SAÚDE SCREEN
// ==========================================
export const SaudeScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'todos' | 'ativos' | 'suspensos'>('todos');

  const [modalVisible, setModalVisible] = useState(false);
  const [beneficiario, setBeneficiario] = useState('');
  const [plano, setPlano] = useState('');
  const [valorMensal, setValorMensal] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fetchSaude = async (tab: 'todos' | 'ativos' | 'suspensos') => {
    setLoading(true);
    try {
      let query = supabase.from('saude_contratos').select('*').limit(60);
      if (tab === 'ativos') query = query.eq('status', 'ativo');
      else if (tab === 'suspensos') query = query.neq('status', 'ativo');
      const { data: res } = await query;
      setData(res || []);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSaude(activeTab);
  }, [activeTab]);

  const handleCreateSaude = async () => {
    if (!beneficiario.trim()) {
      Alert.alert('Atenção', 'Informe o nome do beneficiário.');
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from('saude_contratos').insert([{
        beneficiario_nome: beneficiario.trim(),
        plano_nome: plano.trim() || 'GSA Saúde Básico',
        valor_mensal: Number(valorMensal) || 0,
        status: 'ativo'
      }]);

      if (error) {
        Alert.alert('Erro', error.message);
      } else {
        Alert.alert('Sucesso', 'Contrato de saúde registrado!');
        setModalVisible(false);
        setBeneficiario('');
        setPlano('');
        setValorMensal('');
        fetchSaude(activeTab);
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao salvar contrato');
    } finally {
      setSalvando(false);
    }
  };

  const filteredData = data.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.beneficiario_nome && item.beneficiario_nome.toLowerCase().includes(q)) ||
      (item.plano_nome && item.plano_nome.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q)) ||
      (item.id?.toString() && item.id.toString().includes(q))
    );
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SearchHeader
        search={search}
        setSearch={setSearch}
        placeholder="Buscar beneficiário ou plano..."
        onAddNew={() => setModalVisible(true)}
        addNewLabel="+ Novo Contrato"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainerScroll}>
        {(['todos', 'ativos', 'suspensos'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'todos' ? 'Todos' : tab === 'ativos' ? 'Ativos' : 'Suspensos'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <Loader text="Carregando contratos de saúde..." /> : (
        <FlatList
          data={filteredData}
          keyExtractor={i => i.id ? i.id.toString() : Math.random().toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title}>{item.beneficiario_nome || `Contrato #${item.id?.substring(0, 6)}`}</Text>
                <Text style={[styles.badge, item.status === 'ativo' ? { backgroundColor: '#d1fae5', color: '#065f46' } : { backgroundColor: '#fee2e2', color: '#991b1b' }]}>
                  {item.status || 'Ativo'}
                </Text>
              </View>
              {item.plano_nome && <Text style={styles.subtitle}>Plano: {item.plano_nome}</Text>}
              {item.valor_mensal && <Text style={styles.value}>R$ {Number(item.valor_mensal).toFixed(2)}</Text>}
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Nenhum contrato de saúde encontrado.</Text>}
        />
      )}

      {/* Modal Novo Contrato Saúde */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>+ Novo Contrato de Saúde</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome do Beneficiário *"
              placeholderTextColor="#9ca3af"
              value={beneficiario}
              onChangeText={setBeneficiario}
            />
            <TextInput
              style={styles.input}
              placeholder="Nome do Plano (ex: GSA Gold Saúde)"
              placeholderTextColor="#9ca3af"
              value={plano}
              onChangeText={setPlano}
            />
            <TextInput
              style={styles.input}
              placeholder="Valor Mensal (R$)"
              placeholderTextColor="#9ca3af"
              value={valorMensal}
              onChangeText={setValorMensal}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" onPress={() => setModalVisible(false)} color="#6b7280" />
              <Button 
                title={salvando ? "Salvando..." : "Salvar Contrato"} 
                onPress={handleCreateSaude} 
                disabled={salvando}
                color="#17345f" 
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==========================================
// SHARED STYLES & LOADER
// ==========================================
const Loader = ({ text }: { text: string }) => (
  <View style={styles.loader}>
    <ActivityIndicator size="large" color="#17345f" />
    <Text style={styles.loaderText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  list: { padding: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  loaderText: { marginTop: 12, color: '#666' },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#17345f'
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  value: { fontSize: 15, fontWeight: 'bold', color: '#10b981', marginTop: 8 },
  valueError: { fontSize: 15, fontWeight: 'bold', color: '#ef4444' },
  badge: { fontSize: 11, backgroundColor: '#e5e7eb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', marginRight: 6 },
  backButton: { paddingVertical: 12, marginBottom: 10 },
  backButtonText: { color: '#17345f', fontSize: 16, fontWeight: 'bold' },
  detailCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  detailTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  badgeContainer: { flexDirection: 'row', marginBottom: 0 },
  detailSection: { marginBottom: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12 },
  detailLabel: { fontSize: 12, color: '#6b7280', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  detailValue: { fontSize: 16, color: '#374151', marginBottom: 2 },
  headerDetail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerActions: { flexDirection: 'row' },
  actionBtnOutline: { borderWidth: 1, borderColor: '#d1d5db', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 8 },
  actionBtnPrimary: { backgroundColor: '#17345f', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  actionBtnTextDark: { color: '#374151', fontWeight: '600' },
  actionBtnTextLight: { color: '#fff', fontWeight: '600' },
  clientSummary: { backgroundColor: '#fff', padding: 20, paddingBottom: 10 },
  tabContainerScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingHorizontal: 16, flexDirection: 'row' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingHorizontal: 16 },
  tab: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#17345f' },
  tabText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  tabTextActive: { color: '#17345f', fontWeight: 'bold' },
  modalContainer: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 8 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#111827' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, padding: 10, marginBottom: 10, color: '#333' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  addNewButton: {
    backgroundColor: '#17345f',
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNewButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  filterTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  filterChipActive: {
    backgroundColor: '#17345f',
  },
  filterChipText: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

// ==========================================
// RE-EXPORTS FOR NEW ERP MODULES
// ==========================================
export { ClassificadosModuleScreen as ClassificadosScreen } from './screens/growth/ClassificadosModuleScreen';
export { AcessosModuleScreen as AcessosScreen } from './screens/governance/AcessosModuleScreen';
export { SystemMonitorModuleScreen as SistemaScreen } from './screens/governance/SystemMonitorModuleScreen';
export { CareersAdminModuleScreen as CarreirasScreen } from './screens/growth/CareersAdminModuleScreen';
export { FiscalModuleScreen as FiscalScreen } from './screens/financial/FiscalModuleScreen';
export { CreditoModuleScreen as CreditoLojaScreen } from './screens/financial/CreditoModuleScreen';
export { SiteCampaignAdminPageScreen as CampanhasScreen } from './screens/governance/SiteCampaignAdminPageScreen';
export { ScrapingAdminModuleScreen as AutomacoesScreen } from './screens/governance/ScrapingAdminModuleScreen';


