import { callAdminRpc } from './adminRpc';

export type GsaTvLiveCommand =
  | 'stream_start' | 'stream_pause' | 'stream_resume' | 'stream_stop'
  | 'playout_next' | 'playout_previous' | 'playout_reset'
  | 'live_take' | 'live_return' | 'media_take' | 'emergency_take'
  | 'graphics_reload' | 'live_badge_toggle';

type GsaTvJob = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  job_type?: string;
  error_message?: string | null;
  result?: Record<string, unknown> | null;
};

type GsaTvSnapshot = { jobs?: GsaTvJob[] };

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

async function waitForTerminalJob(jobId: string, timeoutMs = 60_000): Promise<GsaTvJob> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await callAdminRpc<GsaTvSnapshot>('gsa_admin_gsa_tv_snapshot');
    const job = snapshot.jobs?.find((candidate) => candidate.id === jobId);
    if (job?.status === 'completed') return job;
    if (job?.status === 'failed' || job?.status === 'cancelled') {
      throw new Error(job.error_message || `O comando terminou com estado ${job.status}.`);
    }
    await wait(800);
  }
  throw new Error('O comando continua em processamento e ainda não foi confirmado pela VPS. Consulte o estado antes de repetir.');
}

export async function sendGsaTvLiveCommand(
  command: GsaTvLiveCommand,
  payload: Record<string, unknown> = {},
) {
  const receipt = await callAdminRpc<{ success: boolean; id: string; status: string; command: string }>(
    'gsa_admin_gsa_tv_live_command',
    { p_command: command, p_payload: payload },
  );
  if (!receipt?.success || !receipt.id) {
    throw new Error('A VPS não confirmou o recebimento do comando.');
  }
  const job = await waitForTerminalJob(receipt.id);
  return { ...receipt, status: job.status, job };
}
