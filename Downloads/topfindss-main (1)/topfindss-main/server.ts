import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
dotenv.config(); // Load before everything 

import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("SUPABASE_URL e SUPABASE_ANON_KEY precisam estar configurados no .env");
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

async function startServer() {
  const app = express();
  app.use(express.json());

  // Auth Middleware
  const authenticate = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);

      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, is_admin')
        .eq('id', decoded.id)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: "User not found" });
      }
      req.user = user;
      next();
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user || req.user.is_admin !== 1) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    next();
  };

  // API Routes
  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).single();
    if (error || !user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin === 1 } });
  });

  app.post("/api/register", async (req, res) => {
    const { name, email, password } = req.body;
    try {
      const { data: valUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
      if (valUser) return res.status(400).json({ error: "E-mail já cadastrado" });

      const hashedPassword = bcrypt.hashSync(password, 10);
      const { data: result, error } = await supabase
        .from('users')
        .insert([{ name, email, password: hashedPassword, is_admin: 0 }])
        .select()
        .single();

      if (error) throw error;

      const token = jwt.sign({ id: result.id }, JWT_SECRET, { expiresIn: "1d" });
      res.json({ token, user: { id: result.id, name, email, is_admin: false } });
    } catch (e) {
      res.status(400).json({ error: "Erro ao registrar usuário" });
    }
  });

  app.get("/api/auth/me", authenticate, async (req: any, res) => {
    const { data: user, error } = await supabase.from('users').select('id, name, email, is_admin').eq('id', req.user.id).single();
    if (error || !user) return res.status(404).json({ error: "User not found" });
    res.json({ user: { ...user, is_admin: user.is_admin === 1 } });
  });

  // Users Management (Admin Only)
  app.get("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
    const { data: users, error } = await supabase.from('users').select('id, name, email, is_admin').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: "Failed to fetch users" });
    res.json(users);
  });

  app.post("/api/admin/users/:id/toggle-admin", authenticate, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { is_admin } = req.body;

    // Prevent removing master admin
    if (Number(id) === 1 || is_admin === false) {
      const { data: user } = await supabase.from('users').select('email').eq('id', id).single();
      if (user && user.email === "topfinds.dj2@gmail.com") {
        return res.status(400).json({ error: "Cannot modify access for master admin" });
      }
    }

    const { error } = await supabase.from('users').update({ is_admin: is_admin ? 1 : 0 }).eq('id', id);
    if (error) return res.status(500).json({ error: "Update failed" });
    res.json({ success: true });
  });

  app.post("/api/admin/users/create", authenticate, requireAdmin, async (req, res) => {
    const { name, email, password } = req.body;
    try {
      const { data: valUser } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      if (valUser) return res.status(400).json({ error: "E-mail já está em uso" });

      const hashedPassword = bcrypt.hashSync(password, 10);
      const { error } = await supabase.from('users').insert([{ name, email, password: hashedPassword, is_admin: 1 }]);
      if (error) throw error;

      res.status(201).json({ message: "Administrador criado com sucesso" });
    } catch (e) {
      res.status(400).json({ error: "Erro ao criar novo administrador" });
    }
  });

  // Categories & Subcategories
  // Categories & Subcategories
  app.get("/api/categories", async (req, res) => {
    const { data: cats, error: catError } = await supabase.from('categories').select('*');
    if (catError) return res.status(500).json({ error: "Failed to fetch categories" });

    const { data: subcats, error: subError } = await supabase.from('subcategories').select('*').order('order_index', { ascending: true });
    if (subError) return res.status(500).json({ error: "Failed to fetch subcategories" });

    const result = cats.map((cat: any) => ({
      ...cat,
      subcategories: subcats.filter((sub: any) => sub.category_id === cat.id)
    }));
    res.json(result);
  });

  app.post("/api/categories", authenticate, requireAdmin, async (req, res) => {
    const { name } = req.body;
    try {
      const { data, error } = await supabase.from('categories').insert([{ name }]).select().single();
      if (error) throw error;
      res.json({ id: data.id });
    } catch (e) {
      res.status(400).json({ error: "Category already exists" });
    }
  });

  app.put("/api/categories/:id", authenticate, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const { error } = await supabase.from('categories').update({ name }).eq('id', id);
    if (error) return res.status(400).json({ error: "Update failed" });
    res.json({ success: true });
  });

  app.delete("/api/categories/:id", authenticate, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) return res.status(400).json({ error: "Delete failed" });
    res.json({ success: true });
  });

  app.post("/api/subcategories", authenticate, requireAdmin, async (req, res) => {
    const { name, category_id } = req.body;
    try {
      const { data: maxOrder } = await supabase
        .from('subcategories')
        .select('order_index')
        .eq('category_id', category_id)
        .order('order_index', { ascending: false })
        .limit(1)
        .single();

      const nextOrder = (maxOrder?.order_index || 0) + 1;

      const { data, error } = await supabase
        .from('subcategories')
        .insert([{ name, category_id, order_index: nextOrder }])
        .select()
        .single();

      if (error) throw error;
      res.json({ id: data.id });
    } catch (e) {
      res.status(400).json({ error: "Subcategory already exists in this category" });
    }
  });

  app.post("/api/subcategories/reorder", authenticate, requireAdmin, async (req, res) => {
    const { subcategories } = req.body; // Array of { id, order_index }

    // Supabase does not have true batch update, so we map update promises
    const updates = subcategories.map((item: any) =>
      supabase.from('subcategories').update({ order_index: item.order_index }).eq('id', item.id)
    );

    await Promise.all(updates);
    res.json({ success: true });
  });

  app.put("/api/subcategories/:id", authenticate, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const { error } = await supabase.from('subcategories').update({ name }).eq('id', id);
    if (error) return res.status(400).json({ error: "Update failed" });
    res.json({ success: true });
  });

  app.delete("/api/subcategories/:id", authenticate, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('subcategories').delete().eq('id', id);
    if (error) return res.status(400).json({ error: "Delete failed" });
    res.json({ success: true });
  });

  // Products
  app.get("/api/products", async (req, res) => {
    const { category, subcategory, featured, search } = req.query;

    let query = supabase
      .from('products')
      .select('*, categories(name), subcategories(name)')
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category_id', category);
    if (subcategory) query = query.eq('subcategory_id', subcategory);
    if (featured === "true") query = query.eq('featured', 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,keywords.ilike.%${search}%`);
    }

    const { data: products, error } = await query;
    if (error) return res.status(500).json({ error: "Failed to fetch products" });

    // Format top match SQLite structure "category_name" & "subcategory_name"
    const formatted = products.map((p: any) => ({
      ...p,
      category_name: p.categories?.name,
      subcategory_name: p.subcategories?.name
    }));

    res.json(formatted);
  });

  app.post("/api/products", authenticate, requireAdmin, async (req, res) => {
    const { name, description, image, price, price_original, keywords, link_afiliado, category_id, subcategory_id, featured, tag_label, tag_color } = req.body;

    const { data: result, error } = await supabase
      .from('products')
      .insert([{
        name, description, image, price, price_original, keywords, link_afiliado, category_id, subcategory_id, featured: featured ? 1 : 0, tag_label, tag_color
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: "Failed to save product" });
    res.json({ id: result.id });
  });

  app.put("/api/products/:id", authenticate, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, image, price, price_original, keywords, link_afiliado, category_id, subcategory_id, featured, tag_label, tag_color } = req.body;

    const { error } = await supabase
      .from('products')
      .update({ name, description, image, price, price_original, keywords, link_afiliado, category_id, subcategory_id, featured: featured ? 1 : 0, tag_label, tag_color })
      .eq('id', id);

    if (error) return res.status(500).json({ error: "Update failed" });
    res.json({ success: true });
  });

  app.delete("/api/products/:id", authenticate, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) return res.status(500).json({ error: "Delete failed" });
    res.json({ success: true });
  });

  // Web Scraping
  app.post("/api/admin/scrape", authenticate, requireAdmin, async (req, res) => {
    const { url, categories } = req.body;
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      const html = response.data;
      const $ = cheerio.load(html);

      let title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
      let description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
      let image = $('meta[property="og:image"]').attr('content') || '';

      if (url.includes('amazon')) {
        let amzImage = $('#landingImage').attr('src') || $('img[data-a-dynamic-image]').first().attr('src');
        if (!amzImage) {
          const dynamicImageStr = $('#landingImage').attr('data-a-dynamic-image');
          if (dynamicImageStr) {
            try {
              const imagesObj = JSON.parse(dynamicImageStr);
              amzImage = Object.keys(imagesObj)[0];
            } catch (e) { }
          }
        }
        if (amzImage) image = amzImage;
      }

      let price = 0;
      let price_original = 0;

      const extractPriceFast = (text: string) => {
        if (!text) return 0;
        let raw = text.replace(/[^\d,\.]/g, '');
        if (!raw.includes(',') && raw.includes('.')) {
          return parseFloat(raw);
        }
        raw = raw.replace(/\./g, '').replace(',', '.');
        const finalVal = parseFloat(raw);
        return isNaN(finalVal) ? 0 : finalVal;
      };

      // Extract price heuristics
      try {
        if (url.includes('amazon')) {
          const priceStr = $('.priceToPay .a-offscreen').first().text() || $('.a-price .a-offscreen').first().text() || $('.a-color-price').first().text();
          price = extractPriceFast(priceStr);

          if (price === 0) {
            const whole = $('.a-price-whole').first().text().replace(/[.,]/g, '');
            const fraction = $('.a-price-fraction').first().text();
            if (whole && fraction) {
              price = parseFloat(`${whole}.${fraction}`);
            } else if (whole) {
              price = parseFloat(whole);
            }
          }
          const origPriceStr = $('.basisPrice .a-offscreen').first().text() || $('.a-text-price .a-offscreen').first().text();
          price_original = extractPriceFast(origPriceStr);
        } else if (url.includes('mercadolivre') || url.includes('mlb')) {
          const priceStr = $('.ui-pdp-price__second-line .andes-money-amount__fraction').first().text() || $('meta[itemprop="price"]').attr('content') || '';
          price = parseFloat(priceStr.replace(/\./g, ''));
          const origPriceStr = $('.ui-pdp-price__original-value .andes-money-amount__fraction').first().text() || '';
          price_original = parseFloat(origPriceStr.replace(/\./g, ''));
        } else if (url.includes('shopee')) {
          const priceStr = $('.items-center .text-orange-500').text() || $('div[class*="price"]').first().text();
          price = extractPriceFast(priceStr);
        } else if (url.includes('aliexpress')) {
          const priceStr = $('.product-price-value').text() || $('.pdp-info-right .price--currentPriceText--V8_y_b5').text();
          price = extractPriceFast(priceStr);
        }
      } catch (e) {
        console.error("Price parsing error", e);
      }

      let keywords = '';
      let category_id = '';
      let subcategory_id = '';
      let marketplace = '';

      const bodyText = $('body').text().substring(0, 2000).replace(/\s+/g, ' ');
      const content = (title + " " + description).toLowerCase();

      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
          const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
          
          const prompt = `Analise os dados extraídos de uma página de produto e retorne as informações estruturadas em JSON.

IMPORTANTE: Se a página parecer ser um BOT PROTECTION, CAPTCHA, ACESSO NEGADO ou não contiver dados de um produto real, retorne: {"error": "blocked"}

Título da Página: ${title}
Descrição Meta: ${description.substring(0, 300)}
URL: ${url}
Texto parcial da página: ${bodyText.substring(0, 1000)}

Categorias e Subcategorias do nosso sistema (use APENAS esses IDs):
${categories ? JSON.stringify(categories.map((c: any) => ({ id: c.id, name: c.name, subcategories: c.subcategories?.map((s: any) => ({ id: s.id, name: s.name })) }))) : 'Nenhuma'}

Regras de Retorno:
1. Retorne ESTREITAMENTE um código JSON válido, sem blocos de código markdown.
2. "name": Nome amigável e limpo do produto (máximo 100 caracteres).
3. "price": Valor numérico do preço atual. Se não encontrar, use o valor detectado ${price}.
4. "price_original": Valor numérico do preço "DE" (original). Se não encontrar, use ${price_original || price}.
5. "marketplace": Nome da loja (ex: Amazon, Shopee, Mercado Livre, AliExpress, Magalu, etc).
6. "keywords": 6 a 8 palavras-chave (sinônimos), separados por vírgula.
7. "category_id": ID da categoria correta.
8. "subcategory_id": ID da subcategoria correta.
9. "description": Breve resumo (máximo 500 caracteres).

Exemplo de retorno esperado:
{"name": "iPhone 15 Pro", "price": 7500.00, "price_original": 8200.00, "marketplace": "Amazon", "keywords": "celular, smartphone, apple", "category_id": "1", "subcategory_id": "5", "description": "Resumo..."}`;

          const result = await model.generateContent(prompt);
          const aiResult = JSON.parse(result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim());
          
          if (aiResult.error === 'blocked') {
            throw new Error("Bot protection detected by AI");
          }

          if (aiResult.name && aiResult.name !== marketplace) title = aiResult.name;
          if (aiResult.description) description = aiResult.description;
          if (aiResult.price) price = aiResult.price;
          if (aiResult.price_original) price_original = aiResult.price_original;
          if (aiResult.marketplace) marketplace = aiResult.marketplace;
          if (aiResult.keywords) keywords = aiResult.keywords;
          if (aiResult.category_id) category_id = aiResult.category_id.toString();
          if (aiResult.subcategory_id) subcategory_id = aiResult.subcategory_id.toString();
        } catch (e) {
          console.error("Gemini AI failed, using fallback:", e);
        }
      }

      // Marketplace detection fallback
      if (!marketplace) {
        if (url.includes('amazon')) marketplace = 'Amazon';
        else if (url.includes('mercadolivre') || url.includes('mlb')) marketplace = 'Mercado Livre';
        else if (url.includes('shopee')) marketplace = 'Shopee';
        else if (url.includes('aliexpress')) marketplace = 'AliExpress';
        else marketplace = 'Loja Online';
      }

      // Robust Category Fallback matching
      if ((!category_id || !subcategory_id) && categories && Array.isArray(categories)) {
        const fullContent = (title + " " + description + " " + url).toLowerCase();

        // Tech Detect
        if (fullContent.match(/gamer|pc |notebook|smartphone|eletrônico|celular|playstation|xbox|fone|headset|hardware/)) {
          const techCat = categories.find((c: any) => c.name.toLowerCase().match(/tech|tecnologia/));
          if (techCat) {
            category_id = techCat.id.toString();
            if (fullContent.match(/mouse|teclado|headset|periférico/)) subcategory_id = techCat.subcategories?.find((s: any) => s.name.toLowerCase().includes('periférico'))?.id?.toString();
            else if (fullContent.match(/processador|placa|ssd|memória/)) subcategory_id = techCat.subcategories?.find((s: any) => s.name.toLowerCase().includes('hardware'))?.id?.toString();
            else if (fullContent.match(/ps5|xbox|nintendo|jogo|game/)) subcategory_id = techCat.subcategories?.find((s: any) => s.name.toLowerCase().includes('game'))?.id?.toString();
          }
        }
        // Fashion Detect
        else if (fullContent.match(/camisa|tênis|calça|vestido|roupa|moda|calçado/)) {
          const modaCat = categories.find((c: any) => c.name.toLowerCase().match(/moda|fashion/));
          if (modaCat) {
            category_id = modaCat.id.toString();
            if (fullContent.match(/tênis|sapato|sneaker/)) subcategory_id = modaCat.subcategories?.find((s: any) => s.name.toLowerCase().includes('tênis'))?.id?.toString();
          }
        }

        // Final desperate attempt at exact matching
        if (!category_id) {
          for (const cat of categories) {
            if (fullContent.includes(cat.name.toLowerCase())) {
              category_id = cat.id.toString();
              break;
            }
          }
        }
      }

      // Final check: if title is just the marketplace name, it's probably a failed scrape
      if (title.trim() === marketplace && price === 0) {
        throw new Error("Scrape resulted in marketplace name only and 0 price - likely blocked.");
      }

      res.json({
        name: title.trim().substring(0, 100),
        description: description.trim().substring(0, 500),
        image,
        price,
        price_original,
        keywords,
        marketplace,
        category_id,
        subcategory_id
      });
    } catch (e) {
      console.error("Scrape error:", e);
      res.status(500).json({ error: "Falha ao extrair dados do link." });
    }
  });

  // Click Tracking
  app.post("/api/products/:id/click", async (req, res) => {
    const { id } = req.params;

    // Increment clicks using rpc or two queries
    // Usually Supabase recommends RPC for increment: `CREATE OR REPLACE FUNCTION increment_click(row_id bigint) RETURNS void...`
    // Alternatively, fetch and update:
    const { data } = await supabase.from('products').select('clicks').eq('id', id).single();
    if (data) {
      await supabase.from('products').update({ clicks: (data.clicks || 0) + 1 }).eq('id', id);
    }

    await supabase.from('clicks_log').insert([{ product_id: id }]);

    res.json({ success: true });
  });

  // Stats
  // Since complex aggregations with dynamic WHEREs are hard with pure PostgREST (Supabase Client),
  // we will fetch necessary data and aggregate in JS for simplicity, or use simple counts.
  app.get("/api/stats", authenticate, async (req, res) => {
    const { start, end, category_id, subcategory_id } = req.query;

    // 1. Total Products Count
    let productsQuery = supabase.from('products').select('id', { count: 'exact', head: true });
    if (category_id) productsQuery = productsQuery.eq('category_id', category_id);
    if (subcategory_id) productsQuery = productsQuery.eq('subcategory_id', subcategory_id);
    const { count: totalProducts } = await productsQuery;

    // 2. Fetch Clicks Log for total clicks and top products aggregation
    let clicksQuery = supabase
      .from('clicks_log')
      .select('product_id, products!inner(id, name, category_id, subcategory_id)');

    if (start) clicksQuery = clicksQuery.gte('created_at', start);
    if (end) clicksQuery = clicksQuery.lte('created_at', end);
    if (category_id) clicksQuery = clicksQuery.eq('products.category_id', category_id);
    if (subcategory_id) clicksQuery = clicksQuery.eq('products.subcategory_id', subcategory_id);

    const { data: clicksData, error: clicksError } = await clicksQuery;

    if (clicksError) return res.status(500).json({ error: "Failed to load stats" });

    const totalClicks = clicksData.length;

    // Aggregate Top Products in memory
    const productCounts: Record<string, { name: string, clicks: number }> = {};

    clicksData.forEach((click: any) => {
      const pid = click.product_id;
      if (!productCounts[pid]) {
        productCounts[pid] = { name: click.products.name, clicks: 0 };
      }
      productCounts[pid].clicks++;
    });

    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5);

    res.json({
      totalProducts: totalProducts || 0,
      totalClicks: totalClicks,
      topProducts
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
