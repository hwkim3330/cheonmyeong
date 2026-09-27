/** A lineup of the heroes on a stage (for looking at the models and poses). */
import * as THREE from "three";
import { Animator } from "./char/anim";
import { buildHero } from "./char/model";
import { HEROES } from "./data/heroes";
import type { Stage } from "./engine/stage";
import { toon } from "./engine/toon";

export function showcase(stage: Stage, ids?: string[], anim = "pose"): { update: (dt: number) => void; anims: Animator[] } {
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.4, 64), toon(0x9ab870));
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  stage.scene.add(floor);
  const list = HEROES.filter((h) => !ids || ids.includes(h.id));
  const anims: Animator[] = [];
  list.forEach((h, i) => {
    const rig = buildHero(h.look);
    rig.root.position.set((i - (list.length - 1) / 2) * 1.5, 0, 0);
    stage.scene.add(rig.root);
    const a = new Animator(rig);
    a.alwaysArmed = true;
    if (anim !== "idle") a.play(anim, 1);
    anims.push(a);
  });
  const still = { speed: 0, grounded: true, vy: 0, gliding: false, turn: 0, vel: new THREE.Vector3(), sprint: false };
  return {
    anims,
    update: (dt) => {
      for (const a of anims) {
        if (!a.busy && anim !== "idle") a.play(anim);
        a.update(dt, still);
      }
    },
  };
}
