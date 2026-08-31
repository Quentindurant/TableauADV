-- Nouvel état ATT GC apparu dans la colonne INSTALLATION du classeur Zoho :
-- même famille visuelle que les autres statuts d'attente (fond rose, texte
-- brique, gras). Couleurs de la palette douce (cf. migration couleurs_douces).
-- Idempotente : ON CONFLICT sur (columnId, label), aucune suppression, aucune
-- écriture dans Row. No-op si la colonne `statut` n'existe pas (installation
-- neuve : le seed le crée).
DO $migration$
DECLARE
  statut_column_id text;
  prochaine_position integer;
BEGIN
  SELECT "id" INTO statut_column_id FROM "Column" WHERE "key" = 'statut';
  IF statut_column_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX("position") + 1, 0) INTO prochaine_position
  FROM "Choice" WHERE "columnId" = statut_column_id;

  INSERT INTO "Choice" ("id", "columnId", "label", "bgColor", "textColor", "bold", "position", "archived")
  VALUES (
    'statutgc_' || md5('statut|ATT GC'),
    statut_column_id,
    'ATT GC',
    '#F8B5C8',
    '#943126',
    true,
    prochaine_position,
    false
  )
  ON CONFLICT ("columnId", "label") DO NOTHING;
END
$migration$;
