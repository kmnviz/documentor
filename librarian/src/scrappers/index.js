import articles from '../articles.json' with { type: 'json' };
import durzhavenVestnik from './durzhavenVestnik.js';

const scrapper = (article) => {
    switch (article) {
        case articles.DURZHAVEN_VESTNIK:
            return durzhavenVestnik;
        default:
            return null;
    }
}

export default scrapper;
