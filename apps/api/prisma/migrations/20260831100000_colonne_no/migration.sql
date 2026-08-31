-- Colonne NO (bon de commande selon partenaire) relevée dans l'onglet
-- AOUT 2026 du classeur Zoho : HIGHCOM y inscrit un n° de BC numérique,
-- EVERLINK un code de lot (L1A/L1B/L1C/POC), les autres partenaires la
-- laissent vide. TEXT libre, position 1 (entre IMPE et CLIENT), 90 px.
-- Idempotente : no-op si la clé `no` existe déjà, aucune suppression,
-- aucune écriture dans Row. No-op aussi si la table Column est vide
-- (installation neuve : le seed crée toutes les colonnes, positions
-- comprises).
DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM "Column" WHERE "key" = 'no') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Column") THEN
    RETURN;
  END IF;

  -- Décale d'un cran tout ce qui suit IMPE pour libérer la position 1.
  UPDATE "Column" SET "position" = "position" + 1 WHERE "position" >= 1;

  INSERT INTO "Column" ("id", "key", "label", "type", "position", "width", "visible")
  VALUES ('colonne_' || md5('column|no'), 'no', 'NO', 'TEXT', 1, 90, true);
END
$migration$;
