import { useState } from 'react';
import { FileDown, Lock, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  downloadCalculatorPdf,
  type CalculatorPdfReport,
} from '../../lib/freeToolsPdfReport';
import { freeToolsProAccess, type ProAccessStatus, type ProToolId } from '../../lib/freeToolsProAccess';

interface CalculatorPdfReportButtonProps {
  report: CalculatorPdfReport;
  mode: 'free' | 'pro';
  tool?: ProToolId;
  status?: ProAccessStatus | null;
  onUnlockRequired?: () => void;
  onPdfGenerated?: () => void;
}

export function CalculatorPdfReportButton({
  report,
  mode,
  tool,
  status,
  onUnlockRequired,
  onPdfGenerated,
}: CalculatorPdfReportButtonProps) {
  const [generating, setGenerating] = useState(false);
  const isLockedForReport = mode === 'pro' && status && !status.access;

  const generate = async () => {
    if (generating) return;

    if (isLockedForReport) {
      toast.error('A emissão do Relatório PDF Pro requer a liberação de acesso.');
      if (onUnlockRequired) {
        onUnlockRequired();
      }
      return;
    }

    setGenerating(true);
    try {
      downloadCalculatorPdf(report);
      
      const targetTool = tool || ((report as any).tool as ProToolId);

      if (mode === 'pro') {
        toast.success('Relatório PDF gerado com sucesso! Uso único do voucher concluído.');
        if (targetTool) {
          try {
            await freeToolsProAccess.consumeSession(targetTool);
          } catch {
            // sessão consumida localmente
          }
        }
        if (onPdfGenerated) {
          onPdfGenerated();
        }
      } else {
        toast.success('Relatório PDF gerado e baixado.');
      }
    } catch (error) {
      console.error('Falha ao gerar relatório PDF da calculadora:', error);
      toast.error('Não foi possível gerar o relatório PDF. Tente novamente.');
    } finally {
      window.setTimeout(() => setGenerating(false), 350);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={generate}
        disabled={generating}
        className={
          mode === 'pro'
            ? 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#d8bd73] px-4 text-sm font-black text-[#172433] transition hover:bg-[#ead695] disabled:cursor-wait disabled:opacity-70'
            : 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#d8bd73]/45 bg-white/[0.06] px-4 text-sm font-black text-white transition hover:border-[#d8bd73] hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-70'
        }
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isLockedForReport ? (
          <Lock className="h-4 w-4 text-[#172433]" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        {generating
          ? 'Gerando relatório...'
          : isLockedForReport
          ? 'Desbloquear para Gerar PDF Pro'
          : 'Gerar relatório PDF'}
      </button>
      <p className="text-center text-[10px] leading-4 text-white/45">
        {isLockedForReport
          ? 'O relatório em PDF com a memória detalhada é exclusivo para acesso Pro.'
          : 'Gerado somente no navegador. Nenhum PDF é salvo pela GSA.'}
      </p>
    </div>
  );
}
