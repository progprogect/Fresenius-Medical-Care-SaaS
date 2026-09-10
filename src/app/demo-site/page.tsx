import type { Metadata } from "next";
import Script from "next/script";
import { HeartPulse, MapPin, ShieldCheck, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Fresenius Medical Care — Demo Website",
  description: "Sample Fresenius Medical Care website demonstrating the embedded AI assistant widget",
};

/**
 * A sample Fresenius Medical Care website used to demonstrate how the widget
 * embeds into the customer's site with a single script tag.
 */
export default function DemoSitePage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2 font-semibold">
            <HeartPulse className="size-5 text-teal-600" />
            Fresenius Medical Care
          </div>
          <nav className="hidden gap-6 text-sm text-neutral-600 sm:flex">
            <span>Treatments</span>
            <span>Doctors</span>
            <span>Locations</span>
            <span>Contact</span>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <p className="mb-3 text-sm font-medium uppercase tracking-wide text-teal-600">
          Demo website — widget showcase
        </p>
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight">
          Kidney care that fits your life
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-neutral-600">
          Book a consultation, move your dialysis session or ask about our clinics — our AI assistant
          in the corner handles it in seconds, by chat or by voice.
        </p>
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-700">
          Try the assistant in the bottom-right corner →
        </div>
      </section>

      <section className="border-t bg-neutral-50 py-14">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 sm:grid-cols-3">
          {[
            { icon: Clock, title: "Book in under a minute", text: "The assistant finds the nearest available slot for your treatment and books it while you chat." },
            { icon: MapPin, title: "Clinics across Europe", text: "Berlin, Munich, Paris, Madrid, Milan, Warsaw — pick the location that suits you." },
            { icon: ShieldCheck, title: "Your data is protected", text: "Identity verification before any appointment details are shared or changed." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-white p-6">
              <f.icon className="mb-3 size-6 text-teal-600" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-neutral-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-xs text-neutral-400">
        Demo website for the Fresenius Medical Care AI assistant pilot. The widget is embedded with one script tag.
      </footer>

      <Script src="/embed.js" strategy="afterInteractive" />
    </div>
  );
}
