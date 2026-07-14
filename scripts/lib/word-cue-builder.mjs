import path from 'path';
import { spawnSync, execFileSync } from 'child_process';

export function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

export function probeDurationSeconds(filePath) {
  const output = execFileSync(
    'ffprobe',
    ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath],
    { encoding: 'utf8' },
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe duration 실패: ${filePath}`);
  }
  return duration;
}

export function tokenizeSpeechText(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function speechWeight(text) {
  const value = String(text || '').replace(/\s+/g, '');
  return value.length || 1;
}

function parseSilenceEvents(stderr) {
  const events = [];
  for (const match of stderr.matchAll(/silence_(start|end): ([0-9.]+)/g)) {
    events.push({ type: match[1], time: Number(match[2]) });
  }
  return events;
}

function parseDuration(stderr) {
  const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function detectSpeechRegions(filePath, {
  noiseDb = -35,
  minSilence = 0.025,
} = {}) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-i',
      filePath,
      '-af',
      `silencedetect=noise=${noiseDb}dB:d=${minSilence}`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );

  const stderr = result.stderr || '';
  const duration = probeDurationSeconds(filePath);
  const events = parseSilenceEvents(stderr);
  const regions = [];
  let cursor = 0;

  for (let i = 0; i < events.length; i += 1) {
    const current = events[i];
    if (current.type !== 'start') continue;
    const next = events[i + 1];
    if (!next || next.type !== 'end') continue;

    if (current.time > cursor + 0.008) {
      regions.push({ start: cursor, end: current.time });
    }
    cursor = next.time;
    i += 1;
  }

  if (duration > cursor + 0.008) {
    regions.push({ start: cursor, end: duration });
  }

  return regions.filter((region) => region.end - region.start >= 0.02);
}

function mergeRegionsToCount(regions, targetCount) {
  const merged = regions.map((region) => ({ ...region }));

  while (merged.length > targetCount) {
    let bestIndex = 0;
    let bestGap = Infinity;

    for (let i = 0; i < merged.length - 1; i += 1) {
      const gap = merged[i + 1].start - merged[i].end;
      if (gap < bestGap) {
        bestGap = gap;
        bestIndex = i;
      }
    }

    merged[bestIndex] = {
      start: merged[bestIndex].start,
      end: merged[bestIndex + 1].end,
    };
    merged.splice(bestIndex + 1, 1);
  }

  return merged;
}

function partitionWordsIntoGroups(weights, groupCount) {
  const wordCount = weights.length;
  if (groupCount <= 0 || !wordCount) return [];
  if (groupCount >= wordCount) {
    return weights.map((_, index) => [index]);
  }

  const prefix = new Array(wordCount + 1).fill(0);
  for (let i = 0; i < wordCount; i += 1) {
    prefix[i + 1] = prefix[i] + weights[i];
  }

  const dp = Array.from({ length: wordCount + 1 }, () => Array(groupCount + 1).fill(Infinity));
  const back = Array.from({ length: wordCount + 1 }, () => Array(groupCount + 1).fill(-1));
  dp[0][0] = 0;

  for (let i = 1; i <= wordCount; i += 1) {
    for (let g = 1; g <= Math.min(i, groupCount); g += 1) {
      for (let j = g - 1; j < i; j += 1) {
        const groupWeight = prefix[i] - prefix[j];
        const cost = dp[j][g - 1] + groupWeight * groupWeight;
        if (cost < dp[i][g]) {
          dp[i][g] = cost;
          back[i][g] = j;
        }
      }
    }
  }

  const groups = Array.from({ length: groupCount }, () => []);
  let wordIndex = wordCount;
  let groupIndex = groupCount;

  while (groupIndex > 0) {
    const split = back[wordIndex][groupIndex];
    for (let i = split; i < wordIndex; i += 1) {
      groups[groupIndex - 1].push(i);
    }
    wordIndex = split;
    groupIndex -= 1;
  }

  return groups;
}

export function alignWordsToSpeechRegions(words, regions, globalOffset = 0) {
  if (!words.length) return [];

  const weights = words.map(speechWeight);
  let speechRegions = regions.length ? regions.slice() : [{ start: 0, end: 1 }];

  if (speechRegions.length > words.length) {
    speechRegions = mergeRegionsToCount(speechRegions, words.length);
  }

  const groups = partitionWordsIntoGroups(weights, speechRegions.length);
  const result = [];

  for (let groupIndex = 0; groupIndex < speechRegions.length; groupIndex += 1) {
    const region = speechRegions[groupIndex];
    const indices = groups[groupIndex] || [];
    const regionDuration = Math.max(region.end - region.start, 0.02);
    const groupWeight = indices.reduce((sum, index) => sum + weights[index], 0) || indices.length || 1;
    let cursor = region.start;

    for (let i = 0; i < indices.length; i += 1) {
      const wordIndex = indices[i];
      const share = indices.length === 1
        ? regionDuration
        : (weights[wordIndex] / groupWeight) * regionDuration;
      const start = cursor;
      const end = i === indices.length - 1 ? region.end : cursor + share;

      result.push({
        text: words[wordIndex],
        start: roundTime(globalOffset + start),
        end: roundTime(globalOffset + end),
      });
      cursor = end;
    }
  }

  for (let i = 1; i < result.length; i += 1) {
    if (result[i].start < result[i - 1].end) {
      result[i].start = result[i - 1].end;
    }
    if (result[i].end <= result[i].start) {
      result[i].end = roundTime(result[i].start + 0.02);
    }
  }

  return result;
}

export function buildWordsFromSegmentMp3(mp3Path, text, globalOffset = 0) {
  const words = tokenizeSpeechText(text);
  if (!words.length) return [];

  const regions = detectSpeechRegions(mp3Path);
  return alignWordsToSpeechRegions(words, regions, globalOffset);
}

export function segmentFilesForUnit(segmentDir, unitIndex, unit, paragraphs) {
  const ttsTexts = Array.isArray(unit.ttsTexts) && unit.ttsTexts.length
    ? unit.ttsTexts
    : unit.paragraphIndices.map((paragraphIndex) => paragraphs[paragraphIndex]);

  return ttsTexts.map((text, textIndex) => {
    const paragraphIndex = unit.paragraphIndices[textIndex] ?? unit.paragraphIndices[0] ?? 0;
    const suffix = ttsTexts.length > 1 ? `-part-${String(textIndex).padStart(2, '0')}` : '';
    return {
      filePath: path.join(
        segmentDir,
        `unit-${String(unitIndex).padStart(2, '0')}-para-${String(paragraphIndex).padStart(2, '0')}${suffix}.mp3`,
      ),
      text,
    };
  });
}

export function buildWordCuesFromPlan({ plan, paragraphs, segmentDir }) {
  const words = [];
  let timelineCursor = 0;

  for (let unitIndex = 0; unitIndex < plan.length; unitIndex += 1) {
    const unit = plan[unitIndex];
    const files = segmentFilesForUnit(segmentDir, unitIndex, unit, paragraphs);

    for (const file of files) {
      const duration = probeDurationSeconds(file.filePath);
      const unitWords = buildWordsFromSegmentMp3(file.filePath, file.text, timelineCursor);
      words.push(...unitWords);
      timelineCursor = roundTime(timelineCursor + duration);
    }
  }

  if (words.length) {
    const lastWord = words[words.length - 1];
    if (lastWord.end < timelineCursor) {
      words[words.length - 1] = {
        ...lastWord,
        end: roundTime(timelineCursor),
      };
    }
  }

  return words;
}
