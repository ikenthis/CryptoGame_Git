import { BOSSES, CARDS, COMMANDERS, RACE_IDS, UNIT_TYPES, type CardId, type Race, type Rarity, type UnitType } from '@gentium/engine';

// Dirección de arte para generar ilustraciones con IA. Todas comparten el mismo
// estilo para que la colección se vea coherente. Los prompts van en inglés
// porque los modelos de imagen responden mejor así.

export type ArtSize = '1536x1024' | '1024x1024' | '1024x1536';

export interface ArtJob {
  /** Ruta lógica: el archivo se guarda como `<id>.webp` y el juego lo busca por este id. */
  id: string;
  size: ArtSize;
  prompt: string;
  /** Sprite de tablero: figura suelta sobre fondo liso (o transparente si el proveedor lo permite). */
  transparent?: boolean;
}

export const ART_STYLE = [
  'Epic dark-fantasy illustration for a premium collectible card game.',
  'Painterly digital art, dramatic cinematic lighting with strong rim light, volumetric god rays,',
  'atmospheric particles, rich saturated colors against deep shadows, highly detailed, sharp focus on the subject,',
  'centered composition with breathing room at the edges.',
  'Absolutely no text, letters, numbers, logos, watermarks, borders or card frames.',
].join(' ');

/**
 * Sprites del tablero: anime japonés de videojuego (JRPG/gacha) mezclado con
 * fantasía clásica pintada, con la paleta de docs/art-reference.webp. Prompts
 * cortos y directos: los modelos pequeños (el gratuito) se pierden con los largos.
 */
export const SPRITE_ANIME = 'anime style';
export const SPRITE_STYLE = 'JRPG gacha character art, cel shading, classic fantasy painting colors, vibrant, heroic pose, plain light grey background, no text';

/** Aspecto de cada raza en pocas palabras (para sprites sobre fondo liso). */
const SPRITE_RACE: Record<Race, string> = {
  human: 'human, blue and gold plate armor, sun emblem',
  elf: 'elf with pointed ears and long silver hair, silver and emerald leaf armor',
  orc: 'green-skinned orc with tusks, black spiked iron armor, red war paint',
  undead: 'skeleton with a bare white skull face and bony hands, glowing cyan eye sockets, rusted dark armor, tattered purple cloth',
  dwarf: 'stocky dwarf with a huge braided red beard, bronze rune armor',
};

/** Rasgos propios de cada comandante para que se distingan de la tropa y entre sí. */
const COMMANDER_LOOK: Record<string, string> = {
  aldric: 'veteran male captain of the guard with a greatsword and a blue cape',
  seraphine: 'radiant warrior queen with a golden crown, flowing golden hair and a blazing sword',
  lyra: 'young female elf ranger with a glowing longbow and a green hooded cape',
  thalanor: 'ancient male elf archdruid with antler crown and a living-wood staff',
  grok: 'huge brutish male orc berserker with a giant bone club',
  magthar: 'orc warlord in black spiked armor with a flaming greataxe and a wolf-fur cape',
  velka: 'pale female necromancer with a skull staff and ghostly green flames',
  morvath: 'skeletal lich king with a spiked crown, dark robes and a soul-fire staff',
  borin: 'dwarf thane with a horned helm, huge braided red beard, hammer and shield',
  brunhild: 'female dwarf runesmith with braided red hair and a glowing rune hammer',
};

const UNIT_LOOK: Record<Exclude<UnitType, 'golem' | 'commander' | 'boss'>, string> = {
  warrior: 'warrior with sword and round shield',
  archer: 'archer drawing a longbow',
  knight: 'heavy knight with lance and kite shield',
  guardian: 'shield guardian with a huge tower shield and hammer',
  mage: 'battle mage with a glowing staff',
  healer: 'priest healer with a holy staff, white and gold robes',
};

const RARITY_MOOD: Record<Rarity, string> = {
  common: 'Grounded, gritty and believable, a moment from a real battle.',
  uncommon: 'A touch of elemental magic in an otherwise grounded scene.',
  rare: 'Vivid magical energy dominating the scene.',
  epic: 'Awe-inspiring arcane power with violet and purple energy accents.',
  legendary: 'A mythic legendary moment of overwhelming scale, golden divine light, the most spectacular scene of the whole collection.',
};

export const RACE_LOOK: Record<Race, string> = {
  human: 'humans of the Kingdom of Aurelia wearing polished steel plate armor with royal blue tabards, golden sun emblems and white-and-gold banners',
  elf: 'elves of the Sylvaran forest wearing graceful silver and emerald leaf-shaped armor, long pale-gold hair, ancient glowing trees',
  orc: 'green-skinned orcs of the Ash Clans with tusks, brutal blackened iron armor with bone horns, crimson war paint, a burning volcanic wasteland',
  undead: 'the undead Shadow Legion: skeletal warriors in tattered purple robes and spiked crowns, eye sockets glowing with cyan soul fire, a misty graveyard',
  dwarf: 'dwarves of the Durnhal forge with huge braided red beards, rune-etched bronze and orange armor, glowing molten forges inside a mountain hall',
};

const CARD_SCENES: Record<CardId, string> = {
  'fire-arrow': 'A single blazing arrow wreathed in roaring fire streaking across a stormy battlefield at dusk, trailing embers and smoke, dramatic close angle with motion blur.',
  'minor-potion': 'A small ornate glass flask filled with glowing crimson liquid resting on a battle-worn wooden table beside a dented helmet, soft candlelight, sparkles rising from the potion.',
  'war-cry': 'A battle-scarred warrior blowing a massive curved war horn on a hilltop, sound waves visibly rippling through the air, an army raising its weapons behind him under a red sky.',
  'stone-skin': 'A knight whose armor is turning into cracked living granite with glowing amber runes in the cracks, arrows shattering against the stone, mountains behind.',
  'swift-wind': 'Swirling emerald wind currents carrying autumn leaves around a squad of soldiers sprinting at impossible speed, streaks of motion, light and airy.',
  'frost-bind': 'A huge warrior frozen mid-charge inside jagged crystal ice chains, frost spreading across the ground, pale blue glow, snowflakes suspended in the air.',
  meteor: 'A colossal flaming meteor plunging from a burning sky toward an enemy army, shockwave and flying debris, apocalyptic orange light, tiny soldiers for scale.',
  reinforcements: 'A column of fresh soldiers with raised shields and spears marching out of a fortress gate into the fog of battle, banners flying, heroic morning light.',
  'healing-light': 'A radiant pillar of warm golden-green light descending from the heavens onto wounded soldiers, wounds closing in sparkles of light, serene yet epic.',
  'chain-lightning': 'Violet chain lightning arcing between several armored warriors on a dark battlefield, each struck figure silhouetted in blinding purple-white light.',
  resurrection: 'A fallen hero rising from the battlefield inside a column of golden light, a glowing ankh floating above, feathers and dust drifting in the air.',
  'aurelia-intervention': 'The radiant warrior queen of Aurelia in shining golden plate with great wings of light raises a blazing sword to the heavens while divine sunlight pours over her kneeling army.',
  'sylvaran-storm': 'Thousands of glowing green-gold elven arrows darkening the sky above an enchanted ancient forest, elven archers on towering branches releasing a single volley, leaves swirling in a magical storm.',
  'ash-fury': 'A towering orc warchief in blackened spiked armor roaring as a volcano erupts behind him, war drums pounding, a horde of orcs charging with burning eyes through ash and embers.',
  'fallen-legion': 'A skeletal lich king in a spiked crown raising his staff as hundreds of undead warriors claw their way out of their graves, cyan soul fire in their eyes, purple mist under a full moon.',
  'ancestral-golem': 'A colossal ancient stone golem covered in moss and glowing orange dwarven runes awakening inside a vast mountain forge, dwarves with braided beards kneeling before it, rivers of molten metal.',
  'shield-wall': 'A tight line of soldiers locking tall steel shields together, arrows bouncing off the wall of shields, sparks, rain of arrows from above.',
  'arcane-barrier': 'A glowing blue dome of arcane runes shielding a wounded warrior as fireballs explode against it.',
  'thorn-armor': 'A knight in armor covered with living thorny vines, an attacker recoiling as thorns pierce back, green magical glow.',
  bulwark: 'Translucent golden spectral shields of ancient gods appearing over every soldier of an army, violet sky, divine protection.',
  'armor-break': 'A massive war hammer shattering an enemy breastplate into flying metal shards, slow-motion impact.',
  'weakness-curse': 'A hooded witch casting violet chains of curse that drain the strength from a charging army, their weapons drooping.',
  'poison-cloud': 'A thick toxic green cloud with a skull shape rolling over an enemy camp, soldiers coughing, sickly green light.',
  earthquake: 'The ground splitting open under an enemy army, rocks rising, soldiers falling into glowing molten cracks.',
};

const RACE_PORTRAITS: Record<Race, string> = {
  human: 'Heroic portrait of a human paladin of Aurelia in ornate steel and gold plate armor with a royal blue cape and a sun emblem on the breastplate, determined gaze.',
  elf: 'Heroic portrait of an elven ranger of Sylvaran in silver and emerald leaf armor, long pale-gold hair, a glowing bow, luminous forest spirits around her.',
  orc: 'Heroic portrait of an orc warlord of the Ash Clans with tusks, crimson war paint and a horned black iron helmet, embers floating around him.',
  undead: 'Heroic portrait of an undead death knight of the Shadow Legion, a skull face with cyan soul fire eyes, a spiked crown and tattered purple cloak.',
  dwarf: 'Heroic portrait of a dwarf runesmith of Durnhal with a huge braided red beard, rune-etched bronze armor and a glowing forge hammer.',
};

export const ART_JOBS: ArtJob[] = [
  {
    id: 'scenes/keyart',
    size: '1536x1024',
    prompt: `${ART_STYLE} Wide panoramic key art: five fantasy armies clash at sunset in the War of the Peoples, at the foot of a colossal ancient stone fortress — ${RACE_IDS.map((r) => RACE_LOOK[r]).join('; ')}. Epic scale, banners, magic and fire in the sky.`,
  },
  ...RACE_IDS.map((race): ArtJob => ({
    id: `races/${race}`,
    size: '1024x1024',
    prompt: `${ART_STYLE} ${RACE_PORTRAITS[race]} Bust framed from the chest up, looking at the viewer, dark vignette background. The character belongs to ${RACE_LOOK[race]}.`,
  })),
  ...Object.values(COMMANDERS).map((c): ArtJob => ({
    id: `commanders/${c.id}`,
    size: '1024x1024',
    prompt: `${ART_STYLE} Heroic portrait of ${c.name}, ${c.title}, a legendary commander of ${RACE_LOOK[c.race]}. ${c.lore} Bust framed from the chest up, commanding presence, ornate armor, dark vignette background. ${RARITY_MOOD[c.rarity]}`,
  })),
  ...RACE_IDS.flatMap((race) => UNIT_TYPES.filter((t): t is keyof typeof UNIT_LOOK => t in UNIT_LOOK).map((type): ArtJob => ({
    id: `units/${race}-${type}`,
    size: '1024x1024',
    transparent: true,
    prompt: `${SPRITE_ANIME}, full body ${UNIT_LOOK[type]}, ${SPRITE_RACE[race]}, ${SPRITE_STYLE}`,
  }))),
  ...Object.values(COMMANDERS).map((c): ArtJob => ({
    id: `units/commander-${c.id}`,
    size: '1024x1024',
    transparent: true,
    prompt: `${SPRITE_ANIME}, full body ${COMMANDER_LOOK[c.id]}, ${SPRITE_RACE[c.race]}, commander with a flowing cape, ${c.rarity === 'legendary' ? 'golden divine aura, ' : ''}${SPRITE_STYLE}`,
  })),
  ...Object.values(BOSSES).map((b): ArtJob => ({
    id: `bosses/${b.id}`,
    size: '1536x1024',
    prompt: `${ART_STYLE} A colossal raid boss: ${b.name}, the ${b.look === 'dragon' ? 'Ash Dragon, a gigantic black dragon with molten cracks in its scales breathing fire' : 'Void Colossus, a towering being of black stone and purple void energy with a single burning eye'}. ${b.lore} Tiny heroes in the foreground for scale. ${RARITY_MOOD.legendary}`,
  })),
  ...Object.values(CARDS).map((card): ArtJob => ({
    id: `cards/${card.id}`,
    size: '1536x1024',
    prompt: [
      ART_STYLE,
      CARD_SCENES[card.id],
      card.race ? `The scene features ${RACE_LOOK[card.race]}.` : '',
      RARITY_MOOD[card.rarity],
    ].filter(Boolean).join(' '),
  })),
];
