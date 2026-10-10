import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de continuar.');
  process.exit(1);
}

const prompt = createInterface({ input, output });
let userId;
try {
  const name = (await prompt.question('Nome do administrador: ')).trim();
  const email = (await prompt.question('E-mail do administrador: ')).trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!name || !email.includes('@') || password.length < 12) throw new Error('Informe nome, e-mail e uma senha com pelo menos 12 caracteres.');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existing, error: lookupError } = await admin.from('gsa_profiles').select('id').eq('role','admin').limit(1);
  if (lookupError) throw lookupError;
  if (existing?.length) throw new Error('Já existe um perfil administrativo. Use o fluxo de convite do painel.');

  const { data, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: name, portal_role: 'admin' }
  });
  if (createError || !data.user) throw createError || new Error('Não foi possível criar o usuário Auth.');
  userId = data.user.id;
  const { error: profileError } = await admin.from('gsa_profiles').insert({
    id: userId, email, full_name: name, role: 'admin', admin_role: 'Administrador Geral', permissions: ['*'], active: true
  });
  if (profileError) throw profileError;
  console.log(`Administrador inicial criado: ${email}. Entre no painel e troque a senha após o primeiro acesso.`);
} catch (error) {
  if (userId) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await admin.auth.admin.deleteUser(userId);
  }
  console.error(error instanceof Error ? error.message : 'Falha ao preparar o administrador.');
  process.exitCode = 1;
} finally {
  prompt.close();
}
