import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface ClienteAtivacaoItem {
  id: string;
  data_ativacao?: string | null;
  data_expiracao?: string | null;
  status?: string | null;
  data_uso?: string | null;
  orcamento_id?: string | null;
  cliente?: {
    nome?: string | null;
    codigo_cliente?: string | null;
  } | null;
}

export interface OrcamentoVinculadoItem {
  id: string;
  codigo_orcamento?: string | null;
  total?: number | null;
  desconto?: number | null;
  status?: string | null;
  data_criacao?: string | null;
}

export interface PromoDetalhesModalScreenProps {
  promoId?: string;
  promoData?: any;
  onClose?: () => void;
  onStatusChange?: (newStatus: string) => void;
}

export const PromoDetalhesModalScreen: React.FC<PromoDetalhesModalScreenProps> = ({
  promoId,
  promoData,
  onClose,
  onStatusChange,
}) => {
  const [promo, setPromo] = useState<any>(promoData || null);
  const [ativacoes, setAtivacoes] = useState<ClienteAtivacaoItem[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoVinculadoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchDetails = useCallback(async () => {
    const targetId = promoId || promoData?.id;
    if (!targetId) {
      setLoading(false);
      return;
    }

    try {
      if (!promoData) {
        const { data: pData, error: pErr } = await supabase
          .from('promocoes')
          .select('*')
          .eq('id', targetId)
          .single();
        if (pErr) throw pErr;
        setPromo(pData);
      }

      // Fetch client activations
      const { data: ativData } = await supabase
        .from('cliente_promocoes')
        .select('id, data_ativacao, data_expiracao, status, data_uso, orcamento_id, cliente:clientes(nome, codigo_cliente)')
        .eq('promocao_id', targetId)
        .order('data_ativacao', { ascending: false });

      setAtivacoes((ativData || []) as any);

      // Fetch linked budgets/orders
      const { data: orcData } = await supabase
        .from('orcamentos')
        .select('id, codigo_orcamento, total, desconto, status, data_criacao')
        .eq('promocao_id', targetId);

      setOrcamentos((orcData || []) as OrcamentoVinculadoItem[]);
    } catch (err: any) {
      console.error('Erro ao carregar auditoria da promoção', err);
    } finally {
      setLoading(false);
    }
  }, [promoId, promoData]);

  useEffect(() => {
    setLoading(true);
    fetchDetails();
  }, [fetchDetails]);

  const handleToggleStatus = async () => {
    if (!promo?.id) return;
    const isAtiva = promo.status === 'ativa';
    const nextStatus = isAtiva ? 'suspensa' : 'ativa';

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('promocoes')
        .update({ status: nextStatus })
        .eq('id', promo.id);

      if (error) throw error;

      Alert.alert(
        'Status Atualizado',
        `Promoção ${nextStatus === 'ativa' ? 'reativada' : 'suspensa'} com sucesso!`
      );
      setPromo({ ...promo, status: nextStatus });
      if (onStatusChange) onStatusChange(nextStatus);
    } catch (err: any) {
      Alert.alert('Erro ao alterar status', err.message);
    } finally {
      setUpdating(false);
    }
  };

  const formatBRL = (val?: number | null) => {
    if (val == null) return 'R$ 0,00';
    return `R$ ${val.toFixed(2).replace('.', ',')}`;
  };

  const getStatusColor = (st?: string) => {
    switch (st) {
      case 'ativa':
        return '#10b981';
      case 'suspensa':
        return '#f59e0b';
      case 'cancelada':
      case 'encerrada':
        return '#ef4444';
      default:
        return '#3b82f6';
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Carregando auditoria da campanha...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Hero Banner */}
      <View style={[styles.heroBanner, { backgroundColor: getStatusColor(promo?.status) }]}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroTypeTag}>
            <Text style={styles.heroTypeTagText}>{(promo?.tipo || 'GERAL').toUpperCase()}</Text>
          </View>
          {onClose && (
            <TouchableOpacity style={styles.heroCloseBtn} onPress={onClose}>
              <Text style={styles.heroCloseBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.heroTitle}>{promo?.titulo || 'Campanha Promocional'}</Text>
        <Text style={styles.heroCode}>Código: {promo?.codigo_promocao || 'S/C'}</Text>

        <View style={styles.heroStatusBadge}>
          <Text style={styles.heroStatusText}>{promo?.status?.toUpperCase() || 'ATIVA'}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Audit Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.cardHeaderTitle}>📊 Parâmetros da Regra</Text>

          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Tipo de Desconto:</Text>
            <Text style={styles.rowValue}>
              {promo?.tipo_desconto === 'porcentagem'
                ? `${promo?.valor_desconto}%`
                : promo?.tipo_desconto === 'valor'
                ? formatBRL(promo?.valor_desconto)
                : 'Condição Especial'}
            </Text>
          </View>

          <View style={styles.rowItem}>
            <Text style={styles.rowLabel}>Vigência:</Text>
            <Text style={styles.rowValue}>
              {promo?.data_inicio_divulgacao
                ? new Date(promo.data_inicio_divulgacao).toLocaleDateString('pt-BR')
                : 'Início Imediato'}{' '}
              até{' '}
              {promo?.data_fim_divulgacao
                ? new Date(promo.data_fim_divulgacao).toLocaleDateString('pt-BR')
                : 'Indeterminado'}
            </Text>
          </View>

          {promo?.descricao ? (
            <View style={styles.descBox}>
              <Text style={styles.descLabel}>Regulamento:</Text>
              <Text style={styles.descText}>{promo.descricao}</Text>
            </View>
          ) : null}

          {/* Quick Action Toggle */}
          <TouchableOpacity
            style={[styles.toggleBtn, updating && styles.btnDisabled]}
            onPress={handleToggleStatus}
            disabled={updating}
          >
            <Text style={styles.toggleBtnText}>
              {promo?.status === 'ativa' ? 'Suspender Promoção' : 'Reativar Promoção'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Client Activations Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeaderTitle}>
            👥 Ativações por Clientes ({ativacoes.length})
          </Text>

          {ativacoes.length === 0 ? (
            <Text style={styles.emptyNotice}>Nenhum cliente ativou este benefício ainda.</Text>
          ) : (
            ativacoes.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>
                    {item.cliente?.nome || `Cliente #${item.id.slice(0, 6)}`}
                  </Text>
                  <Text style={styles.itemSub}>
                    Ativado em:{' '}
                    {item.data_ativacao
                      ? new Date(item.data_ativacao).toLocaleDateString('pt-BR')
                      : '-'}
                  </Text>
                </View>
                <View style={styles.itemBadge}>
                  <Text style={styles.itemBadgeText}>{item.status?.toUpperCase() || 'ATIVO'}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Linked Orders / Sales Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardHeaderTitle}>
            💰 Vendas & Orçamentos Vinculados ({orcamentos.length})
          </Text>

          {orcamentos.length === 0 ? (
            <Text style={styles.emptyNotice}>Nenhum pedido fechado com esta promoção ainda.</Text>
          ) : (
            orcamentos.map((orc) => (
              <View key={orc.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>
                    {orc.codigo_orcamento || `Pedido #${orc.id.slice(0, 6)}`}
                  </Text>
                  <Text style={styles.itemSub}>Desconto: {formatBRL(orc.desconto)}</Text>
                </View>
                <Text style={styles.itemTotal}>{formatBRL(orc.total)}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  heroBanner: {
    padding: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTypeTag: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroTypeTagText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCloseBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 28,
  },
  heroCode: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  heroStatusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 12,
  },
  heroStatusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  rowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  descBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  descLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  descText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    marginTop: 2,
  },
  toggleBtn: {
    backgroundColor: '#1e293b',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  toggleBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  itemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  itemBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  itemBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803d',
  },
  emptyNotice: {
    fontSize: 13,
    color: '#94a3b8',
    paddingVertical: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
});
