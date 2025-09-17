import dotenv from 'dotenv';
dotenv.config();
import puppeteer from 'puppeteer';
import { CronJob } from 'cron';
import { MongoClient } from 'mongodb';
import axios from 'axios';
import { Storage } from '@google-cloud/storage';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);
const storage = new Storage({keyFilename: process.env.GCP_AUTH_FILE_PATH});
const bucketName = process.env.GCP_BUCKET_NAME;

async function findDocument() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.setDefaultTimeout(600000);
        await page.setDefaultNavigationTimeout(600000);
        await page.goto('https://dv.parliament.bg/DVWeb/broeveList.faces', {
            waitUntil: 'networkidle2',
        });

        const nameSelector = '#broi_form\\:dataTable1 tr:first-child td.td_tabResult0';
        const name = await page.$eval(nameSelector, el => el.textContent);
        const formattedName = name
            .replace(' г. Съдържание на официалния раздел', '')
            .replace('  ', '');

        const linkSelector =
            '#broi_form\\:dataTable1 tr:first-child td.td_tabResult0 + td a';
        await page.waitForSelector(linkSelector);
        await page.click(linkSelector);
        await page.waitForSelector('div.modal_win', { visible: true });

        const link = await page.$$eval('div.modal_win a', (anchors) => {
            if (!anchors.length) return null;
            return anchors[0].href;
        });

        await browser.close();
        return {
            name: formattedName,
            link: link,
        };
    } catch (err) {
        console.error(err);
        await browser.close();
        return null;
    }
}

async function downloadAndUpload(document) {
    try {
        const response = await axios({
            method: 'GET',
            url: document.link,
            responseType: 'stream',
        });

        const destFileName = `${process.env.GCP_BUCKET_DIRECTORY}/${document.name}.${process.env.DOCUMENT_FILE_EXTENSION}`;
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(destFileName);
        const writeStream = file.createWriteStream({
            resumable: false,
            contentType: response.headers['content-type'],
        });

        response.data.pipe(writeStream);

        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                console.log(`Uploaded ${destFileName} to ${bucketName}`);
                resolve();
            });
            writeStream.on('error', reject);
        });
    } catch (err) {
        console.error('Error uploading file: ', err.message);
        throw new Error(err);
    }
}

async function checkAndStoreDocument(document) {
    try {
        await client.connect();
        const db = client.db('documentor');
        const collection = db.collection('durzhaven_vestnik');

        const existing = await collection.findOne({ name: document.name });
        if (!existing) {
            await downloadAndUpload(document);
            const result = await collection.insertOne(document);
            console.log(`New document inserted with _id: ${result.insertedId}`);
        } else {
            console.log(`Document with name "${document.name}" already exists.`);
        }

        await client.close();
        return existing;
    } catch (err) {
        await client.close();
        console.error('MongoDB error:', err);
        return false;
    }
}

(async () => {
    const document = await findDocument();
    console.log('document: ', document);
    await checkAndStoreDocument(document);
})()

// const job = CronJob.from({
//     cronTime: '0 0 * * * *',
//     onTick: checkAndStoreDocument,
//     start: true,
// });
