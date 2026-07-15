import { useState, useCallback, createContext, useContext } from 'react';

/* ---------- Botão ---------- */
export function Botao({ primario, perigo, children, ...props }) {
  const cls = ['m-btn', primario && 'm-btn--primario', perigo && 'm-btn--perigo'].filter(Boolean).join(' ');
  return <button className={cls} {...props}>{children}</button>;
}

/* ---------- Campo (label + input/select) ---------- */
export function Campo({ label, children, ...inputProps }) {
  return (
    <div className="m-campo">
      <label>{label}</label>
      {children ?? <input {...inputProps} />}
    </div>
  );
}

/* ---------- Janela (card com a dobra amarela) ---------- */
export function Janela({ titulo, children, style }) {
  return (
    <div className="m-janela" style={style}>
      <div className="m-janela__cab">
        <div className="m-janela__dobra" />
        <div className="m-janela__tit">{titulo}</div>
      </div>
      <div className="m-janela__corpo">{children}</div>
    </div>
  );
}

/* ---------- Tabela ---------- */
export function Tabela({ colunas, dados, renderLinha, vazio = 'Nenhum registro.' }) {
  return (
    <table className="m-tabela">
      <thead><tr>{colunas.map((c) => <th key={c.chave || c} className={c.num ? 'num' : ''}>{c.rotulo || c}</th>)}</tr></thead>
      <tbody>
        {dados.length
          ? dados.map(renderLinha)
          : <tr><td colSpan={colunas.length} style={{ textAlign: 'center', color: 'var(--cinza)', padding: 18 }}>{vazio}</td></tr>}
      </tbody>
    </table>
  );
}

/* ---------- Toast (contexto + hook) ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const toast = useCallback((m) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {msg && <div className="m-toast" role="status" dangerouslySetInnerHTML={{ __html: msg }} />}
    </ToastCtx.Provider>
  );
}
export function useToast() { return useContext(ToastCtx); }

/* ---------- Barra de título do sistema ---------- */
export function TituloSistema({ nome, destaque }) {
  return <div className="m-titulo-sis">{nome}<span>{destaque}</span></div>;
}

/* ---------- helpers ---------- */
export const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
