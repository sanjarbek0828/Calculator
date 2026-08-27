/**
 * useCalculator.ts — Calculator logic hook
 *
 * Manages the entire state of the calculator display and input,
 * including the hidden vault-entry check on every "=" press.
 *
 * All arithmetic is delegated to math.ts (decimal.js) for
 * floating-point-safe results.
 */

import { useState, useCallback, useRef } from 'react';
import { calculate, negate as mathNegate, percentOf, Operation, isValidNumber } from '../utils/math';
import { useVaultAuth } from './useVaultAuth';

interface CalculatorState {
  /** The value currently shown on the display */
  display: string;
  /** The expression shown above the main result (e.g. "12 + 3") */
  expression: string;
  /** Whether the display is showing a fresh result (next digit input should clear) */
  isResult: boolean;
}

export function useCalculator(onVaultUnlocked: () => void) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [isResult, setIsResult] = useState(false);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  // Track the raw digit sequence the user has typed (for PIN matching)
  const rawInput = useRef<string>('');

  const { attemptPinEntry } = useVaultAuth();

  // ── Digit input ─────────────────────────────────────────────────

  const inputDigit = useCallback(
    (digit: string) => {
      if (isResult || waitingForOperand) {
        // Starting a new number after a result or operator
        setDisplay(digit);
        setIsResult(false);
        setWaitingForOperand(false);

        if (isResult) {
          // After pressing "=", a new digit starts fresh input
          rawInput.current = digit;
        } else {
          rawInput.current += digit;
        }
      } else {
        // Appending to current number
        const newDisplay = display === '0' ? digit : display + digit;
        // Limit display length
        if (newDisplay.replace(/[^0-9]/g, '').length > 15) return;
        setDisplay(newDisplay);
        rawInput.current += digit;
      }
    },
    [display, isResult, waitingForOperand]
  );

  // ── Decimal point ───────────────────────────────────────────────

  const inputDecimal = useCallback(() => {
    if (isResult || waitingForOperand) {
      setDisplay('0.');
      setIsResult(false);
      setWaitingForOperand(false);
      rawInput.current = '0.';
      return;
    }

    if (display.includes('.')) return; // Already has decimal
    setDisplay(display + '.');
    rawInput.current += '.';
  }, [display, isResult, waitingForOperand]);

  // ── Operator selection ──────────────────────────────────────────

  const selectOperation = useCallback(
    (op: Operation) => {
      if (operation && previousValue && !waitingForOperand) {
        // Chain: compute the pending operation first
        const result = calculate(previousValue, display, operation);
        setDisplay(result);
        setPreviousValue(result);
        setExpression(`${result} ${op}`);
      } else {
        setPreviousValue(display);
        setExpression(`${display} ${op}`);
      }

      setOperation(op);
      setWaitingForOperand(true);
      setIsResult(false);
      rawInput.current = '';
    },
    [display, operation, previousValue, waitingForOperand]
  );

  // ── Equals ──────────────────────────────────────────────────────

  const pressEquals = useCallback(async () => {
    // ── SECRET CHECK: silently test if the current raw input is a vault PIN ──
    const candidate = rawInput.current;
    if (candidate && /^\d{4,6}$/.test(candidate)) {
      const isVaultPin = await attemptPinEntry(candidate);
      if (isVaultPin) {
        // Reset calculator to neutral state before opening vault
        setDisplay('0');
        setExpression('');
        setPreviousValue(null);
        setOperation(null);
        setIsResult(false);
        setWaitingForOperand(false);
        rawInput.current = '';
        onVaultUnlocked();
        return;
      }
    }

    // ── Normal calculation ──────────────────────────────────────────
    if (operation && previousValue) {
      const result = calculate(previousValue, display, operation);
      setExpression(`${previousValue} ${operation} ${display} =`);
      setDisplay(result);
      setPreviousValue(null);
      setOperation(null);
      setIsResult(true);
      setWaitingForOperand(false);
      rawInput.current = '';
    } else {
      // No pending operation — just mark as result
      setIsResult(true);
      rawInput.current = '';
    }
  }, [display, operation, previousValue, attemptPinEntry, onVaultUnlocked]);

  // ── Clear / All Clear ───────────────────────────────────────────

  const clear = useCallback(() => {
    setDisplay('0');
    rawInput.current = '';
  }, []);

  const allClear = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setPreviousValue(null);
    setOperation(null);
    setIsResult(false);
    setWaitingForOperand(false);
    rawInput.current = '';
  }, []);

  // ── Sign toggle (±) ────────────────────────────────────────────

  const toggleSign = useCallback(() => {
    setDisplay((prev) => mathNegate(prev));
  }, []);

  // ── Percentage ─────────────────────────────────────────────────

  const percent = useCallback(() => {
    if (operation && previousValue) {
      // e.g. 200 + 10% → compute 10% of 200 = 20, then 200 + 20
      const pctValue = calculate(previousValue, display, '%');
      setDisplay(pctValue);
    } else {
      setDisplay((prev) => percentOf(prev));
    }
  }, [display, operation, previousValue]);

  // ── Backspace ──────────────────────────────────────────────────

  const backspace = useCallback(() => {
    if (isResult) return;
    setDisplay((prev) => {
      if (prev.length <= 1 || prev === '-0') return '0';
      const newVal = prev.slice(0, -1);
      return newVal === '-' ? '0' : newVal;
    });
    rawInput.current = rawInput.current.slice(0, -1);
  }, [isResult]);

  return {
    display,
    expression,
    inputDigit,
    inputDecimal,
    selectOperation,
    pressEquals,
    clear,
    allClear,
    toggleSign,
    percent,
    backspace,
    /** Whether display shows "C" (has input) or "AC" (already clear) */
    showAC: display === '0' && !operation,
  };
}
