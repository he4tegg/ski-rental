import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Rola = 'KLIENT' | 'INSTRUKTOR' | 'PRACOWNIK' | 'ADMIN';
export type Uzytkownik = { id_uzytkownika: number; email: string; imie: string; nazwisko: string; rola: Rola };

// Access token tylko w pamięci; refresh token siedzi w ciasteczku HttpOnly.
let accessToken: string | null = null;
let odswiezanie: Promise<boolean> | null = null;

async function odswiez() {
  odswiezanie ??= fetch('/api/v1/auth/odswiez', { method: 'POST' })
    .then(async (r) => {
      if (!r.ok) return false;
      const d = await r.json();
      accessToken = d.accessToken;
      ustawUzytkownika?.(d.uzytkownik);
      return true;
    })
    .finally(() => (odswiezanie = null));
  return odswiezanie;
}

export const naglowki = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-sesja-goscia': sesjaGoscia(),
  ...(accessToken && { authorization: `Bearer ${accessToken}` }),
});

export async function api<T = any>(sciezka: string, opcje: { method?: string; body?: unknown } = {}, ponow = true): Promise<T> {
  const r = await fetch(`/api/v1${sciezka}`, { method: opcje.method ?? 'GET', headers: naglowki(), body: opcje.body === undefined ? undefined : JSON.stringify(opcje.body) });
  if (r.status === 401 && ponow && accessToken && (await odswiez())) return api(sciezka, opcje, false);
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? `Błąd ${r.status}`);
  return r.json();
}

export function sesjaGoscia() {
  let s = localStorage.getItem('sesjaGoscia');
  if (!s) localStorage.setItem('sesjaGoscia', (s = crypto.randomUUID()));
  return s;
}

let ustawUzytkownika: ((u: Uzytkownik | null) => void) | null = null;
const Kontekst = createContext<{ ja: Uzytkownik | null; gotowe: boolean; zaloguj: (email: string, haslo: string) => Promise<void>; wyloguj: () => Promise<void> }>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ja, setJa] = useState<Uzytkownik | null>(null);
  const [gotowe, setGotowe] = useState(false);
  useEffect(() => {
    ustawUzytkownika = setJa;
    odswiez().finally(() => setGotowe(true));
  }, []);
  const zaloguj = async (email: string, haslo: string) => {
    const d = await api('/auth/logowanie', { method: 'POST', body: { email, haslo } });
    accessToken = d.accessToken;
    setJa(d.uzytkownik);
  };
  const wyloguj = async () => {
    await api('/auth/wyloguj', { method: 'POST' }).catch(() => {});
    accessToken = null;
    setJa(null);
  };
  return <Kontekst.Provider value={{ ja, gotowe, zaloguj, wyloguj }}>{children}</Kontekst.Provider>;
}

export const useAuth = () => useContext(Kontekst);

// Hook do prostych odczytów: dane, błąd, ponowne pobranie.
export function useDane<T>(sciezka: string | null) {
  const [dane, setDane] = useState<T | null>(null);
  const [blad, setBlad] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!sciezka) return;
    let aktywny = true;
    api<T>(sciezka)
      .then((d) => aktywny && (setDane(d), setBlad('')))
      .catch((e) => aktywny && setBlad(e.message));
    return () => {
      aktywny = false;
    };
  }, [sciezka, n]);
  return { dane, blad, odswiez: () => setN((x) => x + 1) };
}

export const zl = (v: number | string) => `${Number(v).toFixed(2).replace('.', ',')} zł`;
export const data = (v: string) => new Date(v).toLocaleDateString('pl-PL');
export const POZIOMY: Record<string, string> = { POCZATKUJACY: 'Początkujący', SREDNIOZAAWANSOWANY: 'Średniozaawansowany', ZAAWANSOWANY: 'Zaawansowany' };
