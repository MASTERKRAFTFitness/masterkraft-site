import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGallery from "@/components/shop/ProductGallery";
import { getProductBySlug, getProductVariations, getProductsByCategory } from "@/lib/woocommerce";
import { getUnleashedMap, enrich, enrichCard, lookupBySku } from "@/lib/unleashed";
import AddToCartButton from "@/components/shop/AddToCartButton";
import VariantSelector, { type Variant } from "@/components/shop/VariantSelector";
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
  const p = await getProductBySlug(slug).catch(() => null);
  if (!p) return { title: "Product" };
  return {
    title: `${p.name}`,
    description: p.short_description?.replace(/<[^>]*>/g, "").slice(0, 155) || undefined,
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
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) notFound();

  const cat = product.categories?.[0];
  const unleashed = await getUnleashedMap().catch(() => ({}));
  const enriched = enrich(product, unleashed);
  const inStock = enriched.inStock;
  const stockQty = lookupBySku(unleashed, product.sku)?.stock;

  // Variable products: fetch variations and price each on corrected data.
  const isVariable = product.type === "variable";
  let variants: Variant[] = [];
  if (isVariable) {
    const raw = await getProductVariations(product.id).catch(() => []);
    variants = raw.map((v) => {
      const e = enrich(v, unleashed);
      return {
        id: v.id,
        label: v.attributes?.map((a) => a.option).filter(Boolean).join(" / ") || v.sku || `#${v.id}`,
        priceLabel: e.priceLabel,
        priceValue: e.priceValue,
        inStock: e.inStock,
        stockQty: e.stockQty,
        image: v.image?.src ?? product.images?.[0]?.src,
      };
    });
  }
  const usesVariants = isVariable && variants.length > 0;
  const variantPrices = variants.map((v) => v.priceValue).filter((v) => v > 0);

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

  // Related products from the same category
  let related: { product: typeof product; enriched: Awaited<ReturnType<typeof enrichCard>> }[] = [];
  if (cat) {
    const rel = await getProductsByCategory(cat.id, { perPage: 9 }).catch(() => null);
    const others = (rel?.data ?? []).filter((p) => p.id !== product.id).slice(0, 4);
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

      <section className="container-mk py-14 grid lg:grid-cols-2 gap-12 lg:gap-16">
        <ViewItemTracker id={product.id} name={product.name} price={enriched.priceValue} />
        <ProductGallery images={product.images ?? []} name={product.name} />

        <div>
          {cat && (
            <p className="font-mono text-xs tracking-widest text-accent-600 uppercase">{cat.name}</p>
          )}
          <h1 className="mt-3 text-3xl lg:text-4xl font-bold">{product.name}</h1>

          {product.short_description && (
            <div
              className="mt-5 text-ash leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:mb-3"
              dangerouslySetInnerHTML={{ __html: product.short_description }}
            />
          )}

          <div className="mt-7">
            {usesVariants ? (
              <VariantSelector
                productId={product.id}
                productName={product.name}
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
        </div>
      </section>

      {product.description && (
        <section className="container-mk pb-20 max-w-3xl">
          <h2 className="text-xl font-bold border-b border-line pb-3 mb-6">Description</h2>
          <div
            className="text-ash leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:mb-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-ink [&_strong]:text-ink [&_img]:my-4"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
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
