/** Everything in the land, put together, and kept updated round the player. */
import * as THREE from "three";
import type { Stage } from "../engine/stage";
import { PEACH, WORLD } from "./layout";
import { Forest, grassMesh, petals, waterMesh, type WorldU } from "./nature";
import { Structures } from "./structures";
import { Ground, groundMaterial, Terrain } from "./terrain";

export class World {
  readonly t: Terrain;
  readonly ground: Ground;
  readonly forest: Forest;
  readonly structures: Structures;
  readonly U: WorldU;

  constructor(readonly stage: Stage) {
    this.t = new Terrain();
    this.t.textures();
    this.U = {
      uHeight: { value: this.t.heightTex },
      uSplat: { value: this.t.splatTex },
      uWorld: { value: WORLD },
      uTime: stage.time,
      uPlayer: { value: new THREE.Vector3() },
      uCam: { value: new THREE.Vector3() },
      uSun: { value: stage.sunDir },
    };
    this.ground = new Ground(this.t, groundMaterial({ uSplat: this.U.uSplat, uWorld: this.U.uWorld, uTime: stage.time }));
    stage.scene.add(this.ground.group);
    stage.scene.add(waterMesh(this.U));
    stage.scene.add(grassMesh(this.U));
    this.forest = new Forest(this.t);
    stage.scene.add(this.forest.group);
    this.structures = new Structures(this.t);
    stage.scene.add(this.structures.group);
    stage.scene.add(petals(this.U, new THREE.Vector3(PEACH.x, this.t.height(PEACH.x, PEACH.z), PEACH.z)));
  }

  update(t: number, player: THREE.Vector3, cam: THREE.Vector3): void {
    this.U.uPlayer.value.copy(player);
    this.U.uCam.value.copy(cam);
    this.ground.update(cam);
    this.structures.update(t);
  }
}
