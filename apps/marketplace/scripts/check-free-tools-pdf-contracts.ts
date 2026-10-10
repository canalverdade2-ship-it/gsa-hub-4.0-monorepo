import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCalculatorPdfDocument } from '../src/lib/freeToolsPdfReport';

const read = (path: string) => readFileSync(path, 'utf8');

const report = {
  calculator: 'Calculadora de teste',
  mode: 'pro' as const,
  headline: 'Resultado principal de R$ 1.234,56',
  summary: 'Relatório completo criado apenas para validar a geração local do documento.',
  sections: [
    {
      title: 'Dados informados',
      rows: [
        { label: 'Valor informado', value: 'R$ 1.000,00' },
        { label: 'Período', value: '12 meses' },
      ],
    },
    {
      title: 'Resultado',
      rows: [{ label: 'Total', value: 'R$ 1.234,56' }],
      items: ['Item detalhado do relatório', 'Segundo item detalhado'],
    },
  ],
  disclaimer: 'Documento educativo usado somente para teste.',
};

const document = createCalculatorPdfDocument(report);
const bytes = new Uint8Array(document.output('arraybuffer'));
assert.ok(bytes.byteLength > 1_000, 'O relatório PDF precisa produzir um documento não vazio.');
assert.equal(String.fromCharCode(...bytes.slice(0, 4)), '%PDF', 'O arquivo gerado precisa possuir assinatura PDF.');
assert.ok(document.getNumberOfPages() >= 1, 'O relatório precisa possuir ao menos uma página.');

const generator = read('src/lib/freeToolsPdfReport.ts');
assert.match(generator, /doc\.output\('blob'\)/, 'O PDF deve ser materializado apenas como Blob local.');
assert.match(generator, /URL\.createObjectURL/, 'O download deve usar uma URL temporária do navegador.');
assert.match(generator, /URL\.revokeObjectURL/, 'A URL temporária deve ser descartada após o download.');
assert.match(generator, /link\.download/, 'O fluxo deve iniciar o download do arquivo.');
assert.match(generator, /nao foram enviados nem armazenados no sistema ou no banco de dados/i, 'O relatório deve declarar a política de não armazenamento.');
assert.doesNotMatch(generator, /supabase|functions\.invoke|\.rpc\(|fetch\(|localStorage|sessionStorage/i, 'O gerador não pode enviar ou persistir o PDF e os dados.');

const button = read('src/components/public/CalculatorPdfReportButton.tsx');
assert.match(button, /Gerar relatório PDF/i, 'O botão deve comunicar claramente a geração do PDF.');
assert.match(button, /Nenhum PDF é salvo pela GSA/i, 'A interface deve informar que o arquivo não será armazenado.');
assert.match(button, /downloadCalculatorPdf/, 'O botão deve usar o gerador local de download.');

for (const path of [
  'src/components/public/FreeToolsSimpleCalculators.tsx',
  'src/components/public/FreeToolsAdvancedCalculators.tsx',
  'src/components/public/FreeToolsAdditionalCalculators.tsx',
]) {
  const content = read(path);
  assert.match(content, /CalculatorPdfReportButton/, `${path}: precisa exibir o botão de relatório.`);
  assert.match(content, /mode: 'free'|mode: 'pro'/, `${path}: precisa montar dados de relatório Free ou Pro.`);
}

const simple = read('src/components/public/FreeToolsSimpleCalculators.tsx');
assert.match(simple, /mode: 'free'/, 'As calculadoras simples precisam gerar relatórios Free.');
assert.match(simple, /Calculadora de rescisão trabalhista/, 'A rescisão Free precisa possuir relatório.');
assert.match(simple, /Calculadora aposentadoria INSS/, 'A aposentadoria Free precisa possuir relatório.');
assert.match(simple, /Calculadora de férias/, 'As férias Free precisam possuir relatório.');

const advanced = read('src/components/public/FreeToolsAdvancedCalculators.tsx');
assert.match(advanced, /mode: 'pro'/, 'As calculadoras avançadas precisam gerar relatórios Pro.');
assert.match(advanced, /Memória detalhada de verbas|Memória do cálculo/, 'A rescisão Pro deve incluir memória detalhada no relatório.');
assert.match(advanced, /Análise detalhada das 5 regras|regras de transição/, 'A aposentadoria Pro deve incluir comparação das regras.');
assert.match(advanced, /Relatório completo de férias|Opções avançadas de férias/, 'As férias Pro devem incluir composição completa.');

const additional = read('src/components/public/FreeToolsAdditionalCalculators.tsx');
assert.match(additional, /Calculadora de 13º salário/, 'O 13º Free e Pro precisa possuir relatório.');
assert.match(additional, /Triagem de benefícios do INSS/, 'Benefícios Free e Pro precisam possuir relatório.');
assert.match(additional, /Triagem BPC \/ LOAS/, 'BPC Free e Pro precisa possuir relatório.');
assert.match(additional, /Checklist detalhado de requisitos|Modalidade e estimativa de renda/, 'Benefícios Pro deve incluir requisitos no PDF completo.');
assert.match(additional, /Composição da renda familiar|Análise dos Limites Legais/, 'BPC Pro deve incluir todos os critérios no PDF completo.');

console.log('Relatórios PDF locais das seis calculadoras, nos modos Free e Pro, validados com sucesso.');
