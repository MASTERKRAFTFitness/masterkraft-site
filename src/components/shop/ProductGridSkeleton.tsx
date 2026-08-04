export default function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="aspect-square bg-smoke border border-line" />
          <div className="mt-4 h-3.5 bg-smoke rounded w-3/4" />
          <div className="mt-2 h-3.5 bg-smoke rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}
