import type { poziom_jazdy } from '@prisma/client';

export type ProfilDoboru = { wzrost_cm?: number | null; waga_kg?: number | null; rozmiar_buta_eu?: number | null; poziom_jazdy: poziom_jazdy };

const ODJAC_OD_WZROSTU: Record<poziom_jazdy, number> = { POCZATKUJACY: 15, SREDNIOZAAWANSOWANY: 10, ZAAWANSOWANY: 5 };

// Reguła z P1: wzrost − 15/10/5 cm wg poziomu; korekta o wagę ±5 cm, gdy waga odbiega o >10 kg od „wzrost − 100”.
export function zalecDlugoscNart(p: ProfilDoboru): number | null {
  if (!p.wzrost_cm) return null;
  let dl = p.wzrost_cm - ODJAC_OD_WZROSTU[p.poziom_jazdy];
  if (p.waga_kg) {
    const roznica = Number(p.waga_kg) - (p.wzrost_cm - 100);
    if (roznica > 10) dl += 5;
    if (roznica < -10) dl -= 5;
  }
  return dl;
}

export const zalecRozmiarButa = (p: ProfilDoboru) => (p.rozmiar_buta_eu ? Number(p.rozmiar_buta_eu) : null);

// Rozmiar egzemplarza jako jeden klucz: długość (narty, deska, kijki) albo rozmiar (buty, kask); null = rozmiar uniwersalny.
export const kluczRozmiaru = (e: { dlugosc_cm: number | null; rozmiar: string | null }) => e.dlugosc_cm?.toString() ?? e.rozmiar ?? null;

// Wybiera z dostępnych rozmiarów modelu ten najbliższy zaleceniu.
export function najblizszyRozmiar(zalecenie: number, rozmiary: string[]): string | null {
  const liczbowe = rozmiary.filter((r) => !Number.isNaN(Number(r)));
  if (!liczbowe.length) return null;
  return liczbowe.reduce((a, b) => (Math.abs(Number(b) - zalecenie) < Math.abs(Number(a) - zalecenie) ? b : a));
}

export function zalecenieDlaKategorii(kategoria: string, p: ProfilDoboru): { wartosc: number | null; brakuje?: string } {
  if (kategoria === 'Narty') {
    const w = zalecDlugoscNart(p);
    return w ? { wartosc: w } : { wartosc: null, brakuje: 'wzrost' };
  }
  if (kategoria === 'Buty') {
    const w = zalecRozmiarButa(p);
    return w ? { wartosc: w } : { wartosc: null, brakuje: 'rozmiar buta' };
  }
  return { wartosc: null };
}

export const liczbaDni = (od: Date, doDnia: Date) => Math.round((doDnia.getTime() - od.getTime()) / 864e5) + 1;
