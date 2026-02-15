const fs = require('fs');
const path = require('path');

// 각 책의 장별 절 수 (개역한글 기준) - 열왕기하 15장까지
const bibleStructure = {
  "창세기": [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  "출애굽기": [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  "레위기": [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],
  "민수기": [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  "신명기": [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  "여호수아": [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  "사사기": [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  "룻기": [22,23,18,22],
  "사무엘상": [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],
  "사무엘하": [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  "열왕기상": [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  "열왕기하": [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38]
};

// 모든 gomna_data JS 파일 읽기
const dataDir = path.join(__dirname);
const dataFiles = fs.readdirSync(dataDir).filter(f => f.startsWith('gomna_data_') && f.endsWith('.js'));

let allData = '';
dataFiles.forEach(f => {
  allData += fs.readFileSync(path.join(dataDir, f), 'utf8');
});

const htmlFile = path.join(dataDir, 'gomna_blue.html');
if (fs.existsSync(htmlFile)) {
  allData += fs.readFileSync(htmlFile, 'utf8');
}

console.log('=== 누락된 주석 데이터 검출 (창세기 ~ 열왕기하 15장) ===\n');
console.log('검사 대상 파일:', dataFiles.join(', '), '+ gomna_blue.html\n');

let totalMissing = 0;
let missingReport = [];

Object.keys(bibleStructure).forEach(book => {
  const chapters = bibleStructure[book];
  let bookMissing = [];

  chapters.forEach((verseCount, chapterIdx) => {
    const chapter = chapterIdx + 1;
    let missingVerses = [];

    for (let verse = 1; verse <= verseCount; verse++) {
      const key = `${book}_${chapter}_${verse}`;
      if (!allData.includes(`pastorCommentaryData["${key}"]`)) {
        missingVerses.push(verse);
        totalMissing++;
      }
    }

    if (missingVerses.length > 0) {
      let ranges = [];
      let start = missingVerses[0];
      let prev = missingVerses[0];

      for (let i = 1; i < missingVerses.length; i++) {
        if (missingVerses[i] === prev + 1) {
          prev = missingVerses[i];
        } else {
          ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
          start = missingVerses[i];
          prev = missingVerses[i];
        }
      }
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);

      bookMissing.push(`  ${chapter}장: ${ranges.join(', ')}절 (${missingVerses.length}절 누락)`);
    }
  });

  if (bookMissing.length > 0) {
    missingReport.push(`\n【${book}】 - ${bookMissing.length}개 장에서 누락 발견`);
    bookMissing.forEach(line => missingReport.push(line));
  } else {
    missingReport.push(`\n【${book}】 - ✅ 완료`);
  }
});

console.log(missingReport.join('\n'));
console.log(`\n=== 총 누락: ${totalMissing}절 ===`);
