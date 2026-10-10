import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const panel = read("src/components/admin/GsaTvModule.tsx");
const liveConsole = read("src/components/admin/GsaTvLiveConsole.tsx");
const livePreviewClient = read("src/lib/gsaTvPreview.ts");
const migration = read(
  "supabase/migrations/20260831124500_gsa_tv_end_to_end_hardening.sql",
);
const probeMigration = read(
  "supabase/migrations/20260831133000_gsa_tv_media_probe_queue.sql",
);
const control = read("infrastructure/gsa-tv/services/playout-api/src/app.js");
const aiSecurity = read(
  "supabase/migrations/20260831220500_gsa_tv_ai_provider_security.sql",
);
const aiClient = read("src/lib/gsaTvAi.ts");
const uploadClient = read("src/lib/gsaTvMediaUpload.ts");
const publishedRuntime = read(
  "supabase/migrations/20260831223000_gsa_tv_published_schedule_runtime.sql",
);
const aiLab = read("src/components/admin/gsa-tv/GsaTvAiLab.tsx");
const programmingStudio = read(
  "src/components/admin/gsa-tv/GsaTvProgrammingStudio.tsx",
);
const advertisingStudio = read(
  "src/components/admin/gsa-tv/GsaTvAdvertisingStudio.tsx",
);
const geminiRuntime = read(
  "infrastructure/gsa-tv/services/playout-api/src/gemini.js",
);
const geminiMigration = read(
  "supabase/migrations/20260901033000_gsa_tv_gemini_provider.sql",
);
const operational = read(
  "supabase/migrations/20260901014500_gsa_tv_operational_completeness.sql",
);
const watchdog = read("infrastructure/gsa-tv/services/watchdog/src/app.js");
const operationsUi = read("src/components/admin/gsa-tv/GsaTvOperations.tsx");
const backupFull = read("infrastructure/gsa-tv/scripts/backup-full.sh");
const n8nBridge = read("infrastructure/gsa-tv/services/n8n-bridge/server.js");
const n8nWorkflowDir = path.join(root, "infrastructure/gsa-tv/n8n/workflows");
const n8nWorkflows = fs.readdirSync(n8nWorkflowDir).filter((x) => x.endsWith(".json")).sort().map((x) => read("infrastructure/gsa-tv/n8n/workflows/" + x));
const n8nWorkflowText = n8nWorkflows.join("\n");
const n8nWorkflowJsons = n8nWorkflows.map((x) => JSON.parse(x));
const n8nCompose = read("infrastructure/gsa-tv/n8n/docker-compose.yml");
const n8nNginx = read("infrastructure/gsa-tv/n8n/nginx-n8n.conf");
const n8nImporter = read("infrastructure/gsa-tv/n8n/import-workflows.sh");
const n8nConnectionsValid = n8nWorkflowJsons.every((w: any) => {
  const names = new Set((w.nodes || []).map((n: any) => n.name));
  return Object.entries(w.connections || {}).every(([from, outputs]: any) =>
    names.has(from) && (outputs.main || []).flat().every((edge: any) => names.has(edge.node)));
});
const n8nTestTriggersValid = n8nWorkflowJsons.every((w: any) =>
  (w.nodes || []).some((n: any) => n.type === "n8n-nodes-base.scheduleTrigger") &&
  (w.nodes || []).some((n: any) => n.type === "n8n-nodes-base.executeWorkflowTrigger"));

const checks: Array<[string, boolean]> = [
  [
    "painel usa snapshot administrativo",
    panel.includes("callAdminRpc<Snapshot>('gsa_admin_gsa_tv_snapshot')"),
  ],
  [
    "painel usa mutaÃ§Ã£o administrativa",
    panel.includes("'gsa_admin_gsa_tv_mutate'"),
  ],
  ["painel nÃ£o usa localStorage", !panel.includes("localStorage")],
  ["painel nÃ£o acessa tabelas diretamente", !panel.includes(".from('gsa_tv_")],
  [
    "painel nÃ£o contÃ©m chave de transmissÃ£o",
    !/stream[_ -]?key\s*[:=]\s*['"][^'"]+/i.test(panel),
  ],
  ["painel nÃ£o chama endpoints simulados", !panel.includes("/api/gsa-tv/")],
  [
    "migraÃ§Ã£o revoga acesso direto",
    migration.includes(
      "REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated",
    ),
  ],
  [
    "snapshot remove segredos",
    migration.includes(
      "'config', c.config - 'stream_key' - 'youtube_stream_key' - 'rtmp_key'",
    ),
  ],
  [
    "agenda valida sobreposiÃ§Ã£o",
    migration.includes("tstzrange(s.scheduled_start,s.scheduled_end"),
  ],
  [
    "auditoria usa contexto de sessÃ£o",
    migration.includes("'session_id', p_context->>'session_id'"),
  ],
  [
    "mÃ­dia gera tarefa de inspeÃ§Ã£o",
    probeMigration.includes("'probe_media'"),
  ],
  [
    "control plane usa fila com lock",
    control.includes("for update skip locked"),
  ],
  [
    "control plane executa ffprobe",
    /execFileAsync\(\s*["']ffprobe["']/.test(control),
  ],
  [
    "control plane limita escopo de arquivo",
    control.includes("function resolveMediaPath") &&
      control.includes("direct.startsWith(rootPrefix)") &&
      control.includes("resolved.startsWith(rootPrefix)"),
  ],
  [
    "control plane atualiza heartbeat",
    control.includes("last_heartbeat_at=now()"),
  ],
  [
    "importaÃ§Ã£o por URL exige sessÃ£o administrativa",
    control.includes("async function importRemoteMedia(req)") &&
      control.includes("await requireAdminSession(req)"),
  ],
  [
    "importaÃ§Ã£o bloqueia redes privadas",
    control.includes("function privateAddress(address)") &&
      control.includes("addresses.some((x) => privateAddress(x.address))"),
  ],
  [
    "importaÃ§Ã£o limita tamanho e calcula hash",
    control.includes("MAX_UPLOAD_BYTES") &&
      /crypto\.createHash\(["']sha256["']\)/.test(control),
  ],
  [
    "cliente importa mÃ­dia para armazenamento local",
    uploadClient.includes("/media/import") &&
      /rights_confirmed:\s*true/.test(uploadClient),
  ],
  [
    "fallback configurÃ¡vel exige identidade autorizada",
    control.includes("media_kind='identity'") &&
      control.includes("'fallback_configured'"),
  ],
  [
    "credencial de IA fica em tabela restrita",
    aiSecurity.includes("api_key_ciphertext") &&
      aiSecurity.includes(
        "REVOKE ALL ON public.gsa_tv_ai_provider_secrets FROM PUBLIC,anon,authenticated",
      ),
  ],
  [
    "executor usa Responses API sem armazenar resposta no provedor",
    control.includes("https://api.openai.com/v1/responses") &&
      /store:\s*false/.test(control),
  ],
  [
    "cliente de IA nÃ£o persiste chave no navegador",
    aiClient.includes("/ai/provider") && !aiClient.includes("localStorage"),
  ],
  [
    "control plane nÃ£o registra chave da IA",
    !/log\([^\n]*apiKey/.test(control),
  ],
  [
    "comprovaÃ§Ã£o de direitos exige sessÃ£o administrativa",
    control.includes("async function receiveRightsEvidence(req)") &&
      control.includes('url.pathname === "/rights/evidence"'),
  ],
  [
    "comprovaÃ§Ã£o de direitos limita tipo e tamanho",
    control.includes("RIGHTS_EXTENSIONS") &&
      control.includes("MAX_RIGHTS_BYTES") &&
      /crypto\.createHash\(["']sha256["']\)/.test(control),
  ],
  [
    "portal aceita arquivo ou justificativa de direitos",
    uploadClient.includes("/rights/evidence") &&
      read("src/components/admin/GsaTvRights.tsx").includes("justification"),
  ],
  [
    "grade publicada possui referencias executaveis",
    publishedRuntime.includes("media_item_id text") &&
      publishedRuntime.includes("live_source_id uuid") &&
      publishedRuntime.includes("campaign_id uuid"),
  ],
  [
    "compilador prioriza grade publicada",
    control.includes("async function publishedScheduleItems") &&
      control.includes("publishedVersions"),
  ],
  [
    "entrada ao vivo agendada possui automacao",
    control.includes("async function scheduledLiveAutomation") &&
      control.includes("manual-live:"),
  ],
  [
    "campanhas usam RPC administrativo protegido",
    publishedRuntime.includes("gsa_admin_gsa_tv_advertising_mutate") &&
      advertisingStudio.includes("gsa_admin_gsa_tv_advertising_snapshot"),
  ],
  [
    "episodios e reprises chegam ao bloco",
    programmingStudio.includes("save_episode") &&
      programmingStudio.includes("is_reprise") &&
      programmingStudio.includes("episode_id"),
  ],
  [
    "revisao humana da IA esta no backend e portal",
    control.includes("async function reviewAiProject") &&
      aiClient.includes("reviewGsaTvAiProject") &&
      aiLab.includes("reviewGsaTvAiProject"),
  ],
  [
    "comentarios editoriais podem ser resolvidos",
    programmingStudio.includes("resolve_comment"),
  ],
  [
    "mídia incompatível passa por normalização broadcast",
    /const compatible\s*=\s*Boolean/.test(control) &&
      control.includes("loudnorm=I=-16:LRA=11:TP=-1.5") &&
      control.includes("blackdetect=d=2:pix_th=0.10"),
  ],
  [
    "importacao remota usa source_type permitido",
    control.includes("'remote',false,'pending'") &&
      !control.includes("'url_import',false,'pending'"),
  ],
  [
    "gravacao de ao vivo retorna para biblioteca",
    control.includes("async function startLiveRecording") &&
      control.includes("async function finalizeLiveRecording"),
  ],
  [
    "as-run relaciona campanha episodio bloco e fonte",
    operational.includes("campaign_id uuid") &&
      operational.includes("episode_id uuid") &&
      watchdog.includes("program_block_id"),
  ],
  [
    "exclusao de midia operacional possui guarda",
    operational.includes("gsa_tv_media_delete_guard_trg") &&
      operational.includes("fallback_official"),
  ],
  [
    "laboratorio gera imagem voz e video reais",
    control.includes("/v1/images/generations") &&
      control.includes("/v1/audio/speech") &&
      control.includes("/v1/videos"),
  ],
  [
    "laboratorio usa fila persistente independente do sinal",
    control.includes("async function processAiJobs") &&
      control.includes("for update skip locked"),
  ],
  [
    "apresentador permanente reutiliza identidade",
    control.includes("ensurePresenterReference") &&
      control.includes("fixed_identity_fallback"),
  ],
  [
    "alerta operacional usa n8n com cooldown",
    watchdog.includes("maybeDispatchAlert") &&
      watchdog.includes("cooldown_minutes") &&
      watchdog.includes("N8N_WHATSAPP_WEBHOOK_URL"),
  ],
  [
    "backup integral inclui banco configuracao midia e restore test",
    backupFull.includes("pg_dump") &&
      backupFull.includes("pg_restore") &&
      backupFull.includes("restore"),
  ],
  [
    "portal possui operacoes armazenamento backup e alertas",
    operationsUi.includes("Armazenamento") &&
      operationsUi.includes("Backup") &&
      operationsUi.includes("WhatsApp"),
  ],
  [
    "Gemini usa cofre protegido",
    /provider IN \('openai','gemini'\)/.test(geminiMigration) &&
      /provider\s*===\s*["']gemini["']/.test(control),
  ],
  [
    "gemini cobre texto imagem voz e video",
    geminiRuntime.includes("generateText") &&
      geminiRuntime.includes("generateImage") &&
      geminiRuntime.includes("generateSpeech") &&
      geminiRuntime.includes("generateVideo"),
  ],
  [
    "veo usa operacao longa e polling",
    geminiRuntime.includes("predictLongRunning") &&
      geminiRuntime.includes("operation.name"),
  ],
  ["aba Operacoes aparece na navegacao", panel.includes("id: 'operations'") && panel.includes("label: 'Operações'")],
  ["editor de programacao nao possui marcador de encoding corrompido", !programmingStudio.includes("Autom?tica") && !programmingStudio.includes(" ? {x.priority}")],
  ["API interna de automacao tem escopo limitado", control.includes("AUTOMATION_JOB_TYPES") && control.includes("/automation/snapshot") && control.includes("/automation/jobs") && !/AUTOMATION_JOB_TYPES[^;]+stream_start/s.test(control)],
  ["ponte n8n restringe origem e rotas", n8nBridge.includes("ALLOWED_CLIENT") && n8nBridge.includes("remoteIp(req) !== ALLOWED_CLIENT") && n8nBridge.includes("allowedRoute")],
  ["nove workflows n8n atuais estao versionados", n8nWorkflows.length === 9],
  ["workflows n8n nao usam arquitetura Google Drive legada", !/google drive|rclone|gsa-tv-media-worker|gsa-tv-cache-manager|gsa-tv-playlist-compiler|:9200|:9201|:9203|schema=gsa_tv|SUPABASE_SERVICE_ROLE_KEY/i.test(n8nWorkflowText)],
  ["workflow n8n 07 produz somente projetos aprovados para autonomia", n8nWorkflowText.includes("Approved Autonomous Projects") && n8nWorkflowText.includes("ai_ready")],
  ["backend exige autonomia aprovada para IA via n8n", control.includes("requireAutonomy") && control.includes("supervised_auto") && control.includes("authorized_routine") && control.includes("Projeto não autorizado para execução automática")],
  ["automacao n8n nao pode reiniciar playout nem validar credenciais", !/AUTOMATION_JOB_TYPES[^;]+playout_reload/s.test(control) && !/AUTOMATION_JOB_TYPES[^;]+credentials_check/s.test(control) && !/AUTOMATION_JOB_TYPES[^;]+relay_check/s.test(control)],
  ["workflows n8n possuem gatilho de homologacao e conexoes validas", n8nTestTriggersValid && n8nConnectionsValid],
  ["runtime n8n publica somente loopback e usa env root-only externo", n8nCompose.includes('127.0.0.1:5678:5678') && n8nCompose.includes('/etc/gsa/n8n.env') && !/PASSWORDs*[:=]s*[^$s]/i.test(n8nCompose)],
  ["proxy n8n termina TLS e encaminha apenas para loopback", n8nNginx.includes('listen 443 ssl') && n8nNginx.includes('proxy_pass http://127.0.0.1:5678')],
  ["importador n8n atualiza ID estavel e publica nova versao", n8nImporter.includes('n8n import:workflow') && n8nImporter.includes('n8n publish:workflow') && !n8nImporter.includes('skip|')],
  ["mesa ao vivo possui monitores de previa e no ar", liveConsole.includes("youtubeConfirmed ? 'NO AR' : 'SINAL LOCAL'") && liveConsole.includes('label="PRÉVIA"') && liveConsole.includes('BroadcastPlayer')],
  ["painel diferencia relay de youtube confirmado", panel.includes('Relay enviando — YouTube não confirmado') && panel.includes("publicSignal?.confirmed === true") && liveConsole.includes('Relay enviando — não confirmado')],
  ["mesa ao vivo possui comandos editoriais completos", ['playout_previous','playout_next','stream_pause','stream_resume','media_take','live_take','emergency_take','live_return'].every((command) => liveConsole.includes(command))],
  ["mesa ao vivo possui fila contagem youtube e historico", liveConsole.includes('Tempo restante') && liveConsole.includes('liveData?.youtube') && liveConsole.includes('liveData?.queue') && liveConsole.includes('liveData?.history')],
  ["mesa ao vivo possui plantao e graficos rapidos", liveConsole.includes('value="breaking"') && control.includes('preset === "breaking"') && liveConsole.includes('graphics_reload')],
  ["previas de sinal e midia usam autorizacao temporaria", livePreviewClient.includes('/preview/token') && livePreviewClient.includes('/preview/token`') && control.includes('mediaPreviewTokenValid') && control.includes('timingSafeEqual')],
  ["snapshot da mesa exige sessao administrativa", control.includes('async function liveConsoleSnapshot(req)') && control.includes('await requireAdminSession(req)') && control.includes('/live-console/snapshot')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`GSA TV: ${checks.length} contratos verificados.`);
