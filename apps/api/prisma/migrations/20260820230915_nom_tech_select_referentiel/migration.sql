-- Référentiel techniciens : la colonne `nom_tech` (« NOM TECH ») passe de TEXT à SELECT.
--
-- Les choices sont créés à partir des valeurs DISTINCTES non vides déjà présentes dans
-- Row.data->>'nom_tech', tous mois confondus et lignes archivées incluses (le rendu des
-- archives s'appuie sur ces choices). Les libellés reprennent les valeurs telles quelles
-- (la grille fait une correspondance exacte valeur/label), positions ordonnées
-- alphabétiquement à partir de 0.
--
-- Couleurs : réplique SQL de pastelFor (@suivi/shared/src/palette.ts) — hash djb2 du
-- libellé trimmé et passé en majuscules, modulo 24, sur la même palette de 24 pastels.
--
-- Idempotente et sûre pour la prod (`prisma migrate deploy`) :
--   * UPDATE conditionnel du type ;
--   * INSERT ... ON CONFLICT ("columnId","label") DO NOTHING
--     (index unique "Choice_columnId_label_key") ;
--   * aucune suppression, aucune modification de Row.data ;
--   * base neuve (colonne absente, seed pas encore passé) : no-op.
DO $migration$
DECLARE
  pastel_bg text[] := ARRAY[
    '#FFCDD2','#F8BBD0','#E1BEE7','#D1C4E9','#C5CAE9','#BBDEFB',
    '#B3E5FC','#B2EBF2','#B2DFDB','#C8E6C9','#DCEDC8','#F0F4C3',
    '#FFF9C4','#FFECB3','#FFE0B2','#FFCCBC','#D7CCC8','#CFD8DC',
    '#F6DDCC','#D6EAF8','#D1F2EB','#FCF3CF','#E8DAEF','#FDEBD0'
  ];
  pastel_text text[] := ARRAY[
    '#B71C1C','#880E4F','#4A148C','#311B92','#1A237E','#0D47A1',
    '#01579B','#006064','#004D40','#1B5E20','#33691E','#827717',
    '#6D4C41','#5D4037','#BF360C','#9C2A00','#3E2723','#263238',
    '#6E2C00','#154360','#0B5345','#7D6608','#512E5F','#784212'
  ];
  nom_tech_column_id text;
  choice_label text;
  normalized text;
  hash bigint;
  palette_index integer;
  i integer;
  next_position integer := 0;
BEGIN
  SELECT "id" INTO nom_tech_column_id FROM "Column" WHERE "key" = 'nom_tech';

  -- Installation neuve : la colonne n'existe pas encore, le seed la créera en SELECT.
  IF nom_tech_column_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE "Column"
  SET "type" = 'SELECT'
  WHERE "id" = nom_tech_column_id
    AND "type" <> 'SELECT';

  FOR choice_label IN
    SELECT DISTINCT r."data" ->> 'nom_tech'
    FROM "Row" r
    WHERE COALESCE(btrim(r."data" ->> 'nom_tech'), '') <> ''
    ORDER BY 1
  LOOP
    -- djb2 identique à pastelFor : hash * 33 + code, contraint en entier non signé 32 bits.
    normalized := upper(btrim(choice_label));
    hash := 5381;
    FOR i IN 1..char_length(normalized) LOOP
      hash := (hash * 33 + ascii(substr(normalized, i, 1))) % 4294967296;
    END LOOP;
    palette_index := (hash % 24)::integer + 1;

    INSERT INTO "Choice" ("id", "columnId", "label", "bgColor", "textColor", "bold", "position", "archived")
    VALUES (
      -- Id déterministe (double filet d'idempotence avec l'ON CONFLICT).
      'nomtech_' || md5('nom_tech|' || choice_label),
      nom_tech_column_id,
      choice_label,
      pastel_bg[palette_index],
      pastel_text[palette_index],
      false,
      next_position,
      false
    )
    ON CONFLICT ("columnId", "label") DO NOTHING;

    next_position := next_position + 1;
  END LOOP;
END
$migration$;
