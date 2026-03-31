import { useState, useCallback, useEffect } from 'react';
import { useUser } from '@/context/user/UserContext';
import {
  CurrencyPreference,
  DEFAULT_CURRENCY_PREFERENCE,
  loadCurrencyPreference,
  saveCurrencyPreference,
  convertAmount,
  formatCurrencyAmount,
  formatCurrencyAmountWithCode,
} from '@/utils/currencyUtils';

export function useCurrencyPreference() {
  const { currentUser } = useUser();
  const userId = currentUser?.id ?? 'guest';

  const [preference, setPreference] = useState<CurrencyPreference>(() =>
    loadCurrencyPreference(userId)
  );

  useEffect(() => {
    setPreference(loadCurrencyPreference(userId));
  }, [userId]);

  const updatePreference = useCallback(
    (updates: Partial<CurrencyPreference>) => {
      setPreference(prev => {
        const next = { ...prev, ...updates };
        saveCurrencyPreference(userId, next);
        return next;
      });
    },
    [userId]
  );

  const setIncomeCurrency = useCallback(
    (code: string) => updatePreference({ incomeCurrency: code }),
    [updatePreference]
  );

  const setExpenseCurrency = useCallback(
    (code: string) => updatePreference({ expenseCurrency: code }),
    [updatePreference]
  );

  const resetToDefault = useCallback(() => {
    saveCurrencyPreference(userId, DEFAULT_CURRENCY_PREFERENCE);
    setPreference({ ...DEFAULT_CURRENCY_PREFERENCE });
  }, [userId]);

  const formatIncome = useCallback(
    (amount: number, sourceCurrency?: string) => {
      const from = sourceCurrency ?? preference.incomeCurrency;
      const converted = convertAmount(amount, from, preference.incomeCurrency);
      return formatCurrencyAmountWithCode(converted, preference.incomeCurrency);
    },
    [preference.incomeCurrency]
  );

  const formatExpense = useCallback(
    (amount: number, sourceCurrency?: string) => {
      const from = sourceCurrency ?? preference.expenseCurrency;
      const converted = convertAmount(amount, from, preference.expenseCurrency);
      return formatCurrencyAmountWithCode(converted, preference.expenseCurrency);
    },
    [preference.expenseCurrency]
  );

  const formatIncomeCompact = useCallback(
    (amount: number, sourceCurrency?: string) => {
      const from = sourceCurrency ?? preference.incomeCurrency;
      const converted = convertAmount(amount, from, preference.incomeCurrency);
      return formatCurrencyAmount(converted, preference.incomeCurrency, { compact: true });
    },
    [preference.incomeCurrency]
  );

  const formatExpenseCompact = useCallback(
    (amount: number, sourceCurrency?: string) => {
      const from = sourceCurrency ?? preference.expenseCurrency;
      const converted = convertAmount(amount, from, preference.expenseCurrency);
      return formatCurrencyAmount(converted, preference.expenseCurrency, { compact: true });
    },
    [preference.expenseCurrency]
  );

  return {
    preference,
    incomeCurrency: preference.incomeCurrency,
    expenseCurrency: preference.expenseCurrency,
    setIncomeCurrency,
    setExpenseCurrency,
    resetToDefault,
    updatePreference,
    formatIncome,
    formatExpense,
    formatIncomeCompact,
    formatExpenseCompact,
  };
}
