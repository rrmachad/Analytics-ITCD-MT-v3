import React from 'react';

interface HeaderProps {
  isApiConfigured: boolean | null;
  isApiValid: boolean | null;
  isTestingApi: boolean;
  onRetryTest: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isApiConfigured, isApiValid, isTestingApi, onRetryTest }) => {
  return (
    <header className="bg-slate-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-tight">ITCD-MT ANALYTICS</h1>
            <p className="text-xs text-blue-200 font-medium">SEFAZ-MT | Assistente Jurídico-Tributário</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-4">
          {isApiConfigured !== null && (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                isApiConfigured 
                  ? (isApiValid === false ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20')
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isTestingApi ? 'bg-blue-400 animate-spin' : (isApiConfigured && isApiValid === true ? 'bg-emerald-400 animate-pulse' : (isApiValid === false ? 'bg-red-400' : 'bg-amber-400'))
                }`}></div>
                {isTestingApi ? 'Testando...' : (isApiConfigured ? (isApiValid === true ? 'APIYI Ativa' : (isApiValid === false ? 'Erro APIYI' : 'APIYI Configurada')) : 'APIYI Ausente')}
              </div>
              
              {isApiConfigured && isApiValid !== true && !isTestingApi && (
                <button 
                  onClick={onRetryTest}
                  className="p-1 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                  title={isApiValid === false ? "Tentar reconectar" : "Testar conexão"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              )}
            </div>
          )}
          <span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-semibold text-blue-400 border border-slate-700">
            v3.0-pro
          </span>
        </div>
      </div>
    </header>
  );
};
