require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express');

// --- Sozlamalar ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.MONGO_URI; // Yangi o'zgaruvchi

if (!BOT_TOKEN || !GEMINI_API_KEY || !TMDB_API_KEY || !MONGO_URI) {
    console.error('Xatolik: .env faylida kalitlar yetishmayapti!');
    process.exit(1);
}

// --- RENDER UCHUN WEB SERVER (Keep-Alive) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running properly!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// --- MONGODB ULANISH ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB ulandi'))
    .catch(err => console.error('MongoDB xatosi:', err));

// Foydalanuvchi sxemasi
const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    phone: String,
    country: String,
    lang: { type: String, default: 'uz' },
    points: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: true },
    isTrial: { type: Boolean, default: true },
    joinedDate: { type: Date, default: Date.now },
    trialNotified: { type: Boolean, default: false },
    referrals: { type: Number, default: 0 },
    dailyRequests: { type: Number, default: 0 },
    lastRequestDate: String
});

const User = mongoose.model('User', userSchema);

// --- Botni ishga tushirish ---
const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const CONFIG = {
    trialDays: 30, warningDay: 20, pointsPerRef: 100,
    premiumCostPoints: 500, premiumPriceSum: '5,000 so\'m', topLimit: 10
};

const GENRES = {
    "action": 28, "adventure": 12, "animation": 16, "comedy": 35,
    "crime": 80, "documentary": 99, "drama": 18, "family": 10751,
    "fantasy": 14, "history": 36, "horror": 27, "music": 10402,
    "mystery": 9648, "romance": 10749, "sci-fi": 878, "thriller": 53,
    "war": 10752, "western": 37
};

// --- Matnlar ---
const TEXTS = {
    uz: {
        ask_phone: "👋 Assalomu alaykum! Botdan foydalanish uchun telefon raqamingizni yuboring.\n\n(Pastdagi tugmani bosing 👇)",
        btn_phone: "📱 Telefon raqamni yuborish",
        welcome: "Xush kelibsiz! Tilni tanlang:",
        menu_search: "🎬 Kino Qidirish", menu_genres: "🎭 Janrlar",
        menu_cab: "👤 Kabinet", menu_prem: "💎 Premium",
        search_prompt: "🔎 Kino nomini yozing:",
        not_found: "😔 Hech narsa topilmadi.",
        daily_limit: "⛔️ <b>Sinov davri tugadi!</b>\n\nBotdan to'liq foydalanish uchun:\n1. <b>5,000 so'm</b> to'lang.\n2. Yoki <b>5 ta do'st</b> taklif qilib, 500 ball yig'ing.",
        premium_desc: "💎 <b>Premium Obuna:</b>\n✅ Cheklovsiz qidiruv\n✅ Janrlar\n✅ Syujet\n\nNarxi: <b>5,000 so'm</b> yoki <b>500 ball</b>.",
        cabinet_title: "👤 <b>Sizning Kabinetingiz:</b>",
        ref_text: "Har bir do'st uchun <b>100 ball</b>.",
        trial_active: "🎁 <b>Sizda 1-oy bepul Premium bor!</b>",
        trial_warning: "⚠️ <b>DIQQAT!</b> Premium tugashiga 10 kun qoldi.",
        top_movies: "🔥 <b>TOP-10:</b>",
        choose_genre: "👇 <b>Janrni tanlang:</b>",
        watch_ru: "🇷🇺 Tomosha qilish (Direct)",
        watch_ru_yandex: "🇷🇺 Qidiruv (Yandex)",
        watch_uz: "🇺🇿 Tomosha qilish (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Natijalar:"
    },
    ru: {
        ask_phone: "👋 Здравствуйте! Отправьте номер телефона.",
        btn_phone: "📱 Отправить номер",
        welcome: "Добро пожаловать! Выберите язык:",
        menu_search: "🎬 Поиск Кино", menu_genres: "🎭 Жанры",
        menu_cab: "👤 Кабинет", menu_prem: "💎 Премиум",
        search_prompt: "🔎 Введите название фильма:",
        not_found: "😔 Ничего не найдено.",
        daily_limit: "⛔️ <b>Пробный период истёк!</b>",
        premium_desc: "💎 <b>Премиум:</b> 5,000 сум или 500 баллов.",
        cabinet_title: "👤 <b>Ваш Кабинет:</b>",
        ref_text: "100 баллов за друга.",
        trial_active: "🎁 <b>Бесплатный период активен!</b>",
        trial_warning: "⚠️ Осталось 10 дней.",
        top_movies: "🔥 <b>ТОП-10:</b>",
        choose_genre: "👇 <b>Выберите жанр:</b>",
        watch_ru: "🇷🇺 Смотреть (Direct)",
        watch_ru_yandex: "🇷🇺 Поиск (Yandex)",
        watch_uz: "🇺🇿 Смотреть (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Результаты:"
    },
    en: {
        ask_phone: "👋 Hello! Send phone number.",
        btn_phone: "📱 Send Number",
        welcome: "Welcome! Choose language:",
        menu_search: "🎬 Search Movie", menu_genres: "🎭 Genres",
        menu_cab: "👤 Profile", menu_prem: "💎 Premium",
        search_prompt: "🔎 Enter movie name:",
        not_found: "😔 Nothing found.",
        daily_limit: "⛔️ <b>Trial ended!</b>",
        premium_desc: "💎 <b>Premium:</b> 5,000 UZS or 500 points.",
        cabinet_title: "👤 <b>Your Profile:</b>",
        ref_text: "100 points per friend.",
        trial_active: "🎁 <b>Free trial active!</b>",
        trial_warning: "⚠️ 10 days left.",
        top_movies: "🔥 <b>TOP-10:</b>",
        choose_genre: "👇 <b>Choose genre:</b>",
        watch_ru: "🇷🇺 Watch (Direct)",
        watch_ru_yandex: "🇷🇺 Search (Yandex)",
        watch_uz: "🇺🇿 Watch (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Results:"
    }
};

// --- Helper Functions ---
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
            joinedDate: new Date(),
            lastRequestDate: new Date().toDateString()
        });
    }
    // Update daily limit check
    const today = new Date().toDateString();
    if (user.lastRequestDate !== today) {
        user.dailyRequests = 0;
        user.lastRequestDate = today;
        await user.save();
    }
    return user;
}

async function checkSubscription(user) {
    const now = new Date();
    const diffTime = Math.abs(now - user.joinedDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    let changed = false;

    if (diffDays > CONFIG.trialDays && user.isTrial) {
        user.isPremium = false;
        user.isTrial = false;
        changed = true;
    }
    if (diffDays >= CONFIG.warningDay && diffDays <= CONFIG.trialDays && user.isTrial && !user.trialNotified) {
        if (changed) await user.save();
        return "WARNING";
    }
    if (changed) await user.save();
    return user.isPremium ? "ACTIVE" : "EXPIRED";
}

// --- API Functions ---
async function getMoviesByGenre(genreId) {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/discover/movie`, {
            params: { api_key: TMDB_API_KEY, with_genres: genreId, sort_by: 'popularity.desc', language: 'ru-RU', page: 1 }
        });
        return response.data.results.slice(0, CONFIG.topLimit);
    } catch (e) { return []; }
}

async function searchMoviesList(query) {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
            params: { api_key: TMDB_API_KEY, query: query, language: 'ru-RU' }
        });
        return response.data.results.slice(0, 5);
    } catch (e) { return []; }
}

async function getMovieDetails(id) {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/movie/${id}`, {
            params: { api_key: TMDB_API_KEY, language: 'ru-RU' }
        });
        return response.data;
    } catch (e) { return null; }
}

async function analyzeIntent(userInput) {
    try {
        const prompt = `Task: Extract movie title from "${userInput}". Output JSON: { "isMovieRequest": boolean, "searchQuery": "Title", "russianResponse": "Text" }`;
        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
        return { isMovieRequest: true, searchQuery: userInput, russianResponse: "..." };
    }
}

// --- Bot Logic ---
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = await getUser(userId, ctx.from.first_name);

    const referrerId = ctx.startPayload;
    if (referrerId && referrerId != userId) {
        // Find referrer in DB
        const referrer = await User.findOne({ id: Number(referrerId) });
        if (referrer) {
            referrer.points += CONFIG.pointsPerRef;
            referrer.referrals += 1;
            
            if (referrer.points >= CONFIG.premiumCostPoints && !referrer.isPremium) {
                referrer.isPremium = true;
                referrer.points -= CONFIG.premiumCostPoints;
                bot.telegram.sendMessage(referrerId, `🎉 <b>Tabriklaymiz!</b> Siz 500 ball yig'dingiz. Premium obuna faollashdi!`, {parse_mode: 'HTML'}).catch(()=>{});
            } else {
                bot.telegram.sendMessage(referrerId, `🎉 +100 ball! (Jami: ${referrer.points})`, {parse_mode: 'HTML'}).catch(()=>{});
            }
            await referrer.save();
        }
    }

    if (!user.phone) {
        return ctx.reply(TEXTS.uz.ask_phone, Markup.keyboard([[Markup.button.contactRequest(TEXTS.uz.btn_phone)]]).resize().oneTime());
    }
    ctx.reply("🌍 Tilni tanlang:", Markup.keyboard([['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English']]).resize());
});

bot.on('contact', async (ctx) => {
    const user = await getUser(ctx.from.id, ctx.from.first_name);
    user.phone = ctx.message.contact.phone_number;
    
    if (user.phone.startsWith('998') || user.phone.startsWith('+998')) {
        user.country = 'UZ';
    } else {
        user.country = 'OTHER';
    }
    await user.save();
    
    ctx.reply("✅ Ro'yxatdan o'tildi! Sizga <b>1 oy bepul Premium</b> berildi.", {parse_mode: 'HTML'});
    ctx.reply("🌍 Tilni tanlang:", Markup.keyboard([['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English']]).resize());
});

bot.hears(['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user.phone) return ctx.reply("Start bosing.");
    
    if (ctx.message.text === '🇺🇿 O\'zbek') user.lang = 'uz';
    else if (ctx.message.text === '🇷🇺 Русский') user.lang = 'ru';
    else user.lang = 'en';
    await user.save();

    const t = TEXTS[user.lang]; 
    ctx.reply(t.welcome, Markup.keyboard([[t.menu_search, t.menu_genres], [t.menu_cab, t.menu_prem]]).resize());
});

bot.hears(['🎭 Janrlar', '🎭 Жанры', '🎭 Genres'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;
    const genreButtons = [
        [Markup.button.callback('💥 Action', 'genre_28'), Markup.button.callback('😂 Comedy', 'genre_35')],
        [Markup.button.callback('🧟‍♂️ Horror', 'genre_27'), Markup.button.callback('🎭 Drama', 'genre_18')],
        [Markup.button.callback('🧙‍♂️ Fantasy', 'genre_14'), Markup.button.callback('💘 Romance', 'genre_10749')],
        [Markup.button.callback('🧸 Animation', 'genre_16'), Markup.button.callback('🚀 Sci-Fi', 'genre_878')]
    ];
    ctx.replyWithHTML(t.choose_genre, Markup.inlineKeyboard(genreButtons));
});

bot.action(/genre_(\d+)/, async (ctx) => {
    const genreId = ctx.match[1];
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;

    const subStatus = await checkSubscription(user);
    if (user.country === 'UZ' && subStatus === "EXPIRED") return ctx.replyWithHTML(t.daily_limit);

    try {
        await ctx.answerCbQuery();
        const movies = await getMoviesByGenre(genreId);
        if (!movies.length) return ctx.reply(t.not_found);
        const buttons = movies.map(movie => {
            const year = movie.release_date ? movie.release_date.split('-')[0] : '';
            return [Markup.button.callback(`🎬 ${movie.title} (${year})`, `select_${movie.id}`)];
        });
        await ctx.replyWithHTML(t.top_movies, Markup.inlineKeyboard(buttons));
    } catch (e) { console.log(e); }
});

bot.hears(['👤 Kabinet', '👤 Кабинет', '👤 Profile'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    
    const subStatus = await checkSubscription(user);
    if (subStatus === "WARNING" && !user.trialNotified) {
        ctx.replyWithHTML(t.trial_warning);
        user.trialNotified = true;
        await user.save();
    }

    let statusText = user.isPremium ? "💎 Premium" : "❌ Tugagan";
    if (user.isTrial && user.isPremium) statusText += " (Trial)";

    let msg = `${t.cabinet_title}\n\n` +
              `🆔 ID: <code>${user.id}</code>\n` +
              `💎 Status: <b>${statusText}</b>\n` +
              `💰 Ballar: <b>${user.points}</b>\n` +
              `👥 Do'stlar: <b>${user.referrals}</b>\n\n` +
              `${t.ref_text}\n\n` + 
              `🔗 Link:\n<code>${refLink}</code>`;
    
    ctx.replyWithHTML(msg);
});

bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;
    
    const allMenus = [];
    Object.values(TEXTS).forEach(lang => {
        allMenus.push(lang.menu_search, lang.menu_genres, lang.menu_cab, lang.menu_prem);
    });
    if (allMenus.includes(userInput)) return;
    if (!user.phone) return ctx.reply("Start.");

    const subStatus = await checkSubscription(user);
    if (user.country === 'UZ' && subStatus === "EXPIRED") return ctx.replyWithHTML(t.daily_limit);
    if (subStatus === "WARNING" && !user.trialNotified) {
        ctx.replyWithHTML(t.trial_warning);
        user.trialNotified = true;
        await user.save();
    }

    try {
        const ai = await analyzeIntent(userInput);
        const query = ai.searchQuery || userInput;
        const movies = await searchMoviesList(query);
        if (!movies || movies.length === 0) return ctx.reply(t.not_found);
        
        const buttons = movies.map(movie => {
            const year = movie.release_date ? movie.release_date.split('-')[0] : '';
            return [Markup.button.callback(`🎬 ${movie.title} (${year})`, `select_${movie.id}`)];
        });
        await ctx.reply(t.results, Markup.inlineKeyboard(buttons));
    } catch (err) { console.log(err); }
});

bot.action(/select_(\d+)/, async (ctx) => {
    try {
        const tmdbId = ctx.match[1];
        await ctx.answerCbQuery();
        const user = await getUser(ctx.from.id);
        const t = TEXTS[user.lang] || TEXTS.uz;

        const movie = await getMovieDetails(tmdbId);
        if (!movie) return ctx.reply("Error.");

        const { title, overview, release_date, poster_path, vote_average } = movie;
        const year = release_date ? release_date.split('-')[0] : '';
        const posterUrl = poster_path ? `https://image.tmdb.org/t/p/w500${poster_path}` : null;

        const linkRu = `https://embed.su/embed/movie/${tmdbId}`;
        const linkRuYandex = `https://yandex.uz/video/search?text=${encodeURIComponent(title + " смотреть онлайн")}`;
        const linkEn = `https://vidsrc.net/embed/movie/${tmdbId}`;
        const linkUz = `http://asilmedia.org/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`;

        const buttons = [
            [Markup.button.webApp(t.watch_ru, linkRu)],
            [Markup.button.webApp(t.watch_ru_yandex, linkRuYandex)],
            [Markup.button.webApp(t.watch_en, linkEn)],
            [Markup.button.url(t.watch_uz, linkUz)]
        ];

        const safeTitle = escapeHTML(title);
        const safeOverview = escapeHTML(overview ? overview.slice(0, 300) + '...' : '');
        const caption = `🎬 <b>${safeTitle}</b> (${year})\n⭐️ ${vote_average.toFixed(1)}\n\n📝 ${safeOverview}`;

        if (posterUrl) {
            await ctx.replyWithPhoto(posterUrl, { caption, parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
        } else {
            await ctx.replyWithHTML(caption, Markup.inlineKeyboard(buttons));
        }
    } catch (e) { console.error(e); }
});

bot.launch().then(() => console.log('✅ Medorama (Render+Mongo) ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));