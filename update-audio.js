// update-audio.js
const fs = require('fs');
const path = require('path');

// ==========================================
// ⚙️ 설정값: 폴더 경로
// ==========================================
const HTML_FILE = path.join(__dirname, 'index.html');
const AUDIO_DIR = path.join(__dirname, 'assets', 'audio');

const DIRS = {
    free: path.join(AUDIO_DIR, 'free'),
    premium: path.join(AUDIO_DIR, 'premium'),
    bell: path.join(AUDIO_DIR, 'bell')
};

// ==========================================
// 📁 1. 폴더 존재 여부 확인 및 생성
// ==========================================
Object.values(DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 폴더 생성됨: ${dir}`);
    }
});

// ==========================================
// 🔍 2. 프리셋(free/premium) 폴더 스캔 함수
// ==========================================
function scanPresetsFolder(folderName) {
    const folderPath = DIRS[folderName];
    const files = fs.readdirSync(folderPath);

    // 파일명의 prefix 추출 (예: '01' 혹은 'forest-rain')
    const bases = new Set();
    files.forEach(file => {
        if (file.includes('-ambient.mp3')) bases.add(file.replace('-ambient.mp3', ''));
        if (file.includes('-asmr.mp3')) bases.add(file.replace('-asmr.mp3', ''));
    });

    const presets = [];
    bases.forEach(base => {
        // 타이틀 이쁘게 다듬기 (예: "01_Deep_Forest" -> "Deep Forest")
        let title = base.replace(/^[0-9]+-?_?/, '').replace(/[_-]/g, ' ').trim();
        if(!title) title = 'Untitled Mood';
        
        // 첫 글자 대문자 처리
        title = title.replace(/\b\w/g, l => l.toUpperCase());

        // 이미지 파일 체크 (없으면 기본 이미지 대체)
        let imgUrl = `https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&q=60&w=400`;
        if (files.includes(`${base}.png`)) imgUrl = `./assets/audio/${folderName}/${base}.png`;
        else if (files.includes(`${base}.jpg`)) imgUrl = `./assets/audio/${folderName}/${base}.jpg`;

        presets.push({
            type: folderName,
            title: title,
            img: imgUrl,
            asmr: `./assets/audio/${folderName}/${base}-asmr.mp3`,
            ambient: `./assets/audio/${folderName}/${base}-ambient.mp3`
        });
    });

    return presets;
}

// ==========================================
// 🔔 3. 종소리(bell) 폴더 스캔 함수
// ==========================================
function scanBellsFolder() {
    const folderPath = DIRS.bell;
    const files = fs.readdirSync(folderPath);
    
    const bells = {};
    files.forEach(file => {
        if(file.endsWith('.mp3')) {
            const bellKey = file.replace('.mp3', '');
            bells[bellKey] = `./assets/audio/bell/${file}`;
        }
    });
    return bells;
}

// ==========================================
// 🚀 4. HTML 파일 자동 업데이트 실행
// ==========================================
console.log('⏳ 오디오 폴더 스캔을 시작합니다...');

// 데이터 수집
const freePresets = scanPresetsFolder('free');
const premiumPresets = scanPresetsFolder('premium');
const allPresets = [...freePresets, ...premiumPresets];
const allBells = scanBellsFolder();

if (!fs.existsSync(HTML_FILE)) {
    console.error(`❌ 에러: ${HTML_FILE} 파일을 찾을 수 없습니다. (HTML 파일과 스크립트가 같은 폴더에 있는지 확인하세요)`);
    process.exit(1);
}

// HTML 텍스트 읽어오기
let htmlContent = fs.readFileSync(HTML_FILE, 'utf8');

// 정규식으로 마커 영역 찾아서 바꾸기 (Bells)
const bellsRegex = /\/\/ 🚨 \[자동화 스크립트 마커\] START: BELLS([\s\S]*?)\/\/ 🚨 \[자동화 스크립트 마커\] END: BELLS/;
const newBellsCode = `\n        const bells = ${JSON.stringify(allBells, null, 12).replace(/"/g, "'").replace(/'([a-zA-Z0-9_]+)':/g, '$1:')};\n        `;
htmlContent = htmlContent.replace(bellsRegex, `// 🚨 [자동화 스크립트 마커] START: BELLS${newBellsCode}// 🚨 [자동화 스크립트 마커] END: BELLS`);

// 정규식으로 마커 영역 찾아서 바꾸기 (Presets)
const presetsRegex = /\/\/ 🚨 \[자동화 스크립트 마커\] START: PRESETS([\s\S]*?)\/\/ 🚨 \[자동화 스크립트 마커\] END: PRESETS/;
const newPresetsCode = `\n        let appPresets = ${JSON.stringify(allPresets, null, 12).replace(/"/g, "'")};\n        `;
htmlContent = htmlContent.replace(presetsRegex, `// 🚨 [자동화 스크립트 마커] START: PRESETS${newPresetsCode}// 🚨 [자동화 스크립트 마커] END: PRESETS`);

// 덮어쓰기
fs.writeFileSync(HTML_FILE, htmlContent, 'utf8');

console.log(`✅ 업데이트 완료! 총 ${allPresets.length}개의 프리셋과 ${Object.keys(allBells).length}개의 종소리가 HTML에 성공적으로 주입되었습니다.`);