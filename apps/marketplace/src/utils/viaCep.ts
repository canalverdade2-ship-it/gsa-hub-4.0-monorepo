/**
 * Consulta de endereço via API ViaCEP (gratuita)
 * https://viacep.com.br/
 */

export interface ViaCEPResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export async function consultarCEP(cep: string): Promise<ViaCEPResult | null> {
  const cleaned = cep.replace(/\D/g, '');
  
  if (cleaned.length !== 8) return null;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
    
    if (!response.ok) return null;
    
    const data: ViaCEPResult = await response.json();
    
    if (data.erro) return null;
    
    return data;
  } catch (error) {
    console.error('Erro ao consultar CEP:', error);
    return null;
  }
}
