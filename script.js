import { firebaseConfig } from './firebase-config.js';
import { LOJAS_FIXAS } from './lojas.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, setDoc, deleteDoc, doc,
  initializeFirestore, persistentLocalCache, persistentSingleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ==================== Inicialização ====================
const app = initializeApp(firebaseConfig);

// Ativação da Persistência Offline
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager()
  })
});
const auth = getAuth(app);

// ==================== Elementos ====================
const telaLogin = document.getElementById('telaLogin');
const appDiv = document.getElementById('app');
const formLogin = document.getElementById('formLogin');
const msgLogin = document.getElementById('msgLogin');
const usuarioLogado = document.getElementById('usuarioLogado');
const tabela = document.querySelector('#tabelaLojas tbody');
const filtroPiso = document.getElementById('filtroPiso');
const filtroBusca = document.getElementById('filtroBusca');
const msg = document.getElementById('mensagem');

// Elementos do Dashboard
const cardTotal = document.getElementById('cardTotalLojas');
const cardPendentes = document.getElementById('cardPendentes');
const cardPreenchidos = document.getElementById('cardPreenchidos');

let todasAsLojas = [];

// ==================== Login ====================
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgLogin.textContent = '';
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    msgLogin.textContent = '❌ E-mail ou senha inválidos.';
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    telaLogin.style.display = 'none';
    appDiv.style.display = 'block';
    usuarioLogado.textContent = user.email;
    iniciarLista();
  } else {
    telaLogin.style.display = 'flex';
    appDiv.style.display = 'none';
  }
});

document.getElementById('btnSair').addEventListener('click', () => signOut(auth));

// ==================== Mensagens ====================
function mostrarMensagem(texto, tipo = 'sucesso') {
  msg.textContent = texto;
  msg.className = tipo;
  setTimeout(() => { msg.className = ''; msg.textContent = ''; }, 5000);
}

// ==================== Cadastro Inicial ====================
async function garantirLojasNoFirestore() {
  let existentes = new Set();
  try {
    const snap = await getDocs(collection(db, 'lojas'));
    snap.forEach(d => {
      const v = d.data();
      existentes.add(`${v.piso}|${v.luc}|${v.loja}`);
    });
  } catch (err) {
    mostrarMensagem('❌ Sem permissão para ler o banco.', 'erro');
    return;
  }

  const faltando = LOJAS_FIXAS.filter(l => !existentes.has(`${l.piso}|${l.luc}|${l.loja}`));
  if (faltando.length === 0) return;

  mostrarMensagem(`⏳ Cadastrando ${faltando.length} lojas novas...`);
  for (const loja of faltando) {
    try {
      await addDoc(collection(db, 'lojas'), {
        piso: loja.piso, luc: loja.luc, loja: loja.loja,
        nome: '', funcao: '', email: '', telefone: '', criadoEm: new Date().toISOString()
      });
    } catch (err) { console.error('Erro ao cadastrar:', loja.loja); }
  }
}

async function iniciarLista() {
  await garantirLojasNoFirestore();
  await carregarLojas();
}

// ==================== Carregar e Renderizar ====================
async function carregarLojas() {
  try {
    const snap = await getDocs(collection(db, 'lojas'));
    todasAsLojas = [];
    snap.forEach(docSnap => {
      todasAsLojas.push({ id: docSnap.id, ...docSnap.data() });
    });

    todasAsLojas.sort((a, b) => {
      if (a.piso !== b.piso) return a.piso.localeCompare(b.piso);
      return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
    });

    atualizarDashboard();
    renderizarTabela();
  } catch (err) {
    mostrarMensagem('❌ Erro ao carregar lojas.', 'erro');
  }
}

function atualizarDashboard() {
  cardTotal.textContent = todasAsLojas.length;
  
  let preenchidos = 0;
  todasAsLojas.forEach(d => {
    if (d.email || d.telefone) preenchidos++;
  });
  
  cardPreenchidos.textContent = preenchidos;
  cardPendentes.textContent = todasAsLojas.length - preenchidos;
}

function renderizarTabela() {
  tabela.innerHTML = '';
  const pisoSelecionado = filtroPiso.value;
  const termoBusca = filtroBusca.value.trim().toLowerCase();

  const filtradas = todasAsLojas.filter(d => {
    if (pisoSelecionado && d.piso !== pisoSelecionado) return false;
    if (termoBusca) {
      const alvo = `${d.loja} ${d.luc} ${d.nome || ''}`.toLowerCase();
      if (!alvo.includes(termoBusca)) return false;
    }
    return true;
  });

  if (filtradas.length === 0) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#808080;">Nenhuma loja encontrada.</td></tr>`;
    return;
  }

  filtradas.forEach(d => {
    const funcoes = ['Lojista', 'Escritório', 'Supervisor', 'Gerente', 'Vendedor Líder'];
    const opcoesFuncao = funcoes.map(f => 
      `<option value="${f}" ${d.funcao === f ? 'selected' : ''}>${f}</option>`
    ).join('');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Loja">
        <div class="nome-loja">${d.loja}</div>
        <div class="loja-sub">${d.piso} · LUC <strong>${d.luc}</strong></div>
      </td>
      <td data-label="Nome">
        <input type="text" data-campo="nome" value="${d.nome || ''}" placeholder="Nome do responsável" autocomplete="name" />
      </td>
      <td data-label="Função">
        <select data-campo="funcao" class="select-funcao">
          <option value="">Selecione...</option>
          ${opcoesFuncao}
        </select>
      </td>
      <td data-label="E-mail">
        <input type="email" data-campo="email" value="${d.email || ''}" placeholder="email@loja.com" autocomplete="email" inputmode="email" />
      </td>
      <td data-label="Telefone">
        <input type="tel" data-campo="telefone" value="${d.telefone || ''}" placeholder="(81) 99999-9999" autocomplete="tel" inputmode="tel" />
      </td>
      <td data-label="Ação">
        <button class="btn-salvar" data-id="${d.id}">Salvar</button>
        <span class="status-ok" data-status="${d.id}"></span>
      </td>
    `;
    tabela.appendChild(tr);
  });

  document.querySelectorAll('.btn-salvar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const tr = btn.closest('tr');
      const nome = tr.querySelector('[data-campo="nome"]').value.trim();
      const funcao = tr.querySelector('[data-campo="funcao"]').value;
      const email = tr.querySelector('[data-campo="email"]').value.trim();
      const telefone = tr.querySelector('[data-campo="telefone"]').value.trim();

      // 1. Atualiza interface IMEDIATAMENTE (Feedback visual offline)
      const item = todasAsLojas.find(x => x.id === id);
      if (item) { item.nome = nome; item.funcao = funcao; item.email = email; item.telefone = telefone; }
      atualizarDashboard();

      const status = document.querySelector(`[data-status="${id}"]`);
      status.textContent = '✓ salvo';
      setTimeout(() => { status.textContent = ''; }, 2500);

      // 2. Envia para o Firebase em segundo plano
      try {
        await setDoc(doc(db, 'lojas', id), { nome, funcao, email, telefone }, { merge: true });
        console.log('Servidor confirmou a escrita:', id);
      } catch (err) {
        console.error('Erro ao salvar:', err);
      }
    });
  });

  // Aplica a máscara
  document.querySelectorAll('input[data-campo="telefone"]').forEach(input => {
    aplicarMascaraTelefone(input);
  });
}

filtroPiso.addEventListener('change', renderizarTabela);
filtroBusca.addEventListener('input', renderizarTabela);

// ==================== Máscara de Telefone ====================
function aplicarMascaraTelefone(input) {
  input.addEventListener('input', (e) => {
    let valor = e.target.value.replace(/\D/g, '');
    if (valor.length > 11) valor = valor.slice(0, 11);

    if (valor.length > 6) {
      valor = valor.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    } else if (valor.length > 2) {
      valor = valor.replace(/^(\d{2})(\d{4,5})/, '($1) $2');
    } else if (valor.length > 0) {
      valor = valor.replace(/^(\d*)/, '($1');
    }
    e.target.value = valor;
  });
}

// ==================== Exportar Excel ====================
document.getElementById('btnExportar').addEventListener('click', async () => {
  if (todasAsLojas.length === 0) {
    mostrarMensagem('⚠️ Nenhuma loja para exportar.', 'erro');
    return;
  }

  const dados = todasAsLojas.map(v => ({
    Piso: v.piso,
    LUC: v.luc,
    Loja: v.loja,
    Nome: v.nome || '(não informado)',
    Funcao: v.funcao || '(não informado)',
    Email: v.email || '(não informado)',
    Telefone: v.telefone || '(não informado)'
  }));

  const ws = XLSX.utils.json_to_sheet(dados);
  ws['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 35 }, { wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lojas');

  const nomeArquivo = `lojas_tacaruna_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);

  mostrarMensagem(`✅ Arquivo baixado com sucesso!`);
});
