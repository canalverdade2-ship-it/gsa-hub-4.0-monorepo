import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getWishlist, isInWishlist, toggleWishlist, removeFromWishlist } from '../lib/wishlistStorage';

// Simple in-memory localStorage mock for node test runner
const memoryStorage: Record<string, string> = {};
const mockStorage = {
  getItem: (key: string) => memoryStorage[key] || null,
  setItem: (key: string, value: string) => { memoryStorage[key] = value; },
  removeItem: (key: string) => { delete memoryStorage[key]; },
  clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]); },
  length: 0,
  key: (index: number) => Object.keys(memoryStorage)[index] || null,
} as any;

global.localStorage = mockStorage;

if (typeof window === 'undefined') {
  (global as any).window = {
    localStorage: mockStorage,
    sessionStorage: mockStorage,
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (global as any).CustomEvent = class CustomEvent {
    type: string;
    constructor(type: string) { this.type = type; }
  };
} else {
  (window as any).localStorage = mockStorage;
  (window as any).sessionStorage = mockStorage;
}

describe('Wishlist Storage & Database Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should return empty array when no items are saved', () => {
    expect(getWishlist('client-123')).toEqual([]);
    expect(isInWishlist('prod-1', 'client-123')).toBe(false);
  });

  it('should toggle item in wishlist correctly for client', async () => {
    const isAdded = await toggleWishlist('prod-1', 'client-123');
    expect(isAdded).toBe(true);
    expect(isInWishlist('prod-1', 'client-123')).toBe(true);
    expect(getWishlist('client-123')).toEqual(['prod-1']);

    const isRemoved = await toggleWishlist('prod-1', 'client-123');
    expect(isRemoved).toBe(false);
    expect(isInWishlist('prod-1', 'client-123')).toBe(false);
    expect(getWishlist('client-123')).toEqual([]);
  });

  it('should remove item from wishlist correctly', async () => {
    await toggleWishlist('prod-1', 'client-123');
    await toggleWishlist('prod-2', 'client-123');
    expect(getWishlist('client-123')).toEqual(['prod-1', 'prod-2']);

    const remaining = await removeFromWishlist('prod-1', 'client-123');
    expect(remaining).toEqual(['prod-2']);
    expect(isInWishlist('prod-1', 'client-123')).toBe(false);
    expect(isInWishlist('prod-2', 'client-123')).toBe(true);
  });

  it('should maintain guest favorites separately from logged in clients', async () => {
    await toggleWishlist('prod-guest', null);
    expect(isInWishlist('prod-guest', null)).toBe(true);
    expect(isInWishlist('prod-guest', 'client-123')).toBe(false);
  });

  it('should preserve locally favorited items and never erase them when DB returns empty', async () => {
    // Client favorited an item locally
    await toggleWishlist('prod-local-1', 'client-123');
    expect(getWishlist('client-123')).toEqual(['prod-local-1']);

    // fetchWishlistFromDb is called (simulating page load)
    const { fetchWishlistFromDb } = await import('../lib/wishlistStorage');
    const result = await fetchWishlistFromDb('client-123');

    // The local item MUST still be in the wishlist!
    expect(result).toContain('prod-local-1');
    expect(getWishlist('client-123')).toContain('prod-local-1');
  });

  it('should merge guest items into authenticated client wishlist upon fetchWishlistFromDb', async () => {
    // Guest saved an item
    await toggleWishlist('prod-guest-item', null);
    expect(getWishlist(null)).toEqual(['prod-guest-item']);

    // User logs in and calls fetchWishlistFromDb
    const { fetchWishlistFromDb } = await import('../lib/wishlistStorage');
    const result = await fetchWishlistFromDb('client-456');

    // The guest item is now part of the user wishlist
    expect(result).toContain('prod-guest-item');
    expect(getWishlist('client-456')).toContain('prod-guest-item');
  });
});
