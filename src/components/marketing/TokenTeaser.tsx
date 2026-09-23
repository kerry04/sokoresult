import { Percent, PlusCircle, Vote } from "lucide-react";
import okoCoin from "@/assets/oko-coin.png";

/**
 * $OKO utility token teaser. Framed as future/planned — trading today works in KES.
 */
export function TokenTeaser() {
  const perks = [
    {
      icon: Percent,
      t: "Fee discounts",
      d: "Pay trading fees in $OKO and keep more of your profits.",
    },
    {
      icon: PlusCircle,
      t: "Create markets",
      d: "Stake $OKO to propose and launch your own prediction markets.",
    },
    {
      icon: Vote,
      t: "Governance",
      d: "Vote on categories, fees, and protocol upgrades.",
      planned: true,
    },
  ];
  return (
    <section aria-labelledby="token-heading" className="border-t border-border/60">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            $OKO Token
          </p>
          <h2 id="token-heading" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Own a piece of the market
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            The $OKO utility token powers the SokoResult ecosystem. Token launch details will be
            announced — trading today works in KES.
          </p>
          <ul className="mt-6 space-y-4">
            {perks.map((p) => {
              const Icon = p.icon;
              return (
                <li key={p.t} className="flex gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-success">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <div className="flex items-center gap-2 text-[15px] font-semibold">
                      {p.t}
                      {p.planned && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Planned
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.d}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex justify-center lg:justify-end">
          <img
            src={okoCoin}
            alt="$OKO token"
            className="w-52 sm:w-64"
            draggable={false}
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
