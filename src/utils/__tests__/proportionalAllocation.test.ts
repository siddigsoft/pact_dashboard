import { describe, expect, it } from 'vitest';
import { allocateExactProportionally } from '@/utils/proportionalAllocation';

describe('allocateExactProportionally', () => {
  it('preserves an exact fixed total after proportional rounding', () => {
    const allocations = allocateExactProportionally(
      Array.from({ length: 15 }, (_, index) => ({
        id: String(index + 1),
        amount: index === 14 ? 12_299.02 : 12_299.22,
      })),
      129_000,
    );

    expect(allocations.reduce((sum, row) => sum + Math.round(row.amount * 100), 0)).toBe(12_900_000);
    expect(allocations.every(row => row.amount <= 12_299.22)).toBe(true);
  });

  it('caps the requested total at the available balance', () => {
    const allocations = allocateExactProportionally(
      [{ id: 'a', amount: 40 }, { id: 'b', amount: 60 }],
      150,
    );

    expect(allocations).toEqual([
      { id: 'a', amount: 40 },
      { id: 'b', amount: 60 },
    ]);
  });

  it('uses stable largest-remainder rounding at cent precision', () => {
    const allocations = allocateExactProportionally(
      [{ id: 'a', amount: 1 }, { id: 'b', amount: 1 }, { id: 'c', amount: 1 }],
      1,
    );

    expect(allocations).toEqual([
      { id: 'a', amount: 0.34 },
      { id: 'b', amount: 0.33 },
      { id: 'c', amount: 0.33 },
    ]);
  });
});