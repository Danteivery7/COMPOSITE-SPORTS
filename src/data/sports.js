function svgDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const HUB_TILE_META = {
  nhl: {
    subline: 'Live ice, rankings, and predictor',
    base: '#0b2747',
    baseAlt: '#154d7b',
    hover: '#123b68',
    hoverAlt: '#37b8ff',
    icon: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <defs>
          <radialGradient id="g" cx="40%" cy="28%" r="68%">
            <stop offset="0%" stop-color="#76d4ff"/>
            <stop offset="55%" stop-color="#2f7ec5"/>
            <stop offset="100%" stop-color="#0b1830"/>
          </radialGradient>
        </defs>
        <ellipse cx="80" cy="94" rx="46" ry="22" fill="url(#g)"/>
        <ellipse cx="80" cy="94" rx="46" ry="22" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="5"/>
        <ellipse cx="80" cy="94" rx="28" ry="10" fill="rgba(255,255,255,0.08)"/>
      </svg>
    `),
  },
  mlb: {
    subline: 'Ballpark board, rankings, and players',
    base: '#3a2417',
    baseAlt: '#87502c',
    hover: '#5a331d',
    hoverAlt: '#d9894c',
    icon: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="48" fill="#fff8ef"/>
        <circle cx="80" cy="80" r="48" fill="none" stroke="#e9dccf" stroke-width="4"/>
        <path d="M55 44c-10 12-16 26-16 36s6 24 16 36" fill="none" stroke="#cf4d49" stroke-width="5" stroke-linecap="round"/>
        <path d="M105 44c10 12 16 26 16 36s-6 24-16 36" fill="none" stroke="#cf4d49" stroke-width="5" stroke-linecap="round"/>
        <path d="M48 58c8 4 12 8 16 16M48 72c8 4 12 8 16 16M48 86c8 4 12 8 16 16" fill="none" stroke="#cf4d49" stroke-width="3" stroke-linecap="round"/>
        <path d="M112 58c-8 4-12 8-16 16M112 72c-8 4-12 8-16 16M112 86c-8 4-12 8-16 16" fill="none" stroke="#cf4d49" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `),
  },
  nba: {
    subline: 'Hardwood board, live slate, and bets',
    base: '#4c1d12',
    baseAlt: '#c45b22',
    hover: '#71301a',
    hoverAlt: '#ff9148',
    icon: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <defs>
          <radialGradient id="g" cx="34%" cy="28%" r="66%">
            <stop offset="0%" stop-color="#ffcb84"/>
            <stop offset="45%" stop-color="#f08a2a"/>
            <stop offset="100%" stop-color="#a94712"/>
          </radialGradient>
        </defs>
        <circle cx="80" cy="80" r="49" fill="url(#g)"/>
        <path d="M80 31v98M31 80h98" stroke="#5d2407" stroke-width="6" stroke-linecap="round"/>
        <path d="M54 36c-12 10-19 26-19 44s7 34 19 44M106 36c12 10 19 26 19 44s-7 34-19 44" fill="none" stroke="#5d2407" stroke-width="5" stroke-linecap="round"/>
      </svg>
    `),
  },
  cbb: {
    subline: 'Campus hoops, bracket energy, and boards',
    base: '#4a300e',
    baseAlt: '#b27d1a',
    hover: '#654015',
    hoverAlt: '#efb63f',
    icon: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <defs>
          <radialGradient id="g" cx="34%" cy="28%" r="66%">
            <stop offset="0%" stop-color="#ffe3a1"/>
            <stop offset="45%" stop-color="#e5a134"/>
            <stop offset="100%" stop-color="#8f5515"/>
          </radialGradient>
        </defs>
        <circle cx="62" cy="82" r="38" fill="url(#g)"/>
        <path d="M62 44v76M24 82h76" stroke="#4f2808" stroke-width="5" stroke-linecap="round"/>
        <path d="M118 48h18v18h-10v18h-8V48zm0 30h18v18h-10v18h-8V78zm0 30h18v18h-10v18h-8v-36z" fill="#fff3c2" opacity=".9"/>
      </svg>
    `),
  },
  nfl: {
    subline: 'Field control, roster board, and odds',
    base: '#14311b',
    baseAlt: '#41732f',
    hover: '#1f4826',
    hoverAlt: '#77d957',
    icon: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <defs>
          <radialGradient id="g" cx="34%" cy="28%" r="66%">
            <stop offset="0%" stop-color="#9a653f"/>
            <stop offset="55%" stop-color="#6d3a1e"/>
            <stop offset="100%" stop-color="#30170b"/>
          </radialGradient>
        </defs>
        <path d="M40 82c0-23 20-42 40-42s40 19 40 42-20 42-40 42-40-19-40-42z" fill="url(#g)" transform="rotate(-18 80 82)"/>
        <path d="M58 82h44" stroke="#f7ead8" stroke-width="5" stroke-linecap="round" transform="rotate(-18 80 82)"/>
        <path d="M75 72v20M82 72v20M89 72v20" stroke="#f7ead8" stroke-width="3" stroke-linecap="round" transform="rotate(-18 80 82)"/>
      </svg>
    `),
  },
  football: {
    subline: 'Global football hub and match boards',
    base: '#18274a',
    baseAlt: '#3d5ea8',
    hover: '#263d73',
    hoverAlt: '#8db1ff',
    icon: svgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="48" fill="#f7fbff"/>
        <circle cx="80" cy="80" r="48" fill="none" stroke="#d9e4f3" stroke-width="4"/>
        <polygon points="80,48 93,57 88,72 72,72 67,57" fill="#1a2234"/>
        <polygon points="54,65 66,58 72,72 62,82 48,78" fill="#1a2234"/>
        <polygon points="106,65 118,78 104,82 88,72 94,58" fill="#1a2234"/>
        <polygon points="61,102 72,88 88,88 98,102 80,114" fill="#1a2234"/>
      </svg>
    `),
  },
};

export const SPORT_CONFIGS = {
  hub: {
    title: 'COMPOSITE Sports',
    subtitle: 'Pick a sport, trigger its own arrival sequence, and let the board boot around you.',
  },
  nhl: {
    key: 'nhl',
    label: 'NHL',
    name: 'Composite NHL',
    path: '/nhl',
    type: 'vendor',
    nativeIntro: true,
    accent: '#32b7ff',
    accentAlt: '#86f0ff',
    surface: 'radial-gradient(circle at top, rgba(43,125,255,0.35), rgba(4,9,22,0.96) 65%)',
    cardBlurb: 'The original rink build. Same code, same tunnel, same live ice.',
    introEyebrow: 'Arena Tunnel',
    introTitle: 'Enter The Rink',
    introCopy: 'This route boots the original NHL composite code directly, wrapped inside the COMPOSITE Sports shell.',
    enterLabel: 'Open NHL Composite',
    motif: 'ice',
    hoverLabel: 'Skate-line sweep',
    theme: {
      hub: { accent: '#32b7ff', accentAlt: '#86f0ff', glow: 'rgba(50, 183, 255, 0.3)' },
      dark: { base: '#081019', surface: '#10233b', accent: '#4bb8cb' },
      light: { base: '#edf4fb', surface: '#f8fbff', accent: '#0d6f7e' },
      hoverCue: 'Ice glow and puck trail',
    },
  },
  mlb: {
    key: 'mlb',
    label: 'MLB',
    name: 'Composite MLB',
    path: '/mlb',
    type: 'mlb',
    alwaysShowIntro: true,
    accent: '#c46b36',
    accentAlt: '#f1dfba',
    surface: 'radial-gradient(circle at top, rgba(91,133,79,0.28), rgba(10,12,10,0.97) 56%, rgba(58,37,22,0.98) 100%)',
    cardBlurb: 'The baseball engine now sits inside a true night-game shell with chalk, clay, scoreboard light, and ballpark texture.',
    introEyebrow: 'Clubhouse Lights',
    introTitle: 'Walk The Baseline',
    introCopy: 'Same MLB logic, but the arrival now leans into dugout shadows, batting-cage echoes, chalk lines, and a stadium-lit baseball atmosphere that feels nothing like NBA.',
    enterLabel: 'Step Into The Park',
    motif: 'diamond',
    hoverLabel: 'Chalk-line flash',
    theme: {
      hub: { accent: '#c46b36', accentAlt: '#f1dfba', glow: 'rgba(196, 107, 54, 0.28)' },
      dark: { base: '#0a100d', surface: '#241810', accent: '#c46b36' },
      light: { base: '#ece0c8', surface: '#fff6e7', accent: '#a8572c' },
      hoverCue: 'Stitched spin and scoreboard flicker',
    },
  },
  nba: {
    key: 'nba',
    label: 'NBA',
    name: 'Composite NBA',
    path: '/nba',
    type: 'vendor',
    alwaysShowIntro: true,
    accent: '#ff6a3d',
    accentAlt: '#ffcc70',
    surface: 'radial-gradient(circle at top, rgba(152,41,18,0.42), rgba(14,8,8,0.96) 72%)',
    cardBlurb: 'A hardwood route with the original NBA engine running inside a new cinematic shell.',
    introEyebrow: 'Arena Blackout',
    introTitle: 'Enter The Arena',
    introCopy: 'The NBA composite boots from its copied source while the route layers in a jumbotron wake-up, shot-clock flash, and hardwood-reflection arrival before the floor opens up.',
    enterLabel: 'Take The Court',
    motif: 'court',
    hoverLabel: 'Court-line pulse',
    theme: {
      hub: { accent: '#ff6a3d', accentAlt: '#ffcc70', glow: 'rgba(255, 106, 61, 0.3)' },
      dark: { base: '#110b09', surface: '#1c120f', accent: '#f97316' },
      light: { base: '#f6eee6', surface: '#fff9f4', accent: '#c2410c' },
      hoverCue: 'Ball bounce and hardwood pulse',
    },
  },
  cbb: {
    key: 'cbb',
    label: 'CBB',
    name: 'Composite College Basketball',
    path: '/cbb',
    type: 'generic',
    alwaysShowIntro: true,
    accent: '#f5a623',
    accentAlt: '#ffe88f',
    surface: 'radial-gradient(circle at top, rgba(132,78,10,0.4), rgba(10,8,7,0.97) 70%)',
    cardBlurb: 'Full D-I men’s basketball with a first-pass composite layer, roster crawl, and leaderboard-driven player board.',
    introEyebrow: 'Bracket Reveal',
    introTitle: 'Walk Into March',
    introCopy: 'Power conferences, mid-majors, arena lights, and a roster-wide player board now rise through a bracket-reveal sequence instead of another generic tunnel.',
    enterLabel: 'Open CBB Board',
    motif: 'bracket',
    hoverLabel: 'Bracket spark',
    theme: {
      hub: { accent: '#f5a623', accentAlt: '#ffe88f', glow: 'rgba(245, 166, 35, 0.28)' },
      dark: { base: '#140d09', surface: '#25160c', accent: '#f5a623' },
      light: { base: '#fbf1d8', surface: '#fff7e7', accent: '#b97212' },
      hoverCue: 'Bracket spark and upset-board flicker',
    },
  },
  nfl: {
    key: 'nfl',
    label: 'NFL',
    name: 'Composite NFL',
    path: '/nfl',
    type: 'generic',
    alwaysShowIntro: true,
    accent: '#75e44d',
    accentAlt: '#b9ff9a',
    surface: 'radial-gradient(circle at top, rgba(31,99,29,0.38), rgba(4,12,7,0.97) 70%)',
    cardBlurb: 'Live drives, standings-weighted power scores, and a roster-wide player crawl in a stadium-night shell.',
    introEyebrow: 'Kickoff Broadcast',
    introTitle: 'Break The Huddle',
    introCopy: 'The NFL route launches with a field-level broadcast intro, play-sheet marks, stadium lights, and a live board built for both desktop and mobile.',
    enterLabel: 'Charge The Field',
    motif: 'yardline',
    hoverLabel: 'Play-diagram sweep',
    theme: {
      hub: { accent: '#75e44d', accentAlt: '#b9ff9a', glow: 'rgba(117, 228, 77, 0.28)' },
      dark: { base: '#06100a', surface: '#112216', accent: '#75e44d' },
      light: { base: '#e1efd6', surface: '#f5fbef', accent: '#4b8a2d' },
      hoverCue: 'Yard-line sweep and flag flare',
    },
  },
  football: {
    key: 'football',
    label: 'Football',
    name: 'Composite Football',
    path: '/football',
    type: 'football',
    nativeIntro: true,
    accent: '#8db1ff',
    accentAlt: '#edf3ff',
    surface: 'radial-gradient(circle at top, rgba(84, 113, 255, 0.34), rgba(7, 9, 19, 0.97) 72%)',
    cardBlurb: 'A full football hub with marquee matches, league selection, and club or player boards across MLS and Europe.',
    introEyebrow: 'Match-Night Lights',
    introTitle: 'Enter Composite Football',
    introCopy: 'Floodlights power on, the tifo rises, and the pitch lines cut in before you drop into MLS, the Premier League, La Liga, Serie A, Ligue 1, or Champions League.',
    enterLabel: 'Enter The Pitch',
    motif: 'pitch',
    hoverLabel: 'Floodlight sweep',
    theme: {
      hub: { accent: '#8db1ff', accentAlt: '#edf3ff', glow: 'rgba(141, 177, 255, 0.3)' },
      dark: { base: '#071019', surface: '#131a2d', accent: '#8db1ff' },
      light: { base: '#e9eefb', surface: '#fbfcff', accent: '#4a67c4' },
      hoverCue: 'Net ripple and floodlight sweep',
    },
  },
  mls: {
    key: 'mls',
    label: 'MLS',
    name: 'Composite Football: MLS',
    path: '/mls',
    type: 'generic',
    alwaysShowIntro: true,
    accent: '#ff507d',
    accentAlt: '#ffc2d3',
    surface: 'radial-gradient(circle at top, rgba(156,41,90,0.34), rgba(9,5,10,0.97) 70%)',
    cardBlurb: 'A floodlit football route with standings, squad boards, match cards, and first-pass player ratings.',
    introEyebrow: 'Pink Match Night',
    introTitle: 'Walk Into The Pitch',
    introCopy: 'MLS gets its own league-night arrival, predictor rail, and roster-wide player board inside the larger Football hub.',
    enterLabel: 'Enter The Pitch',
    motif: 'pitch',
    hoverLabel: 'Net ripple',
    theme: {
      hub: { accent: '#ff507d', accentAlt: '#ffc2d3', glow: 'rgba(255, 80, 125, 0.26)' },
      dark: { base: '#080b0a', surface: '#141d17', accent: '#ff507d' },
      light: { base: '#f6ebe8', surface: '#fff8f6', accent: '#d83467' },
      hoverCue: 'Net ripple and floodlight sweep',
    },
  },
};

export function getSportConfig(key) {
  return SPORT_CONFIGS[key];
}

export function getSportCards() {
  return ['nhl', 'mlb', 'nba', 'cbb', 'nfl', 'football'].map((key) => ({
    ...SPORT_CONFIGS[key],
    hubTile: HUB_TILE_META[key],
  }));
}
