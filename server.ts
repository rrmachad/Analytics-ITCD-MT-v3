import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import path from "path";
import { SYSTEM_INSTRUCTION } from "./constants";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 600 * 1024 * 1024 } });

app.use(express.json({ limit: "120mb" }));

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const ANALYSIS_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-preview";

const getApiKey = () => {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY não configurada no servidor.");
  return key;
};

const buildAnalysisPrompt = (reportType: string, decisionType: string, userComments: string): string => {
  const formattedDate = new Date().toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric" });

  return `DATA DE REFERÊNCIA OBRIGATÓRIA: ${formattedDate}.

Analise os documentos fornecidos acima.

=== CONFIGURAÇÕES DA ANÁLISE ===
Padrão do Parecer Solicitado: ${reportType || "Análise do Sistema"}
Decisão Solicitada: ${decisionType || "Análise do Sistema"}

=== DIRETRIZES E OBSERVAÇÕES ESPECÍFICAS DO USUÁRIO ===
"${userComments || "Nenhuma diretriz específica fornecida."}"
=========================================================

### INSTRUÇÕES DE EXECUÇÃO (CRÍTICO):

0. **REGRA ZERO**: NÃO UTILIZE EMOJIS. O texto deve ser estritamente formal.

1. **MODO LOTE E ARQUIVOS VIRTUAIS**:
   - Se houver mais de 1 processo distinto nos arquivos, siga rigorosamente as regras de tags <<<FILE_START: ...>>> e <<<FILE_END: ...>>> para cada processo identificado.
   - Se houver apenas 1 processo, NÃO aplique as tags <<<FILE_START: ...>>> e <<<FILE_END: ...>>>.

2. **SELEÇÃO DE MODELO E DECISÃO**:
   - **PADRÃO DO PARECER**: Se o usuário selecionou um "Padrão do Parecer Solicitado" específico (Processo Simples, Diligência, Denúncia Espontânea, Demanda Judicial, Padrão), utilize OBRIGATORIAMENTE o modelo correspondente definido nas instruções do sistema. Se for "Análise do Sistema", infira o melhor modelo com base nos documentos.
   - **DECISÃO**: Se o usuário selecionou "Deferido" ou "Indeferido", conclua o parecer com essa decisão, adaptando a fundamentação. Se for "Análise do Sistema", infira a melhor decisão técnica.

3. **SELEÇÃO DE CENÁRIO (HIERARQUIA)**:
   - **DILIGÊNCIA**: Se o "Padrão de Parecer" for "Diligência" → CENÁRIO D.
   - **PROCESSO SIMPLES**: Se o "Padrão de Parecer" for "Processo Simples" → CENÁRIO C.
   - **DENÚNCIA ESPONTÂNEA**: Se o "Padrão de Parecer" for "Denúncia Espontânea" → CENÁRIO E.
   - **DEMANDA JUDICIAL**: Se o "Padrão de Parecer" for "Demanda Judicial" → CENÁRIO F.
   - **AUTOMÁTICO**: Se o documento principal for "PROTOCOLO DE GIA ITCD (AUTOMÁTICO)" → CENÁRIO A.
   - **PADRÃO**: Para os demais casos → CENÁRIO B.

4. **FORMATAÇÃO OBRIGATÓRIA**:
   - Substitua [DATA_ATUAL] por: "${formattedDate}".
   - Use o Cabeçalho HTML do Brasão no início de CADA relatório.
   - Nos blocos de Processo e Assinatura, use a tag <br> para quebra de linha simples.
   - **PROIBIÇÃO ABSOLUTA**: NUNCA utilize a expressão "alíquota média".
   - **VOZ ATIVA**: Use sempre "Procedemos ao..." para ações de execução fiscal.
   - **CÁLCULO FATIADO OBRIGATÓRIO**: Aplique SEMPRE o cálculo por faixas de alíquota progressiva. NUNCA aplique alíquota única sobre o total.`;
};

const callOpenRouter = (apiKey: string, messages: any[], maxTokens = 8000) =>
  fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://analytics-itcd-mt-v3-4.vercel.app",
      "X-Title": "ITCD-MT Analytics",
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
  });

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", apiConfigured: !!process.env.OPENROUTER_API_KEY });
});

// ─── Test Connection ──────────────────────────────────────────────────────────
app.get("/api/test-connection", async (_req, res) => {
  try {
    const apiKey = getApiKey();
    const response = await callOpenRouter(apiKey, [{ role: "user", content: "ping" }], 5);
    const data = await response.json();
    res.json({ success: response.ok && !!data.choices?.[0] });
  } catch (error: any) {
    console.error("Erro no teste de conexão:", error);
    res.status(500).json({ success: false, error: error.message || "Erro de conexão" });
  }
});

// ─── Large File Upload — extrai texto do PDF ─────────────────────────────────
app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo recebido." });
  try {
    const parsed = await pdfParse(req.file.buffer);
    res.json({ extractedText: parsed.text, fileName: req.file.originalname });
  } catch (error: any) {
    res.status(500).json({ error: `Falha ao extrair texto do PDF: ${error.message}` });
  }
});

// ─── Main Analysis Endpoint ───────────────────────────────────────────────────
app.post("/api/analyze", async (req, res) => {
  const {
    files,
    userComments = "",
    reportType = "Análise do Sistema",
    decisionType = "Análise do Sistema",
  } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "Nenhum arquivo fornecido para análise." });
  }

  try {
    const apiKey = getApiKey();

    let documentContent = "";
    for (const fileData of files) {
      documentContent += `\n[INÍCIO DO ARQUIVO: ${fileData.name}]\n`;
      if (fileData.extractedText) {
        documentContent += fileData.extractedText;
      } else if (fileData.base64) {
        const buffer = Buffer.from(fileData.base64, "base64");
        const parsed = await pdfParse(buffer);
        documentContent += parsed.text;
      }
      documentContent += `\n[FIM DO ARQUIVO: ${fileData.name}]\n`;
    }

    const userMessage = documentContent + "\n\n" + buildAnalysisPrompt(reportType, decisionType, userComments);
    const messages = [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: userMessage },
    ];

    const MAX_RETRIES = 5;
    const BASE_DELAY = 3000;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Análise — tentativa ${attempt}/${MAX_RETRIES} (${ANALYSIS_MODEL})...`);
        const response = await callOpenRouter(apiKey, messages);
        const data = await response.json();

        if (!response.ok) {
          const errMsg = data.error?.message || JSON.stringify(data.error) || "Erro OpenRouter";
          const code = Number(data.error?.code || response.status);
          if ([429, 500, 503].includes(code) && attempt < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
            console.log(`Erro transitório (${code}). Retry em ${Math.round(delay / 1000)}s...`);
            await new Promise(r => setTimeout(r, delay));
            lastError = new Error(errMsg);
            continue;
          }
          throw new Error(errMsg);
        }

        return res.json({ result: data.choices?.[0]?.message?.content || "Sem resultado gerado. Tente novamente." });

      } catch (error: any) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError;

  } catch (error: any) {
    console.error("Erro na análise:", error);
    res.status(500).json({ error: error.message || "Erro desconhecido." });
  }
});

// ─── Vite Dev / Static Prod ───────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*all", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(PORT, "0.0.0.0", () => {
  const apiOk = !!process.env.OPENROUTER_API_KEY;
  console.log(`Servidor ITCD-MT Analytics rodando em http://localhost:${PORT}`);
  console.log(`OpenRouter API Key: ${apiOk ? `CONFIGURADA (${ANALYSIS_MODEL})` : "NÃO CONFIGURADA"}`);
});
