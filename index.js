require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// --- Sozlamalar ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.MONGO_URI;

// Agar Docker/Render bo'lsa Express server kerak
const express = require('express');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

if (!BOT_TOKEN || !GEMINI_API_KEY || !TMDB_API_KEY) {
    console.error('Xatolik: .env faylida kalitlar yetishmayapti!');
    process.exit(1);
}

// --- MongoDB Ulanish ---
if (MONGO_URI) {
    mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB ulandi')).catch(e => console.log(e));
}

// User Schema
const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    phone: String,
    lang: { type: String, default: 'uz' },
    points: { type: Number, default: 0 },
    searchCount: { type: Number, default: 0 }, // Bepul qidiruvlar soni
    isPremium: { type: Boolean, default: false },
    isTrial: { type: Boolean, default: false }, // Ro'yxatdan o'tgach beriladi
    joinedDate: Date,
    referrals: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const bot = new Telegraf(BOT_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Konfiguratsiya ---
const CONFIG = {
    freeSearchLimit: 2,       // Raqamsiz nechta kino ko'ra oladi
    trialDays: 30,            // Ro'yxatdan o'tgach bepul davr
    friendPrice: 5,           
    premiumCostPoints: 500,   
    pointsPerRef: 100
};

// --- Matnlar (To'liq Tarjimalar) ---
const TEXTS = {
    uz: {
        welcome_menu: "🏠 Asosiy menyu:",
        ask_lang: "🌍 Iltimos, tilni tanlang:",
        preview: "🤖 <b>Men Medorama botman!</b>\n\nMen nimalar qila olaman:\n1. 🎬 Filmlarni nomlari orqali topish.\n2. 📝 Voqealar rivoji (syujet) orqali topish (masalan: \"Zombilar haqida kino\").\n3. 🔗 Instagram/TikTok linklari orqali kinoni aniqlash.\n\n🎁 <b>Hozircha sizda 2 ta bepul qidiruv bor!</b> Marhamat, kino nomini yozing:",
        register_limit: "⛔️ <b>Bepul limit tugadi!</b>\n\nBotdan to'liq va cheklovsiz foydalanish uchun ro'yxatdan o'ting (Telefon raqam yuboring).",
        btn_phone: "📱 Telefon raqamni yuborish",
        menu_search: "🎬 Kino Qidirish", 
        menu_genres: "🎭 Janrlar",
        menu_cab: "👤 Kabinet", 
        menu_prem: "💎 Premium",
        search_prompt: "🔎 Kino nomini yoki voqeasini yozing:",
        not_found: "😔 Afsuski, hech narsa topilmadi.",
        daily_limit: "⛔️ <b>Sinov davri tugadi!</b>\n\nDavom etish uchun 5,000 so'm to'lang yoki 5 ta do'st chaqiring.",
        cabinet_title: "👤 <b>Sizning Kabinetingiz:</b>",
        trial_active: "✅ Siz muvaffaqiyatli ro'yxatdan o'tdingiz!\n🎁 <b>1 oy bepul Premium berildi.</b>",
        genres_title: "🎭 <b>Janrni tanlang:</b>\n(Tanlaganingizdan so'ng shu janrdagi kino nomini yozishingiz mumkin)",
        watch_ru: "🇷🇺 Tomosha (Direct)",
        watch_ru_yandex: "🇷🇺 Qidiruv (Yandex)",
        watch_uz: "🇺🇿 Tomosha (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Natijalar:",
        genre_names: {
            28: "Jangari", 35: "Komediya", 27: "Qo'rqinchli", 18: "Drama",
            14: "Fantastika", 10749: "Romantika", 16: "Multfilm", 878: "Ilmiy-fantastika"
        },
        genre_selected: "✅ <b>{genre}</b> janri tanlandi.\n\nEndi shu janrdagi biror kino nomini yoki ta'rifini yozing (masalan: \"Eng zo'r jangari kinolar\")."
    },
    ru: {
        welcome_menu: "🏠 Главное меню:",
        ask_lang: "🌍 Пожалуйста, выберите язык:",
        preview: "🤖 <b>Я бот Medorama!</b>\n\nЧто я умею:\n1. 🎬 Находить фильмы по названию.\n2. 📝 Находить по описанию сюжета (например: \"Фильм про зомби\").\n3. 🔗 Определять фильмы по ссылкам Instagram/TikTok.\n\n🎁 <b>У вас есть 2 бесплатных поиска!</b> Введите название фильма:",
        register_limit: "⛔️ <b>Бесплатный лимит исчерпан!</b>\n\nДля полного доступа пройдите регистрацию (отправьте номер).",
        btn_phone: "📱 Отправить номер",
        menu_search: "🎬 Поиск Кино", 
        menu_genres: "🎭 Жанры",
        menu_cab: "👤 Кабинет", 
        menu_prem: "💎 Премиум",
        search_prompt: "🔎 Введите название или сюжет фильма:",
        not_found: "😔 Ничего не найдено.",
        daily_limit: "⛔️ <b>Пробный период истек!</b>\n\nОплатите 5,000 сум или пригласите 5 друзей.",
        cabinet_title: "👤 <b>Ваш Кабинет:</b>",
        trial_active: "✅ Вы успешно зарегистрировались!\n🎁 <b>Вам выдан 1 месяц Премиум.</b>",
        genres_title: "🎭 <b>Выберите жанр:</b>",
        watch_ru: "🇷🇺 Смотреть (Direct)",
        watch_ru_yandex: "🇷🇺 Поиск (Yandex)",
        watch_uz: "🇺🇿 Смотреть (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Результаты:",
        genre_names: {
            28: "Боевик", 35: "Комедия", 27: "Ужасы", 18: "Драма",
            14: "Фэнтези", 10749: "Романтика", 16: "Мультфильм", 878: "Фантастика"
        },
        genre_selected: "✅ Выбран жанр: <b>{genre}</b>.\n\nТеперь напишите название фильма или запрос (например: \"Лучшие боевики\")."
    },
    en: {
        welcome_menu: "🏠 Main Menu:",
        ask_lang: "🌍 Please choose a language:",
        preview: "🤖 <b>I am Medorama Bot!</b>\n\nWhat I can do:\n1. 🎬 Find movies by title.\n2. 📝 Find by plot description (e.g., \"Movies about zombies\").\n3. 🔗 Identify movies from Instagram/TikTok links.\n\n🎁 <b>You have 2 free searches!</b> Go ahead, type a movie name:",
        register_limit: "⛔️ <b>Free limit reached!</b>\n\nPlease register (send phone number) for full access.",
        btn_phone: "📱 Send Number",
        menu_search: "🎬 Search Movie", 
        menu_genres: "🎭 Genres",
        menu_cab: "👤 Profile", 
        menu_prem: "💎 Premium",
        search_prompt: "🔎 Enter movie name or plot:",
        not_found: "😔 Nothing found.",
        daily_limit: "⛔️ <b>Trial ended!</b> Pay or invite friends.",
        cabinet_title: "👤 <b>Your Profile:</b>",
        trial_active: "✅ Registration successful!\n🎁 <b>1 month Free Premium activated.</b>",
        genres_title: "🎭 <b>Choose Genre:</b>",
        watch_ru: "🇷🇺 Watch (Direct)",
        watch_ru_yandex: "🇷🇺 Search (Yandex)",
        watch_uz: "🇺🇿 Watch (Asilmedia)",
        watch_en: "🇺🇸 English (Direct)",
        results: "🔎 Results:",
        genre_names: {
            28: "Action", 35: "Comedy", 27: "Horror", 18: "Drama",
            14: "Fantasy", 10749: "Romance", 16: "Animation", 878: "Sci-Fi"
        },
        genre_selected: "✅ Genre selected: <b>{genre}</b>.\n\nNow type a movie title or description (e.g., \"Best action movies\")."
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
            lang: 'uz', // Default
            searchCount: 0, // Bepul ishlatganlari
            joinedDate: new Date()
        });
    }
    return user;
}

// Obuna va Limitlarni tekshirish
function checkAccess(user) {
    // 1. Agar telefoni bo'lsa (Ro'yxatdan o'tgan)
    if (user.phone) {
        // Trial muddatini tekshiramiz
        const now = new Date();
        const diffTime = Math.abs(now - user.joinedDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (user.isPremium) return { allowed: true }; // Doimiy premium
        if (user.isTrial && diffDays <= CONFIG.trialDays) return { allowed: true }; // Trial davri
        
        return { allowed: false, reason: 'subscription_expired' };
    }

    // 2. Agar telefoni yo'q bo'lsa (Yangi user)
    if (user.searchCount < CONFIG.freeSearchLimit) {
        return { allowed: true, updateCount: true };
    }

    return { allowed: false, reason: 'register_required' };
}

// --- API Funksiyalari ---
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

// --- Bot Logikasi ---

// 1. START
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    await getUser(userId, ctx.from.first_name); // Userni bazaga yozamiz (agar yo'q bo'lsa)
    
    // Referal logikasi
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

    // Faqat til tanlashni so'raymiz
    ctx.reply("🌍 Iltimos, tilni tanlang / Please choose language:", 
        Markup.keyboard([['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English']]).resize()
    );
});

// 2. TIL TANLASH VA PREVIEW
bot.hears(['🇺🇿 O\'zbek', '🇷🇺 Русский', '🇺🇸 English'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    
    if (ctx.message.text === '🇺🇿 O\'zbek') user.lang = 'uz';
    else if (ctx.message.text === '🇷🇺 Русский') user.lang = 'ru';
    else user.lang = 'en';
    await user.save();

    const t = TEXTS[user.lang]; 

    // Preview (Bot haqida qisqa ma'lumot)
    await ctx.replyWithHTML(t.preview);

    // Menyuni chiqaramiz
    await ctx.reply(t.welcome_menu, Markup.keyboard([
        [t.menu_search, t.menu_genres],
        [t.menu_cab, t.menu_prem]
    ]).resize());
});

// 3. KONTAKT (REGISTRATSIYA)
bot.on('contact', async (ctx) => {
    const user = await getUser(ctx.from.id);
    user.phone = ctx.message.contact.phone_number;
    user.isTrial = true; // 1 oy bepul beramiz
    user.joinedDate = new Date(); // Vaqtni yangilaymiz
    await user.save();
    
    const t = TEXTS[user.lang || 'uz'];
    await ctx.replyWithHTML(t.trial_active);
    await ctx.reply(t.welcome_menu, Markup.keyboard([
        [t.menu_search, t.menu_genres],
        [t.menu_cab, t.menu_prem]
    ]).resize());
});

// 4. JANRLAR (Tarjima qilingan)
bot.hears(['🎭 Janrlar', '🎭 Жанры', '🎭 Genres'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;
    const names = t.genre_names;

    // Tugmalarni user tilida chiqaramiz
    const buttons = [
        [Markup.button.callback('💥 ' + names[28], 'genre_28'), Markup.button.callback('😂 ' + names[35], 'genre_35')],
        [Markup.button.callback('🧟‍♂️ ' + names[27], 'genre_27'), Markup.button.callback('🎭 ' + names[18], 'genre_18')],
        [Markup.button.callback('🧙‍♂️ ' + names[14], 'genre_14'), Markup.button.callback('💘 ' + names[10749], 'genre_10749')],
        [Markup.button.callback('🧸 ' + names[16], 'genre_16'), Markup.button.callback('🚀 ' + names[878], 'genre_878')]
    ];

    ctx.replyWithHTML(t.genres_title, Markup.inlineKeyboard(buttons));
});

// Janr tanlanganda (Top 10 EMAS, Qidiruvga undash)
bot.action(/genre_(\d+)/, async (ctx) => {
    const genreId = ctx.match[1];
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;
    const genreName = t.genre_names[genreId];

    await ctx.answerCbQuery();
    // Foydalanuvchiga: "Siz X janrini tanladingiz, endi qidiring" deymiz.
    const msg = t.genre_selected.replace('{genre}', genreName);
    ctx.replyWithHTML(msg);
});

// 5. ASOSIY QIDIRUV (TEXT)
bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;

    // Menyu buyruqlarini o'tkazib yuborish
    const allMenus = [];
    Object.values(TEXTS).forEach(lang => {
        allMenus.push(lang.menu_search, lang.menu_genres, lang.menu_cab, lang.menu_prem);
    });
    if (allMenus.includes(userInput)) return;

    // HUQUQNI TEKSHIRISH (ACCESS CHECK)
    const access = checkAccess(user);

    // 1. Agar registratsiya qilmagan va limiti tugagan bo'lsa -> RAQAM SO'RASH
    if (!access.allowed && access.reason === 'register_required') {
        return ctx.replyWithHTML(t.register_limit, Markup.keyboard([
            [Markup.button.contactRequest(t.btn_phone)]
        ]).resize().oneTime());
    }

    // 2. Agar registratsiya qilgan lekin obunasi tugagan bo'lsa
    if (!access.allowed && access.reason === 'subscription_expired') {
        return ctx.replyWithHTML(t.daily_limit);
    }

    // 3. Agar ruxsat bo'lsa -> Qidiruvni boshlaymiz
    if (access.updateCount) {
        user.searchCount += 1;
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

// Kabinet
bot.hears(['👤 Kabinet', '👤 Кабинет', '👤 Profile'], async (ctx) => {
    const user = await getUser(ctx.from.id);
    const t = TEXTS[user.lang] || TEXTS.uz;
    const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
    
    let msg = `${t.cabinet_title}\n\n` +
              `🆔 ID: <code>${user.id}</code>\n` +
              `💎 Premium: <b>${user.isPremium || user.isTrial ? '✅ Aktiv' : '❌ Yo\'q'}</b>\n` +
              `🔢 Bepul qidiruvlar: <b>${user.searchCount}/${CONFIG.freeSearchLimit}</b> (Ro'yxatdan o'tmaganlar uchun)\n\n` +
              `🔗 Link:\n<code>${refLink}</code>`;
    
    ctx.replyWithHTML(msg);
});

bot.launch().then(() => console.log('✅ Medorama (Ideal Schema) ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));