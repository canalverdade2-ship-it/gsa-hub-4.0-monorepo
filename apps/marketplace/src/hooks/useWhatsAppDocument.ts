import { useState } from 'react';
import toast from 'react-hot-toast';
import { whatsappNotificationService } from '../lib/whatsappNotificationService';

export function useWhatsAppDocument() {
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const sendToWhatsApp = async (
    telefone: string | undefined | null,
    mensagem: string,
    base64Data?: string,
    fileName?: string,
    pdfUrl?: string
  ) => {
    if (!telefone) {
      toast.error('Número de telefone não encontrado no cadastro. Por favor, atualize seu perfil.');
      return false;
    }

    try {
      setIsSendingWhatsApp(true);
      toast.loading('Enviando para o seu WhatsApp...', { id: 'wa-send' });

      const cleanPhone = telefone.replace(/\D/g, '');

      if (cleanPhone.length < 10) {
        throw new Error('Número de telefone inválido no cadastro. Por favor, atualize seu perfil.');
      }

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(
        cleanPhone,
        mensagem,
        {
          mediaBase64: base64Data,
          fileName: fileName,
          pdfUrl: pdfUrl,
          enableVariation: true,
        }
      );

      if (sent) {
        toast.success('Documento enviado com sucesso para o seu WhatsApp!', { id: 'wa-send' });
        return true;
      } else {
        throw new Error('Falha ao enviar mensagem pelo servidor.');
      }
    } catch (err: any) {
      console.error('Erro ao enviar WhatsApp:', err);
      toast.error(err.message || 'Erro ao enviar para o WhatsApp.', { id: 'wa-send' });
      return false;
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  return { isSendingWhatsApp, sendToWhatsApp };
}
