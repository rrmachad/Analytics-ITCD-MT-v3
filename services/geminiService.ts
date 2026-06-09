import { FileData } from "../types";

// Threshold: files above this go via multipart upload to the server's Files API proxy
const LARGE_FILE_THRESHOLD = 40 * 1024 * 1024; // 40 MB

export const testConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/test-connection');
    if (!response.ok) return false;
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Erro ao testar conexão com o servidor:", error);
    return false;
  }
};

export const analyzeItcdProcess = async (
  files: FileData[],
  userComments: string = "",
  reportType: string = "Análise do Sistema",
  decisionType: string = "Análise do Sistema"
): Promise<string> => {
  const serializableFiles: any[] = [];

  for (const fileData of files) {
    if (fileData.file.size >= LARGE_FILE_THRESHOLD) {
      // Large file: upload via server-side Files API proxy first
      const formData = new FormData();
      formData.append('file', fileData.file);

      const uploadRes = await fetch('/api/upload-file', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(`Falha ao fazer upload de "${fileData.file.name}": ${errData.error || 'Erro de upload'}`);
      }

      const uploadData = await uploadRes.json();
      serializableFiles.push({
        name: fileData.file.name,
        mimeType: uploadData.mimeType,
        fileUri: uploadData.fileUri,
        isLarge: true,
      });
    } else {
      // Normal file: send as base64 JSON
      serializableFiles.push({
        name: fileData.file.name,
        base64: fileData.base64,
        mimeType: fileData.mimeType || 'application/pdf',
        isLarge: false,
      });
    }
  }

  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: serializableFiles, userComments, reportType, decisionType }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const status = response.status;

    if (status === 503) {
      throw new Error("O serviço de IA está temporariamente sobrecarregado. Aguarde alguns minutos e tente novamente.");
    }
    if (status === 413) {
      throw new Error("Arquivo muito grande para processamento. Comprima o PDF e tente novamente.");
    }
    throw new Error(errData.error || `Erro do servidor (${status}). Verifique a configuração da API.`);
  }

  const data = await response.json();
  return data.result || "Não foi possível gerar a análise. Tente novamente.";
};
