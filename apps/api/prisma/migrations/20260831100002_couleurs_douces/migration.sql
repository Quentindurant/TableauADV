-- Palette douce validée par le responsable projet (contraste >= 4,5:1) :
-- adoucit les pastilles trop vives des colonnes statut/partenaire/tech et
-- remappe les surlignages existants de Row.formats vers les nouvelles
-- teintes du surligneur. Idempotente : UPDATE simples rejouables (une
-- seconde exécution ne trouve plus rien à changer), aucune suppression.
-- Seuls les libellés/valeurs listés ici sont touchés : la DB reste la
-- source de vérité pour tout le reste.
DO $migration$
DECLARE
  statut_column_id text;
  partenaire_column_id text;
  tech_column_id text;
BEGIN
  -- 1. Statuts : pastilles adoucies. ATT PV, EN COLLECTE, STAND BY,
  --    INSTALLATION, A DISTANCE, OPER, PORTA et PV restent inchangés
  --    (ATT GC naît déjà avec les couleurs douces).
  SELECT "id" INTO statut_column_id FROM "Column" WHERE "key" = 'statut';
  IF statut_column_id IS NOT NULL THEN
    UPDATE "Choice"
    SET "bgColor" = maj.bg, "textColor" = maj.texte
    FROM (VALUES
      ('NEW',         '#F7DC6F', '#6B5504'),
      ('STAGING',     '#F8B5C8', '#943126'),
      ('ATT TECH',    '#F8B5C8', '#943126'),
      ('ATT PARTE',   '#F8B5C8', '#943126'),
      ('ATT 5 COM',   '#F8B5C8', '#943126'),
      ('ATT CLIENT',  '#F8B5C8', '#943126'),
      ('A SUIVRE',    '#FAD7A0', '#874D0B'),
      ('A PLANIFIER', '#A3E4D7', '#0E6251'),
      ('ANNULEE',     '#E6B0AA', '#78281F'),
      ('CLOTUREE',    '#D5D8DC', '#4D5656'),
      ('TECHNIQUE',   '#E9C46A', '#6E4A08')
    ) AS maj(label, bg, texte)
    WHERE "Choice"."columnId" = statut_column_id
      AND "Choice"."label" = maj.label;
  END IF;

  -- 2. Partenaires : 3 pastilles recolorées entièrement, 3 textes seuls
  --    (fonds HIGHCOM, VIP TELECOM et WETELGROUP inchangés).
  SELECT "id" INTO partenaire_column_id FROM "Column" WHERE "key" = 'partenaire';
  IF partenaire_column_id IS NOT NULL THEN
    UPDATE "Choice"
    SET "bgColor" = maj.bg, "textColor" = maj.texte
    FROM (VALUES
      ('EVERLINK',       '#7DCEA0', '#0E4D28'),
      ('ENTREPRISE PRO', '#A9CCE3', '#1B4F72'),
      ('OR-TEL',         '#F7DC6F', '#6B5504')
    ) AS maj(label, bg, texte)
    WHERE "Choice"."columnId" = partenaire_column_id
      AND "Choice"."label" = maj.label;

    UPDATE "Choice"
    SET "textColor" = maj.texte
    FROM (VALUES
      ('HIGHCOM',     '#4A235A'),
      ('VIP TELECOM', '#1B4F72'),
      ('WETELGROUP',  '#943126')
    ) AS maj(label, texte)
    WHERE "Choice"."columnId" = partenaire_column_id
      AND "Choice"."label" = maj.label;
  END IF;

  -- 3. Tech : textes assombris, ciblés par valeur (structure du seed :
  --    bgColor null, textColor seul — DIRECT en bleu, revendeurs en vert).
  SELECT "id" INTO tech_column_id FROM "Column" WHERE "key" = 'tech';
  IF tech_column_id IS NOT NULL THEN
    UPDATE "Choice" SET "textColor" = '#0072A8'
    WHERE "columnId" = tech_column_id AND "textColor" = '#009ADF';

    UPDATE "Choice" SET "textColor" = '#196F3D'
    WHERE "columnId" = tech_column_id AND "textColor" = '#229955';
  END IF;

  -- 4. Surlignages existants (Row.formats, forme {"colKey":{"bg":"#HEX"}}) :
  --    remap des teintes vives vers les douces. Le bleu #85C1E9 ne change
  --    pas. Import et palette web n'écrivent que des hex MAJUSCULES
  --    (cf. highlightOf qui passe l'ARGB en upper) : pas de variante
  --    minuscule à traiter.
  UPDATE "Row"
  SET "formats" = replace(replace(replace(replace("formats"::text,
      '#FF0000', '#EE7A6D'),
      '#FFFF00', '#F7DC6F'),
      '#9BDEB4', '#7DCEA0'),
      '#C39BD3', '#BB8FCE')::jsonb
  WHERE "formats"::text LIKE '%#FF0000%'
     OR "formats"::text LIKE '%#FFFF00%'
     OR "formats"::text LIKE '%#9BDEB4%'
     OR "formats"::text LIKE '%#C39BD3%';
END
$migration$;
