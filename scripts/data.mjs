// CAIN Cardinal Virtuoso — Virtue dataset (Vol. 1 core, 6 virtues)
export const VIRTUES = {
  justice: {
    name: "Justice", epithet: "The Executioner", glyph: "I",
    likes: ["Religious Debate", "Classical Music", "Cleanliness"],
    dislikes: ["Charity", "Tardiness", "Dogs"],
    food: ["Health Food", "Dates"],
    blasphemy: "Law",
    bonds: {
      0: "Extra XP trigger: Did you uphold the dogma of CAIN?",
      1: "Gain the Law blasphemy. Use once a mission.",
      2: "Lower sin by 1 after halving. Executed \u2192 \u22121 more; spared/failed \u2192 +1d3 instead.",
      3: "You may choose two different effects for Law."
    }
  },
  faith: {
    name: "Faith", epithet: "The Timid", glyph: "II",
    likes: ["Dogs", "Slow Afternoons", "Taking Photos", "Gachapon", "Phone Games", "Fighting Games"],
    dislikes: ["Fortitude", "Rude people", "Work", "Horror Movies"],
    food: ["Fast Food", "Sweets", "Hot Chicken"],
    blasphemy: "Null",
    bonds: {
      0: "Once a mission, if you can eat sweets, relieve 1 sin.",
      1: "Gain the Null blasphemy. Use once a mission.",
      2: "Sin overflow reduces your cap by 1 instead of 2.",
      3: "Null becomes the Immaculate Defiance of Heaven (irreversible)."
    }
  },
  charity: {
    name: "Charity", epithet: "The Twins", glyph: "III",
    likes: ["Fashion", "Arguing online", "Travel", "Rainy days"],
    dislikes: ["Justice", "Faith", "Boring people", "Long conversations"],
    food: ["High tea", "Pork dumplings"],
    blasphemy: "Entwine",
    bonds: {
      0: "Telepathy with any one exorcist via skin-to-skin contact.",
      1: "Gain the Entwine blasphemy.",
      2: "At mission start, borrow one agenda ability from a party member for the mission.",
      3: "Powers targeting 'self' can target any exorcist you are Entwined with."
    }
  },
  fortitude: {
    name: "Fortitude", epithet: "The Disaster", glyph: "IV",
    likes: ["Fighting", "Strong Opponents"],
    dislikes: ["Humans", "Exorcists", "All other virtues", "Sins", "CAIN leadership"],
    food: ["Hot Dogs (per CASTLE addendum 3004: nutrient paste only)"],
    blasphemy: "Strength",
    bonds: {
      0: "Never roll 0d for harm/violence (always \u22651d).",
      1: "Any harm you inflict is instantly fatal to humans.",
      2: "Gain Strength; safe once a mission. Second use \u2192 instant death at scene end.",
      3: "You can safely use Strength a second time."
    }
  },
  hope: {
    name: "Hope", epithet: "The Dreamer", glyph: "V",
    likes: ["Video Games", "Luxurious Baths", "Holidays"],
    dislikes: ["Loud Noises", "Nosy people", "Justice", "Fortitude"],
    food: ["Pre-packed meal 402A"],
    blasphemy: "Veil",
    bonds: {
      0: "Once a mission, re-roll any stealth/avoid-notice action; take the second result.",
      1: "Gain the Veil blasphemy. Use once a mission.",
      2: "Mundane humans forget you after 77s out of sight (always on).",
      3: "Use Veil to erase memory for longer periods."
    }
  },
  prudence: {
    name: "Prudence", epithet: "The Negotiator", glyph: "VI",
    likes: ["Neat Whiskey", "Romance Novels", "Trains", "Long walks"],
    dislikes: ["Charity", "Justice", "Explaining things to slow people"],
    food: ["Nuts"],
    blasphemy: "Shake",
    bonds: {
      0: "Handshake deal: whoever breaks it suffers instant death (both aware).",
      1: "Gain the Shake blasphemy. Use once a mission.",
      2: "Rank-0 ability now applies to exorcists and sins.",
      3: "Use Shake again per mission, but GM picks the game."
    }
  }
};

// Fan-made SEER+TEMERITY tuning. Admin can override via module settings.
export const RULES = {
  brokenAt: -5,
  brokenPenalty: 3,
  rankReq: { 1: 3, 2: 8, 3: 15 },
  conv: { perMission: 1, perMissionX2: 2, topic: 2, goodTalk: 2, connection: 2, dislike: -2 },
  contraband: { perMission: 2, perMissionX2: 3, favorite: 3, like: 3, dislike: -3, neutral: 1, hqCap: 6 }
};
