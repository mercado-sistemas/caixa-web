import { useEffect, useRef, useState } from 'react';
import ScannerCamera from '../scanner/ScannerCamera.jsx';

/*
 * Janela Buscar Produto (F7) do caixa — em React.
 *
 * Migrada pela segurança: o nome do produto vem do estoque (digitado por
 * pessoas) e antes ia para innerHTML na lista de resultados. No JSX é escapado.
 *
 * O main.js continua dono da pré-venda: quando um item é adicionado, o
 * componente devolve a pré-venda atualizada via ctx.onItemAdicionado.
 */
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BuscarProdutoModal({ ctx, onClose }) {
  const { estoqueApi, caixaApi, toast, filialAtual, nomeFil, preVendaNum, onItemAdicionado } = ctx;

  const [busca, setBusca] = useState('');
  const [scannerAberto, setScannerAberto] = useState(false);
  const [produtos, setProdutos] = useState([]);
  const [estado, setEstado] = useState('vazio'); // vazio | buscando | ok | erro
  const [erro, setErro] = useState('');
  const [selId, setSelId] = useState(null);
  const [qtd, setQtd] = useState(1);
  const [unit, setUnit] = useState('');
  const [adicionando, setAdicionando] = useState(false);

  const buscaRef = useRef(null);
  const qtdRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => { setTimeout(() => buscaRef.current?.focus(), 60); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selecionado = produtos.find((p) => p.id === selId) || null;

  async function buscar(q) {
    const termo = (q ?? busca).trim();
    if (!termo) return;
    setEstado('buscando'); setErro('');
    try {
      const lista = await estoqueApi(`/produtos?busca=${encodeURIComponent(termo)}`);
      setProdutos(lista);
      setEstado('ok');
      if (lista.length === 1) escolher(lista[0]);
    } catch (e) {
      setErro(e.message); setEstado('erro'); setProdutos([]);
    }
  }

  function onBuscaInput(e) {
    const v = e.target.value;
    setBusca(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => buscar(v), 400);
  }

  // código lido pela câmera: preenche e busca na hora
  function onScan(codigo) {
    setScannerAberto(false);
    const cod = String(codigo).trim();
    setBusca(cod);
    clearTimeout(timer.current);
    if (cod) buscar(cod);
    toast(`Código lido: <b>${cod}</b>`);
  }

  function escolher(p) {
    setSelId(p.id);
    setUnit(p.preco);
    setQtd(1);
    setTimeout(() => qtdRef.current?.focus(), 40);
  }

  async function adicionar() {
    if (!selecionado) return toast('Selecione um produto da lista.');
    const q = parseInt(qtd, 10);
    const u = parseFloat(unit);
    if (!q || q < 1) return toast('Informe uma quantidade válida.');
    if (!u || u <= 0) return toast('Preço deve ser maior que zero.');

    const saldo = (selecionado.saldo ?? {})[filialAtual] || 0;
    if (saldo < q && !window.confirm(`Saldo insuficiente em ${nomeFil(filialAtual)}: ${saldo} disponível.\nContinuar mesmo assim?`)) return;

    setAdicionando(true);
    try {
      const novaPreVenda = await caixaApi(`/prevendas/${preVendaNum}/itens`, {
        method: 'POST',
        body: { produtoId: selecionado.id, cod: selecionado.cod, nome: selecionado.nome, qtd: q, unit: u },
      });
      onItemAdicionado(novaPreVenda);
      toast(`<b>${q}× ${selecionado.cod}</b> adicionado.`);
      onClose();
    } catch (e) {
      toast(e.message);
      setAdicionando(false);
    }
  }

  return (
   <>
    {scannerAberto && <ScannerCamera onDetected={onScan} onClose={() => setScannerAberto(false)} />}
    <div className="janela" style={{ maxWidth: 700 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Buscar Produto</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="janela-corpo">
        <div className="linha-consulta" style={{ marginBottom: 10 }}>
          <input ref={buscaRef} type="text" value={busca} autoComplete="off"
            placeholder="Nome, código ou código de barras… (Enter para pesquisar)"
            onChange={onBuscaInput}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} />
          <button className="btn-acao" onClick={() => buscar()}>Buscar</button>
          <button className="btn-acao primario" type="button" title="Escanear código de barras pela câmera" onClick={() => setScannerAberto(true)}>📷 Escanear</button>
        </div>

        <div className="moldura-grid" style={{ maxHeight: 300 }}>
          <table className="tabela">
            <thead><tr>
              <th>Código</th><th>Descrição</th><th className="num">Saldo {nomeFil(filialAtual)}</th><th className="num">Preço</th>
            </tr></thead>
            <tbody>
              {estado === 'vazio' ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Digite para buscar.</td></tr>
              ) : estado === 'buscando' ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Buscando…</td></tr>
              ) : estado === 'erro' ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--vermelho)', padding: 18 }}>{erro}</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhum produto encontrado.</td></tr>
              ) : produtos.map((p) => {
                const saldo = (p.saldo ?? {})[filialAtual] || 0;
                return (
                  <tr key={p.id} className={p.id === selId ? 'sel' : ''} onClick={() => escolher(p)}>
                    <td className="num">{p.cod}</td>
                    <td>{p.nome}</td>
                    <td className={`num ${saldo === 0 ? 'neg' : ''}`}>{saldo}</td>
                    <td className="num">{brl(p.preco)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selecionado ? (
          <>
            <div style={{ borderTop: '1px solid var(--linha)', marginTop: 12, paddingTop: 12 }}>
              <div className="form-linha"><label>Produto</label><input value={`${selecionado.cod} — ${selecionado.nome}`} disabled /></div>
              <div className="form-linha"><label>Quantidade</label>
                <input ref={qtdRef} type="number" min="1" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} /></div>
              <div className="form-linha"><label>Preço Unit. (R$)</label>
                <input type="number" step="any" min="0.01" inputMode="decimal" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            </div>
            <div className="rodape-form">
              <button className="btn-acao" onClick={onClose}>Fechar</button>
              <button className="btn-acao primario" onClick={adicionar} disabled={adicionando}>{adicionando ? 'Adicionando…' : 'Adicionar Item'}</button>
            </div>
          </>
        ) : (
          <div className="rodape-form" style={{ marginTop: 10 }}>
            <button className="btn-acao" onClick={onClose}>Fechar</button>
          </div>
        )}
      </div>
    </div>
   </>
  );
}
