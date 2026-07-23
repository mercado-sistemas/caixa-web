import { abrirBuscarProdutoReact, abrirIdentificarClienteReact, abrirPreVendasAbertasReact, abrirVendasFinalizadasReact, fecharModalReact } from './montar.jsx';

// ─── Config ───────────────────────────────────────────────────────────────────
const BFF   = import.meta.env.VITE_BFF_URL;          // caixa-bff (pré-vendas)
const EBFF  = import.meta.env.VITE_ESTOQUE_BFF_URL;  // estocaai-bff (produtos)

// ─── Auth ─────────────────────────────────────────────────────────────────────
let _token = localStorage.getItem('cx_token') || null;
const auth = {
  set(t) { _token = t; localStorage.setItem('cx_token', t); },
  clear() { _token = null; localStorage.removeItem('cx_token'); },
};

function headers() {
  return { 'content-type': 'application/json', ...(_token ? { authorization: `Bearer ${_token}` } : {}) };
}
async function apiFetch(base, path, { method = 'GET', body } = {}) {
  const r = await fetch(`${base}/api${path}`, {
    method, headers: headers(), body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erro || data.message || `Erro ${r.status}`);
  return data;
}
const caixaApi   = (p, o) => apiFetch(BFF, p, o);
const estoqueApi = (p, o) => apiFetch(EBFF, p, o);

// ─── Estado ───────────────────────────────────────────────────────────────────
let sessao      = null;
let filialAtual = null;
let FILIAIS     = [];    // filiais reais do banco
let preVenda    = null;  // PreVendaResponse atual
let clienteAtual = null; // cliente identificado na pré-venda
let PRODUTOS    = [];    // cache dos produtos buscados
let pagamentos  = [];    // lista de pagamentos acumulados antes de emitir

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const brl = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nomeFil = id => FILIAIS.find(f => f.id === id)?.nome || id || '—';

function toast(m) {
  const t = $('#toast');
  t.innerHTML = m;
  t.classList.add('mostra');
  clearTimeout(t._x);
  t._x = setTimeout(() => t.classList.remove('mostra'), 2800);
}

function overlay(show) {
  let o = $('#overlay-modal');
  if (show) {
    if (!o) { o = document.createElement('div'); o.id = 'overlay-modal'; o.className = 'overlay'; o.onclick = fecharJanela; document.body.appendChild(o); }
  } else { o?.remove(); }
}

function abrirJanela(titulo, html, larg) {
  fecharJanela();
  overlay(true);
  const j = document.createElement('div');
  j.className = 'janela'; j.id = 'janela-ativa';
  if (larg) j.style.maxWidth = larg + 'px';
  j.innerHTML = `<div class="janela-cab"><div class="dobra"></div><div class="tit">${titulo}</div>
    <button class="fechar" onclick="fecharJanela()" aria-label="Fechar">✕</button></div>
    <div class="janela-corpo">${html}</div>`;
  document.body.appendChild(j);
}
function fecharJanela() {
  fecharModalReact();
  $('#janela-ativa')?.remove();
  overlay(false);
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function entrar() {
  const filialVal = $('#lg-filial').value.trim().toUpperCase();
  const loginVal  = $('#lg-usr').value.trim();
  const senhaVal  = $('#lg-sen').value.trim();
  const ehEmail   = loginVal.includes('@');

  if (!ehEmail && !filialVal) return toast('Informe o ID da filial.');
  if (!loginVal) return toast('Informe o usuário.');
  if (!senhaVal) return toast('Informe a senha.');

  const btn = $('#btn-entrar');
  btn.disabled = true; btn.textContent = 'Verificando…';
  try {
    const body = { login: loginVal, senha: senhaVal };
    if (!ehEmail) body.filial = filialVal; // funcionário: filial+usuário+senha juntos identificam o tenant

    const r = await fetch(`${BFF}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || dados.message || `Erro ${r.status}`);

    auth.set(dados.token);
    sessao = dados;

    $('#veu-login').classList.add('hide');

    // Funcionário: a filial já veio validada pelo backend (filial+usuário+senha).
    if (!ehEmail) {
      FILIAIS = dados.lojas || [];
      filialAtual = filialVal;
      await entrarNoCaixa(dados, loginVal);
      return;
    }

    // Gestor/dono (login por e-mail): pode ter várias lojas, escolhe depois de entrar.
    try {
      const lojas = await caixaApi('/lojas');
      if (lojas?.length > 0) FILIAIS = lojas;
    } catch (_) {
      if (dados.lojas?.length > 0) FILIAIS = dados.lojas;
    }

    if (FILIAIS.length === 1) {
      filialAtual = FILIAIS[0].id;
      await entrarNoCaixa(dados, loginVal);
    } else if (FILIAIS.length > 1) {
      const lista = $('#lista-filiais-picker');
      lista.innerHTML = FILIAIS.map((f, i) =>
        `<button class="btn-acao" style="text-align:left; padding:12px 16px; font-size:14px"
           onclick="selecionarFilialLogin('${f.id}')">
           <b>${i + 1}</b> — ${f.nome}
         </button>`
      ).join('');
      $('#veu-filial').classList.remove('hide');
      window._dadosLogin = dados;
      window._loginVal = loginVal;
    } else {
      filialAtual = null;
      await entrarNoCaixa(dados, loginVal);
    }
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Ok';
  }
}

// ─── Entrada vinda do Estocaaí (SSO) ──────────────────────────────────────────
// O estoque abre o caixa com #sso=<token> no hash. O token é o mesmo JWT emitido
// pela estocaai-api, que a caixa-api também valida — então basta reaproveitá-lo
// e pular a tela de login. Usa hash (e não query) para o token não ir parar em
// log de servidor nem no header Referer.
async function entrarViaSSO(token) {
  auth.set(token);
  const claims = lerClaims(token);
  const dados = { nome: claims.nome || claims.sub, role: claims.role, token };
  sessao = dados;

  try {
    FILIAIS = await caixaApi('/lojas');
  } catch (e) {
    auth.clear();
    toast('Sessão do estoque não aceita aqui: ' + e.message);
    return;
  }

  $('#veu-login').classList.add('hide');

  if (FILIAIS.length === 1) {
    filialAtual = FILIAIS[0].id;
    await entrarNoCaixa(dados, dados.nome || '');
  } else if (FILIAIS.length > 1) {
    const lista = $('#lista-filiais-picker');
    lista.innerHTML = FILIAIS.map((f, i) =>
      `<button class="btn-acao" style="text-align:left; padding:12px 16px; font-size:14px"
         onclick="selecionarFilialLogin('${f.id}')">
         <b>${i + 1}</b> — ${f.nome}
       </button>`
    ).join('');
    $('#veu-filial').classList.remove('hide');
    window._dadosLogin = dados;
    window._loginVal = dados.nome || '';
  } else {
    filialAtual = null;
    await entrarNoCaixa(dados, dados.nome || '');
  }
}

/** Lê o payload do JWT só para exibir nome/perfil — quem valida é a API. */
function lerClaims(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch (_) {
    return {};
  }
}

async function selecionarFilialLogin(id) {
  filialAtual = id;
  $('#veu-filial').classList.add('hide');
  await entrarNoCaixa(window._dadosLogin, window._loginVal);
}

async function entrarNoCaixa(dados, loginVal) {
  $('#st-usuario').textContent = dados.nome || loginVal.toUpperCase();
  $('#st-filial').textContent = nomeFil(filialAtual);
  $('#info-filial').textContent = nomeFil(filialAtual);
  $('#info-vendedor').textContent = dados.nome || loginVal;
  toast(`Bem-vindo(a), <b>${dados.nome || loginVal}</b>!`);
  await criarNovaPreVenda();
}

// ─── Pré-Venda ────────────────────────────────────────────────────────────────
async function criarNovaPreVenda() {
  try {
    clienteAtual = null;
    preVenda = await caixaApi('/prevendas', {
      method: 'POST',
      body: { filial: filialAtual, vendedor: sessao?.nome || 'Usuário', cliente: null },
    });
    pagamentos = [];
    atualizarUI();
    toast(`Pré-venda <b>#${preVenda.num}</b> aberta.`);
  } catch (e) {
    toast('Erro ao criar pré-venda: ' + e.message);
  }
}

function atualizarUI() {
  if (!preVenda) return;
  const itens = preVenda.itens || [];
  const total = itens.reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);

  $('#num-pv').textContent = preVenda.num || '—';
  $('#st-pv').textContent = `#${preVenda.num}` || '—';
  $('#res-itens').textContent = itens.length;
  $('#res-subtotal').textContent = `R$ ${brl(total)}`;
  $('#res-total').textContent = `R$ ${brl(total)}`;
  $('#res-desconto').textContent = '—';

  const tb = $('#tbody-itens');
  tb.innerHTML = itens.map((it, idx) => `
    <tr class="${idx === itens.length - 1 ? 'sel' : ''}">
      <td class="num">${idx + 1}</td>
      <td class="num">${it.cod || '—'}</td>
      <td>${it.nome}</td>
      <td class="num">${it.qtd}</td>
      <td class="num">${brl(it.unit)}</td>
      <td class="num" style="font-weight:900">${brl((it.unit || 0) * (it.qtd || 0))}</td>
      <td><button class="btn-acao perigo" style="padding:3px 8px; font-size:11px" onclick="removerItem(${idx})">✕</button></td>
    </tr>`).join('') ||
    `<tr><td colspan="7" style="text-align:center;color:var(--cinza);padding:28px">
      Nenhum item adicionado. Use <b>F7</b> para buscar produtos.
    </td></tr>`;
}

async function removerItem(idx) {
  if (!preVenda) return;
  const it = (preVenda.itens || [])[idx];
  if (!it) return;
  // não há endpoint de remover item individualmente — cancela e recria com os demais
  try {
    const restantes = preVenda.itens.filter((_, i) => i !== idx);
    await caixaApi(`/prevendas/${preVenda.num}`, { method: 'DELETE' });
    preVenda = await caixaApi('/prevendas', {
      method: 'POST',
      body: { filial: filialAtual, vendedor: sessao?.nome || 'Usuário', cliente: null },
    });
    for (const r of restantes) {
      preVenda = await caixaApi(`/prevendas/${preVenda.num}/itens`, {
        method: 'POST', body: { produtoId: r.produtoId, cod: r.cod, nome: r.nome, qtd: r.qtd, unit: r.unit },
      });
    }
    pagamentos = [];
    atualizarUI();
  } catch (e) { toast(e.message); }
}

// ─── Identificar Cliente (0) — tela em React (src/cliente/) ───────────────────
/* Migrada pela segurança: nome/fantasia/CPF/cidade vêm do estoque (digitados
   por pessoas) e antes iam para innerHTML. O main.js segue dono do cliente da
   pré-venda; seleção/remoção voltam pelos callbacks. */
function setInfoCliente(c) {
  $('#info-cliente').textContent = c ? c.nome + (c.cpfCnpj ? ` (${c.cpfCnpj})` : '') : '—';
}
function janelaIdentificarCliente() {
  if (!preVenda) return toast('Sem pré-venda ativa.');
  fecharJanela();
  abrirIdentificarClienteReact({
    estoqueApi, toast,
    onSelecionado(c) { clienteAtual = c; setInfoCliente(c); },
    onRemovido() { clienteAtual = null; setInfoCliente(null); },
  });
}

// ─── Buscar Produto (F7) — tela em React (src/produto/) ──────────────────────
/* Migrada pela segurança: o nome do produto vem do estoque e antes ia para
   innerHTML na lista. O main.js é dono da pré-venda; o item adicionado volta
   pelo callback, que atualiza o estado e a UI. */
function abrirBuscarProduto() {
  if (!preVenda) return toast('Crie uma pré-venda primeiro (F2).');
  fecharJanela();
  abrirBuscarProdutoReact({
    estoqueApi, caixaApi, toast, filialAtual, nomeFil,
    escanear: escanearPeloCelular,
    preVendaNum: preVenda.num,
    onItemAdicionado(pv) { preVenda = pv; atualizarUI(); },
  });
}


// ─── F9 Emitir NFC-e ─────────────────────────────────────────────────────────
function janelaEmitir() {
  if (!preVenda) return toast('Sem pré-venda ativa.');
  if (!(preVenda.itens?.length)) return toast('Adicione itens antes de emitir.');
  const total = (preVenda.itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);

  const optsEsp = [
    'DINHEIRO','PIX','CARTAO','CREDITO_CLIENTE','CHEQUE',
    'BOLETO','DUPLICATA','NOTA_PROMISSORIA','PRAZO',
    'CREDITO_FORNECEDOR','TRANSFERENCIA_BANCARIA','OUTROS',
  ].map(e => `<option value="${e}">${e.replace(/_/g, ' ')}</option>`).join('');

  abrirJanela('Emitir NFC-e — Pagamento', `
    <div style="font-size:13px; margin-bottom:12px">
      <b>Total da venda: <span style="font-size:22px; color:var(--azul)">R$ ${brl(total)}</span></b>
    </div>

    <div class="lista-pgtos" id="lista-pgtos"></div>

    <div style="border-top:1px solid var(--linha); padding-top:10px; margin-top:6px">
      <div class="form-linha"><label>Forma de Pagamento</label>
        <select id="pg-esp">${optsEsp}</select>
      </div>
      <div class="form-linha"><label>Valor (R$)</label>
        <input id="pg-val" type="number" step="any" min="0.01" inputmode="decimal" placeholder="0,00">
      </div>
      <div style="text-align:right; margin-bottom:6px">
        <button class="btn-acao" onclick="adicionarPagamento()">+ Adicionar forma de pagamento</button>
      </div>
    </div>

    <div id="resumo-pgto" style="font-size:12.5px; color:var(--cinza); margin-bottom:10px"></div>

    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">Cancelar</button>
      <button class="btn-acao primario" id="btn-emitir" onclick="confirmarEmissao()">🧾 Emitir NFC-e</button>
    </div>`, 640);

  renderPagamentos(total);
  const totalPendente = total - pagamentos.reduce((s, p) => s + p.valor, 0);
  if ($('#pg-val')) $('#pg-val').value = totalPendente > 0 ? totalPendente.toFixed(2) : '';
}

function renderPagamentos(total) {
  const lista = $('#lista-pgtos');
  const resumo = $('#resumo-pgto');
  if (!lista) return;
  const pago = pagamentos.reduce((s, p) => s + p.valor, 0);

  lista.innerHTML = pagamentos.map((p, i) => `
    <div class="item-pgto">
      <span class="pgto-esp">${p.especie.replace(/_/g, ' ')}</span>
      <span class="pgto-val">R$ ${brl(p.valor)}</span>
      <button class="pgto-del" onclick="removePagamento(${i})">✕</button>
    </div>`).join('') || '<div style="color:var(--cinza); font-size:12.5px">Nenhum pagamento adicionado.</div>';

  if (resumo) {
    const troco = pago - (total || 0);
    resumo.innerHTML = `Pago: <b>R$ ${brl(pago)}</b> | Pendente: <b>R$ ${brl(Math.max(0, (total || 0) - pago))}</b>` +
      (troco > 0 ? ` | <b style="color:var(--verde)">Troco: R$ ${brl(troco)}</b>` : '');
  }
}

function adicionarPagamento() {
  const esp = $('#pg-esp')?.value;
  const val = parseFloat($('#pg-val')?.value);
  if (!esp) return toast('Selecione a forma de pagamento.');
  if (!val || val <= 0) return toast('Informe o valor do pagamento.');
  pagamentos.push({ especie: esp, valor: val });
  const total = (preVenda.itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);
  renderPagamentos(total);
  if ($('#pg-val')) $('#pg-val').value = '';
}

function removePagamento(idx) {
  pagamentos.splice(idx, 1);
  const total = (preVenda?.itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);
  renderPagamentos(total);
}

async function confirmarEmissao() {
  if (!preVenda) return toast('Sem pré-venda ativa.');
  if (!pagamentos.length) return toast('Adicione ao menos um pagamento.');
  const total = (preVenda.itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);
  const pago = pagamentos.reduce((s, p) => s + p.valor, 0);
  if (pago < total - 0.005) return toast(`Valor pago (R$ ${brl(pago)}) menor que o total (R$ ${brl(total)}).`);

  const btn = $('#btn-emitir');
  btn.disabled = true; btn.textContent = 'Emitindo…';
  try {
    const r = await caixaApi(`/prevendas/${preVenda.num}/emitir`, {
      method: 'POST',
      body: { pagamentos, authToken: _token },
    });
    fecharJanela();
    toast(`NFC-e emitida! <b>#${preVenda.num}</b> — ${(preVenda.itens || []).length} item(ns).`);
    preVenda = null;
    pagamentos = [];
    await criarNovaPreVenda();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = '🧾 Emitir NFC-e';
  }
}

// ─── F8 Cancelar ─────────────────────────────────────────────────────────────
function janelaCancelar() {
  if (!preVenda) return toast('Sem pré-venda ativa.');
  abrirJanela('Cancelar Pré-Venda', `
    <div style="text-align:center; padding:14px 0">
      <div style="font-size:38px; margin-bottom:10px">🗑️</div>
      <b style="font-size:15px">Pré-Venda #${preVenda.num}</b><br>
      <span style="color:var(--cinza); font-size:13px">${(preVenda.itens || []).length} item(ns) · Total R$ ${brl((preVenda.itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0))}</span><br><br>
      Tem certeza que deseja <b style="color:var(--vermelho)">cancelar</b> esta pré-venda?
    </div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">Não, manter</button>
      <button class="btn-acao perigo" id="btn-cancel" onclick="confirmarCancelamento()">Sim, cancelar</button>
    </div>`, 460);
}

async function confirmarCancelamento() {
  if (!preVenda) return;
  const btn = $('#btn-cancel');
  btn.disabled = true; btn.textContent = 'Cancelando…';
  try {
    await caixaApi(`/prevendas/${preVenda.num}`, { method: 'DELETE' });
    fecharJanela();
    toast(`Pré-venda <b>#${preVenda.num}</b> cancelada.`);
    preVenda = null; pagamentos = [];
    await criarNovaPreVenda();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Sim, cancelar';
  }
}

// ─── F2 Nova Pré-Venda ────────────────────────────────────────────────────────
function janelaNovaPreVenda() {
  if (preVenda && (preVenda.itens || []).length > 0) {
    abrirJanela('Nova Pré-Venda', `
      <div style="text-align:center; padding:14px 0">
        <div style="font-size:38px; margin-bottom:10px">📋</div>
        Já existe a pré-venda <b>#${preVenda.num}</b> com <b>${(preVenda.itens || []).length}</b> item(ns).<br>
        Deseja <b>abandoná-la</b> e abrir uma nova?
      </div>
      <div class="rodape-form">
        <button class="btn-acao" onclick="fecharJanela()">Não, manter</button>
        <button class="btn-acao primario" id="btn-nova" onclick="confirmarNovaPV()">Sim, nova pré-venda</button>
      </div>`, 460);
  } else {
    criarNovaPreVenda();
  }
}

async function confirmarNovaPV() {
  const btn = $('#btn-nova');
  btn.disabled = true; btn.textContent = 'Criando…';
  try {
    if (preVenda) await caixaApi(`/prevendas/${preVenda.num}`, { method: 'DELETE' }).catch(() => {});
    fecharJanela();
    await criarNovaPreVenda();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Sim, nova pré-venda';
  }
}

// ─── F3 Pré-Vendas Abertas / F4 Vendas Finalizadas (React: src/vendas/) ──────
/* Migradas pela segurança: o vendedor vai para a grade e antes ia por innerHTML.
   O main.js segue dono do estado: abrir uma pré-venda volta pelo callback. */
function janelaPreVendasAbertas() {
  fecharJanela();
  abrirPreVendasAbertasReact({
    caixaApi, toast, nomeFil,
    onCarregar(pv) { preVenda = pv; pagamentos = []; atualizarUI(); },
  });
}

function janelaVendasFinalizadas() {
  fecharJanela();
  abrirVendasFinalizadasReact({ caixaApi, toast, nomeFil });
}


// ─── Menus ────────────────────────────────────────────────────────────────────
const MENUS = [
  { rot: 'Pré-Venda', itens: [
    { rot: '2 - Nova Pré-Venda…', tecla: 'F2', ac: janelaNovaPreVenda },
    { rot: '3 - Pré-Vendas Abertas…', tecla: 'F3', ac: janelaPreVendasAbertas },
    { rot: '4 - Histórico de Vendas…', tecla: 'F4', ac: janelaVendasFinalizadas },
    { rot: '0 - Identificar Cliente…', ac: janelaIdentificarCliente },
    { rot: '5 - Emitir NFC-e…', tecla: 'F9', ac: janelaEmitir },
    { rot: 'Cancela Pré-Venda…', tecla: 'F8', ac: janelaCancelar },
  ]},
  { rot: 'Itens', itens: [
    { rot: '7 - Buscar Produto…', tecla: 'F7', ac: abrirBuscarProduto },
  ]},
  { rot: 'Sair', itens: [
    { rot: '1 - Trocar Usuário…', ac: () => { auth.clear(); location.reload(); } },
  ]},
];

function montarMenus() {
  const bar = $('#menubar'); bar.innerHTML = '';
  MENUS.forEach(m => {
    const raiz = document.createElement('div'); raiz.className = 'menu-raiz';
    const b = document.createElement('button');
    b.innerHTML = `<u>${m.rot[0]}</u>${m.rot.slice(1)}`;
    b.onclick = e => { e.stopPropagation(); fecharMenus(raiz); raiz.classList.toggle('aberto'); renderMenu1(raiz, m); };
    raiz.appendChild(b); bar.appendChild(raiz);
  });
  document.addEventListener('click', () => fecharMenus());
}
function fecharMenus(exceto) {
  document.querySelectorAll('.menu-raiz').forEach(r => {
    if (r !== exceto) { r.classList.remove('aberto'); r.querySelectorAll('.submenu').forEach(s => s.remove()); }
  });
  if (exceto) exceto.querySelectorAll('.submenu').forEach(s => s.remove());
}
function renderMenu1(raiz, m) {
  if (!raiz.classList.contains('aberto')) return;
  const sm = document.createElement('div'); sm.className = 'submenu';
  m.itens.forEach(it => {
    const b = document.createElement('button'); b.className = 'item';
    b.innerHTML = `<span>${it.rot}</span>` + (it.tecla ? `<kbd class="tecla">${it.tecla}</kbd>` : '');
    b.onclick = e => { e.stopPropagation(); fecharMenus(); it.ac(); };
    sm.appendChild(b);
  });
  raiz.appendChild(sm);
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
const FERRAMENTAS = [
  { ico: '📋', atalho: 'F2', rot: 'Nova PV', ac: janelaNovaPreVenda },
  { ico: '🔍', atalho: 'F7', rot: 'Produto', ac: abrirBuscarProduto },
  { ico: '🧾', atalho: 'F9', rot: 'Emitir', ac: janelaEmitir },
  { ico: '🗑️', atalho: 'F8', rot: 'Cancelar', ac: janelaCancelar },
  { ico: '📂', atalho: 'F3', rot: 'PVs Abertas', ac: janelaPreVendasAbertas },
  { ico: '📊', atalho: 'F4', rot: 'Histórico', ac: janelaVendasFinalizadas },
];
function montarToolbar() {
  $('#toolbar').innerHTML = '';
  FERRAMENTAS.forEach(f => {
    const b = document.createElement('button'); b.className = 'ferramenta';
    b.innerHTML = `<span class="ico">${f.ico}</span><span class="atalho">${f.atalho}</span><span class="rot">${f.rot}</span>`;
    b.onclick = f.ac;
    $('#toolbar').appendChild(b);
  });
}

// ─── Atalhos ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') fecharJanela();
    return;
  }
  const mapa = { F2: janelaNovaPreVenda, F7: abrirBuscarProduto, F9: janelaEmitir, F8: janelaCancelar, F3: janelaPreVendasAbertas, F4: janelaVendasFinalizadas };
  const fn = mapa[e.key];
  if (fn) { e.preventDefault(); fn(); }
  if (e.key === 'Escape') { fecharMenus(); fecharJanela(); }
});

// ─── Escanear pelo celular ────────────────────────────────────────────────────
// Botão reservado: a leitura pelo celular ainda não foi implementada.
function escanearPeloCelular() {
  toast('Leitura pelo celular ainda não disponível.');
}

// ─── Relógio ──────────────────────────────────────────────────────────────────
function relogio() {
  const d = new Date();
  $('#st-relogio').textContent = d.toLocaleDateString('pt-BR') + ' - ' + d.toLocaleTimeString('pt-BR');
}
setInterval(relogio, 1000); relogio();
$('#lg-sen').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
$('#lg-usr').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
montarMenus(); montarToolbar();

// Se o Estocaaí abriu o caixa com #sso=<token>, entra direto no perfil que já
// estava logado lá. O hash é limpo em seguida para o token não ficar na barra.
(function iniciarSSO() {
  const m = location.hash.match(/[#&]sso=([^&]+)/);
  if (!m) return;
  const token = decodeURIComponent(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  entrarViaSSO(token);
})();


// ─── Global ───────────────────────────────────────────────────────────────────
Object.assign(window, {
  entrar, selecionarFilialLogin, fecharJanela, fecharMenus,
  abrirBuscarProduto,
  escanearPeloCelular,
  janelaEmitir, adicionarPagamento, removePagamento, confirmarEmissao,
  janelaCancelar, confirmarCancelamento,
  janelaNovaPreVenda, confirmarNovaPV,
  janelaPreVendasAbertas,
  janelaVendasFinalizadas,
  janelaIdentificarCliente,
  removerItem, nomeFil,
});
