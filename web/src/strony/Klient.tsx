import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { POZIOMY, api, data, useDane, zl } from '../api';

export const STATUSY: Record<string, string> = { UTWORZONA: 'Zarezerwowana', OPLACONA: 'Opłacona', WYDANA: 'Wydana', ZWROCONA: 'Zwrócona', ANULOWANA: 'Anulowana' };

export function MojeRezerwacje() {
  const [q] = useSearchParams();
  const { dane, blad, odswiez } = useDane<any[]>('/rezerwacje-sprzetu/moje');
  const [bladAkcji, setBladAkcji] = useState('');
  const anuluj = async (id: number) => {
    if (!confirm('Anulować rezerwację?')) return;
    try {
      await api(`/rezerwacje-sprzetu/${id}/anuluj`, { method: 'POST' });
      odswiez();
    } catch (e) {
      setBladAkcji((e as Error).message);
    }
  };
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Moje rezerwacje</h1>
      {q.get('nowa') && <p className="ok mb-4">Rezerwacja {q.get('nowa')} utworzona. Podaj ten kod przy odbiorze sprzętu.</p>}
      {(blad || bladAkcji) && <p className="blad mb-4">{blad || bladAkcji}</p>}
      {dane && !dane.length && <p>Nie masz jeszcze rezerwacji.</p>}
      <div className="space-y-3">
        {dane?.map((r) => (
          <div key={r.id_rezerwacji} className="karta">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">{r.kod}</span>
              <span>{data(r.data_od)} – {data(r.data_do)}</span>
              <span className="text-sm rounded bg-slate-100 px-2">{STATUSY[r.status]}</span>
            </div>
            <ul className="text-sm my-2">
              {r.pozycja_rezerwacji.map((p: any) => (
                <li key={p.id_pozycji}>{p.model_sprzetu.producent} {p.model_sprzetu.nazwa}{p.rozmiar_zalecany && `, rozmiar ${p.rozmiar_zalecany}`}</li>
              ))}
            </ul>
            <div className="flex justify-between items-center text-sm">
              <span>Kwota z kaucją: {zl(r.kwota_calkowita)}</span>
              {['UTWORZONA', 'OPLACONA'].includes(r.status) && <button className="btn-jasny" onClick={() => anuluj(r.id_rezerwacji)}>Anuluj</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Profil() {
  const { dane, odswiez } = useDane<any>('/uzytkownicy/me');
  const [info, setInfo] = useState<{ ok: boolean; t: string } | null>(null);
  const [f, setF] = useState<any>(null);
  useEffect(() => {
    if (dane) setF({ imie: dane.imie, nazwisko: dane.nazwisko, telefon: dane.telefon ?? '', ...dane.profil_klienta });
  }, [dane]);
  if (!f) return null;
  const liczba = (v: any) => (v === '' || v == null ? null : Number(v));
  const wyslij = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/uzytkownicy/me', {
        method: 'PATCH',
        body: {
          imie: f.imie,
          nazwisko: f.nazwisko,
          telefon: f.telefon || null,
          profil: { wzrost_cm: liczba(f.wzrost_cm), waga_kg: liczba(f.waga_kg), rozmiar_buta_eu: liczba(f.rozmiar_buta_eu), poziom_jazdy: f.poziom_jazdy },
        },
      });
      setInfo({ ok: true, t: 'Zapisano.' });
      odswiez();
    } catch (err) {
      setInfo({ ok: false, t: (err as Error).message });
    }
  };
  const pole = (k: string, etykieta: string, typ = 'text', extra = {}) => (
    <label className="block">
      <span className="etykieta">{etykieta}</span>
      <input type={typ} className="pole" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </label>
  );
  return (
    <form onSubmit={wyslij} className="karta max-w-md space-y-3">
      <h1 className="text-xl font-semibold">Mój profil</h1>
      <p className="text-sm text-slate-600">{dane.email}</p>
      {pole('imie', 'Imię')}
      {pole('nazwisko', 'Nazwisko')}
      {pole('telefon', 'Telefon')}
      <h2 className="font-medium pt-2">Dane do doboru sprzętu</h2>
      <div className="grid grid-cols-3 gap-2">
        {pole('wzrost_cm', 'Wzrost (cm)', 'number', { min: 80, max: 230 })}
        {pole('waga_kg', 'Waga (kg)', 'number', { min: 15, max: 200, step: 0.1 })}
        {pole('rozmiar_buta_eu', 'But (EU)', 'number', { min: 15, max: 55, step: 0.5 })}
      </div>
      <label className="block">
        <span className="etykieta">Poziom jazdy</span>
        <select className="pole" value={f.poziom_jazdy ?? 'POCZATKUJACY'} onChange={(e) => setF({ ...f, poziom_jazdy: e.target.value })}>
          {Object.entries(POZIOMY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {info && <p className={info.ok ? 'ok' : 'blad'}>{info.t}</p>}
      <button className="btn">Zapisz</button>
    </form>
  );
}
