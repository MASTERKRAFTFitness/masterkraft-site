// Renders a JSON-LD structured-data script. Server component.
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inline as ld+json
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
