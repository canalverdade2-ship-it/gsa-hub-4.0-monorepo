import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { supabase } from '../../../supabase';

export interface PromocaoQuantidadeFormScreenProps {
  initialData?: any;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const PromocaoQuantidadeFormScreen: React.FC<PromocaoQuantidadeFormScreenProps> = ({
  initialData,
  onSuccess,
  onCancel,
}) => {
  const [loadingLists, setLoadingLists] = useState(true);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [nome, setNome] = useState(initialData?.nome || '');
  const [descricao, setDescricao] = useState(initialData?.descricao || '');
  const [escopoGatilho, setEscopoGatilho] = useState<'produto' | 'categoria' | 'geral'>(
    initialData?.escopo_gatilho || 'produto'
  );
  const [produtoGatilhoId, setProdutoGatilhoId] = useState(initialData?.produto_gatilho_id || '');
  const [categoriaGatilhoId, setCategoriaGatilhoId] = useState(initialData?.categoria_gatilho_id || '');
  const [quantidadeMinima, setQuantidadeMinima] = useState(
    initialData?.quantidade_minima != null ? String(initialData.quantidade_minima) : '3'
  );

  const [tipoPromocao, setTipoPromocao] = useState<'unidade_gratis' | 'desconto_proxima' | 'ganhe_outro_produto' | 'combo'>(
    initialData?.tipo_promocao || 'unidade_gratis'
  );
  const [produtoBrindeId, setProdutoBrindeId] = useState(initialData?.produto_brinde_id || '');
  const [quantidadeBrinde, setQuantidadeBrinde] = useState(
    initialData?.quantidade_brinde != null ? String(initialData.quantidade_brinde) : '1'
  );

  const [descontoTipo, setDescontoTipo] = useState<'porcentagem' | 'valor'>(
    initialData?.desconto_tipo || 'porcentagem'
  );
  const [descontoValor, setDescontoValor] = useState(
    initialData?.desconto_valor != null ? String(initialData.desconto_valor) : '10'
  );

  const [usoMaximo, setUsoMaximo] = useState(
    initialData?.uso_maximo_por_cliente != null ? String(initialData.uso_maximo_por_cliente) : '1'
  );
  const [dataInicio, setDataInicio] = useState(
    initialData?.data_inicio ? initialData.data_inicio.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [dataFim, setDataFim] = useState(
    initialData?.data_fim ? initialData.data_fim.split('T')[0] : ''
  );
  const [statusAtivo, setStatusAtivo] = useState(initialData?.status !== 'suspensa');

  useEffect(() => {
    const loadDependencies = async () => {
      try {
        const [prodRes, catRes] = await Promise.all([
          supabase.from('produtos').select('id, nome').limit(100),
          supabase.from('loja_categorias').select('id, nome'),
        ]);

        if (prodRes.data) setProdutos(prodRes.data);
        if (catRes.data) setCategorias(catRes.data);
      } catch (err: any) {
        console.error('Erro ao carregar dependências', err);
      } finally {
        setLoadingLists(false);
      }
    };
    loadDependencies();
  }, []);

  const handleSubmit = async () => {
    if (!nome.trim()) {
      Alert.alert('Validação', 'Informe o nome da promoção de volume.');
      return;
    }

    const qtdMin = parseInt(quantidadeMinima, 10);
    if (isNaN(qtdMin) || qtdMin < 1) {
      Alert.alert('Validação', 'A quantidade mínima deve ser pelo menos 1.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        nome: nome.trim(),
        descricao: descricao.trim(),
        escopo_gatilho: escopoGatilho,
        produto_gatilho_id: escopoGatilho === 'produto' && produtoGatilhoId ? produtoGatilhoId : null,
        categoria_gatilho_id: escopoGatilho === 'categoria' && categoriaGatilhoId ? categoriaGatilhoId : null,
        quantidade_minima: qtdMin,
        tipo_promocao: tipoPromocao,
        produto_brinde_id: tipoPromocao === 'ganhe_outro_produto' && produtoBrindeId ? produtoBrindeId : null,
        quantidade_brinde: parseInt(quantidadeBrinde, 10) || 1,
        desconto_tipo: descontoTipo,
        desconto_valor: parseFloat(descontoValor.replace(',', '.')) || 0,
        uso_maximo_por_cliente: parseInt(usoMaximo, 10) || 1,
        data_inicio: dataInicio ? new Date(dataInicio).toISOString() : new Date().toISOString(),
        data_fim: dataFim ? new Date(dataFim).toISOString() : null,
        status: statusAtivo ? 'ativa' : 'suspensa',
      };

      if (initialData?.id) {
        const { error } = await supabase
          .from('promocoes_quantidade')
          .update(payload)
          .eq('id', initialData.id);
        if (error) throw error;
        Alert.alert('Sucesso', 'Promoção de volume atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('promocoes_quantidade')
          .insert([payload]);
        if (error) throw error;
        Alert.alert('Sucesso', 'Promoção de volume cadastrada com sucesso!');
      }

      if (onSuccess) onSuccess();
    } catch (err: any) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingLists) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Carregando formulário...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {initialData?.id ? 'Editar Faixa de Volume' : 'Nova Promoção de Quantidade'}
        </Text>
        <Text style={styles.headerSubtitle}>
          Configure descontos progressivos e bonificações por quantidade comprada.
        </Text>
      </View>

      <View style={styles.formCard}>
        {/* Section 1: Identificação */}
        <Text style={styles.sectionHeader}>1. Identificação da Promoção</Text>

        <Text style={styles.label}>Nome da Promoção *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Leve 3 Pague 2 ou 10% OFF em 5+ un"
          placeholderTextColor="#94a3b8"
          value={nome}
          onChangeText={setNome}
        />

        <Text style={styles.label}>Descrição / Regulamento</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Regras de elegibilidade, condições para aplicação..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={3}
          value={descricao}
          onChangeText={setDescricao}
        />

        {/* Section 2: Escopo e Gatilho */}
        <Text style={styles.sectionHeader}>2. Condições e Gatilho de Volume</Text>

        <Text style={styles.label}>Aplicar regra sobre:</Text>
        <View style={styles.segmentedRow}>
          <TouchableOpacity
            style={[styles.segmentBtn, escopoGatilho === 'produto' && styles.segmentBtnActive]}
            onPress={() => setEscopoGatilho('produto')}
          >
            <Text style={[styles.segmentText, escopoGatilho === 'produto' && styles.segmentTextActive]}>
              PRODUTO
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, escopoGatilho === 'categoria' && styles.segmentBtnActive]}
            onPress={() => setEscopoGatilho('categoria')}
          >
            <Text style={[styles.segmentText, escopoGatilho === 'categoria' && styles.segmentTextActive]}>
              CATEGORIA
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, escopoGatilho === 'geral' && styles.segmentBtnActive]}
            onPress={() => setEscopoGatilho('geral')}
          >
            <Text style={[styles.segmentText, escopoGatilho === 'geral' && styles.segmentTextActive]}>
              GERAL
            </Text>
          </TouchableOpacity>
        </View>

        {escopoGatilho === 'produto' && (
          <>
            <Text style={styles.label}>Selecione o Produto Gatilho</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {produtos.slice(0, 15).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.itemChip, produtoGatilhoId === p.id && styles.itemChipSelected]}
                  onPress={() => setProdutoGatilhoId(p.id)}
                >
                  <Text style={[styles.itemChipText, produtoGatilhoId === p.id && styles.itemChipTextSelected]}>
                    {p.nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {escopoGatilho === 'categoria' && (
          <>
            <Text style={styles.label}>Selecione a Categoria Gatilho</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {categorias.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.itemChip, categoriaGatilhoId === c.id && styles.itemChipSelected]}
                  onPress={() => setCategoriaGatilhoId(c.id)}
                >
                  <Text style={[styles.itemChipText, categoriaGatilhoId === c.id && styles.itemChipTextSelected]}>
                    {c.nome}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.label}>Quantidade Mínima para Ativar *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 3"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          value={quantidadeMinima}
          onChangeText={setQuantidadeMinima}
        />

        {/* Section 3: Benefício Concedido */}
        <Text style={styles.sectionHeader}>3. Benefício Concedido</Text>

        <Text style={styles.label}>Tipo de Bonificação</Text>
        <View style={styles.typeGrid}>
          {[
            { id: 'unidade_gratis', label: 'Unidade Grátis' },
            { id: 'desconto_proxima', label: 'Desconto % ou R$' },
            { id: 'ganhe_outro_produto', label: 'Brinde Outro Item' },
            { id: 'combo', label: 'Preço Fixo Combo' },
          ].map((tp) => (
            <TouchableOpacity
              key={tp.id}
              style={[styles.typeGridBtn, tipoPromocao === tp.id && styles.typeGridBtnSelected]}
              onPress={() => setTipoPromocao(tp.id as any)}
            >
              <Text style={[styles.typeGridText, tipoPromocao === tp.id && styles.typeGridTextSelected]}>
                {tp.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tipoPromocao === 'desconto_proxima' && (
          <View style={styles.rowInputs}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Tipo de Desconto</Text>
              <View style={styles.segmentedRow}>
                <TouchableOpacity
                  style={[styles.segmentBtn, descontoTipo === 'porcentagem' && styles.segmentBtnActive]}
                  onPress={() => setDescontoTipo('porcentagem')}
                >
                  <Text style={[styles.segmentText, descontoTipo === 'porcentagem' && styles.segmentTextActive]}>
                    %
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, descontoTipo === 'valor' && styles.segmentBtnActive]}
                  onPress={() => setDescontoTipo('valor')}
                >
                  <Text style={[styles.segmentText, descontoTipo === 'valor' && styles.segmentTextActive]}>
                    R$
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.halfInput}>
              <Text style={styles.label}>Valor do Desconto</Text>
              <TextInput
                style={styles.input}
                placeholder="10"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={descontoValor}
                onChangeText={setDescontoValor}
              />
            </View>
          </View>
        )}

        {tipoPromocao === 'unidade_gratis' && (
          <View style={styles.rowInputs}>
            <View style={styles.fullWidth}>
              <Text style={styles.label}>Unidades Grátis a Bonificar</Text>
              <TextInput
                style={styles.input}
                placeholder="1"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={quantidadeBrinde}
                onChangeText={setQuantidadeBrinde}
              />
            </View>
          </View>
        )}

        {/* Section 4: Vigência e Limites */}
        <Text style={styles.sectionHeader}>4. Vigência e Limites</Text>

        <View style={styles.rowInputs}>
          <View style={styles.halfInput}>
            <Text style={styles.label}>Início (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="2026-01-01"
              placeholderTextColor="#94a3b8"
              value={dataInicio}
              onChangeText={setDataInicio}
            />
          </View>

          <View style={styles.halfInput}>
            <Text style={styles.label}>Término (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="Opcional"
              placeholderTextColor="#94a3b8"
              value={dataFim}
              onChangeText={setDataFim}
            />
          </View>
        </View>

        <Text style={styles.label}>Limite de Usos por Cliente</Text>
        <TextInput
          style={styles.input}
          placeholder="1"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          value={usoMaximo}
          onChangeText={setUsoMaximo}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Regra Ativa Imediatamente</Text>
          <Switch
            value={statusAtivo}
            onValueChange={setStatusAtivo}
            trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
            thumbColor={statusAtivo ? '#2563eb' : '#f1f5f9'}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          {onCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {initialData?.id ? 'Salvar Alterações' : 'Criar Promoção de Quantidade'}
              </Text>
            )}
          </TouchableOpacity>
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
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: '#ffffff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
    marginTop: 14,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#0f172a',
  },
  textArea: {
    height: 72,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  segmentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#2563eb',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  chipsScroll: {
    flexDirection: 'row',
    marginVertical: 6,
  },
  itemChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemChipSelected: {
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  itemChipText: {
    fontSize: 12,
    color: '#475569',
  },
  itemChipTextSelected: {
    color: '#4338ca',
    fontWeight: '700',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  typeGridBtn: {
    width: '48%',
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeGridBtnSelected: {
    backgroundColor: '#2563eb',
  },
  typeGridText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  typeGridTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  fullWidth: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 14,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 14,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
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
