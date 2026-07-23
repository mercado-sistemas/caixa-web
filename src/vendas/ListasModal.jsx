import { useEffect, useState } from 'react';

/*
 * Listas de Pré-Vendas Abertas (F3) e Vendas Finalizadas (F4), em React.
 *
 * Migradas pela segurança: o vendedor é digitado no login do caixa e antes ia
 * para innerHTML na grade. No JSX é escapado.
 *
 * A de abertas permite abrir uma pré-venda; o main.js segue dono do estado, e
 * a seleção volta por ctx.onCarregar(pv).
 */
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const totalItens = (itens) => (itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);
const dataBR = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '—');

function useLista(carregar, toast, onClose) {
  const [linhas, setLinhas] = useState(null); // null = carregando
  useEffect(() => {
    carregar().then(setLinhas).catch((e) => { toast(e.message); setLinhas([]); });
  }, []); // eslint-disable-line
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return linhas;
}

export function PreVendasAbertasModal({ ctx, onClose }) {
  const { caixaApi, toast, nomeFil, onCarregar } = ctx;
  const pvs = useLista(() => caixaApi('/prevendas'), toast, onClose);

  function abrir(pv) {
    onCarregar(pv);
    toast(`Pré-venda <b>#${pv.num}</b> carregada.`);
    onClose();
  }

  return (
    <div className="janela" style={{ maxWidth: 840 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Pré-Vendas Abertas</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="janela-corpo">
        <div className="moldura-grid" style={{ maxHeight: 380 }}>
          <table className="tabela">
            <thead><tr>
              <th className="num">Nº</th><th>Vendedor</th><th>Filial</th>
              <th className="num">Itens</th><th className="num">Total</th><th>Aberta em</th><th></th>
            </tr></thead>
            <tbody>
              {pvs === null ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
              ) : pvs.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhuma pré-venda em aberto.</td></tr>
              ) : pvs.map((pv) => (
                <tr key={pv.num} onClick={() => abrir(pv)} style={{ cursor: 'pointer' }}>
                  <td className="num" style={{ fontWeight: 900 }}>#{pv.num}</td>
                  <td>{pv.vendedor || '—'}</td>
                  <td>{nomeFil(pv.filial)}</td>
                  <td className="num">{(pv.itens || []).length}</td>
                  <td className="num">R$ {brl(totalItens(pv.itens))}</td>
                  <td style={{ fontSize: 11 }}>{dataBR(pv.criadaEm)}</td>
                  <td>
                    <button className="btn-acao primario" style={{ padding: '3px 10px', fontSize: 11 }}
                      onClick={(e) => { e.stopPropagation(); abrir(pv); }}>Abrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rodape-form"><button className="btn-acao" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}

export function VendasFinalizadasModal({ ctx, onClose }) {
  const { caixaApi, toast, nomeFil } = ctx;
  const vendas = useLista(() => caixaApi('/vendas'), toast, onClose);

  return (
    <div className="janela" style={{ maxWidth: 840 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Histórico de Vendas Finalizadas</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="janela-corpo">
        <div className="moldura-grid" style={{ maxHeight: 400 }}>
          <table className="tabela">
            <thead><tr>
              <th className="num">Nº</th><th>Vendedor</th><th>Filial</th>
              <th className="num">Itens</th><th className="num">Total</th><th>Emitida em</th>
            </tr></thead>
            <tbody>
              {vendas === null ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Carregando…</td></tr>
              ) : vendas.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhuma venda finalizada.</td></tr>
              ) : vendas.map((v) => (
                <tr key={v.num}>
                  <td className="num">{v.num}</td>
                  <td>{v.vendedor || '—'}</td>
                  <td>{nomeFil(v.filial)}</td>
                  <td className="num">{(v.itens || []).length}</td>
                  <td className="num" style={{ fontWeight: 900 }}>R$ {brl(totalItens(v.itens))}</td>
                  <td style={{ fontSize: 11 }}>{dataBR(v.emitidaEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rodape-form"><button className="btn-acao" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}
