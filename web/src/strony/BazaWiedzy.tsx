import Markdown from 'react-markdown';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { data, useDane } from '../api';

export function BazaWiedzy() {
  const [q, setQ] = useSearchParams();
  const { dane: kategorie } = useDane<any[]>('/baza-wiedzy/kategorie');
  const { dane, blad } = useDane<{ dane: any[] }>(`/baza-wiedzy/artykuly?rozmiar=100&${q}`);
  const ustaw = (k: string, v: string) => {
    const n = new URLSearchParams(q);
    v ? n.set(k, v) : n.delete(k);
    setQ(n, { replace: true });
  };
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Baza wiedzy</h1>
      <p className="text-slate-600 mb-4">Porady dla początkujących, sprawdzone przez naszych instruktorów. Możesz też zapytać asystenta w okienku czatu.</p>
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="pole max-w-xs" placeholder="Szukaj…" defaultValue={q.get('q') ?? ''} onChange={(e) => ustaw('q', e.target.value)} />
        <button className={q.get('kategoria') ? 'btn-jasny' : 'btn'} onClick={() => ustaw('kategoria', '')}>Wszystkie</button>
        {kategorie?.map((k) => (
          <button key={k.id_kategorii_wiedzy} className={q.get('kategoria') === String(k.id_kategorii_wiedzy) ? 'btn' : 'btn-jasny'} onClick={() => ustaw('kategoria', String(k.id_kategorii_wiedzy))}>
            {k.nazwa}
          </button>
        ))}
      </div>
      {blad && <p className="blad">{blad}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {dane?.dane.map((a) => (
          <Link key={a.id_artykulu} to={`/baza-wiedzy/${a.id_artykulu}`} className="karta hover:border-sky-400">
            <div className="text-xs uppercase text-slate-500">{a.kategoria_wiedzy.nazwa}</div>
            <div className="font-semibold">{a.tytul}</div>
            <p className="text-sm text-slate-600 line-clamp-2">{a.tresc_markdown.slice(0, 180)}…</p>
          </Link>
        ))}
      </div>
      {dane && !dane.dane.length && <p>Nic nie znaleziono.</p>}
    </div>
  );
}

export function Artykul() {
  const { id } = useParams();
  const { dane: a, blad } = useDane<any>(`/baza-wiedzy/artykuly/${id}`);
  if (blad) return <p className="blad">{blad}</p>;
  if (!a) return null;
  return (
    <article className="karta max-w-3xl">
      <Link to="/baza-wiedzy" className="text-sm underline">← Baza wiedzy</Link>
      <div className="text-xs uppercase text-slate-500 mt-3">{a.kategoria_wiedzy.nazwa}</div>
      <h1 className="text-2xl font-semibold mb-1">{a.tytul}</h1>
      <p className="text-xs text-slate-500 mb-4">
        Wersja {a.wersja}{a.data_publikacji && `, opublikowano ${data(a.data_publikacji)}`}{a.status !== 'OPUBLIKOWANY' && ` · ${a.status}`}
      </p>
      <div className="tresc"><Markdown>{a.tresc_markdown}</Markdown></div>
    </article>
  );
}
