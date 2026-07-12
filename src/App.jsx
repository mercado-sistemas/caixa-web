import { useEffect, useState, useCallback } from 'react';
import { TituloSistema, Janela, Campo, Botao, Tabela, useToast, brl } from '@mercado/shared';
import { api, auth } from './api.js';
import Login from './Login.jsx';

const totalPV = (pv) => pv.itens.reduce((s, i) => s + i.qtd * i.unit, 0);

export default function App() {
  const toast = useToast();
  const [sessao, setSessao] = useState(null);
  const [pvs, setPvs] = useState([]);
  const [ativa, setAtiva] = useState(null);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [lanc, setLanc] = useState({ qtd: 1, unit: '', produto: null });
  const [pagando, setPagando] = useState(null); // { especies, pagamentos }

  const carregar = useCallback(async () => {
    try { setPvs(await api('/prevendas')); } catch (e) { toast(e.message); }
  }, [toast]);
  useEffect(() => { if (sessao) carregar(); }, [sessao, carregar]);

  if (!sessao) return <Login titulo="ESTOCAAÍ — CAIXA / PRÉ-VENDA" aoEntrar={setSessao} />;

  const pv = pvs.find((p) => p.num === ativa);

  async function novaPV() {
    const nova = await api('/prevendas', { method: 'POST', body: {} });
    setAtiva(nova.num); carregar();
  }

  async function buscarProduto(termo) {
    setBusca(termo);
    if (!termo.trim()) return setResultados([]);
    // A busca de produto vai na API de ESTOQUE — o caixa consulta via BFF próprio?
    // Simplificação do protótipo: caixa-web fala com estocaai-bff só pra busca.
    const r = await fetch(`${import.meta.env.VITE_ESTOQUE_BFF_URL || 'http://localhost:3001'}/api/produtos?busca=${encodeURIComponent(termo)}`,
      { headers: { authorization: `Bearer ${auth.token}` } });
    setResultados(await r.json());
  }

  async function lancar() {
    if (!pv) return toast('Abra uma Pré-Venda primeiro.');
    if (!lanc.produto) return toast('Escolha um produto na busca.');
    try {
      await api(`/prevendas/${pv.num}/itens`, {
        method: 'POST',
        body: { produtoId: lanc.produto.id, cod: lanc.produto.cod, nome: lanc.produto.nome,
          qtd: Number(lanc.qtd), unit: Number(lanc.unit || lanc.produto.preco), precoMin: lanc.produto.precoMin },
      });
      setLanc({ qtd: 1, unit: '', produto: null }); setBusca(''); setResultados([]);
      carregar();
    } catch (e) { toast(e.message); }
  }

  async function abrirPagamento() {
    if (!pv || !pv.itens.length) return toast('PV vazia.');
    const especies = await api('/especies');
    setPagando({ especies, pagamentos: [] });
  }

  async function emitir() {
    try {
      const v = await api(`/prevendas/${pv.num}/emitir`, { method: 'POST', body: { pagamentos: pagando.pagamentos } });
      setPagando(null); setAtiva(null); carregar();
      toast(`<b>NFC-e emitida</b> (simulada) — venda ${v.num} de R$ ${brl(v.total)}${v.troco ? ` · troco R$ ${brl(v.troco)}` : ''}`);
    } catch (e) { toast(e.message); }
  }

  const pago = pagando ? pagando.pagamentos.reduce((s, p) => s + Number(p.valor), 0) : 0;
  const saldo = pv ? Math.max(totalPV(pv) - pago, 0) : 0;

  return (
    <>
      <TituloSistema nome="ESTOCA" destaque="AÍ · CAIXA" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16, display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
        <section style={{ display: 'grid', gap: 10, alignContent: 'start', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          {pvs.map((p) => (
            <button key={p.num} onClick={() => setAtiva(p.num)}
              style={{ textAlign: 'left', background: ativa === p.num ? 'var(--amarelo-bg)' : '#fff',
                border: ativa === p.num ? '2px solid var(--amarelo)' : '1px solid var(--linha)', borderRadius: 9, padding: '10px 12px' }}>
              <div style={{ fontWeight: 900, color: 'var(--azul)', fontSize: 13 }}>PV: {String(p.num).padStart(10, '0')}</div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', margin: '4px 0' }}>{p.cliente.cod}-{p.cliente.nome}</div>
              <div style={{ fontSize: 11.5, color: 'var(--cinza)' }}>Qtde Itens: {p.itens.length}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--azul-3)', textAlign: 'right' }}>{brl(totalPV(p))}</div>
            </button>
          ))}
          {!pvs.length && <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--cinza)', padding: 30 }}>Nenhuma PV aberta — clique em "1-Nova".</div>}
        </section>

        <Janela titulo={pv ? `Pré-Venda ${pv.num}` : 'Pré-Venda'}>
          <Campo label="Quantidade" type="number" min="0.001" step="any" value={lanc.qtd}
            onChange={(e) => setLanc({ ...lanc, qtd: e.target.value })} />
          <Campo label="Produto">
            <input placeholder="nome ou código (use %)" value={busca} onChange={(e) => buscarProduto(e.target.value)} />
          </Campo>
          {resultados.length > 0 && !lanc.produto && (
            <div style={{ maxHeight: 140, overflow: 'auto', border: '1px solid var(--linha)', borderRadius: 6, marginBottom: 8 }}>
              {resultados.map((p) => (
                <button key={p.id} onClick={() => { setLanc({ ...lanc, produto: p, unit: p.preco }); setResultados([]); setBusca(p.cod + ' — ' + p.nome); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: 'none', borderBottom: '1px solid var(--linha)', fontSize: 12.5 }}>
                  <b>{p.cod}</b> {p.nome} — R$ {brl(p.preco)}
                </button>
              ))}
            </div>
          )}
          <Campo label="P. Unitário" type="number" min="0" step="any" value={lanc.unit}
            onChange={(e) => setLanc({ ...lanc, unit: e.target.value })} />
          <Botao primario style={{ width: '100%' }} onClick={lancar}>Lançar item</Botao>

          <div style={{ margin: '12px 0 6px', fontWeight: 900, color: 'var(--azul)', textAlign: 'center' }}>
            {pv?.itens.length || 0} Itens Lançados
          </div>
          <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--linha)', borderRadius: 6 }}>
            <Tabela colunas={[{ chave: 'c', rotulo: 'Prod' }, { chave: 'd', rotulo: 'Descrição' }, { chave: 'q', rotulo: 'Qtde', num: true }, { chave: 't', rotulo: 'Total', num: true }]}
              dados={pv?.itens || []}
              renderLinha={(i, ix) => (
                <tr key={ix}><td className="num">{i.cod}</td><td>{i.nome}</td>
                  <td className="num">{i.qtd}</td><td className="num">{brl(i.qtd * i.unit)}</td></tr>
              )} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10 }}>
            <b style={{ color: 'var(--azul)' }}>Sub Total: R$</b>
            <b style={{ fontSize: 24, color: 'var(--vermelho)' }}>{brl(pv ? totalPV(pv) : 0)}</b>
          </div>
        </Janela>

        <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Botao onClick={novaPV}>1-Nova Pré-Venda</Botao>
          <Botao onClick={async () => { if (pv) { await api(`/prevendas/${pv.num}`, { method: 'DELETE' }); setAtiva(null); carregar(); } }}>Cancela Pré-Venda</Botao>
          <Botao primario onClick={abrirPagamento}>5-Emitir NFC-e</Botao>
          <span style={{ marginLeft: 'auto' }}>
            <Botao onClick={() => { auth.limpar(); setSessao(null); }}>Sair</Botao>
          </span>
        </div>

        {pagando && pv && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,33,61,.55)', display: 'grid', placeItems: 'center', padding: 14, zIndex: 100 }}
            onClick={(e) => e.target === e.currentTarget && setPagando(null)}>
            <div style={{ width: '100%', maxWidth: 560 }}>
              <Janela titulo={`Informe o Pagamento — R$ ${brl(totalPV(pv))}`}>
                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', marginBottom: 10 }}>
                  {pagando.especies.map((e) => (
                    <Botao key={e.c} onClick={() => {
                      const valor = prompt(`Valor em ${e.d}:`, saldo.toFixed(2));
                      if (valor) setPagando({ ...pagando, pagamentos: [...pagando.pagamentos, { c: e.c, d: e.d, valor: Number(valor) }] });
                    }}>{e.c}-{e.d}</Botao>
                  ))}
                </div>
                {pagando.pagamentos.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '2px 0' }}>
                    <span>{p.d}</span><b>R$ {brl(p.valor)}</b>
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontSize: 26, fontWeight: 900, color: saldo === 0 ? 'var(--verde)' : 'var(--vermelho)' }}>
                  Saldo: R$ {brl(saldo)}
                </div>
                {pago > totalPV(pv) && <div style={{ textAlign: 'right', color: 'var(--verde)', fontWeight: 800 }}>Troco: R$ {brl(pago - totalPV(pv))}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <Botao onClick={() => setPagando(null)}>Voltar</Botao>
                  <Botao primario disabled={saldo > 0} onClick={emitir}>Emitir NFC-e</Botao>
                </div>
              </Janela>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
