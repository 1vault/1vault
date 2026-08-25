import { defineConfig } from "vitepress";

export default defineConfig({
  title: "1Vault Docs",
  description: "Capital in Motion - pooled Solana trading vaults. Park. They trade. You ride.",
  lang: "en-US",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  appearance: "force-dark",

  head: [
    [
      "meta",
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
    ],
    ["meta", { name: "theme-color", content: "#093C5D" }],
    ["meta", { name: "mobile-web-app-capable", content: "yes" }],
    ["meta", { property: "og:title", content: "1Vault Docs" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Same vault. Strategist signs. Vault pays. Close by share weight.",
      },
    ],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    [
      "link",
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  ],

  themeConfig: {
    logo: "/img/1vault-logo.png",
    siteTitle: false,
    nav: [
      { text: "Guide", link: "/" },
      { text: "Extension", link: "/extension/install" },
      { text: "Investor", link: "/investor/park-into-vault" },
      { text: "Reference", link: "/reference/glossary" },
    ],

    sidebar: [
      {
        text: "Guide",
        collapsed: false,
        items: [
          { text: "Introduction", link: "/" },
          { text: "Quick start", link: "/guide/quick-start" },
          { text: "What is 1Vault", link: "/guide/what-is-1vault" },
          { text: "Roles", link: "/guide/roles" },
          { text: "Concepts", link: "/guide/concepts" },
          { text: "Fees", link: "/guide/fees" },
          { text: "$1VAULTS licence", link: "/guide/license-1vaults" },
          { text: "Safety & custody", link: "/guide/safety-and-custody" },
        ],
      },
      {
        text: "Extension",
        collapsed: false,
        items: [
          { text: "Install", link: "/extension/install" },
          { text: "Wallet & keyring", link: "/extension/wallet-keyring" },
          { text: "Connect X", link: "/extension/connect-x" },
          { text: "Home & Discover", link: "/extension/home-and-discover" },
          { text: "Capital pipeline", link: "/extension/capital-pipeline" },
          { text: "Vault detail", link: "/extension/vault-detail" },
          { text: "Create vault & lock $1VAULTS", link: "/extension/create-vault-and-lock" },
          { text: "Park SOL", link: "/extension/park-and-capital" },
          { text: "Trade & positions", link: "/extension/trade-and-positions" },
          { text: "Instant trade terminals", link: "/extension/instant-trade-terminals" },
          { text: "Claim fees", link: "/extension/claim-fees" },
          { text: "Close vault & unlock", link: "/extension/close-vault-and-unlock" },
          { text: "Troubleshooting", link: "/extension/troubleshooting" },
        ],
      },
      {
        text: "Investor",
        collapsed: false,
        items: [
          { text: "Park into a vault", link: "/investor/park-into-vault" },
          { text: "Take profit & stop loss", link: "/investor/tp-sl" },
          { text: "Withdraw", link: "/investor/withdraw" },
        ],
      },
      {
        text: "Reference",
        collapsed: false,
        items: [
          { text: "Glossary", link: "/reference/glossary" },
          { text: "FAQ", link: "/reference/faq" },
        ],
      },
    ],

    search: {
      provider: "local",
    },

    socialLinks: [],

    // Sidebar sticky community buttons (edit when URLs go live)
    sidebarLinks: {
      x: "https://x.com/1vaults",
      whitepaper: "#",
      telegram: "#",
    },

    footer: {
      message: "Capital in Motion / Non-custodial pooled vaults on Solana",
      copyright: "1Vault",
    },

    outline: {
      level: [2, 3],
      label: "On this page",
    },

    docFooter: {
      prev: "Previous",
      next: "Next",
    },
  },
});
