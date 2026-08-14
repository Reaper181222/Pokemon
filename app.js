/* =========================================================
   DEXTERM — cliente de PokéAPI (https://pokeapi.co)
   Sin backend ni SQL: todo se resuelve con fetch() al vuelo
   y se cachea en memoria (moveCache / abilityCache) para no
   repetir llamadas al cambiar de pestaña/generación.
   ========================================================= */

const API = "https://pokeapi.co/api/v2";

// Grupos de versión = "generaciones jugables" que expone PokéAPI.
// Cada uno agrupa los juegos donde el movimiento puede aprenderse.
const VERSION_GROUPS = [
  { id: "red-blue",            label: "Gen 1 (Rojo/Azul)" },
  { id: "yellow",               label: "Gen 1 (Amarillo)" },
  { id: "gold-silver",         label: "Gen 2 (Oro/Plata)" },
  { id: "crystal",              label: "Gen 2 (Cristal)" },
  { id: "ruby-sapphire",       label: "Gen 3 (Rubí/Zafiro)" },
  { id: "emerald",              label: "Gen 3 (Esmeralda)" },
  { id: "firered-leafgreen",   label: "Gen 3 (Rojo Fuego/V. Hoja)" },
  { id: "diamond-pearl",       label: "Gen 4 (Diamante/Perla)" },
  { id: "platinum",             label: "Gen 4 (Platino)" },
  { id: "heartgold-soulsilver",label: "Gen 4 (Oro H./Plata A.)" },
  { id: "black-white",         label: "Gen 5 (Negro/Blanco)" },
  { id: "black-2-white-2",     label: "Gen 5 (Negro 2/Blanco 2)" },
  { id: "x-y",                  label: "Gen 6 (X/Y)" },
  { id: "omega-ruby-alpha-sapphire", label: "Gen 6 (OR/AS)" },
  { id: "sun-moon",             label: "Gen 7 (Sol/Luna)" },
  { id: "ultra-sun-ultra-moon",label: "Gen 7 (Ultra S/UL)" },
  { id: "sword-shield",        label: "Gen 8 (Espada/Escudo)" },
  { id: "scarlet-violet",      label: "Gen 9 (Escarlata/Púrpura)" },
];

const METHOD_LABEL = {
  "level-up": "Nivel",
  "machine": "MT/MO",
  "egg": "Huevo",
  "tutor": "Tutor",
  "stadium-surfing-pikachu": "Especial",
  "light-ball-egg": "Huevo especial",
  "colosseum-purification": "Purificación",
  "xd-shadow": "Sombra (XD)",
  "xd-purification": "Purificación (XD)",
  "form-change": "Cambio de forma",
};

const moveCache = new Map();     // nombre-move -> datos completos ya resueltos
const itemCache = new Map();     // nombre-item -> datos /item/{id}
const natureCache = new Map();   // nombre-nature -> datos /nature/{id}
const abilityCache = new Map();  // nombre-ability -> datos /ability/{id}
let currentPokemon = null;       // payload crudo de /pokemon
let currentGen = null;
let currentMethod = "all";

// ---------- helpers DOM ----------
const $ = (sel) => document.querySelector(sel);
const show = (sel) => $(sel).classList.remove("hidden");
const hide = (sel) => $(sel).classList.add("hidden");

// ---------- fetch con manejo de error simple ----------
async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo obtener ${url} (${res.status})`);
  return res.json();
}

function nameByLang(namesArray, langCode, fallback) {
  const hit = namesArray.find((n) => n.language.name === langCode);
  return hit ? hit.name : fallback;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// =========================================================
// BÚSQUEDA PRINCIPAL
// =========================================================
async function searchPokemon(query) {
  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  if (!q) return;

  hide("#result"); hide("#error-state"); hide("#empty-state");
  show("#loading-state");

  try {
    const pokemon = await getJSON(`${API}/pokemon/${q}`);
    const species = await getJSON(pokemon.species.url);
    currentPokemon = pokemon;

    renderHero(pokemon, species);
    renderEvolutionChain(species); // no se espera (await) para no trabar el resto del render
    renderStats(pokemon);
    await renderAbilities(pokemon);
    renderCompetitiveSet(pokemon); // idem, corre en paralelo con la tabla de movimientos
    setupMoveTabs(pokemon);

    hide("#loading-state");
    show("#result");
  } catch (err) {
    console.error(err);
    hide("#loading-state");
    $("#error-msg").textContent = `No se encontró "${query}". Probá con el nombre en inglés o el número de Pokédex.`;
    show("#error-state");
  }
}

// =========================================================
// HERO (nombre, tipos, sprite, descripción)
// =========================================================
function renderHero(pokemon, species) {
  const nameEs = nameByLang(species.names, "es", pokemon.name);
  const genusEs = nameByLang(species.genera, "es", "");
  const flavor = species.flavor_text_entries.find((f) => f.language.name === "es")
              || species.flavor_text_entries.find((f) => f.language.name === "en");

  $("#dex-number").textContent = `#${String(pokemon.id).padStart(3, "0")}`;
  $("#poke-name").textContent = nameEs;
  $("#poke-name-en").textContent = pokemon.name;
  $("#species-genus").textContent = genusEs || "—";
  $("#flavor-text").textContent = flavor
    ? flavor.flavor_text.replace(/\f|\n/g, " ")
    : "Sin descripción disponible.";

  const sprites = pokemon.sprites;
  const artwork = sprites.other?.["official-artwork"]?.front_default || sprites.front_default;
  const shiny = sprites.other?.["official-artwork"]?.front_shiny || sprites.front_shiny;
  $("#sprite").src = artwork;
  $("#sprite").alt = nameEs;

  let showingShiny = false;
  const shinyBtn = $("#btn-shiny");
  shinyBtn.classList.remove("active");
  shinyBtn.onclick = () => {
    showingShiny = !showingShiny;
    $("#sprite").src = showingShiny ? (shiny || artwork) : artwork;
    shinyBtn.classList.toggle("active", showingShiny);
  };

  const cryBtn = $("#btn-cry");
  const cryUrl = pokemon.cries?.latest || pokemon.cries?.legacy;
  cryBtn.disabled = !cryUrl;
  cryBtn.onclick = () => {
    if (!cryUrl) return;
    const audio = $("#cry-audio");
    audio.src = cryUrl;
    audio.play();
  };

  const typeRow = $("#type-row");
  typeRow.innerHTML = "";
  pokemon.types.forEach((t) => {
    const span = document.createElement("span");
    span.className = `type-badge type-${t.type.name}`;
    span.textContent = t.type.name;
    typeRow.appendChild(span);
  });

  $("#height").textContent = `${(pokemon.height / 10).toFixed(1)} m`;
  $("#weight").textContent = `${(pokemon.weight / 10).toFixed(1)} kg`;
  $("#egg-groups").textContent = species.egg_groups.map((g) => g.name).join(", ") || "—";
}

// =========================================================
// STATS
// =========================================================
const STAT_LABEL = { hp: "PS", attack: "ATQ", defense: "DEF",
  "special-attack": "AT.ESP", "special-defense": "DEF.ESP", speed: "VEL" };

function renderStats(pokemon) {
  const wrap = $("#stats");
  wrap.innerHTML = "";
  pokemon.stats.forEach((s) => {
    const pct = Math.min(100, Math.round((s.base_stat / 255) * 100));
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `
      <span class="stat-name">${STAT_LABEL[s.stat.name] || s.stat.name}</span>
      <span class="stat-num">${s.base_stat}</span>
      <span class="stat-bar"><span class="stat-bar-fill" style="width:${pct}%"></span></span>
    `;
    wrap.appendChild(row);
  });
}






fetch("proxy.php")
    .then(response => response.text())
    .then(html => {
        document.getElementById("pokemon").innerHTML = html;
    })
    .catch(error => {
        document.getElementById("pokemon").innerHTML =
            "No se pudo cargar la información.";
        console.error(error);
    });












// =========================================================
// HABILIDADES (nombre ES/EN + efecto)
// =========================================================
async function renderAbilities(pokemon) {
  const wrap = $("#abilities");
  wrap.innerHTML = `<p class="moves-status">Cargando habilidades…</p>`;

  const details = await Promise.all(
    pokemon.abilities.map((a) => getJSON(a.ability.url))
  );

  wrap.innerHTML = "";
  pokemon.abilities.forEach((a, i) => {
    const data = details[i];
    const nameEs = nameByLang(data.names, "es", data.name);
    const effect = data.effect_entries.find((e) => e.language.name === "es")
                || data.effect_entries.find((e) => e.language.name === "en");
    const shortEffect = effect ? (effect.short_effect || effect.effect) : "Sin descripción disponible.";

    const card = document.createElement("div");
    card.className = "ability-card" + (a.is_hidden ? " hidden-ability" : "");
    card.innerHTML = `
      <span class="ability-tag">${a.is_hidden ? "Habilidad oculta" : "Habilidad " + (a.slot)}</span>
      <p class="ability-name">${nameEs}</p>
      <p class="ability-name-en">EN: ${data.name.replace(/-/g, " ")}</p>
      <p class="ability-desc">${shortEffect}</p>
    `;
    wrap.appendChild(card);
  });
}

// =========================================================
// MOVIMIENTOS — pestañas de generación + método
// =========================================================
function setupMoveTabs(pokemon) {
  // Solo mostramos generaciones en las que el Pokémon realmente
  // tiene movimientos registrados (evita pestañas vacías).
  const availableGroups = new Set();
  pokemon.moves.forEach((m) =>
    m.version_group_details.forEach((d) => availableGroups.add(d.version_group.name))
  );
  const groups = VERSION_GROUPS.filter((g) => availableGroups.has(g.id));

  const genTabsEl = $("#gen-tabs");
  genTabsEl.innerHTML = "";
  groups.forEach((g, idx) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.textContent = g.label;
    btn.dataset.gen = g.id;
    btn.onclick = () => selectGen(g.id);
    genTabsEl.appendChild(btn);
    if (idx === groups.length - 1) btn.classList.add("active"); // arranca en la más nueva
  });

  currentMethod = "all";
  if (groups.length) selectGen(groups[groups.length - 1].id);
  else {
    $("#moves-body").innerHTML = "";
    $("#moves-status").textContent = "Este Pokémon no tiene movimientos registrados en PokéAPI.";
  }
}

function selectGen(genId) {
  currentGen = genId;
  document.querySelectorAll("#gen-tabs .tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.gen === genId)
  );
  buildMethodTabs();
  renderMovesTable();
}

function buildMethodTabs() {
  const methods = new Set(["all"]);
  currentPokemon.moves.forEach((m) =>
    m.version_group_details
      .filter((d) => d.version_group.name === currentGen)
      .forEach((d) => methods.add(d.move_learn_method.name))
  );

  const wrap = $("#method-tabs");
  wrap.innerHTML = "";
  [...methods].forEach((m) => {
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (m === currentMethod ? " active" : "");
    btn.textContent = m === "all" ? "Todos" : (METHOD_LABEL[m] || m);
    btn.onclick = () => {
      currentMethod = m;
      document.querySelectorAll("#method-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderMovesTable();
    };
    wrap.appendChild(btn);
  });
  if (!methods.has(currentMethod)) currentMethod = "all";
}

async function renderMovesTable() {
  const tbody = $("#moves-body");
  const statusEl = $("#moves-status");
  tbody.innerHTML = "";

  let entries = currentPokemon.moves
    .map((m) => {
      const dets = m.version_group_details.filter((d) => d.version_group.name === currentGen &&
        (currentMethod === "all" || d.move_learn_method.name === currentMethod));
      return dets.map((d) => ({ moveRef: m.move, detail: d }));
    })
    .flat();

  if (!entries.length) {
    statusEl.textContent = "No hay movimientos para esta combinación de generación/método.";
    return;
  }

  statusEl.textContent = `Cargando ${entries.length} movimiento(s)…`;

  const uniqueMoveUrls = [...new Set(entries.map((e) => e.moveRef.url))];
  await Promise.all(uniqueMoveUrls.map(async (url) => {
    if (moveCache.has(url)) return;
    const data = await getJSON(url);
    moveCache.set(url, data);
  }));

  // Orden: nivel ascendente primero, luego alfabético
  entries.sort((a, b) => {
    const la = a.detail.level_learned_at || 0;
    const lb = b.detail.level_learned_at || 0;
    if (la !== lb) return la - lb;
    return a.moveRef.name.localeCompare(b.moveRef.name);
  });

  statusEl.textContent = `${entries.length} movimiento(s) — Gen: ${currentGen} · Método: ${currentMethod === "all" ? "todos" : METHOD_LABEL[currentMethod] || currentMethod}`;

  const frag = document.createDocumentFragment();
  entries.forEach(({ moveRef, detail }) => {
    const move = moveCache.get(moveRef.url);
    if (!move) return;

    const nameEs = nameByLang(move.names, "es", null);
    const effectEntry = move.effect_entries.find((e) => e.language.name === "es")
                      || move.effect_entries.find((e) => e.language.name === "en");
    let effectText = "—";
    if (effectEntry) {
      effectText = (effectEntry.short_effect || effectEntry.effect || "—")
        .replace("$effect_chance%", (move.effect_chance ?? "") + "%");
    }

    const detailText = detail.move_learn_method.name === "level-up"
      ? `Nv. ${detail.level_learned_at}`
      : (METHOD_LABEL[detail.move_learn_method.name] || detail.move_learn_method.name);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="move-es">${nameEs || `<span class="dim">(sin traducción)</span>`}</td>
      <td class="capitalize dim">${move.name.replace(/-/g, " ")}</td>
      <td><span class="type-chip type-${move.type.name}">${move.type.name}</span></td>
      <td><span class="cat-chip">${translateDamageClass(move.damage_class?.name)}</span></td>
      <td>${move.power ?? "—"}</td>
      <td>${move.accuracy ?? "—"}</td>
      <td>${move.pp ?? "—"}</td>
      <td>${detailText}</td>
      <td class="dim">${effectText}</td>
    `;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);
}

function translateDamageClass(name) {
  if (name === "physical") return "Físico";
  if (name === "special") return "Especial";
  if (name === "status") return "Estado";
  return name || "—";
}

// =========================================================
// CADENA DE EVOLUCIÓN
// =========================================================
async function renderEvolutionChain(species) {
  const wrap = $("#evolution-chain");
  wrap.innerHTML = `<p class="moves-status">Cargando evolución…</p>`;

  try {
    const evoData = await getJSON(species.evolution_chain.url);
    const nodes = await flattenEvoChain(evoData.chain);
    wrap.innerHTML = "";

    nodes.forEach((node, i) => {
      wrap.appendChild(buildEvoStageEl(node));
      if (i < nodes.length - 1) {
        wrap.appendChild(buildEvoArrowEl(node.evoToDetails));
      }
    });
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<p class="moves-status">No se pudo cargar la cadena evolutiva.</p>`;
  }
}

// Camina el árbol de evolución (algunos Pokémon ramifican, ej. Eevee).
// Para simplificar la UI tomamos la primera rama de cada nivel; si querés
// las ramas completas de Eevee, fijate en evoData.chain.evolves_to (array).
async function flattenEvoChain(chainNode) {
  const path = [];
  let node = chainNode;
  let incomingDetails = null;
  while (node) {
    const speciesData = await getJSON(`${API}/pokemon-species/${node.species.name}`);
    const pokeData = await getJSON(`${API}/pokemon/${node.species.name}`);
    path.push({
      nameEs: nameByLang(speciesData.names, "es", node.species.name),
      nameEn: node.species.name,
      sprite: pokeData.sprites.other?.["official-artwork"]?.front_default || pokeData.sprites.front_default,
      evoToDetails: node.evolution_details, // detalles para llegar A este nodo (vacío en el primero)
    });
    if (!node.evolves_to.length) break;
    node = node.evolves_to[0]; // primera rama
  }
  return path;
}

function buildEvoStageEl(node) {
  const isCurrent = currentPokemon && node.nameEn === currentPokemon.name;
  const div = document.createElement("div");
  div.className = "evo-stage" + (isCurrent ? " current" : "");
  div.innerHTML = `
    <img src="${node.sprite || ""}" alt="${node.nameEs}" />
    <span class="evo-name">${node.nameEs}</span>
    <span class="evo-name-en">${node.nameEn}</span>
  `;
  return div;
}

function buildEvoArrowEl(details) {
  const div = document.createElement("div");
  div.className = "evo-arrow";
  div.innerHTML = `<span class="arrow-glyph">→</span><span>${translateEvoDetails(details)}</span>`;
  return div;
}

function translateEvoDetails(detailsArr) {
  if (!detailsArr || !detailsArr.length) return "";
  const d = detailsArr[0]; // usamos la primera condición si hay varias alternativas
  const parts = [];

  switch (d.trigger?.name) {
    case "level-up":
      if (d.min_level) parts.push(`Nivel ${d.min_level}`);
      if (d.min_happiness) parts.push("Felicidad alta");
      if (d.min_beauty) parts.push("Belleza alta");
      if (d.min_affection) parts.push("Cariño alto");
      if (d.time_of_day) parts.push(d.time_of_day === "day" ? "de día" : "de noche");
      if (d.known_move) parts.push(`sabiendo ${d.known_move.name.replace(/-/g," ")}`);
      if (d.known_move_type) parts.push(`con movimiento tipo ${d.known_move_type.name}`);
      if (d.location) parts.push(`en ${d.location.name.replace(/-/g," ")}`);
      if (d.held_item) parts.push(`con ${d.held_item.name.replace(/-/g," ")}`);
      if (d.needs_overworld_rain) parts.push("con lluvia");
      if (d.turn_upside_down) parts.push("consola al revés");
      if (!parts.length) parts.push("Subir de nivel");
      break;
    case "use-item":
      parts.push(`Usar ${d.item ? d.item.name.replace(/-/g," ") : "objeto"}`);
      break;
    case "trade":
      parts.push("Intercambio");
      if (d.held_item) parts.push(`con ${d.held_item.name.replace(/-/g," ")}`);
      if (d.trade_species) parts.push(`por ${d.trade_species.name}`);
      break;
    case "shed":
      parts.push("Hueco libre + Poké Ball libre");
      break;
    case "other":
      parts.push("Condición especial");
      break;
    default:
      parts.push(d.trigger?.name?.replace(/-/g," ") || "Condición especial");
  }
  return parts.join(" · ");
}

// =========================================================
// SETS COMPETITIVOS — datos de uso reales (Smogon Stats)
// https://www.smogon.com/stats/  (JSON abierto, sin API key)
//
// En vez de mostrar un único "top build", consultamos varios
// FORMATOS (OU, Ubers, UU, VGC, Monotype, etc.) y, para los más
// jugados, varios CORTES DE ELO (ladder general vs. ladder alto).
// Cada combinación formato+elo que tenga datos para el Pokémon es
// una fuente real de "la comunidad" distinta (jugadores distintos,
// contexto competitivo distinto) — no texto de nadie, solo números
// agregados. Buscamos hasta juntar 10+ fuentes; si el Pokémon no se
// usa en tantos formatos, mostramos las que existan y lo aclaramos.
//
// No hay backend/SQL: todo sale directo del navegador. Si tu
// navegador bloquea la respuesta por CORS, el bloque avisa en
// pantalla; la solución es un proxy propio (Cloudflare Worker /
// Netlify Function de ~5 líneas) delante de smogon.com/stats.
// =========================================================
const SMOGON_FORMATS = [
  { slug: "ou", label: "OU" },
  { slug: "ubers", label: "Ubers" },
  { slug: "uu", label: "UU" },
  { slug: "ru", label: "RU" },
  { slug: "nu", label: "NU" },
  { slug: "pu", label: "PU" },
  { slug: "zu", label: "ZU" },
  { slug: "lc", label: "LC" },
  { slug: "monotype", label: "Monotype" },
  { slug: "doublesou", label: "Doubles OU" },
  { slug: "nationaldex", label: "National Dex" },
  { slug: "nationaldexuu", label: "National Dex UU" },
  { slug: "1v1", label: "1v1" },
  { slug: "anythinggoes", label: "Anything Goes" },
  { slug: "cap", label: "CAP" },
  { slug: "balancedhackmons", label: "Balanced Hackmons" },
];
// Para los formatos más populosos sumamos un corte de elo alto además
// del general (0+), como si fuera "otra comunidad" (jugadores top).
const EXTRA_ELO_CUTOFFS = { ou: ["0", "1630"], ubers: ["0", "1630"], uu: ["0", "1500"] };
const MIN_BUILDS_TARGET = 10;

function lastMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function normalizeKey(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Encuentra el mes más reciente que Smogon ya publicó (probando OU-0 como sonda).
async function findWorkingMonth() {
  for (const month of lastMonths(4)) {
    try {
      const res = await fetch(`https://www.smogon.com/stats/${month}/chaos/gen9ou-0.json`);
      if (res.ok) return month;
    } catch { /* probamos el mes anterior */ }
  }
  return null;
}

function topN(obj, n) {
  return Object.entries(obj || {})
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v > 0)
    .slice(0, n);
}

// Recorre todos los formatos (y sus cortes de elo extra) buscando al Pokémon.
// Devuelve un array de "fuentes" crudas { format, label, cutoff, month, entry }.
async function gatherSmogonSources(pokemonName, month) {
  const target = normalizeKey(pokemonName);
  const sources = [];

  for (const fmt of SMOGON_FORMATS) {
    const cutoffs = EXTRA_ELO_CUTOFFS[fmt.slug] || ["0"];
    for (const cutoff of cutoffs) {
      const url = `https://www.smogon.com/stats/${month}/chaos/gen9${fmt.slug}-${cutoff}.json`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        const key = Object.keys(json.data || {}).find((k) => normalizeKey(k) === target);
        if (key) {
          sources.push({ format: fmt.slug, label: fmt.label, cutoff, month, entry: json.data[key] });
        }
      } catch {
        // formato bloqueado/inexistente para este mes: seguimos con el próximo
        continue;
      }
    }
    if (sources.length >= MIN_BUILDS_TARGET + 4) break; // ya juntamos de sobra
  }
  return sources;
}

async function translatedNature(natureName) {
  const key = natureName.toLowerCase();
  if (!natureCache.has(key)) {
    try { natureCache.set(key, await getJSON(`${API}/nature/${key}`)); }
    catch { natureCache.set(key, null); }
  }
  const data = natureCache.get(key);
  return data ? nameByLang(data.names, "es", natureName) : natureName;
}

async function translatedAbility(abilityDisplayName) {
  const key = abilityDisplayName.toLowerCase().replace(/\s+/g, "-");
  if (!abilityCache.has(key)) {
    try { abilityCache.set(key, await getJSON(`${API}/ability/${key}`)); }
    catch { abilityCache.set(key, null); }
  }
  const data = abilityCache.get(key);
  return data ? nameByLang(data.names, "es", abilityDisplayName) : abilityDisplayName;
}

// Devuelve nombre ES/EN + URL del ícono chiquito del ítem (sprites.default de PokéAPI).
async function translatedItem(itemDisplayName) {
  if (itemDisplayName === "Nothing" || !itemDisplayName) {
    return { es: "Ninguno", en: "—", icon: null };
  }
  const key = itemDisplayName.toLowerCase().replace(/\s+/g, "-").replace(/'/g, "");
  if (!itemCache.has(key)) {
    try { itemCache.set(key, await getJSON(`${API}/item/${key}`)); }
    catch { itemCache.set(key, null); }
  }
  const data = itemCache.get(key);
  return {
    es: data ? nameByLang(data.names, "es", itemDisplayName) : itemDisplayName,
    en: itemDisplayName,
    icon: data?.sprites?.default || null,
  };
}

async function translatedMove(moveDisplayName) {
  const key = moveDisplayName.toLowerCase().replace(/\s+/g, "-").replace(/'/g, "");
  const url = `${API}/move/${key}`;
  if (!moveCache.has(url)) {
    try { moveCache.set(url, await getJSON(url)); }
    catch { moveCache.set(url, null); }
  }
  const data = moveCache.get(url);
  return data ? nameByLang(data.names, "es", moveDisplayName) : moveDisplayName;
}

// Convierte una "fuente" cruda de Smogon en un build legible, ya con
// naturaleza/habilidad/ítem/movimientos traducidos.
async function buildFromSource(src) {
  const topAbility = topN(src.entry.Abilities, 1)[0];
  const topItem = topN(src.entry.Items, 1)[0];
  const topSpread = topN(src.entry.Spreads, 1)[0];
  const topMoves = topN(src.entry.Moves, 6); // 4 principales + 2 sustitutos

  const [natureRaw, evsRaw] = topSpread ? topSpread[0].split(":") : ["Hardy", "0/0/0/0/0/0"];
  const evs = evsRaw.split("/").map(Number);

  const [natureEs, abilityEs, itemInfo, movesEs] = await Promise.all([
    translatedNature(natureRaw),
    topAbility ? translatedAbility(topAbility[0]) : Promise.resolve(null),
    topItem ? translatedItem(topItem[0]) : Promise.resolve({ es: "—", en: "—", icon: null }),
    Promise.all(topMoves.map(([name]) => translatedMove(name))),
  ]);

  // Firma para detectar builds idénticos entre formatos (ej. mismo set en OU y Ubers)
  const signature = [natureRaw, topAbility?.[0], topItem?.[0], evsRaw, topMoves.map((m) => m[0]).join(",")].join("|");

  return {
    signature,
    sources: [src],
    natureRaw, natureEs,
    ability: topAbility ? { raw: topAbility[0], es: abilityEs, usage: topAbility[1] } : null,
    item: topItem ? { ...itemInfo, usage: topItem[1] } : { es: "—", en: "—", icon: null, usage: 0 },
    evs,
    moves: topMoves.map(([name, usage], i) => ({ raw: name, es: movesEs[i], usage })),
  };
}

function mergeDuplicateBuilds(builds) {
  const map = new Map();
  builds.forEach((b) => {
    if (map.has(b.signature)) {
      map.get(b.signature).sources.push(...b.sources);
    } else {
      map.set(b.signature, b);
    }
  });
  return [...map.values()];
}

const EV_LABELS = ["PS", "Ataque", "Defensa", "At. Esp.", "Def. Esp.", "Velocidad"];

function renderEvBarsHTML(evs) {
  return evs.map((val, i) => {
    const pct = Math.min(100, Math.round((val / 252) * 100));
    return `
      <div class="stat-row">
        <span class="stat-name">${EV_LABELS[i]}</span>
        <span class="stat-num">${val}</span>
        <span class="stat-bar"><span class="stat-bar-fill" style="width:${pct}%"></span></span>
      </div>`;
  }).join("");
}

function sourceLabel(s) {
  const eloTxt = s.cutoff === "0" ? "ladder general" : `ladder ${s.cutoff}+`;
  return `gen9${s.label} (${eloTxt})`;
}

function buildCardHTML(build, index) {
  const sourcesTxt = build.sources.map(sourceLabel).join(" · ");
  const monthTxt = build.sources[0].month;

  return `
    <article class="card build-card">
      <div class="build-header">
        <span class="build-index">#${index + 1}</span>
        <div>
          <p class="build-sources">${sourcesTxt}</p>
          <p class="build-credit">Créditos: comunidad competitiva vía <a href="https://www.smogon.com/stats/${monthTxt}/" target="_blank" rel="noopener">Smogon Stats</a>, snapshot ${monthTxt}</p>
        </div>
      </div>

      <div class="set-grid">
        <div class="set-item">
          <span class="set-label">Naturaleza</span>
          <span class="set-val">${build.natureEs}</span>
          <span class="set-val-en">EN: ${build.natureRaw}</span>
        </div>
        <div class="set-item">
          <span class="set-label">Habilidad</span>
          <span class="set-val">${build.ability ? build.ability.es : "—"}${build.ability ? `<span class="usage-pct">${(build.ability.usage*100).toFixed(0)}%</span>` : ""}</span>
          <span class="set-val-en">EN: ${build.ability ? build.ability.raw : "—"}</span>
        </div>
        <div class="set-item">
          <span class="set-label">Objeto</span>
          <span class="set-val">
            ${build.item.icon ? `<img class="item-icon" src="${build.item.icon}" alt="${build.item.es}" />` : ""}
            ${build.item.es}<span class="usage-pct">${(build.item.usage*100).toFixed(0)}%</span>
          </span>
          <span class="set-val-en">EN: ${build.item.en}</span>
        </div>
      </div>

      <div class="ev-bars">${renderEvBarsHTML(build.evs)}</div>

      <p class="section-title" style="margin-top:4px;">Moveset (4 principales + 2 sustitutos)</p>
      <div class="moveset-grid">
        ${build.moves.map((m, i) => `
          <div class="moveset-slot ${i >= 4 ? "substitute" : ""}">
            <span class="slot-tag">${i < 4 ? `Movimiento ${i+1}` : "Sustituto " + (i-3)}</span>
            <div class="move-name-es">${m.es}</div>
            <div class="move-name-en">EN: ${m.raw}</div>
            <div class="move-usage">${(m.usage*100).toFixed(0)}% de uso</div>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

async function renderCompetitiveSet(pokemon) {
  const wrap = $("#competitive-body");
  wrap.innerHTML = `<p class="status-line">Consultando estadísticas de uso en varios formatos (Smogon Stats)…</p>`;

  const month = await findWorkingMonth();
  if (!month) {
    wrap.innerHTML = `<p class="status-line">No pude contactar a smogon.com/stats (posible bloqueo por CORS de tu navegador). Ver consola para el detalle.</p>`;
    return;
  }

  let rawSources;
  try {
    rawSources = await gatherSmogonSources(pokemon.name, month);
  } catch (e) {
    rawSources = [];
  }

  if (!rawSources.length) {
    wrap.innerHTML = `<p class="status-line">
      No encontré estadísticas de uso recientes para este Pokémon en ninguno de los
      ${SMOGON_FORMATS.length} formatos consultados (probablemente casi no se usa
      en competitivo actual). Probá con un Pokémon más popular en OU/Ubers/VGC.
    </p>`;
    return;
  }

  wrap.innerHTML = `<p class="status-line">Armando ${rawSources.length} build(s) encontrados…</p>`;
  const builds = mergeDuplicateBuilds(await Promise.all(rawSources.map(buildFromSource)));
  // Ordenamos por cantidad de fuentes que coinciden (más "consenso" primero)
  builds.sort((a, b) => b.sources.length - a.sources.length);

  const countNote = builds.length >= MIN_BUILDS_TARGET
    ? `${rawSources.length} fuentes consultadas → ${builds.length} builds distintos.`
    : `Solo encontré ${rawSources.length} fuente(s) con datos para este Pokémon (menos de las ${MIN_BUILDS_TARGET} pedidas) — no se usa en más formatos competitivos con volumen suficiente ahora mismo.`;

  wrap.innerHTML = `
    <p class="status-line" style="margin-bottom:16px;">${countNote}</p>
    ${builds.map((b, i) => buildCardHTML(b, i)).join("")}
  `;
}

// =========================================================
// EVENTOS DE UI
// =========================================================
$("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  searchPokemon($("#search-input").value);
});

document.querySelectorAll(".chip-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("#search-input").value = btn.dataset.name;
    searchPokemon(btn.dataset.name);
  });
});

// Carga inicial de ejemplo
searchPokemon("charizard");
