const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

content = content.replace(
  "import { ClientesScreen, OrcamentosScreen, DemandasScreen, FinanceiroScreen } from './src/Screens';",
  "import { ClientesScreen, OrcamentosScreen, DemandasScreen, FinanceiroScreen, LojaScreen, ViagensScreen, AfiliadosScreen, CobrancaScreen, AtendimentoScreen, PromocoesScreen, RelatoriosScreen, ConfiguracoesScreen } from './src/Screens';"
);

content = content.replace(
  "const [currentScreen, setCurrentScreen] = useState<'dashboard' | 'clientes' | 'orcamentos' | 'demandas' | 'financeiro'>('dashboard');",
  "const [currentScreen, setCurrentScreen] = useState<'dashboard' | 'clientes' | 'orcamentos' | 'demandas' | 'financeiro' | 'loja' | 'viagens' | 'afiliados' | 'cobranca' | 'atendimento' | 'promocoes' | 'relatorios' | 'configuracoes'>('dashboard');"
);

content = content.replace(
  "case 'financeiro': return 'Fin. Pendente';",
  "case 'financeiro': return 'Fin. Pendente';\n      case 'loja': return 'Loja';\n      case 'viagens': return 'Viagens';\n      case 'afiliados': return 'Afiliados';\n      case 'cobranca': return 'Cobrança';\n      case 'atendimento': return 'Atendimento';\n      case 'promocoes': return 'Promoções';\n      case 'relatorios': return 'Relatórios';\n      case 'configuracoes': return 'Configurações';"
);

content = content.replace(
  "if (['dashboard', 'clientes', 'orcamentos', 'demandas', 'financeiro'].includes(id)) {",
  "if (['dashboard', 'clientes', 'orcamentos', 'demandas', 'financeiro', 'loja', 'viagens', 'afiliados', 'cobranca', 'atendimento', 'promocoes', 'relatorios', 'configuracoes'].includes(id)) {"
);

const conditionalRender = `{currentScreen === 'clientes' && <ClientesScreen />}
          {currentScreen === 'orcamentos' && <OrcamentosScreen />}
          {currentScreen === 'demandas' && <DemandasScreen />}
          {currentScreen === 'financeiro' && <FinanceiroScreen />}
          {currentScreen === 'loja' && <LojaScreen />}
          {currentScreen === 'viagens' && <ViagensScreen />}
          {currentScreen === 'afiliados' && <AfiliadosScreen />}
          {currentScreen === 'cobranca' && <CobrancaScreen />}
          {currentScreen === 'atendimento' && <AtendimentoScreen />}
          {currentScreen === 'promocoes' && <PromocoesScreen />}
          {currentScreen === 'relatorios' && <RelatoriosScreen />}
          {currentScreen === 'configuracoes' && <ConfiguracoesScreen />}`;

content = content.replace(
  /\{currentScreen === 'clientes'.*?\n.*?\n.*?\n.*?FinanceiroScreen \/>\}/,
  conditionalRender
);

fs.writeFileSync('App.tsx', content);
console.log('App.tsx updated successfully');
