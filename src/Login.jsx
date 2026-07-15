import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from './shared';
import { api, auth } from './api.js';

const FILIAIS = [
  { id: 'par', nome: '1 — Parnamirim' },
  { id: 'mac', nome: '2 — Macaíba' },
  { id: 'nat', nome: '3 — Natal' },
];

export default function Login({ titulo, aoEntrar, pedirFilial = true }) {
  const toast = useToast();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha]     = useState('');
  const [filial, setFilial]   = useState('par');
  const [loading, setLoading] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!usuario) return toast('Informe o nome de usuário');
    if (!senha)   return toast('Informe a senha');
    setLoading(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { usuario, senha, filial } });
      auth.set(r.token);
      aoEntrar(r);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 420 }}>
        <Janela titulo={titulo}>
          {pedirFilial && (
            <Campo label="Filial">
              <select value={filial} onChange={(e) => setFilial(e.target.value)}>
                {FILIAIS.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required
            placeholder="nome de usuário criado pelo gestor" />
          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          <p style={{ fontSize: 11, color: 'var(--cinza)', margin: '2px 0 8px' }}>
            Seu acesso é criado pelo chefe/gestor na aba Funcionários.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Botao primario type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</Botao>
          </div>
        </Janela>
      </form>
    </div>
  );
}
