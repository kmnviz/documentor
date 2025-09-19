import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { MongoClient } from 'mongodb';
import { Storage } from '@google-cloud/storage';
import pdf from 'pdf-parse';
import { encoding_for_model } from 'tiktoken';
import OpenAI from 'openai';
import collections from '../../config/collections.json' with { type: 'json' };
import prompts from './prompts.json' with { type: 'json' };

const gptModel = process.env.GPT_MODEL;
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const mongoClient = new MongoClient(uri);
const keyFilePath = path.resolve(__dirname, process.env.GCP_AUTH_FILE_PATH);
const storage = new Storage({keyFilename: keyFilePath});
const bucketName = process.env.GCP_BUCKET_NAME;
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY,
// });
const openai = new OpenAI({
    baseURL: process.env.DEEPSEEK_API_URL,
    apiKey: process.env.DEEPSEEK_API_KEY,
});

await mongoClient.connect();
const db = mongoClient.db(process.env.MONGO_DB);

const fetch = async () => {
    try {
        const articles = {};
        const names = Object.values(collections);
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const collection = db.collection(name);
            const collectionArticles = await collection.find({ analysis: { $exists: false } });
            const records = await collectionArticles.toArray();
            if (records.length) {
                articles[name] = records ;
            }
        }

        console.log('fetched.');
        return articles;
    } catch (error) {
        console.log('fetch.error: ', error);
        throw new Error(error);
    }
}

const extract = async (filePath) => {
    try {
        const [contents] = await storage.bucket(bucketName).file(filePath).download();

        if (contents.length === 0) {
            console.log(`fetch.contents is empty for ${filePath} file path`);
            return;
        }

        console.log(`extracted ${filePath}.`);
        return (await pdf(contents))?.text;
    } catch (error) {
        console.log('extract.error: ', error);
        throw new Error(error);
    }
}

const analyze = async (name, article, text, prompt) => {
    try {
        const start = Date.now();
        console.log(`analyze ${name}, ${article.name} started...`);
        // const enc = encoding_for_model(gptModel);
        const enc = encoding_for_model('gpt-4-turbo');
        const tokens = enc.encode(text);
        enc.free();

        const response = await openai.chat.completions.create({
            model: gptModel,
            messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: `${prompt.user}\n\n${text}` },
            ],
        });

        const end = Date.now();
        const duration = ((end - start) / 1000).toFixed(2); // seconds

        console.log(`analyzed ${name}, ${article.name}.`);
        return {
            content: response.choices[0].message.content,
            model: gptModel,
            tokens: tokens.length,
            prompt: prompt.version,
            duration: Number(duration),
        };
    } catch (error) {
        console.log('analyze.error: ', error);
        throw new Error(error);
    }
}

const store = async (name, article, analysis) => {
    try {
        const collection = db.collection(name);

        await collection.updateOne(
            { name: article.name },
            { $set: { analysis: analysis }},
            { upsert: true },
        );

        console.log(`store.upserted ${name}, ${article.name}.`);
    } catch (error) {
        console.log('store.error: ', error);
        throw new Error(error);
    }
}

const run = async () => {
    const collections = await fetch();
    const names = Object.keys(collections);

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const articles = collections[name];

        for (let y = 0; y < articles.length; y++) {
            const article = articles[i];
            const text = await extract(article.filePath);
            const prompt = prompts[name][prompts[name]['current']];
            const analysis = await analyze(name, article, text, prompt);
            await store(name, article, analysis);
        }
    }
}

(async () => { return await run(); })();
export default run;