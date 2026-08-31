-- Corbeille des mois supprimés : un instantané par mois (clé = "month",
-- écrasé à chaque nouvelle suppression). "rows" porte le tableau JSON complet
-- des lignes actives supprimées (id, month, position, data, formats, version,
-- archived, createdBy, createdAt) ; la restauration le consomme puis retire
-- l'entrée. Aucune FK : les lignes n'existent plus au moment de l'instantané.
-- CreateTable
CREATE TABLE "MonthTrash" (
    "month" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,

    CONSTRAINT "MonthTrash_pkey" PRIMARY KEY ("month")
);
