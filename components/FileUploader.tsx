import React, { useCallback, useState } from 'react';
import { FileData } from '../types';
import { fileToBase64 } from '../utils/fileUtils';

interface FileUploaderProps {
  onFilesSelected: (files: FileData[], comments: string, reportType: string, decisionType: string) => void;
  isLoading: boolean;
}

// Increased limit to 500MB to support large judicial processes
const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, isLoading }) => {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [userComments, setUserComments] = useState<string>("");
  const [reportType, setReportType] = useState<string>("Análise do Sistema");
  const [decisionType, setDecisionType] = useState<string>("Análise do Sistema");

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    if (event.target.files && event.target.files.length > 0) {
      const newFiles: FileData[] = [];
      const rejectedFiles: string[] = [];

      for (let i = 0; i < event.target.files.length; i++) {
        const file = event.target.files[i];
        
        if (file.size > MAX_FILE_SIZE_BYTES) {
          rejectedFiles.push(file.name);
          continue;
        }

        try {
          const base64 = await fileToBase64(file);
          newFiles.push({
            file,
            base64,
            mimeType: file.type,
          });
        } catch (e) {
          console.error("Error reading file", file.name, e);
          setValidationError(`Erro ao ler o arquivo: ${file.name}`);
        }
      }

      if (rejectedFiles.length > 0) {
        setValidationError(`Os seguintes arquivos excedem o limite de ${MAX_FILE_SIZE_MB}MB: ${rejectedFiles.join(', ')}. Por favor, comprima-os ou divida-os.`);
      }

      if (newFiles.length > 0) {
        // Pass files, comments, reportType, and decisionType
        onFilesSelected(newFiles, userComments, reportType, decisionType);
      }
    }
  }, [onFilesSelected, userComments, reportType, decisionType]);

  return (
    <div className="w-full max-w-2xl mx-auto mt-10 p-6">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-8 text-center">
          <div className="mx-auto h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-blue-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Análise de Processo ITCD</h2>
          <p className="text-slate-600 mb-8 max-w-md mx-auto">
            Carregue os arquivos PDF do processo para iniciar a auditoria fiscal automática.
          </p>

          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div>
                <label htmlFor="reportType" className="block text-sm font-medium text-slate-700 mb-1">
                  Padrão do Parecer
                </label>
                <select
                  id="reportType"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900 bg-white"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="Análise do Sistema">Análise do Sistema (Automático)</option>
                  <option value="Padrão">Padrão</option>
                  <option value="Processo Simples">Processo Simples</option>
                  <option value="Diligência">Diligência</option>
                  <option value="Denúncia Espontânea">Denúncia Espontânea</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="decisionType" className="block text-sm font-medium text-slate-700 mb-1">
                  Decisão
                </label>
                <select
                  id="decisionType"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900 bg-white"
                  value={decisionType}
                  onChange={(e) => setDecisionType(e.target.value)}
                  disabled={isLoading}
                >
                  <option value="Análise do Sistema">Análise do Sistema (Automático)</option>
                  <option value="Deferido">Deferido</option>
                  <option value="Indeferido">Indeferido</option>
                </select>
              </div>
            </div>

            <div className="text-left">
              <label htmlFor="userComments" className="block text-sm font-medium text-slate-700 mb-1">
                Observações / Diretrizes Específicas (Opcional)
              </label>
              <textarea
                id="userComments"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm text-slate-900 placeholder-slate-400"
                placeholder="Ex: Considerar isenção do Art. 7º; Atenção especial ao imóvel rural X; Ignorar multa por atraso..."
                value={userComments}
                onChange={(e) => setUserComments(e.target.value)}
                disabled={isLoading}
              />
              <p className="mt-1 text-xs text-slate-500">
                Preencha os campos <strong>antes</strong> de selecionar os arquivos.
              </p>
            </div>

            <label className={`
              relative inline-flex items-center justify-center px-8 py-4 w-full
              text-base font-medium text-white transition-all duration-200 
              bg-blue-600 border border-transparent rounded-lg shadow-sm 
              hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}>
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processando Documentos...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mr-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Selecionar Arquivos PDF
                </>
              )}
              <input 
                type="file" 
                className="hidden" 
                multiple 
                accept=".pdf" 
                onChange={handleFileChange}
                disabled={isLoading}
              />
            </label>
          </div>
          
          {validationError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-md text-sm text-red-600 font-medium">
              {validationError}
            </div>
          )}
        </div>
        <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 flex items-center justify-between">
           <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Base Legal</span>
           <div className="flex gap-3">
             <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">Lei 7.850/2002</span>
             <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">RITCD/MT</span>
             <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded">RAMT 2024</span>
           </div>
        </div>
      </div>
    </div>
  );
};