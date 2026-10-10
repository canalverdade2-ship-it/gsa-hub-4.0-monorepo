import { PostgrestError } from '@supabase/supabase-js';

/**
 * Wrapper para chamadas ao Supabase que fornece erros detalhados.
 * @param query A query do Supabase (ex: supabase.from('...').select('...'))
 * @returns Os dados retornados pela query
 * @throws Erro com detalhes se a query falhar
 */
export async function safeSupabaseQuery<T>(query: any): Promise<T | null> {
  const { data, error } = await query;
  
  if (error) {
    console.error("--- ERRO DETALHADO DO SUPABASE ---");
    console.error("Mensagem:", error.message);
    console.error("Detalhes:", error.details);
    console.error("Dica (Hint):", error.hint);
    console.error("Código:", error.code);
    console.error("----------------------------------");
    
    // Lança um erro que o seu UI pode apanhar e mostrar ao utilizador
    throw new Error(`Erro: ${error.message} (Código: ${error.code})`);
  }
  
  return data as T;
}
