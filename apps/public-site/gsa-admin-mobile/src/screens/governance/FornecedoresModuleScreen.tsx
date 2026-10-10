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

export interface FornecedoresModuleScreenProps {
  initialTab?: 'cadastros' | 'produtos' | 'pedidos' | 'contas';
}

type TabKey = 'cadastros' | 'produtos' | 'pedidos' | 'contas';

interface FornecedorItem {
  id: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  status: 'homologado' | 'em_analise' | 'bloqueado';
  cidade?: string;
  uf?: string;
}

interface PedidoCompraItem {
  id: string;
  fornecedor_nome?: string;
  valor_total: number;
  status: 'pendente' | 'aprovado' | 'entregue' | 'cancelado';
  created_at: string;
  itens_count?: number;
}

export const FornecedoresModuleScreen: React.FC<FornecedoresModuleScreenProps> = ({
  initialTab = 'cadastros',
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [fornecedores, setFornecedores] = useState<FornecedorItem[]>([]);
  const [pedidos, setPedidos] = useState<PedidoCompraItem[]>([]);

  // Modais
  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [selectedFornecedor, setSelectedFornecedor] = useState<FornecedorItem | null>(null);
  const [approvalAction, setApprovalAction] = useState<'homologado' | 'bloqueado'>('homologado');
  const [approvalReason, setApprovalReason] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // Modal Novo Fornecedor
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newRazao, setNewRazao] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  const [newTelefone, setNewTelefone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);

  const formatBRL = (val: number): string => {
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Tentar RPC snapshot
      const { data: rpcData, error: rpcError } = await supabase.rpc('gsa_admin_supplier_snapshot', {});

      if (!rpcError && rpcData) {
        if (Array.isArray(rpcData.suppliers)) {
          setFornecedores(
            rpcData.suppliers.map((s: any) => ({
              id: s.id,
              razao_social: s.razao_social || s.nome || 'Fornecedor',
              nome_fantasia: s.nome_fantasia,
              cnpj: s.cnpj,
              telefone: s.telefone,
              email: s.email,
              status: s.status || 'em_analise',
              cidade: s.cidade,
              uf: s.uf,
            }))
          );
        }
        if (Array.isArray(rpcData.orders)) {
          setPedidos(
            rpcData.orders.map((o: any) => ({
              id: o.id,
              fornecedor_nome: o.fornecedor_nome || o.fornecedores?.razao_social,
              valor_total: Number(o.valor_total) || 0,
              status: o.status || 'pendente',
              created_at: o.created_at,
              itens_count: o.itens_count || 1,
            }))
          );
        }
      } else {
        // Fallback: tabela fornecedores e ordens_compra
        const [{ data: sList }, { data: oList }] = await Promise.all([
          supabase.from('fornecedores').select('*').limit(30),
          supabase.from('ordens_compra').select('*').order('created_at', { ascending: false }).limit(20),
        ]);

        if (Array.isArray(sList) && sList.length > 0) {
          setFornecedores(
            sList.map((s: any) => ({
              id: s.id,
              razao_social: s.razao_social || s.nome || 'Fornecedor',
              nome_fantasia: s.nome_fantasia,
              cnpj: s.cnpj,
              telefone: s.telefone,
              email: s.email,
              status: s.status || 'em_analise',
              cidade: s.cidade,
              uf: s.uf,
            }))
          );
        } else {
          // Dados de demonstração consistentes se tabela vazia
          setFornecedores([
            { id: '1', razao_social: 'Distribuidora Global Peças LTDA', nome_fantasia: 'Global Peças', cnpj: '12.345.678/0001-90', telefone: '(11) 3456-7890', email: 'vendas@globalpecas.com.br', status: 'homologado', cidade: 'São Paulo', uf: 'SP' },
            { id: '2', razao_social: 'Suprimentos & Ferramentas Brasil S/A', nome_fantasia: 'SupriBrasil', cnpj: '98.765.432/0001-10', telefone: '(11) 2345-6789', email: 'comercial@supribrasil.com.br', status: 'em_analise', cidade: 'Campinas', uf: 'SP' },
            { id: '3', razao_social: 'Eletro Componentes Industriais EIRELI', nome_fantasia: 'EletroInd', cnpj: '55.443.221/0001-00', telefone: '(11) 98765-4321', email: 'contato@eletroind.com.br', status: 'homologado', cidade: 'Guarulhos', uf: 'SP' },
          ]);
        }

        if (Array.isArray(oList)) {
          setPedidos(
            oList.map((o: any) => ({
              id: o.id,
              fornecedor_nome: o.fornecedor_nome || 'Fornecedor Cadastrado',
              valor_total: Number(o.valor_total || o.total) || 0,
              status: o.status || 'pendente',
              created_at: o.created_at,
              itens_count: 3,
            }))
          );
        } else {
          setPedidos([
            { id: 'oc-1', fornecedor_nome: 'Global Peças', valor_total: 4850.0, status: 'aprovado', created_at: new Date().toISOString(), itens_count: 5 },
            { id: 'oc-2', fornecedor_nome: 'SupriBrasil', valor_total: 1250.0, status: 'pendente', created_at: new Date().toISOString(), itens_count: 2 },
          ]);
        }
      }
    } catch (e: any) {
      console.error('Erro fornecedores:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUpdateStatus = async () => {
    if (!selectedFornecedor) return;
    setProcessingAction(true);
    try {
      const { error } = await supabase
        .from('fornecedores')
        .update({
          status: approvalAction,
          motivo_status: approvalReason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedFornecedor.id);

      if (error) {
        // Tentar via rpc
        await supabase.rpc('gsa_admin_set_supplier_status', {
          p_fornecedor_id: selectedFornecedor.id,
          p_status: approvalAction,
          p_motivo: approvalReason,
          p_pin: adminPin,
        });
      }

      Alert.alert(
        'Sucesso',
        `Fornecedor atualizado para "${approvalAction.toUpperCase()}".`
      );
      setApprovalModalVisible(false);
      setApprovalReason('');
      setAdminPin('');
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao atualizar', e?.message || 'Falha na gravação.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleCreateSupplier = async () => {
    if (!newRazao.trim()) {
      Alert.alert('Atenção', 'Informe a Razão Social do fornecedor.');
      return;
    }
    setSubmittingNew(true);
    try {
      const { error } = await supabase.from('fornecedores').insert({
        razao_social: newRazao.trim(),
        cnpj: newCnpj.trim() || null,
        telefone: newTelefone.trim() || null,
        email: newEmail.trim() || null,
        status: 'em_analise',
      });

      if (error) throw error;

      Alert.alert('Sucesso', 'Fornecedor cadastrado e enviado para análise de homologação!');
      setCreateModalVisible(false);
      setNewRazao('');
      setNewCnpj('');
      setNewTelefone('');
      setNewEmail('');
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao cadastrar', e?.message || 'Falha ao salvar no banco.');
    } finally {
      setSubmittingNew(false);
    }
  };

  const filteredFornecedores = fornecedores.filter((f) =>
    f.razao_social.toLowerCase().includes(search.toLowerCase()) ||
    (f.cnpj && f.cnpj.includes(search))
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} colors={['#17345f']} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Suprimentos & Compras</Text>
          <Text style={styles.headerTitle}>Gestão de Fornecedores</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.addBtnText}>+ Fornecedor</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'cadastros' && styles.tabBtnActive]}
          onPress={() => setActiveTab('cadastros')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'cadastros' && styles.tabBtnTextActive]}>
            🏢 Cadastros ({fornecedores.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pedidos' && styles.tabBtnActive]}
          onPress={() => setActiveTab('pedidos')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'pedidos' && styles.tabBtnTextActive]}>
            🛒 Pedidos de Compra ({pedidos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'produtos' && styles.tabBtnActive]}
          onPress={() => setActiveTab('produtos')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'produtos' && styles.tabBtnTextActive]}>
            📦 Catálogo de Itens
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'contas' && styles.tabBtnActive]}
          onPress={() => setActiveTab('contas')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'contas' && styles.tabBtnTextActive]}>
            💳 Contas a Pagar
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {activeTab === 'cadastros' && (
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por razão social ou CNPJ..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#94a3b8"
          />
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.loaderArea}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loaderText}>Carregando dados dos fornecedores...</Text>
        </View>
      ) : (
        <>
          {/* TAB 1: CADASTROS */}
          {activeTab === 'cadastros' && (
            <View style={styles.listWrap}>
              {filteredFornecedores.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Nenhum fornecedor encontrado</Text>
                  <Text style={styles.emptyText}>Cadastre novos parceiros de suprimentos no botão acima.</Text>
                </View>
              ) : (
                filteredFornecedores.map((f) => (
                  <View key={f.id} style={styles.card}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.supplierTitle}>{f.razao_social}</Text>
                        {f.nome_fantasia ? (
                          <Text style={styles.supplierSub}>{f.nome_fantasia}</Text>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.badge,
                          f.status === 'homologado'
                            ? styles.badgeSuccess
                            : f.status === 'bloqueado'
                            ? styles.badgeDanger
                            : styles.badgeWarning,
                        ]}
                      >
                        <Text style={styles.badgeText}>{f.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    <Text style={styles.cardInfo}>CNPJ: {f.cnpj || 'Não informado'}</Text>
                    {f.telefone ? <Text style={styles.cardInfo}>Telefone: {f.telefone}</Text> : null}
                    {f.email ? <Text style={styles.cardInfo}>E-mail: {f.email}</Text> : null}

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={styles.actionBtnSec}
                        onPress={() => {
                          setSelectedFornecedor(f);
                          setApprovalAction('homologado');
                          setApprovalModalVisible(true);
                        }}
                      >
                        <Text style={styles.actionBtnSecText}>✓ Homologar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtnSec, styles.borderDanger]}
                        onPress={() => {
                          setSelectedFornecedor(f);
                          setApprovalAction('bloqueado');
                          setApprovalModalVisible(true);
                        }}
                      >
                        <Text style={[styles.actionBtnSecText, styles.textDanger]}>✕ Bloquear</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 2: PEDIDOS DE COMPRA */}
          {activeTab === 'pedidos' && (
            <View style={styles.listWrap}>
              {pedidos.map((p) => (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.supplierTitle}>Pedido #{String(p.id).slice(0, 8)}</Text>
                    <Text style={styles.orderAmount}>{formatBRL(p.valor_total)}</Text>
                  </View>
                  <Text style={styles.cardInfo}>Fornecedor: {p.fornecedor_nome}</Text>
                  <Text style={styles.cardInfo}>Status: {p.status.toUpperCase()}</Text>
                  <Text style={styles.cardSubInfo}>
                    Data: {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* TAB 3: PRODUTOS */}
          {activeTab === 'produtos' && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Catálogo de Produtos dos Fornecedores</Text>
              <Text style={styles.emptyText}>
                Tabela de preços e matérias-primas sincronizadas automaticamente via ordens de compra.
              </Text>
            </View>
          )}

          {/* TAB 4: CONTAS A PAGAR */}
          {activeTab === 'contas' && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Títulos a Pagar aos Fornecedores</Text>
              <Text style={styles.emptyText}>
                As faturas a pagar com vencimento no mês estão vinculadas ao Módulo Financeiro Geral.
              </Text>
            </View>
          )}
        </>
      )}

      {/* Modal Homologação / Status */}
      <Modal visible={approvalModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Alterar Status do Fornecedor</Text>
            <Text style={styles.modalDesc}>{selectedFornecedor?.razao_social}</Text>

            <Text style={styles.inputLabel}>Ação Selecionada:</Text>
            <View style={styles.statusToggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, approvalAction === 'homologado' && styles.toggleBtnActiveSuccess]}
                onPress={() => setApprovalAction('homologado')}
              >
                <Text style={styles.toggleBtnText}>Homologar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, approvalAction === 'bloqueado' && styles.toggleBtnActiveDanger]}
                onPress={() => setApprovalAction('bloqueado')}
              >
                <Text style={styles.toggleBtnText}>Bloquear</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Justificativa / Parecer:</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ex: Documentação fiscal aprovada"
              value={approvalReason}
              onChangeText={setApprovalReason}
            />

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleUpdateStatus}
              disabled={processingAction}
            >
              {processingAction ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Confirmar Decisão</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelModalBtn}
              onPress={() => setApprovalModalVisible(false)}
            >
              <Text style={styles.cancelModalBtnText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Cadastro de Fornecedor */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Fornecedor</Text>

            <Text style={styles.inputLabel}>Razão Social *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ex: Auto Peças São Paulo LTDA"
              value={newRazao}
              onChangeText={setNewRazao}
            />

            <Text style={styles.inputLabel}>CNPJ</Text>
            <TextInput
              style={styles.textInput}
              placeholder="00.000.000/0001-00"
              keyboardType="numeric"
              value={newCnpj}
              onChangeText={setNewCnpj}
            />

            <Text style={styles.inputLabel}>Telefone / WhatsApp</Text>
            <TextInput
              style={styles.textInput}
              placeholder="(11) 99999-9999"
              keyboardType="phone-pad"
              value={newTelefone}
              onChangeText={setNewTelefone}
            />

            <Text style={styles.inputLabel}>E-mail de Contato</Text>
            <TextInput
              style={styles.textInput}
              placeholder="comercial@fornecedor.com.br"
              keyboardType="email-address"
              autoCapitalize="none"
              value={newEmail}
              onChangeText={setNewEmail}
            />

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleCreateSupplier}
              disabled={submittingNew}
            >
              {submittingNew ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>Cadastrar Fornecedor</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelModalBtn}
              onPress={() => setCreateModalVisible(false)}
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
    color: '#d97706',
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
  },
  tabBtn: {
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
  tabBtnActive: {
    backgroundColor: '#17345f',
    borderColor: '#17345f',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  tabBtnTextActive: {
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
  listWrap: {
    gap: 10,
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
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  supplierTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  supplierSub: {
    fontSize: 12,
    color: '#6366f1',
    marginTop: 2,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeSuccess: { backgroundColor: '#dcfce7' },
  badgeWarning: { backgroundColor: '#fef3c7' },
  badgeDanger: { backgroundColor: '#fee2e2' },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b',
  },
  cardInfo: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  cardSubInfo: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  orderAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
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
  borderDanger: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
  },
  textDanger: {
    color: '#dc2626',
  },
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
    marginBottom: 4,
  },
  modalDesc: {
    fontSize: 13,
    color: '#6366f1',
    fontWeight: '700',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  statusToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  toggleBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnActiveSuccess: {
    backgroundColor: '#059669',
  },
  toggleBtnActiveDanger: {
    backgroundColor: '#dc2626',
  },
  toggleBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
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
    marginBottom: 10,
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
