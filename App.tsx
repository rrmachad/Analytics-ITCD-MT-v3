import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { FileUploader } from './components/FileUploader';
import { AnalysisView } from './components/AnalysisView';
import { AnalysisStatus, FileData } from './types';
import { analyzeItcdProcess, testConnection } from './services/geminiService';

const App: React.FC = () => {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [result, setResult] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isApiConfigured, setIsApiConfigured] = useState<boolean | null>(null);
  const [isApiValid, setIsApiValid] = useState<boolean | null>(null);
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

  useEffect(() => {
    // Check if API key is present
    const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
    setIsApiConfigured(!!key);
    
    if (key) {
      handleTestConnection();
    } else {
      console.error("AVISO: Chave API (GEMINI_API_KEY) não detectada no ambiente.");
    }
  }, []);

  const handleTestConnection = async () => {
    setIsTestingApi(true);
    const valid = await testConnection();
    setIsApiValid(valid);
    setIsTestingApi(false);
  };

  const handleFilesSelected = async (files: FileData[], userComments: string, reportType: string, decisionType: string) => {
    setStatus(AnalysisStatus.ANALYZING);
    setErrorMsg("");
    try {
      const analysisText = await analyzeItcdProcess(files, userComments, reportType, decisionType);
      setResult(analysisText);
      setStatus(AnalysisStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Ocorreu um erro desconhecido durante a análise.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleReset = () => {
    setStatus(AnalysisStatus.IDLE);
    setResult("");
    setErrorMsg("");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header isApiConfigured={isApiConfigured} isApiValid={isApiValid} isTestingApi={isTestingApi} onRetryTest={handleTestConnection} />
      
      <main className="flex-grow flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8">
        
        {isApiConfigured === false && (
          <div className="w-full max-w-4xl mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-amber-600 mt-0.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div>
                <h4 className="text-sm font-bold text-amber-800">Chave API não configurada</h4>
                <p className="text-xs text-amber-700 mt-1">
                  A variável de ambiente <code className="bg-amber-100 px-1 rounded">GEMINI_API_KEY</code> não foi detectada. 
                  Certifique-se de que a chave está configurada nas configurações do projeto para que a IA funcione.
                </p>
              </div>
            </div>
          </div>
        )}
        {status === AnalysisStatus.IDLE && (
          <div className="animate-fade-in w-full">
             <div className="text-center mb-8 max-w-3xl mx-auto">
               <h1 className="text-4xl font-extrabold text-slate-900 sm:text-5xl mb-4">
                 Auditoria Fiscal Inteligente
               </h1>
               <p className="text-lg text-slate-600">
                 Carregue processos de inventário, divórcio ou doação. O <span className="font-semibold text-blue-600">ITCD-MT Analytics</span> mapeia herdeiros, beneficiários e 
                 avalia bens imóveis rurais (RAMT 2024) e calcula o imposto devido conforme legislação estadual.
               </p>
             </div>
             <FileUploader onFilesSelected={handleFilesSelected} isLoading={false} />
          </div>
        )}

        {status === AnalysisStatus.ANALYZING && (
          <div className="w-full flex flex-col items-center justify-center pt-20">
             <FileUploader onFilesSelected={() => {}} isLoading={true} />
             <div className="mt-8 max-w-md w-full bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <p className="text-sm text-slate-500 font-medium">Lendo documentos e cruzando com RAMT 2024...</p>
             </div>
          </div>
        )}

        {status === AnalysisStatus.COMPLETED && (
          <AnalysisView markdown={result} onReset={handleReset} />
        )}

        {status === AnalysisStatus.ERROR && (
          <div className="w-full max-w-2xl mx-auto mt-10">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-red-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-red-800 mb-2">Erro na Análise</h3>
              <p className="text-red-600 mb-6">{errorMsg}</p>
              <button 
                onClick={handleReset}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
              >
                Tentar Novamente
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;