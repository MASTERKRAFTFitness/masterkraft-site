// The placeholder that stands in for a page of product cards while the real
// ones stream in.
//
// THIS EXISTS TO RESERVE HEIGHT, not to look busy. The listing routes used to
// fall back to a centred spinner about 400px tall, then swap in a 24-card grid
// several thousand pixels tall - which shoved the footer down the page the
// instant the real content arrived. Lighthouse measured the result on
// /all-equipment as a CLS of 0.464, attributed in full to <footer>, against a
// 0.1 "good" threshold. Layout shift is a ranking signal, so that single swap
// was the worst-scoring thing on an otherwise fast page (LCP 0.6s, TBT 0ms).
//
// So the grid classes below are copied from ProductListing, and `count`
// defaults to the listing routes' PER_PAGE: the skeleton has to occupy the same
// footprint as what replaces it, or it is just a prettier spinner. If PER_PAGE
// or the grid columns change, change them here too.
export default function ProductGridSkeleton({ count = 24 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading products"
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10 animate-pulse"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="aspect-square bg-smoke border border-line" />
          {/* Four bands, because ProductCard renders four: a two-line
              (line-clamp-2) title, the SKU, and the price. */}
          <div className="mt-4 h-3.5 bg-smoke rounded w-3/4" />
          <div className="mt-2 h-3.5 bg-smoke rounded w-1/2" />
          <div className="mt-2 h-3 bg-smoke rounded w-1/3" />
          <div className="mt-2 h-3.5 bg-smoke rounded w-1/4" />
        </div>
      ))}
    </div>
  );
}
