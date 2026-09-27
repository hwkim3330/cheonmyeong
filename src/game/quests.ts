/**
 * The story of this first chapter, 「황건의 난」: the oath in the peach garden, the elder of
 * 탁현 asking for help, and the four Yellow Turban camps up to 장보's great camp. Each stage
 * says where to go (for the markers) and what finishes it.
 */
import { BEACONS, CAMPS, PEACH, VILLAGE } from "../world/layout";

export interface Stage {
  title: string;
  text: string;
  target: [number, number] | null;
}

export const ELDER_POS: [number, number] = [VILLAGE.x - 6, VILLAGE.z - 44];

export const STAGES: Stage[] = [
  { title: "도원결의(桃園結義)", text: "복숭아 동산의 돌탁자로 가자. 형제들이 기다린다.", target: [PEACH.x, PEACH.z] },
  { title: "황건의 난", text: "탁현 촌장에게 마을의 사정을 듣자.", target: ELDER_POS },
  { title: "황건적 초소", text: "마을 동쪽의 황건적 초소를 소탕하라.", target: [CAMPS[0].x, CAMPS[0].z] },
  { title: "봉화를 올려라", text: "탁현 봉화대를 밝혀 길을 열어라. (F)", target: [BEACONS[0].x, BEACONS[0].z] },
  { title: "서쪽 산채", text: "서쪽 언덕의 황건적 산채를 무너뜨려라.", target: [CAMPS[1].x, CAMPS[1].z] },
  { title: "석림의 진영", text: "석림 너머 황건 진영을 쳐라. 술사와 두목을 조심하라.", target: [CAMPS[2].x, CAMPS[2].z] },
  { title: "지공장군 장보", text: "북쪽 고개 너머 황건 대본영. 장각의 아우 장보를 쓰러뜨려라.", target: [CAMPS[3].x, CAMPS[3].z] },
  { title: "천하를 향하여", text: "탁군은 평화를 되찾았다. 천명석과 보물을 모으고, 새 영웅을 부르자.", target: null },
];

export const OATH_LINES = [
  { who: "유비", face: "liubei", text: "비록 성은 다르나, 이미 형제가 되기로 하였으니…" },
  { who: "관우", face: "guanyu", text: "마음과 힘을 합쳐 곤궁한 이를 돕고, 위태로운 이를 붙들어" },
  { who: "장비", face: "zhangfei", text: "위로는 나라에 보답하고, 아래로는 백성을 편안케 하리라!" },
  { who: "유비", face: "liubei", text: "같은 해 같은 달 같은 날에 나기를 바라지 않으나, 같은 해 같은 달 같은 날에 죽기를 원하노라." },
  { who: "장비", face: "zhangfei", text: "형님들! 술이 식습니다. 자, 이제 황건 놈들을 쓸어버리러 갑시다!" },
];

export const ELDER_LINES = [
  { who: "탁현 촌장", text: "오오, 젊은 영웅들이시군요. 누런 두건을 두른 도적 떼가 창천이 이미 죽었다며 마을을 약탈하고 있습니다." },
  { who: "탁현 촌장", text: "동쪽 초소부터, 서쪽 산채, 석림의 진영까지… 그 우두머리는 북쪽 고개 너머에 있는 지공장군 장보라 합니다." },
  { who: "유비", face: "liubei", text: "걱정 마시오. 백성을 괴롭히는 무리를 그냥 두지 않겠소." },
  { who: "탁현 촌장", text: "고맙습니다… 이것은 마을이 모은 원보입니다. 뜻을 함께할 영웅을 부르는 데 쓰십시오. (천명 소환: B)" },
];

export const FINALE_LINES = [
  { who: "장보", text: "창천은 이미 죽었고… 황천이 마땅히 서리라… 크윽…" },
  { who: "관우", face: "guanyu", text: "요사한 술법도 의(義) 앞에서는 한낱 연기일 뿐." },
  { who: "유비", face: "liubei", text: "탁군은 이제 평화를 되찾았다. 하지만 천하는 아직 어지럽다." },
  { who: "장비", face: "zhangfei", text: "그럼 다음은 어디요, 형님? 이 장익덕의 창이 근질근질합니다!" },
  { who: "유비", face: "liubei", text: "천명(天命)이 이끄는 곳으로. 함께 가자, 아우들아." },
];
