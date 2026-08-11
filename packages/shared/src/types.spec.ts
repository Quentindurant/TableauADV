import type {
  ApiError,
  CellValue,
  ChoiceDTO,
  ColumnDTO,
  ErrorCode,
  MonthInfo,
  RowDTO,
  RowEventDTO,
  UserDTO,
} from './types';

describe('Types partagés', () => {
  it('ApiError accepte exactement les 8 codes du contrat', () => {
    const codes: ErrorCode[] = [
      'AUTH_INVALID',
      'AUTH_REQUIRED',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'VERSION_CONFLICT',
      'COLUMN_HAS_DATA',
      'CHOICE_IN_USE',
      'LOCKED',
    ];
    const errors: ApiError[] = codes.map((code) => ({
      code,
      message: 'message en français',
    }));
    expect(errors).toHaveLength(8);
  });

  it('RowDTO transporte data (CellValue) et formats (CellFormat)', () => {
    const row: RowDTO = {
      id: 'r1',
      month: '2026-08',
      position: 0,
      data: { client: 'ARCADIA', dpt: null, num_chrono: 78 },
      formats: { num_chrono: { bg: '#FF0000' } },
      version: 0,
      archived: false,
      updatedAt: '2026-08-10T00:00:00.000Z',
    };
    const value: CellValue = row.data.client;
    expect(value).toBe('ARCADIA');
    expect(row.formats.num_chrono.bg).toBe('#FF0000');
  });

  it('ColumnDTO embarque ses ChoiceDTO', () => {
    const choice: ChoiceDTO = {
      id: 'c1',
      columnId: 'col1',
      label: 'NEW',
      bgColor: '#FFFF00',
      textColor: '#FF0000',
      bold: true,
      position: 0,
      archived: false,
    };
    const column: ColumnDTO = {
      id: 'col1',
      key: 'statut',
      label: 'INSTALLATION',
      type: 'SELECT',
      position: 11,
      width: 150,
      visible: true,
      choices: [choice],
    };
    const user: UserDTO = {
      id: 'u1',
      email: 'quentin.durant49@orange.fr',
      displayName: 'Quentin',
      cursorColor: '#3498DB',
    };
    const event: RowEventDTO = {
      id: 'e1',
      rowId: 'r1',
      userId: user.id,
      userName: user.displayName,
      at: '2026-08-10T00:00:00.000Z',
      type: 'update',
      payload: { statut: { from: 'NEW', to: 'STAGING' } },
    };
    const month: MonthInfo = { month: '2026-08', count: 42 };
    expect(column.choices[0].label).toBe('NEW');
    expect(event.type).toBe('update');
    expect(month.count).toBe(42);
  });
});
