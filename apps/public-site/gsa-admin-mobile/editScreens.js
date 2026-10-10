const fs = require('fs');
const content = fs.readFileSync('src/Screens.tsx', 'utf8');
const newScreens = `
export const LojaScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('produtos').select('*').limit(50)
      .then(({ data, error }) => { 
        if (error) console.log(error);
        setData(data || []); 
        setLoading(false); 
      });
  }, []);
  if (loading) return <Loader text="Carregando produtos..." />;
  return (
    <FlatList
      data={data}
      keyExtractor={i => i.id || Math.random().toString()}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.nome || 'Produto sem nome'}</Text>
          <Text style={styles.value}>R$ {Number(item.preco || item.valor || 0).toFixed(2)}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum produto encontrado.</Text>}
    />
  );
};

export const ViagensScreen = () => {
  return (
    <View style={styles.loader}>
      <Text style={styles.title}>GSA Viagens</Text>
      <Text style={styles.loaderText}>Módulo em desenvolvimento.</Text>
    </View>
  );
};

export const AfiliadosScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('afiliados').select('*').limit(50)
      .then(({ data, error }) => { 
        if (error) console.log(error);
        setData(data || []); 
        setLoading(false); 
      });
  }, []);
  if (loading) return <Loader text="Carregando afiliados..." />;
  return (
    <FlatList
      data={data}
      keyExtractor={i => i.id || Math.random().toString()}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.nome || 'Afiliado'}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum afiliado encontrado.</Text>}
    />
  );
};

export const CobrancaScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('faturas').select('*').in('status', ['vencida', 'atrasada']).limit(50)
      .then(({ data, error }) => { 
        if (error) console.log(error);
        setData(data || []); 
        setLoading(false); 
      });
  }, []);
  if (loading) return <Loader text="Carregando cobranças..." />;
  return (
    <FlatList
      data={data}
      keyExtractor={i => i.id || Math.random().toString()}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.title}>Fatura Vencida</Text>
            <Text style={styles.valueError}>R$ {Number(item.valor_total || item.valor || 0).toFixed(2)}</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma cobrança encontrada.</Text>}
    />
  );
};

export const AtendimentoScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('atendimentos').select('*').limit(50)
      .then(({ data, error }) => { 
        if (error) console.log(error);
        setData(data || []); 
        setLoading(false); 
      });
  }, []);
  if (loading) return <Loader text="Carregando atendimentos..." />;
  return (
    <FlatList
      data={data}
      keyExtractor={i => i.id || Math.random().toString()}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.assunto || item.titulo || 'Atendimento'}</Text>
          <Text style={styles.badge}>{item.status || 'aberto'}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhum atendimento encontrado.</Text>}
    />
  );
};

export const PromocoesScreen = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from('promocoes').select('*').limit(50)
      .then(({ data, error }) => { 
        if (error) console.log(error);
        setData(data || []); 
        setLoading(false); 
      });
  }, []);
  if (loading) return <Loader text="Carregando promoções..." />;
  return (
    <FlatList
      data={data}
      keyExtractor={i => i.id || Math.random().toString()}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.nome || item.titulo || 'Promoção'}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>Nenhuma promoção encontrada.</Text>}
    />
  );
};

export const RelatoriosScreen = () => {
  return (
    <View style={styles.loader}>
      <Text style={styles.title}>Relatórios</Text>
      <Text style={styles.loaderText}>Módulo em desenvolvimento.</Text>
    </View>
  );
};

export const ConfiguracoesScreen = () => {
  return (
    <View style={styles.loader}>
      <Text style={styles.title}>Configurações</Text>
      <Text style={styles.loaderText}>Módulo em desenvolvimento.</Text>
    </View>
  );
};
`;

const loaderIndex = content.indexOf('const Loader = ');
if (loaderIndex === -1) {
  console.log('Loader not found');
  process.exit(1);
}
const finalContent = content.slice(0, loaderIndex) + newScreens + '\n' + content.slice(loaderIndex);
fs.writeFileSync('src/Screens.tsx', finalContent);
console.log('Screens updated successfully');
