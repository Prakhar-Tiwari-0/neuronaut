import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { NOTES, useNotes } from "../lib/notes";

// The notebook: every field note, the unlocked ones readable, the rest showing how to find them.
export function Notes() {
  const { seen } = useNotes();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);
  return (
    <div className="mx-auto max-w-[720px] space-y-8">
      <div>
        <h1 className="font-pixel text-4xl">FIELD NOTES</h1>
        <div className="mt-1 text-dim">
          {seen.length} of {NOTES.length} found. Each one unlocks the first time the game shows it to you.
        </div>
      </div>
      <div className="space-y-4">
        {NOTES.map((note) => {
          const open = seen.includes(note.id);
          return (
            <article
              key={note.id}
              id={note.id}
              className={`scroll-mt-24 rounded-2xl p-6 ${open ? "border border-line bg-card" : "border-2 border-dashed border-line-strong"}`}
            >
              <h2 className={`text-xl font-semibold ${open ? "" : "text-faint"}`}>{open ? note.title : "Not found yet"}</h2>
              {open ? (
                <div className="mt-3 space-y-3 text-[17px] leading-relaxed">
                  {note.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-dim">{note.unlock}</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
