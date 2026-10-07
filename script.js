import { firebaseConfig, APPS_SCRIPT_URL } from './firebase-config.js';
import { LOJAS_FIXAS } from './lojas.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, setDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ==================== Inicialização ====================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
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

// Cache local da lista de lojas
let todasAsLojas = [];

// ==================== Login (Firebase Authentication) ====================
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgLogin.textContent = '';

  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    console.error(err);
    msgLogin.textContent = '❌ E-mail ou senha inválidos.';
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    iniciarApp(user.email);
  } else {
    telaLogin.style.display = 'flex';
    appDiv.style.display = 'none';
  }
});

document.getElementById('btnSair').addEventListener('click', () => {
  signOut(auth);
});

function iniciarApp(email) {
  telaLogin.style.display = 'none';
  appDiv.style.display = 'block';
  usuarioLogado.textContent = '👤 ' + email;
  iniciarLista();
}

// ==================== Mensagens ====================
function mostrarMensagem(texto, tipo = 'sucesso') {
  msg.textContent = texto;
  msg.className = tipo;
  setTimeout(() => {
    msg.className = '';
    msg.textContent = '';
  }, 5000);
}

// ==================== Cadastro inicial de lojas ====================
async function garantirLojasNoFirestore() {
  console.log('🔍 Verificando lojas existentes no Firestore...');

  let existentes = new Set();
  try {
    const snap = await getDocs(collection(db, 'lojas'));
    snap.forEach(d => {
      const v = d.data();
      existentes.add(`${v.piso}|${v.luc}|${v.loja}`);
    });
    console.log(`📦 Já existem ${snap.size} lojas no Firestore.`);
  } catch (err) {
    console.error('❌ Erro ao ler Firestore:', err.code, err.message);
    mostrarMensagem('❌ Sem permissão para ler o banco. Confira as regras.', 'erro');
    return;
  }

  const faltando = LOJAS_FIXAS.filter(l => {
    const chave = `${l.piso}|${l.luc}|${l.loja}`;
    return !existentes.has(chave);
  });

  console.log(`➕ Faltam cadastrar ${faltando.length} lojas.`);
  if (faltando.length === 0) return;

  mostrarMensagem(`⏳ Cadastrando ${faltando.length} lojas...`);

  let ok = 0, fail = 0;
  for (const loja of faltando) {
    try {
      await addDoc(collection(db, 'lojas'), {
        piso: loja.piso,
        luc: loja.luc,
        loja: loja.loja,
        email: '',
        telefone: '',
        criadoEm: new Date().toISOString()
      });
      ok++;
    } catch (err) {
      fail++;
      console.error('❌ Falha ao cadastrar:', loja.loja, err.code, err.message);
    }
  }

  console.log(`✅ ${ok} cadastradas · ❌ ${fail} falhas`);
  if (fail > 0) mostrarMensagem(`⚠️ ${ok} cadastradas, ${fail} falharam.`, 'erro');
}

async function iniciarLista() {
  await garantirLojasNoFirestore();
  await carregarLojas();
}

// ==================== Carregar lojas (SEM índice no Firestore) ====================
async function carregarLojas() {
  try {
    const snap = await getDocs(collection(db, 'lojas'));
    console.log(`📥 carregarLojas: recebi ${snap.size} documentos.`);

    todasAsLojas = [];
    snap.forEach(docSnap => {
      todasAsLojas.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Ordena localmente: primeiro por piso, depois por LUC (com números)
    todasAsLojas.sort((a, b) => {
      if (a.piso !== b.piso) return a.piso.localeCompare(b.piso);
      return (a.luc || '').localeCompare(b.luc || '', undefined, { numeric: true });
    });

    renderizarTabela();
  } catch (err) {
    console.error('❌ Erro em carregarLojas:', err.code, err.message);
    mostrarMensagem('❌ Erro ao carregar lojas: ' + err.message, 'erro');
  }
}

// ==================== Renderizar tabela ====================
function renderizarTabela() {
  tabela.innerHTML = '';

  const pisoSelecionado = filtroPiso.value;
  const termoBusca = filtroBusca.value.trim().toLowerCase();

  const filtradas = todasAsLojas.filter(d => {
    if (pisoSelecionado && d.piso !== pisoSelecionado) return false;
    if (termoBusca) {
      const alvo = `${d.loja} ${d.luc}`.toLowerCase();
      if (!alvo.includes(termoBusca)) return false;
    }
    return true;
  });

  if (filtradas.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" style="text-align:center;padding:20px;">
      Nenhuma loja encontrada.
    </td>`;
    tabela.appendChild(tr);
    return;
  }

  filtradas.forEach(d => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color:#1f4e78;">${d.piso}</strong></td>
      <td><strong>${d.luc}</strong></td>
      <td>${d.loja}</td>
      <td>
        <input type="email" data-campo="email" value="${d.email || ''}"
               placeholder="email@loja.com" />
      </td>
      <td>
        <input type="tel" data-campo="telefone" value="${d.telefone || ''}"
               placeholder="(11) 99999-9999" />
      </td>
      <td>
        <button class="btn-salvar" data-id="${d.id}">Salvar</button>
        <span class="status-ok" data-status="${d.id}"></span>
      </td>
    `;
    tabela.appendChild(tr);
  });

  // Botões "Salvar"
  document.querySelectorAll('.btn-salvar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const tr = btn.closest('tr');
      const email = tr.querySelector('[data-campo="email"]').value.trim();
      const telefone = tr.querySelector('[data-campo="telefone"]').value.trim();

      try {
        await setDoc(doc(db, 'lojas', id), { email, telefone }, { merge: true });

        const item = todasAsLojas.find(x => x.id === id);
        if (item) { item.email = email; item.telefone = telefone; }

        const status = document.querySelector(`[data-status="${id}"]`);
        status.textContent = '✓ salvo';
        setTimeout(() => { status.textContent = ''; }, 2500);
      } catch (err) {
        console.error(err);
        alert('Erro ao salvar: ' + err.message);
      }
    });
  });
}

filtroPiso.addEventListener('change', renderizarTabela);
filtroBusca.addEventListener('input', renderizarTabela);

// ==================== Exportar Excel + Enviar e-mail ====================
document.getElementById('btnExportar').addEventListener('click', async () => {
  try {
    const snap = await getDocs(collection(db, 'lojas'));
    if (snap.empty) {
      mostrarMensagem('⚠️ Nenhuma loja encontrada.', 'erro');
      return;
    }

    const dados = [];
    snap.forEach(d => {
      const v = d.data();
      dados.push({
        Piso: v.piso,
        LUC: v.luc,
        Loja: v.loja,
        Email: v.email || '(não informado)',
        Telefone: v.telefone || '(não informado)'
      });
    });

    dados.sort((a, b) => {
      if (a.Piso !== b.Piso) return a.Piso.localeCompare(b.Piso);
      return (a.LUC || '').localeCompare(b.LUC || '', undefined, { numeric: true });
    });

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lojas');

    const excelBase64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const nomeArquivo = `lojas_shopping_${new Date().toISOString().slice(0, 10)}.xlsx`;

    XLSX.writeFile(wb, nomeArquivo);
    mostrarMensagem('⏳ Enviando e-mail...');

    const resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        excelBase64,
        filename: nomeArquivo,
        count: dados.length
      })
    });

    const texto = await resposta.text();
    let resultado;
    try {
      resultado = JSON.parse(texto);
    } catch {
      resultado = { result: 'error', error: texto };
    }

    if (resultado.result === 'success') {
      mostrarMensagem(`📧 Excel (${dados.length} lojas) enviado para diego@gmail.com!`);
    } else {
      mostrarMensagem('❌ Falha no envio: ' + (resultado.error || 'erro desconhecido'), 'erro');
    }
  } catch (err) {
    console.error(err);
    mostrarMensagem('❌ Erro: ' + err.message, 'erro');
  }
});

// ==================== Restaurar lista padrão ====================
document.getElementById('btnRestaurar').addEventListener('click', async () => {
  if (!confirm('⚠️ Isso apagará TODAS as lojas do Firestore e recarregará a lista padrão. Continuar?')) return;

  const snap = await getDocs(collection(db, 'lojas'));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'lojas', d.id))));

  await garantirLojasNoFirestore();
  await carregarLojas();
  mostrarMensagem('🔄 Lista padrão restaurada.');
});