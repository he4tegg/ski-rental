// Dane startowe: konta dla każdej roli, katalog sprzętu z egzemplarzami i artykuły bazy wiedzy. Uruchamia się tylko na pustej bazie.
import * as argon2 from 'argon2';
import { db } from './db';
import { zaplanujIndeksowanie } from './baza-wiedzy/indeksowanie';

const ARTYKULY: [string, string, string][] = [
  [
    'Przygotowanie do pierwszych zajęć',
    'Jak przygotować się do pierwszej lekcji jazdy na nartach',
    `Na pierwszą lekcję przyjdź 20–30 minut wcześniej. Tyle czasu zajmuje odbiór sprzętu w wypożyczalni, dopasowanie butów i ustawienie wiązań.

Dzień wcześniej wyśpij się i zjedz normalne śniadanie. Jazda na nartach męczy bardziej, niż się wydaje, szczególnie pierwszego dnia.

Nie musisz mieć żadnej kondycji sportowej, ale warto kilka dni wcześniej zrobić proste przysiady i rozciąganie ud i łydek. Mięśnie nóg pracują najwięcej.

Instruktor zaczyna od płaskiego terenu: zakładanie nart, poruszanie się na jednej narcie, podchodzenie pod górkę i zatrzymywanie się pługiem. Na wyciąg wjeżdża się dopiero wtedy, gdy umiesz bezpiecznie hamować.`,
  ],
  [
    'Co zabrać',
    'Co zabrać na stok: lista dla początkujących',
    `Ubierz się warstwowo. Na ciało bielizna termoaktywna (nie bawełna, bo trzyma pot), na to polar lub cienka bluza, a na wierzch kurtka i spodnie narciarskie odporne na wodę.

Zabierz jedną parę długich skarpet narciarskich. Nie zakładaj dwóch par, bo but zaczyna uciskać i stopa szybciej marznie.

Potrzebne są rękawice narciarskie, komin lub buff na szyję oraz cienka czapka pod kask. Kask i gogle możesz wypożyczyć u nas razem z nartami.

Weź krem z filtrem UV i pomadkę ochronną. Na śniegu słońce odbija się mocno nawet w pochmurny dzień.

Przyda się mała butelka wody i coś słodkiego do kieszeni. Dokument tożsamości jest potrzebny przy odbiorze sprzętu z wypożyczalni.`,
  ],
  [
    'Bezpieczeństwo i unikanie kontuzji',
    'Jak unikać kontuzji na nartach',
    `Najczęstsze kontuzje początkujących dotyczą kolan. Chroni je dobrze ustawione wiązanie, dlatego przy odbiorze sprzętu podaj prawdziwą wagę, wzrost i poziom jazdy.

Zawsze jedź w kasku. Kask chroni głowę przy upadku i przy zderzeniu z innym narciarzem.

Rozgrzej się przed pierwszym zjazdem: krążenia ramion i bioder, przysiady, wymachy nóg. Wystarczy pięć minut.

Najwięcej wypadków zdarza się po południu, gdy nogi są zmęczone. Rób przerwy i skończ jazdę, zanim poczujesz, że tracisz kontrolę.

Jedź z prędkością, przy której możesz zatrzymać się w każdej chwili, i wybieraj trasy odpowiednie do swojego poziomu. Trasy oznaczone kolorem niebieskim są najłatwiejsze.`,
  ],
  [
    'Jak upadać i wstawać',
    'Jak bezpiecznie upaść i wstać na nartach',
    `Upadki są normalną częścią nauki. Jeśli czujesz, że tracisz równowagę, nie walcz z tym na siłę i nie odchylaj się do tyłu.

Najbezpieczniej upaść na bok i na biodro, z rękami przed sobą. Nie podpieraj się wyprostowaną ręką, bo łatwo o uraz nadgarstka lub kciuka.

Żeby wstać, ustaw narty poprzecznie do stoku, równolegle do siebie, poniżej ciała. Przysuń biodra do nart, oprzyj się kijkami po stronie stoku i podnieś się, przenosząc ciężar nad narty.

Jeśli narta się wypięła, wpinaj ją od dołu stoku: najpierw dolną nartę ustaw poprzecznie, potem wsuń czubek buta w przednią część wiązania i mocno dociśnij piętę.`,
  ],
  [
    'Zasady zachowania na stoku',
    'Dziesięć zasad zachowania na stoku',
    `Na stoku obowiązują zasady Międzynarodowej Federacji Narciarskiej (FIS). Najważniejsze z nich są proste.

Narciarz jadący niżej ma pierwszeństwo. Ten, kto jest wyżej, wybiera tor jazdy tak, żeby nie zagrażać osobom poniżej.

Wyprzedzać można z każdej strony, ale w takiej odległości, żeby wyprzedzany miał miejsce na swoje skręty.

Nie zatrzymuj się w wąskich miejscach ani za załamaniem stoku, gdzie nie widać cię z góry. Po upadku jak najszybciej zejdź z trasy.

Przy wypadku każdy ma obowiązek udzielić pomocy. Numer ratunkowy w górach to GOPR 985 lub numer alarmowy 112.`,
  ],
  [
    'Przygotowanie do pierwszych zajęć',
    'Jak wygląda sprzęt i jak go nosić',
    `Komplet do nauki to narty z wiązaniami, buty narciarskie, kijki i kask. Dla początkujących wydajemy krótsze i miękkie narty, bo łatwiej nimi skręcać.

Buty narciarskie są sztywne i to jest normalne. Dobrze dopasowany but trzyma piętę i nie pozwala stopie przesuwać się na boki; palce mogą lekko dotykać przodu. Klamry zapinaj od dołu do góry.

Narty nosi się na ramieniu, ślizgami do siebie i czubkami do przodu, albo w ręce, spięte razem. Uważaj na osoby obok przy odwracaniu się.

Wiązania ustawia pracownik wypożyczalni według Twojej wagi, wzrostu, rozmiaru buta i poziomu jazdy. Nie przestawiaj ich samodzielnie.`,
  ],
];

async function main() {
  if (await db.uzytkownik.count()) return console.log('Baza ma już dane, pomijam seed.');
  const haslo = await argon2.hash(process.env.SEED_HASLO ?? 'Haslo123!');
  const konto = (email: string, imie: string, nazwisko: string, rola: any, telefon?: string) =>
    db.uzytkownik.create({ data: { email, imie, nazwisko, rola, telefon, haslo_hash: haslo, email_potwierdzony: true, profil_klienta: { create: {} } } });
  const admin = await konto('admin@npi.local', 'Anna', 'Administrator', 'ADMIN');
  await konto('pracownik@npi.local', 'Paweł', 'Pracownik', 'PRACOWNIK');
  const klient = await konto('klient@npi.local', 'Karol', 'Klient', 'KLIENT', '600100200');
  await db.profil_klienta.update({ where: { id_klienta: klient.id_uzytkownika }, data: { wzrost_cm: 178, waga_kg: 75, rozmiar_buta_eu: 43, poziom_jazdy: 'POCZATKUJACY' } });

  const kat: Record<string, number> = {};
  for (const nazwa of ['Narty', 'Buty', 'Kijki', 'Kask', 'Gogle', 'Snowboard'])
    kat[nazwa] = (await db.kategoria_sprzetu.create({ data: { nazwa } })).id_kategorii;

  const model = async (k: string, producent: string, nazwa: string, poziom: any, cena: number, kaucja: number, opis: string, egz: { dl?: number; r?: string }[]) => {
    const m = await db.model_sprzetu.create({ data: { id_kategorii: kat[k], producent, nazwa, poziom_docelowy: poziom, cena_za_dzien: cena, kaucja, opis } });
    let i = 1;
    for (const e of egz)
      await db.egzemplarz.create({
        data: { id_modelu: m.id_modelu, kod_inwentarzowy: `${k.slice(0, 2).toUpperCase()}-${m.id_modelu}-${String(i++).padStart(3, '0')}`, dlugosc_cm: e.dl, rozmiar: e.r },
      });
  };
  const dlugosci = (...d: number[]) => d.flatMap((x) => [{ dl: x }, { dl: x }]);
  await model('Narty', 'Atomic', 'Redster X5', 'POCZATKUJACY', 60, 300, 'Miękkie narty allround, łatwe w skręcie.', dlugosci(140, 150, 160, 170));
  await model('Narty', 'Rossignol', 'Experience 78', 'SREDNIOZAAWANSOWANY', 80, 400, 'Stabilne narty na przygotowane trasy.', dlugosci(150, 160, 170, 180));
  await model('Narty', 'Völkl', 'Racetiger SL', 'ZAAWANSOWANY', 120, 600, 'Narty slalomowe dla zaawansowanych.', dlugosci(155, 165));
  await model('Buty', 'Salomon', 'Select 70', 'POCZATKUJACY', 30, 150, 'Wygodne buty z miękką cholewką (flex 70).', ['38', '39', '40', '41', '42', '43', '44', '45'].flatMap((r) => [{ r }, { r }]));
  await model('Kijki', 'Leki', 'Neolite', null, 10, 30, 'Lekkie kijki aluminiowe.', [110, 115, 120, 125, 130].map((dl) => ({ dl })));
  await model('Kask', 'Uvex', 'Manic', null, 15, 100, 'Kask z regulacją obwodu.', ['S', 'M', 'L'].flatMap((r) => [{ r }, { r }]));
  await model('Gogle', 'Oakley', 'Line Miner', null, 12, 80, 'Gogle z szybą na zmienne warunki.', [{}, {}, {}]);
  await model('Snowboard', 'Burton', 'Ripcord', 'POCZATKUJACY', 70, 400, 'Deska z miękkim flexem do nauki.', [{ dl: 150 }, { dl: 155 }, { dl: 160 }]);

  const katW: Record<string, number> = {};
  const nazwyKategorii = ['Przygotowanie do pierwszych zajęć', 'Co zabrać', 'Bezpieczeństwo i unikanie kontuzji', 'Jak upadać i wstawać', 'Zasady zachowania na stoku'];
  for (const [i, nazwa] of nazwyKategorii.entries()) katW[nazwa] = (await db.kategoria_wiedzy.create({ data: { nazwa, kolejnosc: i } })).id_kategorii_wiedzy;
  for (const [k, tytul, tresc] of ARTYKULY) {
    const a = await db.artykul.create({
      data: { id_kategorii_wiedzy: katW[k], id_autora: admin.id_uzytkownika, id_zatwierdzajacego: admin.id_uzytkownika, tytul, tresc_markdown: tresc, status: 'OPUBLIKOWANY', data_publikacji: new Date() },
    });
    await zaplanujIndeksowanie(a.id_artykulu);
  }
  console.log('Seed gotowy: konta admin@npi.local, pracownik@npi.local, klient@npi.local');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
