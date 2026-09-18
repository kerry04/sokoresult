import confetti from "canvas-confetti";

export function fireConfettiAt(el: HTMLElement | null) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  let origin = { x: 0.5, y: 0.5 };
  if (el) {
    const r = el.getBoundingClientRect();
    origin = {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
    };
  }
  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 35,
    origin,
    colors: ["#00C853", "#4CAF50", "#FFD700", "#2196F3"],
    scalar: 0.9,
    ticks: 200,
  });
}

export function fireBigConfetti() {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const end = Date.now() + 1200;
  const colors = ["#FFD700", "#FFA000", "#00C853", "#2196F3"];
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0, y: 0.9 }, colors });
    confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1, y: 0.9 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
