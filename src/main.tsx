import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { Nav } from "./components/Nav";
import { SessionProvider } from "./lib/session";
import { useIsDark } from "./lib/theme";
import { Home } from "./pages/Home";

// Every page but the home page loads on first visit, so the first paint ships only the shell and Home.
const Daily = lazy(() => import("./pages/Daily").then((m) => ({ default: m.Daily })));
const Dex = lazy(() => import("./pages/Dex").then((m) => ({ default: m.Dex })));
const Neuron = lazy(() => import("./pages/Neuron").then((m) => ({ default: m.Neuron })));
const Bounties = lazy(() => import("./pages/Bounties").then((m) => ({ default: m.Bounties })));
const Bounty = lazy(() => import("./pages/Bounties").then((m) => ({ default: m.Bounty })));
const Trainers = lazy(() => import("./pages/Trainers").then((m) => ({ default: m.Trainers })));
const Trainer = lazy(() => import("./pages/Trainers").then((m) => ({ default: m.Trainer })));
const How = lazy(() => import("./pages/How").then((m) => ({ default: m.How })));

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

// Clerk's sign-in modal in the site's colors, following the theme.
function Clerk({ children }: { children: ReactNode }) {
  const dark = useIsDark();
  const appearance = {
    variables: dark
      ? {
          colorBackground: "#0a0a0a",
          colorText: "#fff",
          colorPrimary: "#fff",
          colorTextOnPrimaryBackground: "#000",
          colorInputBackground: "#000",
          colorInputText: "#fff",
          borderRadius: "0.75rem",
        }
      : {
          colorBackground: "#fff",
          colorText: "#16130f",
          colorPrimary: "#16130f",
          colorTextOnPrimaryBackground: "#fff",
          colorInputBackground: "#fff",
          colorInputText: "#16130f",
          borderRadius: "0.75rem",
        },
  };
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} appearance={appearance}>
      {children}
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Clerk>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <BrowserRouter>
          <SessionProvider>
            <Nav />
            <main className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
              <Suspense fallback={<div className="py-20 text-center text-dim">Loading…</div>}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/daily" element={<Daily />} />
                  <Route path="/dex" element={<Dex />} />
                  <Route path="/n/:layer/:n" element={<Neuron />} />
                  <Route path="/bounties" element={<Bounties />} />
                  <Route path="/b/:slug" element={<Bounty />} />
                  <Route path="/trainers" element={<Trainers />} />
                  <Route path="/t/:handle" element={<Trainer />} />
                  <Route path="/how" element={<How />} />
                  <Route path="*" element={<div className="py-20 text-center text-dim">Nothing here.</div>} />
                </Routes>
              </Suspense>
            </main>
            <footer className="mx-auto max-w-[1120px] border-t border-line px-4 py-6 text-sm text-dim sm:px-6">
              Built on{" "}
              <a
                href="https://github.com/lyramakesmusic/neuron-explorer"
                className="font-medium text-fg underline underline-offset-4"
              >
                neuron-explorer
              </a>{" "}
              by lyramakesmusic.
            </footer>
          </SessionProvider>
        </BrowserRouter>
      </ConvexProviderWithClerk>
    </Clerk>
  </StrictMode>,
);
