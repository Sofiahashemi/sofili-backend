const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const User = require("./Model/user");
const Design = require("./Model/design");

// ====== CONFIG ======
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://sofili_user:1baVJsCrvBhgvnmt@cluster0.lbjnvqo.mongodb.net/sofili?retryWrites=true&w=majority";

// ====== APP ======
const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// ====== HELPERS ======
function normalizePhone(phone) {
  return String(phone || "").trim();
}

function normalizeName(x) {
  return String(x || "").trim();
}

function getUserIdFromReq(req) {
  const x = req.header("X-User-ID");
  if (x) return String(x).trim();

  const auth = req.header("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();

  return null;
}

function requireUser(req, res, next) {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    return res.status(401).json({ message: "Missing user identity" });
  }
  req.userId = userId;
  next();
}

async function requireAdmin(req, res, next) {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    return res.status(401).json({ message: "Missing Authorization" });
  }

  const user = await User.findById(userId).lean();
  if (!user || !user.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  req.userId = userId;
  next();
}

function toSavedDesign(doc) {
  return {
    id: String(doc._id),
    userId: doc.userId,
    name: doc.name,
    date: doc.date,
    image: doc.image,
    json: doc.json,
    status: doc.status,
    jewelryType: doc.jewelryType,
    metalType: doc.metalType,
    notes: doc.notes || "",
  };
}

// ====== ROUTES ======
const v1 = express.Router();

v1.get("/", (req, res) => {
  res.json({ ok: true, service: "Sofili Studio API", version: "1.0" });
});

/**
 * --- AUTH (always-allow login) ---
 * نیاز تو:
 * - کاربر هرچی تو password بزنه، اجازه ورود بده
 * - ولی برای هر شماره یک user ثابت داشته باشیم تا طراحی‌هاش برگرده
 * - مقدار password رو به عنوان name ذخیره می‌کنیم (برای ادمین)
 */
v1.post("/auth/login", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const nameFromPassword = normalizeName(req.body?.password); // این همون "اسم" کاربره

    if (!phone) {
      return res.status(400).json({ message: "phone is required" });
    }

    let user = await User.findOne({ phone });

    // اگر کاربر نبود، بساز
    if (!user) {
      user = await User.create({
        phone,
        name: nameFromPassword || "User",
        isAdmin: false, // اگر می‌خوای شماره خودت ادمین باشه، پایین تنظیمش کن
      });
    } else {
      // اگر بود، اسم رو آپدیت کن تا همیشه آخرین اسم مشتری رو داشته باشی
      if (nameFromPassword) {
        user.name = nameFromPassword;
        await user.save();
      }
    }

    // اگر می‌خوای ادمین با شماره خودت تشخیص داده بشه (اختیاری):
    // if (user.phone === "09120000000" && !user.isAdmin) {
    //   user.isAdmin = true;
    //   await user.save();
    // }

    return res.json({
      id: String(user._id),
      phone: user.phone,
      isAdmin: !!user.isAdmin,
      name: user.name || "",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// --- GET designs (user) ---
// هویت کاربر از هدر X-User-ID میاد
v1.get("/designs", requireUser, async (req, res) => {
  try {
    const designs = await Design.find({ userId: req.userId })
      .sort({ date: -1 })
      .lean();

    return res.json({ designs: designs.map(toSavedDesign) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// --- CREATE design ---
v1.post("/designs", async (req, res) => {
  try {
    const { userId, name, image, json, jewelryType, metalType, notes } =
      req.body || {};

    if (!userId || !name || !image || !json || !jewelryType || !metalType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const doc = await Design.create({
      userId: String(userId),
      name,
      image,
      json,
      jewelryType,
      metalType,
      notes: notes || "",
      status: "pending",
      date: new Date(),
    });

    return res.status(201).json(toSavedDesign(doc));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// --- UPDATE design ---
v1.patch("/designs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      "name",
      "notes",
      "status",
      "image",
      "json",
      "jewelryType",
      "metalType",
    ];

    const updates = {};
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) {
        updates[k] = req.body[k];
      }
    }

    const updated = await Design.findByIdAndUpdate(id, updates, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Design not found" });
    }

    return res.json(toSavedDesign(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// --- DELETE design ---
v1.delete("/designs/:id", async (req, res) => {
  try {
    const deleted = await Design.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Design not found" });
    }
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// --- ADMIN ---
v1.get("/admin/designs", requireAdmin, async (req, res) => {
  try {
    const designs = await Design.find().sort({ date: -1 }).lean();
    return res.json(designs.map(toSavedDesign));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.use("/v1", v1);

// ====== START ======
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Running on http://localhost:${PORT}/v1`)
    );
  })
  .catch((err) => {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  });
