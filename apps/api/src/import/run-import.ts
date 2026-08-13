import { PrismaClient } from '@prisma/client';
import { formatReport, importWorkbook } from './import.service';

async function main(): Promise<void> {
  const chemin = process.argv[2];
  if (chemin === undefined || chemin.trim() === '') {
    console.error(
      'Usage : pnpm --filter @suivi/api import:xlsx "<chemin/vers/TABLEAU SUIVI COMMANDES 2026.xlsx>"',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    console.log(`Import du classeur : ${chemin}`);
    console.log('Attention : cet import PURGE les colonnes, listes et lignes existantes.');
    const rapport = await importWorkbook(prisma, chemin);
    console.log(formatReport(rapport));
  } catch (erreur) {
    console.error("Échec de l'import :", erreur instanceof Error ? erreur.message : erreur);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
