/* =========================================================================
   storage.js
   Capa de datos de la aplicación. Todo se guarda en localStorage del
   navegador (no hay servidor ni base de datos externa: item 15/26 del
   encargo). Si en el futuro el volumen de datos creciera mucho (miles de
   presupuestos con fotos, por ejemplo) se podría migrar esto a IndexedDB
   sin tocar el resto de la app: alcanza con reescribir las funciones de
   este archivo, ya que app.js solo usa la API de "DB" de más abajo.
   ========================================================================= */

const DB_KEYS = {
  config: 'presu_config',
  categories: 'presu_categories',
  catalog: 'presu_catalog',
  budgets: 'presu_budgets',
  draft: 'presu_draft'
};

const DEFAULT_CATEGORIES = [
  'Albañilería', 'Aberturas', 'Revoque grueso', 'Revoque fino', 'Carpeta',
  'Piso cerámico', 'Contrapiso', 'Hormigón', 'Techo', 'Pintura', 'Demolición', 'Otros'
];

const DEFAULT_CONDITIONS =
`Presupuesto válido por 15 días.
Materiales no incluidos, salvo que se indique lo contrario.
El precio puede variar según modificaciones solicitadas durante la obra.
Forma de pago a convenir.`;

function defaultConfig(){
  return {
    companyName: '',
    phone: '',
    locality: '',
    logo: '', // dataURL base64
    conditionsTemplate: DEFAULT_CONDITIONS
  };
}

// Catálogo de ejemplo, basado en trabajos habituales de albañilería,
// para que la aplicación se pueda probar de entrada. Se puede editar
// o eliminar libremente desde la sección "Precios".
function defaultCatalog(){
  return [
    { id: uid(), category: 'Albañilería', name: 'Mampostería ladrillo cerámico 12 (planta alta)', description: 'Mampostería con ladrillo cerámico hueco del 12 en planta alta', unit: 'm²', price: 12000 },
    { id: uid(), category: 'Aberturas', name: 'Ventana de aluminio', description: 'Provisión y colocación de ventana de aluminio', unit: 'unidad', price: 250000 },
    { id: uid(), category: 'Aberturas', name: 'Paño fijo', description: 'Provisión y colocación de paño fijo de aluminio', unit: 'unidad', price: 180000 },
    { id: uid(), category: 'Aberturas', name: 'Ventiluz', description: 'Provisión y colocación de ventiluz', unit: 'unidad', price: 90000 },
    { id: uid(), category: 'Revoque grueso', name: 'Revoque exterior impermeabilizado y bolseado', description: 'Revoque grueso exterior impermeabilizado, terminación bolseada', unit: 'm²', price: 9500 },
    { id: uid(), category: 'Revoque fino', name: 'Revoque interior', description: 'Revoque fino interior a la cal', unit: 'm²', price: 8000 },
    { id: uid(), category: 'Carpeta', name: 'Carpeta de nivelación', description: 'Carpeta de nivelación para colocación de cerámico', unit: 'm²', price: 5500 },
    { id: uid(), category: 'Piso cerámico', name: 'Piso cerámico con colocación de zócalo', description: 'Provisión y colocación de piso cerámico, incluye zócalo', unit: 'm²', price: 18000 },
    { id: uid(), category: 'Revoque fino', name: 'Revestimiento baño completo', description: 'Colocación de revestimiento cerámico en baño completo', unit: 'm²', price: 16000 },
    { id: uid(), category: 'Demolición', name: 'Picado, carga y retiro de chapa', description: 'Picado, carga y retiro de escombros de chapa', unit: 'm²', price: 4500 }
  ];
}

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function readJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(raw === null) return fallback;
    return JSON.parse(raw);
  }catch(e){
    console.error('Error leyendo', key, e);
    return fallback;
  }
}

function writeJSON(key, value){
  try{
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }catch(e){
    console.error('Error guardando', key, e);
    return false;
  }
}

const DB = {
  // ---------------- Configuración de la empresa ----------------
  getConfig(){
    return Object.assign(defaultConfig(), readJSON(DB_KEYS.config, {}));
  },
  saveConfig(cfg){
    return writeJSON(DB_KEYS.config, cfg);
  },

  // ---------------- Categorías / tipos de trabajo ----------------
  getCategories(){
    const cats = readJSON(DB_KEYS.categories, null);
    if(cats === null){
      writeJSON(DB_KEYS.categories, DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES.slice();
    }
    return cats;
  },
  saveCategories(cats){
    return writeJSON(DB_KEYS.categories, cats);
  },
  addCategory(name){
    const cats = this.getCategories();
    if(!cats.includes(name)){
      cats.push(name);
      this.saveCategories(cats);
    }
    return cats;
  },
  removeCategory(name){
    const cats = this.getCategories().filter(c => c !== name);
    this.saveCategories(cats);
    return cats;
  },

  // ---------------- Catálogo de precios ----------------
  getCatalog(){
    const cat = readJSON(DB_KEYS.catalog, null);
    if(cat === null){
      const def = defaultCatalog();
      writeJSON(DB_KEYS.catalog, def);
      return def;
    }
    return cat;
  },
  saveCatalog(items){
    return writeJSON(DB_KEYS.catalog, items);
  },
  upsertCatalogItem(item){
    const items = this.getCatalog();
    const idx = items.findIndex(i => i.id === item.id);
    if(idx >= 0) items[idx] = item; else items.push(item);
    this.saveCatalog(items);
    return items;
  },
  deleteCatalogItem(id){
    const items = this.getCatalog().filter(i => i.id !== id);
    this.saveCatalog(items);
    return items;
  },

  // ---------------- Presupuestos ----------------
  getBudgets(){
    return readJSON(DB_KEYS.budgets, []);
  },
  saveBudgets(list){
    return writeJSON(DB_KEYS.budgets, list);
  },
  upsertBudget(budget){
    const list = this.getBudgets();
    const idx = list.findIndex(b => b.id === budget.id);
    if(idx >= 0) list[idx] = budget; else list.unshift(budget);
    this.saveBudgets(list);
    return list;
  },
  deleteBudget(id){
    const list = this.getBudgets().filter(b => b.id !== id);
    this.saveBudgets(list);
    return list;
  },
  getBudget(id){
    return this.getBudgets().find(b => b.id === id) || null;
  },

  // ---------------- Borrador (autoguardado) ----------------
  getDraft(){
    return readJSON(DB_KEYS.draft, null);
  },
  saveDraft(draft){
    return writeJSON(DB_KEYS.draft, draft);
  },
  clearDraft(){
    localStorage.removeItem(DB_KEYS.draft);
  },

  // ---------------- Backup completo ----------------
  exportBackup(){
    return {
      _app: 'presupuestos-albanileria',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      config: this.getConfig(),
      categories: this.getCategories(),
      catalog: this.getCatalog(),
      budgets: this.getBudgets()
    };
  },
  importBackup(data){
    if(!data || typeof data !== 'object') throw new Error('Archivo inválido');
    if(data.config) this.saveConfig(data.config);
    if(Array.isArray(data.categories)) this.saveCategories(data.categories);
    if(Array.isArray(data.catalog)) this.saveCatalog(data.catalog);
    if(Array.isArray(data.budgets)) this.saveBudgets(data.budgets);
    return true;
  }
};

/* =========================================================================
   FORMATO ARGENTINO
   ========================================================================= */

// Redondea a centavos para evitar errores de coma flotante en los cálculos.
function round2(n){
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// $ 1.234.567,89  (punto de miles, coma decimal)
function formatMoney(value){
  const n = round2(Number(value) || 0);
  const parts = n.toFixed(2).split('.');
  let intPart = parts[0].replace('-', '');
  const dec = parts[1];
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = n < 0 ? '-' : '';
  return `${sign}$ ${intPart},${dec}`;
}

// Convierte texto ingresado por el usuario ("1.234,56" o "1234.56" o "1234,56")
// a un número JS válido.
function parseMoneyInput(str){
  if(typeof str === 'number') return str;
  if(!str) return 0;
  let s = String(str).trim();
  // Si tiene coma, asumimos formato argentino: punto=miles, coma=decimal
  if(s.includes(',')){
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// dd/mm/yyyy a partir de un input type=date (yyyy-mm-dd) o de un objeto Date
function formatDateAR(isoOrDate){
  let d;
  if(isoOrDate instanceof Date) d = isoOrDate;
  else if(typeof isoOrDate === 'string' && isoOrDate.includes('-')){
    const [y, m, day] = isoOrDate.split('-').map(Number);
    d = new Date(y, m - 1, day);
  }else{
    d = new Date(isoOrDate);
  }
  if(isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function todayISO(){
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
