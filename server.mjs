import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { z } from "zod";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

const PORT = Number(process.env.PORT || 3000);
const ACTION_API_KEY = process.env.ACTION_API_KEY || "";
const RECRUTEI_MODE = process.env.RECRUTEI_MODE || "mock";

const SENSITIVE_KEYS = new Set([
  "cpf","rg","dataNascimento","birthDate","idade","age","genero","gender",
  "raca","raça","religiao","religião","deficiencia","deficiência","estadoCivil",
  "filhos","saude","saúde","orientacaoSexual","orientaçãoSexual","diversidade",
  "telefone","phone","email","endereco","endereço"
]);

function assertActionAuth(req, res, next) {
  if (!ACTION_API_KEY) {
    return res.status(500).json({ erro: "middleware_sem_action_api_key", mensagem: "ACTION_API_KEY não configurada no servidor." });
  }
  const received = req.header("X-API-Key");
  if (received !== ACTION_API_KEY) {
    return res.status(401).json({ erro: "nao_autenticado", mensagem: "Chave da Action inválida ou ausente." });
  }
  next();
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      output[key] = sanitize(val);
    }
    return output;
  }
  return value;
}

function normalizeTalent(raw) {
  const t = sanitize(raw || {});
  return {
    talentoId: String(t.talentoId ?? t.id ?? t.talentId ?? ""),
    nome: String(t.nome ?? t.name ?? "não disponível"),
    linkInterno: t.linkInterno ?? t.profileUrl ?? t.url ?? "não disponível",
    cargoAtual: t.cargoAtual ?? t.currentRole ?? t.cargo ?? "não disponível",
    empresaAtual: t.empresaAtual ?? t.currentCompany ?? t.empresa ?? "não disponível",
    localizacaoProfissional: t.localizacaoProfissional ?? t.location ?? t.localizacao ?? "não disponível",
    senioridadeAparente: t.senioridadeAparente ?? t.seniority ?? "não disponível",
    resumoProfissional: t.resumoProfissional ?? t.summary ?? t.resumo ?? "não disponível",
    competencias: Array.isArray(t.competencias) ? t.competencias : Array.isArray(t.skills) ? t.skills : [],
    ferramentas: Array.isArray(t.ferramentas) ? t.ferramentas : Array.isArray(t.tools) ? t.tools : [],
    segmentos: Array.isArray(t.segmentos) ? t.segmentos : Array.isArray(t.segments) ? t.segments : [],
    ultimaAtualizacao: t.ultimaAtualizacao ?? t.updatedAt ?? null
  };
}

const SearchSchema = z.object({
  base: z.literal("talent_public").default("talent_public"),
  cargo: z.string().optional(),
  cargosEquivalentes: z.array(z.string()).optional(),
  palavrasChave: z.string().optional(),
  localizacao: z.string().optional(),
  senioridade: z.string().optional(),
  segmento: z.string().optional(),
  modeloTrabalho: z.enum(["remoto", "híbrido", "presencial", "indiferente"]).optional(),
  regimeContratacao: z.string().optional(),
  aderenciaMinima: z.number().int().min(0).max(100).default(70),
  limite: z.number().int().min(1).max(50).default(30),
  pagina: z.number().int().min(1).default(1)
});

async function callRecruteiApi(url, options = {}) {
  const authHeaderName = process.env.RECRUTEI_AUTH_HEADER_NAME || "Authorization";
  const apiToken = process.env.RECRUTEI_API_TOKEN || "";
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (apiToken) headers[authHeaderName] = apiToken;

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }

  if (!response.ok) return { ok: false, status: response.status, body };
  return { ok: true, status: response.status, body };
}

function mockSearch(payload) {
  const query = [payload.cargo, payload.palavrasChave, payload.localizacao].filter(Boolean).join(" ").toLowerCase();
  const all = [
    {
      talentoId: "mock-ai-001",
      nome: "Candidato Mock AI 001",
      cargoAtual: "AI Engineer",
      empresaAtual: "Empresa de Tecnologia",
      localizacaoProfissional: "Florianópolis/SC",
      senioridadeAparente: "sênior",
      resumoProfissional: "Perfil fictício para teste da Action. Experiência com Python, LLMs, OpenAI, RAG, embeddings, LangChain, APIs e chatbots.",
      competencias: ["Python", "IA generativa", "LLM", "NLP", "RAG", "APIs"],
      ferramentas: ["OpenAI", "LangChain", "Vector DB"],
      segmentos: ["tecnologia", "automação conversacional"]
    },
    {
      talentoId: "mock-py-002",
      nome: "Candidato Mock Python 002",
      cargoAtual: "Desenvolvedor Python",
      empresaAtual: "Software House",
      localizacaoProfissional: "Curitiba/PR",
      senioridadeAparente: "pleno",
      resumoProfissional: "Perfil fictício para teste da Action. Desenvolvimento Python, integrações, APIs, automações e contato com soluções de IA.",
      competencias: ["Python", "APIs", "Integração de sistemas", "Automação"],
      ferramentas: ["FastAPI", "Docker"],
      segmentos: ["software", "tecnologia"]
    }
  ];
  const filtered = all.filter(t => {
    if (!query) return true;
    const haystack = JSON.stringify(t).toLowerCase();
    return query.split(/\s+/).some(term => term.length >= 3 && haystack.includes(term));
  });
  return filtered.slice(0, payload.limite).map(normalizeTalent);
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "recrutei-talent-public-action", mode: RECRUTEI_MODE });
});

app.post("/recrutei/talent/public/search", assertActionAuth, async (req, res) => {
  const parsed = SearchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "parametros_invalidos", mensagem: "Parâmetros inválidos para busca de talentos.", detalheTecnico: parsed.error.flatten() });
  }

  const payload = parsed.data;

  try {
    if (RECRUTEI_MODE === "mock") {
      const talentos = mockSearch(payload);
      return res.json({ totalEncontrado: talentos.length, pagina: payload.pagina, limite: payload.limite, origem: "talent_public", talentos });
    }

    if (RECRUTEI_MODE !== "api") {
      return res.status(500).json({ erro: "modo_invalido", mensagem: "RECRUTEI_MODE deve ser 'mock' ou 'api'." });
    }

    const searchUrl = process.env.RECRUTEI_SEARCH_URL;
    if (!searchUrl) {
      return res.status(500).json({ erro: "endpoint_busca_nao_configurado", mensagem: "RECRUTEI_SEARCH_URL não configurado no servidor." });
    }

    const apiResult = await callRecruteiApi(searchUrl, { method: "POST", body: JSON.stringify(payload) });
    if (!apiResult.ok) {
      return res.status(502).json({ erro: "erro_api_recrutei", mensagem: "Falha ao consultar a API/base pública de talentos.", detalheTecnico: sanitize(apiResult.body) });
    }

    const body = sanitize(apiResult.body);
    const rawTalentos = Array.isArray(body) ? body : Array.isArray(body.talentos) ? body.talentos : Array.isArray(body.data) ? body.data : Array.isArray(body.results) ? body.results : [];
    const talentos = rawTalentos.map(normalizeTalent).filter(t => t.talentoId);

    return res.json({
      totalEncontrado: Number(body.totalEncontrado ?? body.total ?? talentos.length),
      pagina: payload.pagina,
      limite: payload.limite,
      origem: "talent_public",
      talentos
    });
  } catch (error) {
    return res.status(500).json({ erro: "erro_interno_middleware", mensagem: "Erro interno ao buscar talentos.", detalheTecnico: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/recrutei/talent/public/:talentoId/profile", assertActionAuth, async (req, res) => {
  const { talentoId } = req.params;
  if (RECRUTEI_MODE === "mock") {
    return res.json({
      talentoId,
      nome: talentoId === "mock-ai-001" ? "Candidato Mock AI 001" : "Candidato Mock Python 002",
      linkInterno: "não disponível",
      cargoAtual: talentoId === "mock-ai-001" ? "AI Engineer" : "Desenvolvedor Python",
      empresaAtual: talentoId === "mock-ai-001" ? "Empresa de Tecnologia" : "Software House",
      localizacaoProfissional: talentoId === "mock-ai-001" ? "Florianópolis/SC" : "Curitiba/PR",
      resumoProfissional: "Perfil fictício para teste da Action. Substituir pelo retorno real da API Recrutei.",
      experiencias: [],
      formacao: [],
      competencias: talentoId === "mock-ai-001" ? ["Python", "IA generativa", "LLM", "NLP", "RAG", "APIs"] : ["Python", "APIs", "Integração de sistemas"],
      ferramentas: talentoId === "mock-ai-001" ? ["OpenAI", "LangChain", "Vector DB"] : ["FastAPI", "Docker"],
      idiomas: [],
      linkedin: "não disponível"
    });
  }

  const template = process.env.RECRUTEI_PROFILE_URL_TEMPLATE;
  if (!template) return res.status(500).json({ erro: "endpoint_perfil_nao_configurado", mensagem: "RECRUTEI_PROFILE_URL_TEMPLATE não configurado no servidor." });

  const url = template.replace("{talentoId}", encodeURIComponent(talentoId));
  const apiResult = await callRecruteiApi(url, { method: "GET" });
  if (!apiResult.ok) return res.status(502).json({ erro: "erro_api_recrutei", mensagem: "Falha ao obter perfil profissional do talento.", detalheTecnico: sanitize(apiResult.body) });
  return res.json(sanitize(apiResult.body));
});

app.get("/recrutei/talent/public/:talentoId/resume", assertActionAuth, async (req, res) => {
  const { talentoId } = req.params;
  if (RECRUTEI_MODE === "mock") {
    return res.json({
      talentoId,
      nome: talentoId === "mock-ai-001" ? "Candidato Mock AI 001" : "Candidato Mock Python 002",
      curriculoTexto: "Currículo fictício para teste da Action. Substituir pelo retorno real da API Recrutei.",
      experiencias: [],
      formacao: [],
      competencias: talentoId === "mock-ai-001" ? ["Python", "IA generativa", "LLM", "NLP", "RAG", "APIs"] : ["Python", "APIs", "Integração de sistemas"],
      ferramentas: talentoId === "mock-ai-001" ? ["OpenAI", "LangChain", "Vector DB"] : ["FastAPI", "Docker"]
    });
  }

  const template = process.env.RECRUTEI_RESUME_URL_TEMPLATE;
  if (!template) return res.status(500).json({ erro: "endpoint_curriculo_nao_configurado", mensagem: "RECRUTEI_RESUME_URL_TEMPLATE não configurado no servidor." });

  const url = template.replace("{talentoId}", encodeURIComponent(talentoId));
  const apiResult = await callRecruteiApi(url, { method: "GET" });
  if (!apiResult.ok) return res.status(502).json({ erro: "erro_api_recrutei", mensagem: "Falha ao obter currículo profissional do talento.", detalheTecnico: sanitize(apiResult.body) });
  return res.json(sanitize(apiResult.body));
});

app.use((req, res) => {
  res.status(404).json({ erro: "rota_nao_encontrada", mensagem: "Rota não encontrada neste middleware." });
});

app.listen(PORT, () => {
  console.log(`Recrutei Talent Public Action rodando na porta ${PORT} em modo ${RECRUTEI_MODE}`);
});
