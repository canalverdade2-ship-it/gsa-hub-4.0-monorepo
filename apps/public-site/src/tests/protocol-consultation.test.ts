import { describe, it, expect, vi, beforeEach } from "vitest";
import { consultarProtocolo } from "../features/partners/service";

vi.mock("../lib/supabase", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "../lib/supabase";
const rpcMock = supabase.rpc as ReturnType<typeof vi.fn>;

const PENDING_RESULT = {
  success: true,
  codigo: "PROT-RES-2026-ABC123",
  status: "pendente",
  parceiro_nome: "Pet Shop Exemplo",
  parceiro_slug: "pet-shop-exemplo",
  parceiro_logo: null,
  nome_completo: "Adriano Peite Farias",
  telefone: "(11) 97185-8372",
  email: "adriano@gmail.com",
  tipo_resgate: "link",
  link_ativacao: null,
  created_at: "2026-08-27T10:00:00Z",
  data_ativacao: null,
};

const CONCLUIDO_RESULT = {
  ...PENDING_RESULT,
  status: "concluido",
  link_ativacao: "https://exemplo.com/beneficio/ativo",
  data_ativacao: "2026-08-27T20:00:00Z",
};

describe("consultarProtocolo", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("retorna dados completos para protocolo pendente valido", async () => {
    rpcMock.mockResolvedValueOnce({ data: PENDING_RESULT, error: null });
    const result = await consultarProtocolo("PROT-RES-2026-ABC123");
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("pendente");
    expect(result.data?.link_ativacao).toBeNull();
  });

  it("retorna link_ativacao para protocolo concluido", async () => {
    rpcMock.mockResolvedValueOnce({ data: CONCLUIDO_RESULT, error: null });
    const result = await consultarProtocolo("PROT-RES-2026-ABC123");
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe("concluido");
    expect(result.data?.link_ativacao).toBe("https://exemplo.com/beneficio/ativo");
  });

  it("retorna success false para protocolo nao encontrado", async () => {
    rpcMock.mockResolvedValueOnce({ data: { success: false, message: "Protocolo nao encontrado." }, error: null });
    const result = await consultarProtocolo("PROT-INVALIDO");
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it("normaliza o codigo para uppercase antes de enviar para a RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: PENDING_RESULT, error: null });
    await consultarProtocolo("prot-res-2026-abc123");
    expect(rpcMock).toHaveBeenCalledWith("gsa_public_consultar_protocolo", { p_codigo: "PROT-RES-2026-ABC123" });
  });

  it("retorna success false quando a RPC retorna erro", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Internal server error" } });
    const result = await consultarProtocolo("PROT-RES-2026-ABC123");
    expect(result.success).toBe(false);
  });

  it("retorna success false em caso de erro inesperado", async () => {
    rpcMock.mockRejectedValueOnce(new Error("network error"));
    const result = await consultarProtocolo("PROT-RES-2026-ABC123");
    expect(result.success).toBe(false);
  });
});
