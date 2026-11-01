// StraznikTresci: proste reguły przed i po modelu (F-40, wymagania bezpieczeństwa AI).

const WULGARYZMY = /\b(kurw\w*|chuj\w*|pierdol\w*|jeb\w*|spierdal\w*|skurwy\w*|pizd\w*)\b/i;
const ZDROWIE = /(uraz|kontuzj|złama|zlama|boli|ból|bol\b|krwaw|skręc|skrec|zwichn|stłucz|stlucz|wypad(ek|ku)|lekarz|omdl|nieprzytomn|guz)/i;

export const OSTRZEZENIE_MEDYCZNE =
  '\n\nNie stawiam diagnoz. Przy bólu lub urazie skonsultuj się z lekarzem, a w nagłym wypadku na stoku dzwoń do GOPR: 985 lub na numer alarmowy 112.';
export const ODMOWA_WULGARNA = 'Chętnie pomogę, ale proszę o pytanie bez wulgaryzmów.';
export const BRAK_W_BAZIE =
  'Nie mam tej informacji w zatwierdzonej bazie wiedzy, więc nie chcę zgadywać. Zapytaj proszę instruktora. Przekazałem pytanie administratorowi, żeby uzupełnił bazę.';

export const czyWulgarne = (t: string) => WULGARYZMY.test(t);
export const czyZdrowotne = (t: string) => ZDROWIE.test(t);

export const LIMIT_DZIENNY = { gosc: 20, zalogowany: 100 };
