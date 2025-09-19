import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import puppeteer from 'puppeteer';
import { MongoClient } from 'mongodb';
import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import library from '../../config/library.json' with { type: 'json' };
import scrappers from './scrappers/index.js';

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const mongoClient = new MongoClient(mongoUri);
const keyFilePath = path.resolve(__dirname, process.env.GCP_AUTH_FILE_PATH);
const storage = new Storage({keyFilename: keyFilePath});
const bucketName = process.env.GCP_BUCKET_NAME;

await mongoClient.connect();
const db = mongoClient.db(process.env.MONGO_DB);

const find = async (link, scrapper) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    page.setDefaultTimeout(600000);
    page.setDefaultNavigationTimeout(600000);

    try {
        await page.goto(link, {
            waitUntil: 'networkidle2',
        });

        const file = await scrapper(page);

        if (!file) {
            console.log(`find.file not found on ${link}`);
            return;
        }

        await browser.close();

        return file;
    } catch (error) {
        await browser.close();
        console.log('find.error: ', error);
        throw new Error(error);
    }
}

const store = async (file, article) => {
    try {
        const collection = db.collection(article.collection);
        const isExisting = await collection.findOne({ name: file.name });

        if (isExisting) {
            console.log(`store.file ${file.name} already exist.`);
            return;
        }

        const response = await axios({
            method: 'GET',
            url: file.link,
            responseType: 'stream',
        });

        const destFilePath = `${article.directory}/${file.name}.${article.extension}`;
        const bucket = storage.bucket(bucketName);
        const bucketFile = bucket.file(destFilePath);
        const writeStream = bucketFile.createWriteStream({
            resumable: false,
            contentType: response.headers['content-type'],
        });

        response.data.pipe(writeStream);

        await new Promise((resolve, reject) => {
            writeStream.on('finish', async () => {
                console.log(`store.uploaded ${destFilePath} to ${article.directory}`);
                try {
                    const record = await collection.insertOne({
                        ...file,
                        filePath: destFilePath,
                        downloadLink: `https://storage.googleapis.com/${bucketName}/${destFilePath}`,
                    });
                    console.log(`store.stored: ${record.insertedId}`);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
            writeStream.on('error', reject);
        });
    } catch (error) {
        console.log('store.error: ', error);
        throw new Error(error);
    }
}

const run = async () => {
    for (let i = 0; i < library.length; i++) {
        const article = library[i];
        const scrapper = scrappers(article.name);
        const file = await find(article.link, scrapper);
        console.log('file: ', file);
        await store(file, article);
    }
}

(async () => { return await run(); })();
export default run;
