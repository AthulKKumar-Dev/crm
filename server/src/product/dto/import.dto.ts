// Stand-alone DTOs for the CSV-import flow.
// The multipart upload body itself isn't validated — it's a plain `file` field
// resolved via Multer's FileInterceptor in the controller. These DTOs cover the
// state-shape returned to the client for polling.

export type ProductImportStatus =
  | 'PARSING'
  | 'PREVIEW'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

export interface ProductImportError {
  row: number; // 1-based row in the source CSV (header is row 0)
  handle?: string;
  message: string;
}

export interface ProductImportJobView {
  id: string;
  status: ProductImportStatus;
  filename: string;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: ProductImportError[];
  previewRows: Record<string, string>[]; // First N parsed rows as raw maps
  createdAt: string;
  completedAt: string | null;
}
