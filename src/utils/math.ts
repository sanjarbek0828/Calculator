/**
 * math.ts — Precise arithmetic engine using decimal.js
 *
 * All calculations go through Decimal to avoid IEEE 754 floating-point
 * errors (e.g. 0.1 + 0.2 = 0.3, not 0.30000000000000004).
 */

import Decimal from 'decimal.js';

// Configure Decimal for high precision and clean output
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type Operation = '+' | '-' | '×' | '÷' | '%';

/**
 * Perform an arithmetic operation on two string-encoded numbers.
 * Returns the result as a clean string (no trailing zeros).
 */
export function calculate(
  left: string,
  right: string,
  operation: Operation
): string {
  try {
    const a = new Decimal(left);
    const b = new Decimal(right);

    let result: Decimal;

    switch (operation) {
      case '+':
        result = a.plus(b);
        break;
      case '-':
        result = a.minus(b);
        break;
      case '×':
        result = a.times(b);
        break;
      case '÷':
        if (b.isZero()) {
          return 'Error';
        }
        result = a.dividedBy(b);
        break;
      case '%':
        // Percentage: treat as a % of left (e.g. 200 % 10 = 20)
        result = a.times(b).dividedBy(100);
        break;
      default:
        return left;
    }

    return formatResult(result);
  } catch {
    return 'Error';
  }
}

/**
 * Negate a string-encoded number.
 */
export function negate(value: string): string {
  if (value === '0' || value === 'Error') return value;
  try {
    const d = new Decimal(value);
    return formatResult(d.negated());
  } catch {
    return value;
  }
}

/**
 * Calculate percentage of a single value (e.g. 50 → 0.5).
 */
export function percentOf(value: string): string {
  try {
    const d = new Decimal(value);
    return formatResult(d.dividedBy(100));
  } catch {
    return value;
  }
}

/**
 * Format a Decimal result into a clean display string.
 * - Removes trailing zeros
 * - Caps at 12 significant digits for display
 * - Uses scientific notation for very large/small numbers
 */
function formatResult(d: Decimal): string {
  // Cap precision for display
  const rounded = d.toSignificantDigits(12);

  // Convert to string and clean up
  let str = rounded.toString();

  // If the number is extremely large or small, use scientific notation
  if (str.length > 15 && !str.includes('e')) {
    str = d.toExponential(8);
  }

  return str;
}

/**
 * Check if a string represents a valid number for calculation.
 */
export function isValidNumber(value: string): boolean {
  if (!value || value === 'Error') return false;
  try {
    new Decimal(value);
    return true;
  } catch {
    return false;
  }
}
