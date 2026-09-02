import { describe, expect, it } from 'vitest';
import type { ChoiceDTO, RowDTO } from '@suivi/shared';
import { construireDocumentImpression, type ColonneImpression } from './printTable';

const colonnes: ColonneImpression[] = [
  { key: 'impe', label: 'IMPE', type: 'DATE' },
  { key: 'client', label: 'CLIENT', type: 'TEXT' },
  { key: 'statut', label: 'INSTALLATION', type: 'SELECT' },
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
  data: Record<string, string | number | null>,
  formats: RowDTO['formats'] = {},
): RowDTO {
  return {
    id: 'row-1',
    month: '2026-09',
    position: 0,
    data,
    formats,
    version: 1,
    archived: false,
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

function construire(lignes: RowDTO[], sousTitre = '195 dossiers'): string {
  return construireDocumentImpression({
    titre: 'SEPTEMBRE 2026',
    sousTitre,
    colonnes,
    lignes,
    choicesParColonne,
    dateImpression: new Date(2026, 8, 2),
  });
}

describe('construireDocumentImpression', () => {
  it('répète les libellés de colonnes en tête de chaque page, dans l’ordre donné', () => {
    const html = construire([]);
    const thead = /<thead><tr>(.*)<\/tr><\/thead>/.exec(html)?.[1] ?? '';
    expect(thead).toBe('<th>IMPE</th><th>CLIENT</th><th>INSTALLATION</th>');
    // `table-header-group` = thead réimprimé en tête de chaque page A4.
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('size: A4 landscape');
  });

  it('répartit les largeurs de colonnes au prorata des largeurs écran', () => {
    const html = construireDocumentImpression({
      titre: 'SEPTEMBRE 2026',
      sousTitre: '1 dossier',
      colonnes: [
        { key: 'impe', label: 'IMPE', type: 'DATE', width: 100 },
        { key: 'client', label: 'CLIENT', type: 'TEXT', width: 300 },
      ],
      lignes: [],
      choicesParColonne: {},
      dateImpression: new Date(2026, 8, 2),
    });
    expect(html).toContain('<col style="width:25.00%">');
    expect(html).toContain('<col style="width:75.00%">');
  });

  it('sans largeurs fournies : aucun colgroup, colonnes équitables', () => {
    const html = construire([]);
    expect(html).not.toContain('<colgroup>');
  });

  it('rend la valeur SELECT en pastille colorée du choix correspondant', () => {
    const html = construire([fakeRow({ statut: 'PLANIFIEE' })]);
    const pastille = /<span class="pastille"[^>]*>PLANIFIEE<\/span>/.exec(html)?.[0] ?? '';
    expect(pastille).toContain('background:#DFF0D8');
    expect(pastille).toContain('color:#2E7D32');
    expect(pastille).toContain('font-weight:700');
  });

  it('applique le surlignage manuel de la cellule en fond de <td>', () => {
    const html = construire([
      fakeRow({ client: 'DUPONT' }, { client: { bg: '#F7DC6F' } }),
    ]);
    expect(html).toContain('<td style="background:#F7DC6F">DUPONT</td>');
  });

  it('formate les dates en JJ/MM/AAAA, en-tête d’impression compris', () => {
    const html = construire([fakeRow({ impe: '2026-09-14' })]);
    expect(html).toContain('<td>14/09/2026</td>');
    expect(html).toContain('Imprimé le 02/09/2026');
  });

  it('échappe le HTML des valeurs (commentaires ADV avec < > &)', () => {
    const html = construire([fakeRow({ client: 'Société <A&B> "test"' })]);
    expect(html).toContain('Société &lt;A&amp;B&gt; &quot;test&quot;');
    expect(html).not.toContain('<A&B>');
  });

  it('porte le titre et le sous-titre « filtres actifs » dans l’en-tête', () => {
    const html = construire([], '12 / 195 dossiers — filtres actifs');
    expect(html).toContain('<h1>SEPTEMBRE 2026</h1>');
    expect(html).toContain('12 / 195 dossiers — filtres actifs');
  });
});
