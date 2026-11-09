// The settings window (M3 L4a; design A "Index", DECISIONS.md 2026-11-08): a rail of sections, one shown at a time.
// L4a: the companion section and Reset appearance; the themes section's previews come in L4b. Every word comes from
// docs/COPY.md (missing ones show [NEEDS COPY]). It never changes the appearance itself: it asks the player window,
// which owns it, and shows what the player reports back (src/settings/bridge.ts).
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { dress } from "../companion/accessory";
import { SKINS } from "../companion/registry";
import { Sprite } from "../companion/Sprite";
import { accessoryName, copy, paletteName, skinName } from "../copy";
import { APPEARANCE_STORAGE_KEY, pickCompanion, type CompanionSetting } from "../theme/appearance";
import { MENU_ICON_SKIN } from "../window/companionIcon";
import { companionPickerEntries, type PickerPicture } from "../window/themeMenu";
import { askCompanion, askReset, followPlayer, parseView, type SettingsView } from "./bridge";

type Section = "themes" | "companion";
const SECTIONS: readonly { id: Section; label: () => string }[] = [
  { id: "themes", label: () => copy("settingsThemes") },
  { id: "companion", label: () => copy("settingsCompanion") },
];

/** What the player last saved (the windows share storage): shown until the player answers. */
function lastSaved(): SettingsView {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return parseView(raw ? JSON.parse(raw) : null);
  } catch {
    return parseView(null);
  }
}

/** A creature, dressed, in a palette, awake or asleep: one still frame, 4 px per art pixel. */
function Creature({ skin, palette, accessory, awake = true }: { skin: string; palette: string; accessory: string | null; awake?: boolean }) {
  const dressed = useMemo(() => dress(SKINS[skin], accessory), [skin, accessory]);
  return <Sprite skin={dressed} animation={awake ? "idle" : "sleep"} frame={0} palette={palette} pixel={4} />;
}

function PictureRow({ pictures, name, onPick }: { pictures: PickerPicture[]; name: (p: PickerPicture) => string; onPick: (p: PickerPicture) => void }) {
  return (
    <div className="st-row">
      {pictures.map((p) => (
        <button
          key={`${p.skin}/${p.palette}/${p.accessory ?? ""}`}
          type="button"
          className="st-pic"
          aria-pressed={p.awake}
          aria-label={name(p)}
          onClick={() => onPick(p)}
        >
          <Creature skin={p.skin} palette={p.palette} accessory={p.accessory} />
        </button>
      ))}
    </div>
  );
}

/** On/off (the menu's awake and asleep cassette), then every species, the current one's palettes, what it can wear. */
function CompanionSection({ companion }: { companion: CompanionSetting }) {
  const { species, palettes, accessories } = companionPickerEntries(companion);
  // Picking any picture means wanting to see it: it turns the companion on, like the menu (pickCompanion).
  const pick = (p: PickerPicture) => void askCompanion(pickCompanion(companion, p.skin, p.palette, p.accessory));
  return (
    <>
      <h1 className="st-heading">{copy("settingsCompanion")}</h1>
      <div className="st-rows">
        <button
          type="button"
          role="switch"
          className="st-switch"
          aria-checked={companion.on}
          aria-label={copy("settingsCompanionToggle")}
          onClick={() => void askCompanion({ ...companion, on: !companion.on })}
        >
          <span className="st-pic is-on">
            <Creature skin={MENU_ICON_SKIN} palette="default" accessory={null} />
          </span>
          <span className="st-pic is-off">
            <Creature skin={MENU_ICON_SKIN} palette="default" accessory={null} awake={false} />
          </span>
        </button>
        <PictureRow pictures={species} name={(p) => skinName(p.skin)} onPick={pick} />
        <PictureRow pictures={palettes} name={(p) => paletteName(p.skin, p.palette)} onPick={pick} />
        {accessories.length > 0 && <PictureRow pictures={accessories} name={(p) => accessoryName(p.accessory)} onPick={pick} />}
      </div>
    </>
  );
}

/** L4a: the heading and Reset appearance; the theme previews arrive in L4b. */
function ThemesSection({ onReset }: { onReset: () => void }) {
  return (
    <>
      <h1 className="st-heading">{copy("settingsThemes")}</h1>
      <div className="st-foot">
        <button type="button" className="st-btn st-danger" onClick={onReset}>
          {copy("settingsReset")}
        </button>
      </div>
    </>
  );
}

export function SettingsApp() {
  const [view, setView] = useState(lastSaved);
  const [section, setSection] = useState<Section>("themes");
  const tabs = useRef(new Map<Section, HTMLButtonElement>());
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => followPlayer(setView), []);

  // A vertical tab list: arrows move between sections (and show them), Home and End jump to the ends.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SECTIONS.findIndex((s) => s.id === section);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: SECTIONS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = SECTIONS[(to + SECTIONS.length) % SECTIONS.length].id;
    setSection(next);
    tabs.current.get(next)?.focus();
  };

  return (
    <div className="st-root">
      <div className="st-rail" role="tablist" aria-orientation="vertical">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            ref={(el) => void (el ? tabs.current.set(s.id, el) : tabs.current.delete(s.id))}
            type="button"
            role="tab"
            id={`st-tab-${s.id}`}
            className="st-tab"
            aria-selected={section === s.id}
            aria-controls={`st-panel-${s.id}`}
            tabIndex={section === s.id ? 0 : -1}
            onClick={() => setSection(s.id)}
            onKeyDown={onTabKey}
          >
            {s.label()}
          </button>
        ))}
      </div>
      <section className="st-main" role="tabpanel" id={`st-panel-${section}`} aria-labelledby={`st-tab-${section}`}>
        {section === "themes" ? <ThemesSection onReset={() => dialog.current?.showModal()} /> : <CompanionSection companion={view.companion} />}
      </section>
      <dialog className="st-dialog" ref={dialog} aria-labelledby="st-reset-question">
        <p className="st-question" id="st-reset-question">
          {copy("settingsResetQuestion")}
        </p>
        <div className="st-actions">
          <button type="button" className="st-btn" autoFocus onClick={() => dialog.current?.close()}>
            {copy("settingsResetCancel")}
          </button>
          <button
            type="button"
            className="st-btn st-danger"
            onClick={() => {
              void askReset();
              dialog.current?.close();
            }}
          >
            {copy("settingsResetConfirm")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
