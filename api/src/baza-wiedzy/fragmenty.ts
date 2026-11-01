const DLUGOSC = 500;
const ZAKLADKA = 50;

// Dzieli artykuł na fragmenty ok. 500 znaków bez rozcinania zdań; zakładką są końcowe zdania poprzedniego fragmentu, jeśli mieszczą się w 50 znakach.
export function podzielNaFragmenty(markdown: string): string[] {
  const zdania = markdown
    .replace(/^#+\s*/gm, '')
    .split(/(?<=[.!?:])\s+|\n{2,}|\n(?=[-*\d])/)
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const fragmenty: string[] = [];
  let biezacy: string[] = [];
  const dlugosc = (zz: string[]) => zz.join(' ').length;

  for (const zdanie of zdania) {
    if (biezacy.length && dlugosc([...biezacy, zdanie]) > DLUGOSC) {
      fragmenty.push(biezacy.join(' '));
      const zakladka: string[] = [];
      for (let i = biezacy.length - 1; i >= 0 && dlugosc([biezacy[i], ...zakladka]) <= ZAKLADKA; i--) zakladka.unshift(biezacy[i]);
      biezacy = zakladka;
    }
    biezacy.push(zdanie);
  }
  if (biezacy.length) fragmenty.push(biezacy.join(' '));
  return fragmenty;
}
