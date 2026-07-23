import { useEffect, useRef, useState } from 'react';

/*
 * Janela Identificar Cliente do caixa — em React.
 *
 * Migrada pela segurança: nome, fantasia, CPF/CNPJ e cidade vêm do estoque
 * (digitados por pessoas) e antes iam para innerHTML. No JSX são escapados.
 *
 * O main.js é dono do cliente da pré-venda: seleção/remoção voltam por
 * ctx.onSelecionado / ctx.onRemovido.
 */
export default function IdentificarClienteModal({ ctx, onClose }) {
  const { estoqueApi, toast, onSelecionado, onRemovido } = ctx;

  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [estado, setEstado] = useState('vazio'); // vazio | buscando | ok | erro
  const [erro, setErro] = useState('');
  const buscaRef = useRef(null);

  useEffect(() => { setTimeout(() => buscaRef.current?.focus(), 60); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function buscar() {
    const q = busca.trim();
    if (!q) return toast('Digite para buscar.');
    setEstado('buscando'); setErro('');
    try {
      const lista = await estoqueApi(`/clientes?busca=${encodeURIComponent(q)}`);
      setClientes(lista);
      setEstado('ok');
      if (lista.length === 1) selecionar(lista[0]);
    } catch (e) {
      setErro(e.message); setEstado('erro'); setClientes([]);
    }
  }

  function selecionar(c) {
    onSelecionado(c);
    toast(`Cliente identificado: <b>${c.nome}</b>`);
    onClose();
  }

  function remover() {
    onRemovido();
    toast('Cliente removido da pré-venda.');
    onClose();
  }

  return (
    <div className="janela" style={{ maxWidth: 780 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Identificar Cliente</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="janela-corpo">
        <div className="linha-consulta" style={{ marginBottom: 10 }}>
          <input ref={buscaRef} type="text" value={busca} autoComplete="off"
            placeholder="Nome, CPF/CNPJ ou código do cliente…"
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }} />
          <button className="btn-acao" onClick={buscar}>Buscar</button>
        </div>

        <div className="moldura-grid" style={{ maxHeight: 300 }}>
          <table className="tabela">
            <thead><tr>
              <th className="num">Cód</th><th>Nome</th><th>Fantasia</th><th>CPF/CNPJ</th><th>Cidade</th>
            </tr></thead>
            <tbody>
              {estado === 'vazio' ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Digite para buscar.</td></tr>
              ) : estado === 'buscando' ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Buscando…</td></tr>
              ) : estado === 'erro' ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--vermelho)', padding: 18 }}>{erro}</td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>Nenhum cliente.</td></tr>
              ) : clientes.map((c) => (
                <tr key={c.id} onClick={() => selecionar(c)}>
                  <td className="num">{c.cod || '—'}</td>
                  <td>{c.nome}</td>
                  <td>{c.fantasia || '—'}</td>
                  <td>{c.cpfCnpj || '—'}</td>
                  <td>{c.cidade || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rodape-form">
          <button className="btn-acao" onClick={onClose}>Fechar</button>
          <button className="btn-acao" onClick={remover}>Remover Cliente</button>
        </div>
      </div>
    </div>
  );
}
