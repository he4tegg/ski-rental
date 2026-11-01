import { Body, Controller, Get, Headers, Module, Param, ParseIntPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { Fragment, fragmentyOpublikowane } from '../baza-wiedzy/indeksowanie';
import { Ja, Uzytkownik, blad, waliduj } from '../wspolne';
import { ClaudeApiAdapter, DostawcaLLM, NarzedzieLLM, WiadomoscLLM, llmDostepny } from './dostawcy';
import { BRAK_W_BAZIE, LIMIT_DZIENNY, ODMOWA_WULGARNA, OSTRZEZENIE_MEDYCZNE, czyWulgarne, czyZdrowotne } from './straznik';

const PROG = Number(process.env.PROG_PODOBIENSTWA ?? 0.75);
const HISTORIA = 10;

const SYSTEM = `Jesteś asystentem wypożyczalni sprzętu i szkółki narciarskiej. Pomagasz głównie osobom początkującym.
Na każde pytanie o narciarstwo, sprzęt, przygotowanie do zajęć, bezpieczeństwo, zasady na stoku albo działanie wypożyczalni najpierw wywołaj narzędzie baza_wiedzy.
Odpowiadaj wyłącznie na podstawie fragmentów, które zwróci narzędzie: prostym językiem, krótko, po polsku, i wymień tytuły artykułów, z których korzystasz. Nie dodawaj wiedzy spoza fragmentów.
Jeśli pytanie nie dotyczy narciarstwa ani wypożyczalni, grzecznie odmów jednym zdaniem.
Nie stawiasz diagnoz medycznych.
Dobór instruktora w czacie będzie dostępny w kolejnym etapie; jeśli ktoś o to prosi, powiedz to wprost.`;

const NARZEDZIA: NarzedzieLLM[] = [
  {
    name: 'baza_wiedzy',
    description: 'Wyszukuje fragmenty zatwierdzonych artykułów bazy wiedzy szkółki narciarskiej. Zwraca fragmenty z tytułami artykułów.',
    input_schema: { type: 'object', properties: { pytanie: { type: 'string', description: 'Pytanie użytkownika w jednym zdaniu' } }, required: ['pytanie'], additionalProperties: false },
    strict: true,
  },
];

type Zdarzenie = (nazwa: 'tekst' | 'zrodla' | 'koniec' | 'blad', dane: unknown) => void;

export class AsystentAIService {
  constructor(private llm: DostawcaLLM | null) {}

  // Prowadzi jedną turę rozmowy i strumieniuje odpowiedź; zwraca id zapisanej wiadomości asystenta.
  async odpowiedz(idRozmowy: number, tresc: string, emit: Zdarzenie) {
    const pytanie = await db.wiadomosc_czatu.create({ data: { id_rozmowy: idRozmowy, nadawca: 'UZYTKOWNIK', tresc } });
    let tekst = '';
    const pisz = (t: string) => {
      tekst += t;
      emit('tekst', { fragment: t });
    };
    let narzedzie = 'BRAK' as 'BAZA_WIEDZY' | 'BRAK';
    let zrodla: Fragment[] = [];
    let bezOdpowiedzi = false as boolean;
    let tokeny = 0;

    if (czyWulgarne(tresc)) {
      pisz(ODMOWA_WULGARNA);
    } else {
      const wyszukaj = async (q: string) => {
        narzedzie = 'BAZA_WIEDZY';
        const f = (await fragmentyOpublikowane(q)).filter((x) => x.podobienstwo >= PROG);
        if (!f.length) bezOdpowiedzi = true;
        zrodla = f;
        return f;
      };
      let gotowe = false;
      if (this.llm) {
        try {
          tokeny = await this.zModelem(idRozmowy, wyszukaj, pisz);
          gotowe = true;
        } catch (e) {
          console.error('LLM niedostępny:', (e as Error).message);
          if (tekst) pisz('\n\n');
          else pisz('Model językowy jest chwilowo niedostępny, pokazuję fragmenty z bazy wiedzy.\n\n');
        }
      }
      if (!gotowe) {
        // Bez modelu: odpowiedź to dosłowne fragmenty najlepiej pasujących artykułów (najwyżej dwóch).
        const f = await wyszukaj(tresc);
        const poArtykule = f.filter((x, i) => f.findIndex((y) => y.id_artykulu === x.id_artykulu) === i).slice(0, 2);
        if (poArtykule.length) pisz(poArtykule.map((x) => `**${x.tytul}**: ${x.tresc}`).join('\n\n'));
      }
      if (bezOdpowiedzi && narzedzie === 'BAZA_WIEDZY') pisz(BRAK_W_BAZIE);
      if (czyZdrowotne(tresc)) pisz(OSTRZEZENIE_MEDYCZNE);
    }

    const artykuly = [...new Map(zrodla.map((f) => [f.id_artykulu, { id: f.id_artykulu, tytul: f.tytul }])).values()];
    if (artykuly.length) emit('zrodla', { artykuly });
    const odp = await db.wiadomosc_czatu.create({
      data: {
        id_rozmowy: idRozmowy,
        nadawca: 'ASYSTENT',
        tresc: tekst,
        narzedzie,
        zrodla: artykuly.length ? { artykuly, fragmenty: zrodla.map((f) => f.id_fragmentu) } : undefined,
        liczba_tokenow: tokeny || null,
      },
    });
    if (bezOdpowiedzi) await db.pytanie_bez_odpowiedzi.create({ data: { id_wiadomosci: pytanie.id_wiadomosci, tresc } });
    emit('koniec', { idWiadomosci: odp.id_wiadomosci, narzedzie });
  }

  // Pętla z narzędziem: model sam decyduje, czy zajrzeć do bazy wiedzy (tool use).
  private async zModelem(idRozmowy: number, wyszukaj: (q: string) => Promise<Fragment[]>, pisz: (t: string) => void) {
    const ostatnie = await db.wiadomosc_czatu.findMany({ where: { id_rozmowy: idRozmowy }, orderBy: { id_wiadomosci: 'desc' }, take: HISTORIA });
    const historia: WiadomoscLLM[] = ostatnie
      .reverse()
      .filter((w) => w.tresc)
      .map((w) => ({ role: w.nadawca === 'UZYTKOWNIK' ? 'user' : 'assistant', content: w.tresc }));
    while (historia[0]?.role === 'assistant') historia.shift();

    let tokeny = 0;
    for (let tura = 0; tura < 3; tura++) {
      const m = await this.llm!.tura({ system: SYSTEM, messages: historia, tools: NARZEDZIA }, pisz);
      tokeny += m.usage.input_tokens + m.usage.output_tokens;
      if (m.stop_reason !== 'tool_use') return tokeny;
      const wywolanie = m.content.find((b) => b.type === 'tool_use');
      if (!wywolanie) return tokeny;
      const f = await wyszukaj(String((wywolanie.input as { pytanie?: string }).pytanie ?? ''));
      // Brak dopasowań: nie dajemy modelowi szansy na odpowiedź „z głowy”.
      if (!f.length) return tokeny;
      historia.push({ role: 'assistant', content: m.content as any });
      historia.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: wywolanie.id,
            content: f.map((x) => `<fragment artykul="${x.tytul}">\n${x.tresc}\n</fragment>`).join('\n'),
          },
        ],
      });
    }
    return tokeny;
  }
}

const asystent = new AsystentAIService(llmDostepny() ? new ClaudeApiAdapter() : null);

@Controller('asystent')
export class AsystentAIController {
  @Post('rozmowy')
  async nowa(@Ja() ja?: Uzytkownik, @Headers('x-sesja-goscia') sesja?: string) {
    if (!ja && !z.uuid().safeParse(sesja).success) throw blad(400, 'Brak identyfikatora sesji gościa');
    const r = await db.rozmowa_czatu.create({ data: ja ? { id_uzytkownika: ja.id } : { id_sesji_goscia: sesja } });
    return { id: r.id_rozmowy };
  }

  @Get('rozmowy/:id')
  async historia(@Param('id', ParseIntPipe) id: number, @Ja() ja?: Uzytkownik, @Headers('x-sesja-goscia') sesja?: string) {
    await this.wlasna(id, ja, sesja);
    return db.wiadomosc_czatu.findMany({ where: { id_rozmowy: id }, orderBy: { id_wiadomosci: 'asc' } });
  }

  @Post('rozmowy/:id/wiadomosci')
  async wiadomosc(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Res() res: Response, @Ja() ja?: Uzytkownik, @Headers('x-sesja-goscia') sesja?: string) {
    const { tresc } = waliduj(z.object({ tresc: z.string().trim().min(1).max(1000) }), body);
    const r = await this.wlasna(id, ja, sesja);

    // F-40: dzienny limit wiadomości liczony dla konta albo sesji gościa.
    const odPolnocy = new Date(new Date().setHours(0, 0, 0, 0));
    const wyslane = await db.wiadomosc_czatu.count({
      where: { nadawca: 'UZYTKOWNIK', data_utworzenia: { gte: odPolnocy }, rozmowa_czatu: ja ? { id_uzytkownika: ja.id } : { id_sesji_goscia: r.id_sesji_goscia } },
    });
    const limit = ja ? LIMIT_DZIENNY.zalogowany : LIMIT_DZIENNY.gosc;
    if (wyslane >= limit) throw blad(429, `Wykorzystano dzienny limit ${limit} wiadomości.${ja ? '' : ' Zaloguj się, aby mieć wyższy limit.'}`);

    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const emit: Zdarzenie = (nazwa, dane) => res.write(`event: ${nazwa}\ndata: ${JSON.stringify(dane)}\n\n`);
    try {
      await asystent.odpowiedz(id, tresc, emit);
    } catch (e) {
      console.error(e);
      emit('blad', { komunikat: 'Asystent jest chwilowo niedostępny. Spróbuj za chwilę.' });
    }
    res.end();
  }

  @Post('wiadomosci/:id/ocena')
  async ocena(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Ja() ja?: Uzytkownik, @Headers('x-sesja-goscia') sesja?: string) {
    const { ocena } = waliduj(z.object({ ocena: z.union([z.literal(1), z.literal(-1)]) }), body);
    const w = await db.wiadomosc_czatu.findUnique({ where: { id_wiadomosci: id } });
    if (!w || w.nadawca !== 'ASYSTENT') throw blad(404, 'Nie ma takiej odpowiedzi');
    await this.wlasna(w.id_rozmowy, ja, sesja);
    await db.wiadomosc_czatu.update({ where: { id_wiadomosci: id }, data: { ocena_uzytkownika: ocena } });
    return { ok: true };
  }

  private async wlasna(id: number, ja?: Uzytkownik, sesja?: string) {
    const r = await db.rozmowa_czatu.findUnique({ where: { id_rozmowy: id } });
    const moja = r && (ja ? r.id_uzytkownika === ja.id : r.id_sesji_goscia != null && r.id_sesji_goscia === sesja);
    if (!moja) throw blad(404, 'Nie ma takiej rozmowy');
    return r;
  }
}

@Module({ controllers: [AsystentAIController] })
export class AsystentModule {}
