import { useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, zl } from '../api';

type Pozycja = { idModelu: number; nazwa: string; rozmiar: string | null; cena: number; kaucja: number };
type StanKoszyka = { dataOd: string | null; dataDo: string | null; pozycje: Pozycja[] };

// Koszyk to wygoda jednej przeglądarki, więc żyje w localStorage.
const KLUCZ = 'koszyk';
const pusty: StanKoszyka = { dataOd: null, dataDo: null, pozycje: [] };
let stan: StanKoszyka = (() => {
  try {
    return { ...pusty, ...JSON.parse(localStorage.getItem(KLUCZ) ?? '{}') };
  } catch {
    return pusty;
  }
})();
const sluchacze = new Set<() => void>();
function zapisz(nowy: StanKoszyka) {
  stan = nowy;
  try {
    localStorage.setItem(KLUCZ, JSON.stringify(nowy));
  } catch {}
  sluchacze.forEach((f) => f());
}

export const useKoszyk = () => ({
  koszyk: useSyncExternalStore((f) => (sluchacze.add(f), () => sluchacze.delete(f)), () => stan),
  zapisz,
});

export const dodajDoKoszyka = (p: Pozycja, od: string | null, doDnia: string | null) =>
  zapisz({ dataOd: od ?? stan.dataOd, dataDo: doDnia ?? stan.dataDo, pozycje: [...stan.pozycje, p] });

export default function Koszyk() {
  const { koszyk } = useKoszyk();
  const [blad, setBlad] = useState('');
  const [wysylanie, setWysylanie] = useState(false);
  const nav = useNavigate();
  const dni = koszyk.dataOd && koszyk.dataDo ? Math.round((+new Date(koszyk.dataDo) - +new Date(koszyk.dataOd)) / 864e5) + 1 : 0;
  const suma = koszyk.pozycje.reduce((s, p) => s + p.cena * Math.max(dni, 0) + p.kaucja, 0);

  const rezerwuj = async () => {
    setBlad('');
    setWysylanie(true);
    try {
      const r = await api('/rezerwacje-sprzetu', {
        method: 'POST',
        body: { dataOd: koszyk.dataOd, dataDo: koszyk.dataDo, pozycje: koszyk.pozycje.map((p) => ({ idModelu: p.idModelu, rozmiar: p.rozmiar })) },
      });
      zapisz(pusty);
      nav(`/rezerwacje?nowa=${r.kod}`);
    } catch (e) {
      setBlad((e as Error).message);
    } finally {
      setWysylanie(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Koszyk</h1>
      <div className="karta grid grid-cols-2 gap-3 mb-4">
        <label>
          <span className="etykieta">Odbiór</span>
          <input type="date" className="pole" min={new Date().toISOString().slice(0, 10)} value={koszyk.dataOd ?? ''} onChange={(e) => zapisz({ ...koszyk, dataOd: e.target.value })} />
        </label>
        <label>
          <span className="etykieta">Zwrot</span>
          <input type="date" className="pole" min={koszyk.dataOd ?? ''} value={koszyk.dataDo ?? ''} onChange={(e) => zapisz({ ...koszyk, dataDo: e.target.value })} />
        </label>
      </div>
      {!koszyk.pozycje.length ? (
        <p>Koszyk jest pusty. <Link to="/" className="underline">Wybierz sprzęt z katalogu.</Link></p>
      ) : (
        <div className="karta">
          <table className="tabela">
            <thead><tr><th>Sprzęt</th><th>Rozmiar</th><th>Cena</th><th /></tr></thead>
            <tbody>
              {koszyk.pozycje.map((p, i) => (
                <tr key={i}>
                  <td>{p.nazwa}</td>
                  <td>{p.rozmiar ?? '—'}</td>
                  <td>{zl(p.cena)}/dzień + kaucja {zl(p.kaucja)}</td>
                  <td><button className="text-red-700 text-sm" onClick={() => zapisz({ ...koszyk, pozycje: koszyk.pozycje.filter((_, j) => j !== i) })}>Usuń</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3">Dni: {dni > 0 ? dni : '—'} · Razem z kaucją: <b>{zl(suma)}</b></p>
          <p className="text-xs text-slate-500 mt-1">Płatność przy odbiorze sprzętu. Kaucję oddajemy przy zwrocie.</p>
          {blad && <p className="blad mt-3">{blad}</p>}
          <div className="mt-3 flex gap-2">
            <button className="btn" disabled={!dni || dni < 1 || wysylanie} onClick={rezerwuj}>Zarezerwuj</button>
            <Link to="/" className="btn-jasny">Dodaj więcej sprzętu</Link>
          </div>
        </div>
      )}
    </div>
  );
}
