import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { Nav } from "./components/Nav";
import { SessionProvider } from "./lib/session";
import { Bounties, Bounty } from "./pages/Bounties";
import { Daily } from "./pages/Daily";
import { Dex } from "./pages/Dex";
import { Home } from "./pages/Home";
import { How } from "./pages/How";
import { Neuron } from "./pages/Neuron";
import { Trainer, Trainers } from "./pages/Trainers";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <SessionProvider>
          <Nav />
          <main className="mx-auto max-w-[1180px] px-5 py-10">
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
          </main>
          <footer className="mx-auto max-w-[1180px] border-t border-line px-5 py-6 font-mono text-[11px] text-faint">
            Built on{" "}
            <a href="https://github.com/lyramakesmusic/neuron-explorer" className="text-dim hover:text-fg">
              neuron-explorer
            </a>{" "}
            by lyramakesmusic.
          </footer>
        </SessionProvider>
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);
