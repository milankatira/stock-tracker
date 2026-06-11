// TODO(i18n): wire copy through t() when the i18n helper ships (Phase 1 has
// not installed one yet). All strings here are inline English for v1.
//
// COMPLIANCE: every string in this file is scanned by copy-compliance.test.tsx
// against the SEBI forbid-list. Only allowlisted action verbs may be used
// (Get started, Try free, See sample, Learn more, Sign up, Decide for yourself).
import type { LucideIcon } from "lucide-react";
import {
  Gauge,
  LayoutGrid,
  LineChart,
  MessagesSquare,
  Newspaper,
  Search,
} from "lucide-react";

export interface Feature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

export const features: readonly Feature[] = [
  {
    icon: Gauge,
    title: "FinSight Score & Verdict",
    body: "A deterministic 1–10 score with a worded verdict — Strong Score, Caution, or Weak Score — for every stock and fund.",
  },
  {
    icon: LayoutGrid,
    title: "Six Insight Cards",
    body: "Score, Volatility, Profit Consistency, Event Sensitivity, SWOT, and Promoter Holdings — at a glance.",
  },
  {
    icon: LineChart,
    title: "Stocks + Mutual Funds",
    body: "One framework for both. Compare a fund against its category and benchmark in seconds.",
  },
  {
    icon: MessagesSquare,
    title: "Ask FinSight Chat",
    body: "A conversational AI grounded in real data. It never makes up numbers.",
  },
  {
    icon: Newspaper,
    title: "News + Sentiment",
    body: "Latest headlines per stock with AI-tagged sentiment, feeding the live score.",
  },
  {
    icon: Search,
    title: "SEO Research Pages",
    body: "A public, indexable page per stock and per fund — research before you sign up.",
  },
] as const;

export interface Persona {
  readonly initials: string;
  readonly name: string;
  readonly age: number;
  readonly role: string;
  readonly pain: string;
}

export const personas: readonly Persona[] = [
  {
    initials: "RS",
    name: "Rahul",
    age: 24,
    role: "First-time investor",
    pain: "Overwhelmed by raw-data platforms — wants one clear answer, not ten charts.",
  },
  {
    initials: "PD",
    name: "Priya",
    age: 34,
    role: "SIP investor",
    pain: "Runs monthly SIPs but cannot tell if her funds still deserve the money.",
  },
  {
    initials: "AK",
    name: "Amit",
    age: 28,
    role: "Active trader",
    pain: "Tracks dozens of tickers and needs a fast, neutral read on each one.",
  },
  {
    initials: "MK",
    name: "Mrs. Kulkarni",
    age: 52,
    role: "Retirement planner",
    pain: "Wants plain-English analysis she can trust without learning finance jargon.",
  },
] as const;

export interface HowItWorksStep {
  readonly step: number;
  readonly title: string;
  readonly body: string;
}

export const howItWorksSteps: readonly HowItWorksStep[] = [
  {
    step: 1,
    title: "Search",
    body: "Type any Indian stock or mutual fund — by name or ticker.",
  },
  {
    step: 2,
    title: "Score",
    body: "Get a deterministic 1–10 score, a worded verdict, and six insight cards in seconds.",
  },
  {
    step: 3,
    title: "Decide for yourself",
    body: "Read the plain-English reasoning and the cited data, then make your own call.",
  },
] as const;

export interface PricingTier {
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  readonly tagline: string;
  readonly features: readonly string[];
  readonly comingSoon: boolean;
}

export const pricingTiers: readonly PricingTier[] = [
  {
    name: "Free",
    price: "₹0",
    cadence: "forever",
    tagline: "Everything you need to start your research.",
    features: [
      "Unlimited stock & fund scores",
      "Six insight cards per report",
      "Ask FinSight chat",
      "Public research pages",
    ],
    comingSoon: false,
  },
  {
    name: "Pro",
    price: "₹—",
    cadence: "per month",
    tagline: "Deeper analysis for active investors.",
    features: [
      "Everything in Free",
      "Priority recompute",
      "Extended history & exports",
      "Saved comparisons",
    ],
    comingSoon: true,
  },
  {
    name: "Premium",
    price: "₹—",
    cadence: "per month",
    tagline: "The full picture for power users.",
    features: [
      "Everything in Pro",
      "Smart alerts",
      "Portfolio sync",
      "Early access to new tools",
    ],
    comingSoon: true,
  },
] as const;

export interface Faq {
  readonly q: string;
  readonly a: string;
}

export const faqs: readonly Faq[] = [
  {
    q: "What is the FinSight Score?",
    a: "A deterministic 1–10 score computed from six weighted pillars (Fundamentals, Valuation, Technical, Sentiment, Risk, Event Sensitivity). The score is data-driven; the AI only writes the explanation.",
  },
  {
    q: "Is this investment advice?",
    a: "No. FinSight AI provides analysis, not advice. We are not a SEBI-registered Research Analyst. Use this to inform your own research and decisions.",
  },
  {
    q: "Where does the data come from?",
    a: "Public sources — NSE, BSE, AMFI, and licensed news feeds. Prices are 15-minute delayed for stocks.",
  },
  {
    q: "Do you cover mutual funds?",
    a: "Yes — every AMFI-listed scheme gets a Fund Score, returns vs benchmark, risk metrics, and peer comparison.",
  },
  {
    q: "How is the AI prevented from making things up?",
    a: "Numbers are computed by deterministic code, then handed to the AI as inputs. The AI only writes narrative prose; every number it mentions is audited before reaching you.",
  },
  {
    q: "Is it free?",
    a: "Yes — core access is free. Pro and Premium tiers are coming soon.",
  },
  {
    q: "When are alerts and portfolio sync coming?",
    a: "Smart alerts and broker portfolio sync are on the roadmap for a future release.",
  },
] as const;
