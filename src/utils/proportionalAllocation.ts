export type ProportionalAllocationInput = {
  id: string;
  amount: number;
};

export type ProportionalAllocationResult = {
  id: string;
  amount: number;
};

/**
 * Splits an exact target proportionally using largest-remainder allocation.
 * Integer minor units ensure the returned rows add up to the requested total
 * without silently gaining or losing value through per-row rounding.
 */
export function allocateExactProportionally(
  inputs: ProportionalAllocationInput[],
  requestedTotal: number,
  decimalPlaces = 2,
): ProportionalAllocationResult[] {
  const factor = 10 ** decimalPlaces;
  const normalized = inputs.map((input, index) => ({
    id: input.id,
    index,
    minorAmount: BigInt(Math.max(0, Math.round(input.amount * factor))),
  }));
  const availableMinor = normalized.reduce((sum, input) => sum + input.minorAmount, 0n);
  const requestedMinor = BigInt(Math.max(0, Math.round(requestedTotal * factor)));
  const targetMinor = requestedMinor > availableMinor ? availableMinor : requestedMinor;

  if (availableMinor === 0n || targetMinor === 0n) {
    return normalized.map(input => ({ id: input.id, amount: 0 }));
  }

  const rows = normalized.map(input => {
    const numerator = input.minorAmount * targetMinor;
    return {
      ...input,
      allocatedMinor: numerator / availableMinor,
      remainder: numerator % availableMinor,
    };
  });
  let undistributed = targetMinor - rows.reduce((sum, row) => sum + row.allocatedMinor, 0n);

  const remainderOrder = [...rows].sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (const row of remainderOrder) {
    if (undistributed === 0n) break;
    if (row.allocatedMinor < row.minorAmount) {
      row.allocatedMinor += 1n;
      undistributed -= 1n;
    }
  }

  return rows
    .sort((a, b) => a.index - b.index)
    .map(row => ({
      id: row.id,
      amount: Number(row.allocatedMinor) / factor,
    }));
}