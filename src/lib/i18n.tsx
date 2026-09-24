import * as React from "react";

export type Lang = "en" | "sw";

const STORAGE_KEY = "soko:lang";

const STRINGS = {
  en: {
    "nav.markets": "Markets",
    "nav.learn": "Learn",
    "nav.signin": "Sign in",
    "nav.startTrading": "Start Trading",
    "nav.appearance": "Appearance",
    "nav.openMenu": "Open menu",
    "nav.closeMenu": "Close menu",
    "nav.language": "Language",
    "tabs.markets": "Markets",
    "tabs.learn": "Learn",
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
  },
  sw: {
    "nav.markets": "Masoko",
    "nav.learn": "Jifunze",
    "nav.signin": "Ingia",
    "nav.startTrading": "Anza Biashara",
    "nav.appearance": "Muonekano",
    "nav.openMenu": "Fungua menyu",
    "nav.closeMenu": "Funga menyu",
    "nav.language": "Lugha",
    "tabs.markets": "Masoko",
    "tabs.learn": "Jifunze",
    "tabs.trade": "Biashara",
    "tabs.portfolio": "Potifolio",
    "tabs.profile": "Wasifu",
    "home.title": "Masoko",
    "home.subtitle":
      "Chagua upande, weka dau lako, na andaa utabiri wako — utaingia tu unaponunua.",
    "home.open": "wazi",
    "card.yes": "Ndiyo",
    "card.no": "Hapana",
    "card.newMarket": "Soko jipya",
    "card.details": "Maelezo",
    "card.vol": "Kiasi",
    "card.ends": "Inaisha",
    "model.label": "Modeli ya Soko",
    "model.pts": "alama",
    "hero.yes": "Ndiyo",
    "hero.chance": "nafasi",
    "hero.closes": "Inafunga",
    "hero.details": "Maelezo ya soko",
    "wallet.title": "Pochi",
    "wallet.subtitle": "Salio, amana za M-Pesa na malipo ya biashara.",
    "wallet.balance": "Salio linalopatikana",
    "wallet.deposit": "Weka",
    "wallet.withdraw": "Toa",
    "wallet.activity": "Shughuli",
    "wallet.inflows": "Mapato",
    "wallet.outflows": "Matumizi",
    "wallet.trades": "Biashara",
    "wallet.realized": "Faida/Hasara",
    "wallet.filterAll": "Zote",
    "wallet.filterTrade": "Biashara",
    "wallet.filterDeposit": "Amana",
    "wallet.filterWithdrawal": "Utoaji",
    "wallet.filterPayout": "Malipo",
    "wallet.loading": "Inapakia…",
    "wallet.noTxns": "Hakuna miamala hapa.",
    "wallet.today": "Leo",
    "wallet.yesterday": "Jana",
    "common.loading": "Inapakia…",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey) => string;
}

const LangContext = React.createContext<LangContextValue | undefined>(undefined);

function initialLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "sw" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(initialLang);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    try {
      document.documentElement.lang = l === "sw" ? "sw" : "en";
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      document.documentElement.lang = lang === "sw" ? "sw" : "en";
    } catch {
      /* ignore */
    }
  }, [lang]);

  const t = React.useCallback(
    (key: StringKey) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key,
    [lang],
  );

  const value = React.useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = React.useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LanguageProvider");
  return ctx;
}

/** Compact EN/SW segmented toggle for the header. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useLang();
  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className={`inline-flex items-center rounded-lg border border-border/60 p-0.5 text-[11px] font-semibold ${className ?? ""}`}
    >
      {(["en", "sw"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-md px-2 py-1 uppercase tracking-wide transition-colors ${
            lang === l
              ? "bg-primary/25 text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {l === "en" ? "EN" : "SW"}
        </button>
      ))}
    </div>
  );
}
