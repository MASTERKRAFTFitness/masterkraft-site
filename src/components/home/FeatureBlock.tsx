import Image from "next/image";
import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";

export default function FeatureBlock({
  eyebrow,
  title,
  body,
  cta,
  href,
  image,
  reverse = false,
}: {
  eyebrow?: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  image: string;
  reverse?: boolean;
}) {
  return (
    <section className="grid md:grid-cols-2 items-stretch">
      <div className={`relative min-h-[340px] md:min-h-[460px] ${reverse ? "md:order-2" : ""}`}>
        <Image src={image} alt={title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
      </div>
      <div
        className={`flex items-center bg-white text-ink ${reverse ? "md:order-1" : ""}`}
      >
        <div className="p-10 lg:p-16 max-w-lg">
          {eyebrow && (
            <Eyebrow className="mb-4">
              {eyebrow}
            </Eyebrow>
          )}
          <h2 className="text-3xl lg:text-4xl font-bold">{title}</h2>
          <p className="mt-5 text-ash leading-relaxed">{body}</p>
          <Link href={href} className="btn btn-accent mt-8">
            {cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
