import { CARDS, RACE_IDS, type CardId, type Race, type Rarity } from '@gentium/engine';

// Dirección de arte para generar ilustraciones con IA. Todas comparten el mismo
// estilo para que la colección se vea coherente. Los prompts van en inglés
// porque los modelos de imagen responden mejor así.

export type ArtSize = '1536x1024' | '1024x1024' | '1024x1536';

export interface ArtJob {
  /** Ruta lógica: el archivo se guarda como `<id>.webp` y el juego lo busca por este id. */
  id: string;
  size: ArtSize;
  prompt: string;
}

export const ART_STYLE = [
  'Epic dark-fantasy illustration for a premium collectible card game.',
  'Painterly digital art, dramatic cinematic lighting with strong rim light, volumetric god rays,',
  'atmospheric particles, rich saturated colors against deep shadows, highly detailed, sharp focus on the subject,',
  'centered composition with breathing room at the edges.',
  'Absolutely no text, letters, numbers, logos, watermarks, borders or card frames.',
].join(' ');

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
