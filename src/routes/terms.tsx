import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — SokoResult" },
      { name: "description", content: "SokoResult terms of service: eligibility, KYC, deposits, trading rules, withdrawals, dispute resolution and risk disclosure." },
      { property: "og:title", content: "Terms & Conditions — SokoResult" },
      { property: "og:description", content: "Read the SokoResult terms before trading on Kenya's prediction market." },
    ],
  }),
  component: TermsPage,
});

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="font-bold tracking-tight">SokoResult</Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/learn" className="hover:text-foreground">Learn</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Terms &amp; Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: April 2026. Please read these terms carefully before using SokoResult.
        </p>

        <div className="mt-6 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <strong>Risk disclosure:</strong> SokoResult is a real-money prediction market. You can lose
          some or all of the funds you deposit. Only trade with money you can afford to lose.
        </div>

        <nav className="mt-8 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Contents</div>
          <ol className="grid sm:grid-cols-2 gap-y-1 list-decimal list-inside text-foreground/90">
            <li><a href="#eligibility" className="hover:underline">Eligibility</a></li>
            <li><a href="#account" className="hover:underline">Your account</a></li>
            <li><a href="#kyc" className="hover:underline">Identity verification</a></li>
            <li><a href="#deposits" className="hover:underline">Deposits &amp; balances</a></li>
            <li><a href="#trading" className="hover:underline">Trading rules</a></li>
            <li><a href="#resolution" className="hover:underline">Market resolution</a></li>
            <li><a href="#withdrawals" className="hover:underline">Withdrawals</a></li>
            <li><a href="#prohibited" className="hover:underline">Prohibited conduct</a></li>
            <li><a href="#disputes" className="hover:underline">Disputes</a></li>
            <li><a href="#privacy" className="hover:underline">Privacy</a></li>
            <li><a href="#changes" className="hover:underline">Changes to these terms</a></li>
            <li><a href="#contact" className="hover:underline">Contact</a></li>
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          <Section id="eligibility" title="1. Eligibility">
            <p>You must be at least 18 years old and a resident of Kenya (or another jurisdiction where prediction markets are lawful) to use SokoResult. By creating an account you confirm that you meet these requirements.</p>
            <p>SokoResult is not available to politically-exposed persons subject to active sanctions, or to anyone barred from financial services by Kenyan law.</p>
          </Section>

          <Section id="account" title="2. Your account">
            <p>You are responsible for keeping your login credentials confidential. Do not share your account, and notify us immediately if you suspect unauthorised access. One person, one account.</p>
          </Section>

          <Section id="kyc" title="3. Identity verification (KYC)">
            <p>Before placing your first trade you must verify your identity by submitting a valid government-issued ID and a selfie. We use this information solely for compliance, fraud prevention and payout safety.</p>
            <p>We may request additional documents (e.g. proof of address) for higher withdrawal tiers.</p>
          </Section>

          <Section id="deposits" title="4. Deposits & balances">
            <p>All balances on SokoResult are denominated in Kenyan Shillings (KES). Deposits are processed via M-Pesa and other supported channels. Funds are held in a segregated client account and never used for SokoResult operations.</p>
            <p>Minimum deposit: KSh 100. We do not pay interest on idle balances.</p>
          </Section>

          <Section id="trading" title="5. Trading rules">
            <p>Each share you buy in a market pays out KSh 100 if the outcome you backed is the official winner, and KSh 0 otherwise. Prices reflect the crowd's estimated probability and move automatically as users trade (LMSR market maker).</p>
            <p>You may not place trades intended to manipulate prices, collude with other users, or exploit technical glitches. We reserve the right to cancel trades and refund users if we detect manipulation.</p>
          </Section>

          <Section id="resolution" title="6. Market resolution">
            <p>Each market lists the official source used to determine the winning outcome. Markets are resolved by the SokoResult operations team based on that source within 48 hours of the event ending.</p>
            <p>If the outcome is genuinely ambiguous, we may extend the resolution window or refund all positions at their pre-event price.</p>
          </Section>

          <Section id="withdrawals" title="7. Withdrawals">
            <p>Verified users may withdraw their KES balance to the M-Pesa number on file at any time. Standard processing time is under 1 hour during business hours; up to 24 hours otherwise.</p>
            <p>Maximum daily withdrawal depends on your verification tier. Contact support to upgrade.</p>
          </Section>

          <Section id="prohibited" title="8. Prohibited conduct">
            <ul className="list-disc list-inside space-y-1">
              <li>Creating multiple accounts to abuse promotions or limits</li>
              <li>Using SokoResult for money laundering or to evade sanctions</li>
              <li>Automated trading without prior written permission</li>
              <li>Insider trading on markets where you have non-public information about the outcome</li>
              <li>Harassing other users or the support team</li>
            </ul>
          </Section>

          <Section id="disputes" title="9. Disputes">
            <p>If you disagree with a market resolution, open a support ticket within 7 days. Our team will review the official source and respond within 3 business days. If you remain unsatisfied, you may escalate to a Kenyan court with jurisdiction in Nairobi.</p>
          </Section>

          <Section id="privacy" title="10. Privacy">
            <p>We collect only the data needed to run your account, comply with regulators and prevent fraud. We never sell your data. See our privacy notice (in the Contact page) for the full details.</p>
          </Section>

          <Section id="changes" title="11. Changes to these terms">
            <p>We may update these terms from time to time. Material changes will be announced by email and an in-app notice at least 14 days before they take effect. Continued use of SokoResult after the effective date means you accept the updated terms.</p>
          </Section>

          <Section id="contact" title="12. Contact">
            <p>
              Questions? Visit our <Link to="/contact" className="underline text-foreground">Contact &amp; FAQ</Link> page
              or open a ticket from the <Link to="/support" className="underline text-foreground">Support</Link> tab inside the app.
            </p>
          </Section>
        </div>

        <div className="mt-14 pt-6 border-t border-border text-xs text-muted-foreground flex justify-between">
          <Link to="/" className="hover:text-foreground">← Back to home</Link>
          <span>SokoResult Ltd · Nairobi, Kenya</span>
        </div>
      </main>
    </div>
  );
}
