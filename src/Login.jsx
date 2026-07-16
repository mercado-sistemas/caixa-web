import { useState } from 'react';
import { Janela, Campo, Botao, useToast } from './shared';
import { auth } from './api.js';

const BFF = import.meta.env.VITE_BFF_URL;

export default function Login({ titulo, aoEntrar }) {
  const toast = useToast();
  const [filial, setFilial]   = useState('');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha]     = useState('');
  const [loading, setLoading] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    if (!filial)  return toast('Informe o ID da filial');
    if (!usuario) return toast('Informe o nome de usuário');
    if (!senha)   return toast('Informe a senha');
    const filialCod = filial.trim().toUpperCase();
    setLoading(true);
    try {
      const r = await fetch(`${BFF}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filial: filialCod, login: usuario, senha }),
      });
      const texto = await r.text();
      const dados = texto ? JSON.parse(texto) : {};
      if (!r.ok) throw new Error(dados.erro || dados.message || `Erro ${r.status}`);

      auth.set(dados.token);
      const loja = (dados.lojas || []).find((l) => (l.id || '').toUpperCase() === filialCod);
      aoEntrar({ ...dados, filial: filialCod, filialNome: loja?.nome });
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
          <Campo label="ID da filial" value={filial} onChange={(e) => setFilial(e.target.value)} autoFocus required
            placeholder="ex: 7K3QF" />
          <Campo label="Usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} required
            placeholder="nome de usuário" />
          <Campo label="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required
            placeholder="••••••" />
          <p style={{ fontSize: 12, color: 'var(--cinza)', margin: '4px 0 14px' }}>
            O ID da filial e seu acesso são criados pelo gestor na aba Filiais/Funcionários.
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
