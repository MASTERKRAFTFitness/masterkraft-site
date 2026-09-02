import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGallery from "@/components/shop/ProductGallery";
import {
  getProductBySlug,
  getProductsByCategory,
  parseProductDetail,
  filterBrandSku,
  getBundleFromPrice,
  formatPrice,
  type WcProduct,
} from "@/lib/woocommerce";
import { getUnleashedMap, enrich, enrichCard, lookupBySku, type EnrichedProduct } from "@/lib/unleashed";
import AddToCartButton from "@/components/shop/AddToCartButton";
import VariantSelector, { type Variant } from "@/components/shop/VariantSelector";
import { VariantSelectionProvider } from "@/components/shop/VariantSelection";
import SizeTable from "@/components/shop/SizeTable";
import { sizesFromCodes } from "@/lib/ranges";
import { erpUnitBySlug, erpUnitsInGroup, unitAsProduct, unitCard, unitDescription } from "@/lib/erp-catalogue";

// Stable positive hash of an ERP code, negated for use as a cart key. Sizes the
// old store never listed have no WooCommerce variation id, and the cart keys on
// a number; a negative one can never collide with a real WooCommerce id.
function hashCode(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}
import ViewItemTracker from "@/components/shop/ViewItemTracker";
import ProductCard from "@/components/shop/ProductCard";
import JsonLd from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";

// ISR: cache the rendered product page and refresh in the background every 10 min.
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // THE SAME TWO SOURCES, IN THE SAME ORDER, as the page body below - see its
  // comment. Resolving the snapshot alone here gave the 165 ERP-only units the
  // generic "Product | MASTERKRAFT" in search results and no og:title to share,
  // on pages the sitemap advertises. The ERP is only consulted when the snapshot
  // has nothing, so a snapshot-backed page keeps the words it has always had.
  const wooProduct = await getProductBySlug(slug).catch(() => null);
  const unit = wooProduct
    ? undefined
    : erpUnitBySlug(await getUnleashedMap().catch(() => ({})), slug);
  const p = wooProduct ?? (unit && unitAsProduct(unit));
  if (!p) return { title: "Product" };
  return {
    title: `${p.name}`,
    // The ERP holds no marketing copy, so an ERP-only page describes itself with
    // the sizes and price its card carries rather than going out bare.
    description:
      p.short_description?.replace(/<[^>]*>/g, "").slice(0, 155) ||
      (unit ? unitDescription(unit) : undefined),
    alternates: { canonical: `/product/${slug}` },
    openGraph: {
      title: p.name,
      images: p.images?.[0]?.src ? [{ url: p.images[0].src }] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // TWO SOURCES, ONE PAGE. The ERP is the catalogue (lib/erp-catalogue.ts) and
  // supplies what is sold — name, code, price, stock, sizes, photographs. The
  // frozen snapshot supplies the WORDS, which the ERP does not hold at all, and
  // the URL this page has always lived at.
  //
  // A page exists if EITHER has it: 165 units are sold only in the ERP and have
  // never had a WooCommerce record, and they get a page built from ERP data with
  // no marketing copy. Obsolete and other-brand products still come back null
  // from getProductBySlug, so they still 404.
  //
  // NOTE: this segment deliberately has NO loading.tsx. A loading file wraps the
  // segment in Suspense, which flushes the shell - and a 200 - before this line
  // runs, turning every 404 into a SOFT 404 (404 body, 200 status) that Google
  // would happily index. Re-adding a skeleton here brings that back.
  const unleashed = await getUnleashedMap().catch(() => ({}));
  const wooProduct = await getProductBySlug(slug).catch(() => null);
  const unit = erpUnitBySlug(unleashed, slug);
  if (!wooProduct && !unit) notFound();
  const product = wooProduct ?? unitAsProduct(unit!);

  const cat = product.categories?.[0];
  const detail = parseProductDetail(product);
  // A bundle has no price of its own, so label it the same way its card is
  // labelled. priceValue stays 0 so it keeps routing to the quote flow rather
  // than becoming card-payable at the cost of its cheapest item - see enrichCard.
  const bundleFrom = getBundleFromPrice(product);
  const enriched = bundleFrom !== null
    ? { ...enrich(product, unleashed), priceLabel: `From ${formatPrice(bundleFrom)}`, priceValue: 0 }
    : enrich(product, unleashed);
  const inStock = enriched.inStock;
  const stockQty = lookupBySku(unleashed, product.sku)?.stock;

  // THE SIZES COME FROM UNLEASHED, and from the SAME unit the category card was
  // built from, so a card and the page it opens can never disagree about what is
  // in the range. sizesFromCodes is the one place a size row is made.
  const sizes = unit ? sizesFromCodes(unit.codes, unleashed) : [];

  const variants: Variant[] = (unit?.isRange ? sizes : []).map((s) => ({
    id: s.wooVariationId ?? -hashCode(s.code),
    code: s.code,
    label: s.label,
    priceLabel: s.price > 0 ? formatPrice(s.price) : "Contact for pricing",
    priceValue: s.price,
    inStock: s.stock > 0,
    stockQty: s.stock,
    image: s.image ?? product.images?.[0]?.src,
    wooProductId: s.wooProductId,
    wooVariationId: s.wooVariationId,
  }));
  const usesVariants = variants.length > 0;
  const variantPrices = variants.map((v) => v.priceValue).filter((v) => v > 0);

  // Every size's photograph, from Unleashed's own CDN, with the snapshot's
  // images behind them. Deduplicated by URL.
  const galleryImages = [
    ...(usesVariants ? variants : sizes)
      .map((v) => v.image)
      .filter((src): src is string => !!src)
      .map((src) => ({ src, alt: product.name })),
    ...(product.images ?? []),
  ].filter((img, i, all) => all.findIndex((o) => o.src === img.src) === i);

  // Which size each of those photographs is, so the strip can caption them and a
  // click on one can select it. Built from the same `variants` the picker gets,
  // so a caption cannot disagree with the dropdown. Where two sizes share a
  // photograph the strip shows it once and the first size owns the caption,
  // which is why later ones do not overwrite.
  const galleryLabels: Record<string, { label: string; code: string }> = {};
  for (const v of variants) {
    if (v.image && !galleryLabels[v.image]) galleryLabels[v.image] = { label: v.label, code: v.code };
  }

  const offers = usesVariants
    ? variantPrices.length > 0
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "AUD",
            lowPrice: Math.min(...variantPrices).toFixed(2),
            highPrice: Math.max(...variantPrices).toFixed(2),
            offerCount: variants.length,
            availability: variants.some((v) => v.inStock)
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
          },
        }
      : {}
    : enriched.priceValue > 0
      ? {
          offers: {
            "@type": "Offer",
            url: `${SITE_URL}/product/${product.slug}`,
            priceCurrency: "AUD",
            price: enriched.priceValue.toFixed(2),
            availability: inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/PreOrder",
            itemCondition: "https://schema.org/NewCondition",
          },
        }
      : {};

  const productSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: (product.images ?? []).map((i) => i.src).slice(0, 5),
    description: product.short_description?.replace(/<[^>]*>/g, "").trim() || undefined,
    sku: product.sku || undefined,
    brand: { "@type": "Brand", name: "MasterKraft" },
    ...offers,
  };

  // Related products from the same ERP group, which is what the category pages
  // now list by. Falls back to the snapshot's category when the ERP is
  // unreachable, so this block degrades rather than emptying.
  let related: { product: WcProduct; enriched: EnrichedProduct }[] = [];
  if (unit) {
    related = erpUnitsInGroup(unleashed, unit.group)
      .filter((u) => u.slug !== unit.slug)
      .slice(0, 4)
      .map(unitCard);
  } else if (cat) {
    const rel = await getProductsByCategory(cat.id, { perPage: 24 }).catch(() => null);
    const others = filterBrandSku(rel?.data ?? []).filter((p) => p.id !== product.id).slice(0, 4);
    related = await Promise.all(
      others.map(async (p) => ({ product: p, enriched: await enrichCard(p, unleashed) }))
    );
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Equipment", item: `${SITE_URL}/all-equipment` },
      ...(cat
        ? [{ "@type": "ListItem", position: 2, name: cat.name, item: `${SITE_URL}/equipment/${cat.slug}` }]
        : []),
      { "@type": "ListItem", position: cat ? 3 : 2, name: product.name, item: `${SITE_URL}/product/${product.slug}` },
    ],
  };

  return (
    <>
      <JsonLd data={productSchema} />
      <JsonLd data={breadcrumbSchema} />
      {/* Breadcrumb / spacer under the fixed header */}
      <div className="bg-carbon text-white pt-28 pb-6">
        <div className="container-mk font-mono text-xs tracking-widest uppercase text-white/60">
          <Link href="/all-equipment" className="hover:text-accent">Equipment</Link>
          {cat && (
            <>
              {" / "}
              <Link href={`/equipment/${cat.slug}`} className="hover:text-accent">{cat.name}</Link>
            </>
          )}
        </div>
      </div>

      {/* The picker and the gallery live in two columns of this grid; the
          provider is what lets choosing 9kg swap the photograph. */}
      <VariantSelectionProvider>
      {/* items-start, so the two columns size to their own content. Without it
          the short column stretches to match the tall one and the overview
          floats in the middle of its own whitespace. */}
      <section className="container-mk py-14 grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        <ViewItemTracker
          id={product.id}
          name={product.name}
          price={
            // A range's own priceValue is 0 (it is a bundle); report the cheapest
            // size instead so view_item is not logged at $0 for 32 products.
            usesVariants && variantPrices.length > 0
              ? Math.min(...variantPrices)
              : enriched.priceValue
          }
        />
        <ProductGallery images={galleryImages} name={product.name} labels={galleryLabels} />

        {/* RIGHT: name, price, picker, then the words.
            row-span-2 so this column occupies BOTH rows rather than making the
            first one as tall as itself. Without it the row stretches to this
            column's height and the size table lands 300px below the thumbnails
            with nothing in between. */}
        <div className="lg:row-span-2">
          {cat && (
            <p className="font-mono text-xs tracking-widest text-accent-600 uppercase">{cat.name}</p>
          )}
          <h1 className="mt-3 text-3xl lg:text-4xl font-bold">{product.name}</h1>

          {/* A range has no code of its own worth showing — "MMDBRH-GROUP" is a
              WooCommerce container, not something anyone can order. The picker
              shows the selected size's ERP code instead. */}
          {product.sku && !usesVariants && (
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-ash">
              Code: {product.sku}
            </p>
          )}

          {product.short_description && (
            <div
              className="mt-5 text-ash leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: product.short_description }}
            />
          )}

          <div className="mt-7">
            {usesVariants ? (
              <VariantSelector
                productName={unit?.name ?? product.name}
                productSlug={product.slug}
                variants={variants}
              />
            ) : (
              <>
                <div className="flex items-baseline gap-3 font-mono text-2xl">
                  {enriched.compareAtLabel && (
                    <span className="text-ash line-through text-lg">{enriched.compareAtLabel}</span>
                  )}
                  <span className="text-ink">{enriched.priceLabel}</span>
                </div>
                <p className="mt-2 text-xs font-mono uppercase tracking-widest text-ash">
                  {inStock
                    ? stockQty && stockQty > 0
                      ? `${stockQty} in stock`
                      : "In stock"
                    : "Made to order"}{" "}
                  · Prices inc. GST
                </p>
                <div className="mt-8">
                  <AddToCartButton
                    product={{
                      id: product.id,
                      productId: product.id,
                      slug: product.slug,
                      name: product.name,
                      image: product.images?.[0]?.src,
                      price: enriched.priceValue,
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <p className="mt-4 text-xs text-ash">
            Add items to your cart and request a tailored quote - our team confirms
            pricing, freight and lead times for your order.
          </p>

          {/* The overview reads directly under the price rather than as a
              full-width band below the fold, so the copy that sells the thing
              is beside the control that buys it. */}
          {(detail.overviewDescription || detail.features.length > 0 || product.description) && (
            <div className="mt-12">
              <h2 className="text-xl font-bold border-b border-line pb-3 mb-6">Product Overview</h2>
              {detail.overviewDescription ? (
                <p className="text-ash leading-relaxed mb-6">{detail.overviewDescription}</p>
              ) : (
                product.description && (
                  <div
                    className="text-ash leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:mb-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-ink [&_strong]:text-ink [&_img]:my-4"
                    dangerouslySetInnerHTML={{ __html: product.description }}
                  />
                )
              )}
              {detail.features.length > 0 && (
                <>
                  <h3 className="font-semibold text-ink mt-2 mb-3">Features</h3>
                  <ul className="list-disc pl-5 space-y-2 text-ash leading-relaxed">
                    {detail.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {/* A THIRD GRID CHILD, not a child of the gallery, and the order is
            what makes both layouts right. On desktop it lands in row 2 of the
            left column — under the thumbnails, left-justified, filling a column
            that would otherwise stop at the strip while the buy column runs on.
            On a phone the grid is one column, so it falls AFTER the price and
            the picker rather than shoving them below 26 rows. */}
        {usesVariants && (
          <SizeTable
            productName={unit?.name ?? product.name}
            productSlug={product.slug}
            variants={variants}
          />
        )}
      </section>
      </VariantSelectionProvider>

      {detail.specs.length > 0 && (
        <section className="container-mk pb-20 max-w-3xl">
          <h2 className="text-xl font-bold border-b border-line pb-3 mb-6">Specifications</h2>
          <dl className="divide-y divide-line">
            {detail.specs.map((s, i) => (
              <div key={i} className="grid grid-cols-3 gap-4 py-3">
                <dt className="font-mono text-xs uppercase tracking-widest text-ash">{s.label}</dt>
                <dd className="col-span-2 text-ink leading-relaxed">{s.value}</dd>
              </div>
            ))}
          </dl>
          {detail.packageInclusions && (
            <div className="mt-8">
              <h3 className="font-semibold text-ink mb-3">Package inclusions</h3>
              <div
                className="text-ash leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:mb-3"
                dangerouslySetInnerHTML={{ __html: detail.packageInclusions }}
              />
            </div>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="bg-smoke">
          <div className="container-mk py-16">
            <h2 className="text-2xl font-bold mb-8">You may also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">
              {related.map(({ product: rp, enriched: re }) => (
                <ProductCard key={rp.id} product={rp} enriched={re} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
