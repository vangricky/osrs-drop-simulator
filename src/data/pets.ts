/**
 * Every combat/boss pet obtainable in this game, by item id — hand-curated
 * against the OSRS Wiki's pet list (skilling pets like Beaver/Rocky/Herbi
 * don't apply since this is a boss-only simulator) and verified against the
 * actual item catalog rather than guessed from name slugs, since a few pets
 * are named differently as items than as the wiki page title (e.g. Shellbane
 * Gryphon's "Gull" is item id `gull-pet`, named "Gull (pet)" to disambiguate
 * from the unrelated "Gull" NPC).
 *
 * Not every pet on the wiki is here: Sol Heredit (Fortis Colosseum), The
 * Gauntlet, Wintertodt, and Tempoross aren't implemented as bosses in this
 * game, so their pets (Smol Heredit, Youngllef, Phoenix, Tiny tempor) have
 * nothing to drop from.
 */
export const PET_ITEM_IDS = new Set<string>([
  "abyssal-orphan",
  "aggy",
  "baby-mole",
  "baron",
  "beef",
  "bran",
  "butch",
  "callisto-cub",
  "dom",
  "gull-pet",
  "hellpuppy",
  "huberte",
  "ikkle-hydra",
  "jal-nib-rek",
  "kalphite-princess",
  "lil-zik",
  "lilviathan",
  "little-nightmare",
  "maggot-marquess",
  "moxi",
  "muphin",
  "nexling",
  "nid",
  "noon",
  "olmlet",
  "pet-chaos-elemental",
  "pet-dagannoth-prime",
  "pet-dagannoth-rex",
  "pet-dagannoth-supreme",
  "pet-dark-core",
  "pet-general-graardor",
  "pet-kraken",
  "pet-kreearra",
  "pet-kril-tsutsaroth",
  "pet-smoke-devil",
  "pet-snakeling",
  "pet-zilyana",
  "prince-black-dragon",
  "scorpias-offspring",
  "scurry",
  "skotos",
  "smolcano",
  "sraracha",
  "tzrek-jad",
  "venenatis-spiderling",
  "vetion-jr",
  "vorki",
  "wisp",
  "yami",
]);
