/**
 * ORMIS — Motor de criação/atualização da rota CMA → missão.
 * JavaScript ES module, sem ArcPy e sem bibliotecas externas.
 * A autenticação é fornecida pela aplicação que o invoca: getToken().
 * Nunca guardar tokens no código-fonte.
 */
const BASE = 'https://sm.procivmadeira.pt/server/rest/services/Hosted';
const URL_ORMIS = `${BASE}/service_3574e2d56d1f42538658a4439ea846d6/FeatureServer/0`;
const URL_PREVENTECH = `${BASE}/Preventech_Ocorrencias/FeatureServer/0`;
const URL_ROTA = `${BASE}/ORMIS_Rota_CMA/FeatureServer/0`;
const CMA = { latitude: 32.6448629747342, longitude: -16.866434324486246 };
const DEG = Math.PI / 180;

function sql(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function numeric(value, name) {
  const n = Number(value);
  if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(n)) {
    throw new Error(`${name}: coordenada inválida ou em falta`);
  }
  return n;
}
function coords(latitude, longitude) {
  const lat = numeric(latitude, 'Latitude');
  const lon = numeric(longitude, 'Longitude');
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
    throw new Error('Coordenadas fora dos limites válidos');
  }
  return { lat, lon };
}
export function rumoDistancia(origem, destino) {
  const lat1 = origem.lat * DEG, lat2 = destino.lat * DEG;
  const dlon = (destino.lon - origem.lon) * DEG;
  const dlat = lat2 - lat1;
  const a0 = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  const a = Math.max(0, Math.min(1, a0));
  const distancia = 2 * 6371.0088 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const y = Math.sin(dlon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlon);
  const rumo = (Math.round((Math.atan2(y, x) / DEG + 360) % 360)) % 360;
  return { rumo_cma: rumo, distancia_cma: Math.round(distancia * 100) / 100 };
}

async function rest(url, params, getToken) {
  const token = await getToken();
  if (!token || typeof token !== 'string') throw new Error('Não foi fornecido um token válido pela aplicação');
  const body = new URLSearchParams({ f: 'json', token, ...params });
  const response = await fetch(url, { method: 'POST', body, credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  const data = await response.json();
  if (data.error) throw new Error(`ArcGIS REST ${data.error.code}: ${data.error.message}`);
  return data;
}
async function query(url, where, getToken, extras = {}) {
  const result = await rest(`${url}/query`, { where, outFields: '*', returnGeometry: 'true', outSR: '4326', ...extras }, getToken);
  return result.features || [];
}
function one(features, label) {
  if (features.length !== 1) throw new Error(`${label}: encontrados ${features.length} registos; esperado exatamente 1`);
  return features[0];
}
function fieldName(fields, desired) {
  return fields.find(f => f.name.toLowerCase() === desired.toLowerCase())?.name;
}
function attributesOf(fields, values) {
  const obj = {};
  for (const [key, value] of Object.entries(values)) {
    const actual = fieldName(fields, key);
    if (actual && value !== undefined) obj[actual] = value;
  }
  return obj;
}
/**
 * Atualiza uma rota por GlobalID. Se não existir, cria-a.
 * @param {object} options
 * @param {string|number} options.ormisNumero - N.º ORMIS (selecionado, nunca "última editada")
 * @param {function():Promise<string>} options.getToken - token já autenticado no Portal
 * @param {boolean} [options.simular=true] - true: apenas valida/calcula; false: grava na camada
 */
export async function processarRotaORMIS({ ormisNumero, getToken, simular = true }) {
  if (ormisNumero === undefined || ormisNumero === null || String(ormisNumero).trim() === '') {
    throw new Error('Indica o número ORMIS');
  }
  const [ormisSchema, rotaSchema] = await Promise.all([
    rest(URL_ORMIS, {}, getToken), rest(URL_ROTA, {}, getToken)
  ]);
  if (rotaSchema.geometryType !== 'esriGeometryPolyline') throw new Error('A camada de rotas não é de linhas');
  const numeroCampo = fieldName(ormisSchema.fields, 'ormis_num');
  if (!numeroCampo) throw new Error('Campo ormis_num inexistente na ORMIS');
  const fieldType = ormisSchema.fields.find(f => f.name === numeroCampo).type;
  const where = `${numeroCampo} = ${fieldType === 'esriFieldTypeString' ? sql(ormisNumero) : Number(ormisNumero)}`;
  const feature = one(await query(URL_ORMIS, where, getToken), 'ORMIS');
  const d = feature.attributes;
  const tipo = String(d.tipo_missao ?? '').trim().toLowerCase();
  const globalid = String(d.globalid ?? d.GlobalID ?? '').trim();
  if (!globalid) throw new Error('ORMIS sem GlobalID');
  let destino;
  if (tipo === 'ff') {
    const sado = String(d.sado_num ?? '').trim();
    if (!sado) throw new Error('ORMIS FF sem SADO');
    // Na Preventech confirmou-se que o n.º apresentado pelo SIOPS está em "numero".
    const oc = one(await query(URL_PREVENTECH, `numero = ${sql(sado)}`, getToken, { returnGeometry: 'false' }), 'Ocorrência Preventech');
    destino = coords(oc.attributes.sado_latitude_gps, oc.attributes.sado_longitude_gps);
  } else if (['sar', 'busca', 'salvamento'].includes(tipo)) {
    const g = feature.geometry;
    if (!g || g.x === undefined || g.y === undefined) throw new Error('ORMIS sem geometria pontual');
    destino = coords(g.y, g.x);
  } else throw new Error(`Tipo de missão não reconhecido: ${tipo}`);

  const origem = { lat: CMA.latitude, lon: CMA.longitude };
  const calculo = rumoDistancia(origem, destino);
  const texto = `${calculo.rumo_cma}° | ${calculo.distancia_cma} km`;
  const rotaFields = rotaSchema.fields;
  const rotaGlobalID = fieldName(rotaFields, 'ormis_globalid');
  if (!rotaGlobalID) throw new Error('Camada de rotas sem campo ormis_globalid');
  const existentes = await query(URL_ROTA, `${rotaGlobalID} = ${sql(globalid)}`, getToken, { returnGeometry: 'false' });
  if (existentes.length > 1) throw new Error(`Foram encontradas ${existentes.length} rotas para o mesmo GlobalID. Corrigir duplicados antes de gravar.`);
  const atributos = attributesOf(rotaFields, {
    ormis_num: ormisNumero, ormis_globalid: globalid, tipo_missao: tipo,
    rumo_cma: calculo.rumo_cma, distancia_cma: calculo.distancia_cma,
    rotulo: texto, estado_ormis: d.estado_ormis
  });
  const geo = { paths: [[[CMA.longitude, CMA.latitude], [destino.lon, destino.lat]]], spatialReference: { wkid: 4326 } };
  const acao = existentes.length ? 'atualizar' : 'criar';
  if (simular) return { estado: 'SIMULAÇÃO — nenhuma alteração gravada', acao, ormisNumero, destino, ...calculo, rotulo: texto };

  const oidField = rotaSchema.objectIdField;
  if (existentes.length) atributos[oidField] = existentes[0].attributes[oidField];
  const field = existentes.length ? 'updates' : 'adds';
  const operation = existentes.length ? 'updateResults' : 'addResults';
  const result = await rest(`${URL_ROTA}/applyEdits`, {
    [field]: JSON.stringify([{ attributes: atributos, geometry: geo }]), rollbackOnFailure: 'true'
  }, getToken);
  if (result[operation]?.length !== 1 || result[operation][0].success !== true) {
    throw new Error(`A gravação da rota falhou: ${JSON.stringify(result)}`);
  }
  return { estado: 'GRAVADO', acao, ormisNumero, destino, ...calculo, rotulo: texto, resultado: result[operation][0] };
}
