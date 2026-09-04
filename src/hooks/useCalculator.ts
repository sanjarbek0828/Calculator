/**
 * useCalculator.ts - Calculator logic hook (v2 - Optimized)
 *
 * Uses useReducer instead of 6 separate useState calls.
 * Every button press causes exactly ONE render (not 3-6).
 *
 * All arithmetic is delegated to math.ts (decimal.js) for
 * floating-point-safe results.
 */

import { useReducer, useCallback, useRef } from 'react';
import { calculate, negate as mathNegate, percentOf, Operation } from '../utils/math';
import { useVaultAuth } from './useVaultAuth';

interface CalcState {
  display: string;
  expression: string;
  previousValue: string | null;
  operation: Operation | null;
  isResult: boolean;
  waitingForOperand: boolean;
}

const INITIAL_STATE: CalcState = {
  display: '0',
  expression: '',
  previousValue: null,
  operation: null,
  isResult: false,
  waitingForOperand: false,
};

type Action =
  | { type: 'INPUT_DIGIT'; digit: string }
  | { type: 'INPUT_DECIMAL' }
  | { type: 'SELECT_OPERATION'; op: Operation }
  | { type: 'CALCULATE' }
  | { type: 'CLEAR' }
  | { type: 'ALL_CLEAR' }
  | { type: 'TOGGLE_SIGN' }
  | { type: 'PERCENT' }
  | { type: 'BACKSPACE' }
  | { type: 'RESET' };

function calcReducer(state: CalcState, action: Action): CalcState {
  switch (action.type) {
    case 'INPUT_DIGIT': {
      const { digit } = action;
      if (state.isResult || state.waitingForOperand) {
        return { ...state, display: digit, isResult: false, waitingForOperand: false };
      }
      const newDisplay = state.display === '0' ? digit : state.display + digit;
      if (newDisplay.replace(/[^0-9]/g, '').length > 15) return state;
      return { ...state, display: newDisplay };
    }
    case 'INPUT_DECIMAL': {
      if (state.isResult || state.waitingForOperand) {
        return { ...state, display: '0.', isResult: false, waitingForOperand: false };
      }
      if (state.display.includes('.')) return state;
      return { ...state, display: state.display + '.' };
    }
    case 'SELECT_OPERATION': {
      const { op } = action;
      if (state.operation && state.previousValue && !state.waitingForOperand) {
        const result = calculate(state.previousValue, state.display, state.operation);
        return { ...state, display: result, previousValue: result, expression: `${result} ${op}`, operation: op, waitingForOperand: true, isResult: false };
      }
      return { ...state, previousValue: state.display, expression: `${state.display} ${op}`, operation: op, waitingForOperand: true, isResult: false };
    }
    case 'CALCULATE': {
      if (!state.operation || !state.previousValue) {
        return { ...state, isResult: true };
      }
      const result = calculate(state.previousValue, state.display, state.operation);
      return { ...INITIAL_STATE, display: result, expression: `${state.previousValue} ${state.operation} ${state.display} =`, isResult: true };
    }
    case 'CLEAR':
      return { ...state, display: '0' };
    case 'ALL_CLEAR':
      return { ...INITIAL_STATE };
    case 'TOGGLE_SIGN':
      return { ...state, display: mathNegate(state.display) };
    case 'PERCENT': {
      if (state.operation && state.previousValue) {
        const pct = calculate(state.previousValue, state.display, '%');
        return { ...state, display: pct };
      }
      return { ...state, display: percentOf(state.display) };
    }
    case 'BACKSPACE': {
      if (state.isResult) return state;
      const prev = state.display;
      if (prev.length <= 1 || prev === '-0') return { ...state, display: '0' };
      const newVal = prev.slice(0, -1);
      return { ...state, display: newVal === '-' ? '0' : newVal };
    }
    case 'RESET':
      return { ...INITIAL_STATE };
    default:
      return state;
  }
}

export function useCalculator(onVaultUnlocked: () => void) {
  const [state, dispatch] = useReducer(calcReducer, INITIAL_STATE);
  const rawInput = useRef<string>('');
  const { attemptPinEntry } = useVaultAuth();

  const inputDigit = useCallback((digit: string) => {
    rawInput.current += digit;
    dispatch({ type: 'INPUT_DIGIT', digit });
  }, []);

  const inputDecimal = useCallback(() => {
    rawInput.current += '.';
    dispatch({ type: 'INPUT_DECIMAL' });
  }, []);

  const selectOperation = useCallback((op: Operation) => {
    rawInput.current = '';
    dispatch({ type: 'SELECT_OPERATION', op });
  }, []);

  const pressEquals = useCallback(async () => {
    const candidate = rawInput.current;
    rawInput.current = '';
    if (candidate && /^\d{4,6}$/.test(candidate)) {
      const isVaultPin = await attemptPinEntry(candidate);
      if (isVaultPin) {
        dispatch({ type: 'RESET' });
        onVaultUnlocked();
        return;
      }
    }
    dispatch({ type: 'CALCULATE' });
  }, [attemptPinEntry, onVaultUnlocked]);

  const clear = useCallback(() => {
    rawInput.current = '';
    dispatch({ type: 'CLEAR' });
  }, []);

  const allClear = useCallback(() => {
    rawInput.current = '';
    dispatch({ type: 'ALL_CLEAR' });
  }, []);

  const toggleSign = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIGN' });
  }, []);

  const percent = useCallback(() => {
    dispatch({ type: 'PERCENT' });
  }, []);

  const backspace = useCallback(() => {
    rawInput.current = rawInput.current.slice(0, -1);
    dispatch({ type: 'BACKSPACE' });
  }, []);

  return {
    display: state.display,
    expression: state.expression,
    inputDigit,
    inputDecimal,
    selectOperation,
    pressEquals,
    clear,
    allClear,
    toggleSign,
    percent,
    backspace,
    showAC: state.display === '0' && !state.operation,
  };
}
