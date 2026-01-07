require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express');

// --- Server Sozlamalari ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is active'));
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

// --- Kalitlar ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

if (!BOT_TOKEN || !GEMINI_API_KEY || !TMDB_API_KEY) {
    console.error('Xatolik: Kalitlar yetishmayapti!');
    process.exit(1);
}

// --- MongoDB ---
if (MONGO_URI) {
    mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB ulandi')).catch(e => console.log(e));
}

// User Model
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
        preview: "🤖 <b>Men Medorama botman!</b>\n\nMen nimalar qila olaman:\n1. 🎬 Filmlarni nomlari orqali topish.\n2. 📝 Voqealar rivoji (syujet) orqali topish.\n3. 🔗 Linklar orqali kinoni aniqlash.\n\n🎁 <b>Hozircha sizda 2 ta bepul qidiruv bor!</b> Marhamat, kino nomini yozing:",
        register_limit: "⛔️ <b>Bepul limit tugadi!</b>\n\nBotdan to'liq foydalanish uchun ro'yxatdan o'ting.",
        btn_phone: "📱 Telefon raqamni yuborish",
        // TUGMALAR (Bular aniq mos tushishi kerak)
        menu_search: "🎬 Kino Qidirish", 
        menu_genres: "🎭 Janrlar",
        menu_cab: "👤 Kabinet", 
        menu_prem: "💎 Premium",
        // Javoblar
        search_prompt: "🔎 <b>Kino nomini yoki voqeasini yozing:</b>\n(Masalan: 'Avatar' yoki 'Titanik kemasi haqida kino')",
        not_found: "😔 Afsuski, hech narsa topilmadi.",
        daily_limit: "⛔️ <b>Sinov davri tugadi!</b>\n\nDavom etish uchun 5,000 so'm to'lang yoki 5 ta do'st chaqiring.",
        cabinet_title: "👤 <b>Sizning Kabinetingiz:</b>",
        premium_info: "💎 <b>Premium Obuna:</b>\n\n✅ Cheklovsiz qidiruv\n✅ Reklamasiz\n✅ Tezkor javoblar\n\n💰 Narxi: <b>5,000 so'm</b> (yoki 5 ta do'st).",
        trial_active: "✅ Ro'yxatdan o'tildi!\n🎁 <b>1 oy bepul Premium berildi.</b>",
        genres_title: "🎭 <b>Janrni tanlang:</b>",
        watch_ru: "🇷🇺 Tomosha (Direct)",
        watch_ru_yandex: "🇷🇺 Qidiruv (Yandex)",
        watch_uz: "🇺🇿 Tomosha (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Natijalar:",
        genre_names: { 28: "Jangari", 35: "Komediya", 27: "Qo'rqinchli", 18: "Drama", 14: "Fantastika", 10749: "Romantika", 16: "Multfilm", 878: "Ilmiy-fantastika" },
        genre_selected: "✅ <b>{genre}</b> janri tanlandi.\nEndi shu janrdagi kino nomini yozing."
    },
    ru: {
        welcome_menu: "🏠 Главное меню:",
        preview: "🤖 <b>Я бот Medorama!</b>\n\nВведите название фильма:",
        register_limit: "⛔️ <b>Лимит исчерпан!</b> Отправьте номер для регистрации.",
        btn_phone: "📱 Отправить номер",
        menu_search: "🎬 Поиск Кино", 
        menu_genres: "🎭 Жанры",
        menu_cab: "👤 Кабинет", 
        menu_prem: "💎 Премиум",
        search_prompt: "🔎 <b>Введите название фильма или сюжет:</b>",
        not_found: "😔 Ничего не найдено.",
        daily_limit: "⛔️ <b>Пробный период истёк!</b>",
        cabinet_title: "👤 <b>Ваш Кабинет:</b>",
        premium_info: "💎 <b>Премиум:</b> 5,000 сум или 5 друзей.",
        trial_active: "✅ Регистрация успешна!\n🎁 <b>1 месяц Премиум бесплатно.</b>",
        genres_title: "🎭 <b>Выберите жанр:</b>",
        watch_ru: "🇷🇺 Смотреть (Direct)",
        watch_ru_yandex: "🇷🇺 Поиск (Yandex)",
        watch_uz: "🇺🇿 Смотреть (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Результаты:",
        genre_names: { 28: "Боевик", 35: "Комедия", 27: "Ужасы", 18: "Драма", 14: "Фэнтези", 10749: "Романтика", 16: "Мультфильм", 878: "Фантастика" },
        genre_selected: "✅ Выбран жанр: <b>{genre}</b>.\nВведите название фильма."
    },
    en: {
        welcome_menu: "🏠 Main Menu:",
        preview: "🤖 <b>I am Medorama Bot!</b>\n\nType a movie name:",
        register_limit: "⛔️ <b>Limit reached!</b> Send phone number.",
        btn_phone: "📱 Send Number",
        menu_search: "🎬 Search Movie", 
        menu_genres: "🎭 Genres",
        menu_cab: "👤 Profile", 
        menu_prem: "💎 Premium",
        search_prompt: "🔎 <b>Enter movie name or plot:</b>",
        not_found: "😔 Nothing found.",
        daily_limit: "⛔️ <b>Trial ended!</b>",
        cabinet_title: "👤 <b>Your Profile:</b>",
        premium_info: "💎 <b>Premium:</b> 5,000 UZS or 5 friends.",
        trial_active: "✅ Registration successful!\n🎁 <b>1 month Free Premium.</b>",
        genres_title: "🎭 <b>Choose Genre:</b>",
        watch_ru: "🇷🇺 Watch (Direct)",
        watch_ru_yandex: "🇷🇺 Search (Yandex)",
        watch_uz: "🇺🇿 Watch (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Results:",
        genre_names: { 28: "Action", 35: "Comedy", 27: "Horror", 18: "Drama", 14: "Fantasy", 10749: "Romance", 16: "Animation", 878: "Sci-Fi" },
        genre_selected: "✅ Genre: <b>{genre}</b>.\nType movie name."
    }
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

// --- API ---
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
        const prompt = `Task: Extract movie title from "${userInput}". Output JSON: { "isMovieRequest": boolean, "searchQuery": "Title" }`;
        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
        return { isMovieRequest: true, searchQuery: userInput };
    }
}

// --- LOGIKA ---

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    await getUser(userId, ctx.from.first_name);
    
    // Referal
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

// Til tanlash
bot.hears(['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    
    if (ctx.message.text === '🇺🇿 O\'zbek') user.lang = 'uz';
    else if (ctx.message.text === '🇷🇺 Русский') user.lang = 'ru';
    else user.lang = 'en';
    await user.save();

    const t = TEXTS[user.lang]; 
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

// Janr tanlash (Action Handler)
bot.action(/genre_(\d+)/, async (ctx) => {
    const genreId = ctx.match[1];
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;
    
    await ctx.answerCbQuery();
    const genreName = t.genre_names[genreId];
    const msg = t.genre_selected.replace('{genre}', genreName);
    ctx.replyWithHTML(msg);
});

// Film Tanlash (Action Handler)
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

        const caption = `🎬 <b>${escapeHTML(title)}</b> (${year})\n⭐️ ${vote_average.toFixed(1)}\n\n📝 ${escapeHTML(overview ? overview.slice(0, 300) : '')}`;

        if (posterUrl) {
            await ctx.replyWithPhoto(posterUrl, { caption, parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
        } else {
            await ctx.replyWithHTML(caption, Markup.inlineKeyboard(buttons));
        }
    } catch (e) { console.error(e); }
});

// --- ASOSIY XABARLARNI QABUL QILISH (Universal Handler) ---
bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;

    // 1. MENYU TUGMALARI TEKSHIRUVI (Muhim qism!)
    if (userInput === t.menu_search) {
        return ctx.replyWithHTML(t.search_prompt);
    }
    
    if (userInput === t.menu_cab) {
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
        let msg = `${t.cabinet_title}\n\n` +
                  `🆔 ID: <code>${user.id}</code>\n` +
                  `💎 Premium: <b>${user.isPremium || user.isTrial ? '✅ Aktiv' : '❌ Yo\'q'}</b>\n` +
                  `💰 Ballar: <b>${user.points}</b>\n` +
                  `👥 Do'stlar: <b>${user.referrals}</b>\n\n` +
                  `🔗 Link:\n<code>${refLink}</code>`;
        return ctx.replyWithHTML(msg);
    }

    if (userInput === t.menu_prem) {
        return ctx.replyWithHTML(t.premium_info);
    }

    if (userInput === t.menu_genres) {
        const names = t.genre_names;
        const buttons = [
            [Markup.button.callback('💥 ' + names[28], 'genre_28'), Markup.button.callback('😂 ' + names[35], 'genre_35')],
            [Markup.button.callback('🧟‍♂️ ' + names[27], 'genre_27'), Markup.button.callback('🎭 ' + names[18], 'genre_18')],
            [Markup.button.callback('🧙‍♂️ ' + names[14], 'genre_14'), Markup.button.callback('💘 ' + names[10749], 'genre_10749')],
            [Markup.button.callback('🧸 ' + names[16], 'genre_16'), Markup.button.callback('🚀 ' + names[878], 'genre_878')]
        ];
        return ctx.replyWithHTML(t.genres_title, Markup.inlineKeyboard(buttons));
    }

    // 2. AGAR MENYU BO'LMASA -> FILM QIDIRISH
    
    // Ruxsatni tekshirish
    const access = checkAccess(user);

    if (!access.allowed) {
        if (access.reason === 'register') {
            return ctx.replyWithHTML(t.register_limit, Markup.keyboard([
                [Markup.button.contactRequest(t.btn_phone)]
            ]).resize().oneTime());
        }
        if (access.reason === 'expired') {
            return ctx.replyWithHTML(t.daily_limit);
        }
    }

    // Qidiruvni boshlash
    try {
        if (access.updateCount) {
            user.searchCount += 1;
            await user.save();
        }

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

bot.launch().then(() => console.log('✅ Medorama (Final Fixed) ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));