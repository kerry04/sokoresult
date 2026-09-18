import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Mail, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact & FAQ — SokoResult" },
      { name: "description", content: "Get in touch with SokoResult or read answers to the most common questions about prediction markets, KYC, deposits and withdrawals." },
      { property: "og:title", content: "Contact & FAQ — SokoResult" },
      { property: "og:description", content: "Reach the SokoResult team or browse the FAQ for prediction markets in Kenya." },
    ],
  }),
  component: ContactPage,
});

const SOCIALS = [
  { name: "X (Twitter)", url: "https://x.com/sokoresult" },
  { name: "Facebook", url: "https://facebook.com/sokoresult" },
  { name: "Instagram", url: "https://instagram.com/sokoresult" },
  { name: "TikTok", url: "https://tiktok.com/@sokoresult" },
  { name: "YouTube", url: "https://youtube.com/@sokoresult" },
];

const FAQ = [
  {
    q: "What is a prediction market?",
    a: "A prediction market lets you trade shares on the outcome of a real-world event. Each share pays out KSh 100 if the outcome you back wins, and KSh 0 otherwise. The current price (e.g. KSh 67) reflects the crowd's estimated probability of that outcome happening (67%).",
  },
  {
    q: "Is this gambling?",
    a: "Prediction markets are an information product, not a casino game. You're trading on real events using your own analysis. That said, you can lose money — only trade with funds you can afford to lose.",
  },
  {
    q: "How do I deposit money?",
    a: "Open the Wallet tab, choose Deposit, and pay via M-Pesa using the displayed Paybill number and your account reference. Funds appear in your balance within minutes.",
  },
  {
    q: "How do I withdraw money?",
    a: "Open the Wallet tab and choose Withdraw. We send the funds to the M-Pesa number on your verified profile. Withdrawals are usually processed in under 1 hour during business hours.",
  },
  {
    q: "Why do I need to verify my identity?",
    a: "Kenyan law requires us to verify everyone who deposits or withdraws real money. Verification protects you from account theft and us from fraud. It's a one-time process and takes about 5 minutes.",
  },
  {
    q: "What fees do you charge?",
    a: "There are no commissions on trades. The market maker spread (built into the buy/sell prices) is how the platform earns. Deposits and withdrawals are free.",
  },
  {
    q: "How are markets resolved?",
    a: "Each market lists the official source we use to call the winner (e.g. the IEBC for elections). Our team resolves the market within 48 hours of the event using that source. Payouts hit your wallet automatically.",
  },
  {
    q: "I disagree with a resolution. What do I do?",
    a: "Open a support ticket within 7 days of resolution. Include the market and why you disagree. We'll review the official source and respond within 3 business days.",
  },
  {
    q: "Can I close my account?",
    a: "Yes. Withdraw any balance first, then open a support ticket asking us to close the account. We retain KYC records for 7 years as required by AML rules.",
  },
  {
    q: "How do I report a bug or suggest a feature?",
    a: "Open a support ticket from inside the app and pick 'Bug' or 'Other'. We read every message.",
  },
];

function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="font-bold tracking-tight">SokoResult</Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/learn" className="hover:text-foreground">Learn</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
        <section>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Contact &amp; FAQ</h1>
          <p className="mt-3 text-muted-foreground">
            Need help? Open a ticket inside the app for the fastest reply, or reach us on social.
          </p>

          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            <Link
              to="/support"
              className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition flex items-start gap-3"
            >
              <MessageCircle className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <div className="font-semibold">Open a support ticket</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Sign in and go to Support — we reply within 24 hours.
                </div>
              </div>
            </Link>
            <a
              href="mailto:support@sokoresult.com"
              className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition flex items-start gap-3"
            >
              <Mail className="h-5 w-5 mt-0.5 text-primary" />
              <div>
                <div className="font-semibold">Email us</div>
                <div className="text-xs text-muted-foreground mt-0.5">support@sokoresult.com</div>
              </div>
            </a>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Follow us</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-primary/40 hover:text-foreground text-muted-foreground transition"
              >
                {s.name}
              </a>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="mt-4">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`q-${i}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <div className="pt-6 border-t border-border text-xs text-muted-foreground flex justify-between">
          <Link to="/" className="hover:text-foreground">← Back to home</Link>
          <Link to="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
        </div>
      </main>
    </div>
  );
}
