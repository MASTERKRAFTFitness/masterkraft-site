import type { ContentPageData } from "@/components/marketing/ContentPage";
import { legalContent } from "./legal-content";

// Info / support / legal page copy. Placeholder-but-professional wording the
// client can refine - structure and routes match masterkraft.com.
export const contentPages: Record<string, ContentPageData> = {
  warranty: {
    eyebrow: "Support",
    title: "Warranty",
    subtitle: "Every piece of MasterKraft equipment is built to endure - and backed accordingly.",
    intro:
      "MasterKraft equipment is engineered and manufactured to commercial-grade standards. We stand behind it with a warranty appropriate to each product category and its intended use.",
    sections: [
      {
        heading: "What's covered",
        body: [
          "Structural components and frames are warranted against manufacturing defects under normal, intended use. Coverage periods vary by product category - commercial, light-commercial and home use each carry their own terms.",
          "Wear items (cables, upholstery, bearings, grips and similar) are warranted for a shorter period consistent with their expected service life.",
        ],
      },
      {
        heading: "Making a claim",
        body: [
          "To lodge a warranty claim, contact us with your order details and a description of the issue. Our team manages warranty claims directly, with a committed response and resolution SLA.",
          "Call 03 9044 9575 or reach us through our Contact page to get started.",
        ],
      },
    ],
  },
  returns: {
    eyebrow: "Support",
    title: "Returns",
    subtitle: "Straightforward returns on eligible items.",
    sections: [
      {
        heading: "Eligibility",
        body: [
          "Unused items in their original packaging may be eligible for return within the stated period from delivery. Custom-branded, made-to-order and clearance items may be excluded.",
          "Please contact us before returning any item so we can arrange the most efficient outcome.",
        ],
      },
      {
        heading: "How to return an item",
        body: [
          "Contact us through our Contact page with your order number and the reason for return. We'll confirm eligibility and provide return instructions.",
          "Refunds are processed once the returned item has been received and inspected.",
        ],
      },
    ],
  },
  finance: {
    eyebrow: "Support",
    title: "Finance",
    subtitle: "Flexible ways to fund your equipment and fit-out.",
    intro:
      "MasterKraft has researched the best financiers for fitness equipment and partnered with those that offer a range of flexible finance options, enabling you to get your equipment faster and at the most competitive finance rates. If you need assistance, contact us on 03 9044 9575 and we will provide advice on a tailored finance solution.",
    sections: [
      {
        heading: "Afterpay (coming soon)",
        body: [
          "Lending limit: up to $2,000. Loan type: personal. Interest terms: interest free. Repayments: four equal instalments paid fortnightly. Establishment fee: none. Approval: instant. Use online and in-store.",
          "Train hard now, pay later with Afterpay for purchases up to $2,000.",
        ],
      },
      {
        heading: "Zip Money (coming soon)",
        body: [
          "Lending limit: up to $8,000. Loan type: personal. Interest terms: interest free for the first 3 months. Repayments: weekly, fortnightly or monthly instalments. Establishment fee: one-off account establishment fee. Approval: 3 minute approval. Use online and in-store.",
          "Own it now, pay later. Zip Money is a smarter way to pay for larger purchases over time, on your terms. Every time you make a purchase Zip adds it to your account, then at the start of the month sends you a statement of what you spent and paid. Pay it back in full at the end of the month, or pay over time from as little as $40 a month, interest free.",
          "Account limit: over $1,000. Interest free period: 0% for 12 months. Establishment fee: $0 to $99. Minimum repayments: from $40/month. Account fee: $6/month, waived if you have no balance. See terms.",
        ],
      },
      {
        heading: "GRENKE (business leasing, over $75,000)",
        body: [
          "Lending limit: up to $75,000 low doc, and beyond. Leasing type: business (leasing). Repayments: monthly or quarterly, 1 to 5 years. Establishment fee: one-off account establishment fee. Approval: 20 minutes or less. Possibly tax deductible, with electronic signature.",
          "MasterKraft has partnered with GRENKE to offer smarter finance for purchases up to $75,000 low doc and beyond. As a valued customer you can access market-leading rates; leasing with the option of no early termination fees or payout penalties; no monthly account keeping fees; several finance structures tailored to your business needs; and no-financials, low-doc options.",
        ],
      },
      {
        heading: "What is the process?",
        body: [
          "Obtain a quote from MasterKraft for your required gym and fitness equipment.",
          "Contact us to apply today. The application is done over the phone in approximately 10 minutes.",
          "Once approved, the paperwork is sent via DocuSign for signature.",
          "Once signed, the equipment is released to you (pending availability).",
        ],
      },
      {
        body: ["To discuss finance, call 03 9044 9575 or reach us through our Contact page."],
      },
    ],
  },
  shipping: {
    eyebrow: "Support",
    title: "Shipping & Delivery",
    subtitle: "Global capability, local delivery.",
    intro:
      "With warehousing near your markets and streamlined logistics, MasterKraft delivers equipment where you need it - often in weeks, not months.",
    sections: [
      {
        heading: "Delivery",
        body: [
          "Delivery timeframes depend on stock availability, product type and destination. In-stock accessories dispatch quickly; larger equipment and full fit-outs are sequenced to your rollout schedule.",
          "For fit-outs, we coordinate staged manufacture, freight and installation against your build timeline.",
        ],
      },
      {
        heading: "Freight & installation",
        body: [
          "Freight is calculated by weight, volume and destination. Installation and commissioning can be arranged as part of a fit-out package.",
        ],
      },
    ],
  },
  "delivery-information": {
    eyebrow: "Support",
    title: "Delivery Information",
    subtitle: "How your order gets to you.",
    sections: [
      {
        heading: "Order processing",
        body: [
          "Once your order is confirmed, in-stock items are prepared for dispatch and larger items are scheduled with our freight partners.",
          "You'll receive updates as your order progresses. For multi-site orders, delivery is sequenced to your rollout.",
        ],
      },
      {
        heading: "Receiving your delivery",
        body: [
          "Please ensure someone is available to receive and check the delivery. Report any transit damage to us immediately so we can resolve it under our service SLA.",
        ],
      },
    ],
  },
  fitpass: {
    eyebrow: "Programs",
    title: "FitPass",
    subtitle: "Partner benefits from MasterKraft.",
    sections: [
      {
        body: [
          "FitPass is our partner program for gyms and operators. Speak to our team to find out how FitPass can add value for your business.",
          "Get in touch through our Contact page to learn more.",
        ],
      },
    ],
  },
  forms: {
    eyebrow: "Resources",
    title: "Forms",
    subtitle: "Downloadable forms and documentation.",
    sections: [
      {
        body: [
          "Warranty claims, credit applications and other forms are available on request.",
          "Get in touch through our Contact page and we'll send through the form you need.",
        ],
      },
    ],
  },
  "become-a-member": {
    eyebrow: "Wholesale",
    title: "Become a Member",
    subtitle: "Trade and wholesale access to the MasterKraft range.",
    sections: [
      {
        body: [
          "Membership gives qualifying trade customers access to wholesale pricing and the MasterKraft ordering portal.",
          "Apply via our Become a Distributor page, or get in touch through our Contact page to discuss membership.",
        ],
      },
    ],
  },
  "finance-legal": {
    eyebrow: "Portal",
    title: "Finance & Legal",
    subtitle: "Account documentation for portal partners.",
    sections: [
      {
        body: [
          "Finance and legal documentation for wholesale accounts is available through the partner portal.",
          "Existing partners can sign in to the portal to access statements, credit terms and agreements.",
        ],
      },
    ],
  },
  "process-overview": {
    eyebrow: "How We Work",
    title: "Process Overview",
    subtitle: "From first survey to final commissioning.",
    sections: [
      { heading: "01 · Scope", body: ["Site survey and floor layout for your footprint."] },
      { heading: "02 · Spec", body: ["A standardised equipment schedule in your colours, with custom branding."] },
      { heading: "03 · Supply", body: ["Staged manufacture and freight, sequenced to your rollout."] },
      { heading: "04 · Support", body: ["Install, commissioning and team induction - backed by our 72-hour SLA."] },
    ],
  },
  "our-process": {
    eyebrow: "How We Work",
    title: "Our Process",
    subtitle: "One accountable partner, every step of the way.",
    intro:
      "Whether you're outfitting a single space or a multi-site group, our process is the same: understand how you operate, then build the equipment, fit-out, branding and support around it.",
    sections: [
      { heading: "Scope", body: ["We survey each site and design a treatment- or training-floor layout for its footprint."] },
      { heading: "Spec", body: ["We standardise your equipment schedule in your colours, with custom upholstery and branding."] },
      { heading: "Supply", body: ["We stage manufacture and freight to your rollout - as fast as 4-6 weeks."] },
      { heading: "Support", body: ["We install, commission and induct your team, backed by our committed 72-hour SLA and partner portal."] },
    ],
  },
  "terms-and-conditions": {
    eyebrow: "Legal",
    title: "Terms & Conditions",
    subtitle: "The terms that govern use of this website and purchases from MasterKraft.",
    sections: [
      {
        heading: "Use of this website",
        body: [
          "By accessing this website you agree to use it lawfully and not to misuse its content. All content, imagery and trademarks are the property of MasterKraft or its licensors.",
        ],
      },
      {
        heading: "Orders & pricing",
        body: [
          "All orders are subject to acceptance and availability. Prices, specifications and availability may change without notice. Where a pricing or description error occurs, we reserve the right to correct it and to cancel affected orders.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "To the extent permitted by law, MasterKraft's liability is limited to the resupply of goods or the cost of resupply. Nothing in these terms excludes rights you have under applicable consumer law.",
        ],
      },
      {
        body: ["For questions about these terms, contact us through our Contact page."],
      },
    ],
  },
  "privacy-policy": {
    eyebrow: "Legal",
    title: "Privacy Policy",
    subtitle: "How MasterKraft collects, uses and protects your information.",
    sections: [
      {
        heading: "Information we collect",
        body: [
          "We collect information you provide when you make an enquiry, place an order or sign up to our list - such as your name, contact details and order information.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "We use your information to process orders, respond to enquiries, provide support and - where you've opted in - send you updates. We do not sell your personal information.",
        ],
      },
      {
        heading: "Your choices",
        body: [
          "You can unsubscribe from marketing at any time and request access to or correction of your personal information by contacting us.",
          "For privacy requests, contact us through our Contact page.",
        ],
      },
    ],
  },
};

// Replace the placeholder body of the legal / policy pages with the real copy
// taken verbatim from the live masterkraft.com pages. Keeps the page header
// (eyebrow/title/subtitle); drops the placeholder intro so only the real text shows.
for (const [slug, sections] of Object.entries(legalContent)) {
  const page = contentPages[slug];
  if (page) {
    page.sections = sections;
    delete page.intro;
  }
}
