import { supabase } from './supabase';
import { createNotification } from './notifications';
import { toast } from 'react-hot-toast';

export const osService = {
  /**
   * Adiciona uma nota à OS e notifica o cliente automaticamente.
   */
  async addOSNote(osId: string, clienteId: string, nota: string, osCodigo: string) {
    try {
      const { error: noteError } = await supabase
        .from('os_notas')
        .insert([{ 
          os_id: osId, 
          nota 
        }]);

      if (noteError) throw noteError;

      // Notificar o cliente
      await createNotification(
        clienteId,
        '📝 Nova Observação na OS',
        `A ordem de serviço ${osCodigo} recebeu uma nova atualização no histórico: "${nota.substring(0, 50)}${nota.length > 50 ? '...' : ''}"`,
        'servicos',
        'andamento',
        osId
      );

      return { success: true };
    } catch (error) {
      console.error('Erro ao adicionar nota na OS:', error);
      toast.error('Erro ao registrar acompanhamento na OS.');
      return { success: false, error };
    }
  }
};
