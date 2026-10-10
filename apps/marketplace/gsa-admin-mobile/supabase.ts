import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// URL e Chave apontando para a sua VPS Externa
const supabaseUrl = 'https://api.147-15-43-141.nip.io';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzczOTU2NDA5LCJleHAiOjIwODk1MzI0MDl9.05kQchOXKH2S062F8SJsb-bmnh3pni-RJE1P0jo0Igs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: false, // Desativado para compatibilidade com a versão do GoTrue da VPS
    persistSession: true,
    detectSessionInUrl: false,
  },
});
