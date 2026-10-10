import { generateUUID } from './utils';
import { jsPDF } from 'jspdf';
import { supabase } from './supabase';
import { toast } from 'react-hot-toast';

export const pdfSharingService = {
  /**
   * Faz upload de um PDF para o storage temporário e retorna a URL pública e o caminho do arquivo.
   */
  async uploadAndGetLink(doc: jsPDF, fileName: string): Promise<{ url: string; path: string } | null> {
    try {
      const blob = doc.output('blob');
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `temp_pdfs/${generateUUID()}_${sanitizedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos_prestador')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('documentos_prestador')
        .getPublicUrl(filePath);

      return { url: publicUrl, path: filePath };
    } catch (error) {
      console.error('Erro ao preparar link de compartilhamento:', error);
      toast.error('Erro ao gerar link de compartilhamento.');
      return null;
    }
  },

  /**
   * Exclui um arquivo do storage temporário.
   */
  async deleteTempFile(path: string) {
    if (!path || !path.includes('temp_pdfs/')) return;
    
    try {
      await supabase.storage.from('documentos_prestador').remove([path]);
    } catch (error) {
      console.error('Erro ao excluir arquivo temporário:', error);
    }
  },

  /**
   * Abre o WhatsApp com mensagem profissional e formatada.
   * @param phone - Telefone do destinatário
   * @param url - URL pública do documento
   * @param documentType - Tipo do documento (ex: "Orçamento", "Fatura", "Ordem de Serviço")
   * @param documentCode - Código identificador (ex: "ORC-ABC123", "FAT-XYZ")
   */
  async shareViaWhatsApp(phone: string, url: string, documentType: string, documentCode: string) {
    const cleanPhone = phone.replace(/\D/g, '');
    const artigo = ['Fatura', 'Ordem de Serviço', 'Ordem de Compra', 'Ordem de Assinatura'].includes(documentType) ? 'A' : 'O';
    const message = [
      `📄 *GSA - Gestão de Serviços*`,
      ``,
      `Olá! Informamos que ${artigo.toLowerCase()} *${documentType} ${documentCode}* está disponível no Portal do Cliente GSA.`,
      ``,
      `📎 Acesse o documento diretamente:`,
      `${url}`,
      ``,
      `🔐 Acesse agora o *Portal Completo do Cliente* para visualizar todos os seus documentos, orçamentos e faturas.`,
      ``,
      `_Mensagem enviada via GSA HUB._`
    ].join('\n');

    const text = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${text}`;
    window.open(whatsappUrl, '_blank');
  },

  /**
   * Abre o cliente de e-mail com mensagem profissional e formatada.
   * @param email - E-mail do destinatário
   * @param documentType - Tipo do documento (ex: "Orçamento", "Fatura", "Ordem de Serviço")
   * @param documentCode - Código identificador (ex: "ORC-ABC123", "FAT-XYZ")
   * @param url - URL pública do documento
   */
  async shareViaEmail(email: string, documentType: string, documentCode: string, url: string) {
    const subject = `GSA - ${documentType} ${documentCode} disponível no Portal`;
    const artigo = ['Fatura', 'Ordem de Serviço', 'Ordem de Compra', 'Ordem de Assinatura'].includes(documentType) ? 'A' : 'O';
    const body = [
      `📄 GSA - Gestão de Serviços`,
      ``,
      `Olá!`,
      ``,
      `Informamos que ${artigo.toLowerCase()} ${documentType} ${documentCode} está disponível no Portal do Cliente GSA.`,
      ``,
      `📎 Acesse o documento diretamente:`,
      `${url}`,
      ``,
      `🔐 Acesse agora o Portal Completo do Cliente para visualizar todos os seus documentos, orçamentos e faturas.`,
      ``,
      `---`,
      `Mensagem enviada via GSA HUB.`
    ].join('\n');

    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  }
};
