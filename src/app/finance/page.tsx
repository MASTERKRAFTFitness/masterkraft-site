import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageHero from "@/components/marketing/PageHero";
import Eyebrow from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Finance",
  description: "Flexible ways to fund your equipment and fit-out — Afterpay, Zip Money and GRENKE.",
};

type Provider = {
  name: string;
  logo: string;
  comingSoon?: boolean;
  specs: { label: string; value: string }[];
};

const providers: Provider[] = [
  {
    name: "Afterpay",
    logo: "/finance/afterpay.jpg",
    comingSoon: true,
    specs: [
      { label: "Lending Limit", value: "Up to $2,000" },
      { label: "Loan type", value: "Personal" },
      { label: "Interest terms", value: "Interest free" },
      { label: "Repayments", value: "Four equal instalments paid fortnightly" },
      { label: "Establishment Fee", value: "No establishment fee" },
      { label: "Approval Process", value: "Instant approval" },
      { label: "Other Benefits", value: "Use online and in-store" },
    ],
  },
  {
    name: "Zip Money",
    logo: "/finance/zip-money.jpg",
    comingSoon: true,
    specs: [
      { label: "Lending Limit", value: "Up to $8,000" },
      { label: "Loan type", value: "Personal" },
      { label: "Interest terms", value: "Interest free for the first 3 months" },
      { label: "Repayments", value: "Weekly, fortnightly, or monthly instalments" },
      { label: "Establishment Fee", value: "One-off account establishment fee" },
      { label: "Approval Process", value: "3 minute approval" },
      { label: "Other Benefits", value: "Use online and in-store" },
    ],
  },
  {
    name: "GRENKE",
    logo: "/finance/grenke.png",
    specs: [
      { label: "Lending limit", value: "Up to $75,000 low doc, and beyond" },
      { label: "Leasing Type", value: "Business (Leasing)" },
      { label: "Repayments", value: "Monthly or quarterly, 1-5 years" },
      { label: "Establishment Fee", value: "One-off account establishment fee" },
      { label: "Approval Process", value: "20 minutes or less" },
      { label: "Other Benefits", value: "Possibly tax deductible, electronic signature" },
    ],
  },
];

const process = [
  "Obtain a quote from MasterKraft for your required gym and fitness equipment.",
  "Contact us to apply today — the application is done over the phone in approximately 10 minutes.",
  "Once approved, the paperwork is sent via DocuSign for signature.",
  "Once signed, the equipment is released to you (pending availability).",
];

export default function FinancePage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title="Finance"
        subtitle="Flexible ways to fund your equipment and fit-out."
      />

      <section className="container-mk py-16">
        <p className="max-w-3xl text-lg text-ash leading-relaxed">
          MasterKraft has researched the best financiers for fitness equipment and partnered with those
          that offer a range of flexible finance options, so you can get your equipment faster and at
          the most competitive rates. Need a hand? Call{" "}
          <a href="tel:+61390449575" className="underline decoration-accent-600 underline-offset-2">
            +61 3 9044 9575
          </a>{" "}
          and we&apos;ll advise on a tailored finance solution.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {providers.map((p) => (
            <div key={p.name} className="border border-line flex flex-col">
              <div className="relative aspect-[3/2] border-b border-line bg-white">
                <Image src={p.logo} alt={`${p.name} logo`} fill className="object-contain p-6" sizes="(max-width:768px) 100vw, 33vw" />
              </div>
              <div className="p-6 flex-1">
                <h2 className="text-xl font-bold">
                  {p.name}
                  {p.comingSoon && <span className="text-ash font-normal"> (coming soon)</span>}
                </h2>
                <dl className="mt-4 space-y-2 text-sm leading-relaxed">
                  {p.specs.map((s) => (
                    <div key={s.label}>
                      <dt className="inline font-semibold text-ink">{s.label}: </dt>
                      <dd className="inline text-ash">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-smoke border-t border-line">
        <div className="container-mk py-16 max-w-3xl">
          <Eyebrow className="mb-6">What is the process?</Eyebrow>
          <ol className="space-y-4">
            {process.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-mono text-accent-600 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-ash leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-ash">
            To discuss finance, call{" "}
            <a href="tel:+61390449575" className="underline decoration-accent-600 underline-offset-2">
              +61 3 9044 9575
            </a>{" "}
            or{" "}
            <Link href="/contact" className="underline decoration-accent-600 underline-offset-2">
              reach us through our Contact page
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
