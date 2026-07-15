import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from './shared';
import { auth } from './api.js';

const BFF = import.meta.env.VITE_BFF_URL;

export default function Login({ titulo, aoEntrar }) {
  const toast = useToast();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha]     = useState('');
  const [loading, setLoading] = useState(false);

  // passo 2
  const [dadosAuth, setDadosAuth] = useState(null);
  const [filialSel, setFilialSel] = useState('');

  async function entrar(e) {
    e.preventDefault();
    if (!usuario) return toast('Informe o nome de usuário');
    if (!senha)   return toast('Informe a senha');
    setLoading(true);
    try {
      const r = await fetch(`${BFF}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });
      const texto = await r.text();
      const dados = texto ? JSON.parse(texto) : {};
      if (!r.ok) throw new Error(dados.erro || dados.message || `Erro ${r.status}`);

      auth.set(dados.token);
      const lojas = dados.lojas || await buscarLojas(dados.token);
      if (!lojas || lojas.length === 0) throw new Error('Nenhuma filial encontrada.');

      if (lojas.length === 1) {
        aoEntrar({ ...dados, filial: lojas[0].id, filialNome: lojas[0].nome });
      } else {
        setDadosAuth({ ...dados, lojas });
        setFilialSel(lojas[0].id);
      }
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function buscarLojas(token) {
    try {
      const r = await fetch(`${BFF}/api/lojas`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const texto = await r.text();
      return texto ? JSON.parse(texto) : [];
    } catch {
      return [];
    }
  }

  function conectar(e) {
    e.preventDefault();
    const loja = dadosAuth.lojas.find((l) => l.id === filialSel);
    aoEntrar({ ...dadosAuth, filial: filialSel, filialNome: loja?.nome });
  }

  // ── Passo 2: filial ──────────────────────────────────────────────────────
  if (dadosAuth) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
        <form onSubmit={conectar} style={{ width: '100%', maxWidth: 400 }}>
          <Janela titulo="Selecione a filial">
            <p style={{ color: 'var(--cinza)', fontSize: 13, marginBottom: 16 }}>
              Olá, <b>{dadosAuth.nome || dadosAuth.usuario}</b>. Escolha a filial:
            </p>
            <Campo label="Filial">
              <select value={filialSel} onChange={(e) => setFilialSel(e.target.value)} autoFocus>
                {dadosAuth.lojas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </Campo>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
              <Botao type="button" onClick={() => setDadosAuth(null)}>← Voltar</Botao>
              <Botao primario type="submit">Entrar</Botao>
            </div>
          </Janela>
        </form>
      </div>
    );
  }

  // ── Passo 1: credenciais ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--azul)', padding: 16 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 420 }}>
        <Janela titulo={titulo}>
          <Campo label="Usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus required
            placeholder="nome de usuário" />
          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required
            placeholder="••••••" />
          <p style={{ fontSize: 12, color: 'var(--cinza)', margin: '4px 0 14px' }}>
            Seu acesso é criado pelo gestor na aba Funcionários.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Botao primario type="submit" disabled={loading}>
              {loading ? 'Verificando…' : 'Continuar →'}
            </Botao>
          </div>
        </Janela>
      </form>
    </div>
  );
}
