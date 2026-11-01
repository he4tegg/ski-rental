# System wypożyczalni sprzętu i szkółki narciarskiej z asystentem AI

MVP na 03.11 według opisu projektu (tabela 4.1): wypożyczalnia sprzętu oraz baza wiedzy z asystentem AI dla początkujących. Dobór instruktora, lekcje, opinie i płatności Stripe są w etapie 01.12; schemat bazy obejmuje już wszystkie 26 tabel.

## Uruchomienie

```bash
cp .env.example .env    # ustaw JWT_SECRET i ANTHROPIC_API_KEY (u Ciebie .env już jest)
docker compose up --build
```

Pierwszy start pobiera model embeddingów `bge-m3` (ok. 1,2 GB), kolejne korzystają z wolumenu.

| Adres | Co to |
| --- | --- |
| http://localhost:8088 | Aplikacja (port zmienisz przez `WEB_PORT` w `.env`) |
| http://localhost:3000/api/docs | Dokumentacja API (Swagger) |
| http://localhost:8025 | Mailpit: e-maile z linkiem potwierdzającym rejestrację |

Konta testowe (hasło `Haslo123!`, zmienisz przez `SEED_HASLO`): `admin@npi.local`, `pracownik@npi.local`, `klient@npi.local`.

## Scenariusz sprawdzenia (ok. 10 minut)

1. **Rejestracja (F-01).** „Załóż konto” → wypełnij formularz → otwórz http://localhost:8025, kliknij link z e-maila → zaloguj się nowym kontem.
2. **Profil i dobór rozmiaru (F-04, F-09).** Kliknij swoje imię w menu, wpisz wzrost, wagę, rozmiar buta i poziom → „Zapisz”. W katalogu ustaw daty „Od/Do”, otwórz Atomic Redster X5: rozmiar ze ★ to zalecana długość (wzrost − 15 cm dla początkującego).
3. **Rezerwacja (F-06, F-11, F-17).** „Dodaj do koszyka” dla nart i butów → „Koszyk” → „Zarezerwuj”. W „Moje rezerwacje” widać kod `R-…`; tu można też anulować (F-12).
4. **Wydanie (F-13, F-14).** Wyloguj się, zaloguj jako `pracownik@npi.local` → „Obsługa” → kliknij rezerwację (albo wyszukaj po kodzie lub nazwisku) → wybierz egzemplarze → „Wydaj sprzęt”. Wydanie działa w dniach rezerwacji, więc do testu rezerwuj od dziś.
5. **Zwrot ze szkodą (F-16).** W tej samej rezerwacji wpisz opis uszkodzenia i opłatę przy jednym egzemplarzu → „Przyjmij zwrot”. Pojawi się rozliczenie kaucji, a egzemplarz trafi do serwisu (zakładka „Magazyn”).
6. **Wypożyczenie na miejscu (F-15).** „Obsługa” → „Wypożyczenie na miejscu” → dane klienta i pozycje → od razu przechodzisz do wydania.
7. **Asystent (F-33, F-34, F-39, F-40).** Przycisk „Zapytaj asystenta” w prawym dolnym rogu. Pytania: „Co zabrać na pierwsze zajęcia?” (odpowiedź ze źródłami), „Jaka jest stolica Francji?” (odmowa), „Boli mnie kolano po upadku” (rada: lekarz, GOPR 985, 112), „Ile kosztuje karnet?” (brak w bazie, pytanie trafia do admina). Oceń odpowiedź 👍/👎.
8. **Administrator (F-05, F-07, F-28, F-32, F-48).** Zaloguj się jako `admin@npi.local` → „Administracja”: „Pytania bez odpowiedzi” pokazuje pytanie o karnet; w „Baza wiedzy” → „Nowy artykuł” napisz odpowiedź, zapisz, zaznacz to pytanie i „Opublikuj”. Po kilku sekundach asystent odpowiada już na to pytanie. Dalej: zmiana roli lub blokada konta w „Konta”, ceny w „Katalog i cennik”, każda zmiana z obrazem przed i po w „Dziennik audytu”.

Czysty start bez danych z testów: `docker compose down -v`, potem `docker compose up --build` (model embeddingów pobierze się ponownie).

## Co jest w MVP

| Moduł | Funkcje |
| --- | --- |
| Użytkownicy | F-01 rejestracja z potwierdzeniem e-mail, F-02 JWT (15 min) + refresh token w ciasteczku HttpOnly (7 dni), F-04 profil klienta, F-05 role i blokowanie kont |
| Sprzęt | F-06 katalog z filtrami i dostępnością w terminie, F-07 modele i cennik, F-08 egzemplarze, F-09 dobór długości nart i rozmiaru butów |
| Wypożyczenia | F-11 rezerwacja z koszykiem (blokada `SELECT … FOR UPDATE`), F-12 anulowanie, F-13 wyszukiwanie, F-14 wydanie z przypisaniem egzemplarzy, F-15 wypożyczenie na miejscu, F-16 zwrot ze szkodami i opłatą za zwłokę, F-17 historia |
| Baza wiedzy | F-28 artykuły Markdown ze statusami i wersjami, F-30 przeglądanie i wyszukiwanie, F-31 podział na fragmenty i indeksowanie w kolejce BullMQ, F-32 pytania bez odpowiedzi |
| Asystent AI | F-33 czat na każdej stronie (SSE), F-34 RAG tylko z opublikowanych artykułów ze źródłami, F-39 ocena odpowiedzi, F-40 limity 20/100 dziennie i filtr treści |
| Audyt | F-48 dziennik każdej zmiany danych (kto, co, kiedy, przed i po, IP) |

Asystent: model językowy (Claude API, `LLM_MODEL`) sam decyduje przez tool use, czy zajrzeć do bazy wiedzy, i odpowiada tylko z fragmentów o podobieństwie ≥ `PROG_PODOBIENSTWA`. Bez `ANTHROPIC_API_KEY` czat działa dalej i zwraca same pasujące fragmenty ze źródłami. Pytania bez pasujących fragmentów trafiają do administratora.

Płatność w MVP odbywa się przy ladzie: pracownik wydaje sprzęt z rezerwacji w stanie *UTWORZONA*. Stripe, wygasanie nieopłaconych rezerwacji i zwroty dochodzą w etapie 01.12.

## Struktura

```
api/   NestJS + Prisma (PostgreSQL 16 + pgvector), BullMQ
  prisma/migrations/0_init   = schemat.sql z opisu projektu
  src/<moduł>/               uzytkownicy, sprzet, wypozyczenia, baza-wiedzy, asystent
web/   React + Vite + Tailwind, serwowany przez nginx (proxy /api)
```

## Testy

```bash
cd api && npm test                                    # testy jednostkowe
API_URL=http://localhost:3000 npx vitest run src/wypozyczenia   # równoległe rezerwacje na działającym API
```
