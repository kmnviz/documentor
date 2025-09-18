import collections from '../../../config/collections.json' with { type: 'json' };
import durzhavenVestnik from './durzhavenVestnik.js';

const scrapper = (collection) => {
    switch (collection) {
        case collections.DURZHAVEN_VESTNIK:
            return durzhavenVestnik;
        default:
            return null;
    }
}

export default scrapper;
