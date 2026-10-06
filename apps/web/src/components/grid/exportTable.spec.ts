import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workbook, type FillPattern, type Worksheet } from 'exceljs';
import type { ChoiceDTO, RowDTO } from '@suivi/shared';
import {
  construireClasseurExcel,
  declencherTelechargement,
  nomFichierExport,
  nomOnglet,
  TYPE_MIME_XLSX,
} from './exportTable';
import type { ColonneImpression } from './printTable';

const colonnes: ColonneImpression[] = [
  { key: 'impe', label: 'IMPE', type: 'DATE', width: 110 },
  { key: 'client', label: 'CLIENT', type: 'TEXT', width: 250 },
  { key: 'statut', label: 'INSTALLATION', type: 'SELECT' },
  { key: 'chrono', label: 'N° CHRONO', type: 'NUMBER' },
  { key: 'lien', label: 'LIEN', type: 'LINK' },
  { key: 'commentaire', label: 'COMMENTAIRE', type: 'LONGTEXT' },
];

const choicesParColonne: Record<string, ChoiceDTO[]> = {
  statut: [
    {
      id: 'choice-planifiee',
      columnId: 'col-statut',
      label: 'PLANIFIEE',
      bgColor: '#DFF0D8',
      textColor: '#2E7D32',
      bold: true,
      position: 0,
      archived: false,
    },
  ],
};

function fakeRow(
  id: string,
  data: Record<string, string | number | null>,
  formats: RowDTO['formats'] = {},
): RowDTO {
  return {
    id,
    month: '2026-09',
    position: 0,
    data,
    formats,
    version: 1,
    archived: false,
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

/** Construit le classeur puis le relit comme le ferait Excel. */
async function exporterPuisRelire(lignes: RowDTO[], titre = 'SEPTEMBRE 2026'): Promise<Worksheet> {
  const contenu = await construireClasseurExcel({ titre, colonnes, lignes, choicesParColonne });
  const relu = new Workbook();
  await relu.xlsx.load(contenu);
  const feuille = relu.worksheets[0];
  if (!feuille) throw new Error('classeur sans onglet');
  return feuille;
}

describe('construireClasseurExcel', () => {
  it('écrit les en-têtes dans l’ordre de la disposition, figés et filtrables', async () => {
    const feuille = await exporterPuisRelire([]);
    expect(feuille.name).toBe('SEPTEMBRE 2026');
    expect(feuille.getRow(1).values).toEqual([
      undefined,
      'IMPE',
      'CLIENT',
      'INSTALLATION',
      'N° CHRONO',
      'LIEN',
      'COMMENTAIRE',
    ]);
    expect(feuille.getCell('A1').font?.bold).toBe(true);
    expect(feuille.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(feuille.autoFilter).toBeTruthy();
  });

  it('conserve l’ordre des lignes affichées et type les valeurs', async () => {
    const feuille = await exporterPuisRelire([
      fakeRow('r1', { impe: '2026-09-14', client: 'ARCADIA', chrono: 78, lien: 'https://exemple.fr/d/1' }),
      fakeRow('r2', { impe: null, client: 'BETA', chrono: null, lien: 'pas un lien' }),
    ]);

    expect(feuille.rowCount).toBe(3);
    expect(feuille.getCell('B2').value).toBe('ARCADIA');
    expect(feuille.getCell('B3').value).toBe('BETA');

    // Vraie date Excel au format français, même jour quel que soit le fuseau.
    const date = feuille.getCell('A2').value as Date;
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(feuille.getCell('A2').numFmt).toBe('dd/mm/yyyy');

    expect(feuille.getCell('D2').value).toBe(78);
    expect(feuille.getCell('E2').value).toEqual({
      text: 'https://exemple.fr/d/1',
      hyperlink: 'https://exemple.fr/d/1',
    });
    // Texte qui n'est pas une URL web : jamais transformé en lien.
    expect(feuille.getCell('E3').value).toBe('pas un lien');
    // Cellules vides : vides dans Excel, pas « null » en texte.
    expect(feuille.getCell('A3').value).toBeNull();
  });

  it('garde la valeur brute d’une date impossible ou libre', async () => {
    const feuille = await exporterPuisRelire([
      fakeRow('r1', { impe: '2026-02-31' }),
      fakeRow('r2', { impe: 'semaine 38' }),
    ]);
    expect(feuille.getCell('A2').value).toBe('2026-02-31');
    expect(feuille.getCell('A3').value).toBe('semaine 38');
  });

  it('n’interprète jamais une valeur comme une formule', async () => {
    const feuille = await exporterPuisRelire([fakeRow('r1', { client: '=HYPERLINK("x")' })]);
    expect(feuille.getCell('B2').value).toBe('=HYPERLINK("x")');
    expect(feuille.getCell('B2').formula).toBeUndefined();
  });

  it('reprend les couleurs de pastille d’une colonne SELECT', async () => {
    const feuille = await exporterPuisRelire([fakeRow('r1', { statut: 'PLANIFIEE' })]);
    const cellule = feuille.getCell('C2');
    expect(cellule.value).toBe('PLANIFIEE');
    expect(cellule.fill).toMatchObject({ pattern: 'solid', fgColor: { argb: 'FFDFF0D8' } });
    expect(cellule.font).toMatchObject({ bold: true, color: { argb: 'FF2E7D32' } });
  });

  it('donne la priorité au surlignage manuel, sans texte de pastille illisible', async () => {
    const feuille = await exporterPuisRelire([
      fakeRow(
        'r1',
        { statut: 'PLANIFIEE', client: 'ARCADIA' },
        { statut: { bg: '#FFFF00' }, client: { bg: '#ffcccc', fg: '#C00000' } },
      ),
    ]);
    const select = feuille.getCell('C2');
    expect(select.fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } });
    expect(select.font?.color).toBeUndefined();
    expect(select.font?.bold).toBe(true);

    const texte = feuille.getCell('B2');
    expect(texte.fill).toMatchObject({ fgColor: { argb: 'FFFFCCCC' } });
    expect(texte.font?.color).toEqual({ argb: 'FFC00000' });
  });

  it('ignore une couleur mal formée au lieu de produire un fichier corrompu', async () => {
    const feuille = await exporterPuisRelire([
      fakeRow('r1', { client: 'ARCADIA' }, { client: { bg: 'rouge' } }),
    ]);
    const fill = feuille.getCell('B2').fill as FillPattern | undefined;
    expect(fill?.pattern ?? 'none').toBe('none');
  });

  it('reporte les largeurs écran et renvoie à la ligne les textes longs', async () => {
    const feuille = await exporterPuisRelire([fakeRow('r1', { commentaire: 'ligne 1\nligne 2' })]);
    expect(feuille.getColumn(1).width).toBe(15); // 110 px
    expect(feuille.getColumn(2).width).toBe(35); // 250 px
    expect(feuille.getColumn(3).width).toBe(18); // largeur inconnue
    expect(feuille.getCell('F2').value).toBe('ligne 1\nligne 2');
    expect(feuille.getCell('F2').alignment).toMatchObject({ wrapText: true });
  });

  it('nomme l’onglet ARCHIVES pour la vue archives', async () => {
    const feuille = await exporterPuisRelire([], 'ARCHIVES');
    expect(feuille.name).toBe('ARCHIVES');
  });
});

describe('nomOnglet', () => {
  it('retire les caractères interdits par Excel et tronque à 31 caractères', () => {
    expect(nomOnglet('A/B:C*D?[E]\\F')).toBe('A B C D  E  F');
    expect(nomOnglet('x'.repeat(40))).toHaveLength(31);
    expect(nomOnglet("'cité'")).toBe('cité');
  });

  it('ne renvoie jamais un nom vide', () => {
    expect(nomOnglet('  ')).toBe('Tableau');
    expect(nomOnglet('[]')).toBe('Tableau');
  });
});

describe('nomFichierExport', () => {
  it('nomme le fichier d’après le mois ou la vue archives', () => {
    expect(nomFichierExport('mois', '2026-09')).toBe('suivi-commandes-2026-09.xlsx');
    expect(nomFichierExport('archives', '2026-09')).toBe('suivi-commandes-archives.xlsx');
  });
});

describe('declencherTelechargement', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clique un lien de téléchargement éphémère puis libère l’URL', () => {
    vi.useFakeTimers();
    // jsdom n'implémente pas les URL d'objets : on les simule.
    const createObjectURL = vi.fn(() => 'blob:export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clics: HTMLAnchorElement[] = [];
    const clic = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clics.push(this);
      });

    declencherTelechargement(new ArrayBuffer(4), 'suivi-commandes-2026-09.xlsx', TYPE_MIME_XLSX);

    expect(clic).toHaveBeenCalledTimes(1);
    expect(clics[0]?.download).toBe('suivi-commandes-2026-09.xlsx');
    expect(clics[0]?.href).toBe('blob:export');
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe(TYPE_MIME_XLSX);
    // Le lien ne reste pas dans la page.
    expect(document.querySelector('a[download]')).toBeNull();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
    vi.unstubAllGlobals();
  });
});
