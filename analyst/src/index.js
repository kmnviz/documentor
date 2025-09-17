import dotenv from 'dotenv';
dotenv.config();
import { MongoClient } from 'mongodb';
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

const fetch = async (filePath) => {
    try {
        await mongoClient.connect();
        const db = mongoClient.db(process.env.MONGO_DB);
        const collection = db.collection(article.collection);
        const isExisting = await collection.findOne({ name: file.name });

        if (isExisting) {
            console.log(`store.file ${file.name} already exist.`);
            return;
        }

        const [contents] = await storage.bucket(bucketName).file(filePath).download();

        if (contents.length === 0) {
            console.log(`fetch.contents is empty for ${filePath} file path`);
            return;
        }

        return (await pdf(contents))?.text;
    } catch (error) {
        console.log('fetch.error: ', error);
        throw new Error(error);
    }
}

const analyze = async (text) => {
    const enc = encoding_for_model('gpt-4-turbo');
    const tokens = enc.encode(text);
    enc.free();
    console.log('analyze.tokens length is: ', tokens.length);

    const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: `Използвай следното PDF съдържание: \n\n${text}` },
        ],
    });

    return response.choices[0].message.content;
}