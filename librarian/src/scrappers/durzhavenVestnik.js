export default async (page) => {
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

    return {
        name: formattedName,
        link: link,
    };
};