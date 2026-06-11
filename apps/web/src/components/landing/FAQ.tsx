// TODO(i18n): wire copy through t() when the i18n helper ships.
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { JsonLd } from "@/components/seo/json-ld";
import { faqs } from "./data";

/**
 * FAQ — collapsible accordion. The single client-interactive primitive on the
 * landing page (the Accordion); the section wrapper itself is a Server
 * Component. FAQPage JSON-LD is injected in Task 2 for separation of concerns.
 */
export function FAQ() {
  // FAQPage JSON-LD — driven by the same `faqs` array as the rendered
  // accordion (single source of truth). `JSON.stringify` of typed data is
  // injection-safe (no user input).
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8"
    >
      <h2
        id="faq-heading"
        className="text-balance text-center text-3xl font-bold tracking-tight sm:text-4xl"
      >
        Frequently asked questions
      </h2>
      <Accordion type="single" collapsible className="mt-10 w-full">
        {faqs.map(({ q, a }, i) => (
          <AccordionItem key={q} value={`item-${i}`}>
            <AccordionTrigger className="min-h-11">{q}</AccordionTrigger>
            <AccordionContent>{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <JsonLd data={faqJsonLd} />
    </section>
  );
}
