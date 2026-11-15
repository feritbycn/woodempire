/** Kalıcı oyun durumunun varsayılan hali. Kayıt sistemi bu yapıyı saklar. */
export const SAVE_VERSION = 1;

export function defaultState() {
  return {
    v: SAVE_VERSION,
    money: 0,
    gold: 10,
    xp: 0,
    level: 1,
    player: { x: 4, z: 10, yaw: 0, stack: [], up: { speed: 0, capacity: 0, chop: 0, power: 0, collect: 0 }, skin: 'classic', skins: ['classic'] },
    zones: [0],
    sites: {},          // siteId -> { built, up:{}, in:[], out:[] }
    trees: {},          // ağaç anahtarı -> kalan yeniden büyüme süresi (sn)
    ground: [],         // yerdeki kütükler [wood, x, z]
    conveyors: {},
    animals: {},        // zoneId -> satın alınan ek hayvan sayısı
    feed: {},           // zoneId -> yemlikteki yem      // id -> { up:{speed,capacity}, items:[[kind,wood,d]] }
    workers: [],        // { role, target, stack, x, z, premium }
    workerUp: { slots: 0, speed: 0, capacity: 0, efficiency: 0 },
    forklifts: [],      // { x, z, stack, mode }
    forkliftUp: { capacity: 0, speed: 0, lift: 0, loading: 0, fuel: 0 },
    trucks: { tier: 0, owned: [0], up: { speed: 0, bonus: 0, load: 0 }, golden: false, docks: {} },
    stats: {},
    missions: { main: 0, current: null, generated: 0, completed: 0 },
    daily: { day: '', streak: 0, claimedDay: '', quests: [], adsToday: 0, adDay: '' },
    achievements: {},
    sales: [],
    boosts: {},         // ad -> bitiş zamanı (oyun-içi gerçek zaman ms)
    purchases: {},      // IAP hakları
    processedOrders: [],
    tutorial: { done: false },
    settings: { music: 0, musicV2: true, sfx: 0.8, quality: 'medium', autoChop: true, haptics: true, joystickLeft: true },
    lastSeen: Date.now(),
    autoRate: 0,
    autoXpRate: 0,
    created: Date.now(),
    playTime: 0,
    cloud: { uid: null, name: null }, // bulut kimliği ve benzersiz kullanıcı adı
  };
}
