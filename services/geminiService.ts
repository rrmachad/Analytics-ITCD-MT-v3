
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { FileData } from "../types";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const testConnection = async (): Promise<boolean> => {
  if (!process.env.API_KEY) return false;
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "ping",
    });
    return !!response.text;
  } catch (error) {
    console.error("Erro ao testar conexão com Gemini:", error);
    return false;
  }
};

export const analyzeItcdProcess = async (files: FileData[], userComments: string = "", reportType: string = "Análise do Sistema", decisionType: string = "Análise do Sistema"): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not configured");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Retry configuration - Increased for robustness against 503s
  const MAX_RETRIES = 5;
  const BASE_DELAY = 3000; // Start with 3 seconds

  try {
    // We use a threshold of 20MB. 
    // Below 20MB -> Inline Data (faster, simple).
    // Above 20MB -> Files API (supports up to 2GB).
    const FILE_SIZE_THRESHOLD = 20 * 1024 * 1024;

    // Prepare parts with filename context for Batch Mode
    const parts = [];

    for (const fileData of files) {
      // Inject filename context so the AI can group files by process name
      parts.push({ text: `[INÍCIO DO ARQUIVO: ${fileData.file.name}]` });

      if (fileData.file.size < FILE_SIZE_THRESHOLD) {
        // Small file: Use inline base64
        parts.push({
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.base64,
          },
        });
      } else {
        // Large file: Upload via Files API using REST (Browser compatible)
        console.log(`Uploading large file: ${fileData.file.name} (${(fileData.file.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // 1. Initialize resumable upload
        const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.API_KEY}`, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': fileData.file.size.toString(),
            'X-Goog-Upload-Header-Content-Type': fileData.mimeType,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file: {
              displayName: fileData.file.name,
            }
          })
        });

        if (!initRes.ok) {
          throw new Error(`Falha ao iniciar upload: ${await initRes.text()}`);
        }

        const uploadUrl = initRes.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) {
          throw new Error('URL de upload não retornada pela API.');
        }

        // 2. Upload the actual file bytes
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Length': fileData.file.size.toString(),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
          },
          body: fileData.file
        });

        if (!uploadRes.ok) {
          throw new Error(`Falha ao fazer upload do arquivo: ${await uploadRes.text()}`);
        }

        const fileInfoResponse = await uploadRes.json();
        let currentFile = fileInfoResponse.file;

        console.log(`File uploaded: ${currentFile.name}, URI: ${currentFile.uri}, State: ${currentFile.state}`);

        // Wait for file to be processed
        let attempts = 0;
        const maxAttempts = 60; // Wait up to ~2 minutes

        while (currentFile.state === 'PROCESSING' && attempts < maxAttempts) {
          attempts++;
          console.log(`Waiting for file processing... Attempt ${attempts}/${maxAttempts}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (!currentFile.name) {
             throw new Error("Upload falhou: Nome do arquivo não retornado pela API.");
          }
          
          // Use REST API to check status to ensure browser compatibility
          const statusRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${currentFile.name}?key=${process.env.API_KEY}`);
          if (!statusRes.ok) {
            throw new Error(`Falha ao verificar status do arquivo: ${await statusRes.text()}`);
          }
          currentFile = await statusRes.json();
        }

        if (currentFile.state !== 'ACTIVE') {
          throw new Error(`O arquivo ${fileData.file.name} não pôde ser processado pelo Gemini. Estado final: ${currentFile.state}`);
        }
        
        parts.push({
          fileData: {
            mimeType: currentFile.mimeType,
            fileUri: currentFile.uri
          }
        });
      }
      
      parts.push({ text: `[FIM DO ARQUIVO: ${fileData.file.name}]` });
    }
    
    const dateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = new Date().toLocaleDateString('pt-BR', dateOptions);

    const prompt = `
      DATA DE REFERÊNCIA OBRIGATÓRIA: ${formattedDate}.
      
      Analise os documentos fornecidos acima.

      === CONFIGURAÇÕES DA ANÁLISE ===
      Padrão do Parecer Solicitado: ${reportType}
      Decisão Solicitada: ${decisionType}

      === DIRETRIZES E OBSERVAÇÕES ESPECÍFICAS DO USUÁRIO ===
      "${userComments ? userComments : "Nenhuma diretriz específica fornecida."}"
      =========================================================
      
      ### INSTRUÇÕES DE EXECUÇÃO (CRÍTICO):

      0. **REGRA ZERO**: NÃO UTILIZE EMOJIS. O texto deve ser estritamente formal.
      
      1. **MODO LOTE E ARQUIVOS VIRTUAIS**:
         - Se houver mais de 1 processo distinto nos arquivos, siga rigorosamente as regras de tags \`<<<FILE_START: ...>>>\` e \`<<<FILE_END: ...>>>\` para cada processo identificado.
         - Se houver apenas 1 processo, NÃO aplique as tags \`<<<FILE_START: ...>>>\` e \`<<<FILE_END: ...>>>\`.
         
      2. **SELEÇÃO DE MODELO E DECISÃO**:
         - **PADRÃO DO PARECER**: Se o usuário selecionou um "Padrão do Parecer Solicitado" específico (como Processo Simples, Diligência, Denúncia Espontânea, Padrão), você DEVE obrigatoriamente utilizar o modelo correspondente definido nas instruções do sistema. Se for "Análise do Sistema", você deve inferir o melhor modelo com base nos documentos.
         - **DECISÃO**: Se o usuário selecionou uma "Decisão Solicitada" específica (Deferido ou Indeferido), você DEVE obrigatoriamente concluir o parecer com essa decisão, adaptando a fundamentação para justificá-la. Se for "Análise do Sistema", você deve inferir a melhor decisão técnica.
         
      3. **FORMATAÇÃO OBRIGATÓRIA**:
         - Substitua [DATA_ATUAL] no final por: "${formattedDate}".
         - Use o Cabeçalho HTML do Brasão no início de CADA relatório.
         - Nos blocos de Processo e Assinatura, use a tag <br> para quebra de linha simples.
         - **PROIBIÇÃO**: NUNCA utilize a expressão "alíquota média".
         - **VOZ ATIVA**: Use sempre "Procedemos ao..." para ações de execução fiscal.
    `;

    let lastError;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`Attempting generation (try ${attempt}/${MAX_RETRIES})...`);
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: {
            role: 'user',
            parts: [
              ...parts,
              { text: prompt }
            ]
          },
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.1, // Very low temperature for strict adherence to data
          }
        });

        return response.text || "Não foi possível gerar a análise. Tente novamente.";

      } catch (error: any) {
        console.warn(`Attempt ${attempt} failed:`, error);
        lastError = error;
        
        // Helper to check for retryable errors
        const isRetryable = 
          error.status === 503 || 
          error.status === 500 || 
          error.status === 429 || 
          error.code === 503 ||
          (error.message && (error.message.includes("503") || error.message.includes("overloaded")));

        if (isRetryable) {
          if (attempt < MAX_RETRIES) {
            // Exponential backoff + jitter to prevent thundering herd
            const delay = (BASE_DELAY * Math.pow(2, attempt - 1)) + (Math.random() * 1000);
            console.log(`Server overloaded. Retrying in ${Math.round(delay)}ms...`);
            await wait(delay);
            continue;
          }
        }
        
        throw error;
      }
    }
    
    throw lastError;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    if (error?.message?.includes("Document size exceeds supported limit")) {
      throw new Error("Erro de tamanho: O arquivo é muito grande para o envio direto. O sistema tentou otimizar, mas o limite da API foi excedido.");
    }

    if (error?.status === 400 || error?.toString().includes("400")) {
        const msg = error?.message || "Argumento inválido";
        throw new Error(`Erro na validação do pedido pela IA (${msg}). Se o arquivo for muito grande, aguarde alguns instantes e tente novamente.`);
    }
    
    if (error?.status === 503 || error?.code === 503 || error?.message?.includes("503") || error?.message?.includes("overloaded")) {
      throw new Error("O serviço da IA está temporariamente sobrecarregado (Erro 503). O sistema tentou reconectar várias vezes sem sucesso. Por favor, aguarde alguns minutos e tente novamente mais tarde.");
    }

    throw new Error(`Erro ao processar documentos: ${error.message || "Erro desconhecido"}`);
  }
};
