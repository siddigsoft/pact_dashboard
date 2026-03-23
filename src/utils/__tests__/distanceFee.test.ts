import { describe, it, expect } from 'vitest';
import { calculateDistanceFee } from '../distanceFee';

// Khartoum base: 15.5007, 32.5599
describe('calculateDistanceFee', () => {
  it('returns 0 for the base location itself', () => {
    expect(calculateDistanceFee(15.5007, 32.5599)).toBe(0);
  });

  it('returns a positive fee for any other location', () => {
    expect(calculateDistanceFee(15.6, 32.6)).toBeGreaterThan(0);
  });

  it('Port Sudan (~673 km NE) — fee is roughly 33 650 SDG', () => {
    // Port Sudan: 19.6158° N, 37.2164° E — ~673 km great-circle from Khartoum
    const fee = calculateDistanceFee(19.6158, 37.2164);
    expect(fee).toBeGreaterThan(31_000);
    expect(fee).toBeLessThan(36_000);
  });

  it('El Fasher (~803 km W) — fee is roughly 40 169 SDG', () => {
    // El Fasher: 13.6288° N, 25.3493° E — ~803 km great-circle from Khartoum
    const fee = calculateDistanceFee(13.6288, 25.3493);
    expect(fee).toBeGreaterThan(38_000);
    expect(fee).toBeLessThan(43_000);
  });

  it('is symmetric — same distance in any direction gives the same fee', () => {
    const north = calculateDistanceFee(15.5007 + 1, 32.5599);
    const south = calculateDistanceFee(15.5007 - 1, 32.5599);
    // ~111 km difference, allow 1 km rounding
    expect(Math.abs(north - south)).toBeLessThan(100);
  });

  it('uses Haversine — longitude degrees are cos-corrected near the equator', () => {
    // At 15° N, 1° longitude ≈ 107 km, 1° latitude ≈ 111 km.
    // The Euclidean (old) formula would treat them as equal.
    const latFee = calculateDistanceFee(15.5007 + 1, 32.5599); // 1° N
    const lngFee = calculateDistanceFee(15.5007, 32.5599 + 1); // 1° E
    // Longitude should be slightly cheaper (shorter distance)
    expect(lngFee).toBeLessThan(latFee);
  });

  it('handles extreme coordinates without throwing', () => {
    expect(() => calculateDistanceFee(90, 180)).not.toThrow();
    expect(() => calculateDistanceFee(-90, -180)).not.toThrow();
  });
});
