import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  Image,
} from 'react-native';
import { supabase } from '../../../supabase';

export type ClassifiedsTab = 'anuncios' | 'propostas' | 'mensagens' | 'financeiro';

export interface ClassifiedItem {
  id: string;
  titulo?: string;
  descricao?: string;
  categoria?: string;
  preco?: number;
  status?: string;
  cliente_id?: string;
  cidade?: string;
  estado?: string;
  created_at?: string;
  [key: string]: any;
}

export interface ClassifiedProposal {
  id: string;
  anuncio_id: string;
  comprador_id?: string;
  valor_proposta?: number;
  mensagem_inicial?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export interface ClassifiedMessage {
  id: string;
  proposta_id: string;
  conteudo?: string;
  mensagem?: string;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export interface ClassifiedTransaction {
  id: string;
  anuncio_id?: string;
  valor_total?: number;
  valor_proposta?: number;
  valor_comissao?: number;
  status?: string;
  created_at?: string;
  [key: string]: any;
}

export const ClassificadosModuleScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ClassifiedsTab>('anuncios');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Data lists
  const [anuncios, setAnuncios] = useState<ClassifiedItem[]>([]);
  const [propostas, setPropostas] = useState<ClassifiedProposal[]>([]);
  const [mensagens, setMensagens] = useState<ClassifiedMessage[]>([]);
  const [transacoes, setTransacoes] = useState<ClassifiedTransaction[]>([]);

  // Details Modal
  const [selectedAnuncio, setSelectedAnuncio] = useState<ClassifiedItem | null>(null);
  const [detailsMedia, setDetailsMedia] = useState<any[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Reject Modal
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ entity: 'anuncio' | 'proposta' | 'mensagem'; item: any } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      if (activeTab === 'anuncios') {
        const { data, error } = await supabase
          .from('classificados_anuncios')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60);
        if (error) console.warn('Aviso classificados_anuncios:', error.message);
        setAnuncios(data || []);
      } else if (activeTab === 'propostas') {
        const { data, error } = await supabase
          .from('classificados_propostas')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60);
        if (error) console.warn('Aviso classificados_propostas:', error.message);
        setPropostas(data || []);
      } else if (activeTab === 'mensagens') {
        const { data, error } = await supabase
          .from('classificados_mensagens')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60);
        if (error) console.warn('Aviso classificados_mensagens:', error.message);
        setMensagens(data || []);
      } else if (activeTab === 'financeiro') {
        const { data, error } = await supabase
          .from('classificados_transacoes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60);
        if (error) console.warn('Aviso classificados_transacoes:', error.message);
        setTransacoes(data || []);
      }
    } catch (e: any) {
      console.warn('Erro ao carregar classificados:', e?.message || e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch Media when details opened
  useEffect(() => {
    if (selectedAnuncio?.id) {
      setLoadingMedia(true);
      supabase
        .from('classificados_midias')
        .select('*')
        .eq('anuncio_id', selectedAnuncio.id)
        .order('ordem', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            setDetailsMedia(data);
          } else {
            setDetailsMedia([]);
          }
          setLoadingMedia(false);
        });
    } else {
      setDetailsMedia([]);
    }
  }, [selectedAnuncio]);

  // Moderation Handler
  const handleModerate = async (
    entity: 'anuncio' | 'proposta' | 'mensagem',
    item: any,
    action: 'aprovar' | 'rejeitar',
    reason?: string
  ) => {
    setProcessingId(item.id);
    try {
      // 1. Try RPC first
      const { error: rpcErr } = await supabase.rpc('gsa_admin_classified_action', {
        p_entity: entity,
        p_id: item.id,
        p_related_id: entity === 'mensagem' ? item.proposta_id : null,
        p_action: action,
        p_reason: reason?.trim() || null,
      });

      // 2. Direct table fallback if RPC fails
      if (rpcErr) {
        if (entity === 'anuncio') {
          const nextStatus = action === 'aprovar' ? 'ativo' : 'rejeitado';
          await supabase.from('classificados_anuncios').update({ status: nextStatus }).eq('id', item.id);
        } else if (entity === 'proposta') {
          const nextStatus = action === 'aprovar' ? 'aprovada' : 'rejeitada';
          await supabase.from('classificados_propostas').update({ status: nextStatus }).eq('id', item.id);
        } else if (entity === 'mensagem') {
          const nextStatus = action === 'aprovar' ? 'aprovada' : 'rejeitada';
          await supabase.from('classificados_mensagens').update({ status: nextStatus }).eq('id', item.id);
        }
      }

      Alert.alert('Sucesso', action === 'aprovar' ? 'Registro aprovado com sucesso!' : 'Registro rejeitado.');
      if (selectedAnuncio?.id === item.id) {
        setSelectedAnuncio(null);
      }
      loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao moderar', e.message || 'Falha ao processar moderação.');
    } finally {
      setProcessingId(null);
      setRejectModalVisible(false);
      setRejectTarget(null);
      setRejectReason('');
    }
  };

  // Filtered lists
  const filteredAnuncios = useMemo(() => {
    if (!search.trim()) return anuncios;
    const s = search.toLowerCase();
    return anuncios.filter(
      (a) =>
        a.titulo?.toLowerCase().includes(s) ||
        a.categoria?.toLowerCase().includes(s) ||
        a.cidade?.toLowerCase().includes(s) ||
        a.id?.toLowerCase().includes(s)
    );
  }, [anuncios, search]);

  const filteredPropostas = useMemo(() => {
    if (!search.trim()) return propostas;
    const s = search.toLowerCase();
    return propostas.filter(
      (p) =>
        p.id?.toLowerCase().includes(s) ||
        p.anuncio_id?.toLowerCase().includes(s) ||
        p.mensagem_inicial?.toLowerCase().includes(s)
    );
  }, [propostas, search]);

  const filteredMensagens = useMemo(() => {
    if (!search.trim()) return mensagens;
    const s = search.toLowerCase();
    return mensagens.filter(
      (m) =>
        (m.conteudo || m.mensagem)?.toLowerCase().includes(s) ||
        m.proposta_id?.toLowerCase().includes(s)
    );
  }, [mensagens, search]);

  const filteredTransacoes = useMemo(() => {
    if (!search.trim()) return transacoes;
    const s = search.toLowerCase();
    return transacoes.filter(
      (t) =>
        t.id?.toLowerCase().includes(s) ||
        t.anuncio_id?.toLowerCase().includes(s) ||
        t.status?.toLowerCase().includes(s)
    );
  }, [transacoes, search]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={`Buscar em ${activeTab}...`}
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.tabsRow}>
        {(
          [
            { id: 'anuncios', label: 'Anúncios', icon: '🏷️' },
            { id: 'propostas', label: 'Propostas', icon: '🤝' },
            { id: 'mensagens', label: 'Mensagens', icon: '💬' },
            { id: 'financeiro', label: 'Transações', icon: '💳' },
          ] as const
        ).map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabButton, activeTab === t.id && styles.tabButtonActive]}
            onPress={() => {
              setActiveTab(t.id);
              setSearch('');
            }}
          >
            <Text style={styles.tabIcon}>{t.icon}</Text>
            <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loaderText}>Carregando {activeTab}...</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* TAB 1: ANUNCIOS */}
          {activeTab === 'anuncios' && (
            <FlatList
              data={filteredAnuncios}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardCategory}>{item.categoria || 'Geral'}</Text>
                      <Text style={styles.cardTitle}>{item.titulo || `Anúncio #${item.id?.substring(0, 8)}`}</Text>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        item.status === 'ativo'
                          ? styles.badgeSuccess
                          : item.status === 'rejeitado'
                          ? styles.badgeDanger
                          : styles.badgeWarning,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          item.status === 'ativo'
                            ? styles.badgeTextSuccess
                            : item.status === 'rejeitado'
                            ? styles.badgeTextDanger
                            : styles.badgeTextWarning,
                        ]}
                      >
                        {item.status || 'pendente'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.cardPrice}>
                    R$ {Number(item.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                  {item.cidade ? (
                    <Text style={styles.cardLocation}>
                      📍 {item.cidade} {item.estado ? `- ${item.estado}` : ''}
                    </Text>
                  ) : null}

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.detailsBtn}
                      onPress={() => setSelectedAnuncio(item)}
                    >
                      <Text style={styles.detailsBtnText}>👁️ Detalhes</Text>
                    </TouchableOpacity>

                    {item.status !== 'rejeitado' && (
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        disabled={processingId === item.id}
                        onPress={() => {
                          setRejectTarget({ entity: 'anuncio', item });
                          setRejectModalVisible(true);
                        }}
                      >
                        <Text style={styles.rejectBtnText}>✕ Rejeitar</Text>
                      </TouchableOpacity>
                    )}

                    {item.status !== 'ativo' && (
                      <TouchableOpacity
                        style={styles.approveBtn}
                        disabled={processingId === item.id}
                        onPress={() => handleModerate('anuncio', item, 'aprovar')}
                      >
                        <Text style={styles.approveBtnText}>✓ Aprovar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Nenhum anúncio encontrado.</Text>
                </View>
              }
            />
          )}

          {/* TAB 2: PROPOSTAS */}
          {activeTab === 'propostas' && (
            <FlatList
              data={filteredPropostas}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardCategory}>Proposta #{item.id?.substring(0, 8)}</Text>
                    <View style={[styles.badge, styles.badgeWarning]}>
                      <Text style={[styles.badgeText, styles.badgeTextWarning]}>{item.status || 'em_analise'}</Text>
                    </View>
                  </View>

                  <Text style={styles.cardPrice}>
                    Oferta: R$ {Number(item.valor_proposta || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.cardLocation}>Anúncio ID: {item.anuncio_id?.substring(0, 8)}</Text>
                  {item.mensagem_inicial ? (
                    <View style={styles.quoteBox}>
                      <Text style={styles.quoteText}>"{item.mensagem_inicial}"</Text>
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      disabled={processingId === item.id}
                      onPress={() => {
                        setRejectTarget({ entity: 'proposta', item });
                        setRejectModalVisible(true);
                      }}
                    >
                      <Text style={styles.rejectBtnText}>✕ Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      disabled={processingId === item.id}
                      onPress={() => handleModerate('proposta', item, 'aprovar')}
                    >
                      <Text style={styles.approveBtnText}>✓ Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Nenhuma proposta encontrada.</Text>
                </View>
              }
            />
          )}

          {/* TAB 3: MENSAGENS */}
          {activeTab === 'mensagens' && (
            <FlatList
              data={filteredMensagens}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardCategory}>Mensagem na Proposta #{item.proposta_id?.substring(0, 8)}</Text>
                    <View style={[styles.badge, styles.badgeWarning]}>
                      <Text style={[styles.badgeText, styles.badgeTextWarning]}>{item.status || 'pendente'}</Text>
                    </View>
                  </View>

                  <View style={styles.quoteBox}>
                    <Text style={styles.quoteText}>{item.conteudo || item.mensagem || 'Sem conteúdo'}</Text>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      disabled={processingId === item.id}
                      onPress={() => {
                        setRejectTarget({ entity: 'mensagem', item });
                        setRejectModalVisible(true);
                      }}
                    >
                      <Text style={styles.rejectBtnText}>✕ Rejeitar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      disabled={processingId === item.id}
                      onPress={() => handleModerate('mensagem', item, 'aprovar')}
                    >
                      <Text style={styles.approveBtnText}>✓ Aprovar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Nenhuma mensagem pendente.</Text>
                </View>
              }
            />
          )}

          {/* TAB 4: TRANSAÇÕES */}
          {activeTab === 'financeiro' && (
            <FlatList
              data={filteredTransacoes}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardCategory}>Transação #{item.id?.substring(0, 8)}</Text>
                    <View
                      style={[
                        styles.badge,
                        item.status === 'pago' ? styles.badgeSuccess : styles.badgeWarning,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          item.status === 'pago' ? styles.badgeTextSuccess : styles.badgeTextWarning,
                        ]}
                      >
                        {item.status || 'pendente'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.cardPrice}>
                    Total: R$ {Number(item.valor_total || item.valor_proposta || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={[styles.cardPrice, { color: '#059669', fontSize: 16, marginTop: 4 }]}>
                    Comissão GSA: R$ {Number(item.valor_comissao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.cardLocation}>Anúncio Vinculado: #{item.anuncio_id?.substring(0, 8)}</Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Nenhuma transação encontrada.</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* DETAIL MODAL (ANÚNCIO) */}
      <Modal visible={!!selectedAnuncio} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhes do Anúncio</Text>
              <TouchableOpacity onPress={() => setSelectedAnuncio(null)}>
                <Text style={styles.modalCloseText}>✕ Fechar</Text>
              </TouchableOpacity>
            </View>

            {selectedAnuncio && (
              <ScrollView style={{ maxHeight: 480 }}>
                {loadingMedia ? (
                  <ActivityIndicator size="small" color="#17345f" style={{ marginVertical: 12 }} />
                ) : detailsMedia.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
                    {detailsMedia.map((m, idx) => (
                      <Image
                        key={idx}
                        source={{ uri: m.url }}
                        style={styles.mediaImage}
                        resizeMode="cover"
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.noMediaBox}>
                    <Text style={styles.noMediaText}>Sem fotos anexadas</Text>
                  </View>
                )}

                <Text style={styles.detailCategory}>{selectedAnuncio.categoria || 'Geral'}</Text>
                <Text style={styles.detailMainTitle}>{selectedAnuncio.titulo}</Text>
                <Text style={styles.detailPrice}>
                  R$ {Number(selectedAnuncio.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>

                <View style={styles.detailBox}>
                  <Text style={styles.detailBoxLabel}>Descrição do Anúncio:</Text>
                  <Text style={styles.detailBoxText}>{selectedAnuncio.descricao || 'Sem descrição informada.'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>Localização:</Text>
                  <Text style={styles.detailRowValue}>
                    {selectedAnuncio.cidade || 'N/A'} {selectedAnuncio.estado ? `- ${selectedAnuncio.estado}` : ''}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>Status Atual:</Text>
                  <Text style={[styles.detailRowValue, { fontWeight: 'bold' }]}>{selectedAnuncio.status || 'pendente'}</Text>
                </View>

                <View style={[styles.actionRow, { marginTop: 20 }]}>
                  {selectedAnuncio.status !== 'rejeitado' && (
                    <TouchableOpacity
                      style={[styles.rejectBtn, { flex: 1 }]}
                      onPress={() => {
                        setRejectTarget({ entity: 'anuncio', item: selectedAnuncio });
                        setRejectModalVisible(true);
                      }}
                    >
                      <Text style={styles.rejectBtnText}>✕ Rejeitar Anúncio</Text>
                    </TouchableOpacity>
                  )}
                  {selectedAnuncio.status !== 'ativo' && (
                    <TouchableOpacity
                      style={[styles.approveBtn, { flex: 1 }]}
                      onPress={() => handleModerate('anuncio', selectedAnuncio, 'aprovar')}
                    >
                      <Text style={styles.approveBtnText}>✓ Aprovar Anúncio</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* REJECT REASON MODAL */}
      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 320 }]}>
            <Text style={styles.modalTitle}>Motivo da Rejeição</Text>
            <Text style={styles.rejectModalDesc}>
              Informe o motivo para notificar o usuário e registrar no histórico de auditoria:
            </Text>
            <TextInput
              style={styles.rejectInput}
              placeholder="Ex: Imagens de baixa qualidade, dados incorretos..."
              placeholderTextColor="#9ca3af"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.detailsBtn, { flex: 1 }]}
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectTarget(null);
                  setRejectReason('');
                }}
              >
                <Text style={styles.detailsBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectBtn, { flex: 1 }]}
                onPress={() => {
                  if (rejectTarget) {
                    handleModerate(rejectTarget.entity, rejectTarget.item, 'rejeitar', rejectReason);
                  }
                }}
              >
                <Text style={styles.rejectBtnText}>Confirmar Rejeição</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ClassificadosModuleScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 4,
  },
  tabButtonActive: {
    borderBottomColor: '#17345f',
  },
  tabIcon: {
    fontSize: 14,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#17345f',
    fontWeight: '700',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loaderText: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  cardPrice: {
    fontSize: 17,
    fontWeight: '800',
    color: '#17345f',
    marginTop: 4,
  },
  cardLocation: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  quoteBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  quoteText: {
    fontSize: 13,
    color: '#334155',
    fontStyle: 'italic',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeSuccess: {
    backgroundColor: '#dcfce7',
  },
  badgeTextSuccess: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
  },
  badgeTextWarning: {
    color: '#b45309',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeDanger: {
    backgroundColor: '#fee2e2',
  },
  badgeTextDanger: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    justifyContent: 'flex-end',
  },
  detailsBtn: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  approveBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  rejectBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    maxHeight: 560,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  modalCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  mediaRow: {
    marginBottom: 12,
  },
  mediaImage: {
    width: 140,
    height: 100,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#e5e7eb',
  },
  noMediaBox: {
    height: 60,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  noMediaText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  detailCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  detailMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  detailPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: '#17345f',
    marginVertical: 6,
  },
  detailBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginVertical: 8,
  },
  detailBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  detailBoxText: {
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  detailRowLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  detailRowValue: {
    fontSize: 13,
    color: '#1e293b',
  },
  rejectModalDesc: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 12,
  },
  rejectInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#1e293b',
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
});
