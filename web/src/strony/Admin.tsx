import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { POZIOMY, api, data, useDane } from '../api';

export default function Admin() {
  const zakladka = ({ isActive }: { isActive: boolean }) => (isActive ? 'btn' : 'btn-jasny');
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <NavLink to="/admin" end className={zakladka}>Konta</NavLink>
        <NavLink to="/admin/sprzet" className={zakladka}>Katalog i cennik</NavLink>
        <NavLink to="/admin/artykuly" className={zakladka}>Baza wiedzy</NavLink>
        <NavLink to="/admin/pytania" className={zakladka}>Pytania bez odpowiedzi</NavLink>
        <NavLink to="/admin/audyt" className={zakladka}>Dziennik audytu</NavLink>
      </div>
      <Routes>
        <Route index element={<Konta />} />
        <Route path="sprzet" element={<Katalog />} />
        <Route path="artykuly" element={<Artykuly />} />
        <Route path="artykuly/:id" element={<EdycjaArtykulu />} />
        <Route path="pytania" element={<Pytania />} />
        <Route path="audyt" element={<Audyt />} />
      </Routes>
    </div>
  );
}

function Konta() {
  const [szukaj, setSzukaj] = useState('');
  const { dane, blad, odswiez } = useDane<{ dane: any[] }>(`/admin/uzytkownicy?rozmiar=100&szukaj=${encodeURIComponent(szukaj)}`);
  const [bladAkcji, setBladAkcji] = useState('');
  const zmien = (id: number, body: object) => api(`/admin/uzytkownicy/${id}`, { method: 'PATCH', body }).then(odswiez).catch((e) => setBladAkcji(e.message));
  return (
    <div>
      <input className="pole max-w-sm mb-3" placeholder="Szukaj po e-mailu, nazwisku, telefonie" value={szukaj} onChange={(e) => setSzukaj(e.target.value)} />
      {(blad || bladAkcji) && <p className="blad mb-2">{blad || bladAkcji}</p>}
      <table className="tabela karta">
        <thead><tr><th>E-mail</th><th>Imię i nazwisko</th><th>Rola</th><th>Konto</th></tr></thead>
        <tbody>
          {dane?.dane.map((u) => (
            <tr key={u.id_uzytkownika}>
              <td>{u.email}{!u.email_potwierdzony && <span className="text-xs text-amber-700"> (niepotwierdzony)</span>}</td>
              <td>{u.imie} {u.nazwisko}</td>
              <td>
                <select className="pole" value={u.rola} onChange={(e) => zmien(u.id_uzytkownika, { rola: e.target.value })}>
                  {['KLIENT', 'INSTRUKTOR', 'PRACOWNIK', 'ADMIN'].map((r) => <option key={r}>{r}</option>)}
                </select>
              </td>
              <td><button className="btn-jasny" onClick={() => zmien(u.id_uzytkownika, { aktywny: !u.aktywny })}>{u.aktywny ? 'Zablokuj' : 'Odblokuj'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Katalog() {
  const { dane: kategorie } = useDane<any[]>('/sprzet/kategorie');
  const { dane, odswiez } = useDane<{ dane: any[] }>('/sprzet/modele?rozmiar=100&wszystkie=1');
  const [info, setInfo] = useState('');
  const zapisz = (id: number, body: object) => api(`/sprzet/modele/${id}`, { method: 'PATCH', body }).then(odswiez).catch((e) => setInfo(e.message));
  const dodaj = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await api('/sprzet/modele', {
        method: 'POST',
        body: { id_kategorii: Number(f.kat), producent: f.producent, nazwa: f.nazwa, opis: f.opis || null, poziom_docelowy: f.poziom || null, cena_za_dzien: Number(f.cena), kaucja: Number(f.kaucja || 0) },
      });
      (e.target as HTMLFormElement).reset();
      odswiez();
    } catch (err) {
      setInfo((err as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <form onSubmit={dodaj} className="karta grid gap-2 sm:grid-cols-4">
        <select name="kat" className="pole">{kategorie?.map((k) => <option key={k.id_kategorii} value={k.id_kategorii}>{k.nazwa}</option>)}</select>
        <input name="producent" required placeholder="Producent" className="pole" />
        <input name="nazwa" required placeholder="Nazwa modelu" className="pole" />
        <select name="poziom" className="pole"><option value="">Poziom: dowolny</option>{Object.entries(POZIOMY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="opis" placeholder="Opis" className="pole sm:col-span-2" />
        <input name="cena" type="number" step="0.01" min={0} required placeholder="Cena/dzień" className="pole" />
        <input name="kaucja" type="number" step="0.01" min={0} placeholder="Kaucja" className="pole" />
        <button className="btn sm:col-span-4">Dodaj model</button>
      </form>
      {info && <p className="blad">{info}</p>}
      <table className="tabela karta">
        <thead><tr><th>Model</th><th>Cena/dzień</th><th>Kaucja</th><th>W katalogu</th></tr></thead>
        <tbody>
          {dane?.dane.map((m) => (
            <tr key={m.id_modelu}>
              <td>{m.kategoria_sprzetu.nazwa}: {m.producent} {m.nazwa}</td>
              <td><input type="number" step="0.01" min={0} className="pole w-24" defaultValue={Number(m.cena_za_dzien)} onBlur={(e) => Number(e.target.value) !== Number(m.cena_za_dzien) && zapisz(m.id_modelu, { cena_za_dzien: Number(e.target.value) })} /></td>
              <td><input type="number" step="0.01" min={0} className="pole w-24" defaultValue={Number(m.kaucja)} onBlur={(e) => Number(e.target.value) !== Number(m.kaucja) && zapisz(m.id_modelu, { kaucja: Number(e.target.value) })} /></td>
              <td><input type="checkbox" checked={m.aktywny} onChange={() => zapisz(m.id_modelu, { aktywny: !m.aktywny })} aria-label="Widoczny w katalogu" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_ART: Record<string, string> = { SZKIC: 'Szkic', PROPOZYCJA: 'Propozycja', OPUBLIKOWANY: 'Opublikowany', ARCHIWALNY: 'Archiwalny' };

function Artykuly() {
  const { dane } = useDane<{ dane: any[] }>('/baza-wiedzy/artykuly?wszystkie=1&rozmiar=100');
  return (
    <div>
      <Link to="/admin/artykuly/nowy" className="btn mb-3">Nowy artykuł</Link>
      <table className="tabela karta mt-3">
        <thead><tr><th>Tytuł</th><th>Kategoria</th><th>Status</th><th>Wersja</th></tr></thead>
        <tbody>
          {dane?.dane.map((a) => (
            <tr key={a.id_artykulu}>
              <td><Link to={`/admin/artykuly/${a.id_artykulu}`} className="underline">{a.tytul}</Link></td>
              <td>{a.kategoria_wiedzy.nazwa}</td>
              <td>{STATUS_ART[a.status]}</td>
              <td>{a.wersja}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EdycjaArtykulu() {
  const { id } = useParams();
  const nowy = id === 'nowy';
  const nav = useNavigate();
  const { dane: kategorie } = useDane<any[]>('/baza-wiedzy/kategorie');
  const { dane: a, odswiez } = useDane<any>(nowy ? null : `/baza-wiedzy/artykuly/${id}`);
  const { dane: pytania } = useDane<{ dane: any[] }>('/admin/pytania-bez-odpowiedzi?rozmiar=100');
  const [f, setF] = useState({ idKategorii: 0, tytul: '', tresc: '' });
  const [wybranePytania, setWybranePytania] = useState<number[]>([]);
  const [info, setInfo] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => {
    if (a) setF({ idKategorii: a.id_kategorii_wiedzy, tytul: a.tytul, tresc: a.tresc_markdown });
    else if (kategorie?.length && !f.idKategorii) setF((x) => ({ ...x, idKategorii: kategorie[0].id_kategorii_wiedzy }));
  }, [a, kategorie]);

  const wykonaj = async (fn: () => Promise<any>, ok: string) => {
    try {
      const w = await fn();
      setInfo({ ok: true, t: ok });
      if (nowy) nav(`/admin/artykuly/${w.id_artykulu}`, { replace: true });
      else odswiez();
    } catch (e) {
      setInfo({ ok: false, t: (e as Error).message });
    }
  };
  const zapisz = () => wykonaj(() => (nowy ? api('/baza-wiedzy/artykuly', { method: 'POST', body: f }) : api(`/baza-wiedzy/artykuly/${id}`, { method: 'PATCH', body: f })), 'Zapisano.');

  return (
    <div className="karta max-w-3xl space-y-3">
      <h1 className="text-xl font-semibold">{nowy ? 'Nowy artykuł' : `${a?.tytul ?? ''} · ${STATUS_ART[a?.status] ?? ''} · wersja ${a?.wersja ?? ''}`}</h1>
      <select className="pole" value={f.idKategorii} onChange={(e) => setF({ ...f, idKategorii: Number(e.target.value) })}>
        {kategorie?.map((k) => <option key={k.id_kategorii_wiedzy} value={k.id_kategorii_wiedzy}>{k.nazwa}</option>)}
      </select>
      <input className="pole" placeholder="Tytuł" value={f.tytul} onChange={(e) => setF({ ...f, tytul: e.target.value })} />
      <textarea className="pole h-80 font-mono" placeholder="Treść w Markdown" value={f.tresc} onChange={(e) => setF({ ...f, tresc: e.target.value })} />
      {a?.status === 'OPUBLIKOWANY' && <p className="text-xs text-slate-500">Zapis opublikowanego artykułu tworzy nową wersję i odświeża indeks asystenta.</p>}
      {!nowy && a?.status !== 'OPUBLIKOWANY' && !!pytania?.dane.length && (
        <fieldset className="text-sm">
          <legend className="etykieta">Ten artykuł odpowiada na pytania:</legend>
          {pytania.dane.map((p) => (
            <label key={p.id_pytania} className="block">
              <input type="checkbox" checked={wybranePytania.includes(p.id_pytania)} onChange={(e) => setWybranePytania(e.target.checked ? [...wybranePytania, p.id_pytania] : wybranePytania.filter((x) => x !== p.id_pytania))} /> {p.tresc}
            </label>
          ))}
        </fieldset>
      )}
      {info && <p className={info.ok ? 'ok' : 'blad'}>{info.t}</p>}
      <div className="flex gap-2">
        <button className="btn" onClick={zapisz}>Zapisz</button>
        {!nowy && a && a.status !== 'OPUBLIKOWANY' && (
          <button className="btn" onClick={() => wykonaj(() => api(`/baza-wiedzy/artykuly/${id}/publikacja`, { method: 'POST', body: { idPytan: wybranePytania } }), 'Opublikowano. Asystent dostanie artykuł po zindeksowaniu.')}>Opublikuj</button>
        )}
        {!nowy && a?.status === 'OPUBLIKOWANY' && (
          <button className="btn-jasny" onClick={() => wykonaj(() => api(`/baza-wiedzy/artykuly/${id}`, { method: 'PATCH', body: { status: 'ARCHIWALNY' } }), 'Przeniesiono do archiwum.')}>Archiwizuj</button>
        )}
      </div>
    </div>
  );
}

function Pytania() {
  const [status, setStatus] = useState('NOWE');
  const { dane, odswiez } = useDane<{ dane: any[] }>(`/admin/pytania-bez-odpowiedzi?rozmiar=100&status=${status}`);
  const zmien = (id: number, s: string) => api(`/admin/pytania-bez-odpowiedzi/${id}`, { method: 'PATCH', body: { status: s } }).then(odswiez);
  return (
    <div>
      <p className="text-sm text-slate-600 mb-3">Pytania, na które asystent nie znalazł odpowiedzi w bazie. Napisz artykuł i zaznacz przy publikacji, na które pytania odpowiada.</p>
      <select className="pole max-w-48 mb-3" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="NOWE">Nowe</option><option value="OBSLUZONE">Obsłużone</option><option value="ODRZUCONE">Odrzucone</option>
      </select>
      <table className="tabela karta">
        <thead><tr><th>Pytanie</th><th>Data</th><th>Artykuł</th><th /></tr></thead>
        <tbody>
          {dane?.dane.map((p) => (
            <tr key={p.id_pytania}>
              <td>{p.tresc}</td>
              <td>{data(p.data_utworzenia)}</td>
              <td>{p.artykul?.tytul ?? '—'}</td>
              <td>{p.status === 'NOWE' && <button className="btn-jasny" onClick={() => zmien(p.id_pytania, 'ODRZUCONE')}>Odrzuć</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dane && !dane.dane.length && <p className="mt-2">Brak pytań.</p>}
    </div>
  );
}

function Audyt() {
  const [encja, setEncja] = useState('');
  const [strona, setStrona] = useState(1);
  const { dane } = useDane<{ dane: any[]; lacznie: number }>(`/admin/audyt?rozmiar=50&strona=${strona}&encja=${encja}`);
  return (
    <div>
      <input className="pole max-w-xs mb-3" placeholder="Encja, np. rezerwacja_sprzetu" value={encja} onChange={(e) => (setEncja(e.target.value), setStrona(1))} />
      <table className="tabela karta">
        <thead><tr><th>Czas</th><th>Kto</th><th>Akcja</th><th>Encja</th><th>Zmiana</th></tr></thead>
        <tbody>
          {dane?.dane.map((w) => (
            <tr key={w.id_wpisu}>
              <td className="whitespace-nowrap">{new Date(w.znacznik_czasu).toLocaleString('pl-PL')}</td>
              <td>{w.uzytkownik?.email ?? 'system'}{w.adres_ip && <div className="text-xs text-slate-500">{w.adres_ip}</div>}</td>
              <td>{w.akcja}</td>
              <td>{w.encja} #{w.id_encji}</td>
              <td>
                <details>
                  <summary className="cursor-pointer text-xs">przed / po</summary>
                  <pre className="text-xs max-w-md overflow-auto">{JSON.stringify({ przed: w.dane_przed, po: w.dane_po }, null, 1)}</pre>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 mt-3 items-center text-sm">
        <button className="btn-jasny" disabled={strona === 1} onClick={() => setStrona(strona - 1)}>←</button>
        <span>strona {strona} z {Math.max(1, Math.ceil((dane?.lacznie ?? 0) / 50))}</span>
        <button className="btn-jasny" disabled={strona * 50 >= (dane?.lacznie ?? 0)} onClick={() => setStrona(strona + 1)}>→</button>
      </div>
    </div>
  );
}

