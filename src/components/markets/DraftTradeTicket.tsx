import { TradingTicket, type TicketMarket } from "./TradingTicket";

/**
 * Backwards-compatible alias — ProductMarketCard still imports this name.
 * New code should use TradingTicket directly.
 */
export function DraftTradeTicket({
  market,
  variant = "card",
}: {
  market: TicketMarket;
  variant?: "card" | "wide";
}) {
  return <TradingTicket market={market} variant={variant} />;
}

export type { TicketMarket };
