import * as THREE from 'three';
import { MACHINES, XP } from '../config/balance.js';
import { makePad, popIn, animatePads } from './Stations.js';
import { mat } from '../world/Materials.js';

/**
 * İnşaat alanları: sahip olunan bölgelerdeki kurulmamış makine/binalar.
 * Oyuncu alana girince "İnşa Et" düğmesi çıkar; satın alınca bina yerden yükselir.
 */
export class ConstructionSystem {
  constructor(game) {
    this.game = game;
    this.pending = new Map(); // siteId -> { site, pad, ghost }
  }

  siteName(site) { return site.name || MACHINES[site.machine]?.name || site.id; }

  /** Bir bölgenin sitelerini kur: kayıtta kuruluysa istasyon oluştur, değilse inşaat alanı aç */
  setupZoneSites(zone) {
    const saved = this.game.state.sites;
    for (const site of zone.sites) {
      if (this.game.sites.has(site.id) || this.pending.has(site.id)) continue;
      if (site.cost === 0 || saved[site.id]?.built) this.createStation(site, saved[site.id]);
      else this.addSite(site, zone);
    }
  }

  addSite(site, zone) {
    const g = this.game;
    // temel / iskele görseli
    const ghost = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(site.type === 'warehouse' ? 11 : 8, 0.15, site.type === 'warehouse' ? 7 : 3), mat(0xbcaaa4, { transparent: true, opacity: 0.75 }));
    base.position.y = 0.08; base.receiveShadow = true; ghost.add(base);
    const coneM = mat(0xff7043);
    for (const [x, z] of [[-3.5, -1], [3.5, -1], [-3.5, 1], [3.5, 1]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), coneM); c.position.set(x, 0.3, z); c.castShadow = true; ghost.add(c);
    }
    ghost.position.set(site.x, 0, site.z);
    g.scene.add(ghost);
    const pad = makePad(g, {
      x: site.x, z: site.z + (site.type === 'warehouse' ? 5 : site.type === 'dock' ? 0 : 2.5), mode: 'build', type: 'build', r: 1.5,
      label: () => ({ title: this.siteName(site), price: site.cost, level: site.level }),
      data: { site, zone },
    });
    this.pending.set(site.id, { site, pad, ghost, zone });
  }

  canBuild(siteId) {
    const p = this.pending.get(siteId);
    return p && this.game.economy.canAfford(p.site.cost);
  }

  build(siteId) {
    const g = this.game;
    const p = this.pending.get(siteId);
    if (!p) return false;
    if (!g.economy.spend(p.site.cost, 'build')) return false;
    g.removePad(p.pad);
    p.ghost.removeFromParent();
    this.pending.delete(siteId);
    const st = this.createStation(p.site, null);
    g.state.sites[siteId] = { built: true };
    const grp = st.group || st.model?.group;
    if (grp) popIn(grp, g);
    g.fx.dust(p.site.x, p.site.z); g.fx.confetti(p.site.x, 3, p.site.z, 50);
    g.audio.play('build');
    g.haptic('heavy');
    g.stat('sitesBuilt'); if (p.site.type === 'machine') g.stat('machinesBuilt');
    g.stat('built_' + siteId);
    g.levels.addXP(XP.buyMachine * (1 + Math.log10(Math.max(10, p.site.cost))));
    g.bus.emit('built', { site: p.site, station: st });
    g.bus.emit('toast', { text: `${this.siteName(p.site)} kuruldu!`, type: 'success' });
    g.save.requestSave(true);
    return true;
  }

  createStation(site, saved) {
    const st = this._create(site, saved);
    if (st) { st.zone = site.zone ?? null; st.importOnly = site.importOnly ?? null; }
    return st;
  }
  _create(site, saved) {
    const g = this.game;
    switch (site.type) {
      case 'depot': return g.storage.createDepot(site, saved);
      case 'warehouse': return g.storage.createWarehouse(site, saved);
      case 'machine': return g.production.create(site, saved);
      case 'dock': return g.trucks.createDock(site, saved);
      case 'office': return g.workers.createOffice(site, saved);
      case 'garage': return g.vehicles.createGarage(site, saved);
    }
    return null;
  }

  update(dt) { animatePads(this.game); }
}
