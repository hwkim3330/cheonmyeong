/** Keyboard and mouse, with pointer lock for looking around; tests can drive it directly. */
export class Input {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  lmb = false;
  lmbPressed = false;
  rmb = false;
  locked = false;
  /** Set by UI overlays: while true, gameplay ignores input. */
  blocked = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (["Space", "Tab"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    canvas.addEventListener("mousedown", (e) => {
      if (this.blocked) return;
      if (!this.locked) {
        canvas.requestPointerLock?.();
      }
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      }
      if (e.button === 2) this.rmb = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("mousemove", (e) => {
      if (this.locked || this.rmb) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    window.addEventListener("wheel", (e) => (this.wheel += e.deltaY), { passive: true });
    document.addEventListener("pointerlockchange", () => (this.locked = document.pointerLockElement === canvas));
  }

  down(code: string): boolean {
    return !this.blocked && this.keys.has(code);
  }
  hit(code: string): boolean {
    return !this.blocked && this.pressed.has(code);
  }
  /** Call at the end of each frame. */
  flush(): void {
    this.pressed.clear();
    this.lmbPressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
