"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CircleCheck,
  ClipboardPaste,
  Code2,
  Mic,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { Reveal } from "@/components/reveal";
import { ProductPreview } from "@/components/marketing/product-preview";
import { CountUp } from "@/components/ui/count-up";

export default function LandingPage() {
  return (
    <div className="relative">
      <MarketingNav />
      <Hero />
      <TrustBar />
      <Features />
      <HowItWorks />
      <Trust />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------- nav --- */

function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-void/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-grad text-white shadow-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-paper">
            Prep&nbsp;Kit
          </span>
        </Link>

        <div className="hidden items-center gap-7 text-sm text-dim md:flex">
          <a href="#features" className="transition hover:text-paper">
            Features
          </a>
          <a href="#how" className="transition hover:text-paper">
            How it works
          </a>
          <a href="#faq" className="transition hover:text-paper">
            FAQ
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden text-sm text-dim transition hover:text-paper sm:block"
          >
            Sign in
          </Link>
          <Link href="/sign-in" className="btn-primary px-3.5 py-2 text-sm">
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

/* ------------------------------------------------------------------ hero --- */

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-2 lg:pt-24">
      <div>
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-dim">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
            </span>
            Built for the exact role you applied for
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Walk in having
            <br />
            already{" "}
            <span className="bg-gradient-to-r from-accent via-accent-hover to-cyan bg-clip-text text-transparent">
              done the interview.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-6 max-w-lg text-lg text-dim">
            Paste the job posting and the company&apos;s site. Get tailored
            questions, a study plan on real dates, spaced-out practice and a full
            mock interview — checked by code before you ever see it.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/sign-in" className="btn-primary px-5 py-3 text-base">
              Build my kit
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="btn-ghost px-5 py-3 text-base">
              See how it works
            </a>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-dim">
            {["No credit card", "Free tier", "Your data stays yours"].map((line) => (
              <li key={line} className="flex items-center gap-1.5">
                <CircleCheck className="h-4 w-4 text-good" />
                {line}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <Reveal delay={200} className="lg:pl-6">
        <ProductPreview />
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------- trust bar --- */

const STATS = [
  { value: 4, suffix: " question types", label: "technical to company-fit" },
  { value: 100, suffix: "% cited", label: "every question traces to a requirement" },
  { value: 0, suffix: " setup", label: "paste a posting and go" },
];

function TrustBar() {
  return (
    <section className="border-y border-line/60 bg-surface/30">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 sm:grid-cols-3">
        {STATS.map((stat, index) => (
          <Reveal key={stat.label} delay={index * 80}>
            <div className="text-center">
              <p className="text-3xl font-semibold tracking-tight text-paper">
                <CountUp value={stat.value} />
                <span className="text-accent">{stat.suffix}</span>
              </p>
              <p className="mt-1 text-sm text-dim">{stat.label}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- features --- */

const FEATURES = [
  {
    icon: Target,
    accent: "text-technical",
    ring: "border-technical/30 bg-technical/10",
    title: "Questions from the posting, not a template",
    body: "Every must-have in the job description becomes a question, and every question cites the requirement it tests. A must-have with no question is reported, never hidden.",
  },
  {
    icon: CalendarClock,
    accent: "text-accent",
    ring: "border-accent/30 bg-accent/10",
    title: "A plan on real dates that recuts itself",
    body: "Tell it when the interview is. Miss two days and it rebuilds around the days that are left — deferring nice-to-haves before must-haves, never showing you a backlog.",
  },
  {
    icon: Mic,
    accent: "text-cyan",
    ring: "border-cyan/30 bg-cyan/10",
    title: "Practise out loud, then a full mock",
    body: "Spaced repetition schedules what is slipping. When you are ready, sit a timed mock interview and answer out loud — because saying it is not the same as knowing it.",
  },
  {
    icon: BookOpenCheck,
    accent: "text-good",
    ring: "border-good/30 bg-good/10",
    title: "Evidence gaps, caught early",
    body: "Record what you have actually done once. Every kit checks its must-haves against your stories and tells you which ones you cannot back up with real experience.",
  },
  {
    icon: Zap,
    accent: "text-pinned",
    ring: "border-pinned/30 bg-pinned/10",
    title: "An honest readiness score",
    body: "One number, and the parts that made it. It stays red until you have actually practised — no score is rounded up to be encouraging.",
  },
  {
    icon: Repeat2,
    accent: "text-edited",
    ring: "border-edited/30 bg-edited/10",
    title: "Your edits survive regeneration",
    body: "Anything you rewrite is marked as yours and kept when you rebuild a section. Rework the wording without losing it, and pin what you never want touched.",
  },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <Reveal>
        <p className="label text-accent">Everything in one kit</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Not another question generator.
          <span className="text-dim"> A preparation system.</span>
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <Reveal key={feature.title} delay={(index % 3) * 80}>
            <div className="card-interactive h-full p-6">
              <span
                className={`grid h-11 w-11 place-items-center rounded-xl border ${feature.ring} ${feature.accent}`}
              >
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-paper">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-dim">
                {feature.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- how it works --- */

const STEPS = [
  {
    icon: ClipboardPaste,
    title: "Paste the posting",
    body: "Drop in the job description and the company's website, and pick the interview date.",
  },
  {
    icon: Sparkles,
    title: "It builds your kit",
    body: "It reads the role, researches the company from its own pages, and writes questions, flashcards and a dated plan — checking coverage before it shows you anything.",
  },
  {
    icon: Target,
    title: "Practise until ready",
    body: "Work the plan, answer out loud, close your evidence gaps, and watch the readiness score climb honestly toward the day.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-line/60 bg-surface/30">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <p className="label text-cyan">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            From posting to prepared in three steps.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 100}>
              <div className="relative h-full">
                <div className="card h-full p-6">
                  <span className="text-5xl font-light tabular-nums text-line-strong">
                    {index + 1}
                  </span>
                  <span className="mt-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-paper">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-dim">
                    {step.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- trust --- */

function Trust() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="card overflow-hidden bg-hero-grad p-8 sm:p-12">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <Reveal>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-good/15 text-good">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">
              Deterministic where it matters.
            </h2>
            <p className="mt-4 max-w-md text-dim">
              The model writes the questions. Code decides the schedule, checks
              the coverage, scores your readiness and keeps your edits — the
              things you cannot afford a model to get quietly wrong. Every claim
              on your kit is one it can back up.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <ul className="space-y-3">
              {[
                "Coverage checked by code, not claimed by a model",
                "The same kit always schedules the same way",
                "Only the company's own site is read, and only what robots.txt allows",
                "Untrusted page text can never become an instruction",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 rounded-xl border border-line bg-surface/60 p-3.5"
                >
                  <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-good" />
                  <span className="text-sm text-paper">{line}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- faq --- */

const FAQS = [
  {
    q: "Do I need to configure anything?",
    a: "No. Paste a job posting and the company's website, pick a date, and it builds the whole kit — questions, flashcards, a plan, and practice — on its own.",
  },
  {
    q: "Where do the company facts come from?",
    a: "Only the company's own website, and only the pages its robots.txt permits. Every fact on the brief links to the page it came from, so you can check it.",
  },
  {
    q: "What happens if I fall behind the plan?",
    a: "Nothing breaks. The plan recomputes around the days you have left rather than showing you a backlog, and it defers nice-to-have material before must-haves.",
  },
  {
    q: "Will regenerating a section lose my edits?",
    a: "No. Anything you change is marked as yours and kept through a rebuild. You can also pin an item so nothing ever replaces it.",
  },
  {
    q: "Is my data private?",
    a: "Your kits and your story bank are yours. The story bank never leaves your account, and nothing is shared or made public.",
  },
];

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
      <Reveal>
        <p className="label text-accent">Questions</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Answers, before you ask.
        </h2>
      </Reveal>

      <div className="mt-10 space-y-3">
        {FAQS.map((faq, index) => (
          <Reveal key={faq.q} delay={index * 60}>
            <details className="group card p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-paper">
                {faq.q}
                <span className="text-faint transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-dim">{faq.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- final cta --- */

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24">
      <Reveal>
        <div className="card relative overflow-hidden bg-hero-grad p-10 text-center sm:p-16">
          <div className="absolute -top-24 left-1/2 -z-0 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
              Your next interview is a date.
              <br />
              <span className="bg-gradient-to-r from-accent to-cyan bg-clip-text text-transparent">
                Start the countdown.
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-dim">
              Build your first kit in under a minute. No card, no setup — just the
              role you are chasing.
            </p>
            <Link
              href="/sign-in"
              className="btn-primary mx-auto mt-8 w-fit px-6 py-3.5 text-base"
            >
              Build my kit
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------- footer --- */

function Footer() {
  return (
    <footer className="border-t border-line/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-faint">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-accent-grad text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          Interview Prep Kit
        </div>
        <p className="text-xs text-faint">
          Built to prepare you, not to impress you.
        </p>
        <a
          href="https://github.com"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 text-sm text-faint transition hover:text-paper"
        >
          <Code2 className="h-4 w-4" />
          Source
        </a>
      </div>
    </footer>
  );
}
