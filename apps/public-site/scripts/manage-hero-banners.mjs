import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Configuração do Supabase ausente no .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const action = process.argv[2];

async function main() {
  if (action === 'list') {
    const { data, error } = await supabase
      .from('gsa_hero_banners')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('❌ Erro ao listar banners:', error.message);
      process.exit(1);
    }

    console.log('📋 Banners Atuais no Banco:');
    console.table(data);
    return;
  }

  if (action === 'add') {
    const title = process.argv[3];
    const subtitle = process.argv[4] || '';
    const imageUrl = process.argv[5];
    const linkUrl = process.argv[6] || '/marketplace/produtos-assinaturas';
    const buttonText = process.argv[7] || 'Confira agora';
    const displayOrder = parseInt(process.argv[8] || '1', 10);

    if (!title || !imageUrl) {
      console.log('Uso: node scripts/manage-hero-banners.mjs add "<titulo>" "<subtitulo>" "<url_imagem>" "<link>" "<texto_botao>" [ordem]');
      process.exit(1);
    }

    const { data, error } = await supabase
      .from('gsa_hero_banners')
      .insert([
        {
          title,
          subtitle,
          image_url: imageUrl,
          link_url: linkUrl,
          button_text: buttonText,
          display_order: displayOrder,
          is_active: true,
        }
      ])
      .select();

    if (error) {
      console.error('❌ Erro ao adicionar banner:', error.message);
      process.exit(1);
    }

    console.log('✅ Banner adicionado com sucesso:', data);
    return;
  }

  if (action === 'toggle') {
    const id = process.argv[3];
    const active = process.argv[4] === 'true';

    if (!id) {
      console.log('Uso: node scripts/manage-hero-banners.mjs toggle <id> <true|false>');
      process.exit(1);
    }

    const { data, error } = await supabase
      .from('gsa_hero_banners')
      .update({ is_active: active })
      .eq('id', id)
      .select();

    if (error) {
      console.error('❌ Erro ao atualizar status do banner:', error.message);
      process.exit(1);
    }

    console.log('✅ Banner atualizado:', data);
    return;
  }

  if (action === 'delete') {
    const id = process.argv[3];
    if (!id) {
      console.log('Uso: node scripts/manage-hero-banners.mjs delete <id>');
      process.exit(1);
    }

    const { error } = await supabase
      .from('gsa_hero_banners')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Erro ao deletar banner:', error.message);
      process.exit(1);
    }

    console.log('✅ Banner removido com sucesso!');
    return;
  }

  console.log(`
🛠️ Script de Gerenciamento Automático de Banners

Comandos disponíveis:
  node scripts/manage-hero-banners.mjs list
  node scripts/manage-hero-banners.mjs add "<titulo>" "<subtitulo>" "<url_imagem>" "<link>" "<texto_botao>" [ordem]
  node scripts/manage-hero-banners.mjs toggle <id> <true|false>
  node scripts/manage-hero-banners.mjs delete <id>
`);
}

main();
