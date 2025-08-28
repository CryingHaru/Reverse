import fs from 'fs';
import path from 'path';
async function visitordata() {
    const response = await fetch('https://www.youtube.com/sw.js_data', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X; US)',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    });

    const text = await response.text();
    if (text.startsWith(")]}'")) {
        const json = JSON.parse(text.slice(4));
        return json?.[0]?.[2]?.[0]?.[0]?.[13];
    }

    return undefined;
}
const visitorvalue = await visitordata();


async function Metadatainfo(videoId) {
    const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X; US)',
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Goog-Visitor-Id': visitorvalue,
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            'Sec-Fetch-Site': 'same-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
            'Accept-Encoding': 'gzip, deflate, br'
        },
        body: JSON.stringify({
            "context": {
                "client": {
                    "hl": "en",
                    "gl": "US",
                    "clientName": "IOS",
                    "clientVersion": "19.45.4",
                    "osName": "iOS",
                    "osVersion": "18.1.0"
                },
                "user": {
                    "lockedSafetyMode": false
                },
                "request": {
                    "useSsl": true,
                    "internalExperimentFlags": [],
                    "consistencyTokenJars": []
                }
            },
            "videoId": videoId,
            "playbackContext": {
                "contentPlaybackContext": {
                    "html5Preference": "HTML5_PREF_WANTS"
                }
            },
            "racyCheckOk": true,
            "contentCheckOk": true
        })
    });
    const data = await response.json();
    return data;
}
const videoId = 'dQw4w9WgXcQ';
const metadata = await Metadatainfo(videoId);

function parseaudiostreams(metadata) {
    let formats = [];
    const streamingData = metadata?.streamingData;
    if (streamingData) {
        const audioFormats = streamingData.adaptiveFormats.filter(format => format.mimeType.includes('audio/'));
        formats = audioFormats.map(format => ({
            itag: format.itag,
            mimeType: format.mimeType,
            bitrate: format.bitrate,
            url: format.url,
            audioQuality: format.audioQuality,
            approxDurationMs: format.approxDurationMs
        }));
    }
    return formats.sort((a, b) => b.bitrate - a.bitrate);
}

function contentlength(url) {
    return new Promise((resolve, reject) => {
        fetch(url, { method: 'HEAD' })
            .then(response => {
                //show in console the headers
                const length = response.headers.get('content-length');
                console.log('Content-Length:', length);
                resolve(length);
            })
    });
}

const formats = parseaudiostreams(metadata);


// Helpers de descarga segmentada
function pickBestFormat(formats) {
    if (!formats || formats.length === 0) return null;
    // Ya vienen ordenados por bitrate desc
    return formats[0];
}

async function supportsByteRanges(url, totalLength) {
    // Verifica rangos solicitando los últimos 2 bytes
    if (!totalLength || totalLength < 2) return false;
    const start = totalLength - 2;
    const end = totalLength - 1;
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Range': `bytes=${start}-${end}`
            }
        });
        // 206 Partial Content indica soporte; 200 puede darse en algunos proxies pero no es confiable
        return res.status === 206;
    } catch {
        return false;
    }
}

function getExtFromMime(mime) {
    if (!mime) return '.bin';
    if (mime.includes('audio/webm')) return '.webm';
    if (mime.includes('audio/mp4')) return '.m4a';
    if (mime.includes('audio/mpeg')) return '.mp3';
    return '.bin';
}

function safeBasename(name) {
    return (name || 'audio_best').replace(/[\\/:*?"<>|]+/g, '_');
}

async function downloadRangeToStream(url, start, end, writeStream, attempt = 1, maxRetries = 5) {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'Range': `bytes=${start}-${end}` }
        });
        if (!(res.status === 206 || res.status === 200)) {
            throw new Error(`HTTP ${res.status}`);
        }

        // Escribir por chunks para evitar mucha memoria
        if (!res.body) throw new Error('No body');
        const reader = res.body.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.length) {
                await new Promise((resolve, reject) => {
                    writeStream.write(Buffer.from(value), err => (err ? reject(err) : resolve()));
                });
            }
        }
        return true;
    } catch (err) {
        if (attempt >= maxRetries) throw err;
        // Backoff simple
        await new Promise(r => setTimeout(r, 250 * attempt));
        return downloadRangeToStream(url, start, end, writeStream, attempt + 1, maxRetries);
    }
}

async function downloadFullToStream(url, writeStream, attempt = 1, maxRetries = 3) {
    try {
        const res = await fetch(url);
        if (!(res.status === 200)) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error('No body');
        const reader = res.body.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.length) {
                await new Promise((resolve, reject) => {
                    writeStream.write(Buffer.from(value), err => (err ? reject(err) : resolve()));
                });
            }
        }
        return true;
    } catch (err) {
        if (attempt >= maxRetries) throw err;
        await new Promise(r => setTimeout(r, 250 * attempt));
        return downloadFullToStream(url, writeStream, attempt + 1, maxRetries);
    }
}

export async function downloadBestAudio(videoId, outDir = '.') {
    // 1) Obtener metadata y elegir el mejor formato
    const info = await Metadatainfo(videoId);
    const fmts = parseaudiostreams(info);
    const best = pickBestFormat(fmts);
    if (!best) throw new Error('No se encontraron formatos de audio');

    const url = best.url;
    let total = await contentlength(url);
    if (!total) throw new Error('No se pudo determinar content-length');

    // 2) Verificar soporte de rangos (requisito para segmentar)
    const hasRanges = await supportsByteRanges(url, total);

    // 3) Definir tamaño de segmento
    const SEGMENT_LENGTH = 9898989; // ~9.9MB
    const useSegmentation = hasRanges && total > SEGMENT_LENGTH;

    const ext = getExtFromMime(best.mimeType);
    const fileBase = safeBasename(`${videoId}_${best.itag}`);
    const outPath = path.join(outDir, `${fileBase}${ext}`);

    // Crear stream de salida
    await fs.promises.mkdir(outDir, { recursive: true });
    const ws = fs.createWriteStream(outPath, { flags: 'w' });

    try {
        if (useSegmentation) {
            let position = 0;
            while (position < total) {
                const end = Math.min(position + SEGMENT_LENGTH - 1, total - 1);
                await downloadRangeToStream(url, position, end, ws);
                position = end + 1;
            }
        } else {
            await downloadFullToStream(url, ws);
        }
    } finally {
        await new Promise(resolve => ws.end(resolve));
    }

    return { path: outPath, bytes: total, segmented: useSegmentation, mimeType: best.mimeType, itag: best.itag };
}

// Ejemplo de uso (comentado):
// const result = await downloadBestAudio('dQw4w9WgXcQ', './downloads');
// console.log('Descargado:', result);

const result = await downloadBestAudio('yPYZpwSpKmA', './downloads');
console.log('Descargado:', result);
