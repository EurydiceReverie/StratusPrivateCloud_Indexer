import { useCallback, useRef } from "react";

/**
 * SVG filter-based dissolve / Thanos snap effect.
 * Uses feDisplacementMap + feTurbulence to scatter pixels,
 * with blue color tinting for visibility in both light/dark modes.
 */

const FILTER_ID = "dissolve-filter";
const DURATION = 900;
const MAX_SCALE = 400;
const ease = (t: number) => 1 - (1 - t) ** 3;

function appendFilter(parent: SVGSVGElement): void {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  filter.setAttribute("id", FILTER_ID);
  filter.setAttribute("x", "-50%");
  filter.setAttribute("y", "-50%");
  filter.setAttribute("width", "200%");
  filter.setAttribute("height", "200%");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const bigNoise = document.createElementNS("http://www.w3.org/2000/svg", "feTurbulence");
  bigNoise.setAttribute("type", "fractalNoise");
  bigNoise.setAttribute("baseFrequency", "0.012");
  bigNoise.setAttribute("numOctaves", "2");
  bigNoise.setAttribute("result", "bigNoise");

  const transfer = document.createElementNS("http://www.w3.org/2000/svg", "feComponentTransfer");
  transfer.setAttribute("in", "bigNoise");
  transfer.setAttribute("result", "bigNoiseAdjusted");

  const funcR = document.createElementNS("http://www.w3.org/2000/svg", "feFuncR");
  funcR.setAttribute("type", "linear");
  funcR.setAttribute("slope", "3");
  funcR.setAttribute("intercept", "-1");

  const funcG = document.createElementNS("http://www.w3.org/2000/svg", "feFuncG");
  funcG.setAttribute("type", "linear");
  funcG.setAttribute("slope", "3");
  funcG.setAttribute("intercept", "-1");

  transfer.append(funcR, funcG);

  const fineNoise = document.createElementNS("http://www.w3.org/2000/svg", "feTurbulence");
  fineNoise.setAttribute("type", "fractalNoise");
  fineNoise.setAttribute("baseFrequency", "1.2");
  fineNoise.setAttribute("numOctaves", "1");
  fineNoise.setAttribute("result", "fineNoise");

  const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
  merge.setAttribute("result", "mergedNoise");
  const mergeNodeA = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
  mergeNodeA.setAttribute("in", "bigNoiseAdjusted");
  const mergeNodeB = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
  mergeNodeB.setAttribute("in", "fineNoise");
  merge.append(mergeNodeA, mergeNodeB);

  const displacement = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
  displacement.setAttribute("in", "SourceGraphic");
  displacement.setAttribute("in2", "mergedNoise");
  displacement.setAttribute("scale", "0");
  displacement.setAttribute("xChannelSelector", "R");
  displacement.setAttribute("yChannelSelector", "G");

  filter.append(bigNoise, transfer, fineNoise, merge, displacement);
  defs.appendChild(filter);
  parent.appendChild(defs);
}

/** Ensure the SVG filter exists in the DOM (singleton) */
function ensureFilter() {
  if (document.getElementById(FILTER_ID)) return;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.style.display = "none";
  appendFilter(svg);
  document.body.appendChild(svg);
}

export function useDissolveEffect() {
  const animatingRef = useRef(false);

  const dissolve = useCallback((elements: HTMLElement[]): Promise<void> => {
    if (elements.length === 0) return Promise.resolve();
    if (animatingRef.current) return Promise.resolve();

    return new Promise((resolve) => {
      ensureFilter();
      animatingRef.current = true;

      const filterEl = document.getElementById(FILTER_ID);
      const disp = filterEl?.querySelector("feDisplacementMap");
      const bNoise = filterEl?.querySelector('feTurbulence[result="bigNoise"]');

      if (!disp || !bNoise) {
        animatingRef.current = false;
        resolve();
        return;
      }

      bNoise.setAttribute("seed", String(Math.floor(Math.random() * 1000)));

      const origStyles: { el: HTMLElement; filter: string; transform: string; opacity: string; willChange: string; overflow: string }[] = [];

      for (const el of elements) {
        origStyles.push({
          el,
          filter: el.style.filter,
          transform: el.style.transform,
          opacity: el.style.opacity,
          willChange: el.style.willChange,
          overflow: el.style.overflow,
        });
        el.style.filter = `url(#${FILTER_ID})`;
        el.style.willChange = "transform, opacity, filter";
        el.style.overflow = "hidden";
      }

      const start = performance.now();

      const step = (now: number) => {
        const t = Math.min((now - start) / DURATION, 1);
        const e = ease(t);

        disp.setAttribute("scale", String(e * MAX_SCALE));

        for (const el of elements) {
          el.style.transform = `scale(${1 + 0.05 * e})`;
          el.style.opacity = t < 0.3 ? "1" : String(Math.max(0, 1 - (t - 0.3) / 0.7));
        }

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          disp.setAttribute("scale", "0");
          for (const { el, filter, transform, opacity: _opacity, willChange, overflow } of origStyles) {
            el.style.filter = filter;
            el.style.transform = transform;
            el.style.opacity = "0";
            el.style.willChange = willChange;
            el.style.overflow = overflow;
          }
          animatingRef.current = false;
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  }, []);

  return dissolve;
}
