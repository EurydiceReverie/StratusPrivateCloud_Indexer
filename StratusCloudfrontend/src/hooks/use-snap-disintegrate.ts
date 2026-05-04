import { useCallback } from "react";

function sanitizeCloneForForeignObject(source: HTMLElement): string {
  const clone = source.cloneNode(true) as HTMLElement;
  const blockedTags = new Set(["script", "iframe", "object", "embed"]);
  const elements = [clone, ...Array.from(clone.querySelectorAll("*"))] as HTMLElement[];

  for (const el of elements) {
    if (blockedTags.has(el.tagName.toLowerCase())) {
      el.remove();
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return new XMLSerializer().serializeToString(clone);
}

/**
 * Canvas-based Thanos snap / particle disintegration effect.
 * Captures the target DOM element into a canvas, splits it into particles,
 * and animates them flying away with randomised trajectories.
 */
export function useSnapDisintegrate() {
  const disintegrate = useCallback((el: HTMLElement): Promise<void> => {
    return new Promise((resolve) => {
      const rect = el.getBoundingClientRect();
      const w = Math.ceil(rect.width);
      const h = Math.ceil(rect.height);
      if (w === 0 || h === 0) { resolve(); return; }

      const cols = 32;
      const rows = Math.max(1, Math.round((h / w) * cols));
      const pw = w / cols;
      const ph = h / rows;

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = w * 2;
      sourceCanvas.height = h * 2;
      const srcCtx = sourceCanvas.getContext("2d")!;
      srcCtx.scale(2, 2);

      const serialized = sanitizeCloneForForeignObject(el);
      const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;">
              ${serialized}
            </div>
          </foreignObject>
        </svg>`;

      const img = new Image();
      const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        srcCtx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        startAnimation();
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        el.style.transition = "all 0.6s ease-out";
        el.style.opacity = "0";
        el.style.transform = "scale(0.8)";
        setTimeout(resolve, 600);
      };

      img.src = url;

      function startAnimation() {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";

        const container = document.createElement("div");
        container.style.cssText = `
          position: fixed;
          left: ${rect.left}px;
          top: ${rect.top}px;
          width: ${w}px;
          height: ${h}px;
          pointer-events: none;
          z-index: 9999;
          overflow: visible;
        `;
        document.body.appendChild(container);

        const layerCount = 4;
        const layers: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; particles: Particle[] }[] = [];

        interface Particle {
          x: number; y: number;
          dx: number; dy: number;
          opacity: number;
          delay: number;
          rotation: number;
          dRotation: number;
        }

        for (let l = 0; l < layerCount; l++) {
          const canvas = document.createElement("canvas");
          canvas.width = w * 2;
          canvas.height = h * 2;
          canvas.style.cssText = `
            position: absolute;
            left: 0; top: 0;
            width: ${w}px;
            height: ${h}px;
          `;
          container.appendChild(canvas);
          const ctx = canvas.getContext("2d")!;

          const particles: Particle[] = [];
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              if (Math.floor(Math.random() * layerCount) !== l) continue;
              particles.push({
                x: col * pw,
                y: row * ph,
                dx: (Math.random() - 0.3) * 120,
                dy: (Math.random() - 0.5) * 80 - 20,
                opacity: 1,
                delay: (col / cols) * 0.4 + Math.random() * 0.2,
                rotation: 0,
                dRotation: (Math.random() - 0.5) * 4,
              });
            }
          }

          layers.push({ canvas, ctx, particles });
        }

        const duration = 1200;
        const start = performance.now();

        const animate = (now: number) => {
          const elapsed = now - start;
          const t = Math.min(elapsed / duration, 1);

          for (const layer of layers) {
            layer.ctx.clearRect(0, 0, w * 2, h * 2);
            layer.ctx.save();
            layer.ctx.scale(2, 2);

            for (const p of layer.particles) {
              const pt = Math.max(0, Math.min(1, (t - p.delay) / (1 - p.delay)));
              if (pt <= 0) {
                layer.ctx.drawImage(sourceCanvas, p.x * 2, p.y * 2, pw * 2, ph * 2, p.x, p.y, pw, ph);
                continue;
              }

              const ease = 1 - (1 - pt) ** 2;
              const px = p.x + p.dx * ease;
              const py = p.y + p.dy * ease;
              const opacity = 1 - ease;

              if (opacity <= 0.01) continue;

              layer.ctx.globalAlpha = opacity;
              layer.ctx.save();
              layer.ctx.translate(px + pw / 2, py + ph / 2);
              layer.ctx.rotate(p.rotation + p.dRotation * ease);
              layer.ctx.drawImage(sourceCanvas, p.x * 2, p.y * 2, pw * 2, ph * 2, -pw / 2, -ph / 2, pw, ph);
              layer.ctx.restore();
            }

            layer.ctx.restore();
          }

          if (t < 1) {
            requestAnimationFrame(animate);
          } else {
            container.remove();
            resolve();
          }
        };

        requestAnimationFrame(animate);
      }
    });
  }, []);

  return disintegrate;
}
