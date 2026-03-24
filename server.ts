import express from "express";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import path from "path";
import { SYSTEM_INSTRUCTION } from "./constants";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

const getOpenAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  let baseURL = process.env.APIYI_BASE_URL || "https://api.apiyi.com/v1";

  // Ensure protocol
  if (baseURL && !baseURL.startsWith("http")) {
    baseURL = `https://${baseURL}`;
  }
  
  // Normalize trailing slash
  baseURL = baseURL.replace(/\/$/, "");

  // If it's the standard APIYI domain and doesn't have /v1, add it
  if (baseURL.includes("api.apiyi.com") && !baseURL.endsWith("/v1")) {
    baseURL += "/v1";
  }

  try {
    new URL(baseURL);
  } catch (e) {
    console.warn(`Invalid APIYI_BASE_URL: ${baseURL}. Falling back to default.`);
    baseURL = "https://api.apiyi.com/v1";
  }

  if (!apiKey) {
    throw new Error("API Key not configured in environment");
  }

  return new OpenAI({
    apiKey,
    baseURL,
    timeout: 30000, // 30 seconds timeout
    maxRetries: 2,
  });
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", apiConfigured: !!(process.env.GEMINI_API_KEY || process.env.API_KEY) });
});

app.get("/api/test-connection", async (req, res) => {
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gemini-3.1-pro-preview',
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5
    });
    res.json({ success: !!response.choices[0].message.content });
  } catch (error: any) {
    console.error("APIYI Connection Test Error:", error);
    res.status(error.status || 500).json({ 
      success: false, 
      error: error.message || String(error) || "Unknown connection error",
      details: error.response?.data || error.data || null
    });
  }
});

app.post("/api/analyze", async (req, res) => {
  const { files, userComments } = req.body;

  try {
    const client = getOpenAIClient();
    const messageParts: any[] = [];

    for (const fileData of files) {
      messageParts.push({ type: "text", text: `[INÍCIO DO ARQUIVO: ${fileData.file.name}]` });
      
      if (fileData.mimeType.startsWith('image/')) {
        messageParts.push({
          type: "image_url",
          image_url: {
            url: `data:${fileData.mimeType};base64,${fileData.base64}`
          }
        });
      } else {
        messageParts.push({ type: "text", text: `[Conteúdo do arquivo ${fileData.file.name} (Base64)]: ${fileData.base64.substring(0, 15000)}... (truncado)` });
      }
      
      messageParts.push({ type: "text", text: `[FIM DO ARQUIVO: ${fileData.file.name}]` });
    }
    
    const dateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = new Date().toLocaleDateString('pt-BR', dateOptions as any);

    const prompt = `
      DATA DE REFERÊNCIA OBRIGATÓRIA: ${formattedDate}.
      
      Analise os documentos fornecidos acima.

      === DIRETRIZES E OBSERVAÇÕES ESPECÍFICAS DO USUÁRIO ===
      "${userComments ? userComments : "Nenhuma diretriz específica fornecida."}"
      =========================================================
      
      ### INSTRUÇÕES DE EXECUÇÃO (CRÍTICO):

      0. **REGRA ZERO**: NÃO UTILIZE EMOJIS. O texto deve ser estritamente formal.
      
      1. **MODO LOTE E ARQUIVOS VIRTUAIS**:
         - Siga rigorosamente as regras de tags \`<<<FILE_START: ...>>>\` e \`<<<FILE_END: ...>>>\` para cada processo identificado.
         
      2. **SELEÇÃO DE MODELO (HIERARQUIA)**:
         - **DILIGÊNCIA**: Se o contexto for de resposta a diligência ou o usuário solicitar "Diligência", use o modelo **COMANDO: DILIGÊNCIA**.
         - **PROCESSO SIMPLES**: Se nas "Diretrizes do Usuário" constar "PROCESSO SIMPLES" ou "SIMPLES", use o modelo **CENÁRIO C**.
         - **AUTOMÁTICO**: Se o documento principal for "PROTOCOLO DE GIA ITCD (AUTOMÁTICO)", use o modelo **CENÁRIO A**.
         - **PADRÃO**: Para os demais casos, use o modelo **CENÁRIO B**.
         
      3. **FORMATAÇÃO OBRIGATÓRIA**:
         - Substitua [DATA_ATUAL] no final por: "${formattedDate}".
         - Use o Cabeçalho HTML do Brasão no início de CADA relatório.
         - Nos blocos de Processo e Assinatura, use a tag <br> para quebra de linha simples.
         - **PROIBIÇÃO**: NUNCA utilize a expressão "alíquota média".
         - **VOZ ATIVA**: Use sempre "Procedemos ao..." para ações de execução fiscal.
    `;

    messageParts.push({ type: "text", text: prompt });

    const response = await client.chat.completions.create({
      model: 'gemini-3.1-pro-preview',
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: messageParts }
      ],
      temperature: 0.1,
    });

    res.json({ result: response.choices[0].message.content });

  } catch (error: any) {
    console.error("APIYI Analysis Error:", error);
    res.status(error.status || 500).json({ 
      error: error.message || String(error) || "Unknown analysis error",
      details: error.response?.data || error.data || null
    });
  }
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static("dist"));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve("dist/index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
