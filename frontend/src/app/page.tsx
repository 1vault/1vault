import CallToAction from "@/components/landing/CallToAction";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import LandingBackground from "@/components/landing/LandingBackground";
import SiteFooter from "@/components/landing/SiteFooter";
import SiteHeader from "@/components/landing/SiteHeader";
import VaultRules from "@/components/landing/VaultRules";
import LiquidGlassInit from "@/components/liquid/LiquidGlassInit";

/*
 * liquidGL appends its shared canvas to <body> as position: fixed with
 * z-index 19 (highest lens z-index minus one). Nothing between <body> and a
 * glass pane may create a stacking context, otherwise the canvas paints over
 * the panes. So sections carry no z-index and the background sits at -z-10
 * instead: a positioned z-index 0 background would paint over the in-flow
 * section content, which is never positioned.
 */
export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col">
      <LandingBackground />

      <SiteHeader />

      <main className="flex flex-1 flex-col">
        <Hero />
        <HowItWorks />
        <VaultRules />
        <CallToAction />
      </main>

      <SiteFooter />

      <LiquidGlassInit />
    </div>
  );
}
