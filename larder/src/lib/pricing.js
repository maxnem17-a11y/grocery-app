// ============================================================
// Pricing — receipt-driven price index + product-family taxonomy
// ============================================================
// Verbatim extraction of canonical index.html:
//   - PRODUCT_FAMILIES   L3703–3914  (~140 family regex rules)
//   - normaliseProductName L3916–3933
//   - PANTRY_KEYWORDS    L3937–3977  (loose Tesco-name → pantry-item table)
//   - findPantryMatch    L3978–3986
//   - extractPackSize    L4074–4084
//   - buildPriceIndex    L4086–4123
//   - lookupPriceForIngredient L4127–4156
//
// Step 7j-1. Used by SuggestedBasket (price-per-item suggestions
// for basket entries) and by computeRegularsAndGaps (family-based
// rollup of receipt items in gap-analysis.js).
//
// Notes on the median:
//   buildPriceIndex uses `sortedPrices[Math.floor(sortedPrices.length/2)]`
//   — the lower-median for even-length lists. Preserved verbatim;
//   not "fixed" to true median.
// ============================================================

import { lc } from "./text.js";

// Product-family taxonomy. Maps a Tesco product description to a generic
// "family" key like "peanut butter" or "salmon fillets", regardless of brand,
// pack size, or descriptor noise. The first matching pattern wins, so order
// matters — more specific patterns first.
//
// Each row: [family_key, regex|substring]. Family keys mirror pantry items
// where possible so cross-referencing is automatic.
const PRODUCT_FAMILIES = [
  // ----- DAIRY / CHEESE (specific cheeses before generic "cheese") -----
  ["mozzarella",            /\bmozzarella\b/],
  ["cheddar",               /\bcheddar\b/],
  ["parmesan",              /\bparmigiano|parmesan\b/],
  ["feta",                  /\bfeta\b/],
  ["paneer",                /\bpaneer\b/],
  ["boursin",               /\bboursin\b/],
  ["red leicester",         /\bred leicester\b/],
  ["cream cheese",          /cream cheese|cheese spread/],
  ["sliced cheese",         /\bcheese slices?\b/],
  ["greek yoghurt",         /(greek|skyr|fage|total)[^.]*yog(h)?urt/],
  ["yoghurt",               /\byog(h)?urt|oatgurt\b/],
  ["double cream",          /double cream|elmlea/],
  ["butter",                /\bunsalted butter|salted butter|stork|baking spread\b/],
  ["whole milk",            /whole milk|cravendale/],
  ["semi skimmed milk",     /semi[- ]skimmed/],
  ["skimmed milk",          /skimmed milk|skimmed longlife/],
  ["flavoured milk",        /flavoured milk/],
  ["oat milk",              /oat (milk|drink)|oatly(?! greek)/],
  ["soya milk",             /soya milk|soy milk|alpro soya|plenish.*soya/],
  ["almond milk",           /almond milk/],

  // ----- PROTEIN -----
  ["eggs",                  /\beggs?\b|happy egg/],
  ["salmon fillets",        /salmon fillets?/],
  ["sea bass",              /sea bass/],
  ["wild salmon",           /wild salmon/],
  ["salmon fishcakes",      /salmon[^.]*fishcakes?/],
  ["smoked salmon",         /smoked salmon/],
  ["mackerel",              /mackerel/],
  ["tuna",                  /\btuna\b/],
  ["sardines",              /sardines?/],
  ["anchovies",             /anchov/],
  ["prawns",                /\bprawns?|shrimp\b/],
  ["chicken breast",        /chicken breast|breast fillets?/],
  ["chicken thighs",        /chicken thigh/],
  ["chicken wings",         /chicken wings?/],
  ["chicken drumsticks",    /chicken drumsticks?|chicken legs/],
  ["whole chicken",         /whole chicken/],
  ["chicken mini fillets",  /chicken mini fillets?/],
  ["seekh kebab",           /seekh kebab/],
  ["chicken strips",        /chicken strips/],
  ["turkey",                /\bturkey\b/],
  ["beef",                  /\bbeef\b/],
  ["lamb",                  /\blamb\b/],
  ["bacon",                 /\bbacon\b/],
  ["firm tofu",             /(firm|extra-firm|extra firm|naked) tofu|tofoo|cauldron.*tofu/],
  ["silken tofu",           /silken tofu/],
  ["smoked tofu",           /smoked tofu/],
  ["tempeh",                /\btempeh\b/],
  ["plant burger",          /beyond burger|beyond smash|plant based pat/],
  ["veggie burger",         /caramelised onion burger|veggie burger/],
  ["vegan cheese",          /violife|vegan cheese/],

  // ----- FRESH PRODUCE -----
  ["lemons",                /\blemons?\b/],
  ["limes",                 /\blimes?\b/],
  ["bananas",               /\bbananas?\b/],
  ["apples",                /\bgala apples?|apples? \d+ pack|braeburn|pink lady|apple 6 pack|british apples/],
  ["oranges",               /\boranges?\b(?! and)/],
  ["easy peelers",          /easy peelers?|clementines?|jaffa easy/],
  ["blueberries",           /blueberr/],
  ["raspberries",           /raspberr/],
  ["strawberries",          /strawberr/],
  ["grapes",                /\bgrapes?\b/],
  ["mango",                 /\bmango\b(?! chutney|.*powder)/],
  ["pineapple",             /\bpineapple\b/],
  ["watermelon",            /watermelon/],
  ["melon",                 /cantaloupe|honeydew|\bmelon\b/],
  ["plums",                 /\bplums?\b/],
  ["pomegranate",           /pomegranate seeds|pomegranate\b/],
  ["cucumber",              /cucumber/],
  ["tomatoes",              /\btomatoes?\b(?!.*tinned|.*tin|.*chopped|.*puree|.*paste|.*sun[- ]dried)/],
  ["tinned tomatoes",       /(chopped|plum|polpa|tinned|italian chopped) tomatoes?/],
  ["tomato puree",          /tomato (puree|purée|paste)/],
  ["cherry tomatoes",       /cherry tomatoes|baby plum tomatoes|salad tomatoes/],
  ["courgettes",            /courgett/],
  ["aubergine",             /aubergin|eggplant/],
  ["mushrooms",             /mushroom/],
  ["red onion",             /red onions?/],
  ["onion",                 /\bbrown onions?|yellow onions?|\bonions?\b(?! ring)/],
  ["spring onions",         /spring onions?/],
  ["garlic",                /\bgarlic\b(?!.*bread|.*baguette)/],
  ["ginger",                /\bginger\b(?!.*tea|.*herbal|.*ale)/],
  ["chillies",              /finger chillies|birds-?eye chillies|red chillies|green chillies/],
  ["coriander",             /\bcoriander\b(?! seeds|.*powder)/],
  ["parsley",               /\bparsley\b/],
  ["mint",                  /\bmint\b(?! tea|.*herbal|.*chutney)/],
  ["basil",                 /\bbasil\b/],
  ["dill",                  /\bdill\b/],
  ["potatoes",              /potatoes?|maris piper|king edward|new potatoes|baby potatoes|baking potatoes|all rounder potatoes/],
  ["sweet potatoes",        /sweet potatoes?/],
  ["carrots",               /\bcarrots?\b/],
  ["broccoli",              /broccoli|tenderstem/],
  ["cauliflower",           /\bcauliflower\b/],
  ["spinach",               /\bspinach\b/],
  ["kale",                  /\bkale\b|cavolo nero/],
  ["lettuce",               /iceberg|butterhead|little gem|romaine|cos lettuce|salad leaves|mixed leaf|shredded iceberg/],
  ["peppers",               /\b(red|green|yellow|mixed) pepper|peppers? \d|nightingale.*peppers/],
  ["corn cobs",             /corn on the cob|corn cobs/],
  ["asparagus",             /\basparagus\b/],
  ["radishes",              /\bradish/],

  // ----- FROZEN VEG / AROMATICS -----
  ["frozen cauliflower",    /frozen cauliflower|cauliflower florets/],
  ["frozen butternut squash", /butternut squash chunks|frozen butternut/],
  ["frozen broccoli",       /frozen broccoli/],
  ["frozen spinach",        /frozen.*spinach|leaf spinach 900/],
  ["frozen carrots",        /sliced carrots peeled|frozen carrots/],
  ["frozen peppers",        /frozen pepper|sliced mixed frozen pepper/],
  ["frozen sweetcorn",      /mini corn on the cob/],
  ["frozen garlic",         /frozen.*garlic|chopped garlic/],
  ["frozen ginger",         /chopped ginger/],
  ["frozen red onion",      /frozen sliced red onion/],
  ["frozen peas",           /frozen pea|frozen garden pea/],
  ["frozen okra",           /\bokra\b|bhindi/],

  // ----- BAKERY / GRAINS / PASTA -----
  ["sourdough",             /sourdough/],
  ["ciabatta",              /ciabatt/],
  ["white bread",           /white bread|toastie bread|hovis|warburtons/],
  ["gluten free bread",     /gluten[- ]free.*bread|promise gluten/],
  ["bread rolls",           /bread rolls|burger buns|brioche buns?|baguette/],
  ["tortilla wraps",        /tortilla wraps?/],
  ["croissants",            /croissant|pain au chocolat/],
  ["pasta",                 /\bpasta\b|rigatoni|fettuccine|orzo/],
  ["spaghetti",             /spaghetti/],
  ["penne",                 /\bpenne\b/],
  ["fusilli (gluten free)", /free from fusilli|gluten[- ]free fusilli/],
  ["fusilli",               /\bfusilli\b/],
  ["noodles (udon)",        /\budon\b/],
  ["noodles (ramen)",       /\bramen\b/],
  ["noodles (soba)",        /\bsoba\b/],
  ["noodles (rice)",        /rice noodles?|rice vermicelli|vermicelli/],
  ["basmati rice",          /basmati rice|trophy.*rice|laila.*rice/],
  ["rice (other)",          /jasmine rice|sushi rice|long grain rice|brown rice|sticky rice/],
  ["quinoa",                /\bquinoa\b/],
  ["oats",                  /\boats?\b(?!\s*(milk|drink|bar))/],
  ["oat bars",              /oat bars?|flapjack|granola bars?|nature valley/],
  ["cereal",                /nutribrex|cereal\b/],

  // ----- CONDIMENTS / SAUCES / OILS -----
  ["soy sauce",             /soy sauce|kikkoman|tamari/],
  ["fish sauce",            /fish sauce/],
  ["hoisin sauce",          /hoisin/],
  ["oyster sauce",          /oyster sauce/],
  ["gochujang",             /gochujang/],
  ["miso",                  /\bmiso\b/],
  ["kimchi",                /\bkimchi\b/],
  ["sriracha",              /sriracha/],
  ["harissa",               /harissa/],
  ["peri peri sauce",       /peri[- ]?peri/],
  ["mayonnaise",            /mayonnaise|hellmann/],
  ["pesto",                 /\bpesto\b/],
  ["mustard",               /mustard\b(?! seeds)/],
  ["chutney (mango)",       /mango chutney/],
  ["honey",                 /\bhoney\b(?!.*tea)/],
  ["maple syrup",           /maple syrup/],
  ["balsamic vinegar",      /balsamic/],
  ["white wine vinegar",    /white wine vinegar/],
  ["rice vinegar",          /rice (wine )?vinegar/],
  ["apple cider vinegar",   /apple cider vinegar/],
  ["red wine vinegar",      /red wine vinegar/],
  ["olive oil",             /\bolive oil\b/],
  ["coconut oil",           /coconut oil/],
  ["sesame oil",            /sesame oil/],
  ["rapeseed oil",          /rapeseed oil/],
  ["sunflower oil",         /sunflower oil/],
  ["vegetable oil",         /vegetable oil/],

  // ----- TINS / DRY GOODS -----
  ["coconut milk",          /coconut milk|coconut cream|creamed coconut/],
  ["chickpeas (tinned)",    /chickpeas?/],
  ["kidney beans (tinned)", /kidney beans?/],
  ["black beans (tinned)",  /black beans?/],
  ["baked beans (tinned)",  /baked beans?/],
  ["cannellini beans",      /cannellini/],
  ["lentils",               /\blentils?\b/],
  ["sweetcorn (tin)",       /sweetcorn/],
  ["jackfruit",             /jackfruit/],
  ["cornflour",             /cornflour|corn flour/],
  ["plain flour",           /plain flour/],
  ["self-raising flour",    /self[- ]raising flour|self-raising/],
  ["sugar",                 /caster sugar|granulated sugar|brown sugar|icing sugar|muscovado|\bsugar\b/],

  // ----- NUTS / SEEDS / SPREADS -----
  ["peanut butter",         /peanut butter/],
  ["almond butter",         /almond butter/],
  ["cashew butter",         /cashew butter/],
  ["tahini",                /\btahini\b/],
  ["walnuts",               /\bwalnuts?\b/],
  ["pecans",                /\bpecans?\b/],
  ["pine nuts",             /\bpine nuts?\b/],
  ["cashews",               /\bcashews?\b/],
  ["almonds",               /\balmonds?\b/],
  ["chia seeds",            /chia seed/],
  ["sesame seeds",          /sesame seed/],
  ["pumpkin seeds",         /pumpkin seed/],
  ["sunflower seeds",       /sunflower seed/],

  // ----- DRINKS / TEA / COFFEE / SNACKS / NON-FOOD -----
  ["coffee",                /coffee beans?|ground coffee/],
  ["tea",                   /tea bags?|herbal tea|matcha|pukka/],
  ["chocolate",             /chocolate bar|lindt|ms molly|dark chocolate|milk chocolate(?!s)/],
  ["crisps",                /\bcrisps?\b|kettle|tortilla chips|pom[- ]bear|walkers/],
  ["biscuits",              /biscuits?|jeera|nankhatai|maryland|cookies?|jacob/],
  ["snack bars (kids)",     /kiddylicious|rice cake clouds|munchy stick/],
  ["fizzy drinks",          /coca[- ]cola|diet coke|fanta|capri[- ]sun|shloer|fruit shoot|rubicon/],
  ["juice",                 /apple juice|orange juice|squash\b/],
  ["water",                 /still water|sparkling water|highland spring/],
];

// Normalise a Tesco product name into a rough "product family" key —
// strips pack sizes, dagger marks, etc. The first matching PRODUCT_FAMILIES
// pattern wins; falls back to the cleaned name if nothing matched.
export function normaliseProductName(name) {
  // Strip dagger/leading marks, then try to match a product family.
  let n = (name || "").toLowerCase();
  n = n.replace(/^\s*[†‡*† ]+\s*/, "");
  n = n.replace(/\s+/g, " ").trim();
  for (const [family, pattern] of PRODUCT_FAMILIES) {
    if (pattern instanceof RegExp) {
      if (pattern.test(n)) return family;
    } else if (n.includes(pattern)) {
      return family;
    }
  }
  // Fallback: strip pack sizes and use what's left
  let cleaned = n;
  cleaned = cleaned.replace(/\b\d+\s*(g|kg|ml|l|cl|pack|x|pk|each)\b.*$/i, "");
  cleaned = cleaned.replace(/\b\d+\s*x\s*\d+.*$/i, "");
  return cleaned.replace(/\s+/g, " ").trim();
}

// Map a Tesco product name to a pantry item key, if any. Loose substring matching.
// Returns the pantry item label if matched, else null.
const PANTRY_KEYWORDS = [
  ["eggs",                    ["happy egg","eggs large","free range eggs"," egg "]],
  ["oat milk",                ["oat milk","oat drink"]],
  ["soya milk",               ["soya milk","alpro soya"]],
  ["soy sauce",               ["soy sauce","kikkoman"]],
  ["lemons",                  ["lemon"]],
  ["frozen cauliflower",      ["frozen cauliflower"]],
  ["frozen butternut squash", ["frozen butternut"]],
  ["frozen spinach",          ["frozen spinach"]],
  ["frozen peppers",          ["frozen pepper","sliced mixed frozen pepper"]],
  ["frozen garlic",           ["frozen garlic"]],
  ["frozen ginger",           ["frozen ginger"]],
  ["frozen peas",             ["frozen pea","frozen garden pea"]],
  ["sweetcorn (can)",         ["sweetcorn"]],
  ["cornflour",               ["cornflour","corn flour"]],
  ["coconut milk",            ["coconut milk"]],
  ["coconut oil",             ["coconut oil"]],
  ["mango chutney",           ["mango chutney"]],
  ["jackfruit chunks (can)",  ["jackfruit"]],
  ["mackerel (can)",          ["mackerel"]],
  ["tuna (can)",              ["tuna"]],
  ["black beans (can)",       ["black bean"]],
  ["baked beans (can)",       ["baked bean"]],
  ["gluten-free spaghetti",   ["gluten free spaghetti","gluten-free spaghetti"]],
  ["spaghetti",               ["spaghetti"]],
  ["penne",                   ["penne"]],
  ["quinoa",                  ["quinoa"]],
  ["buckwheat groats",        ["buckwheat"]],
  ["creamed coconut",         ["creamed coconut"]],
  ["silken tofu",             ["silken tofu"]],
  ["balsamic vinegar",        ["balsamic"]],
  ["potatoes",                ["maris piper","king edward","new potato","baby potato","baking potato"]],
  ["rice",                    ["basmati rice","jasmine rice","long grain rice","tilda rice","tesco rice","white rice","brown rice"]],
  ["red onion",               ["red onion"]],
  ["walnuts",                 ["walnut"]],
  ["pine nuts",               ["pine nut"]],
  ["chia seeds",              ["chia seed"]],
  ["pecans",                  ["pecan"]],
  ["sunflower seeds",         ["sunflower seed"]],
];

export function findPantryMatch(productName) {
  const n = (productName || "").toLowerCase();
  for (const [pantryItem, kws] of PANTRY_KEYWORDS) {
    for (const kw of kws) {
      if (n.includes(kw)) return pantryItem;
    }
  }
  return null;
}

// Extract a pack size string from a product name (e.g. "Tesco Boneless Salmon
// Fillets 4 Pack 520g" → "520g"). Returns the most specific size token found,
// or null.
export function extractPackSize(name) {
  if (!name) return null;
  const n = String(name);
  // Prefer weight/volume tokens (e.g. "520g", "1.5kg", "400ml", "1L"). Case-insensitive, allows decimals.
  const wt = n.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl)\b/i);
  if (wt) return `${wt[1]}${wt[2].toLowerCase()}`;
  // Pack-count tokens (e.g. "4 Pack", "6 Pack", "2X76g" already caught above).
  const pk = n.match(/(\d+)\s*(?:pack|x|each)\b/i);
  if (pk) return `${pk[1]} pack`;
  return null;
}

// Build a price index from Tesco order history. For each normalised product
// family, collect all (purchased, priced) instances and take the median total
// price as the expected per-pack price. The median is `sortedPrices[floor(n/2)]`
// — the lower median for even-length lists. Preserved verbatim from canonical.
export function buildPriceIndex(receipts) {
  const byFamily = new Map(); // family-key -> { unitPrices:[], orderQtys:[], sizes:Map<size,count> }
  for (const o of (receipts || [])) {
    for (const it of (o.items || [])) {
      if (it.status === "unavailable") continue;
      const k = normaliseProductName(it.name);
      if (!k) continue;
      if (!byFamily.has(k)) byFamily.set(k, { unitPrices: [], orderQtys: [], sizes: new Map() });
      const entry = byFamily.get(k);
      // Compute per-unit price: prefer the explicit unit_price_gbp, fall back to total / qty.
      const qty = (it.qty != null && it.qty > 0) ? it.qty : 1;
      let unitPrice = null;
      if (it.unit_price_gbp != null) unitPrice = it.unit_price_gbp;
      else if (it.total_price_gbp != null) unitPrice = it.total_price_gbp / qty;
      if (unitPrice != null) entry.unitPrices.push(unitPrice);
      if (it.qty != null && it.qty > 0) entry.orderQtys.push(it.qty);
      const size = extractPackSize(it.name);
      if (size) entry.sizes.set(size, (entry.sizes.get(size) || 0) + 1);
    }
  }
  const familyMedians = new Map();
  for (const [k, v] of byFamily) {
    if (!v.unitPrices.length) continue;
    const sortedPrices = v.unitPrices.slice().sort((a, b) => a - b);
    const unitMedian = sortedPrices[Math.floor(sortedPrices.length / 2)];
    // Typical qty: median qty across orders where this family was bought.
    let typicalQty = 1;
    if (v.orderQtys.length) {
      const sortedQtys = v.orderQtys.slice().sort((a, b) => a - b);
      typicalQty = sortedQtys[Math.floor(sortedQtys.length / 2)] || 1;
    }
    // Most-common size token
    let topSize = null, topSizeCount = 0;
    for (const [size, n] of v.sizes) if (n > topSizeCount) { topSize = size; topSizeCount = n; }
    familyMedians.set(k, { unitMedian, sample: v.unitPrices.length, typicalQty, packSize: topSize });
  }
  return familyMedians;
}

// Loose lookup: given a free-form ingredient name (from a recipe), try to
// find a matching Tesco family price. Returns
// { unitGbp, totalGbp, packSize, typicalQty, source, matchedFamily } or null.
export function lookupPriceForIngredient(name, priceIndex) {
  if (!name) return null;
  const n = lc(name);
  const wrap = (info, family, source) => ({
    unitGbp: info.unitMedian,
    totalGbp: info.unitMedian * info.typicalQty,
    packSize: info.packSize,
    typicalQty: info.typicalQty,
    matchedFamily: family,
    source,
  });
  // 1) Direct family-key match
  const direct = normaliseProductName(name);
  if (direct && priceIndex.has(direct)) {
    return wrap(priceIndex.get(direct), direct, "direct");
  }
  // 2) Substring match against family keys (best-fit by length of overlap)
  let best = null;
  for (const [fam, info] of priceIndex) {
    if (n.includes(fam) || fam.includes(n)) {
      const overlap = Math.min(n.length, fam.length);
      if (!best || overlap > best.overlap) best = { fam, info, overlap };
    }
  }
  if (best) return wrap(best.info, best.fam, "fuzzy");
  return null;
}
