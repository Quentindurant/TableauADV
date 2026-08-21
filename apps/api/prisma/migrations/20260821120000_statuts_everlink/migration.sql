-- Harmonisation du vocabulaire des statuts avec Everlink et le classeur Zoho :
-- TECHNIQUE, OPER, PORTA et PV rejoignent la liste de la colonne `statut`
-- (PORTA est émis par le push Everlink ; les trois autres apparaissent dans les
-- imports du classeur et restaient sans pastille). Couleurs de la feuille Zoho.
-- Idempotente : ON CONFLICT sur (columnId, label), aucune suppression, aucune
-- écriture dans Row. No-op si la colonne `statut` n'existe pas (installation
-- neuve : le seed les crée).
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
  SELECT
    'statutev_' || md5('statut|' || ajout.label),
    statut_column_id,
    ajout.label,
    ajout.bg,
    ajout.texte,
    true,
    prochaine_position + ajout.ordre,
    false
  FROM (VALUES
    ('TECHNIQUE', '#F1C40F', '#000000', 0),
    ('OPER',      '#EBDEF0', '#4A235A', 1),
    ('PORTA',     '#C39BD3', '#4A235A', 2),
    ('PV',        '#763E8D', '#FFFFFF', 3)
  ) AS ajout(label, bg, texte, ordre)
  ON CONFLICT ("columnId", "label") DO NOTHING;
END
$migration$;
