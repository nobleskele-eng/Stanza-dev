import { useEffect, useRef, type ElementType } from "react";
import { animate, stagger } from "animejs";
import { splitText } from "animejs/text";
import type { ArtPalette } from "../theme/palette";
import { FLAP_GEOMETRY, SplitFlapText, flapKindOf } from "./SplitFlapText";
import { isFlapSafe } from "./flap";
import { ART_FILTER_IDS, bayerThresholds, ditherTileDataUrl, duotoneTables, pickDuotone } from "./artFilter";

export type TextFx = "typewriter" | "ripple" | "liquid" | "splitflap";

const FILTER_ID = { ripple: "mp-fx-ripple", liquid: "mp-fx-liquid" } as const;

/**
 * Shared SVG filter definitions (text effects AND artwork treatments) for the text effects. Rendered once by Player when any text
 * effect is on. Must stay in the DOM and NOT `display:none` (that disables the filter), so it's
 * a 0x0 absolutely positioned svg. Techniques: feTurbulence+feDisplacementMap (ripple) and the
 * gooey blur+alpha-contrast matrix (liquid) — see the animated-assets plan.
 */
const DITHER_LEVELS = 64; // discrete steps used to threshold the dither comparison

export function FxFilters({ palette }: { palette?: ArtPalette | null }) {
  const duo = pickDuotone(palette ? [palette.art1, palette.art2, palette.art3] : []);
  const t = duotoneTables(duo);
  const tile = ditherTileDataUrl(8);
  const tileSize = bayerThresholds(8).length;
  const zeros = `${"0 ".repeat(DITHER_LEVELS - 1)}1`; // 0 everywhere except the top step
  const gray = "0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0";
  return (
    <svg className="mp-fx-filters" width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {/* Artwork treatments — theme-usable via `filter: url(#mp-art-*)` on .mp-artwork (D10 allows
            filter). Colours come from the extracted palette, computed in artFilter.ts because SVG
            attributes can't read CSS variables. */}
        <filter id={ART_FILTER_IDS.duotone} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={gray} />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={t.r} />
            <feFuncG type="table" tableValues={t.g} />
            <feFuncB type="table" tableValues={t.b} />
          </feComponentTransfer>
        </filter>
        <filter id={ART_FILTER_IDS.posterize} colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="1.5" />
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues="0 0.333 0.667 1" />
            <feFuncG type="discrete" tableValues="0 0.333 0.667 1" />
            <feFuncB type="discrete" tableValues="0 0.333 0.667 1" />
          </feComponentTransfer>
        </filter>
        {/* Ordered dither: grey level compared against a repeating Bayer tile (our own, generated on
            a canvas), thresholded to two tones, then recoloured to the palette's duotone. The
            arithmetic keeps alpha at 1 (k2+k3+k4 = 1); the compare is "grey - tile + 1 >= 1". */}
        <filter id={ART_FILTER_IDS.dither} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={gray} result="gray" />
          {tile && <feImage href={tile} x="0" y="0" width={tileSize} height={tileSize} result="tile" />}
          {tile && <feTile in="tile" result="tiled" />}
          {tile && <feComposite in="gray" in2="tiled" operator="arithmetic" k1="0" k2="1" k3="-1" k4="1" />}
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues={zeros} />
            <feFuncG type="discrete" tableValues={zeros} />
            <feFuncB type="discrete" tableValues={zeros} />
          </feComponentTransfer>
          <feComponentTransfer>
            <feFuncR type="table" tableValues={t.r} />
            <feFuncG type="table" tableValues={t.g} />
            <feFuncB type="table" tableValues={t.b} />
          </feComponentTransfer>
        </filter>
        <filter id={FILTER_ID.ripple} x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="1" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={FILTER_ID.liquid} x="-10%" y="-40%" width="120%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
        </filter>
      </defs>
    </svg>
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Props {
  as?: ElementType;
  className: string;
  text: string;
  effect?: TextFx;
}

/**
 * Renders real title/artist text and, when `effect` is set, animates it. Never changes the
 * text (textContent stays identical, so screen readers and the contrast checks see the same
 * thing). The element remounts per track (Player's `.mp-meta` key), so every effect replays on
 * track change without extra plumbing. Reduced motion renders the plain, static text.
 */
export function AnimatedText({ as: Tag = "div", className, text, effect }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !effect || effect === "splitflap" || reducedMotion()) return;

    if (effect === "typewriter") {
      const split = splitText(el, { chars: true, accessible: true });
      const anim = animate(split.chars, {
        opacity: [0, 1],
        duration: 1,
        delay: stagger(38),
        ease: "linear",
      });
      return () => {
        anim.revert();
        split.revert();
      };
    }

    const filterEl = document.querySelector(`#${FILTER_ID[effect]}`);
    if (!filterEl) return;
    el.style.filter = `url(#${FILTER_ID[effect]})`;

    if (effect === "ripple") {
      const disp = filterEl.querySelector("feDisplacementMap");
      const turb = filterEl.querySelector("feTurbulence");
      if (!disp || !turb) return;
      // Continuous, gentle wobble: displacement strength breathes and the noise field drifts.
      const state = { s: 0, x: 0.012 };
      const anim = animate(state, {
        s: [0, 6],
        x: 0.02,
        duration: 2600,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        onUpdate: () => {
          disp.setAttribute("scale", state.s.toFixed(2));
          turb.setAttribute("baseFrequency", `${state.x.toFixed(4)} 0.06`);
        },
      });
      return () => {
        anim.revert();
        disp.setAttribute("scale", "0");
        el.style.filter = "";
      };
    }

    // liquid: the letters coalesce out of a blur that the alpha-contrast matrix snaps into blobs,
    // then the filter is removed entirely so resting text is crisp (not blob-edged).
    const blur = filterEl.querySelector("feGaussianBlur");
    if (!blur) return;
    const state = { b: 9 };
    blur.setAttribute("stdDeviation", "9");
    const anim = animate(state, {
      b: 0,
      duration: 900,
      ease: "outQuad",
      onUpdate: () => blur.setAttribute("stdDeviation", state.b.toFixed(2)),
      onComplete: () => {
        el.style.filter = "";
      },
    });
    return () => {
      anim.revert();
      el.style.filter = "";
    };
  }, [effect, text]);

  // Split-flap swaps the whole element for the board; anything the flaps would garble (emoji, astral
  // CJK) or reduced motion falls through to plain text.
  if (effect === "splitflap" && !reducedMotion() && isFlapSafe(text, FLAP_GEOMETRY[flapKindOf(className)].cols)) {
    return <SplitFlapText className={className} text={text} />;
  }

  return (
    <Tag className={className} ref={ref}>
      {text}
    </Tag>
  );
}
