import { createRoot } from 'react-dom/client';
import BuscarProdutoModal from './produto/BuscarProdutoModal.jsx';
import IdentificarClienteModal from './cliente/IdentificarClienteModal.jsx';
import { PreVendasAbertasModal, VendasFinalizadasModal } from './vendas/ListasModal.jsx';

/*
 * Ponte main.js (vanilla) → React para as telas migradas do caixa.
 * Um container por vez montado no #mesa; o main.js segue dono do estado.
 */
let raizAtual = null;
let containerAtual = null;

function montar(elemento) {
  fecharModalReact();
  const container = document.createElement('div');
  container.id = 'react-modal';
  document.getElementById('mesa').appendChild(container);
  raizAtual = createRoot(container);
  containerAtual = container;
  raizAtual.render(elemento);
}

export function fecharModalReact() {
  if (raizAtual) { raizAtual.unmount(); raizAtual = null; }
  if (containerAtual) { containerAtual.remove(); containerAtual = null; }
}

export function abrirBuscarProdutoReact(ctx) {
  montar(<BuscarProdutoModal ctx={ctx} onClose={fecharModalReact} />);
}

export function abrirIdentificarClienteReact(ctx) {
  montar(<IdentificarClienteModal ctx={ctx} onClose={fecharModalReact} />);
}

export function abrirPreVendasAbertasReact(ctx) {
  montar(<PreVendasAbertasModal ctx={ctx} onClose={fecharModalReact} />);
}

export function abrirVendasFinalizadasReact(ctx) {
  montar(<VendasFinalizadasModal ctx={ctx} onClose={fecharModalReact} />);
}
