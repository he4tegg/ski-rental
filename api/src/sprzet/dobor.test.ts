import { describe, expect, it } from 'vitest';
import { liczbaDni, najblizszyRozmiar, zalecDlugoscNart, zalecenieDlaKategorii } from './dobor';

describe('dobór rozmiaru', () => {
  it('długość nart wg poziomu', () => {
    expect(zalecDlugoscNart({ wzrost_cm: 180, waga_kg: 80, poziom_jazdy: 'POCZATKUJACY' })).toBe(165);
    expect(zalecDlugoscNart({ wzrost_cm: 180, waga_kg: 80, poziom_jazdy: 'SREDNIOZAAWANSOWANY' })).toBe(170);
    expect(zalecDlugoscNart({ wzrost_cm: 180, waga_kg: 80, poziom_jazdy: 'ZAAWANSOWANY' })).toBe(175);
  });
  it('korekta o wagę', () => {
    expect(zalecDlugoscNart({ wzrost_cm: 170, waga_kg: 95, poziom_jazdy: 'POCZATKUJACY' })).toBe(160);
    expect(zalecDlugoscNart({ wzrost_cm: 170, waga_kg: 50, poziom_jazdy: 'POCZATKUJACY' })).toBe(150);
  });
  it('brak wzrostu = brak zalecenia', () => {
    expect(zalecDlugoscNart({ poziom_jazdy: 'POCZATKUJACY' })).toBeNull();
    expect(zalecenieDlaKategorii('Buty', { poziom_jazdy: 'POCZATKUJACY' })).toEqual({ wartosc: null, brakuje: 'rozmiar buta' });
  });
  it('najbliższy rozmiar z dostępnych', () => {
    expect(najblizszyRozmiar(163, ['150', '160', '170'])).toBe('160');
    expect(najblizszyRozmiar(42.5, ['42', '43', '44'])).toBe('42');
    expect(najblizszyRozmiar(42, ['M', 'L'])).toBeNull();
  });
  it('liczba dni wypożyczenia włącznie z ostatnim', () => {
    expect(liczbaDni(new Date('2026-12-01'), new Date('2026-12-01'))).toBe(1);
    expect(liczbaDni(new Date('2026-12-01'), new Date('2026-12-05'))).toBe(5);
  });
});
