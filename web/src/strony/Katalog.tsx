import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { POZIOMY, useAuth, useDane, zl } from '../api';
import { dodajDoKoszyka, useKoszyk } from './Koszyk';

const jutro = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);

export function Katalog() {
  const [q, setQ] = useSearchParams();
  const { koszyk } = useKoszyk();
  const od = q.get('od') ?? koszyk.dataOd ?? '';
  const doDnia = q.get('do') ?? koszyk.dataDo ?? '';
  const params = new URLSearchParams({ rozmiar: '50', ...Object.fromEntries(q) });
  if (od && doDnia) params.set('od', od), params.set('do', doDnia);
  const { dane: kategorie } = useDane<any[]>('/sprzet/kategorie');
  const { dane, blad } = useDane<{ dane: any[] }>(`/sprzet/modele?${params}`);
  const ustaw = (k: string, v: string) => {
    const n = new URLSearchParams(q);
    v ? n.set(k, v) : n.delete(k);
    setQ(n);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Katalog sprzętu</h1>
      <div className="karta mb-4 grid gap-3 sm:grid-cols-4">
        <label>
          <span className="etykieta">Kategoria</span>
          <select className="pole" value={q.get('kategoria') ?? ''} onChange={(e) => ustaw('kategoria', e.target.value)}>
            <option value="">Wszystkie</option>
            {kategorie?.map((k) => <option key={k.id_kategorii} value={k.id_kategorii}>{k.nazwa}</option>)}
          </select>
        </label>
        <label>
          <span className="etykieta">Poziom</span>
          <select className="pole" value={q.get('poziom') ?? ''} onChange={(e) => ustaw('poziom', e.target.value)}>
            <option value="">Każdy</option>
            {Object.entries(POZIOMY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          <span className="etykieta">Od</span>
          <input type="date" className="pole" min={new Date().toISOString().slice(0, 10)} value={od} onChange={(e) => ustaw('od', e.target.value)} />
        </label>
        <label>
          <span className="etykieta">Do</span>
          <input type="date" className="pole" min={od || jutro()} value={doDnia} onChange={(e) => ustaw('do', e.target.value)} />
        </label>
      </div>
      {blad && <p className="blad">{blad}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dane?.dane.map((m) => (
          <Link key={m.id_modelu} to={`/sprzet/${m.id_modelu}?${od && doDnia ? `od=${od}&do=${doDnia}` : ''}`} className="karta hover:border-sky-400">
            <div className="text-xs uppercase text-slate-500">{m.kategoria_sprzetu.nazwa}{m.poziom_docelowy && ` · ${POZIOMY[m.poziom_docelowy]}`}</div>
            <div className="font-semibold">{m.producent} {m.nazwa}</div>
            <p className="text-sm text-slate-600 my-2">{m.opis}</p>
            <div className="flex justify-between text-sm">
              <span>{zl(m.cena_za_dzien)} / dzień</span>
              {m.dostepne !== undefined && (
                <span className={m.dostepne ? 'text-green-700' : 'text-red-700'}>{m.dostepne ? `wolne: ${m.dostepne}` : 'brak w terminie'}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {dane && !dane.dane.length && <p className="text-slate-600">Brak sprzętu dla wybranych filtrów.</p>}
    </div>
  );
}

export function ModelSprzetu() {
  const { id } = useParams();
  const [q] = useSearchParams();
  const { ja } = useAuth();
  const { koszyk } = useKoszyk();
  const od = q.get('od') ?? koszyk.dataOd;
  const doDnia = q.get('do') ?? koszyk.dataDo;
  const { dane: m, blad } = useDane<any>(`/sprzet/modele/${id}${od && doDnia ? `?od=${od}&do=${doDnia}` : ''}`);
  const { dane: dobor } = useDane<any>(ja?.rola === 'KLIENT' ? `/sprzet/modele/${id}/dobor-rozmiaru` : null);
  const [rozmiar, setRozmiar] = useState('');
  const [info, setInfo] = useState('');
  useEffect(() => {
    if (dobor?.zalecany) setRozmiar(dobor.zalecany);
  }, [dobor]);

  if (blad) return <p className="blad">{blad}</p>;
  if (!m) return null;
  const maRozmiary = m.rozmiary.some((r: any) => r.rozmiar !== null);

  return (
    <div className="karta max-w-2xl">
      <div className="text-xs uppercase text-slate-500">{m.kategoria_sprzetu.nazwa}</div>
      <h1 className="text-2xl font-semibold">{m.producent} {m.nazwa}</h1>
      <p className="my-2 text-slate-700">{m.opis}</p>
      <p className="text-sm">Cena: <b>{zl(m.cena_za_dzien)}</b> za dzień, kaucja {zl(m.kaucja)}{m.poziom_docelowy && `, poziom: ${POZIOMY[m.poziom_docelowy]}`}</p>

      {maRozmiary && (
        <div className="mt-4">
          <h2 className="font-medium mb-2">Rozmiary{od && doDnia ? ` (dostępność ${od} – ${doDnia})` : ''}</h2>
          {dobor && <p className="text-sm mb-2 text-sky-800">{dobor.opis}{dobor.brakuje && <> · <Link to="/profil" className="underline">uzupełnij profil</Link></>}</p>}
          <div className="flex flex-wrap gap-2">
            {m.rozmiary.map((r: any) => (
              <button
                key={r.rozmiar}
                onClick={() => setRozmiar(r.rozmiar)}
                disabled={r.dostepne === 0}
                className={`rounded border px-3 py-1 text-sm disabled:opacity-40 ${rozmiar === r.rozmiar ? 'border-sky-700 bg-sky-50' : 'border-slate-300'}`}
              >
                {r.rozmiar}{m.kategoria_sprzetu.nazwa === 'Buty' || m.kategoria_sprzetu.nazwa === 'Kask' ? '' : ' cm'}
                {r.dostepne !== undefined && <span className="text-xs text-slate-500"> ({r.dostepne})</span>}
                {dobor?.zalecany === r.rozmiar && <span className="text-xs text-sky-700"> ★</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2 items-center">
        {ja?.rola === 'KLIENT' ? (
          <button
            className="btn"
            disabled={maRozmiary && !rozmiar}
            onClick={() => {
              dodajDoKoszyka({ idModelu: m.id_modelu, nazwa: `${m.producent} ${m.nazwa}`, rozmiar: maRozmiary ? rozmiar : null, cena: Number(m.cena_za_dzien), kaucja: Number(m.kaucja) }, od, doDnia);
              setInfo('Dodano do koszyka.');
            }}
          >
            Dodaj do koszyka
          </button>
        ) : !ja ? (
          <Link to="/logowanie" className="btn">Zaloguj się, aby zarezerwować</Link>
        ) : null}
        {info && <Link to="/koszyk" className="text-sm text-green-700 underline">{info} Przejdź do koszyka</Link>}
      </div>
    </div>
  );
}
