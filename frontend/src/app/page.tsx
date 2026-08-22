import { BuildSection } from "@/components/landing/BuildSection";
import { Ecosystem } from "@/components/landing/Ecosystem";
import { Features } from "@/components/landing/Features";
import { GettingStarted } from "@/components/landing/GettingStarted";
import { Hero } from "@/components/landing/Hero";
import { News } from "@/components/landing/News";
import { PrincipleBand } from "@/components/landing/PrincipleBand";
import { RevealObserver } from "@/components/landing/Reveal";
import { Roadmap } from "@/components/landing/Roadmap";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { Stats } from "@/components/landing/Stats";
import { Whitelist } from "@/components/landing/Whitelist";

export default function Home() {
  return (
    <>
      <RevealObserver />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Stats />
        <Features />
        <PrincipleBand />
        <BuildSection />
        <Ecosystem />
        <GettingStarted />
        <Whitelist />
        <News />
        <Roadmap />
      </main>
      <SiteFooter />
    </>
  );
}
