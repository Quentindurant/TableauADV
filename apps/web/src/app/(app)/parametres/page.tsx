'use client';

import { useState } from 'react';

import ColonnesTab from './colonnes';
import EquipeTab from './equipe';
import ImportTab from './import';
import ListesTab from './listes';

export type OngletParametres = 'colonnes' | 'listes' | 'equipe' | 'import';

const ONGLETS: { id: OngletParametres; libelle: string }[] = [
  { id: 'colonnes', libelle: 'Colonnes' },
  { id: 'listes', libelle: 'Listes & couleurs' },
  { id: 'equipe', libelle: 'Équipe' },
  { id: 'import', libelle: 'Import' },
];

export default function ParametresPage() {
  const [onglet, setOnglet] = useState<OngletParametres>('colonnes');

  return (
    <main className="gc-settings">
      <h1>Paramètres</h1>

      <div role="tablist" aria-label="Sections des paramètres" className="gc-settings__tablist">
        {ONGLETS.map((element) => (
          <button
            key={element.id}
            type="button"
            role="tab"
            id={`onglet-${element.id}`}
            aria-controls={`panneau-${element.id}`}
            aria-selected={onglet === element.id}
            onClick={() => setOnglet(element.id)}
            className="gc-settings__tab"
          >
            {element.libelle}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panneau-${onglet}`} aria-labelledby={`onglet-${onglet}`}>
        {onglet === 'colonnes' && <ColonnesTab />}
        {onglet === 'listes' && <ListesTab />}
        {onglet === 'equipe' && <EquipeTab />}
        {onglet === 'import' && <ImportTab />}
      </div>
    </main>
  );
}
