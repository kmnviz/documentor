import dotenv from 'dotenv';
dotenv.config();
import { CronJob } from 'cron';
import librarianRun from './librarian/src/index.js';

// Every day at 00:00
const job = CronJob.from({
    cronTime: '0 0 0 * * *',
    onTick: librarianRun,
    start: true,
});

job.start();
