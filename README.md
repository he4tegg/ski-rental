# System wypożyczalni sprzętu i szkółki narciarskiej z asystentem AI

MVP na 03.11 według opisu projektu (tabela 4.1): wypożyczalnia sprzętu oraz baza wiedzy z asystentem AI dla początkujących. Dobór instruktora, lekcje, opinie i płatności Stripe są w etapie 01.12; schemat bazy obejmuje już wszystkie 26 tabel.

## Uruchomienie

```bash
cp .env.example .env    # ustaw JWT_SECRET, opcjonalnie ANTHROPIC_API_KEY
docker compose up --build
```

Pierwszy start pobiera model embeddingów `bge-m3` (ok. 1,2 GB), kolejne korzystają z wolumenu.

| Adres | Co to |
| --- | --- |
| http://localhost:8088 | Aplikacja (port zmienisz przez `WEB_PORT` w `.env`) |
| http://localhost:3000/api/docs | Dokumentacja API (Swagger) |
| http://localhost:8025 | Mailpit: e-maile z linkiem potwierdzającym rejestrację |

Konta testowe (hasło `Haslo123!`, zmienisz przez `SEED_HASLO`): `admin@npi.local`, `pracownik@npi.local`, `klient@npi.local`.

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
