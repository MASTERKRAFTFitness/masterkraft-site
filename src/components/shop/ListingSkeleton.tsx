import ProductGridSkeleton from "./ProductGridSkeleton";

/**
 * The loading fallback shared by the three product-listing routes
 * (/all-equipment, /equipment/[category], /search).
 *
 * ITS ONE JOB IS TO BE THE RIGHT HEIGHT. See ProductGridSkeleton for the
 * measurement that prompted this; the short version is that a fallback shorter
 * than the page it stands in for moves the footer when the real content lands,
 * and that shift is a ranking signal.
 *
 * So the wrappers below are not approximations - they are the same classes
 * PageHero and the listing pages use, with sized blocks where the text goes.
 * If PageHero's padding changes, this has to change with it.
 */
export default function ListingSkeleton({
  crumbs = false,
  toolbar = false,
}: {
  /** The route's PageHero renders breadcrumbs, which swap its top padding. */
  crumbs?: boolean;
  /** The route renders the sort / jump-nav bar above the grid. */
  toolbar?: boolean;
}) {
  return (
    <>
      {/* PageHero */}
      <section className="relative bg-carbon text-white overflow-hidden">
        {crumbs && (
          <div className="relative">
            <div className="container-mk pt-28 pb-3">
              <div className="h-4 w-64 bg-white/10 rounded" />
            </div>
          </div>
        )}
        <div
          className={`relative container-mk pb-20 lg:pb-28 ${
            crumbs ? "pt-4 lg:pt-6" : "pt-32 lg:pt-40"
          }`}
        >
          {/* Eyebrow */}
          <div className="mb-5 h-4 w-32 bg-white/10 rounded" />
          {/* h1: text-4xl / lg:text-6xl at leading-[1.05] */}
          <div className="h-[38px] lg:h-[63px] w-2/3 max-w-3xl bg-white/10 rounded" />
          {/* subtitle: two lines of text-lg at leading-relaxed */}
          <div className="mt-6 h-[59px] w-full max-w-2xl bg-white/10 rounded" />
        </div>
      </section>

      <section className="container-mk py-16">
        {toolbar && (
          <div className="mb-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between border-b border-line pb-4">
            <div className="h-9 w-full sm:w-2/3 bg-smoke rounded" />
            <div className="h-9 w-full sm:w-44 bg-smoke rounded" />
          </div>
        )}
        <ProductGridSkeleton />
      </section>
    </>
  );
}
