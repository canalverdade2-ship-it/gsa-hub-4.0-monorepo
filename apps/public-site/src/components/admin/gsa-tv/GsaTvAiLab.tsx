import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  BrainCircuit,
  Image,
  Loader2,
  Mic2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { callAdminRpc } from "../../../lib/adminRpc";
import {
  configureGsaTvAiProvider,
  getGsaTvAiProviderStatus,
  reviewGsaTvAiProject,
  runGsaTvAiProject,
} from "../../../lib/gsaTvAi";

type Domain = {
  ai_projects: any[];
  ai_jobs: any[];
  ai_assets: any[];
  ai_presenters: any[];
};
const EMPTY: Domain = {
  ai_projects: [],
  ai_jobs: [],
  ai_assets: [],
  ai_presenters: [],
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String((error as any)?.message || error);

export function GsaTvAiLab({ channelId = "ch-main" }: { channelId?: string }) {
  const [data, setData] = useState<Domain>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"projects" | "presenters" | "production">(
    "projects",
  );
  const [project, setProject] = useState({
    name: "",
    projectType: "full_production",
    brief: "",
    autonomy: "supervised_auto",
    presenterId: "",
    seconds: "8",
    voice: "coral",
  });
  const [presenter, setPresenter] = useState({
    name: "",
    role: "Notícias e boletins",
    personality: "",
    voice: "",
    visual: "",
  });
  const [provider, setProvider] = useState({
    provider: "gemini",
    configured: false,
    default_model: "gemini-2.5-flash",
    image_model: "gemini-3.1-flash-image",
    speech_model: "gemini-3.1-flash-tts-preview",
    video_model: "veo-3.1-generate-preview",
    daily_budget: null as number | null,
    monthly_budget: null as number | null,
  });
  const [apiKey, setApiKey] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [value, status] = await Promise.all([
        callAdminRpc<Domain>("gsa_admin_gsa_tv_domain_snapshot"),
        getGsaTvAiProviderStatus(),
      ]);
      setData({ ...EMPTY, ...value });
      setProvider(status);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (
    action: string,
    payload: Record<string, unknown>,
    message: string,
  ) => {
    setSaving(true);
    try {
      await callAdminRpc("gsa_admin_gsa_tv_domain_mutate", {
        p_action: action,
        p_payload: { channel_id: channelId, ...payload },
      });
      toast.success(message);
      await load();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const activeJobs = useMemo(
    () =>
      data.ai_jobs.filter((x) =>
        ["queued", "pending", "running", "review"].includes(x.state),
      ),
    [data.ai_jobs],
  );
  const selectedJob = useMemo(
    () => data.ai_jobs.find((x) => x.id === selectedJobId) || null,
    [data.ai_jobs, selectedJobId],
  );
  const selectedProject = useMemo(
    () =>
      data.ai_projects.find((x) => x.id === selectedJob?.project_id) || null,
    [data.ai_projects, selectedJob],
  );
  if (loading)
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
      </div>
    );
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <BrainCircuit className="h-7 w-7 text-violet-200" />
            </div>
            <div>
              <h2 className="text-xl font-black">Laboratório de IA</h2>
              <p className="mt-1 max-w-2xl text-sm text-violet-100/80">
                Central completa de planejamento, pesquisa, criação audiovisual,
                apresentadores virtuais, revisão e publicação.
              </p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-bold"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <AiMetric label="Projetos" value={data.ai_projects.length} />
          <AiMetric label="Em produção" value={activeJobs.length} />
          <AiMetric label="Materiais" value={data.ai_assets.length} />
          <AiMetric label="Apresentadores" value={data.ai_presenters.length} />
        </div>
        <div
          className={`mt-4 rounded-xl p-3 text-sm ${provider.configured ? "bg-emerald-400/15 text-emerald-100" : "bg-amber-400/15 text-amber-100"}`}
        >
          <strong>
            {provider.configured
              ? "API oficial configurada"
              : "API oficial ainda não configurada"}
          </strong>
          <span className="ml-2">
            {provider.provider === "gemini" ? "Gemini" : "OpenAI"} · Modelo:{" "}
            {provider.default_model}
          </span>
        </div>
      </section>
      <nav
        className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2"
        aria-label="Áreas do Laboratório"
      >
        <LabTab
          active={view === "projects"}
          onClick={() => setView("projects")}
          icon={Sparkles}
        >
          Projetos e comando
        </LabTab>
        <LabTab
          active={view === "presenters"}
          onClick={() => setView("presenters")}
          icon={UserRound}
        >
          Apresentadores virtuais
        </LabTab>
        <LabTab
          active={view === "production"}
          onClick={() => setView("production")}
          icon={Video}
        >
          Fila e criações
        </LabTab>
      </nav>
      {view === "projects" && (
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <LabPanel title="Novo projeto completo" icon={Plus}>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await mutate(
                  "save_ai_project",
                  {
                    name: project.name,
                    project_type: project.projectType,
                    brief: project.brief,
                    autonomy_mode: project.autonomy,
                    metadata: {
                      presenter_id: project.presenterId || null,
                      seconds: Number(project.seconds) || 8,
                      voice: project.voice || "coral",
                    },
                  },
                  "Projeto criado no Laboratório.",
                );
                if (ok)
                  setProject({
                    name: "",
                    projectType: "full_production",
                    brief: "",
                    autonomy: "supervised_auto",
                    presenterId: "",
                    seconds: "8",
                    voice: "coral",
                  });
              }}
            >
              <LabField label="Nome do projeto">
                <input
                  required
                  value={project.name}
                  onChange={(e) =>
                    setProject({ ...project, name: e.target.value })
                  }
                />
              </LabField>
              <LabField label="O que a IA deve produzir">
                <select
                  value={project.projectType}
                  onChange={(e) =>
                    setProject({ ...project, projectType: e.target.value })
                  }
                >
                  <option value="full_production">Produção completa</option>
                  <option value="schedule">Programação</option>
                  <option value="news">Notícias e boletim</option>
                  <option value="advertising">Publicidade</option>
                  <option value="image">Imagem</option>
                  <option value="audio">Áudio e locução</option>
                  <option value="video">Vídeo</option>
                  <option value="research">Pesquisa na internet</option>
                  <option value="script">Redação e roteiro</option>
                  <option value="translation">Tradução e legendas</option>
                  <option value="quality">Qualidade e conformidade</option>
                </select>
              </LabField>
              {project.projectType === "video" && (
                <>
                  <LabField label="Apresentador permanente">
                    <select
                      value={project.presenterId}
                      onChange={(e) =>
                        setProject({ ...project, presenterId: e.target.value })
                      }
                    >
                      <option value="">
                        Vídeo generativo sem apresentador fixo
                      </option>
                      {data.ai_presenters.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ? {x.role}
                        </option>
                      ))}
                    </select>
                  </LabField>
                  <LabField label="Duração do clipe">
                    <select
                      value={project.seconds}
                      onChange={(e) =>
                        setProject({ ...project, seconds: e.target.value })
                      }
                    >
                      {[4, 8, 12, 16, 20].map((x) => (
                        <option key={x} value={x}>
                          {x} segundos
                        </option>
                      ))}
                    </select>
                  </LabField>
                </>
              )}
              {project.projectType === "audio" && (
                <LabField label="Voz OpenAI">
                  <select
                    value={project.voice}
                    onChange={(e) =>
                      setProject({ ...project, voice: e.target.value })
                    }
                  >
                    {[
                      "coral",
                      "alloy",
                      "ash",
                      "ballad",
                      "echo",
                      "fable",
                      "nova",
                      "onyx",
                      "sage",
                      "shimmer",
                      "verse",
                    ].map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </LabField>
              )}
              <LabField label="Nível de autonomia">
                <select
                  value={project.autonomy}
                  onChange={(e) =>
                    setProject({ ...project, autonomy: e.target.value })
                  }
                >
                  <option value="assisted">Confirmar etapas importantes</option>
                  <option value="supervised_auto">
                    Produzir tudo e revisar no final
                  </option>
                  <option value="authorized_routine">
                    Rotina previamente autorizada
                  </option>
                </select>
              </LabField>
              <LabField label="Comando completo">
                <textarea
                  required
                  rows={8}
                  value={project.brief}
                  onChange={(e) =>
                    setProject({ ...project, brief: e.target.value })
                  }
                  placeholder="Descreva a programação, os temas, o apresentador, os vídeos, imagens, áudios, intervalos e demais orientações."
                />
              </LabField>
              <button
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                Analisar e preparar projeto
              </button>
            </form>
          </LabPanel>
          <div className="space-y-4">
            <LabPanel title="Conexão oficial da IA" icon={Bot}>
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  try {
                    const s = await configureGsaTvAiProvider(
                      apiKey,
                      provider.default_model,
                      {
                        provider: provider.provider,
                        image_model: provider.image_model,
                        speech_model: provider.speech_model,
                        video_model: provider.video_model,
                        daily_budget: provider.daily_budget,
                        monthly_budget: provider.monthly_budget,
                      },
                    );
                    setProvider(s);
                    setApiKey("");
                    toast.success("API de IA protegida e configurada.");
                  } catch (error) {
                    toast.error(errorText(error));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <LabField label="Provedor">
                  <select
                    value={provider.provider}
                    onChange={(e) => {
                      const v = e.target.value;
                      setProvider({
                        ...provider,
                        provider: v,
                        default_model:
                          v === "gemini" ? "gemini-2.5-flash" : "gpt-5.4-mini",
                        image_model:
                          v === "gemini"
                            ? "gemini-3.1-flash-image"
                            : "gpt-image-2",
                        speech_model:
                          v === "gemini"
                            ? "gemini-3.1-flash-tts-preview"
                            : "gpt-4o-mini-tts",
                        video_model:
                          v === "gemini"
                            ? "veo-3.1-generate-preview"
                            : "sora-2",
                      });
                    }}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </LabField>
                <LabField
                  label={`Chave da API ${provider.provider === "gemini" ? "Gemini" : "OpenAI"}`}
                >
                  <input
                    required={!provider.configured}
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={
                      provider.configured
                        ? "Digite somente para substituir"
                        : provider.provider === "gemini"
                          ? "AIza..."
                          : "sk-..."
                    }
                  />
                </LabField>
                <LabField label="Modelo editorial">
                  <input
                    required
                    value={provider.default_model}
                    onChange={(e) =>
                      setProvider({
                        ...provider,
                        default_model: e.target.value,
                      })
                    }
                  />
                </LabField>
                <div className="grid gap-3 md:grid-cols-3">
                  <LabField label="Modelo de imagem">
                    <input
                      required
                      value={provider.image_model}
                      onChange={(e) =>
                        setProvider({
                          ...provider,
                          image_model: e.target.value,
                        })
                      }
                    />
                  </LabField>
                  <LabField label="Modelo de voz">
                    <input
                      required
                      value={provider.speech_model}
                      onChange={(e) =>
                        setProvider({
                          ...provider,
                          speech_model: e.target.value,
                        })
                      }
                    />
                  </LabField>
                  <LabField label="Modelo de vídeo">
                    <input
                      required
                      value={provider.video_model}
                      onChange={(e) =>
                        setProvider({
                          ...provider,
                          video_model: e.target.value,
                        })
                      }
                    />
                  </LabField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <LabField label="Limite diário">
                    <input 
                      type="number"
                      min="0"
                      step="0.01"
                      value={provider.daily_budget ?? ""}
                      inputMode="numeric"
onChange={(e) =>
                        setProvider({
                          ...provider,
                          daily_budget:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </LabField>
                  <LabField label="Limite mensal">
                    <input 
                      type="number"
                      min="0"
                      step="0.01"
                      value={provider.monthly_budget ?? ""}
                      inputMode="numeric"
onChange={(e) =>
                        setProvider({
                          ...provider,
                          monthly_budget:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </LabField>
                </div>
                <p className="text-xs text-slate-500">
                  A chave é criptografada, não retorna ao navegador e não
                  aparece em logs.
                </p>
                <button
                  disabled={saving || (!provider.configured && !apiKey)}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  Salvar conexão protegida
                </button>
              </form>
            </LabPanel>
            <LabPanel title="Projetos do Laboratório" icon={BrainCircuit}>
              {data.ai_projects.length ? (
                <div className="divide-y">
                  {data.ai_projects.map((x) => (
                    <div key={x.id} className="py-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong>{x.name}</strong>
                        <LabBadge value={x.state} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                        {x.brief}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-violet-700">
                          {x.project_type} · {x.autonomy_mode}
                        </p>
                        <button
                          disabled={
                            saving ||
                            !provider.configured ||
                            ["running", "generating"].includes(x.state)
                          }
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await runGsaTvAiProject(x.id);
                              toast.success(
                                "Produção iniciada. O resultado seguirá para revisão humana.",
                              );
                              await load();
                            } catch (error) {
                              toast.error(errorText(error));
                            } finally {
                              setSaving(false);
                            }
                          }}
                          className="rounded-lg border px-3 py-1.5 text-xs font-black disabled:opacity-40"
                        >
                          Produzir agora
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="Nenhum projeto de IA criado." />
              )}
            </LabPanel>
          </div>
        </div>
      )}
      {view === "presenters" && (
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <LabPanel title="Criar apresentador permanente" icon={UserRound}>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await mutate(
                  "save_presenter",
                  {
                    name: presenter.name,
                    role: presenter.role,
                    visual_profile: {
                      description: presenter.visual,
                      identity_locked: true,
                    },
                    voice_profile: {
                      description: presenter.voice,
                      fixed_voice: true,
                    },
                    editorial_profile: { personality: presenter.personality },
                  },
                  "Apresentador salvo como identidade permanente.",
                );
                if (ok)
                  setPresenter({
                    name: "",
                    role: "Notícias e boletins",
                    personality: "",
                    voice: "",
                    visual: "",
                  });
              }}
            >
              <LabField label="Nome artístico">
                <input
                  required
                  value={presenter.name}
                  onChange={(e) =>
                    setPresenter({ ...presenter, name: e.target.value })
                  }
                />
              </LabField>
              <LabField label="Função">
                <select
                  value={presenter.role}
                  onChange={(e) =>
                    setPresenter({ ...presenter, role: e.target.value })
                  }
                >
                  <option>Notícias e boletins</option>
                  <option>Institucional GSA</option>
                  <option>Marketplace e publicidade</option>
                  <option>Esportes</option>
                  <option>Tecnologia</option>
                  <option>Locutor sem avatar</option>
                </select>
              </LabField>
              <LabField label="Aparência e cenário">
                <textarea
                  required
                  rows={4}
                  value={presenter.visual}
                  onChange={(e) =>
                    setPresenter({ ...presenter, visual: e.target.value })
                  }
                />
              </LabField>
              <LabField label="Voz e maneira de falar">
                <textarea
                  required
                  rows={3}
                  value={presenter.voice}
                  onChange={(e) =>
                    setPresenter({ ...presenter, voice: e.target.value })
                  }
                />
              </LabField>
              <LabField label="Personalidade editorial">
                <textarea
                  required
                  rows={3}
                  value={presenter.personality}
                  onChange={(e) =>
                    setPresenter({ ...presenter, personality: e.target.value })
                  }
                />
              </LabField>
              <button
                disabled={saving}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                Salvar identidade permanente
              </button>
            </form>
          </LabPanel>
          <LabPanel title="Elenco oficial" icon={Bot}>
            {data.ai_presenters.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {data.ai_presenters.map((x) => (
                  <article key={x.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between">
                      <div className="rounded-xl bg-violet-50 p-2">
                        <UserRound className="h-5 w-5 text-violet-700" />
                      </div>
                      <LabBadge value={x.status} />
                    </div>
                    <h3 className="mt-3 font-black">{x.name}</h3>
                    <p className="text-sm text-slate-500">{x.role}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Identidade v{x.identity_version} · rosto e voz bloqueados
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <Empty text="Nenhum apresentador permanente cadastrado." />
            )}
          </LabPanel>
        </div>
      )}
      {view === "production" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <LabPanel title="Fila de produção" icon={Loader2}>
            {data.ai_jobs.length ? (
              <div className="divide-y">
                {data.ai_jobs.map((x) => (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedJobId(x.id);
                      setReviewNotes("");
                    }}
                    key={x.id}
                    className={`flex w-full items-center justify-between gap-3 py-3 text-left ${selectedJobId === x.id ? "bg-violet-50" : ""}`}
                  >
                    <div>
                      <strong className="text-sm">{x.job_type}</strong>
                      <p className="text-xs text-slate-500">
                        {x.provider || "Fornecedor a definir"} ·{" "}
                        {x.progress || 0}%
                      </p>
                    </div>
                    <LabBadge value={x.state} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty text="A fila de produção está vazia." />
            )}
          </LabPanel>
          <div className="space-y-4">
            {selectedJob ? (
              <LabPanel title="Resultado e revisão humana" icon={ShieldCheck}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <strong>
                      {selectedProject?.name || selectedJob.job_type}
                    </strong>
                    <LabBadge
                      value={selectedProject?.state || selectedJob.state}
                    />
                  </div>
                  {selectedJob.error_message ? (
                    <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                      {selectedJob.error_message}
                    </p>
                  ) : (
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                      {selectedJob.output?.text ||
                        selectedJob.output?.content ||
                        JSON.stringify(selectedJob.output || {}, null, 2) ||
                        "A produção ainda não retornou conteúdo para revisão."}
                    </pre>
                  )}
                  {selectedProject?.state === "review" && (
                    <>
                      <LabField label="Parecer do responsável">
                        <textarea
                          rows={4}
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Registre correções, justificativa ou observações da aprovação."
                        />
                      </LabField>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await reviewGsaTvAiProject(
                                selectedProject.id,
                                "rejected",
                                reviewNotes,
                              );
                              toast.success("Produção rejeitada e registrada.");
                              await load();
                            } catch (error) {
                              toast.error(errorText(error));
                            } finally {
                              setSaving(false);
                            }
                          }}
                          className="rounded-lg border border-rose-200 px-3 py-2.5 text-sm font-black text-rose-700 disabled:opacity-50"
                        >
                          Rejeitar
                        </button>
                        <button
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await reviewGsaTvAiProject(
                                selectedProject.id,
                                "approved",
                                reviewNotes,
                              );
                              toast.success(
                                "Produção aprovada pelo responsável.",
                              );
                              await load();
                            } catch (error) {
                              toast.error(errorText(error));
                            } finally {
                              setSaving(false);
                            }
                          }}
                          className="rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-black text-white disabled:opacity-50"
                        >
                          Aprovar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </LabPanel>
            ) : (
              <LabPanel title="Revisão humana" icon={ShieldCheck}>
                <Empty text="Selecione uma produção para abrir o resultado e emitir o parecer." />
              </LabPanel>
            )}
            <LabPanel title="Tipos de criação" icon={Sparkles}>
              <div className="grid grid-cols-2 gap-3">
                <Capability icon={Image} label="Imagens" />
                <Capability icon={Mic2} label="Vozes e áudios" />
                <Capability icon={Video} label="Vídeos" />
                <Capability icon={UserRound} label="Apresentadores" />
                <Capability icon={BrainCircuit} label="Programação" />
                <Capability icon={Bot} label="Pesquisa e redação" />
              </div>
            </LabPanel>
          </div>
        </div>
      )}
    </div>
  );
}
function LabPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 font-black">
        <Icon className="h-5 w-5 text-violet-700" />
        {title}
      </h3>
      {children}
    </section>
  );
}
function LabField({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      <span className="mb-1 block">{label}</span>
      {React.cloneElement(children as React.ReactElement<any>, {
        className:
          "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100",
      })}
    </label>
  );
}
function LabTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${active ? "bg-violet-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
function AiMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <p className="text-xs text-violet-100/70">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}
function LabBadge({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase text-violet-700">
      {value || "desconhecido"}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
function Capability({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-bold">
      <Icon className="h-4 w-4 text-violet-700" />
      {label}
    </div>
  );
}
export default GsaTvAiLab;
