import { processarRotaORMIS } from './ormis_rota.js';
const PORTAL = 'https://sm.procivmadeira.pt/portal';
const $ = id => document.getElementById(id);
let identityManager = null;
let authenticated = false;
function message(value){ $('status').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function setWorking(value){ for (const id of ['login','simular','gravar']) $(id).disabled = value || (id !== 'login' && !authenticated); }
async function apiToken(){
  if (!identityManager) throw new Error('Inicia sessão primeiro.');
  const credential = await identityManager.getCredential(PORTAL + '/sharing', {oAuthPopupConfirmation:false});
  return credential.token;
}
$('login').addEventListener('click', () => {
  const appId = $('clientId').value.trim();
  if (!appId) { message('Introduz primeiro o Client ID OAuth público da aplicação registada no ArcGIS Enterprise.'); return; }
  setWorking(true); message('A iniciar autenticação...');
  window.require(['esri/identity/OAuthInfo','esri/identity/IdentityManager'], async (OAuthInfo, esriId) => {
    try {
      identityManager = esriId;
      esriId.registerOAuthInfos([new OAuthInfo({appId,portalUrl:PORTAL,popup:false})]);
      await apiToken();
      authenticated = true;
      message('Sessão autenticada. Introduz o número ORMIS e testa sem gravar.');
    } catch (e) { message('Autenticação não concluída: ' + e.message + '\nConfirma o Client ID e os Redirect URIs autorizados no Portal.'); }
    finally { setWorking(false); }
  });
});
async function execute(simular){
  const ormisNumero = $('numero').value.trim();
  if (!ormisNumero) { message('Indica o número ORMIS.'); return; }
  if (!simular && !confirm(`Gravar a rota da ORMIS ${ormisNumero} na camada operacional?`)) return;
  setWorking(true); message(simular ? 'A consultar e calcular...' : 'A gravar rota...');
  try { message(await processarRotaORMIS({ormisNumero,getToken:apiToken,simular})); }
  catch(e) { message('Erro: ' + e.message + '\nSe for erro CORS ou 499, precisamos de validar as permissões/origens permitidas no Enterprise.'); }
  finally { setWorking(false); }
}
$('simular').addEventListener('click',()=>execute(true));
$('gravar').addEventListener('click',()=>execute(false));


// =========================================================
// RECEBER AUTOMATICAMENTE O NÚMERO ORMIS DO EXPERIENCE BUILDER
// =========================================================

// RECEBER O NÚMERO ORMIS DO URL

function carregarNumeroORMIS() {
    const parametros = new URLSearchParams(window.location.search);
    const numero = parametros.get("ormis");

    if (numero && /^\d+$/.test(numero.trim())) {
        const campo = document.getElementById("numero");

        if (campo) {
            campo.value = numero.trim();
            campo.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", carregarNumeroORMIS);
} else {
    carregarNumeroORMIS();
}
