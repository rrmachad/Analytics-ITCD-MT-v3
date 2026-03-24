
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { marked } from 'marked';

interface AnalysisViewProps {
  markdown: string;
  onReset: () => void;
}

interface VirtualFile {
  name: string;
  content: string;
}

const TableRenderer = ({ children, ...props }: React.DetailedHTMLProps<React.TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const [copied, setCopied] = useState(false);

  const copyTable = async () => {
    if (!tableRef.current) return;
    
    try {
      // Get the HTML of the table
      const tableHtml = tableRef.current.outerHTML;
      
      // Create blobs for different formats
      // text/html is crucial for Word/Google Docs to recognize it as a table
      const blobHtml = new Blob([tableHtml], { type: 'text/html' });
      const blobText = new Blob([tableRef.current.innerText], { type: 'text/plain' });
      
      // Use the Clipboard Item API
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText,
        }),
      ]);
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy table:', error);
      // Fallback
      try {
        await navigator.clipboard.writeText(tableRef.current.innerText);
        alert('Tabela copiada como texto simples.');
      } catch (e) {
        console.error('Fallback failed', e);
      }
    }
  };

  return (
    <div className="relative group my-8">
      <div className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        <button
          onClick={copyTable}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded shadow-sm hover:bg-blue-700 transition-colors border border-blue-700"
          title="Copiar tabela para colar no Word/Docs"
        >
          {copied ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Copiado!
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copiar Tabela
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm bg-white">
        <table ref={tableRef} {...props} className="min-w-full divide-y divide-slate-200 border-collapse text-sm">
          {children}
        </table>
      </div>
    </div>
  );
};

export const AnalysisView: React.FC<AnalysisViewProps> = ({ markdown, onReset }) => {
  const [files, setFiles] = useState<VirtualFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Parse markdown into virtual files
  useEffect(() => {
    const parseVirtualFiles = (md: string): VirtualFile[] => {
      const fileStartRegex = /<<<FILE_START: (.*?)>>>/g;
      const fileEndRegex = /<<<FILE_END: (.*?)>>>/g;
      
      const virtualFiles: VirtualFile[] = [];
      let match;
      
      // If no tags found, return the whole thing as one file
      if (!md.includes('<<<FILE_START:')) {
        return [{ name: `relatorio-itcd-${new Date().toISOString().split('T')[0]}`, content: md }];
      }

      // Extract all file blocks
      const startMatches = [...md.matchAll(fileStartRegex)];
      const endMatches = [...md.matchAll(fileEndRegex)];

      for (let i = 0; i < startMatches.length; i++) {
        const startMatch = startMatches[i];
        const fileName = startMatch[1];
        
        // Find corresponding end tag
        const endMatch = endMatches.find(m => m[1] === fileName);
        
        if (endMatch) {
          const startIndex = startMatch.index! + startMatch[0].length;
          const endIndex = endMatch.index!;
          const content = md.substring(startIndex, endIndex).trim();
          
          virtualFiles.push({ name: fileName, content });
        }
      }

      return virtualFiles.length > 0 ? virtualFiles : [{ name: 'relatorio', content: md }];
    };

    setFiles(parseVirtualFiles(markdown));
    setActiveFileIndex(0);
  }, [markdown]);

  const activeFile = files[activeFileIndex] || { name: '', content: '' };

  const handleDownload = async (file: VirtualFile) => {
    // Convert Markdown to HTML for Word compatibility
    const htmlBody = await marked.parse(file.content);
    
    const fullHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${file.name}</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #000; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
          th, td { border: 1px solid #999; padding: 0.5em; text-align: left; vertical-align: top; }
          th { background-color: #f2f2f2; font-weight: bold; }
          h1, h2, h3 { color: #2e74b5; }
          div[align="center"] { text-align: center; }
        </style>
      </head>
      <body>
        ${htmlBody}
      </body>
      </html>
    `;

    const blob = new Blob([fullHtml], { type: 'application/msword' });
    const element = document.createElement("a");
    element.href = URL.createObjectURL(blob);
    element.download = `${file.name}.doc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  const handleContentChange = (newContent: string) => {
    const updatedFiles = [...files];
    updatedFiles[activeFileIndex] = { ...updatedFiles[activeFileIndex], content: newContent };
    setFiles(updatedFiles);
  };

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 pb-20">
      {/* File Tabs for Batch Mode */}
      {files.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {files.map((file, idx) => (
            <button
              key={idx}
              onClick={() => {
                setActiveFileIndex(idx);
                setIsEditing(false);
              }}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors border-t border-x
                ${activeFileIndex === idx 
                  ? 'bg-white text-blue-600 border-slate-200' 
                  : 'bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200'
                }`}
            >
              {file.name.replace('RELATORIO_ITCD_', '')}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between sticky top-16 z-40 gap-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${isEditing ? 'bg-amber-500' : 'bg-green-500'} animate-pulse`}></div>
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide truncate max-w-[200px] sm:max-w-md">
              {isEditing ? 'Editando: ' : ''}{activeFile.name.replace('RELATORIO_ITCD_', '') || 'Relatório de Análise Fiscal'}
            </h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Edit / Save Button */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`text-sm px-3 py-1.5 rounded-md font-medium border transition-colors flex items-center gap-2
                ${isEditing 
                  ? 'bg-blue-600 text-white border-transparent hover:bg-blue-700' 
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
            >
              {isEditing ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Salvar Edição
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  Editar
                </>
              )}
            </button>

            {/* Copy Button */}
            <button 
              onClick={handleCopy}
              className="text-sm px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 font-medium flex items-center gap-2 transition-colors"
              title="Copiar relatório completo para área de transferência"
            >
              {copySuccess ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-green-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-green-600">Copiado!</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                  </svg>
                  Copiar Texto
                </>
              )}
            </button>

            {/* Download Button */}
            <button 
              onClick={() => handleDownload(activeFile)}
              className="text-sm px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 font-medium flex items-center gap-2 transition-colors"
              title="Baixar relatório editável para Word"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9" />
              </svg>
              Baixar (.doc)
            </button>

            <div className="h-6 w-px bg-slate-300 mx-1 hidden sm:block"></div>

            <button 
              onClick={onReset}
              className="text-sm text-slate-600 hover:text-red-600 font-medium flex items-center gap-1 transition-colors ml-auto sm:ml-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Nova Análise
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 sm:p-12">
          {isEditing ? (
            <textarea
              className="w-full h-[calc(100vh-300px)] p-4 font-mono text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
              value={activeFile.content}
              onChange={(e) => handleContentChange(e.target.value)}
            />
          ) : (
            <article className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:text-slate-800 prose-h1:text-2xl prose-h2:text-xl prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2 prose-h2:mt-8 prose-p:text-slate-600 prose-th:bg-slate-100 prose-th:p-3 prose-td:p-3 prose-td:border-b prose-td:border-slate-100 prose-strong:text-slate-900">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  table: TableRenderer
                }}
              >
                {activeFile.content}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </div>
    </div>
  );
};
