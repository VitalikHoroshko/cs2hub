const express = require("express");
const path = require("path");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
require("dotenv").config();

const db = require("./database/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "cs2hub_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

const uploadsPath = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "-");
    cb(null, safeName);
  },
});

const upload = multer({ storage });

function renderPage(res, view, data = {}) {
  res.render(view, {
    currentPath: res.req.path,
    isAdmin: res.req.session && res.req.session.isAdmin,
    title: "CS2HUB",
    description: "CS2HUB - Best CS2 guides, pro settings, news, and top lists.",
    searchQuery: "",
    ...data,
  });
}

function isAuth(req) {
  return req.session && req.session.isAdmin;
}

async function dbAll(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows;
}

async function dbGet(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0];
}

async function dbRun(sql, params = []) {
  return await db.query(sql, params);
}

async function renderCategoryPage(req, res, options) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const perPage = 6;

    const totalRow = await dbGet(
      "SELECT COUNT(*)::int as count FROM posts WHERE category = $1",
      [options.category]
    );

    const totalPosts = totalRow?.count || 0;
    const totalPages = Math.max(Math.ceil(totalPosts / perPage), 1);

    const safePage = Math.min(page, totalPages);
    const safeOffset = (safePage - 1) * perPage;

    const rows = await dbAll(
      "SELECT * FROM posts WHERE category = $1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      [options.category, perPage, safeOffset]
    );

    renderPage(res, "pages/category", {
      title: options.title,
      description: options.description,
      posts: rows,
      currentPage: safePage,
      totalPages,
      baseUrl: options.baseUrl,
    });
  } catch (err) {
    console.error(err);
    res.send("Database error");
  }
}

// HOME
app.get("/", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM posts ORDER BY id DESC");

    const featuredPost = rows.find((p) => p.featured === true) || rows[0] || null;
    const latestPosts = featuredPost
      ? rows.filter((p) => p.id !== featuredPost.id).slice(0, 4)
      : [];

    renderPage(res, "pages/home", {
      title: "CS2HUB - Best CS2 Guides",
      description:
        "CS2HUB brings you the best CS2 guides, pro settings, FPS tips, crosshair codes, and the latest news.",
      featuredPost,
      latestPosts,
    });
  } catch (err) {
    console.error(err);
    res.send("Database error");
  }
});

// CATEGORY PAGES
app.get("/guides", async (req, res) => {
  await renderCategoryPage(req, res, {
    category: "guides",
    title: "CS2 Guides - CS2HUB",
    description: "Read the best CS2 guides, tips, and tutorials to improve your gameplay.",
    baseUrl: "/guides",
  });
});

app.get("/top-lists", async (req, res) => {
  await renderCategoryPage(req, res, {
    category: "top-lists",
    title: "Top Lists - CS2HUB",
    description: "Discover the best CS2 settings, gear, rankings, and useful top lists.",
    baseUrl: "/top-lists",
  });
});

app.get("/pro-settings", async (req, res) => {
  await renderCategoryPage(req, res, {
    category: "pro-settings",
    title: "Pro Settings - CS2HUB",
    description: "Explore CS2 pro player settings, configs, crosshairs, resolutions, and gear.",
    baseUrl: "/pro-settings",
  });
});

app.get("/news", async (req, res) => {
  await renderCategoryPage(req, res, {
    category: "news",
    title: "CS2 News - CS2HUB",
    description: "Stay updated with the latest CS2 news, updates, esports stories, and patch changes.",
    baseUrl: "/news",
  });
});

app.get("/gear", async (req, res) => {
  await renderCategoryPage(req, res, {
    category: "gear",
    title: "CS2 Gear - CS2HUB",
    description: "Find the best CS2 gaming gear, mice, keyboards, monitors, headsets, and setups.",
    baseUrl: "/gear",
  });
});

// STATIC PAGES
app.get("/about", (req, res) => {
  renderPage(res, "pages/about", {
    title: "About - CS2HUB",
    description: "Learn more about CS2HUB and what the site offers.",
  });
});

app.get("/contact", (req, res) => {
  renderPage(res, "pages/contact", {
    title: "Contact - CS2HUB",
    description: "Contact CS2HUB for questions or feedback.",
  });
});

app.get("/privacy", (req, res) => {
  renderPage(res, "pages/privacy", {
    title: "Privacy Policy - CS2HUB",
    description: "Read the CS2HUB privacy policy.",
  });
});

// SEARCH
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q) {
      return renderPage(res, "pages/category", {
        title: "Search - CS2HUB",
        description: "Search CS2HUB posts, guides, settings, news, and gear articles.",
        heading: "Search Results",
        posts: [],
        searchQuery: "",
        currentPage: 1,
        totalPages: 1,
        baseUrl: "/search",
      });
    }

    const likeQuery = `%${q}%`;

    const rows = await dbAll(
      `
      SELECT * FROM posts
      WHERE title ILIKE $1
         OR excerpt ILIKE $1
         OR content ILIKE $1
         OR category ILIKE $1
      ORDER BY id DESC
      `,
      [likeQuery]
    );

    renderPage(res, "pages/category", {
      title: `Search: ${q} - CS2HUB`,
      description: `Search results for "${q}" on CS2HUB.`,
      heading: `Search Results for: "${q}"`,
      posts: rows,
      searchQuery: q,
      currentPage: 1,
      totalPages: 1,
      baseUrl: "/search",
    });
  } catch (err) {
    console.error(err);
    res.send("Search error");
  }
});

// SINGLE POST
app.get("/post/:slug", async (req, res) => {
  try {
    const post = await dbGet("SELECT * FROM posts WHERE slug = $1", [
      req.params.slug,
    ]);

    if (!post) {
      return res.status(404).render("pages/404", {
        currentPath: req.path,
        isAdmin: req.session && req.session.isAdmin,
        title: "404 - CS2HUB",
        description: "Page not found.",
      });
    }

    const relatedPosts = await dbAll(
      "SELECT * FROM posts WHERE category = $1 AND slug != $2 ORDER BY id DESC LIMIT 3",
      [post.category, post.slug]
    );

    renderPage(res, "pages/post", {
      title: `${post.title} - CS2HUB`,
      description:
        post.excerpt ||
        "Read this CS2 article on CS2HUB with settings, tips, and useful information.",
      post,
      relatedPosts,
    });
  } catch (err) {
    console.error(err);
    res.send("Database error");
  }
});

// ADMIN AUTH
app.get("/admin/login", (req, res) => {
  renderPage(res, "pages/admin-login", {
    title: "Admin Login - CS2HUB",
    description: "Login to the CS2HUB admin panel.",
    error: null,
  });
});

app.post("/admin/login", (req, res) => {
  const { login, password } = req.body;

  if (login === process.env.ADMIN_LOGIN && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }

  renderPage(res, "pages/admin-login", {
    title: "Admin Login - CS2HUB",
    description: "Login to the CS2HUB admin panel.",
    error: "Wrong login or password",
  });
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ADMIN DASHBOARD
app.get("/admin", async (req, res) => {
  if (!isAuth(req)) return res.redirect("/admin/login");

  try {
    const posts = await dbAll("SELECT * FROM posts ORDER BY id DESC");
    renderPage(res, "pages/admin-dashboard", {
      title: "Admin Dashboard - CS2HUB",
      description: "Manage posts in the CS2HUB admin dashboard.",
      posts,
    });
  } catch (err) {
    console.error(err);
    res.send("Database error");
  }
});

// NEW POST
app.get("/admin/posts/new", (req, res) => {
  if (!isAuth(req)) return res.redirect("/admin/login");

  renderPage(res, "pages/admin-new-post", {
    title: "New Post - CS2HUB Admin",
    description: "Create a new post in the CS2HUB admin panel.",
  });
});

app.post("/admin/posts/new", upload.single("imageFile"), async (req, res) => {
  if (!isAuth(req)) return res.redirect("/admin/login");

  try {
    const { title, slug, category, image, excerpt, content, date, featured } = req.body;
    const finalImage = req.file ? `/uploads/${req.file.filename}` : image;
    const isFeatured = featured === "on";

    if (isFeatured) {
      await dbRun("UPDATE posts SET featured = false");
    }

    await dbRun(
      `
      INSERT INTO posts (title, slug, category, image, excerpt, content, date, featured)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [title, slug, category, finalImage, excerpt, content, date, isFeatured]
    );

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.send("DB insert error");
  }
});

// EDIT POST
app.get("/admin/posts/edit/:id", async (req, res) => {
  if (!isAuth(req)) return res.redirect("/admin/login");

  try {
    const post = await dbGet("SELECT * FROM posts WHERE id = $1", [req.params.id]);

    if (!post) {
      return res.status(404).render("pages/404", {
        currentPath: req.path,
        isAdmin: req.session && req.session.isAdmin,
        title: "404 - CS2HUB",
        description: "Page not found.",
      });
    }

    renderPage(res, "pages/admin-edit-post", {
      title: "Edit Post - CS2HUB Admin",
      description: "Edit an existing post in the CS2HUB admin panel.",
      post,
    });
  } catch (err) {
    console.error(err);
    res.send("Database error");
  }
});

app.post("/admin/posts/edit/:id", upload.single("imageFile"), async (req, res) => {
  if (!isAuth(req)) return res.redirect("/admin/login");

  try {
    const oldPost = await dbGet("SELECT * FROM posts WHERE id = $1", [req.params.id]);

    if (!oldPost) {
      return res.status(404).render("pages/404", {
        currentPath: req.path,
        isAdmin: req.session && req.session.isAdmin,
        title: "404 - CS2HUB",
        description: "Page not found.",
      });
    }

    const { title, slug, category, image, excerpt, content, date, featured } = req.body;
    const finalImage = req.file ? `/uploads/${req.file.filename}` : image || oldPost.image;
    const isFeatured = featured === "on";

    if (isFeatured) {
      await dbRun("UPDATE posts SET featured = false");
    }

    await dbRun(
      `
      UPDATE posts
      SET title = $1,
          slug = $2,
          category = $3,
          image = $4,
          excerpt = $5,
          content = $6,
          date = $7,
          featured = $8
      WHERE id = $9
      `,
      [
        title,
        slug,
        category,
        finalImage,
        excerpt,
        content,
        date,
        isFeatured,
        req.params.id,
      ]
    );

    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.send("DB update error");
  }
});

// DELETE POST
app.post("/admin/posts/delete/:id", async (req, res) => {
  if (!isAuth(req)) return res.redirect("/admin/login");

  try {
    await dbRun("DELETE FROM posts WHERE id = $1", [req.params.id]);
    res.redirect("/admin");
  } catch (err) {
    console.error(err);
    res.send("DB delete error");
  }
});

// SITEMAP
app.get("/sitemap.xml", async (req, res) => {
  try {
    const posts = await dbAll("SELECT slug FROM posts ORDER BY id DESC");

    const baseUrl = "https://cs2hub-g0tg.onrender.com";

    const staticPages = [
      "",
      "/guides",
      "/top-lists",
      "/pro-settings",
      "/news",
      "/gear",
      "/about",
      "/contact",
      "/privacy",
    ];

    const urls = [
      ...staticPages.map((page) => `${baseUrl}${page}`),
      ...posts.map((post) => `${baseUrl}/post/${post.slug}`),
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url}</loc>
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (err) {
    console.error(err);
    res.status(500).send("Sitemap error");
  }
});

// 404
app.use((req, res) => {
  res.status(404).render("pages/404", {
    currentPath: req.path,
    isAdmin: req.session && req.session.isAdmin,
    title: "404 - CS2HUB",
    description: "Page not found.",
  });
});

app.listen(PORT, () => {
  console.log(`CS2HUB running on port ${PORT}`);
});