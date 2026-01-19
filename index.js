require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const mongoose = require('mongoose');
const express = require('express');

// --- Server ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Medorama RU is active'));
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

// --- Kalitlar ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = process.env.ADMIN_ID;

if (!BOT_TOKEN || !GEMINI_API_KEY || !TMDB_API_KEY) {
    console.error('Ошибка: Отсутствуют ключи в .env!');
    process.exit(1);
}

// --- MongoDB ---
if (MONGO_URI) {
    mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB подключена')).catch(e => console.log(e));
}

// User Model
const userSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    phone: String,
    lang: { type: String, default: 'ru' },
    points: { type: Number, default: 0 },
    searchCount: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    isTrial: { type: Boolean, default: false },
    joinedDate: Date,
    referrals: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Movie Model
const movieSchema = new mongoose.Schema({
    file_id: String,
    title: String,
    caption: String,
    addedBy: Number
});
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
    pointsPerRef: 100,
    topLimit: 10
};

// --- 40+ KATEGORIYALAR BAZASI ---
// type: 'genre' (rasmiy janr) yoki 'keyword' (mavzu)
const CATEGORIES = [
    // Asosiy Janrlar
    { name: "💥 Боевик", id: 28, type: "genre" },
    { name: "😂 Комедия", id: 35, type: "genre" },
    { name: "🎭 Драма", id: 18, type: "genre" },
    { name: "🧟‍♂️ Ужасы", id: 27, type: "genre" },
    { name: "💘 Романтика", id: 10749, type: "genre" },
    { name: "🚀 Фантастика", id: 878, type: "genre" },
    { name: "🧙‍♂️ Фэнтези", id: 14, type: "genre" },
    { name: "🧸 Мультфильмы", id: 16, type: "genre" },
    { name: "🔪 Триллер", id: 53, type: "genre" },
    { name: "🕵️ Криминал", id: 80, type: "genre" },
    { name: "🤠 Вестерн", id: 37, type: "genre" },
    { name: "🏰 Исторический", id: 36, type: "genre" },
    { name: "🎖 Военный", id: 10752, type: "genre" },
    { name: "🧩 Детектив", id: 9648, type: "genre" },
    { name: "👨‍👩‍👧‍👦 Семейный", id: 10751, type: "genre" },
    { name: "📹 Документальный", id: 99, type: "genre" },
    { name: "🎼 Музыка", id: 10402, type: "genre" },
    { name: "🧗‍♂️ Приключения", id: 12, type: "genre" },

    // Maxsus Mavzular (Keywords)
    { name: "🇯🇵 Аниме", id: 210024, type: "keyword" },
    { name: "🦸‍♂️ Супергерои (Marvel/DC)", id: 9748, type: "keyword" },
    { name: "🧟 Зомби", id: 12377, type: "keyword" },
    { name: "🧛‍♂️ Вампиры", id: 3133, type: "keyword" },
    { name: "👽 Инопланетяне", id: 9951, type: "keyword" },
    { name: "🥋 Боевые искусства", id: 9568, type: "keyword" },
    { name: "🏎 Гонки", id: 830, type: "keyword" },
    { name: "⚽ Спорт", id: 6075, type: "keyword" },
    { name: "⏳ Путешествия во времени", id: 4385, type: "keyword" },
    { name: "🤖 Киберпанк", id: 10084, type: "keyword" },
    { name: "🏝 Выживание", id: 10594, type: "keyword" },
    { name: "👻 Призраки", id: 642, type: "keyword" },
    { name: "👹 Монстры", id: 1299, type: "keyword" },
    { name: "🕵️ Шпионы", id: 470, type: "keyword" },
    { name: "🌋 Катастрофы", id: 4414, type: "keyword" },
    { name: "👮‍♂️ Полиция", id: 6054, type: "keyword" },
    { name: "⛓ Тюрьма", id: 378, type: "keyword" },
    { name: "🦈 Акулы", id: 14909, type: "keyword" },
    { name: "🧙 Ведьмы", id: 616, type: "keyword" },
    { name: "📖 Основано на реальных событиях", id: 9638, type: "keyword" },
    { name: "🎄 Новогодние", id: 207317, type: "keyword" },
    { name: "🌍 Постапокалипсис", id: 2853, type: "keyword" }
];

// --- Matnlar ---
const TEXTS = {
    welcome_menu: "🏠 Главное меню:",
    preview: "🤖 <b>Привет! Я Medorama.</b>\n\nЯ найду любой фильм для тебя:\n1. 🎬 По названию.\n2. 📝 По описанию сюжета.\n3. 🔗 По ссылке из TikTok/Instagram.\n\n🎁 <b>У тебя есть 2 бесплатных поиска!</b>\nПросто напиши название фильма:",
    register_limit: "⛔️ <b>Бесплатный лимит исчерпан!</b>\n\nДля полного доступа пройдите регистрацию (кнопка ниже).",
    btn_phone: "📱 Отправить номер (Регистрация)",
    
    menu_search: "🎬 Поиск Кино", 
    menu_genres: "🎭 Жанры (Категории)",
    menu_cab: "👤 Кабинет", 
    menu_prem: "💎 Премиум",
    
    search_prompt: "🔎 <b>Напишите название фильма или сюжет:</b>",
    not_found: "😔 К сожалению, ничего не найдено.",
    daily_limit: "⛔️ <b>Пробный период истёк!</b>\n\n1. Пригласите <b>5 друзей</b>.\n2. Или купите Премиум за <b>100 ₽</b>.",
    cabinet_title: "👤 <b>Личный Кабинет:</b>",
    
    trial_active: "✅ <b>Регистрация успешна!</b>\n🎁 Вам начислен <b>1 месяц Премиум</b> доступа бесплатно.",
    premium_active: "💎 Премиум: <b>Активен</b> ✅",
    premium_inactive: "💎 Премиум: <b>Не активен</b> ❌",
    
    genres_title: "🎭 <b>Выберите категорию:</b>\n(Более 40 жанров и тем)",
    top_movies_title: "🔥 <b>ТОП-10: {category}</b>",
    
    watch_ru: "🇷🇺 Смотреть (Плеер)",
    watch_yandex: "🇷🇺 Найти в Яндекс", 
    watch_en: "🇺🇸 English (Original)",
    
    results: "🔎 Результаты:",
    found_in_db: "📼 <b>Найдено в базе бота!</b>\nПриятного просмотра:",
    admin_upload: "✅ Фильм добавлен в базу!"
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
            lang: 'ru',
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
        
        if (user.isPremium) return { allowed: true };
        if (user.isTrial && diffDays <= CONFIG.trialDays) return { allowed: true };
        
        return { allowed: false, reason: 'expired' };
    }
    if (user.searchCount < CONFIG.freeSearchLimit) {
        return { allowed: true, updateCount: true };
    }
    return { allowed: false, reason: 'register' };
}

// --- API ---
// Yangilangan Janr/Mavzu qidiruvi
async function getMoviesByCategory(id, type) {
    try {
        const params = {
            api_key: TMDB_API_KEY,
            sort_by: 'popularity.desc',
            language: 'ru-RU',
            page: 1
        };

        // Agar "Genre" bo'lsa -> with_genres
        // Agar "Keyword" bo'lsa -> with_keywords
        if (type === 'genre') {
            params.with_genres = id;
        } else {
            params.with_keywords = id;
        }

        const response = await axios.get(`https://api.themoviedb.org/3/discover/movie`, { params });
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
        const prompt = `Task: Extract movie title from russian input "${userInput}". Output JSON: { "isMovieRequest": boolean, "searchQuery": "Title" }`;
        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
        return { isMovieRequest: true, searchQuery: userInput };
    }
}

// --- BOT LOGIKASI ---

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
            bot.telegram.sendMessage(referrerId, `🎉 Присоединился новый друг! +100 баллов.`).catch(()=>{});
        }
    }

    await ctx.replyWithHTML(TEXTS.preview);
    await ctx.reply(TEXTS.welcome_menu, Markup.keyboard([
        [TEXTS.menu_search, TEXTS.menu_genres],
        [TEXTS.menu_cab, TEXTS.menu_prem]
    ]).resize());
});

bot.on('video', async (ctx) => {
    if (String(ctx.from.id) !== String(ADMIN_ID)) return;
    const fileId = ctx.message.video.file_id;
    const caption = ctx.message.caption; 
    if (!caption) return ctx.reply("❌ Напишите название фильма в описании!");
    await Movie.create({ file_id: fileId, title: caption.toLowerCase().trim(), caption: caption, addedBy: ctx.from.id });
    ctx.reply(TEXTS.admin_upload, {parse_mode: 'HTML'});
});

bot.on('contact', async (ctx) => {
    const user = await getUser(ctx.from.id);
    user.phone = ctx.message.contact.phone_number;
    user.isTrial = true; 
    user.joinedDate = new Date();
    await user.save();
    
    await ctx.replyWithHTML(TEXTS.trial_active);
    await ctx.reply(TEXTS.welcome_menu, Markup.keyboard([
        [TEXTS.menu_search, TEXTS.menu_genres],
        [TEXTS.menu_cab, TEXTS.menu_prem]
    ]).resize());
});

// --- KENGAYTIRILGAN JANRLAR MENYUSI ---
bot.hears(['🎭 Жанры', '🎭 Жанры (Категории)'], async (ctx) => {
    // 40 ta janrni 2 qator qilib joylashtiramiz
    const buttons = [];
    for (let i = 0; i < CATEGORIES.length; i += 2) {
        const row = [];
        // 1-tugma
        const cat1 = CATEGORIES[i];
        row.push(Markup.button.callback(cat1.name, `cat_${cat1.type}_${cat1.id}`));
        
        // 2-tugma (agar mavjud bo'lsa)
        if (i + 1 < CATEGORIES.length) {
            const cat2 = CATEGORIES[i + 1];
            row.push(Markup.button.callback(cat2.name, `cat_${cat2.type}_${cat2.id}`));
        }
        buttons.push(row);
    }

    ctx.replyWithHTML(TEXTS.genres_title, Markup.inlineKeyboard(buttons));
});

// JANR/MAVZU TANLANGANDA
bot.action(/cat_(\w+)_(\d+)/, async (ctx) => {
    const type = ctx.match[1]; // 'genre' yoki 'keyword'
    const id = ctx.match[2];   // ID raqami
    
    await ctx.answerCbQuery("Загрузка...");
    
    // Kategoriya nomini topish
    const category = CATEGORIES.find(c => c.id == id && c.type == type);
    const catName = category ? category.name : "Фильмы";

    const user = await getUser(ctx.from.id);
    const access = checkAccess(user);
    if (!access.allowed) {
        if (access.reason === 'register') return ctx.replyWithHTML(TEXTS.register_limit);
        if (access.reason === 'expired') return ctx.replyWithHTML(TEXTS.daily_limit);
    }

    try {
        const movies = await getMoviesByCategory(id, type);
        
        if (!movies || movies.length === 0) return ctx.reply(TEXTS.not_found);

        // TOP-10 ro'yxatini chiqaramiz
        const buttons = movies.map(movie => {
            const year = movie.release_date ? movie.release_date.split('-')[0] : '';
            return [Markup.button.callback(`🎬 ${movie.title} (${year})`, `select_${movie.id}`)];
        });

        await ctx.replyWithHTML(TEXTS.top_movies_title.replace('{category}', catName), Markup.inlineKeyboard(buttons));

    } catch (e) { console.error(e); }
});

bot.action(/select_(\d+)/, async (ctx) => {
    try {
        const tmdbId = ctx.match[1];
        await ctx.answerCbQuery();
        
        const movie = await getMovieDetails(tmdbId);
        if (!movie) return ctx.reply("Ошибка загрузки данных.");

        const { title, overview, release_date, poster_path, vote_average } = movie;
        const year = release_date ? release_date.split('-')[0] : '';
        const posterUrl = poster_path ? `https://image.tmdb.org/t/p/w500${poster_path}` : null;

        const linkRu = `https://embed.su/embed/movie/${tmdbId}`;
        const linkYandex = `https://yandex.ru/video/search?text=${encodeURIComponent(title + " смотреть онлайн бесплатно")}`;
        const linkEn = `https://vidsrc.net/embed/movie/${tmdbId}`;

        const buttons = [
            [Markup.button.webApp(TEXTS.watch_ru, linkRu)],
            [Markup.button.webApp(TEXTS.watch_yandex, linkYandex)],
            [Markup.button.webApp(TEXTS.watch_en, linkEn)]
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

bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    const user = await getUser(ctx.from.id);

    if (userInput === TEXTS.menu_search) return ctx.replyWithHTML(TEXTS.search_prompt);
    
    if (userInput === TEXTS.menu_prem) {
        return ctx.replyWithHTML(`💎 <b>Премиум Доступ:</b>\n\n1. Безлимитный поиск.\n2. Доступ к базе.\n\n💰 Цена: <b>100 ₽</b> (или 5 друзей).`);
    }

    if (userInput === TEXTS.menu_cab) {
        const refLink = `https://t.me/${ctx.botInfo.username}?start=${user.id}`;
        let msg = `${TEXTS.cabinet_title}\n\n` +
                  `🆔 ID: <code>${user.id}</code>\n` +
                  `${user.isPremium || user.isTrial ? TEXTS.premium_active : TEXTS.premium_inactive}\n` +
                  `💰 Баллы: <b>${user.points}</b>\n` +
                  `👥 Друзья: <b>${user.referrals}</b>\n\n` +
                  `🔗 Ваша ссылка:\n<code>${refLink}</code>`;
        return ctx.replyWithHTML(msg);
    }

    const access = checkAccess(user);
    if (!access.allowed) {
        if (access.reason === 'register') {
            return ctx.replyWithHTML(TEXTS.register_limit, Markup.keyboard([
                [Markup.button.contactRequest(TEXTS.btn_phone)]
            ]).resize().oneTime());
        }
        if (access.reason === 'expired') return ctx.replyWithHTML(TEXTS.daily_limit);
    }

    try {
        const localMovies = await Movie.find({ 
            title: { $regex: userInput.toLowerCase(), $options: 'i' } 
        });

        if (localMovies.length > 0) {
            await ctx.replyWithHTML(TEXTS.found_in_db);
            for (let movie of localMovies) {
                await ctx.replyWithVideo(movie.file_id, {
                    caption: `🎬 <b>${movie.caption}</b>\n\n@medoramabot`,
                    parse_mode: 'HTML'
                });
            }
            if (access.updateCount) { user.searchCount += 1; await user.save(); }
            return; 
        }

        if (access.updateCount) { user.searchCount += 1; await user.save(); }

        const ai = await analyzeIntent(userInput);
        const movies = await searchMoviesList(ai.searchQuery || userInput);

        if (!movies || movies.length === 0) return ctx.reply(TEXTS.not_found);

        const buttons = movies.map(movie => {
            const year = movie.release_date ? movie.release_date.split('-')[0] : '';
            return [Markup.button.callback(`🎬 ${movie.title} (${year})`, `select_${movie.id}`)];
        });

        await ctx.reply(TEXTS.results, Markup.inlineKeyboard(buttons));

    } catch (err) { console.log(err); }
});

bot.launch().then(() => console.log('✅ Medorama RU (40+ Categories) ishga tushdi!'));
process.once('SIGINT', () => bot.stop('SIGINT'));