export default function Loading() {
  return (
    <>
      <div className="bg-carbon h-24" />
      <section className="container-mk py-14 grid lg:grid-cols-2 gap-12 lg:gap-16 animate-pulse">
        {/* Gallery placeholder */}
        <div className="aspect-square bg-smoke border border-line" />
        {/* Detail column placeholder */}
        <div className="space-y-4">
          <div className="h-3 w-24 bg-smoke" />
          <div className="h-9 w-3/4 bg-smoke" />
          <div className="h-3 w-32 bg-smoke" />
          <div className="h-24 w-full bg-smoke" />
          <div className="h-8 w-40 bg-smoke" />
          <div className="h-12 w-full bg-smoke" />
        </div>
      </section>
    </>
  );
}
