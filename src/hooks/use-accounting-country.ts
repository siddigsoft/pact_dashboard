import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';

export interface AcCountry {
  id: string;
  code: string;
  name_en: string;
  name_ar: string | null;
  currency_code: string;
  currency_symbol: string;
  flag_emoji: string | null;
}

const lsKey = (uid: string) => `pact-acct-country-${uid}`;

export function useAccountingCountry() {
  const { currentUser } = useUser();
  const uid = currentUser?.id ?? '';

  const [countries, setCountries] = useState<AcCountry[]>([]);
  const [countryId, setCountryIdState] = useState<string>('all');
  const [profileCountryId, setProfileCountryId] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('countries')
      .select('id,code,name_en,name_ar,currency_code,currency_symbol,flag_emoji')
      .eq('is_active', true)
      .order('name_en')
      .then(({ data }) => setCountries((data ?? []) as AcCountry[]));
  }, []);

  useEffect(() => {
    if (!uid) return;
    const stored = localStorage.getItem(lsKey(uid));
    supabase
      .from('profiles')
      .select('default_country_id')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        const dbId: string = (data as { default_country_id?: string | null } | null)
          ?.default_country_id ?? 'all';
        setProfileCountryId(dbId);
        setCountryIdState(stored ?? dbId);
        setLoading(false);
      });
  }, [uid]);

  const setCountryId = useCallback(
    (id: string) => {
      setCountryIdState(id);
      if (uid) localStorage.setItem(lsKey(uid), id);
    },
    [uid],
  );

  const saveProfileCountry = useCallback(
    async (id: string): Promise<boolean> => {
      if (!uid) return false;
      const { error } = await supabase
        .from('profiles')
        .update({ default_country_id: id === 'all' ? null : id })
        .eq('id', uid);
      if (!error) {
        setProfileCountryId(id);
        setCountryIdState(id);
        if (uid) localStorage.removeItem(lsKey(uid));
      }
      return !error;
    },
    [uid],
  );

  const selectedCountry = countries.find((c) => c.id === countryId) ?? null;

  return {
    countryId,
    setCountryId,
    profileCountryId,
    saveProfileCountry,
    countries,
    selectedCountry,
    loading,
  };
}
