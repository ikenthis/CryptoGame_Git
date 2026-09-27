import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MAX_PRICE, MetaError, giveItem, grant, itemLabel, marketFee, parseMarketItem, takeItem, type MarketItem, type Profile,
} from '@gentium/engine';
import type { ProfileStore } from './profiles.ts';
import { StoreError } from './store.ts';

// Mercado entre jugadores. El objeto en venta sale del perfil del vendedor y queda
// en custodia hasta que alguien lo compra (pasa al comprador) o se cancela
// (vuelve al vendedor). Así un mismo objeto nunca puede venderse dos veces.

export interface Listing {
  id: string;
  seller: string;
  item: MarketItem;
  label: string;
  price: number;
  createdAt: number;
}

export const MAX_LISTINGS_PER_PLAYER = 20;

export class MarketStore {
  private listings = new Map<string, Listing>();
  private readonly file: string | undefined;
  private readonly profiles: ProfileStore;

  constructor(profiles: ProfileStore, file?: string) {
    this.profiles = profiles;
    this.file = file;
    if (file) mkdirSync(dirname(file), { recursive: true });
    if (file && existsSync(file)) {
      for (const l of JSON.parse(readFileSync(file, 'utf8')) as Listing[]) this.listings.set(l.id, l);
    }
  }

  list(): Array<Listing & { sellerName: string }> {
    return [...this.listings.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((l) => ({ ...l, sellerName: this.profiles.name(l.seller) }));
  }

  create(seller: string, name: string, rawItem: unknown, rawPrice: unknown, now: number): { listing: Listing; profile: Profile } {
    const item = guard(() => parseMarketItem(rawItem));
    if (!Number.isSafeInteger(rawPrice) || (rawPrice as number) < 1 || (rawPrice as number) > MAX_PRICE) {
      throw new StoreError(400, `El precio debe ser un número entero entre 1 y ${MAX_PRICE} de oro.`);
    }
    if ([...this.listings.values()].filter((l) => l.seller === seller).length >= MAX_LISTINGS_PER_PLAYER) {
      throw new StoreError(409, `Máximo ${MAX_LISTINGS_PER_PLAYER} ventas activas a la vez.`);
    }
    const { profile } = this.profiles.update(seller, name, now, (p) => ({ profile: guard(() => takeItem(p, item)), value: null }));
    const listing: Listing = { id: randomBytes(8).toString('hex'), seller, item, label: itemLabel(item), price: rawPrice as number, createdAt: now };
    this.listings.set(listing.id, listing);
    this.save();
    return { listing, profile };
  }

  buy(buyer: string, name: string, id: string, now: number): { listing: Listing; profile: Profile } {
    const listing = this.listings.get(id) ?? fail404();
    if (listing.seller === buyer) throw new StoreError(409, 'No puedes comprar tu propia venta.');
    const { profile } = this.profiles.update(buyer, name, now, (p) => {
      if (p.resources.gold < listing.price) throw new StoreError(402, 'No tienes oro suficiente.');
      const paid = { ...p, resources: { ...p.resources, gold: p.resources.gold - listing.price } };
      return { profile: giveItem(paid, listing.item), value: null };
    });
    // El vendedor cobra el precio menos la comisión, que desaparece del juego.
    this.profiles.update(listing.seller, '', now, (p) => ({ profile: grant(p, { resources: { gold: listing.price - marketFee(listing.price) } }), value: null }));
    this.listings.delete(id);
    this.save();
    return { listing, profile };
  }

  cancel(seller: string, name: string, id: string, now: number): Profile {
    const listing = this.listings.get(id) ?? fail404();
    if (listing.seller !== seller) throw new StoreError(403, 'Solo el vendedor puede retirar esta venta.');
    const { profile } = this.profiles.update(seller, name, now, (p) => ({ profile: giveItem(p, listing.item), value: null }));
    this.listings.delete(id);
    this.save();
    return profile;
  }

  private save(): void {
    if (!this.file) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.listings.values()]));
    renameSync(tmp, this.file);
  }
}

function fail404(): never {
  throw new StoreError(404, 'Esa venta ya no existe.');
}

/** Convierte los errores de reglas del juego en respuestas 400 legibles. */
export function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof MetaError) throw new StoreError(400, err.message);
    throw err;
  }
}
