require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express');

// --- Server ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

// --- Kalitlar ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = process.env.ADMIN_ID; // YANGI

if (!BOT_TOKEN || !GEMINI_API_KEY || !TMDB_API_KEY) {
    console.error('Xatolik: Kalitlar yetishmayapti!');
    process.exit(1);
}

// --- MongoDB ---
if (MONGO_URI) {
    mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB ulandi')).catch(e => console.log(e));
}

// 1. FOYDALANUVCHI MODELI
const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    phone: String,
    lang: { type: String, default: 'uz' },
    points: { type: Number, default: 0 },
    searchCount: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    isTrial: { type: Boolean, default: false },
    joinedDate: Date,
    referrals: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// 2. KINO BAZASI MODELI (YANGI)
// Biz yuklagan kinolarning ID lari shu yerda turadi
const movieSchema = new mongoose.Schema({
    file_id: String,      // Telegramdagi video kodi
    title: String,        // Kino nomi (kichik harfda)
    caption: String,      // Kino haqida (caption)
    addedBy: Number
});
// Matnli qidiruv uchun indeks
movieSchema.index({ title: 'text' }); 
const Movie = mongoose.model('Movie', movieSchema);

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Sozlamalar ---
const CONFIG = {
    freeSearchLimit: 2,
    trialDays: 30,
    friendPrice: 5,
    premiumCostPoints: 500,
    pointsPerRef: 100
};

// --- Matnlar ---
const TEXTS = {
    uz: {
        welcome_menu: "🏠 Asosiy menyu:",
        preview: "🤖 <b>Medorama bot!</b>\n\nMen ikkita usulda ishlayman:\n1. 📼 <b>Baza:</b> O'zbek kinolarini to'g'ridan-to'g'ri telegramda ochib beraman.\n2. 🌍 <b>Global:</b> Dunyo kinolarini WebApp orqali topaman.\n\nKino nomini yozing:",
        register_limit: "⛔️ <b>Bepul limit tugadi!</b>\n\nTo'liq foydalanish uchun ro'yxatdan o'ting.",
        btn_phone: "📱 Telefon raqamni yuborish",
        menu_search: "🎬 Kino Qidirish", 
        menu_genres: "🎭 Janrlar",
        menu_cab: "👤 Kabinet", 
        menu_prem: "💎 Premium",
        search_prompt: "🔎 <b>Kino nomini yozing:</b>",
        not_found: "😔 Afsuski, hech narsa topilmadi.",
        daily_limit: "⛔️ <b>Sinov davri tugadi!</b>\n\n5,000 so'm to'lang yoki 5 ta do'st chaqiring.",
        cabinet_title: "👤 <b>Sizning Kabinetingiz:</b>",
        trial_active: "✅ Ro'yxatdan o'tildi!\n🎁 <b>1 oy bepul Premium.</b>",
        genres_title: "🎭 <b>Janrni tanlang:</b>",
        watch_ru: "🇷🇺 Tomosha (Direct)",
        watch_ru_yandex: "🇷🇺 Qidiruv (Yandex)",
        watch_uz: "🇺🇿 Tomosha (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Natijalar:",
        found_in_db: "📼 <b>Bot bazasidan topildi!</b>\nMarhamat, tomosha qiling:",
        admin_upload: "Admin, kino yuklash uchun videoni shu yerga tashlang va 'caption'ga nomini yozing."
    },
    // Boshqa tillar qisqartirildi...
    ru: { /* ... */ },
    en: { /* ... */ }
};

// --- Yordamchi Funksiyalar ---
function escapeHTML(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function getUser(id, name) {
    let user = await User.findOne({ id: id });
    if (!user) {
        user = await User.create({
            id: id,
            name: name,
            phone: null,
            lang: 'uz',
            searchCount: 0,
            joinedDate: new Date()
        });
    }
    return user;
}

function checkAccess(user) {
    if (user.phone) {
        const now = new Date();
        const diffTime = Math.abs(now - user.joinedDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (user.isPremium || (user.isTrial && diffDays <= CONFIG.trialDays)) return { allowed: true };
        return { allowed: false, reason: 'expired' };
    }
    if (user.searchCount < CONFIG.freeSearchLimit) return { allowed: true, updateCount: true };
    return { allowed: false, reason: 'register' };
}

// --- LOGIKA ---

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    await getUser(userId, ctx.from.first_name);
    
    const referrerId = ctx.startPayload;
    if (referrerId && referrerId != userId) {
        const referrer = await User.findOne({ id: Number(referrerId) });
        if (referrer) {
            referrer.points += CONFIG.pointsPerRef;
            referrer.referrals += 1;
            await referrer.save();
            bot.telegram.sendMessage(referrerId, `🎉 Yangi do'st qo'shildi! +100 ball.`).catch(()=>{});
        }
    }

    ctx.reply("🌍 Iltimos, tilni tanlang / Please choose language:", 
        Markup.keyboard([['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English']]).resize()
    );
});

// ADMIN: Video yuklash logikasi
bot.on('video', async (ctx) => {
    // Faqat admin yuklay oladi
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;

    const fileId = ctx.message.video.file_id;
    const caption = ctx.message.caption; // Kino nomi captionda bo'lishi shart

    if (!caption) {
        return ctx.reply("❌ Kino nomini 'Caption' (opisaniya) ga yozib yuboring!");
    }

    // Bazaga saqlaymiz
    await Movie.create({
        file_id: fileId,
        title: caption.toLowerCase().trim(), // Qidirish oson bo'lishi uchun kichik harf
        caption: caption,
        addedBy: ctx.from.id
    });

    ctx.reply(`✅ <b>"${caption}"</b> bazaga qo'shildi! Endi foydalanuvchilar uni nomi orqali topa olishadi.`, {parse_mode: 'HTML'});
});

// Til tanlash
bot.hears(['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    
    if (ctx.message.text === '🇺🇿 O\'zbek') user.lang = 'uz';
    else if (ctx.message.text === '🇷🇺 Русский') user.lang = 'ru';
    else user.lang = 'en';
    await user.save();

    const t = TEXTS[user.lang] || TEXTS.uz; 
    await ctx.replyWithHTML(t.preview);
    await ctx.reply(t.welcome_menu, Markup.keyboard([
        [t.menu_search, t.menu_genres],
        [t.menu_cab, t.menu_prem]
    ]).resize());
});

// Kontakt
bot.on('contact', async (ctx) => {
    const user = await getUser(ctx.from.id);
    user.phone = ctx.message.contact.phone_number;
    user.isTrial = true; 
    user.joinedDate = new Date();
    await user.save();
    
    const t = TEXTS[user.lang || 'uz'];
    await ctx.replyWithHTML(t.trial_active);
    await ctx.reply(t.welcome_menu, Markup.keyboard([
        [t.menu_search, t.menu_genres],
        [t.menu_cab, t.menu_prem]
    ]).resize());
});

// --- ASOSIY QIDIRUV (GIBRID) ---
bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;

    // Menyu tugmalari
    if (userInput === t.menu_search) return ctx.replyWithHTML(t.search_prompt);
    // ... (boshqa menyular qisqartirildi) ...

    // Ruxsat tekshiruvi
    const access = checkAccess(user);
    if (!access.allowed) {
        if (access.reason === 'register') {
            return ctx.replyWithHTML(t.register_limit, Markup.keyboard([
                [Markup.button.contactRequest(t.btn_phone)]
            ]).resize().oneTime());
        }
        if (access.reason === 'expired') return ctx.replyWithHTML(t.daily_limit);
    }

    try {
        // 1-QADAM: Bizning BAZADAN qidirish (O'zbek kinolari uchun)
        // Kino nomiga o'xshash narsalarni qidiramiz (Regex)
        const localMovies = await Movie.find({ 
            title: { $regex: userInput.toLowerCase(), $options: 'i' } 
        });

        // Agar bazada bo'lsa -> Videoni yuboramiz
        if (localMovies.length > 0) {
            await ctx.replyWithHTML(t.found_in_db);
            for (let movie of localMovies) {
                // Videoni forward qilmasdan, yangi xabar sifatida yuboramiz
                await ctx.replyWithVideo(movie.file_id, {
                    caption: `🎬 <b>${movie.caption}</b>\n\n@medoramabot`,
                    parse_mode: 'HTML'
                });
            }
            // Limitni yangilaymiz
            if (access.updateCount) {
                user.searchCount += 1;
                await user.save();
            }
            return; // TMDB dan qidirish shart emas
        }

        // 2-QADAM: Agar bazada yo'q bo'lsa -> GLOBAL QIDIRUV (TMDB)
        const ai = await analyzeIntent(userInput);
        const movies = await searchMoviesList(ai.searchQuery || userInput);

        if (!movies || movies.length === 0) return ctx.reply(t.not_found);

        // Limitni yangilaymiz
        if (access.updateCount) {
            user.searchCount += 1;
            await user.save();
        }

        const buttons = movies.map(movie => {
            const year = movie.release_date ? movie.release_date.split('-')[0] : '';
            return [Markup.button.callback(`🎬 ${movie.title} (${year})`, `select_${movie.id}`)];
        });

        await ctx.reply(t.results, Markup.inlineKeyboard(buttons));

    } catch (err) { console.log(err); }
});

// TMDB tanlash
bot.action(/select_(\d+)/, async (ctx) => {
    // ... (Eski TMDB logikasi o'zgarishsiz qoladi) ...
    // Bu yerda o'sha WebApp/Asilmedia linklari turadi.
});

// --- API Funksiyalari (qolganlari) ---
// (searchMoviesList, getMovieDetails, analyzeIntent funksiyalari oldingi kodda bor edi,
//  ularni bu yerga o'z holicha ko'chirib o'tish kerak)

async function searchMoviesList(query) {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
            params: { api_key: TMDB_API_KEY, query: query, language: 'ru-RU' }
        });
        return response.data.results.slice(0, 5);
    } catch (e) { return []; }
}

async function analyzeIntent(userInput) {
    try {
        const prompt = `Task: Extract movie title from "${userInput}". Output JSON: { "isMovieRequest": boolean, "searchQuery": "Title" }`;
        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
        return { isMovieRequest: true, searchQuery: userInput };
    }
}

bot.launch().then(() => console.log('✅ Medorama (Hybrid Mode) ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));