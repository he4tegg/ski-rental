-- Schemat bazy danych: System wypożyczalni sprzętu i szkółki narciarskiej
-- PostgreSQL 16 + rozszerzenie pgvector. W projekcie schemat będzie utrzymywany
-- w pliku schema.prisma, a ten skrypt odpowiada migracji początkowej.

CREATE EXTENSION IF NOT EXISTS vector;

-- ===== Typy wyliczeniowe =====
CREATE TYPE rola_uzytkownika   AS ENUM ('KLIENT', 'INSTRUKTOR', 'PRACOWNIK', 'ADMIN');
CREATE TYPE poziom_jazdy       AS ENUM ('POCZATKUJACY', 'SREDNIOZAAWANSOWANY', 'ZAAWANSOWANY');
CREATE TYPE stan_egzemplarza   AS ENUM ('DOSTEPNY', 'WYPOZYCZONY', 'W_SERWISIE', 'WYCOFANY');
CREATE TYPE status_rezerwacji  AS ENUM ('UTWORZONA', 'OPLACONA', 'WYDANA', 'ZWROCONA', 'ANULOWANA');
CREATE TYPE status_zgloszenia  AS ENUM ('OTWARTE', 'W_NAPRAWIE', 'ZAMKNIETE');
CREATE TYPE status_lekcji      AS ENUM ('ZAREZERWOWANA', 'POTWIERDZONA', 'ODBYTA', 'ANULOWANA', 'NIEOBECNOSC');
CREATE TYPE status_platnosci   AS ENUM ('OCZEKUJE', 'ZAKONCZONA', 'NIEUDANA', 'ZWROCONA');
CREATE TYPE status_opinii      AS ENUM ('OCZEKUJE', 'OPUBLIKOWANA', 'UKRYTA');
CREATE TYPE status_artykulu    AS ENUM ('SZKIC', 'PROPOZYCJA', 'OPUBLIKOWANY', 'ARCHIWALNY');
CREATE TYPE status_pytania     AS ENUM ('NOWE', 'OBSLUZONE', 'ODRZUCONE');
CREATE TYPE nadawca_wiadomosci AS ENUM ('UZYTKOWNIK', 'ASYSTENT');
CREATE TYPE narzedzie_ai       AS ENUM ('DOBOR_INSTRUKTORA', 'BAZA_WIEDZY', 'BRAK');

-- ===== Moduł Użytkownicy =====
CREATE TABLE uzytkownik (
    id_uzytkownika   SERIAL PRIMARY KEY,
    email            VARCHAR(255) NOT NULL UNIQUE,
    haslo_hash       VARCHAR(255) NOT NULL,
    imie             VARCHAR(80)  NOT NULL,
    nazwisko         VARCHAR(80)  NOT NULL,
    telefon          VARCHAR(20),
    rola             rola_uzytkownika NOT NULL DEFAULT 'KLIENT',
    aktywny          BOOLEAN NOT NULL DEFAULT TRUE,
    data_utworzenia  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE token_odswiezania (
    id_tokenu        SERIAL PRIMARY KEY,
    id_uzytkownika   INT NOT NULL REFERENCES uzytkownik(id_uzytkownika) ON DELETE CASCADE,
    token_hash       VARCHAR(255) NOT NULL UNIQUE,
    wygasa           TIMESTAMPTZ NOT NULL,
    uniewazniony     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE profil_klienta (
    id_klienta       INT PRIMARY KEY REFERENCES uzytkownik(id_uzytkownika) ON DELETE CASCADE,
    wzrost_cm        SMALLINT CHECK (wzrost_cm BETWEEN 80 AND 230),
    waga_kg          NUMERIC(5,1) CHECK (waga_kg BETWEEN 15 AND 200),
    rozmiar_buta_eu  NUMERIC(3,1),
    poziom_jazdy     poziom_jazdy NOT NULL DEFAULT 'POCZATKUJACY',
    data_urodzenia   DATE
);

CREATE TABLE instruktor (
    id_instruktora     INT PRIMARY KEY REFERENCES uzytkownik(id_uzytkownika) ON DELETE CASCADE,
    bio                TEXT,
    jezyki             VARCHAR(5)[] NOT NULL DEFAULT '{pl}',
    stopien_uprawnien  VARCHAR(80),
    stawka_godzinowa   NUMERIC(8,2) NOT NULL CHECK (stawka_godzinowa > 0),
    srednia_ocena      NUMERIC(3,2) NOT NULL DEFAULT 0,
    liczba_opinii      INT NOT NULL DEFAULT 0,
    zdjecie_url        VARCHAR(500),
    aktywny            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE instruktor_specjalizacja (
    id_instruktora   INT NOT NULL REFERENCES instruktor(id_instruktora) ON DELETE CASCADE,
    specjalizacja    VARCHAR(40) NOT NULL,  -- np. DZIECI, POCZATKUJACY, CARVING, FREERIDE, SNOWBOARD
    PRIMARY KEY (id_instruktora, specjalizacja)
);

-- ===== Moduł Sprzęt =====
CREATE TABLE kategoria_sprzetu (
    id_kategorii     SERIAL PRIMARY KEY,
    nazwa            VARCHAR(60) NOT NULL UNIQUE   -- Narty, Buty, Kijki, Kask, Gogle, Snowboard
);

CREATE TABLE model_sprzetu (
    id_modelu        SERIAL PRIMARY KEY,
    id_kategorii     INT NOT NULL REFERENCES kategoria_sprzetu(id_kategorii),
    producent        VARCHAR(80) NOT NULL,
    nazwa            VARCHAR(120) NOT NULL,
    opis             TEXT,
    poziom_docelowy  poziom_jazdy,
    cena_za_dzien    NUMERIC(8,2) NOT NULL CHECK (cena_za_dzien >= 0),
    kaucja           NUMERIC(8,2) NOT NULL DEFAULT 0,
    zdjecie_url      VARCHAR(500),
    aktywny          BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE egzemplarz (
    id_egzemplarza    SERIAL PRIMARY KEY,
    id_modelu         INT NOT NULL REFERENCES model_sprzetu(id_modelu),
    kod_inwentarzowy  VARCHAR(30) NOT NULL UNIQUE,
    rozmiar           VARCHAR(10),          -- rozmiar butów, kasku itp.
    dlugosc_cm        SMALLINT,             -- długość nart / deski
    stan              stan_egzemplarza NOT NULL DEFAULT 'DOSTEPNY',
    data_zakupu       DATE
);

-- ===== Moduł Wypożyczenia =====
CREATE TABLE rezerwacja_sprzetu (
    id_rezerwacji          SERIAL PRIMARY KEY,
    id_klienta             INT NOT NULL REFERENCES uzytkownik(id_uzytkownika),
    data_od                DATE NOT NULL,
    data_do                DATE NOT NULL,
    status                 status_rezerwacji NOT NULL DEFAULT 'UTWORZONA',
    kwota_calkowita        NUMERIC(10,2) NOT NULL DEFAULT 0,
    id_pracownika_wydania  INT REFERENCES uzytkownik(id_uzytkownika),
    id_pracownika_zwrotu   INT REFERENCES uzytkownik(id_uzytkownika),
    data_wydania           TIMESTAMPTZ,
    data_zwrotu            TIMESTAMPTZ,
    data_utworzenia        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (data_do >= data_od)
);

CREATE TABLE pozycja_rezerwacji (
    id_pozycji        SERIAL PRIMARY KEY,
    id_rezerwacji     INT NOT NULL REFERENCES rezerwacja_sprzetu(id_rezerwacji) ON DELETE CASCADE,
    id_modelu         INT NOT NULL REFERENCES model_sprzetu(id_modelu),
    id_egzemplarza    INT REFERENCES egzemplarz(id_egzemplarza),   -- uzupełniane przy wydaniu
    rozmiar_zalecany  VARCHAR(10),
    cena              NUMERIC(8,2) NOT NULL
);

CREATE TABLE zgloszenie_serwisowe (
    id_zgloszenia     SERIAL PRIMARY KEY,
    id_egzemplarza    INT NOT NULL REFERENCES egzemplarz(id_egzemplarza),
    id_pracownika     INT NOT NULL REFERENCES uzytkownik(id_uzytkownika),
    id_rezerwacji     INT REFERENCES rezerwacja_sprzetu(id_rezerwacji),
    opis_uszkodzenia  TEXT NOT NULL,
    status            status_zgloszenia NOT NULL DEFAULT 'OTWARTE',
    oplata_za_szkode  NUMERIC(8,2) NOT NULL DEFAULT 0,
    data_zgloszenia   TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_zamkniecia   TIMESTAMPTZ
);

-- ===== Moduł Lekcje =====
CREATE TABLE dostepnosc_instruktora (
    id_dostepnosci   SERIAL PRIMARY KEY,
    id_instruktora   INT NOT NULL REFERENCES instruktor(id_instruktora) ON DELETE CASCADE,
    dzien            DATE NOT NULL,
    godz_od          TIME NOT NULL,
    godz_do          TIME NOT NULL,
    CHECK (godz_do > godz_od)
);

CREATE TABLE lekcja (
    id_lekcji            SERIAL PRIMARY KEY,
    id_instruktora       INT NOT NULL REFERENCES instruktor(id_instruktora),
    id_klienta           INT NOT NULL REFERENCES uzytkownik(id_uzytkownika),
    data_rozpoczecia     TIMESTAMPTZ NOT NULL,
    czas_trwania_min     SMALLINT NOT NULL CHECK (czas_trwania_min IN (60, 90, 120, 180)),
    poziom               poziom_jazdy NOT NULL,
    liczba_uczestnikow   SMALLINT NOT NULL DEFAULT 1 CHECK (liczba_uczestnikow BETWEEN 1 AND 6),
    cena                 NUMERIC(8,2) NOT NULL,
    status               status_lekcji NOT NULL DEFAULT 'ZAREZERWOWANA',
    notatka_instruktora  TEXT,
    data_utworzenia      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Moduł Płatności =====
CREATE TABLE platnosc (
    id_platnosci      SERIAL PRIMARY KEY,
    id_rezerwacji     INT REFERENCES rezerwacja_sprzetu(id_rezerwacji),
    id_lekcji         INT REFERENCES lekcja(id_lekcji),
    kwota             NUMERIC(10,2) NOT NULL CHECK (kwota > 0),
    waluta            CHAR(3) NOT NULL DEFAULT 'PLN',
    status            status_platnosci NOT NULL DEFAULT 'OCZEKUJE',
    id_sesji_stripe   VARCHAR(255) UNIQUE,
    data_utworzenia   TIMESTAMPTZ NOT NULL DEFAULT now(),
    data_zakonczenia  TIMESTAMPTZ,
    -- płatność dotyczy dokładnie jednej rezerwacji albo jednej lekcji
    CHECK ((id_rezerwacji IS NULL) <> (id_lekcji IS NULL))
);

-- ===== Moduł Opinie =====
CREATE TABLE opinia (
    id_opinii              SERIAL PRIMARY KEY,
    id_lekcji              INT NOT NULL UNIQUE REFERENCES lekcja(id_lekcji),  -- jedna opinia na lekcję
    id_klienta             INT NOT NULL REFERENCES uzytkownik(id_uzytkownika),
    id_instruktora         INT NOT NULL REFERENCES instruktor(id_instruktora),
    ocena                  SMALLINT NOT NULL CHECK (ocena BETWEEN 1 AND 5),
    tresc                  TEXT NOT NULL CHECK (length(tresc) BETWEEN 20 AND 2000),
    status                 status_opinii NOT NULL DEFAULT 'OCZEKUJE',
    powod_ukrycia          VARCHAR(255),
    odpowiedz_instruktora  TEXT,
    data_utworzenia        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE osadzenie_opinii (
    id_opinii        INT PRIMARY KEY REFERENCES opinia(id_opinii) ON DELETE CASCADE,
    wektor           vector(1024) NOT NULL,
    model            VARCHAR(60) NOT NULL,
    data_utworzenia  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profil_ai_instruktora (
    id_instruktora           INT PRIMARY KEY REFERENCES instruktor(id_instruktora) ON DELETE CASCADE,
    podsumowanie             TEXT NOT NULL,
    cechy                    JSONB NOT NULL,   -- np. {"cierpliwy":0.9,"wyczynowy":0.2,"dla_dzieci":0.7}
    wektor                   vector(1024) NOT NULL,
    liczba_opinii_ujetych    INT NOT NULL,
    data_aktualizacji        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Moduł Baza wiedzy =====
CREATE TABLE kategoria_wiedzy (
    id_kategorii_wiedzy  SERIAL PRIMARY KEY,
    nazwa                VARCHAR(80) NOT NULL UNIQUE,
    kolejnosc            SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE artykul (
    id_artykulu          SERIAL PRIMARY KEY,
    id_kategorii_wiedzy  INT NOT NULL REFERENCES kategoria_wiedzy(id_kategorii_wiedzy),
    id_autora            INT NOT NULL REFERENCES uzytkownik(id_uzytkownika),
    id_zatwierdzajacego  INT REFERENCES uzytkownik(id_uzytkownika),
    tytul                VARCHAR(200) NOT NULL,
    tresc_markdown       TEXT NOT NULL,
    status               status_artykulu NOT NULL DEFAULT 'SZKIC',
    wersja               INT NOT NULL DEFAULT 1,
    data_publikacji      TIMESTAMPTZ,
    data_modyfikacji     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fragment_artykulu (
    id_fragmentu     SERIAL PRIMARY KEY,
    id_artykulu      INT NOT NULL REFERENCES artykul(id_artykulu) ON DELETE CASCADE,
    numer            SMALLINT NOT NULL,
    tresc            TEXT NOT NULL,
    wektor           vector(1024) NOT NULL,
    UNIQUE (id_artykulu, numer)
);

-- ===== Moduł Asystent AI =====
CREATE TABLE rozmowa_czatu (
    id_rozmowy        SERIAL PRIMARY KEY,
    id_uzytkownika    INT REFERENCES uzytkownik(id_uzytkownika),  -- NULL dla gościa
    id_sesji_goscia   UUID,
    data_rozpoczecia  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id_uzytkownika IS NOT NULL OR id_sesji_goscia IS NOT NULL)
);

CREATE TABLE wiadomosc_czatu (
    id_wiadomosci      SERIAL PRIMARY KEY,
    id_rozmowy         INT NOT NULL REFERENCES rozmowa_czatu(id_rozmowy) ON DELETE CASCADE,
    nadawca            nadawca_wiadomosci NOT NULL,
    tresc              TEXT NOT NULL,
    narzedzie          narzedzie_ai NOT NULL DEFAULT 'BRAK',
    zrodla             JSONB,       -- id artykułów / opinii użytych w odpowiedzi
    ocena_uzytkownika  SMALLINT CHECK (ocena_uzytkownika IN (-1, 1)),
    liczba_tokenow     INT,
    data_utworzenia    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rekomendacja (
    id_rekomendacji     SERIAL PRIMARY KEY,
    id_wiadomosci       INT NOT NULL REFERENCES wiadomosc_czatu(id_wiadomosci) ON DELETE CASCADE,
    id_instruktora      INT NOT NULL REFERENCES instruktor(id_instruktora),
    pozycja             SMALLINT NOT NULL CHECK (pozycja BETWEEN 1 AND 5),
    wynik_dopasowania   NUMERIC(4,3) NOT NULL,
    uzasadnienie        TEXT NOT NULL,
    id_lekcji           INT REFERENCES lekcja(id_lekcji),  -- uzupełniane, gdy klient zarezerwuje
    UNIQUE (id_wiadomosci, pozycja)
);

CREATE TABLE pytanie_bez_odpowiedzi (
    id_pytania       SERIAL PRIMARY KEY,
    id_wiadomosci    INT NOT NULL UNIQUE REFERENCES wiadomosc_czatu(id_wiadomosci),
    tresc            TEXT NOT NULL,
    status           status_pytania NOT NULL DEFAULT 'NOWE',
    id_artykulu      INT REFERENCES artykul(id_artykulu),
    data_utworzenia  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Moduły Powiadomienia i Audyt =====
CREATE TABLE powiadomienie (
    id_powiadomienia  SERIAL PRIMARY KEY,
    id_uzytkownika    INT NOT NULL REFERENCES uzytkownik(id_uzytkownika),
    typ               VARCHAR(60) NOT NULL,   -- POTWIERDZENIE_REZERWACJI, PRZYPOMNIENIE_ZWROTU, ...
    temat             VARCHAR(200) NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'W_KOLEJCE',
    data_wyslania     TIMESTAMPTZ
);

CREATE TABLE wpis_audytu (
    id_wpisu         BIGSERIAL PRIMARY KEY,
    id_uzytkownika   INT REFERENCES uzytkownik(id_uzytkownika),
    akcja            VARCHAR(60) NOT NULL,    -- np. REZERWACJA_UTWORZONA, OPINIA_UKRYTA
    encja            VARCHAR(60) NOT NULL,
    id_encji         INT,
    dane_przed       JSONB,
    dane_po          JSONB,
    adres_ip         INET,
    znacznik_czasu   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Indeksy =====
CREATE INDEX ix_egzemplarz_model_stan     ON egzemplarz (id_modelu, stan);
CREATE INDEX ix_rezerwacja_klient         ON rezerwacja_sprzetu (id_klienta);
CREATE INDEX ix_rezerwacja_termin         ON rezerwacja_sprzetu (data_od, data_do);
CREATE INDEX ix_pozycja_egzemplarz        ON pozycja_rezerwacji (id_egzemplarza);
CREATE INDEX ix_dostepnosc_instr_dzien    ON dostepnosc_instruktora (id_instruktora, dzien);
CREATE INDEX ix_lekcja_instr_termin       ON lekcja (id_instruktora, data_rozpoczecia);
CREATE INDEX ix_lekcja_klient             ON lekcja (id_klienta);
CREATE INDEX ix_opinia_instr_status       ON opinia (id_instruktora, status);
CREATE INDEX ix_artykul_status            ON artykul (status);
CREATE INDEX ix_wiadomosc_rozmowa         ON wiadomosc_czatu (id_rozmowy, data_utworzenia);
CREATE INDEX ix_audyt_encja               ON wpis_audytu (encja, id_encji);
CREATE INDEX ix_audyt_czas                ON wpis_audytu (znacznik_czasu);
-- indeksy wektorowe HNSW (podobieństwo kosinusowe)
CREATE INDEX ix_osadzenie_opinii_hnsw     ON osadzenie_opinii      USING hnsw (wektor vector_cosine_ops);
CREATE INDEX ix_profil_ai_hnsw            ON profil_ai_instruktora USING hnsw (wektor vector_cosine_ops);
CREATE INDEX ix_fragment_artykulu_hnsw    ON fragment_artykulu     USING hnsw (wektor vector_cosine_ops);
-- instruktor nie może mieć dwóch aktywnych lekcji o tej samej godzinie rozpoczęcia
CREATE UNIQUE INDEX ux_lekcja_instr_start ON lekcja (id_instruktora, data_rozpoczecia)
    WHERE status IN ('ZAREZERWOWANA', 'POTWIERDZONA');
