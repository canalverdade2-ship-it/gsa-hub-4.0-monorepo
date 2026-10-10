import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from root
dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não encontrados no .env');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const logValidation = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
  const icons = { info: '🔹', success: '✅', error: '❌', warning: '⚠️' };
  console.log(`${icons[type]} ${message}`);
};

export const clearTestData = async (table: string, column: string, value: any) => {
  logValidation(`Limpando dados de teste em ${table}...`, 'info');
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) logValidation(`Erro ao limpar ${table}: ${error.message}`, 'error');
};
