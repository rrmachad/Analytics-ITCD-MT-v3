import express from "express";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";
import { SYSTEM_INSTRUCTION } from "../constants.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.json({ limit: "50mb" }));

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no ambiente do servidor.");
  return new GoogleGenAI({ apiKey });
};

// Modelo configurável por env var. Default: gemini-2.5-flash (quota gratuita).
// Para usar o Pro (requer faturamento ativo), defina GEMINI_MODEL=gemini-2.5-pro.
const ANALYSIS_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", apiConfigured: !!(process.env.GEMINI_API_KEY || process.env.API_KEY) });
});

// ─── Test Connection ──────────────────────────────────────────────────────────
app.get("/api/test-connection", async (_req, res) => {
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "ping",
    });
    res.json({ success: !!(response.text) });
  } catch (error: any) {
    console.error("Erro no teste de conexão:", error);
    res.status(500).json({ success: false, error: error.message || "Erro de conexão" });
  }
});

// ─── Large File Upload via Files API ─────────────────────────────────────────
app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo recebido." });

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key não configurada." });

    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": req.file.size.toString(),
          "X-Goog-Upload-Header-Content-Type": req.file.mimetype,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { displayName: req.file.originalname } }),
      }
    );

    if (!initRes.ok) throw new Error(`Falha ao iniciar upload: ${await initRes.text()}`);
    const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) throw new Error("URL de upload não retornada pela API.");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": req.file.size.toString(),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: req.file.buffer,
    });

    if (!uploadRes.ok) throw new Error(`Falha no upload: ${await uploadRes.text()}`);
    const fileInfoResponse = await uploadRes.json();
    let currentFile = fileInfoResponse.file;

    let attempts = 0;
    while (currentFile.state === "PROCESSING" && attempts < 60) {
      attempts++;
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${currentFile.name}?key=${apiKey}`
      );
      if (!statusRes.ok) throw new Error(`Erro ao verificar status: ${await statusRes.text()}`);
      currentFile = await statusRes.json();
    }

    if (currentFile.state !== "ACTIVE") {
      throw new Error(`Arquivo não processado. Estado: ${currentFile.state}`);
    }

    res.json({ fileUri: currentFile.uri, mimeType: currentFile.mimeType, fileName: req.file.originalname });
  } catch (error: any) {
    console.error("Erro no upload:", error);
    res.status(500).json({ error: error.message || "Erro no upload" });
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
    const ai = getGeminiClient();
    const parts: any[] = [];

    for (const fileData of files) {
      parts.push({ text: `[INÍCIO DO ARQUIVO: ${fileData.name}]` });
      if (fileData.isLarge && fileData.fileUri) {
        parts.push({ fileData: { mimeType: fileData.mimeType, fileUri: fileData.fileUri } });
      } else if (fileData.base64) {
        parts.push({ inlineData: { mimeType: fileData.mimeType || "application/pdf", data: fileData.base64 } });
      }
      parts.push({ text: `[FIM DO ARQUIVO: ${fileData.name}]` });
    }

    parts.push({ text: buildAnalysisPrompt(reportType, decisionType, userComments) });

    const MAX_RETRIES = 5;
    const BASE_DELAY = 3000;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Análise — tentativa ${attempt}/${MAX_RETRIES}...`);
        const response = await ai.models.generateContent({
          model: ANALYSIS_MODEL,
          contents: { role: "user", parts },
          config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.1 },
        });
        return res.json({ result: response.text || "Sem resultado gerado. Tente novamente." });
      } catch (error: any) {
        lastError = error;
        const isRetryable =
          error.status === 503 || error.status === 500 || error.status === 429 ||
          (error.message && (error.message.includes("503") || error.message.includes("overloaded") || error.message.includes("quota")));
        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`Erro transitório. Retry em ${Math.round(delay / 1000)}s...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          break;
        }
      }
    }

    throw lastError;
  } catch (error: any) {
    console.error("Erro na análise:", error);
    if (error?.message?.includes("Document size exceeds")) {
      return res.status(413).json({ error: "Arquivo muito grande. Comprima o PDF e tente novamente." });
    }
    if (error?.status === 400) {
      return res.status(400).json({ error: `Erro de validação: ${error.message}` });
    }
    if (error?.status === 503 || error?.message?.includes("overloaded")) {
      return res.status(503).json({ error: "Serviço de IA sobrecarregado (503). Aguarde alguns minutos e tente novamente." });
    }
    res.status(500).json({ error: error.message || "Erro desconhecido." });
  }
});

export default app;
