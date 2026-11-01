import { useState, type FormEvent } from 'react';
import { NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, data, useDane, zl } from '../api';
import { STATUSY } from './Klient';

const dzis = () => new Date().toISOString().slice(0, 10);

export default function Pracownik() {
  const zakladka = ({ isActive }: { isActive: boolean }) => (isActive ? 'btn' : 'btn-jasny');
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <NavLink to="/pracownik" end className={zakladka}>Rezerwacje</NavLink>
        <NavLink to="/pracownik/na-miejscu" className={zakladka}>Wypożyczenie na miejscu</NavLink>
        <NavLink to="/pracownik/egzemplarze" className={zakladka}>Magazyn</NavLink>
      </div>
      <Routes>
        <Route index element={<Wyszukiwanie />} />
        <Route path="rezerwacja/:id" element={<Obsluga />} />
        <Route path="na-miejscu" element={<NaMiejscu />} />
        <Route path="egzemplarze" element={<Magazyn />} />
      </Routes>
    </div>
  );
}

function Wyszukiwanie() {
  const [szukaj, setSzukaj] = useState('');
  const [fraza, setFraza] = useState('');
  const { dane, blad } = useDane<any[]>(`/rezerwacje-sprzetu?szukaj=${encodeURIComponent(fraza)}`);
  const nav = useNavigate();
  return (
    <div>
      <form onSubmit={(e) => (e.preventDefault(), setFraza(szukaj))} className="flex gap-2 mb-4 max-w-lg">
        <input className="pole" placeholder="Kod (R-000012), nazwisko, telefon lub e-mail" value={szukaj} onChange={(e) => setSzukaj(e.target.value)} />
        <button className="btn">Szukaj</button>
      </form>
      {!fraza && <p className="text-sm text-slate-600 mb-2">Aktywne rezerwacje:</p>}
      {blad && <p className="blad">{blad}</p>}
      <table className="tabela karta">
        <thead><tr><th>Kod</th><th>Klient</th><th>Termin</th><th>Status</th><th>Pozycje</th></tr></thead>
        <tbody>
          {dane?.map((r) => (
            <tr key={r.id_rezerwacji} className="cursor-pointer hover:bg-sky-50" onClick={() => nav(`/pracownik/rezerwacja/${r.id_rezerwacji}`)}>
              <td className="font-medium">{r.kod}</td>
              <td>{r.klient.imie} {r.klient.nazwisko}<div className="text-xs text-slate-500">{r.klient.telefon}</div></td>
              <td>{data(r.data_od)} – {data(r.data_do)}</td>
              <td>{STATUSY[r.status]}</td>
              <td>{r.pozycja_rezerwacji.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dane && !dane.length && <p className="mt-2">Brak wyników.</p>}
    </div>
  );
}

function Obsluga() {
  const { id } = useParams();
  const { dane: r, blad, odswiez } = useDane<any>(`/rezerwacje-sprzetu/${id}`);
  const [przypisane, setPrzypisane] = useState<Record<number, number>>({});
  const [szkody, setSzkody] = useState<Record<number, { opis: string; oplata: string }>>({});
  const [info, setInfo] = useState<{ ok: boolean; t: string } | null>(null);
  const [rozliczenie, setRozliczenie] = useState<any>(null);

  if (blad) return <p className="blad">{blad}</p>;
  if (!r) return null;
  const akcja = async (f: () => Promise<any>, ok: string) => {
    try {
      const w = await f();
      if (w?.rozliczenie) setRozliczenie(w.rozliczenie);
      setInfo({ ok: true, t: ok });
      odswiez();
    } catch (e) {
      setInfo({ ok: false, t: (e as Error).message });
    }
  };
  const doWydania = ['UTWORZONA', 'OPLACONA'].includes(r.status);

  return (
    <div className="karta max-w-3xl space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <h1 className="text-xl font-semibold">{r.kod} · {STATUSY[r.status]}</h1>
        <span>{data(r.data_od)} – {data(r.data_do)}</span>
      </div>
      <p className="text-sm">{r.klient.imie} {r.klient.nazwisko}, {r.klient.email}{r.klient.telefon && `, tel. ${r.klient.telefon}`} · kwota z kaucją {zl(r.kwota_calkowita)}</p>
      <table className="tabela">
        <thead><tr><th>Model</th><th>Zalecany rozmiar</th><th>Egzemplarz</th>{r.status === 'WYDANA' && <th>Uszkodzenie</th>}</tr></thead>
        <tbody>
          {r.pozycja_rezerwacji.map((p: any) => (
            <tr key={p.id_pozycji}>
              <td>{p.model_sprzetu.producent} {p.model_sprzetu.nazwa}</td>
              <td>{p.rozmiar_zalecany ?? '—'}</td>
              <td>
                {doWydania ? (
                  <select className="pole" value={przypisane[p.id_pozycji] ?? ''} onChange={(e) => setPrzypisane({ ...przypisane, [p.id_pozycji]: Number(e.target.value) })}>
                    <option value="">wybierz…</option>
                    {p.wolneEgzemplarze?.map((e: any) => (
                      <option key={e.id_egzemplarza} value={e.id_egzemplarza}>{e.kod_inwentarzowy} ({e.dlugosc_cm ? `${e.dlugosc_cm} cm` : e.rozmiar ?? 'uniw.'})</option>
                    ))}
                  </select>
                ) : (
                  p.egzemplarz?.kod_inwentarzowy ?? '—'
                )}
              </td>
              {r.status === 'WYDANA' && (
                <td className="space-y-1">
                  <input className="pole" placeholder="opis (puste = sprawny)" value={szkody[p.id_egzemplarza]?.opis ?? ''} onChange={(e) => setSzkody({ ...szkody, [p.id_egzemplarza]: { oplata: szkody[p.id_egzemplarza]?.oplata ?? '0', opis: e.target.value } })} />
                  {szkody[p.id_egzemplarza]?.opis && (
                    <input className="pole" type="number" min={0} placeholder="opłata zł" value={szkody[p.id_egzemplarza].oplata} onChange={(e) => setSzkody({ ...szkody, [p.id_egzemplarza]: { ...szkody[p.id_egzemplarza], oplata: e.target.value } })} />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {info && <p className={info.ok ? 'ok' : 'blad'}>{info.t}</p>}
      {rozliczenie && (
        <p className="text-sm">
          Kaucja {zl(rozliczenie.kaucja)} − zwłoka {zl(rozliczenie.oplataZwloka)} ({rozliczenie.dniZwloki} dni) − szkody {zl(rozliczenie.oplataSzkody)} ={' '}
          <b>{rozliczenie.doZwrotuZKaucji >= 0 ? `do zwrotu ${zl(rozliczenie.doZwrotuZKaucji)}` : `dopłata ${zl(-rozliczenie.doZwrotuZKaucji)}`}</b>
        </p>
      )}
      <div className="flex gap-2">
        {doWydania && (
          <>
            <button
              className="btn"
              onClick={() =>
                akcja(
                  () => api(`/rezerwacje-sprzetu/${id}/wydanie`, { method: 'POST', body: { egzemplarze: Object.entries(przypisane).map(([idPozycji, idEgzemplarza]) => ({ idPozycji: Number(idPozycji), idEgzemplarza })) } }),
                  'Sprzęt wydany. Pobierz płatność i ustaw wiązania.',
                )
              }
            >
              Wydaj sprzęt
            </button>
            <button className="btn-jasny" onClick={() => confirm('Anulować rezerwację?') && akcja(() => api(`/rezerwacje-sprzetu/${id}/anuluj`, { method: 'POST' }), 'Rezerwacja anulowana.')}>Anuluj</button>
          </>
        )}
        {r.status === 'WYDANA' && (
          <button
            className="btn"
            onClick={() =>
              akcja(
                () =>
                  api(`/rezerwacje-sprzetu/${id}/zwrot`, {
                    method: 'POST',
                    body: { uszkodzenia: Object.entries(szkody).filter(([, s]) => s.opis.trim()).map(([idE, s]) => ({ idEgzemplarza: Number(idE), opis: s.opis, oplata: Number(s.oplata) || 0 })) },
                  }),
                'Zwrot przyjęty.',
              )
            }
          >
            Przyjmij zwrot
          </button>
        )}
      </div>
    </div>
  );
}

function NaMiejscu() {
  const { dane: modele } = useDane<{ dane: any[] }>('/sprzet/modele?rozmiar=100');
  const [pozycje, setPozycje] = useState<{ idModelu: number; rozmiar: string }[]>([]);
  const [blad, setBlad] = useState('');
  const nav = useNavigate();
  const wyslij = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const r = await api('/rezerwacje-sprzetu', {
        method: 'POST',
        body: {
          dataOd: dzis(),
          dataDo: f.dataDo,
          klient: { email: f.email, imie: f.imie, nazwisko: f.nazwisko, telefon: f.telefon || undefined },
          pozycje: pozycje.map((p) => ({ idModelu: p.idModelu, rozmiar: p.rozmiar || null })),
        },
      });
      nav(`/pracownik/rezerwacja/${r.id_rezerwacji}`);
    } catch (err) {
      setBlad((err as Error).message);
    }
  };
  return (
    <form onSubmit={wyslij} className="karta max-w-2xl space-y-3">
      <h1 className="text-xl font-semibold">Wypożyczenie bez rezerwacji</h1>
      <div className="grid grid-cols-2 gap-2">
        <input name="imie" required placeholder="Imię" className="pole" />
        <input name="nazwisko" required placeholder="Nazwisko" className="pole" />
        <input name="email" type="email" required placeholder="E-mail" className="pole" />
        <input name="telefon" placeholder="Telefon" className="pole" />
      </div>
      <label className="block max-w-xs"><span className="etykieta">Zwrot do</span><input name="dataDo" type="date" required min={dzis()} defaultValue={dzis()} className="pole" /></label>
      {pozycje.map((p, i) => (
        <div key={i} className="flex gap-2">
          <select className="pole" value={p.idModelu} onChange={(e) => setPozycje(pozycje.map((x, j) => (j === i ? { ...x, idModelu: Number(e.target.value) } : x)))}>
            {modele?.dane.map((m) => <option key={m.id_modelu} value={m.id_modelu}>{m.kategoria_sprzetu.nazwa}: {m.producent} {m.nazwa}</option>)}
          </select>
          <input className="pole w-28" placeholder="rozmiar" value={p.rozmiar} onChange={(e) => setPozycje(pozycje.map((x, j) => (j === i ? { ...x, rozmiar: e.target.value } : x)))} />
          <button type="button" className="btn-jasny" onClick={() => setPozycje(pozycje.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn-jasny" disabled={!modele} onClick={() => setPozycje([...pozycje, { idModelu: modele!.dane[0].id_modelu, rozmiar: '' }])}>+ Dodaj pozycję</button>
      <p className="text-xs text-slate-500">Rozmiar: długość w cm (narty, kijki, deska) albo rozmiar (buty, kask). Puste pole = rozmiar z profilu klienta lub uniwersalny.</p>
      {blad && <p className="blad">{blad}</p>}
      <button className="btn" disabled={!pozycje.length}>Utwórz i przejdź do wydania</button>
    </form>
  );
}

const STANY = ['DOSTEPNY', 'WYPOZYCZONY', 'W_SERWISIE', 'WYCOFANY'];

function Magazyn() {
  const { dane: modele } = useDane<{ dane: any[] }>('/sprzet/modele?rozmiar=100&wszystkie=1');
  const { dane, blad, odswiez } = useDane<any[]>('/sprzet/egzemplarze');
  const [info, setInfo] = useState('');
  const zmien = (id: number, stan: string) => api(`/sprzet/egzemplarze/${id}`, { method: 'PATCH', body: { stan } }).then(odswiez).catch((e) => setInfo(e.message));
  const dodaj = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await api('/sprzet/egzemplarze', {
        method: 'POST',
        body: { id_modelu: Number(f.id_modelu), kod_inwentarzowy: f.kod, rozmiar: f.rozmiar || null, dlugosc_cm: f.dlugosc ? Number(f.dlugosc) : null },
      });
      (e.target as HTMLFormElement).reset();
      setInfo('');
      odswiez();
    } catch (err) {
      setInfo((err as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <form onSubmit={dodaj} className="karta flex flex-wrap gap-2 items-end">
        <select name="id_modelu" className="pole max-w-xs">{modele?.dane.map((m) => <option key={m.id_modelu} value={m.id_modelu}>{m.producent} {m.nazwa}</option>)}</select>
        <input name="kod" required placeholder="Kod inwentarzowy" className="pole max-w-40" />
        <input name="dlugosc" type="number" placeholder="Długość cm" className="pole max-w-28" />
        <input name="rozmiar" placeholder="Rozmiar" className="pole max-w-24" />
        <button className="btn">Dodaj egzemplarz</button>
      </form>
      {(blad || info) && <p className="blad">{blad || info}</p>}
      <table className="tabela karta">
        <thead><tr><th>Kod</th><th>Model</th><th>Rozmiar</th><th>Stan</th></tr></thead>
        <tbody>
          {dane?.map((e) => (
            <tr key={e.id_egzemplarza}>
              <td>{e.kod_inwentarzowy}</td>
              <td>{e.model_sprzetu.producent} {e.model_sprzetu.nazwa}</td>
              <td>{e.dlugosc_cm ? `${e.dlugosc_cm} cm` : e.rozmiar ?? '—'}</td>
              <td>
                <select className="pole" value={e.stan} onChange={(x) => zmien(e.id_egzemplarza, x.target.value)}>
                  {STANY.map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
