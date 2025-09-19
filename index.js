import { CronJob } from 'cron';
import librarianRun from './librarian/src/index.js';
import analystRun from './analyst/src/index.js';
import publisherRun from './publisher/src/index.js';

const job22h00m = CronJob.from({
    cronTime: '0 0 22 * * *',
    onTick: librarianRun,
    start: true,
    timeZone: 'Europe/Sofia',
});

const job03h00m = CronJob.from({
    cronTime: '0 0 3 * * *',
    onTick: analystRun,
    start: true,
    timeZone: 'Europe/Sofia',
});

const job08h00m = CronJob.from({
    cronTime: '0 0 8 * * *',
    onTick: publisherRun,
    start: true,
    timeZone: 'Europe/Sofia',
});

job22h00m.start();
job03h00m.start();
job08h00m.start();
