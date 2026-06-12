// CAIN Cardinal Virtuoso — Virtue dataset
// Vol. 1 core (6 virtues) + Harpocrates Dossier additions (Chastity, Sobriety, Absolution).
// quirks: per-virtue affinity triggers. perMission caps how often one can fire per mission.
// bondReactions: delta applied to THIS virtue when the player bonds/upgrades the KEYED virtue
//   ("*" = any other virtue).
// portrait: optional override path (relative to module root) for a virtue's portrait.
//   By default each virtue auto-loads img/virtues/<key>.webp; just drop files there.
//   A missing file falls back to the glyph placeholder automatically.
export const VIRTUES = {
  justice: {
    name: "Justice", epithet: "The Executioner", glyph: "I", portrait: "",
    likes: ["Religious Debate", "Classical Music", "Cleanliness"],
    dislikes: ["Charity", "Tardiness", "Dogs"],
    food: ["Health Food", "Dates"],
    blasphemy: "Law",
    bonds: {
      0: "Extra XP trigger: Did you uphold the dogma of CAIN?",
      1: "Gain the Law blasphemy. Use once a mission.",
      2: "Lower sin by 1 after halving. Executed → −1 more; spared/failed → +1d3 instead.",
      3: "You may choose two different effects for Law."
    },
    quirks: [
      { label: "Beat them in a debate", delta: 3 },
      { label: "Mission completed without breaking any strictures", delta: 2 },
      { label: "Came late to a meeting", delta: -1 },
      { label: "Broke a stricture during a mission", delta: -2 }
    ],
    bondReactions: { charity: -10 }
  },
  faith: {
    name: "Faith", epithet: "The Timid", glyph: "II", portrait: "",
    likes: ["Dogs", "Slow Afternoons", "Taking Photos", "Gachapon", "Phone Games", "Fighting Games"],
    dislikes: ["Fortitude", "Rude people", "Work", "Horror Movies"],
    food: ["Fast Food", "Sweets", "Hot Chicken"],
    blasphemy: "Null",
    bonds: {
      0: "Once a mission, if you can eat sweets, relieve 1 sin.",
      1: "Gain the Null blasphemy. Use once a mission.",
      2: "Sin overflow reduces your cap by 1 instead of 2.",
      3: "Null becomes the Immaculate Defiance of Heaven (irreversible)."
    },
    quirks: [
      { label: "Mission with no civilian or exorcist casualties", delta: 8 },
      { label: "Captured a binder", delta: 5 },
      { label: "Beat them in a fighting game", delta: 3 },
      { label: "Beat a claw game", delta: 2, perMission: 1 },
      { label: "Underwent sin overflow", delta: -1 }
    ],
    bondReactions: { fortitude: -10 }
  },
  charity: {
    name: "Charity", epithet: "The Twins", glyph: "III", portrait: "",
    likes: ["Fashion", "Arguing online", "Travel", "Rainy days"],
    dislikes: ["Justice", "Faith", "Boring people", "Long conversations"],
    food: ["High tea", "Pork dumplings"],
    blasphemy: "Entwine",
    bonds: {
      0: "Telepathy with any one exorcist via skin-to-skin contact.",
      1: "Gain the Entwine blasphemy.",
      2: "At mission start, borrow one agenda ability from a party member for the mission.",
      3: "Powers targeting 'self' can target any exorcist you are Entwined with."
    },
    quirks: [
      { label: "Severe Attack: Marriage with an Entwined exorcist", delta: 10 },
      { label: "Won an online debate", delta: 3 },
      { label: "Lost an online debate", delta: -1 },
      { label: "Meet-Up lasted longer than 12 minutes", delta: -2 },
      { label: "Chose a boring conversation topic", delta: -2 },
      { label: "Met them looking unfashionable", delta: -2 }
    ],
    bondReactions: { justice: -10, faith: -10 }
  },
  fortitude: {
    name: "Fortitude", epithet: "The Disaster", glyph: "IV", portrait: "",
    likes: ["Fighting", "Strong Opponents"],
    dislikes: ["Humans", "Exorcists", "All other virtues", "Sins", "CAIN leadership"],
    food: ["Hot Dogs (per CASTLE addendum 3004: nutrient paste only)"],
    blasphemy: "Strength",
    bonds: {
      0: "Never roll 0d for harm/violence (always ≥1d).",
      1: "Any harm you inflict is instantly fatal to humans.",
      2: "Gain Strength; safe once a mission. Second use → instant death at scene end.",
      3: "You can safely use Strength a second time."
    },
    quirks: [
      { label: "Killed CAIN leadership or another VIRTUE", delta: 40 },
      { label: "Beat them in hand-to-hand combat", delta: 30 },
      { label: "Sole survivor in the investigation zone (incl. allies)", delta: 15 },
      { label: "Won a brawl on your own", delta: 2 },
      { label: "Gifted them a hot dog", delta: 1 },
      { label: "Killed a human", delta: 1, perMission: 2 },
      { label: "Gifted them something neutral", delta: -1 },
      { label: "Lost a fight", delta: -4 }
    ],
    bondReactions: { "*": -10 }
  },
  hope: {
    name: "Hope", epithet: "The Dreamer", glyph: "V", portrait: "",
    likes: ["Video Games", "Luxurious Baths", "Holidays"],
    dislikes: ["Loud Noises", "Nosy people", "Justice", "Fortitude"],
    food: ["Pre-packed meal 402A"],
    blasphemy: "Veil",
    bonds: {
      0: "Once a mission, re-roll any stealth/avoid-notice action; take the second result.",
      1: "Gain the Veil blasphemy. Use once a mission.",
      2: "Mundane humans forget you after 77s out of sight (always on).",
      3: "Use Veil to erase memory for longer periods."
    },
    quirks: [
      { label: "Celebrated Christmas with them", delta: 10 },
      { label: "Said something heartfelt at their funeral", delta: 10 },
      { label: "Remembered something from the last Meet-Up", delta: 2, perMission: 1 },
      { label: "Made a loud noise", delta: -1 },
      { label: "Forgot a major holiday", delta: -2 }
    ],
    bondReactions: { justice: -10, fortitude: -10 }
  },
  prudence: {
    name: "Prudence", epithet: "The Negotiator", glyph: "VI", portrait: "",
    likes: ["Neat Whiskey", "Romance Novels", "Trains", "Long walks"],
    dislikes: ["Charity", "Justice", "Explaining things to slow people"],
    food: ["Nuts"],
    blasphemy: "Shake",
    bonds: {
      0: "Handshake deal: whoever breaks it suffers instant death (both aware).",
      1: "Gain the Shake blasphemy. Use once a mission.",
      2: "Rank-0 ability now applies to exorcists and sins.",
      3: "Use Shake again per mission, but GM picks the game."
    },
    quirks: [
      { label: "Mission completed without breaking any promises or agreements", delta: 3 },
      { label: "Took a long walk with them", delta: 2 },
      { label: "Made a deal with Prudence", delta: 2 },
      { label: "Broke a promise or agreement", delta: -5 }
    ],
    bondReactions: { charity: -10, justice: -10 }
  },
  chastity: {
    name: "Chastity", epithet: "The Restraint", glyph: "VII", portrait: "",
    likes: ["Phone Calls", "Online Games", "Horror Movies", "Faith"],
    dislikes: ["Charity", "Velvet", "Parties", "Skin Contact"],
    food: ["White Rice", "Potato Chips"],
    blasphemy: "—",
    bonds: {
      0: "See Harpocrates Dossier for bond abilities.",
      1: "See Harpocrates Dossier for bond abilities.",
      2: "Chastity will turn on their camera during virtual calls at this bond level.",
      3: "See Harpocrates Dossier for bond abilities."
    },
    quirks: [
      { label: "Mission completed without touching anyone", delta: 4 },
      { label: "Did a Meet-Up over call", delta: 1 },
      { label: "Committed an indecent or immodest act", delta: -2 },
      { label: "Broke your Iron Maiden", delta: -2 },
      { label: "Hurt the physically ill", delta: -3 }
    ],
    bondReactions: { faith: 3, charity: -10 }
  },
  sobriety: {
    name: "Sobriety", epithet: "The Resolute", glyph: "VIII", portrait: "",
    likes: ["Alcohol", "Recreational Drugs", "Film Noir", "Prudence"],
    dislikes: ["CAIN Orbital Lasers", "Carpet Bombing", "Staying Sober", "Pain", "Losing Bets", "Faith"],
    food: ["Rare Steak"],
    blasphemy: "—",
    bonds: {
      0: "See Harpocrates Dossier for bond abilities.",
      1: "See Harpocrates Dossier for bond abilities.",
      2: "See Harpocrates Dossier for bond abilities.",
      3: "See Harpocrates Dossier for bond abilities."
    },
    quirks: [
      { label: "Took them to a bar", delta: 5 },
      { label: "Shared a drink with them", delta: 2 },
      { label: "Stopped them from excessive drinking", delta: 1 },
      { label: "Mission completed without breaking any strictures", delta: 1 },
      { label: "Was insensitive", delta: -1 },
      { label: "Gave them a headache", delta: -2 },
      { label: "Missed a meeting with them", delta: -4 }
    ],
    bondReactions: { prudence: 3, faith: -10 }
  },
  absolution: {
    name: "Absolution", epithet: "The Mourner", glyph: "IX", portrait: "",
    likes: ["Guillotine", "Firearm Discipline", "Small Talk", "Photography", "Death Metal"],
    dislikes: ["Non-committal relationships", "Hope", "Justice", "Thunderstorms"],
    food: [],
    blasphemy: "—",
    bonds: {
      0: "Guillotine interactions vary by bond level — see Harpocrates Dossier.",
      1: "Guillotine interactions vary by bond level — see Harpocrates Dossier.",
      2: "Guillotine interactions vary by bond level — see Harpocrates Dossier.",
      3: "Guillotine interactions vary by bond level — see Harpocrates Dossier."
    },
    quirks: [],
    bondReactions: {}
  }
};

// What each bond rank means at the table (shown as a tooltip on the rank readout).
export const RANK_FLAVOR = {
  0: "They know you exist, but the relationship is strictly professional and distant.",
  1: "They know your name. You've been in a room together maybe once. You are more than nothing to them.",
  2: "You kept showing up. Not just friendly — trusted. Some things go unsaid because they don't need saying.",
  3: "There is no version of you that doesn't include them anymore. They let you in, and you don't see yourself leaving."
};

// Harpocrates Dossier tuning. Admin can override rank requirements via module settings.
export const RULES = {
  brokenAt: -5,
  brokenPenalty: 3,
  rankReq: { 1: 5, 2: 10, 3: 18 },
  conv: { perMission: 1, perMissionX2: 2, topic: 2, goodTalk: 2, connection: 2, dislike: -2 },
  contraband: { perMission: 2, perMissionX2: 3, favorite: 3, like: 3, dislike: -3, neutral: 1, hqCap: 6, haulMin: 2 },
  logMax: 40
};
