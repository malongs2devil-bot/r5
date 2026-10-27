import { AssetOverrideDoc } from '../types/game';

export interface AssetManifest {
  overrides: AssetOverrideDoc[];
}

class AssetManifestManager {
  private manifest: AssetManifest | null = null;
  private listeners = new Set<() => void>();

  public async loadManifest(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      this.manifest = await response.json();
      console.log('Asset Manifest Loaded:', this.manifest);
      this.notify();
    } catch (err) {
      console.error('Failed to load asset manifest:', err);
    }
  }

  public getAsset(slotKey: string) {
    return this.manifest?.overrides.find(o => o.slotKey === slotKey);
  }

  public getOverrides() {
    return this.manifest?.overrides || [];
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}

export const assetManifest = new AssetManifestManager();
