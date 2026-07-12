const BFF = import.meta.env.VITE_BFF_URL;

let token = localStorage.getItem('token') || null;
export const auth = {
  get token() { return token; },
  set(t) { token = t; localStorage.setItem('token', t); },
  limpar() { token = null; localStorage.removeItem('token'); },
};

export async function api(caminho, { method = 'GET', body } = {}) {
  const r = await fetch(`${BFF}/api${caminho}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
}
