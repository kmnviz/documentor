import dotenv from 'dotenv';
dotenv.config();
import { CronJob } from 'cron';
import { MongoClient } from 'mongodb';
import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import pdf from 'pdf-parse';
import { encoding_for_model } from 'tiktoken';
import OpenAI from 'openai';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const mongoClient = new MongoClient(uri);
const storage = new Storage({keyFilename: process.env.GCP_AUTH_FILE_PATH});
const bucketName = process.env.GCP_BUCKET_NAME;
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
// const openai = new OpenAI({
//     baseURL: process.env.DEEPSEEK_API_URL,
//     apiKey: process.env.DEEPSEEK_API_KEY,
// });

const filePath = 'durzhaven_vestnik/Брой 76, 16.9.2025.pdf';
const fileName = 'Брой 76, 16.9.2025';

const getDocument = async () => {
    const [contents] = await storage.bucket(bucketName).file(filePath).download();
    console.log('contents: ', contents);
    return contents;
}

const extractText = async (buffer) => {
    const data = await pdf(buffer);
    console.log('data: ', data);
    return data.text;
}

function countTokens(text, model = 'gpt-4-turbo') {
    const enc = encoding_for_model(model);
    const tokens = enc.encode(text);
    enc.free();
    console.log('tokens: ', tokens.length);
    return tokens.length;
}

const prompt = `Имаш задача да анализираш едно издание на Държавен вестник (официалното издание на Република България за публикуване на закони, наредби, постановления, конкурси и други нормативни актове). 

Инструкция:

1. Раздели съдържанието на структурни категории:
   - Закони
   - Наредби и правилници
   - Постановления на Министерски съвет
   - Заповеди на министри и други органи
   - Обяви, конкурси и известия
   - **Икономически ефект**: кого поощряват измененията (например конкретни сектори, фирми или граждани) и кого ще засегнат или ощетят

Остани на фактите от публикациите и не добавяй лични мнения или интерпретации.`;

const summarizeText = async (text) => {
    const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Използвай следното PDF съдържание: \n\n${text}` },
        ],
    });

    return response.choices[0].message.content;
}

async function upsertSummary(name, summary) {
    try {
        await mongoClient.connect();
        const db = mongoClient.db('documentor');
        const collection = db.collection('durzhaven_vestnik');

        const result = await collection.updateOne(
            {name},
            {$set: {summary}},
            {upsert: true},
        );

        console.log(`MongoDB upsert result:`, result);
    } finally {
        await mongoClient.close();
    }
}

(async () => {
    const content = await getDocument();
    const text = await extractText(content);

    countTokens(text);
    const summary = await summarizeText(text);
    console.log('summary: ', summary);

    await upsertSummary(fileName, summary);
})()
