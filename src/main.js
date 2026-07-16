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

    const r = await fetch(`${EBFF}/api/auth/login`, {
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
      const lojas = await estoqueApi('/lojas');
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

// ─── Identificar Cliente (0) ──────────────────────────────────────────────────
function janelaIdentificarCliente() {
  if (!preVenda) return toast('Sem pré-venda ativa.');
  abrirJanela('Identificar Cliente', `
    <div class="linha-consulta" style="margin-bottom:10px">
      <input type="text" id="ic-busca" placeholder="Nome, CPF/CNPJ ou código do cliente…" autocomplete="off">
      <button class="btn-acao" onclick="buscarClientesCaixa()">Buscar</button>
    </div>
    <div class="moldura-grid" style="max-height:300px"><table class="tabela" id="grid-ic">
      <thead><tr><th class="num">Cód</th><th>Nome</th><th>Fantasia</th><th>CPF/CNPJ</th><th>Cidade</th></tr></thead>
      <tbody><tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Digite para buscar.</td></tr></tbody>
    </table></div>
    <div class="rodape-form">
      <button class="btn-acao" onclick="fecharJanela()">Fechar</button>
      <button class="btn-acao" onclick="limparCliente()">Remover Cliente</button>
    </div>`, 780);
  setTimeout(() => $('#ic-busca')?.focus(), 60);
  $('#ic-busca').addEventListener('keydown', e => { if (e.key === 'Enter') buscarClientesCaixa(); });
}

let _icClientes = [];
async function buscarClientesCaixa() {
  const q = ($('#ic-busca')?.value || '').trim();
  if (!q) return toast('Digite para buscar.');
  const tb = document.querySelector('#grid-ic tbody');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Buscando…</td></tr>';
  try {
    _icClientes = await estoqueApi(`/clientes?busca=${encodeURIComponent(q)}`);
    tb.innerHTML = _icClientes.map(c => `
      <tr onclick="selecionarClienteCaixa('${c.id}')">
        <td class="num">${c.cod || '—'}</td><td>${c.nome}</td>
        <td>${c.fantasia || '—'}</td><td>${c.cpfCnpj || '—'}</td><td>${c.cidade || '—'}</td>
      </tr>`).join('') ||
      '<tr><td colspan="5" style="text-align:center;color:var(--cinza);padding:18px">Nenhum cliente.</td></tr>';
    if (_icClientes.length === 1) selecionarClienteCaixa(_icClientes[0].id);
  } catch (e) {
    if (tb) tb.innerHTML = `<tr><td colspan="5" style="color:var(--vermelho);text-align:center;padding:18px">${e.message}</td></tr>`;
  }
}

async function selecionarClienteCaixa(id) {
  const c = _icClientes.find(x => x.id === id);
  if (!c) return;
  clienteAtual = c;
  fecharJanela();
  $('#info-cliente').textContent = c.nome + (c.cpfCnpj ? ` (${c.cpfCnpj})` : '');
  toast(`Cliente identificado: <b>${c.nome}</b>`);
}

function limparCliente() {
  clienteAtual = null;
  $('#info-cliente').textContent = '—';
  fecharJanela();
  toast('Cliente removido da pré-venda.');
}

// ─── Buscar Produto (F7) ──────────────────────────────────────────────────────
function abrirBuscarProduto() {
  if (!preVenda) return toast('Crie uma pré-venda primeiro (F2).');
  abrirJanela('Buscar Produto', `
    <div class="linha-consulta" style="margin-bottom:10px">
      <input type="text" id="bp-in" placeholder="Nome, código ou código de barras… (Enter para pesquisar)" autocomplete="off">
      <button class="btn-acao" onclick="buscarProduto()">Buscar</button>
    </div>
    <div class="moldura-grid" style="max-height:300px"><table class="tabela" id="grid-bp">
      <thead><tr><th>Código</th><th>Descrição</th><th class="num">Saldo ${nomeFil(filialAtual)}</th><th class="num">Preço</th></tr></thead>
      <tbody><tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Digite para buscar.</td></tr></tbody>
    </table></div>
    <div id="form-add" class="hide">
      <div style="border-top:1px solid var(--linha); margin-top:12px; padding-top:12px">
        <div class="form-linha"><label>Produto</label><input id="ap-nome" disabled></div>
        <div class="form-linha"><label>Quantidade</label><input id="ap-qtd" type="number" min="1" value="1" inputmode="numeric"></div>
        <div class="form-linha"><label>Preço Unit. (R$)</label><input id="ap-unit" type="number" step="any" min="0.01" inputmode="decimal"></div>
      </div>
      <div class="rodape-form">
        <button class="btn-acao" onclick="fecharJanela()">Fechar</button>
        <button class="btn-acao primario" id="btn-add" onclick="adicionarItem()">Adicionar Item</button>
      </div>
    </div>
    <div id="hint-bp" class="rodape-form" style="margin-top:10px">
      <button class="btn-acao" onclick="fecharJanela()">Fechar</button>
    </div>`, 700);

  let _bpTimer = null;
  $('#bp-in').addEventListener('input', () => {
    clearTimeout(_bpTimer);
    _bpTimer = setTimeout(buscarProduto, 400);
  });
  $('#bp-in').addEventListener('keydown', e => { if (e.key === 'Enter') buscarProduto(); });
  setTimeout(() => $('#bp-in')?.focus(), 60);
}

async function buscarProduto() {
  const q = ($('#bp-in')?.value || '').trim();
  if (!q) return;
  const tb = document.querySelector('#grid-bp tbody');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Buscando…</td></tr>';
  try {
    PRODUTOS = await estoqueApi(`/produtos?busca=${encodeURIComponent(q)}`);
    tb.innerHTML = PRODUTOS.map(p => {
      const saldo = (p.saldo ?? {})[filialAtual] || 0;
      return `<tr onclick="selecionarProdutoBusca('${p.id}')">
        <td class="num">${p.cod}</td><td>${p.nome}</td>
        <td class="num ${saldo === 0 ? 'neg' : ''}">${saldo}</td>
        <td class="num">${brl(p.preco)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--cinza);padding:18px">Nenhum produto encontrado.</td></tr>';
    if (PRODUTOS.length === 1) selecionarProdutoBusca(PRODUTOS[0].id);
  } catch (e) {
    if (tb) tb.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--vermelho);padding:18px">${e.message}</td></tr>`;
  }
}

function selecionarProdutoBusca(id) {
  const p = PRODUTOS.find(x => x.id === id);
  if (!p) return;
  document.querySelectorAll('#grid-bp tbody tr').forEach(r => r.classList.remove('sel'));
  const row = [...document.querySelectorAll('#grid-bp tbody tr')].find(r => r.onclick?.toString().includes(id));
  if (row) row.classList.add('sel');

  const form = $('#form-add'); const hint = $('#hint-bp');
  if (form) { form.classList.remove('hide'); if (hint) hint.classList.add('hide'); }
  if ($('#ap-nome')) $('#ap-nome').value = `${p.cod} — ${p.nome}`;
  if ($('#ap-unit')) { $('#ap-unit').value = p.preco; $('#ap-unit')._produtoId = id; }
  if ($('#ap-qtd')) { $('#ap-qtd').value = 1; $('#ap-qtd').focus(); }
}

async function adicionarItem() {
  if (!preVenda) return toast('Sem pré-venda ativa.');
  const unit = $('#ap-unit');
  const pid = unit?._produtoId;
  const p = PRODUTOS.find(x => x.id === pid);
  if (!p) return toast('Selecione um produto da lista.');

  const qtd = parseInt($('#ap-qtd').value);
  const unitVal = parseFloat(unit.value);
  if (!qtd || qtd < 1) return toast('Informe uma quantidade válida.');
  if (!unitVal || unitVal <= 0) return toast('Preço deve ser maior que zero.');

  const saldo = (p.saldo ?? {})[filialAtual] || 0;
  if (saldo < qtd) {
    const confirma = confirm(`Saldo insuficiente em ${nomeFil(filialAtual)}: ${saldo} disponível.\nContinuar mesmo assim?`);
    if (!confirma) return;
  }

  const btn = $('#btn-add');
  btn.disabled = true; btn.textContent = 'Adicionando…';
  try {
    preVenda = await caixaApi(`/prevendas/${preVenda.num}/itens`, {
      method: 'POST',
      body: { produtoId: p.id, cod: p.cod, nome: p.nome, qtd, unit: unitVal },
    });
    atualizarUI();
    fecharJanela();
    toast(`<b>${qtd}× ${p.cod}</b> adicionado.`);
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Adicionar Item';
  }
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

// ─── F3 Pré-Vendas Abertas ────────────────────────────────────────────────────
async function janelaPreVendasAbertas() {
  abrirJanela('Pré-Vendas Abertas', `
    <div class="moldura-grid" style="max-height:380px"><table class="tabela">
      <thead><tr>
        <th class="num">Nº</th><th>Vendedor</th><th>Filial</th>
        <th class="num">Itens</th><th class="num">Total</th><th>Aberta em</th><th></th>
      </tr></thead>
      <tbody><tr><td colspan="7" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao" onclick="fecharJanela()">Fechar</button></div>`, 840);
  try {
    const pvs = await caixaApi('/prevendas');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = pvs.map(pv => {
      const total = (pv.itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);
      return `<tr onclick="carregarPreVenda(${pv.num})">
        <td class="num" style="font-weight:900">#${pv.num}</td>
        <td>${pv.vendedor || '—'}</td>
        <td>${nomeFil(pv.filial)}</td>
        <td class="num">${(pv.itens || []).length}</td>
        <td class="num">R$ ${brl(total)}</td>
        <td style="font-size:11px">${pv.criadaEm ? new Date(pv.criadaEm).toLocaleString('pt-BR') : '—'}</td>
        <td><button class="btn-acao primario" style="padding:3px 10px; font-size:11px" onclick="event.stopPropagation(); carregarPreVenda(${pv.num})">Abrir</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--cinza);padding:18px">Nenhuma pré-venda em aberto.</td></tr>';
  } catch (e) { toast(e.message); }
}

function carregarPreVenda(num) {
  // busca na lista já carregada ou via endpoint
  caixaApi('/prevendas').then(pvs => {
    const pv = pvs.find(x => x.num === num);
    if (!pv) return toast(`Pré-venda #${num} não encontrada.`);
    preVenda = pv;
    pagamentos = [];
    atualizarUI();
    fecharJanela();
    toast(`Pré-venda <b>#${num}</b> carregada.`);
  }).catch(e => toast(e.message));
}

// ─── F4 Histórico de Vendas ───────────────────────────────────────────────────
async function janelaVendasFinalizadas() {
  abrirJanela('Histórico de Vendas Finalizadas', `
    <div class="moldura-grid" style="max-height:400px"><table class="tabela">
      <thead><tr>
        <th class="num">Nº</th><th>Vendedor</th><th>Filial</th>
        <th class="num">Itens</th><th class="num">Total</th><th>Emitida em</th>
      </tr></thead>
      <tbody><tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Carregando…</td></tr></tbody>
    </table></div>
    <div class="rodape-form"><button class="btn-acao" onclick="fecharJanela()">Fechar</button></div>`, 840);
  try {
    const vendas = await caixaApi('/vendas');
    const tb = document.querySelector('#janela-ativa .tabela tbody');
    if (!tb) return;
    tb.innerHTML = vendas.map(v => {
      const total = (v.itens || []).reduce((s, i) => s + (i.unit || 0) * (i.qtd || 0), 0);
      return `<tr>
        <td class="num">${v.num}</td>
        <td>${v.vendedor || '—'}</td>
        <td>${nomeFil(v.filial)}</td>
        <td class="num">${(v.itens || []).length}</td>
        <td class="num" style="font-weight:900">R$ ${brl(total)}</td>
        <td style="font-size:11px">${v.emitidaEm ? new Date(v.emitidaEm).toLocaleString('pt-BR') : '—'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--cinza);padding:18px">Nenhuma venda finalizada.</td></tr>';
  } catch (e) { toast(e.message); }
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

// ─── Relógio ──────────────────────────────────────────────────────────────────
function relogio() {
  const d = new Date();
  $('#st-relogio').textContent = d.toLocaleDateString('pt-BR') + ' - ' + d.toLocaleTimeString('pt-BR');
}
setInterval(relogio, 1000); relogio();
$('#lg-sen').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
$('#lg-usr').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
montarMenus(); montarToolbar();


// ─── Global ───────────────────────────────────────────────────────────────────
Object.assign(window, {
  entrar, selecionarFilialLogin, fecharJanela, fecharMenus,
  abrirBuscarProduto, buscarProduto, selecionarProdutoBusca, adicionarItem,
  janelaEmitir, adicionarPagamento, removePagamento, confirmarEmissao,
  janelaCancelar, confirmarCancelamento,
  janelaNovaPreVenda, confirmarNovaPV,
  janelaPreVendasAbertas, carregarPreVenda,
  janelaVendasFinalizadas,
  janelaIdentificarCliente, buscarClientesCaixa, selecionarClienteCaixa, limparCliente,
  removerItem, nomeFil,
});
