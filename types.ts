export enum AnalysisStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  HISTORY = 'HISTORY'
}

export interface AnalysisResult {
  markdown: string;
}

export interface FileData {
  file: File;
  base64: string;
  mimeType: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  reportName: string;
  markdown: string;
  filesProcessed: string[];
}
