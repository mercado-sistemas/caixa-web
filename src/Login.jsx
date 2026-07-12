import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from '@mercado/shared';
import { api, auth } from './api.js';

export default function Login({ titulo, aoEntrar, pedirFilial = true }) {
  const toast = useToast();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [filial, setFilial] = useState('par');

  async function entrar(e) {
    e.preventDefault();
    try {
      const r = await api('/auth/login', { method: 'POST', body: { usuario, senha, filial } });
      auth.set(r.token);
      aoEntrar(r);
    } catch (err) {
      toast(err.message);
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 420 }}>
        <Janela titulo={titulo}>
          {pedirFilial && (
            <Campo label="Filial">
              <select value={filial} onChange={(e) => setFilial(e.target.value)}>
                <option value="par">1 — Parnamirim</option>
                <option value="mac">2 — Macaíba</option>
                <option value="nat">3 — Natal</option>
              </select>
            </Campo>
          )}
          <Campo label="Usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <Botao primario type="submit">Entrar</Botao>
          </div>
        </Janela>
      </form>
    </div>
  );
}
