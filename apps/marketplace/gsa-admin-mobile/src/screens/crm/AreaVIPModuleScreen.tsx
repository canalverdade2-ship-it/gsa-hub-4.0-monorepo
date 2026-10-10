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
  Switch,
  Platform,
} from 'react-native';
import { supabase } from '../../../supabase';

type VIPTab = 'membros' | 'niveis' | 'beneficios' | 'config';

interface VIPLevelItem {
  id: string;
  name: string;
  minPoints: number;
  maxPoints: number;
  multiplier: number;
  color: string;
  discount: number;
  benefits: string[];
}

const DEFAULT_LEVELS: VIPLevelItem[] = [
  {
    id: 'copper',
    name: 'Bronze / Copper',
    minPoints: 0,
    maxPoints: 999,
    multiplier: 1.0,
    color: '#cd7f32',
    discount: 0,
    benefits: ['Acesso a promoções gerais', 'Acúmulo padrão de pontos'],
  },
  {
    id: 'silver',
    name: 'Prata / Silver',
    minPoints: 1000,
    maxPoints: 4999,
    multiplier: 1.2,
    color: '#94a3b8',
    discount: 5,
    benefits: ['5% de desconto em serviços', 'Fila de atendimento prioritária', 'Multiplicador 1.2x'],
  },
  {
    id: 'gold',
    name: 'Ouro / Gold',
    minPoints: 5000,
    maxPoints: 14999,
    multiplier: 1.5,
    color: '#eab308',
    discount: 10,
    benefits: ['10% de desconto em serviços', 'Voucher de aniversário', 'Multiplicador 1.5x', 'Suporte VIP'],
  },
  {
    id: 'diamond',
    name: 'Diamante / Diamond',
    minPoints: 15000,
    maxPoints: 49999,
    multiplier: 2.0,
    color: '#0284c7',
    discount: 15,
    benefits: ['15% de desconto em serviços', 'Multiplicador 2.0x', 'Gerente de contas dedicado', 'Isenção de taxas'],
  },
  {
    id: 'black',
    name: 'Black Luxury',
    minPoints: 50000,
    maxPoints: 999999,
    multiplier: 3.0,
    color: '#0f172a',
    discount: 25,
    benefits: ['25% de desconto em serviços', 'Multiplicador 3.0x', 'Acesso irrestrito a eventos VIP', 'Atendimento 24/7'],
  },
];

export const AreaVIPModuleScreen = () => {
  const [activeTab, setActiveTab] = useState<VIPTab>('membros');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Data
  const [members, setMembers] = useState<any[]>([]);
  const [levels, setLevels] = useState<VIPLevelItem[]>(DEFAULT_LEVELS);
  const [beneficios, setBeneficios] = useState<any[]>([]);

  // Config toggles
  const [moduleActive, setModuleActive] = useState(true);
  const [moduleHidden, setModuleHidden] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Modals
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>('silver');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [benefitModalVisible, setBenefitModalVisible] = useState(false);
  const [newBenefitTitle, setNewBenefitTitle] = useState('');
  const [newBenefitDesc, setNewBenefitDesc] = useState('');
  const [newBenefitTier, setNewBenefitTier] = useState('gold');
  const [savingBenefit, setSavingBenefit] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // 1. Fetch VIP members
      const { data: clientData, error: clientErr } = await supabase
        .from('clientes')
        .select('id, nome, nome_razao, cpf, email, telefone, saldo_pontos, pontos_totais, saldo_carteira, nivel_vip, nivel_manual_info')
        .order('pontos_totais', { ascending: false })
        .limit(100);

      if (!clientErr && clientData) {
        setMembers(clientData);
      }

      // 2. Fetch Levels from client_levels if available
      const { data: levelsData, error: levelsErr } = await supabase
        .from('client_levels')
        .select('*')
        .order('pontos_minimos', { ascending: true });

      if (!levelsErr && levelsData && levelsData.length > 0) {
        const mapped: VIPLevelItem[] = levelsData.map(l => ({
          id: l.id || l.nome_nivel.toLowerCase(),
          name: l.nome_nivel,
          minPoints: Number(l.pontos_minimos || 0),
          maxPoints: Number(l.pontos_maximos || 99999),
          multiplier: Number(l.pontos_por_real || 1),
          color: l.cor || '#4f46e5',
          discount: Number(l.desconto_porcentagem || 0),
          benefits: Array.isArray(l.benefits) ? l.benefits : ['Benefícios padrão'],
        }));
        setLevels(mapped);
      }

      // 3. Fetch VIP Beneficios
      const { data: benData, error: benErr } = await supabase
        .from('vip_beneficios')
        .select('*')
        .order('created_at', { ascending: false });

      if (!benErr && benData) {
        setBeneficios(benData);
      } else {
        // Fallback default benefits
        setBeneficios([
          { id: '1', titulo: 'Desconto Progressivo em Serviços', nivel_minimo: 'Prata', ativo: true, descricao: 'Descontos de 5% a 25% na contratação de serviços residenciais e corporativos.' },
          { id: '2', titulo: 'Atendimento Prioritário no Helpdesk', nivel_minimo: 'Ouro', ativo: true, descricao: 'Chamados direcionados para fila VIP com resposta em até 30 minutos.' },
          { id: '3', titulo: 'Voucher Anual de Aniversário', nivel_minimo: 'Ouro', ativo: true, descricao: 'Crédito de R$ 100,00 na carteira digital na data de aniversário do membro.' },
          { id: '4', titulo: 'Gerente de Contas Dedicado', nivel_minimo: 'Diamante', ativo: true, descricao: 'Canal exclusivo direto via WhatsApp com executivo sênior GSA.' },
        ]);
      }

      // 4. Fetch System Settings for module status
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['modulo_area_vip_ativo', 'modulo_area_vip_oculto']);

      if (settingsData) {
        const ativo = settingsData.find(s => s.key === 'modulo_area_vip_ativo')?.value;
        const oculto = settingsData.find(s => s.key === 'modulo_area_vip_oculto')?.value;
        setModuleActive(ativo !== 'false');
        setModuleHidden(oculto === 'true');
      }
    } catch (err: any) {
      console.warn('Erro ao carregar Área VIP:', err.message);
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

  // Adjust VIP Tier
  const handleSaveAdjust = async () => {
    if (!selectedMember) return;
    setSavingAdjust(true);
    try {
      const selectedLevelObj = levels.find(l => l.id === selectedTier) || levels[0];
      const levelName = selectedLevelObj.name;
      const note = `Ajuste manual para ${levelName} em ${new Date().toLocaleDateString('pt-BR')}${adjustReason ? ` (${adjustReason})` : ''}`;

      const { error } = await supabase
        .from('clientes')
        .update({
          nivel_vip: levelName,
          nivel_manual_info: note,
        })
        .eq('id', selectedMember.id);

      if (error) throw error;

      Alert.alert('Sucesso', `Nível do cliente alterado para ${levelName}!`);
      setMembers(prev =>
        prev.map(m => (m.id === selectedMember.id ? { ...m, nivel_vip: levelName, nivel_manual_info: note } : m))
      );
      setAdjustModalVisible(false);
      setAdjustReason('');
    } catch (err: any) {
      Alert.alert('Erro ao ajustar nível', err.message);
    } finally {
      setSavingAdjust(false);
    }
  };

  // Add Benefit
  const handleSaveBenefit = async () => {
    if (!newBenefitTitle.trim()) {
      Alert.alert('Validação', 'Informe o título do benefício.');
      return;
    }
    setSavingBenefit(true);
    try {
      const payload = {
        titulo: newBenefitTitle.trim(),
        descricao: newBenefitDesc.trim() || null,
        nivel_minimo: newBenefitTier,
        ativo: true,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('vip_beneficios').insert([payload]).select();
      if (!error && data) {
        setBeneficios(prev => [data[0], ...prev]);
      } else {
        // Local fallback
        setBeneficios(prev => [{ ...payload, id: String(Date.now()) }, ...prev]);
      }

      Alert.alert('Sucesso', 'Benefício VIP cadastrado!');
      setBenefitModalVisible(false);
      setNewBenefitTitle('');
      setNewBenefitDesc('');
    } catch (err: any) {
      Alert.alert('Erro ao salvar benefício', err.message);
    } finally {
      setSavingBenefit(false);
    }
  };

  // Toggle module settings
  const handleToggleModuleActive = async (val: boolean) => {
    setSavingConfig(true);
    try {
      setModuleActive(val);
      await supabase.from('system_settings').upsert([
        { key: 'modulo_area_vip_ativo', value: String(val) },
      ]);
      Alert.alert('Configuração Salva', `Módulo Área VIP agora está ${val ? 'ATIVO' : 'DESATIVADO'}.`);
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleToggleModuleHidden = async (val: boolean) => {
    setSavingConfig(true);
    try {
      setModuleHidden(val);
      await supabase.from('system_settings').upsert([
        { key: 'modulo_area_vip_oculto', value: String(val) },
      ]);
      Alert.alert('Visibilidade Alterada', `Área VIP ${val ? 'oculta no app do cliente' : 'visível para clientes'}.`);
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  // Filter members
  const filteredMembers = members.filter(m => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    const name = (m.nome || m.nome_razao || '').toLowerCase();
    const doc = (m.cpf || '').toLowerCase();
    const tier = (m.nivel_vip || '').toLowerCase();
    return name.includes(term) || doc.includes(term) || tier.includes(term);
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>👑 Área VIP & Fidelidade</Text>
          <Text style={styles.headerSubtitle}>
            Gestão de membros VIP, tiers, anuidade e benefícios
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: moduleActive ? '#dcfce7' : '#fee2e2' }]}>
          <Text style={[styles.statusBadgeText, { color: moduleActive ? '#15803d' : '#b91c1c' }]}>
            {moduleActive ? 'VIP ATIVO' : 'PAUSADO'}
          </Text>
        </View>
      </View>

      {/* KPI Cards */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Membros</Text>
          <Text style={styles.kpiValue}>{members.length}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Tiers</Text>
          <Text style={[styles.kpiValue, { color: '#eab308' }]}>{levels.length}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Benefícios</Text>
          <Text style={[styles.kpiValue, { color: '#6366f1' }]}>{beneficios.length}</Text>
        </View>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'membros' && styles.tabBtnActive]}
          onPress={() => setActiveTab('membros')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'membros' && styles.tabBtnTextActive]}>
            Membros
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'niveis' && styles.tabBtnActive]}
          onPress={() => setActiveTab('niveis')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'niveis' && styles.tabBtnTextActive]}>
            Níveis & Tiers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'beneficios' && styles.tabBtnActive]}
          onPress={() => setActiveTab('beneficios')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'beneficios' && styles.tabBtnTextActive]}>
            Benefícios
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'config' && styles.tabBtnActive]}
          onPress={() => setActiveTab('config')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'config' && styles.tabBtnTextActive]}>
            Controle
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Tab Content */}
      {activeTab === 'membros' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchBoxContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar membro por nome, CPF ou nível..."
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text style={styles.loadingText}>Carregando membros VIP...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMembers}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4f46e5']} />
              }
              renderItem={({ item }) => {
                const points = Number(item.saldo_pontos || item.pontos_totais || 0);
                const currentLevel = item.nivel_vip || (points >= 15000 ? 'Diamante' : points >= 5000 ? 'Ouro' : points >= 1000 ? 'Prata' : 'Bronze');

                return (
                  <View style={styles.memberCard}>
                    <View style={styles.memberHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>
                          {item.nome || item.nome_razao || 'Membro VIP'}
                        </Text>
                        <Text style={styles.memberDoc}>
                          📄 {item.cpf || 'Sem CPF'} • 📞 {item.telefone || 'Sem fone'}
                        </Text>
                      </View>
                      <View style={[styles.tierBadge, { backgroundColor: '#fef3c7' }]}>
                        <Text style={styles.tierBadgeText}>👑 {currentLevel}</Text>
                      </View>
                    </View>

                    <View style={styles.memberStatsRow}>
                      <View style={styles.memberStat}>
                        <Text style={styles.memberStatLabel}>Pontuação Total</Text>
                        <Text style={[styles.memberStatValue, { color: '#6366f1' }]}>{points} pts</Text>
                      </View>
                      <View style={styles.memberStat}>
                        <Text style={styles.memberStatLabel}>Saldo em Carteira</Text>
                        <Text style={[styles.memberStatValue, { color: '#10b981' }]}>
                          R$ {Number(item.saldo_carteira || 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {item.nivel_manual_info ? (
                      <Text style={styles.manualAuditText}>
                        ℹ️ {item.nivel_manual_info}
                      </Text>
                    ) : null}

                    <TouchableOpacity
                      style={styles.adjustTierBtn}
                      onPress={() => {
                        setSelectedMember(item);
                        setSelectedTier(item.nivel_vip ? item.nivel_vip.toLowerCase() : 'silver');
                        setAdjustModalVisible(true);
                      }}
                    >
                      <Text style={styles.adjustTierBtnText}>⭐ Ajustar Nível Manualmente</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyTitle}>Nenhum membro encontrado</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {activeTab === 'niveis' && (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.sectionHeaderTitle}>Tiers & Categorias de Fidelidade</Text>
          {levels.map((level, idx) => (
            <View key={level.id || idx} style={[styles.levelCard, { borderLeftColor: level.color, borderLeftWidth: 6 }]}>
              <View style={styles.levelCardTop}>
                <Text style={[styles.levelName, { color: level.color === '#0f172a' ? '#0f172a' : level.color }]}>
                  {level.name}
                </Text>
                <Text style={styles.levelRange}>
                  {level.minPoints.toLocaleString()} - {level.maxPoints >= 900000 ? 'Ilimitado' : `${level.maxPoints.toLocaleString()} pts`}
                </Text>
              </View>

              <View style={styles.levelStatsRow}>
                <View style={styles.levelStatPill}>
                  <Text style={styles.levelStatPillLabel}>Multiplicador</Text>
                  <Text style={styles.levelStatPillVal}>{level.multiplier}x</Text>
                </View>
                <View style={styles.levelStatPill}>
                  <Text style={styles.levelStatPillLabel}>Desconto</Text>
                  <Text style={styles.levelStatPillVal}>{level.discount}%</Text>
                </View>
              </View>

              <View style={styles.benefitsContainer}>
                <Text style={styles.benefitsTitle}>Benefícios Inclusos:</Text>
                {level.benefits.map((b, bIdx) => (
                  <Text key={bIdx} style={styles.benefitItemText}>• {b}</Text>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === 'beneficios' && (
        <View style={{ flex: 1 }}>
          <View style={styles.beneficiosTopBar}>
            <Text style={styles.sectionHeaderTitle}>Catálogo de Vantagens VIP</Text>
            <TouchableOpacity
              style={styles.addBenefitBtn}
              onPress={() => setBenefitModalVisible(true)}
            >
              <Text style={styles.addBenefitBtnText}>+ Novo Benefício</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={beneficios}
            keyExtractor={(item, index) => item.id || String(index)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.benefitCard}>
                <View style={styles.benefitCardTop}>
                  <Text style={styles.benefitTitle}>{item.titulo}</Text>
                  <View style={styles.tierRequiredBadge}>
                    <Text style={styles.tierRequiredText}>{item.nivel_minimo || 'Todos'}</Text>
                  </View>
                </View>
                <Text style={styles.benefitDescription}>{item.descricao || 'Sem descrição cadastrada.'}</Text>
              </View>
            )}
          />
        </View>
      )}

      {activeTab === 'config' && (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.sectionHeaderTitle}>Configurações Gerais do Módulo VIP</Text>

          <View style={styles.configCard}>
            <View style={styles.configRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.configTitle}>Módulo VIP Ativo</Text>
                <Text style={styles.configDesc}>
                  Permite o cálculo automático de pontos, progressão de nível e resgates de benefícios.
                </Text>
              </View>
              <Switch
                value={moduleActive}
                onValueChange={handleToggleModuleActive}
                trackColor={{ false: '#cbd5e1', true: '#4f46e5' }}
              />
            </View>

            <View style={[styles.configRow, { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f1f5f9' }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.configTitle}>Ocultar no App do Cliente</Text>
                <Text style={styles.configDesc}>
                  Esconde a aba VIP do aplicativo do cliente sem desativar a pontuação de bastidores.
                </Text>
              </View>
              <Switch
                value={moduleHidden}
                onValueChange={handleToggleModuleHidden}
                trackColor={{ false: '#cbd5e1', true: '#ef4444' }}
              />
            </View>
          </View>
        </ScrollView>
      )}

      {/* Modal: Ajustar Nível VIP */}
      <Modal visible={adjustModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ajustar Nível VIP</Text>
            <Text style={styles.modalSubtitle}>
              Membro: {selectedMember?.nome || selectedMember?.nome_razao}
            </Text>

            <Text style={styles.inputLabel}>Selecione o Nível</Text>
            <View style={styles.tierSelectorList}>
              {levels.map(lvl => (
                <TouchableOpacity
                  key={lvl.id}
                  style={[
                    styles.tierSelectOption,
                    selectedTier === lvl.id && styles.tierSelectOptionActive,
                  ]}
                  onPress={() => setSelectedTier(lvl.id)}
                >
                  <Text
                    style={[
                      styles.tierSelectOptionText,
                      selectedTier === lvl.id && styles.tierSelectOptionTextActive,
                    ]}
                  >
                    👑 {lvl.name} ({lvl.multiplier}x)
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Motivo da Alteração Manual</Text>
            <TextInput
              style={styles.modalInput}
              value={adjustReason}
              onChangeText={setAdjustReason}
              placeholder="Ex: Cortesia comercial, fidelização, parceria..."
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setAdjustModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveAdjust}
                disabled={savingAdjust}
              >
                {savingAdjust ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Salvar Nível</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Novo Benefício */}
      <Modal visible={benefitModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Novo Benefício VIP</Text>

            <Text style={styles.inputLabel}>Título do Benefício *</Text>
            <TextInput
              style={styles.modalInput}
              value={newBenefitTitle}
              onChangeText={setNewBenefitTitle}
              placeholder="Ex: 20% Off em Limpeza Residencial"
            />

            <Text style={styles.inputLabel}>Nível Mínimo Exigido</Text>
            <TextInput
              style={styles.modalInput}
              value={newBenefitTier}
              onChangeText={setNewBenefitTier}
              placeholder="Ex: Ouro, Diamante, etc."
            />

            <Text style={styles.inputLabel}>Descrição das Regras</Text>
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              value={newBenefitDesc}
              onChangeText={setNewBenefitDesc}
              placeholder="Descreva as condições de resgate..."
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#94a3b8' }]}
                onPress={() => setBenefitModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#4f46e5' }]}
                onPress={handleSaveBenefit}
                disabled={savingBenefit}
              >
                {savingBenefit ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalBtnText}>Cadastrar</Text>
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
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginVertical: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
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
  searchBoxContainer: {
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
  memberCard: {
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
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  memberDoc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#854d0e',
  },
  memberStatsRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  memberStat: {
    flex: 1,
  },
  memberStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  memberStatValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  manualAuditText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 8,
  },
  adjustTierBtn: {
    marginTop: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
  },
  adjustTierBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  levelCard: {
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
  levelCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelName: {
    fontSize: 18,
    fontWeight: '800',
  },
  levelRange: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  levelStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 10,
  },
  levelStatPill: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  levelStatPillLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  levelStatPillVal: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  benefitsContainer: {
    marginTop: 6,
    gap: 4,
  },
  benefitsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  benefitItemText: {
    fontSize: 13,
    color: '#334155',
  },
  beneficiosTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  addBenefitBtn: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  addBenefitBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  benefitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  benefitCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  tierRequiredBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  tierRequiredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338ca',
  },
  benefitDescription: {
    fontSize: 13,
    color: '#64748b',
  },
  configCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  configTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  configDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
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
  // Modal
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
  tierSelectorList: {
    gap: 6,
    marginVertical: 4,
  },
  tierSelectOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
    justifyContent: 'center',
  },
  tierSelectOptionActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  tierSelectOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  tierSelectOptionTextActive: {
    color: '#ffffff',
    fontWeight: '800',
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
