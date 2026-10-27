import { NavLink, Link } from "react-router-dom";
import { useSession } from "../lib/session";

const LINKS = [
  ["/daily", "Daily"],
  ["/dex", "Dex"],
  ["/bounties", "Bounties"],
  ["/trainers", "Trainers"],
  ["/how", "How to play"],
] as const;

export function Nav() {
  const { me, signedIn, signIn, signOut, requireJoin } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-sm">
      {/* phones: logo and account on one row, the links on a second row that scrolls sideways */}
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 px-5">
        <Link to="/" className="flex h-12 items-center font-pixel text-[15px] tracking-wide">
          NEURONAUT
        </Link>
        <nav className="order-last -mx-5 flex w-[calc(100%+2.5rem)] items-center gap-4 overflow-x-auto whitespace-nowrap px-5 pb-2.5 text-[13px] md:order-none md:mx-0 md:w-auto md:p-0">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "text-fg" : "text-dim hover:text-fg")}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex h-12 items-center gap-4 font-mono text-xs">
          {me ? (
            <>
              <span className="hidden text-dim sm:inline" title="Scans left today">
                scans <span className="text-fg">{me.scansLeft}</span>
              </span>
              <span className="hidden text-dim sm:inline" title="Catches left today">
                catches <span className="text-fg">{me.catchesLeft}</span>
              </span>
              <span className="text-dim">
                pts <span className="text-fg">{me.points}</span>
              </span>
              <Link to={`/t/${me.handle}`} className="text-fg hover:underline underline-offset-4">
                {me.handle}
              </Link>
              <button className="text-faint hover:text-fg" onClick={signOut}>
                sign out
              </button>
            </>
          ) : signedIn ? (
            <>
              <button className="text-dim hover:text-fg" onClick={() => requireJoin()}>
                Pick a handle
              </button>
              <button className="text-faint hover:text-fg" onClick={signOut}>sign out</button>
            </>
          ) : (
            <button className="text-dim hover:text-fg" onClick={signIn}>
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
