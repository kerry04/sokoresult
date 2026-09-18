# Trading rebuild: shares-based input + live price impact + responsive fixes

## 1. Buy/Sell by SHARE QUANTITY (not KSh amount)

Replace the "How much to invest?" KSh input with a "How many shares?" stepper input on both panels.

**Buy panel** (`src/routes/_authed/markets.$slug.tsx` + `CandidateList.tsx`):
- Input field: integer share count (1, 5, 10, 25, 50, 100 quick presets + custom)
- Display, in plain language:
  - "Price per share: KSh 46"
  - "Shares to buy: 10"
  - "Total cost: KSh 460" (+ tiny "incl. 3% fee" line)
  - "If you win: KSh 1,000  (+KSh 540 profit)"
  - "If you lose: −KSh 460"
- Disable if balance insufficient; show "Need KSh X more"

**Sell panel** (`SellPanel.tsx`):
- Already share-based — keep as is, just align styling/sizing

## 2. Live price impact (probability moves with trades)

Modify the linear pricing engine so each trade nudges the probability:
- BUY of N shares of outcome X → price of X rises by `N × k` (capped at 95%), other side falls
- SELL of N shares → price of X falls by `N × k` (floored at 5%)
- Tunable `linear_impact_k` already in `system_settings` (currently 0.0008). Bump default to `0.002` so a 10-share buy moves price ~2 percentage points — visible but not wild
- Migration: update `execute_lmsr_trade_binary` and `execute_lmsr_trade_multi` to apply impact, write the new price to `markets.yes_price` / `market_outcomes.price`, and append a row to `price_history` / `outcome_price_history` so the existing chart shows movement

Result: probability genuinely changes over time as users trade. Chart on the market page already plots `price_history`, so it will animate.

## 3. Responsive sizing fixes (current viewport 761×625 looks cramped)

Audit and tighten on the market detail page + cards:
- `markets.$slug.tsx`: replace fixed paddings (p-5, text-lg) with responsive (`p-3 sm:p-5`, `text-base sm:text-lg`); ensure two-column grid collapses to single column below `lg`
- `CandidateList.tsx`: outcome rows wrap properly, KSh totals don't overflow
- `SellPanel.tsx`: 3-col preset grid → 2-col on narrow widths; large sell button height clamped
- Buy/Sell preview boxes: use `min-w-0` + `truncate` on mono numbers so they don't push layout
- Top bar / hero: question text uses `text-xl sm:text-2xl lg:text-3xl` with `break-words`
- Tabs (Buy/Sell): full-width on mobile, fixed pill on desktop
- Charts: set explicit max-height and `width:100%` so they don't overflow
- Test by mentally checking 360, 414, 768, 1024 widths

## 4. Comments — per-market, not clustered

Verified: comments are already filtered by `market_id`, so "clustered" is a presentation issue. Fixes in `markets.$slug.tsx` `CommentsSection`:
- Each comment in its own bordered card (`rounded-xl border bg-card p-3`) with avatar + display name + timestamp on top row, body below
- Vertical spacing `space-y-3` between comments instead of tight stacking
- Add empty divider between user input and comment list
- Show "X comments on this market" header so it's clearly scoped to this market
- Long bodies use `whitespace-pre-wrap break-words`

## Technical section (engineer-only)

**Files changed:**
- `supabase/migrations/<new>.sql` — update `execute_lmsr_trade_binary`, `execute_lmsr_trade_multi` to apply price impact + insert into price history; bump `linear_impact_k` setting
- `src/routes/_authed/markets.$slug.tsx` — buy panel rewrite (shares input), responsive classes, comments restyle
- `src/components/markets/CandidateList.tsx` — shares input, responsive
- `src/components/markets/SellPanel.tsx` — responsive polish only
- `src/lib/market-actions.ts` — drop `previewBuyByAmount`, add `previewBuyByShares(shares, price)`; trivial pure-math wrappers

**Not changed:** auth, RLS, resolution/payout flow, LMSR audit log tables.

**Success criteria:**
- User picks "10 shares" at 46% → cost shown = KSh 460 + KSh 13.80 fee, max payout KSh 1,000
- After trade executes, market's YES price visibly moves (e.g. 46% → 48%) and chart shows the new point
- No horizontal scroll at 360px width on market detail page
- Each comment renders in its own card with clear separation