const axios = require('axios');
const cheerio = require('cheerio');

async function fetchArtifactLinks(baseUrl) {
    const response = await axios.get(baseUrl);
    const $ = cheerio.load(response.data);

    let version = 'Desconhecida';
    let windowsLink = null;
    let linuxLink = null;

    $('code').each((_, el) => {
        const text = $(el).text().trim();
        if (text.match(/\d+/g) && version === 'Desconhecida') {
            version = text;
        }
    });

    $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (href.includes('windows')) windowsLink = href;
        if (href.includes('linux')) linuxLink = href;
    });

    return { version, windowsLink, linuxLink };
}

module.exports = { fetchArtifactLinks };
