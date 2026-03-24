export enum AnalysisStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface AnalysisResult {
  markdown: string;
}

export interface FileData {
  file: File;
  base64: string;
  mimeType: string;
}