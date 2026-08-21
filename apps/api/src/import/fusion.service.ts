import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Row } from '@prisma/client';
import { Workbook, type Worksheet } from 'exceljs';
import type { ImportFusionReportDTO, ImportOngletDTO } from '@suivi/shared';
import { ApiException } from '../common/api.exception';
import { RowEventsService } from '../events/row-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { buildDiff, mergeData, mergeFormats } from '../rows/merge';
import { toRowDTO } from '../rows/rows.mapper';
import {
  construirePlanFusion,
  construirePlanOrdre,
  type AmbiguitePlanifiee,
  type LigneFichier,
  type PlanFusion,
} from './fusion';
import { buildHeaderMap } from './header-mapping';
import { headersOf, readRowCells } from './import.service';
import { sheetNameToMonth } from './month-mapping';
import { repairZohoXlsx } from './repair-zoho';

/** Même plafond de lignes par feuille que l'import CLI (import.service.ts). */
const LIMITE_LIGNES = 20000;

/**
 * Une fusion porte sur UN onglet-mois (~200 lignes) : transaction bien plus
 * courte que l'import CLI intégral, mais on garde une marge confortable.
 */
const FUSION_TRANSACTION_TIMEOUT_MS = 60_000;
const FUSION_TRANSACTION_MAX_WAIT_MS = 10_000;

/** Lignes créées / mises à jour pendant la transaction d'un onglet. */
interface ResultatOnglet {
  plan: PlanFusion;
  creees: Row[];
  majs: { row: Row; changedKeys: string[] }[];
  /** Lignes modifiées par une ADV pendant l'import : laissées intactes. */
  conflits: AmbiguitePlanifiee[];
  /** Lignes dont la position a été réécrite (« la feuille fait foi »), état final. */
  repositionnees: Row[];
}

/** Lit les lignes non vides d'une feuille mensuelle (même lecture que le CLI). */
function lireLignesFeuille(worksheet: Worksheet): LigneFichier[] {
  const mapping = buildHeaderMap(headersOf(worksheet));
  const lignes: LigneFichier[] = [];
  const derniereLigne = Math.min(worksheet.rowCount, LIMITE_LIGNES);
  for (let numero = 2; numero <= derniereLigne; numero++) {
    const cellules = readRowCells(worksheet, numero, mapping);
    if (cellules.empty) {
      continue;
    }
    lignes.push({ numero, data: cellules.data, formats: cellules.formats });
  }
  return lignes;
}

/**
 * Valeurs réellement importées (créations + patchs) absentes des listes de
 * choix EN BASE (source de vérité vivante, contrairement aux listes statiques
 * du CLI) : importées telles quelles, mais signalées dans le rapport.
 */
function valeursHorsListe(plan: PlanFusion, choix: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  const occurrences = new Map<string, number>();
  const compter = (data: Record<string, string>): void => {
    for (const [cle, valeur] of Object.entries(data)) {
      const autorisees = choix.get(cle);
      if (autorisees !== undefined && !autorisees.has(valeur)) {
        const marque = `${cle}\u0000${valeur}`;
        occurrences.set(marque, (occurrences.get(marque) ?? 0) + 1);
      }
    }
  };
  for (const creation of plan.creations) {
    compter(creation.data);
  }
  for (const mise of plan.misesAJour) {
    compter(mise.patch);
  }
  return [...occurrences].map(([marque, nombre]) => {
    const separation = marque.indexOf('\u0000');
    const cle = marque.slice(0, separation);
    const valeur = marque.slice(separation + 1);
    return `valeur « ${valeur} » hors liste pour la colonne ${cle} (${nombre} ligne(s)) — importée telle quelle`;
  });
}

/**
 * Fusion incrémentale du classeur Zoho avec la base, PAR onglet-mois.
 * Chaque onglet est appliqué dans SA transaction ; les événements temps réel
 * (`row.created` / `row.updated`) sont émis APRÈS le commit de l'onglet
 * (règle absolue du contrat temps réel), ligne par ligne — même canal que
 * l'édition manuelle, donc déjà géré tel quel par le front (`upsertRow`).
 */
@Injectable()
export class ImportFusionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RowEventsService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async fusionnerClasseur(buffer: Buffer, userId: string): Promise<ImportFusionReportDTO> {
    const workbook = new Workbook();
    try {
      const repare = await repairZohoXlsx(buffer);
      // Même détour de type que importWorkbook (deux @types/node dans l'arbre).
      await workbook.xlsx.load(repare as unknown as ArrayBuffer);
    } catch {
      throw new ApiException(
        'VALIDATION_FAILED',
        'Fichier .xlsx illisible.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const choix = await this.choixParColonne();
    const rapport: ImportFusionReportDTO = { parOnglet: [], erreurs: [] };

    for (const worksheet of workbook.worksheets) {
      const mois = sheetNameToMonth(worksheet.name);
      if (mois === null) {
        // Feuilles hors périmètre de la fusion (TEST, Feuille1, ARCHIVES OK...).
        continue;
      }
      try {
        rapport.parOnglet.push(await this.fusionnerOnglet(worksheet, mois, userId, choix));
      } catch (erreur) {
        const message = erreur instanceof Error ? erreur.message : String(erreur);
        rapport.erreurs.push(`${worksheet.name.trim()} : ${message}`);
      }
    }

    return rapport;
  }

  /** Listes de choix par clé de colonne SELECT, lues en base (archivés inclus). */
  private async choixParColonne(): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    const colonnes = await this.prisma.column.findMany({
      where: { type: 'SELECT' },
      include: { choices: { select: { label: true } } },
    });
    return new Map(
      colonnes.map((colonne) => [
        colonne.key,
        new Set(colonne.choices.map((choixColonne) => choixColonne.label)),
      ]),
    );
  }

  private async fusionnerOnglet(
    worksheet: Worksheet,
    mois: string,
    userId: string,
    choix: ReadonlyMap<string, ReadonlySet<string>>,
  ): Promise<ImportOngletDTO> {
    const lignesFichier = lireLignesFeuille(worksheet);

    const resultat = await this.prisma.$transaction(
      async (tx) => this.appliquerPlan(tx, mois, lignesFichier, userId),
      { timeout: FUSION_TRANSACTION_TIMEOUT_MS, maxWait: FUSION_TRANSACTION_MAX_WAIT_MS },
    );

    // APRÈS commit uniquement : diffusion dans la room `month:<YYYY-MM>`.
    // Les lignes réordonnancées portent l'état FINAL (position réécrite) :
    // elles remplacent l'instantané pris avant la passe d'ordre.
    const finales = new Map(resultat.repositionnees.map((row) => [row.id, row]));
    for (const cree of resultat.creees) {
      this.emitter.emitRowCreated(toRowDTO(finales.get(cree.id) ?? cree));
    }
    const dejaEmises = new Set(resultat.creees.map((cree) => cree.id));
    for (const { row, changedKeys } of resultat.majs) {
      this.emitter.emitRowUpdated(toRowDTO(finales.get(row.id) ?? row), changedKeys, userId);
      dejaEmises.add(row.id);
    }
    // Réordonnancement seul : même contrat que le renumérotage du move manuel
    // (`row.updated`, changedKeys vides, version intacte) — déjà digéré par le
    // front (`upsertRow` retrie par position), aucune modification front.
    for (const row of resultat.repositionnees) {
      if (!dejaEmises.has(row.id)) {
        this.emitter.emitRowUpdated(toRowDTO(row), [], userId);
      }
    }

    return {
      mois,
      creees: resultat.creees.length,
      misesAJour: resultat.majs.length,
      inchangees: resultat.plan.inchangees,
      reordonnees: resultat.repositionnees.length,
      ambiguites: [...resultat.plan.ambiguites, ...resultat.conflits],
      horsListe: valeursHorsListe(resultat.plan, choix),
    };
  }

  /**
   * Applique le plan de fusion d'un onglet dans la transaction `tx` :
   * créations en fin de mois, mises à jour versionnées + RowEvent, ambiguïtés
   * et lignes base absentes du fichier volontairement intactes, puis
   * réordonnancement « la feuille fait foi » (positions réécrites uniquement
   * quand elles changent, version intacte — même contrat que le move manuel).
   */
  private async appliquerPlan(
    tx: Prisma.TransactionClient,
    mois: string,
    lignesFichier: readonly LigneFichier[],
    userId: string,
  ): Promise<ResultatOnglet> {
    const lignesActives = await tx.row.findMany({
      where: { month: mois, archived: false },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const plan = construirePlanFusion(
      lignesFichier,
      lignesActives.map((ligne) => {
        const dto = toRowDTO(ligne);
        return { id: ligne.id, data: dto.data, formats: dto.formats };
      }),
    );

    const creees: Row[] = [];
    let position = lignesActives.length;
    for (const creation of plan.creations) {
      const ligne = await tx.row.create({
        data: {
          month: mois,
          position,
          data: creation.data as Prisma.InputJsonValue,
          formats: creation.formats as Prisma.InputJsonValue,
          createdBy: userId,
        },
      });
      await this.events.record(tx, {
        rowId: ligne.id,
        userId,
        type: 'create',
        payload: { month: mois, position },
      });
      creees.push(ligne);
      position += 1;
    }

    const parId = new Map(lignesActives.map((ligne) => [ligne.id, ligne]));
    const majs: ResultatOnglet['majs'] = [];
    const conflits: AmbiguitePlanifiee[] = [];
    for (const mise of plan.misesAJour) {
      const courante = parId.get(mise.rowId);
      if (courante === undefined) {
        continue;
      }
      const dtoCourant = toRowDTO(courante);
      const nouvelleVersion = courante.version + 1;
      // Garde optimiste : l'instantané `lignesActives` date du début de la
      // transaction, sans `FOR UPDATE`. Si un PATCH d'ADV committe sur cette
      // ligne entre-temps, fusionner l'instantané écraserait silencieusement
      // sa modification et réutiliserait un numéro de version déjà consommé
      // (la détection de conflit de RowsService.patch suppose les versions
      // uniques). Le filtre sur `version` transforme ce cas en collision
      // détectée : ligne laissée intacte, consignée au rapport.
      const garde = await tx.row.updateMany({
        where: { id: mise.rowId, version: courante.version },
        data: {
          data: mergeData(dtoCourant.data, mise.patch) as Prisma.InputJsonObject,
          formats: mergeFormats(dtoCourant.formats, mise.formats) as Prisma.InputJsonObject,
          version: nouvelleVersion,
        },
      });
      if (garde.count === 0) {
        conflits.push({
          client: String(dtoCourant.data['client'] ?? ''),
          raison: "modifiée pendant l'import — laissée intacte, relancer l'import",
          lignesFichier: [],
          lignesBase: [mise.rowId],
        });
        continue;
      }
      const enregistree = await tx.row.findUniqueOrThrow({ where: { id: mise.rowId } });
      await this.events.record(tx, {
        rowId: mise.rowId,
        userId,
        type: 'update',
        payload: {
          version: nouvelleVersion,
          changedKeys: mise.changedKeys,
          diff: buildDiff(dtoCourant.data, mise.patch),
        },
      });
      majs.push({ row: enregistree, changedKeys: mise.changedKeys });
    }

    // Réordonnancement dans la MÊME transaction : bloc feuille (appariées non
    // ambiguës hors conflits + créées, numéro de ligne croissant) puis lignes
    // hors fichier / ambiguës / en conflit dans leur ordre relatif actuel.
    // Pas de RowEvent : même précédent que le renumérotage du move manuel.
    const reecritures = construirePlanOrdre(
      plan,
      lignesActives.map((ligne) => ({ id: ligne.id, position: ligne.position })),
      plan.creations.map((creation, index) => ({
        id: creees[index].id,
        position: creees[index].position,
        numero: creation.numero,
      })),
      new Set(conflits.flatMap((conflit) => conflit.lignesBase)),
    );
    const repositionnees: Row[] = [];
    for (const { rowId, position: cible } of reecritures) {
      repositionnees.push(
        await tx.row.update({ where: { id: rowId }, data: { position: cible } }),
      );
    }

    return { plan, creees, majs, conflits, repositionnees };
  }
}
