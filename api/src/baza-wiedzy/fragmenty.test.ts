import { describe, expect, it } from 'vitest';
import { podzielNaFragmenty } from './fragmenty';

describe('podział artykułu na fragmenty', () => {
  const zdanie = (n: number) => `To jest zdanie numer ${n} o przygotowaniu do pierwszych zajęć na stoku.`;
  const tekst = '# Tytuł\n\n' + Array.from({ length: 30 }, (_, i) => zdanie(i)).join(' ');

  it('fragmenty mają ok. 500 znaków i nie rozcinają zdań', () => {
    const f = podzielNaFragmenty(tekst);
    expect(f.length).toBeGreaterThan(3);
    for (const x of f) {
      expect(x.length).toBeLessThanOrEqual(500);
      expect(x).toMatch(/[.!?:]$/);
    }
  });

  it('każde zdanie trafia do jakiegoś fragmentu', () => {
    const f = podzielNaFragmenty(tekst).join(' ');
    for (let i = 0; i < 30; i++) expect(f).toContain(zdanie(i));
  });

  it('krótki artykuł to jeden fragment bez nagłówków markdown', () => {
    expect(podzielNaFragmenty('## Co zabrać\n\nKask i gogle.')).toEqual(['Co zabrać Kask i gogle.']);
  });
});
