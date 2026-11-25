-- portal_product_v: a club's artwork only fills a photo gap for that club's codes.
--
-- WHY. catalogue_images files every brand-images render under the SKU it was
-- named for, whichever club's folder it sits in: /brand-images/fernwood/
-- MMDBUR19.png is the Fernwood-liveried 7.5kg dumbbell, filed under the M code.
-- The view joined on SKU alone, so an M code with no Unleashed photo took the
-- first club folder that had one. On 25 Nov 2026 seven core-range codes showed a
-- club's livery on every prospect catalogue (SWELL among them) and portal:
--   MMDBUR19            Fernwood   (7.5kg PU dumbbells)
--   MMDBUR29, MMDBUR30  Jetts      (55kg, 60kg PU dumbbells)
--   MWWPCNB07, 08       Jetts      (Pro bumper 10kg, 15kg)
--   MWWPCNB09, 10       Gold's     (Pro bumper 20kg, 25kg)
--
-- THE RULE, the one the catalogues app's brandImage() already keeps: a file in
-- /brand-images/<club>/ is used only for that club's own range (F fernwood,
-- S snap, J jetts, G golds, SP strong). /brand-images/_shared/ and any path
-- outside /brand-images/ stay open to every code. M, N and C2 codes therefore
-- take only _shared or non-club photography here; with none they fall through to
-- a borrow row or no photo, which beats another club's logo.
--
-- Only catalogue_photo changes; the rest is the live definition as of 25 Nov
-- (pg_get_viewdef), identical in columns, so CREATE OR REPLACE is safe.

create or replace view public.portal_product_v as
 WITH sellable AS (
         SELECT e.erp_code, e.guid, e.name, e.price, e.stock, e.brand, e.group_name, e.subgroup,
            e.sellable, e.obsolete, e.image, e.weight_kg, e.width_cm, e.depth_cm, e.height_cm,
            e.synced_at, e.tags, e.is_branded, e.sell_price_tiers,
            upper(TRIM(BOTH FROM e.erp_code)) AS code
           FROM erp_products e
          WHERE e.sellable IS TRUE AND e.obsolete IS FALSE
        ), content AS (
         SELECT DISTINCT ON ((upper(TRIM(BOTH FROM c_1.erp_code)))) upper(TRIM(BOTH FROM c_1.erp_code)) AS code,
            c_1.erp_code, c_1.slug, c_1.overview_short, c_1.overview, c_1.features,
            c_1.package_inclusions, c_1.updated_at, c_1.updated_by, c_1.assembled_size, c_1.colour,
            c_1.material, c_1.net_weight, c_1.gross_weight, c_1.packing_size, c_1.warranty,
            c_1.description, c_1.short_description, c_1.width, c_1.height, c_1.depth, c_1.length,
            c_1.specs_extra,
            COALESCE(c_1.overview, ''::text) <> ''::text OR COALESCE(c_1.overview_short, ''::text) <> ''::text AS has_copy
           FROM product_content c_1
          ORDER BY (upper(TRIM(BOTH FROM c_1.erp_code))), c_1.updated_at DESC NULLS LAST
        ), family_copy AS (
         SELECT DISTINCT ON (("left"(s_1.code, 1)), (lower(portal_family_name(s_1.name)))) "left"(s_1.code, 1) AS letter,
            lower(portal_family_name(s_1.name)) AS family,
            s_1.code
           FROM sellable s_1
             JOIN content c_1 ON c_1.code = s_1.code AND c_1.has_copy
          WHERE COALESCE(s_1.name, ''::text) <> ''::text
          ORDER BY ("left"(s_1.code, 1)), (lower(portal_family_name(s_1.name))), s_1.code
        ), keyed AS (
         SELECT s_1.erp_code, s_1.guid, s_1.name, s_1.price, s_1.stock, s_1.brand, s_1.group_name,
            s_1.subgroup, s_1.sellable, s_1.obsolete, s_1.image, s_1.weight_kg, s_1.width_cm,
            s_1.depth_cm, s_1.height_cm, s_1.synced_at, s_1.tags, s_1.is_branded,
            s_1.sell_price_tiers, s_1.code,
                CASE
                    WHEN s_1.code ~~ 'SP%'::text THEN 'M'::text || substr(s_1.code, 3)
                    WHEN "left"(s_1.code, 1) = ANY (ARRAY['F'::text, 'S'::text, 'J'::text, 'G'::text, 'A'::text]) THEN 'M'::text || substr(s_1.code, 2)
                    ELSE NULL::text
                END AS twin_code,
                CASE
                    WHEN COALESCE(s_1.name, ''::text) <> ''::text THEN lower(portal_family_name(s_1.name))
                    ELSE NULL::text
                END AS family
           FROM sellable s_1
        ), copy AS (
         SELECT k.code,
            own_1.code AS own_code,
                CASE
                    WHEN own_1.has_copy THEN 'own'::text
                    WHEN twin.has_copy THEN 'twin'::text
                    WHEN fc.code IS NOT NULL THEN 'family'::text
                    ELSE NULL::text
                END AS source,
                CASE
                    WHEN own_1.has_copy THEN own_1.code
                    WHEN twin.has_copy THEN twin.code
                    ELSE fc.code
                END AS copy_code
           FROM keyed k
             LEFT JOIN content own_1 ON own_1.code = k.code
             LEFT JOIN content twin ON twin.code = k.twin_code
             LEFT JOIN family_copy fc ON fc.letter = "left"(k.code, 1) AND fc.family = k.family
        ), catalogue_keys AS (
         SELECT upper(TRIM(BOTH FROM k.key)) AS code,
            ci.public_path,
            ci.is_primary,
            ci.sort_order,
            ci.file_name,
            substring(ci.public_path FROM '^/brand-images/([^/]+)/'::text) AS folder
           FROM catalogue_images ci
             CROSS JOIN LATERAL ( VALUES (ci.sku), (ci.sku_stem)) k(key)
          WHERE ci.include_in_catalogue IS TRUE AND ci.public_path IS NOT NULL AND COALESCE(TRIM(BOTH FROM k.key), ''::text) <> ''::text
        ), catalogue_photo AS (
         SELECT DISTINCT ON (ck.code) ck.code,
            'https://catalogues.masterkraft.com'::text || ck.public_path AS url
           FROM catalogue_keys ck
             JOIN sellable k ON k.code = ck.code
          -- A club folder only for that club's own range (see header).
          WHERE ck.folder IS NULL
             OR ck.folder = '_shared'::text
             OR ck.folder = CASE
                    WHEN ck.code ~~ 'SP%'::text THEN 'strong'::text
                    WHEN "left"(ck.code, 1) = 'F'::text THEN 'fernwood'::text
                    WHEN "left"(ck.code, 1) = 'S'::text THEN 'snap'::text
                    WHEN "left"(ck.code, 1) = 'J'::text THEN 'jetts'::text
                    WHEN "left"(ck.code, 1) = 'G'::text THEN 'golds'::text
                    ELSE NULL::text
                END
          ORDER BY ck.code, ck.is_primary DESC NULLS LAST, ck.sort_order, ck.file_name
        ), base_photo AS (
         SELECT s_1.code,
            COALESCE(pp.image_url, NULLIF(s_1.image, ''::text), cp.url) AS url,
                CASE
                    WHEN pp.image_url IS NOT NULL THEN 'primary'::text
                    WHEN NULLIF(s_1.image, ''::text) IS NOT NULL THEN 'erp'::text
                    WHEN cp.url IS NOT NULL THEN 'catalogue'::text
                    ELSE NULL::text
                END AS source
           FROM sellable s_1
             LEFT JOIN portal_product_images pp ON pp.erp_code = s_1.code AND pp.kind = 'primary'::text
             LEFT JOIN catalogue_photo cp ON cp.code = s_1.code
        )
 SELECT s.code AS erp_code,
    s.name, s.price, s.brand, s.group_name, s.subgroup,
    s.image AS erp_image,
    s.weight_kg, s.width_cm, s.depth_cm, s.height_cm, s.synced_at, s.tags, s.is_branded,
    s.sell_price_tiers,
    own.slug,
    COALESCE(NULLIF(src.overview, ''::text), NULLIF(src.overview_short, ''::text), ''::text) AS description,
    c.source AS description_source,
        CASE WHEN own.code IS NOT NULL THEN own.features ELSE src.features END AS features,
    own.colour,
        CASE WHEN own.code IS NOT NULL THEN own.material ELSE src.material END AS material,
        CASE WHEN own.code IS NOT NULL THEN own.warranty ELSE src.warranty END AS warranty,
        CASE
            WHEN own.code IS NOT NULL THEN own.net_weight
            WHEN c.source = 'family'::text THEN NULL::text
            ELSE src.net_weight
        END AS net_weight,
        CASE
            WHEN own.code IS NOT NULL THEN own.gross_weight
            WHEN c.source = 'family'::text THEN NULL::text
            ELSE src.gross_weight
        END AS gross_weight,
        CASE
            WHEN ov.image_url IS NOT NULL THEN ov.image_url
            WHEN bp.url IS NOT NULL THEN bp.url
            ELSE lender.url
        END AS photo_url,
        CASE
            WHEN ov.image_url IS NOT NULL THEN 'override'::text
            WHEN bp.url IS NOT NULL THEN bp.source
            WHEN lender.url IS NOT NULL THEN 'borrow'::text
            ELSE NULL::text
        END AS photo_source
   FROM sellable s
     JOIN copy c ON c.code = s.code
     LEFT JOIN content own ON own.code = c.own_code
     LEFT JOIN content src ON src.code = c.copy_code
     LEFT JOIN portal_product_images ov ON ov.erp_code = s.code AND ov.kind = 'override'::text
     LEFT JOIN base_photo bp ON bp.code = s.code
     LEFT JOIN portal_product_images bw ON bw.erp_code = s.code AND bw.kind = 'borrow'::text
     LEFT JOIN base_photo lender ON lender.code = bw.borrow_from;
