import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import {MongoClient} from 'mongodb';
import {Telegraf} from 'telegraf';
import collections from '../../config/collections.json' with { type: 'json' };

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const mongoClient = new MongoClient(uri);
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

await mongoClient.connect();
const db = mongoClient.db(process.env.MONGO_DB);

const fetch = async () => {
    try {
        const articles = {};
        const names = Object.values(collections);
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const collection = db.collection(name);
            const collectionArticles = await collection.find({ published: { $exists: false }});
            const records = await collectionArticles.toArray();
            if (records.length) {
                articles[name] = records;
            }
        }
        console.log('fetched.');
        return articles;
    } catch (error) {
        console.log('fetch.error: ', error);
        throw new Error(error);
    }
}

const publish = async (name, article) => {
    try {
        const collection = db.collection(name);
        await collection.updateOne(
            { name: article.name },
            { $set: { published: true } },
            { upsert: true }
        );
        await bot.telegram.sendMessage(process.env.TELEGRAM_CHANNEL, article.analysis.content);
        console.log('published.');
    } catch (error) {
        console.log('post.error: ', error);
        throw new Error(error);
    }
}

const run = async () => {
    const collections = await fetch();
    const names = Object.keys(collections);
    for (let i = 0; i < names.length; i++) {
        const name = names[i]; const articles = collections[name];
        for (let y = 0; y < articles.length; y++) {
            const article = articles[i];
            await publish(name, article);
        }
    }
}

(async () => { return await run() })()
export default run;
