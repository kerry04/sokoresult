import * as React from "react";

// English-only strings. (The EN/SW language switcher was removed; the app
// ships in English. Keeping the t() indirection so call sites stay uniform.)
const STRINGS = {
  "nav.markets": "Markets",
  "nav.learn": "Learn",
  "nav.wallet": "Wallet",
  "nav.signin": "Sign in",
  "nav.startTrading": "Start Trading",
  "nav.appearance": "Appearance",
  "nav.openMenu": "Open menu",
  "nav.closeMenu": "Close menu",
  "tabs.markets": "Markets",
  "tabs.learn": "Learn",
  "tabs.wallet": "Wallet",
  "tabs.trade": "Trade",
  "tabs.portfolio": "Portfolio",
  "tabs.profile": "Profile",
  "home.title": "Markets",
  "home.subtitle":
    "Pick a side, set your stake, and draft your prediction — you sign in only when you buy.",
  "home.open": "open",
  "card.yes": "Yes",
  "card.no": "No",
  "card.newMarket": "New market",
  "card.details": "Details",
  "card.vol": "Vol",
  "card.ends": "Ends",
  "model.label": "Soko model",
  "model.pts": "pts",
  "hero.yes": "Yes",
  "hero.chance": "chance",
  "hero.closes": "Closes",
  "hero.details": "Market details",
  "wallet.title": "Wallet",
  "wallet.subtitle": "Balance, M-Pesa deposits and trade settlements.",
  "wallet.balance": "Available balance",
  "wallet.deposit": "Deposit",
  "wallet.withdraw": "Withdraw",
  "wallet.activity": "Activity",
  "wallet.inflows": "Inflows",
  "wallet.outflows": "Outflows",
  "wallet.trades": "Trades",
  "wallet.realized": "Realized P&L",
  "wallet.filterAll": "All",
  "wallet.filterTrade": "Trades",
  "wallet.filterDeposit": "Deposits",
  "wallet.filterWithdrawal": "Withdrawals",
  "wallet.filterPayout": "Payouts",
  "wallet.loading": "Loading…",
  "wallet.noTxns": "No transactions in this view.",
  "wallet.today": "Today",
  "wallet.yesterday": "Yesterday",
  "common.loading": "Loading…",
} as const;

export type StringKey = keyof typeof STRINGS;

interface LangContextValue {
  t: (key: StringKey) => string;
}

const LangContext = React.createContext<LangContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Clean up the legacy language preference left by the removed switcher.
  React.useEffect(() => {
    try {
      window.localStorage.removeItem("soko:lang");
      document.documentElement.lang = "en";
    } catch {
      /* ignore */
    }
  }, []);

  const t = React.useCallback(
    (key: StringKey) => STRINGS[key] ?? key,
    [],
  );

  const value = React.useMemo(() => ({ t }), [t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = React.useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LanguageProvider");
  return ctx;
}
