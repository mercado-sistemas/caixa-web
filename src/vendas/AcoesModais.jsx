import { useEffect, useRef, useState } from 'react';

/*
 * Ações sobre a pré-venda ativa: Emitir (F9), Cancelar (F8) e Nova (F2).
 *
 * Baixo risco de XSS (números e confirmações), migradas para fechar o caixa-web
 * em React. O main.js segue dono do estado: ao concluir, o componente chama
 * ctx.onConcluida(), que reseta a pré-venda e abre uma nova.
 */
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ESPECIES = [
  'DINHEIRO', 'PIX', 'CARTAO', 'CREDITO_CLIENTE', 'CHEQUE',
  'BOLETO', 'DUPLICATA', 'NOTA_PROMISSORIA', 'PRAZO',
  'CREDITO_FORNECEDOR', 'TRANSFERENCIA_BANCARIA', 'OUTROS',
];

function useEsc(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}

// ─── Emitir NFC-e ──────────────────────────────────────────────────────────────
export function EmitirModal({ ctx, onClose }) {
  const { caixaApi, toast, preVendaNum, total, authToken, onConcluida } = ctx;

  const [pagamentos, setPagamentos] = useState([]);
  const [especie, setEspecie] = useState(ESPECIES[0]);
  const [valor, setValor] = useState('');
  const [emitindo, setEmitindo] = useState(false);
  useEsc(onClose);

  const pago = pagamentos.reduce((s, p) => s + p.valor, 0);
  const pendente = Math.max(0, total - pago);
  const troco = pago - total;

  const valorRef = useRef(null);
  useEffect(() => { setValor(pendente > 0 ? pendente.toFixed(2) : ''); }, []); // eslint-disable-line

  function adicionar() {
    const v = parseFloat(valor);
    if (!especie) return toast('Selecione a forma de pagamento.');
    if (!v || v <= 0) return toast('Informe o valor do pagamento.');
    setPagamentos((ps) => [...ps, { especie, valor: v }]);
    setValor('');
    setTimeout(() => valorRef.current?.focus(), 30);
  }
  function remover(i) { setPagamentos((ps) => ps.filter((_, k) => k !== i)); }

  async function emitir() {
    if (!pagamentos.length) return toast('Adicione ao menos um pagamento.');
    if (pago < total - 0.005) return toast(`Valor pago (R$ ${brl(pago)}) menor que o total (R$ ${brl(total)}).`);
    setEmitindo(true);
    try {
      await caixaApi(`/prevendas/${preVendaNum}/emitir`, { method: 'POST', body: { pagamentos, authToken } });
      toast(`NFC-e emitida! <b>#${preVendaNum}</b>.`);
      onClose();
      await onConcluida();
    } catch (e) {
      toast(e.message);
      setEmitindo(false);
    }
  }

  return (
    <div className="janela" style={{ maxWidth: 640 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Emitir NFC-e — Pagamento</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="janela-corpo">
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          <b>Total da venda: <span style={{ fontSize: 22, color: 'var(--azul)' }}>R$ {brl(total)}</span></b>
        </div>

        <div className="lista-pgtos">
          {pagamentos.length === 0 ? (
            <div style={{ color: 'var(--cinza)', fontSize: 12.5 }}>Nenhum pagamento adicionado.</div>
          ) : pagamentos.map((p, i) => (
            <div className="item-pgto" key={i}>
              <span className="pgto-esp">{p.especie.replace(/_/g, ' ')}</span>
              <span className="pgto-val">R$ {brl(p.valor)}</span>
              <button className="pgto-del" onClick={() => remover(i)}>✕</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--linha)', paddingTop: 10, marginTop: 6 }}>
          <div className="form-linha"><label>Forma de Pagamento</label>
            <select value={especie} onChange={(e) => setEspecie(e.target.value)}>
              {ESPECIES.map((e) => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="form-linha"><label>Valor (R$)</label>
            <input ref={valorRef} type="number" step="any" min="0.01" inputMode="decimal" placeholder="0,00"
              value={valor} onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }} />
          </div>
          <div style={{ textAlign: 'right', marginBottom: 6 }}>
            <button className="btn-acao" onClick={adicionar}>+ Adicionar forma de pagamento</button>
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: 'var(--cinza)', marginBottom: 10 }}>
          Pago: <b>R$ {brl(pago)}</b> | Pendente: <b>R$ {brl(pendente)}</b>
          {troco > 0 && <> | <b style={{ color: 'var(--verde)' }}>Troco: R$ {brl(troco)}</b></>}
        </div>

        <div className="rodape-form">
          <button className="btn-acao" onClick={onClose}>Cancelar</button>
          <button className="btn-acao primario" onClick={emitir} disabled={emitindo}>{emitindo ? 'Emitindo…' : '🧾 Emitir NFC-e'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Cancelar pré-venda ─────────────────────────────────────────────────────────
export function CancelarModal({ ctx, onClose }) {
  const { caixaApi, toast, preVendaNum, qtdItens, total, onConcluida } = ctx;
  const [cancelando, setCancelando] = useState(false);
  useEsc(onClose);

  async function confirmar() {
    setCancelando(true);
    try {
      await caixaApi(`/prevendas/${preVendaNum}`, { method: 'DELETE' });
      toast(`Pré-venda <b>#${preVendaNum}</b> cancelada.`);
      onClose();
      await onConcluida();
    } catch (e) {
      toast(e.message);
      setCancelando(false);
    }
  }

  return (
    <div className="janela" style={{ maxWidth: 460 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Cancelar Pré-Venda</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="janela-corpo">
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>🗑️</div>
          <b style={{ fontSize: 15 }}>Pré-Venda #{preVendaNum}</b><br />
          <span style={{ color: 'var(--cinza)', fontSize: 13 }}>{qtdItens} item(ns) · Total R$ {brl(total)}</span><br /><br />
          Tem certeza que deseja <b style={{ color: 'var(--vermelho)' }}>cancelar</b> esta pré-venda?
        </div>
        <div className="rodape-form">
          <button className="btn-acao" onClick={onClose}>Não, manter</button>
          <button className="btn-acao perigo" onClick={confirmar} disabled={cancelando}>{cancelando ? 'Cancelando…' : 'Sim, cancelar'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Nova pré-venda (com uma já aberta) ─────────────────────────────────────────
export function NovaPreVendaModal({ ctx, onClose }) {
  const { toast, preVendaNum, qtdItens, onConcluida } = ctx;
  const [criando, setCriando] = useState(false);
  useEsc(onClose);

  async function confirmar() {
    setCriando(true);
    try {
      onClose();
      await onConcluida(); // main.js descarta a atual e cria a nova
    } catch (e) {
      toast(e.message);
      setCriando(false);
    }
  }

  return (
    <div className="janela" style={{ maxWidth: 460 }}>
      <div className="janela-cab">
        <div className="dobra" />
        <div className="tit">Nova Pré-Venda</div>
        <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="janela-corpo">
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>📋</div>
          Já existe a pré-venda <b>#{preVendaNum}</b> com <b>{qtdItens}</b> item(ns).<br />
          Deseja <b>abandoná-la</b> e abrir uma nova?
        </div>
        <div className="rodape-form">
          <button className="btn-acao" onClick={onClose}>Não, manter</button>
          <button className="btn-acao primario" onClick={confirmar} disabled={criando}>{criando ? 'Criando…' : 'Sim, nova pré-venda'}</button>
        </div>
      </div>
    </div>
  );
}
