export default function Loading() {
  return (
    <>
      <div className="bg-carbon h-40" />
      <section className="container-mk py-14 grid lg:grid-cols-2 gap-12 lg:gap-16 animate-pulse">
        <div className="aspect-square bg-smoke border border-line" />
        <div>
          <div className="h-3 w-24 bg-smoke rounded" />
          <div className="mt-4 h-8 w-3/4 bg-smoke rounded" />
          <div className="mt-6 h-4 w-full bg-smoke rounded" />
          <div className="mt-2 h-4 w-5/6 bg-smoke rounded" />
          <div className="mt-8 h-8 w-32 bg-smoke rounded" />
          <div className="mt-8 h-12 w-48 bg-smoke rounded" />
        </div>
      </section>
    </>
  );
}
