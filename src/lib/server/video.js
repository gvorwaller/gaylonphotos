/**
 * Video processing module — thumbnail extraction, metadata probe, and
 * normalization to web-friendly H.264 MP4 via system ffmpeg/ffprobe.
 *
 * No npm dependencies — uses child_process.execFile directly.
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const execFile = promisify(execFileCb);

const THUMB_WIDTH = 400;
const POSTER_WIDTH = 1600;

/**
 * Generate a random temp file path.
 * @param {string} ext — file extension including dot
 * @returns {string}
 */
function tempPath(ext) {
	return join(tmpdir(), `gp-video-${randomBytes(8).toString('hex')}${ext}`);
}

/**
 * Check that ffmpeg and ffprobe are available on the system.
 * @returns {Promise<boolean>}
 */
export async function checkFfmpeg() {
	try {
		await execFile('ffprobe', ['-version']);
		await execFile('ffmpeg', ['-version']);
		return true;
	} catch {
		return false;
	}
}

/**
 * Extract video metadata via ffprobe.
 * @param {string} filePath — path to video file on disk
 * @returns {Promise<{duration: number, width: number, height: number, codec: string, audioCodec: string|null}>}
 */
export async function extractVideoMetadata(filePath) {
	const { stdout } = await execFile('ffprobe', [
		'-v', 'quiet',
		'-print_format', 'json',
		'-show_format',
		'-show_streams',
		filePath
	]);

	const probe = JSON.parse(stdout);
	const videoStream = probe.streams?.find((s) => s.codec_type === 'video');
	const audioStream = probe.streams?.find((s) => s.codec_type === 'audio');

	// Extract creation date from format tags (common in MP4/MOV)
	const creationTime = probe.format?.tags?.creation_time || null;
	let date = null;
	if (creationTime) {
		try {
			const d = new Date(creationTime);
			if (!isNaN(d.getTime())) date = d.toISOString();
		} catch { /* ignore */ }
	}

	// Extract GPS from Apple QuickTime location tag (ISO 6709 format: +DD.DDDD+DDD.DDDD)
	let gps = null;
	const locationTag = probe.format?.tags?.['com.apple.quicktime.location.ISO6709'] || null;
	if (locationTag) {
		const match = locationTag.match(/([+-]\d+\.?\d*?)([+-]\d+\.?\d*)/);
		if (match) {
			const lat = parseFloat(match[1]);
			const lng = parseFloat(match[2]);
			if (isFinite(lat) && isFinite(lng)) gps = { lat, lng };
		}
	}

	return {
		duration: Math.round(parseFloat(probe.format?.duration || '0')),
		width: videoStream?.width || 0,
		height: videoStream?.height || 0,
		codec: videoStream?.codec_name || 'unknown',
		audioCodec: audioStream?.codec_name || null,
		date,
		gps
	};
}

/**
 * Extract a single frame from the video as a JPEG poster and thumbnail.
 * Captures at 1 second in to avoid black/transition frames at 0s.
 *
 * @param {string} filePath — path to video file on disk
 * @returns {Promise<{posterBuffer: Buffer, thumbBuffer: Buffer}>}
 */
export async function extractVideoThumbnail(filePath) {
	// Extract a single frame as JPEG to a temp file
	const framePath = tempPath('.jpg');

	try {
		// Try at 1s first; fall back to 0s for very short clips (Live Photos, etc.)
		let extracted = false;
		for (const seekTime of ['1', '0']) {
			try {
				await execFile('ffmpeg', [
					'-y',
					'-ss', seekTime,     // seek before input (fast)
					'-i', filePath,
					'-vframes', '1',
					'-pix_fmt', 'yuvj420p',  // force full-range YUV (fixes HEVC bt709 clips)
					'-q:v', '2',
					framePath
				]);
				// Verify file was actually written
				await readFile(framePath);
				extracted = true;
				break;
			} catch {
				if (seekTime === '0') {
					// Last resort: try with PNG output (no YUV issues) then convert via Sharp
					const pngPath = tempPath('.png');
					try {
						await execFile('ffmpeg', [
							'-y', '-ss', '0', '-i', filePath,
							'-vframes', '1', pngPath
						]);
						const pngBuf = await readFile(pngPath);
						await writeFile(framePath, await sharp(pngBuf).jpeg({ quality: 90 }).toBuffer());
						extracted = true;
					} finally {
						await unlink(pngPath).catch(() => {});
					}
				}
			}
		}
		if (!extracted) throw new Error('Failed to extract video thumbnail');

		const frameBuffer = await readFile(framePath);

		// Resize to poster (1600px) and thumbnail (400px) via Sharp
		const [posterBuffer, thumbBuffer] = await Promise.all([
			sharp(frameBuffer)
				.resize(POSTER_WIDTH, null, { withoutEnlargement: true })
				.jpeg({ quality: 85 })
				.toBuffer(),
			sharp(frameBuffer)
				.resize(THUMB_WIDTH, null, { withoutEnlargement: true })
				.jpeg({ quality: 80 })
				.toBuffer()
		]);

		return { posterBuffer, thumbBuffer };
	} finally {
		await unlink(framePath).catch(() => {});
	}
}

/**
 * Check whether a video is already web-friendly (H.264 video + AAC audio in MP4).
 * @param {{codec: string, audioCodec: string|null}} meta
 * @returns {boolean}
 */
export function isWebFriendly(meta) {
	const videoOk = meta.codec === 'h264';
	const audioOk = !meta.audioCodec || meta.audioCodec === 'aac';
	return videoOk && audioOk;
}

/**
 * Normalize a video to a web-friendly H.264/AAC MP4 with faststart.
 * If already H.264/AAC, remuxes (no re-encode) with faststart flag.
 * Otherwise, re-encodes to H.264 CRF 23 / AAC.
 *
 * @param {string} inputPath — source video file
 * @param {{codec: string, audioCodec: string|null}} meta — from extractVideoMetadata
 * @returns {Promise<string>} path to the normalized MP4 (caller must clean up)
 */
export async function normalizeVideo(inputPath, meta) {
	const outputPath = tempPath('.mp4');

	if (isWebFriendly(meta)) {
		// Already H.264 + AAC — just remux with faststart (no re-encode)
		await execFile('ffmpeg', [
			'-y',
			'-i', inputPath,
			'-c', 'copy',
			'-movflags', 'faststart',
			outputPath
		], { timeout: 120_000 });
	} else {
		// Re-encode to H.264/AAC
		await execFile('ffmpeg', [
			'-y',
			'-i', inputPath,
			'-c:v', 'libx264',
			'-preset', 'medium',
			'-crf', '23',
			'-c:a', 'aac',
			'-b:a', '128k',
			'-movflags', 'faststart',
			outputPath
		], { timeout: 600_000 }); // up to 10 minutes for re-encode
	}

	return outputPath;
}
