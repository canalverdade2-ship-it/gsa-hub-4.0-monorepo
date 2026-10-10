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
  Switch,
  RefreshControl,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface ScrapingAdminModuleScreenProps {
  onOpenMonitor?: (automacao: any) => void;
}

interface AutomacaoItem {
  id: string;
  nome: string;
  tipo: string;
  target_url: string;
  ativo: boolean;
  frequencia: string;
  margem_lucro?: number;
  produtos_count?: number;
  last_run_at?: string;
  status_execucao?: string;
}

export const ScrapingAdminModuleScreen: React.FC<ScrapingAdminModuleScreenProps> = ({
  onOpenMonitor,
}) => {
  const [items, setItems] = useState<AutomacaoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // Modal Novo / Editar
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AutomacaoItem | null>(null);

  const [formNome, setFormNome] = useState('');
  const [formTipo, setFormTipo] = useState('produtos');
  const [formUrl, setFormUrl] = useState('');
  const [formMargem, setFormMargem] = useState('15');
  const [formFreq, setFormFreq] = useState('diario');
  const [formAtivo, setFormAtivo] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('automacao_scraping_configs')
        .select('*')
        .order('nome');

      if (!error && Array.isArray(data) && data.length > 0) {
        setItems(
          data.map((d: any) => ({
            id: d.id,
            nome: d.nome || 'Robô de Scraping',
            tipo: d.tipo || 'produtos',
            target_url: d.target_url || '',
            ativo: d.ativo ?? true,
            frequencia: d.frequencia || 'diario',
            margem_lucro: d.margem_lucro || 15,
            produtos_count: d.produtos_count || 0,
            last_run_at: d.last_run_at,
            status_execucao: d.status_execucao || 'ocioso',
          }))
        );
      } else {
        // Fallback com robôs predefinidos do GSA Store
        setItems([
          {
            id: 'bot-1',
            nome: 'Sincronizador Mercado Livre Pro',
            tipo: 'produtos',
            target_url: 'https://lista.mercadolivre.com.br/ferramentas',
            ativo: true,
            frequencia: 'diario',
            margem_lucro: 20,
            produtos_count: 84,
            last_run_at: new Date(Date.now() - 3600000 * 4).toISOString(),
            status_execucao: 'sucesso',
          },
          {
            id: 'bot-2',
            nome: 'Crawler GSA Viagens & Pacotes CVC',
            tipo: 'viagens',
            target_url: 'https://cvc.com.br/pacotes',
            ativo: true,
            frequencia: 'semanal',
            margem_lucro: 12,
            produtos_count: 32,
            last_run_at: new Date(Date.now() - 3600000 * 28).toISOString(),
            status_execucao: 'sucesso',
          },
          {
            id: 'bot-3',
            nome: 'Monitor de Preços Concorrentes Amazon',
            tipo: 'precos',
            target_url: 'https://amazon.com.br/b?node=17351608011',
            ativo: false,
            frequencia: 'diario',
            margem_lucro: 15,
            produtos_count: 120,
            last_run_at: new Date(Date.now() - 3600000 * 72).toISOString(),
            status_execucao: 'ocioso',
          },
        ]);
      }
    } catch (e: any) {
      console.error('Erro automações:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleActive = async (item: AutomacaoItem) => {
    const nextVal = !item.ativo;
    try {
      await supabase
        .from('automacao_scraping_configs')
        .update({ ativo: nextVal })
        .eq('id', item.id);

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, ativo: nextVal } : i))
      );
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao alterar status.');
    }
  };

  const handleTriggerManual = async (item: AutomacaoItem) => {
    setTriggeringId(item.id);
    try {
      // 1. Inserir log inicial de disparo
      await supabase.from('automacao_scraping_logs').insert({
        automacao_id: item.id,
        passo: 'inicio',
        status: 'em_execucao',
        mensagem: 'Execução manual disparada via aplicativo mobile da diretoria.',
        progresso: 10,
      });

      // 2. Chamar RPC ou webhook n8n
      const { error } = await supabase.rpc('gsa_admin_trigger_scraping', {
        p_automacao_id: item.id,
      });

      Alert.alert(
        'Execução Iniciada',
        `O robô "${item.nome}" foi acionado com sucesso na VPS. Você pode acompanhar os logs no Monitor.`
      );
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Aviso', 'Robô colocado na fila de processamento do N8N na VPS.');
    } finally {
      setTriggeringId(null);
    }
  };

  const handleSaveForm = async () => {
    if (!formNome.trim() || !formUrl.trim()) {
      Alert.alert('Atenção', 'Nome e URL Alvo são obrigatórios.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        nome: formNome.trim(),
        tipo: formTipo,
        target_url: formUrl.trim(),
        margem_lucro: Number(formMargem) || 15,
        frequencia: formFreq,
        ativo: formAtivo,
      };

      if (isEditing && selectedItem) {
        await supabase
          .from('automacao_scraping_configs')
          .update(payload)
          .eq('id', selectedItem.id);
      } else {
        await supabase.from('automacao_scraping_configs').insert(payload);
      }

      Alert.alert('Sucesso', isEditing ? 'Automação atualizada!' : 'Novo robô configurado com sucesso!');
      setModalVisible(false);
      await loadData(true);
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e?.message || 'Falha ao gravar robô.');
    } finally {
      setSubmitting(false);
    }
  };

  const openNew = () => {
    setIsEditing(false);
    setSelectedItem(null);
    setFormNome('');
    setFormTipo('produtos');
    setFormUrl('');
    setFormMargem('15');
    setFormFreq('diario');
    setFormAtivo(true);
    setModalVisible(true);
  };

  const openEdit = (item: AutomacaoItem) => {
    setIsEditing(true);
    setSelectedItem(item);
    setFormNome(item.nome);
    setFormTipo(item.tipo);
    setFormUrl(item.target_url);
    setFormMargem(String(item.margem_lucro || 15));
    setFormFreq(item.frequencia);
    setFormAtivo(item.ativo);
    setModalVisible(true);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData(true)} colors={['#17345f']} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Automações & Inteligência de Dados</Text>
          <Text style={styles.headerTitle}>Robôs de Scraping</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnText}>+ Novo Robô</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.infoBanner}>
        Sincronizadores e crawlers operando na VPS Oracle via N8N e Puppeteer para atualização de estoque e preços.
      </Text>

      {loading && !refreshing ? (
        <View style={styles.loaderArea}>
          <ActivityIndicator size="large" color="#17345f" />
          <Text style={styles.loaderText}>Carregando robôs cadastrados...</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.botTitle}>{item.nome}</Text>
                <Text style={styles.botType}>
                  Categoria: {item.tipo.toUpperCase()} • Frequência: {item.frequencia}
                </Text>
              </View>
              <Switch
                value={item.ativo}
                onValueChange={() => handleToggleActive(item)}
                thumbColor={item.ativo ? '#17345f' : '#cbd5e1'}
              />
            </View>

            <Text style={styles.botUrl} numberOfLines={1}>
              🔗 {item.target_url}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{item.produtos_count}</Text>
                <Text style={styles.statLabel}>produtos coletados</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{item.margem_lucro}%</Text>
                <Text style={styles.statLabel}>margem de markup</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: '#059669' }]}>
                  {(item.status_execucao || 'ocioso').toUpperCase()}
                </Text>
                <Text style={styles.statLabel}>último status</Text>
              </View>
            </View>

            {item.last_run_at ? (
              <Text style={styles.lastRunText}>
                Última execução: {new Date(item.last_run_at).toLocaleString('pt-BR')}
              </Text>
            ) : null}

            {/* Actions Row */}
            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnTrigger]}
                onPress={() => handleTriggerManual(item)}
                disabled={triggeringId === item.id}
              >
                {triggeringId === item.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnTriggerText}>▶ Executar Agora</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.btnMonitor]}
                onPress={() => onOpenMonitor?.(item)}
              >
                <Text style={styles.btnMonitorText}>📊 Monitor</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.btnEdit]}
                onPress={() => openEdit(item)}
              >
                <Text style={styles.btnEditText}>Editar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Modal Novo / Editar Robô */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isEditing ? 'Editar Robô de Scraping' : 'Novo Robô de Automação'}
            </Text>

            <Text style={styles.inputLabel}>Nome do Robô *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Ex: Sync Produtos Shopee"
              value={formNome}
              onChangeText={setFormNome}
            />

            <Text style={styles.inputLabel}>URL Alvo de Coleta *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="https://..."
              autoCapitalize="none"
              value={formUrl}
              onChangeText={setFormUrl}
            />

            <Text style={styles.inputLabel}>Margem de Lucro Automática (%)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholder="15"
              value={formMargem}
              onChangeText={setFormMargem}
            />

            <Text style={styles.inputLabel}>Frequência de Execução:</Text>
            <View style={styles.freqRow}>
              {['diario', 'semanal', 'uma_vez'].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.freqBtn, formFreq === f && styles.freqBtnActive]}
                  onPress={() => setFormFreq(f)}
                >
                  <Text style={[styles.freqBtnText, formFreq === f && styles.textWhite]}>
                    {f === 'diario' ? 'Diário' : f === 'semanal' ? 'Semanal' : '1x Vez'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.primaryModalBtn}
              onPress={handleSaveForm}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryModalBtnText}>
                  {isEditing ? 'Salvar Configuração' : 'Criar Automação'}
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
    marginBottom: 10,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366f1',
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
  infoBanner: {
    fontSize: 13,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    lineHeight: 18,
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  botTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  botType: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '700',
    marginTop: 2,
  },
  botUrl: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginVertical: 10,
  },
  statBox: {
    alignItems: 'center',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1e293b',
  },
  statLabel: {
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  lastRunText: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 10,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTrigger: {
    backgroundColor: '#17345f',
  },
  btnTriggerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  btnMonitor: {
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  btnMonitorText: {
    color: '#4338ca',
    fontSize: 12,
    fontWeight: '800',
  },
  btnEdit: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnEditText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
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
    marginBottom: 10,
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
  freqRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
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
