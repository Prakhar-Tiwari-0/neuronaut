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
      <div className="mx-auto flex h-12 max-w-[1180px] items-center gap-6 px-5">
        <Link to="/" className="font-pixel text-[15px] tracking-wide">
          NEURONAUT
        </Link>
        <nav className="flex items-center gap-4 text-[13px]">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "text-fg" : "text-dim hover:text-fg")}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4 font-mono text-xs">
          {me ? (
            <>
              <span className="text-dim" title="Scans left today">
                scans <span className="text-fg">{me.scansLeft}</span>
              </span>
              <span className="text-dim" title="Catches left today">
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
            <button className="text-dim hover:text-fg" onClick={() => requireJoin()}>
              Pick a handle
            </button>
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
