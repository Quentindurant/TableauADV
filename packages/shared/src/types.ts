export type ColumnType =
  | 'TEXT'
  | 'LONGTEXT'
  | 'DATE'
  | 'TIME'
  | 'NUMBER'
  | 'SELECT'
  | 'LINK';

export interface UserDTO {
  id: string;
  email: string;
  displayName: string;
  cursorColor: string;
}

export interface ChoiceDTO {
  id: string;
  columnId: string;
  label: string;
  bgColor: string | null;
  textColor: string | null;
  bold: boolean;
  position: number;
  archived: boolean;
}

export interface ColumnDTO {
  id: string;
  key: string;
  label: string;
  type: ColumnType;
  position: number;
  width: number;
  visible: boolean;
  choices: ChoiceDTO[];
}

export type CellValue = string | number | null;

export interface CellFormat {
  bg?: string;
}

export interface RowDTO {
  id: string;
  month: string;
  position: number;
  data: Record<string, CellValue>;
  formats: Record<string, CellFormat>;
  version: number;
  archived: boolean;
  updatedAt: string;
}

export interface RowEventDTO {
  id: string;
  rowId: string;
  userId: string;
  userName: string;
  at: string;
  type: 'create' | 'update' | 'delete' | 'move' | 'archive' | 'format';
  payload: unknown;
}

export interface MonthInfo {
  month: string;
  count: number;
}

export type ErrorCode =
  | 'AUTH_INVALID'
  | 'AUTH_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'COLUMN_HAS_DATA'
  | 'CHOICE_IN_USE'
  | 'LOCKED';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}
