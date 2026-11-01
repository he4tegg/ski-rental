import { useEffect, useRef, useState, type FormEvent } from 'react';
import Markdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { api, naglowki, useAuth } from './api';

type Wiadomosc = { kto: 'ja' | 'asystent'; tekst: string; id?: number; zrodla?: { id: number; tytul: string }[]; ocena?: number; blad?: boolean };

// F-33: okno czatu na każdej stronie, odpowiedź strumieniowana (SSE przez fetch, bo to POST).
export default function Czat() {
  const { ja } = useAuth();
  const [otwarty, setOtwarty] = useState(false);
  const [wiadomosci, setWiadomosci] = useState<Wiadomosc[]>([]);
  const [pisze, setPisze] = useState(false);
  const rozmowa = useRef<number | null>(null);
  const dol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rozmowa.current = null;
    setWiadomosci([]);
  }, [ja?.id_uzytkownika]);
  useEffect(() => dol.current?.scrollIntoView({ block: 'end' }), [wiadomosci]);

  const zmienOstatnia = (f: (w: Wiadomosc) => Wiadomosc) => setWiadomosci((ws) => [...ws.slice(0, -1), f(ws[ws.length - 1])]);

  const wyslij = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const pole = e.currentTarget.elements.namedItem('tresc') as HTMLInputElement;
    const tresc = pole.value.trim();
    if (!tresc || pisze) return;
    pole.value = '';
    setWiadomosci((ws) => [...ws, { kto: 'ja', tekst: tresc }, { kto: 'asystent', tekst: '' }]);
    setPisze(true);
    try {
      rozmowa.current ??= (await api('/asystent/rozmowy', { method: 'POST' })).id;
      const res = await fetch(`/api/v1/asystent/rozmowy/${rozmowa.current}/wiadomosci`, { method: 'POST', headers: naglowki(), body: JSON.stringify({ tresc }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.detail ?? 'Asystent jest chwilowo niedostępny.');
      const czytnik = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let bufor = '';
      for (;;) {
        const { value, done } = await czytnik.read();
        if (done) break;
        bufor += value;
        const zdarzenia = bufor.split('\n\n');
        bufor = zdarzenia.pop()!;
        for (const z of zdarzenia) {
          const nazwa = z.match(/^event: (.+)$/m)?.[1];
          const dane = JSON.parse(z.match(/^data: (.+)$/m)?.[1] ?? '{}');
          if (nazwa === 'tekst') zmienOstatnia((w) => ({ ...w, tekst: w.tekst + dane.fragment }));
          if (nazwa === 'zrodla') zmienOstatnia((w) => ({ ...w, zrodla: dane.artykuly }));
          if (nazwa === 'koniec') zmienOstatnia((w) => ({ ...w, id: dane.idWiadomosci }));
          if (nazwa === 'blad') zmienOstatnia((w) => ({ ...w, tekst: dane.komunikat, blad: true }));
        }
      }
    } catch (err) {
      zmienOstatnia((w) => ({ ...w, tekst: (err as Error).message, blad: true }));
    } finally {
      setPisze(false);
    }
  };

  const ocen = async (i: number, ocena: number) => {
    const w = wiadomosci[i];
    if (!w.id) return;
    await api(`/asystent/wiadomosci/${w.id}/ocena`, { method: 'POST', body: { ocena } }).catch(() => {});
    setWiadomosci((ws) => ws.map((x, j) => (j === i ? { ...x, ocena } : x)));
  };

  if (!otwarty)
    return (
      <button onClick={() => setOtwarty(true)} className="fixed bottom-4 right-4 rounded-full bg-sky-700 px-4 py-3 text-white shadow-lg hover:bg-sky-800" aria-label="Otwórz czat z asystentem">
        💬 Zapytaj asystenta
      </button>
    );

  return (
    <section className="fixed bottom-4 right-4 flex h-[32rem] max-h-[85vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-slate-300 bg-white shadow-xl" aria-label="Czat z asystentem">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="font-semibold text-sm">Asystent dla początkujących</span>
        <button onClick={() => setOtwarty(false)} aria-label="Zamknij czat" className="px-2">✕</button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
        {!wiadomosci.length && <p className="text-slate-500">Zapytaj np. „Co zabrać na pierwsze zajęcia?” albo „Jak bezpiecznie upaść?”. Odpowiadam tylko na podstawie artykułów zatwierdzonych przez szkółkę.</p>}
        {wiadomosci.map((w, i) => (
          <div key={i} className={w.kto === 'ja' ? 'ml-8 rounded-lg bg-sky-700 px-3 py-2 text-white' : `mr-4 rounded-lg px-3 py-2 ${w.blad ? 'bg-red-50 text-red-800' : 'bg-slate-100'}`}>
            {w.kto === 'asystent' && !w.tekst ? <span className="text-slate-500">Szukam w bazie wiedzy…</span> : <div className="tresc [&_p]:mb-1"><Markdown>{w.tekst}</Markdown></div>}
            {w.zrodla && (
              <div className="mt-1 text-xs">
                Źródła: {w.zrodla.map((z, k) => <span key={z.id}>{k > 0 && ', '}<Link to={`/baza-wiedzy/${z.id}`} className="underline">{z.tytul}</Link></span>)}
              </div>
            )}
            {w.id && (
              <div className="mt-1 flex gap-1 text-xs">
                <button onClick={() => ocen(i, 1)} aria-label="Dobra odpowiedź" className={w.ocena === 1 ? 'opacity-100' : 'opacity-40 hover:opacity-100'}>👍</button>
                <button onClick={() => ocen(i, -1)} aria-label="Słaba odpowiedź" className={w.ocena === -1 ? 'opacity-100' : 'opacity-40 hover:opacity-100'}>👎</button>
              </div>
            )}
          </div>
        ))}
        <div ref={dol} />
      </div>
      <form onSubmit={wyslij} className="flex gap-2 border-t border-slate-200 p-2">
        <input name="tresc" maxLength={1000} className="pole" placeholder="Napisz pytanie…" aria-label="Pytanie do asystenta" autoComplete="off" />
        <button className="btn" disabled={pisze}>Wyślij</button>
      </form>
    </section>
  );
}
