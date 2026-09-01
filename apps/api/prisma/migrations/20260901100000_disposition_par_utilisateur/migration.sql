-- Disposition personnelle des colonnes : une entrée par (utilisateur, colonne),
-- largeur/position/masquage propres à chaque compte. Un champ NULL hérite du
-- réglage standard porté par la table "Column" (écran admin, inchangé).
-- Cascade des deux côtés : la suppression d'un compte ou d'une colonne emporte
-- ses entrées de disposition.
-- CreateTable
CREATE TABLE "UserColumnLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "width" INTEGER,
    "position" INTEGER,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserColumnLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserColumnLayout_userId_columnId_key" ON "UserColumnLayout"("userId", "columnId");

-- AddForeignKey
ALTER TABLE "UserColumnLayout" ADD CONSTRAINT "UserColumnLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserColumnLayout" ADD CONSTRAINT "UserColumnLayout_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column"("id") ON DELETE CASCADE ON UPDATE CASCADE;
