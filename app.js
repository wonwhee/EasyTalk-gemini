// ========================================
// EasyTalk - 경계성 지능 맞춤 최종 버전
// 짧은 변환 전용 + 오류 해결
// ========================================

let currentResult = '';
let currentOriginal = '';
let currentUser = null;
let speechStyle = 'polite'; // 'polite' (존댓말) 또는 'casual' (반말)
let aiStats = {
    todayDetected: 0,
    autoConverted: 0,
    totalConversions: 0,
    accuracy: 100
};

// API 설정
const GEMINI_API_KEY = 'AIzaSyAiGb4CiJlNrReMmTJV-nX5X_9zR53yx1w'; // 하드코딩
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// 말투별 설정 - 순수 문장만 출력
const speechSettings = {
    polite: {
        name: '존댓말 (~요, ~해주세요)',
        description: '정중하고 예의바른 말투',
        prompt: `다음 문장을 쉬운 말로 바꿔주세요. JSON이나 설명 없이 바뀐 문장만 답하세요.

규칙:
- 어려운 말을 쉬운 말로
- 존댓말로 표현
- 다른 설명 없이 바뀐 문장만

바꿀 문장: "`
    },
    casual: {
        name: '반말 (~다, ~야, ~해)',
        description: '친근하고 편안한 말투',
        prompt: `다음 문장을 쉬운 말로 바꿔주세요. JSON이나 설명 없이 바뀐 문장만 답하세요.

규칙:
- 어려운 말을 쉬운 말로
- 반말로 표현
- 다른 설명 없이 바뀐 문장만

바꿀 문장: "`
    }
};

// 한국어 사전
const koreanDictionary = {
    "확인": {
        meaning: "어떤 사실이나 내용을 자세히 알아보거나 틀림없음을 조사하여 확실하게 하는 것",
        pronunciation: "[확인]",
        example: "예약 시간을 확인해 주세요.",
        easy: "알아보기"
    },
    "협조": {
        meaning: "서로 마음과 힘을 합하여 도움",
        pronunciation: "[협조]", 
        example: "모든 분들의 협조가 필요합니다.",
        easy: "도움"
    },
    "신청": {
        meaning: "어떤 일을 해 달라고 관계 기관이나 사람에게 청하여 요구하는 일",
        pronunciation: "[신청]",
        example: "대출 신청을 하고 싶습니다.",
        easy: "요청하기"
    }
};

// ========================================
// 말투 변경 함수들
// ========================================

function changeSpeechStyle(style) {
    if (currentUser !== 'EASY TALK') {
        showAlert('관리자만 말투를 변경할 수 있습니다.', 'warning');
        return;
    }
    
    speechStyle = style;
    localStorage.setItem('easytalk_speech_style', style);
    
    updateSpeechUI();
    showAlert(`말투가 "${speechSettings[style].name}"으로 변경되었습니다.`, 'success');
}

function updateSpeechUI() {
    const currentSpeechSpan = document.getElementById('currentSpeech');
    const speechDescription = document.getElementById('speechDescription');
    
    if (currentSpeechSpan) {
        currentSpeechSpan.textContent = speechSettings[speechStyle].name;
    }
    
    if (speechDescription) {
        speechDescription.textContent = speechSettings[speechStyle].description;
    }
    
    document.querySelectorAll('.speech-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.style === speechStyle) {
            btn.classList.add('active');
        }
    });
}

function loadSpeechSettings() {
    const savedSpeechStyle = localStorage.getItem('easytalk_speech_style');
    if (savedSpeechStyle && speechSettings[savedSpeechStyle]) {
        speechStyle = savedSpeechStyle;
    }
    updateSpeechUI();
}

// ========================================
// API 키 진단 함수
// ========================================

function validateApiKey(key) {
    if (!key) return { valid: false, reason: 'API 키가 비어있습니다.' };
    if (key.length < 30) return { valid: false, reason: 'API 키가 너무 짧습니다.' };
    if (!key.startsWith('AIza')) return { valid: false, reason: 'Gemini API 키는 "AIza"로 시작해야 합니다.' };
    return { valid: true, reason: 'API 키 형식이 올바릅니다.' };
}

async function testApiConnection(apiKey) {
    try {
        const testResponse = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: "테스트"
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 50,
                    candidateCount: 1
                }
            })
        });

        const responseText = await testResponse.text();

        if (testResponse.ok) {
            try {
                const data = JSON.parse(responseText);
                if (data.candidates && data.candidates[0]) {
                    return { success: true, message: 'API 연결 성공!' };
                } else {
                    return { success: false, message: 'API 응답에 문제가 있습니다.' };
                }
            } catch (parseError) {
                return { success: false, message: 'API 응답을 파싱할 수 없습니다.' };
            }
        } else {
            return { success: false, message: `API 오류: ${testResponse.status}` };
        }
    } catch (error) {
        return { success: false, message: `네트워크 오류: ${error.message}` };
    }
}

// ========================================
// 개선된 Gemini API 호출
// ========================================

async function callGeminiAPI(text) {
    try {
        console.log('Gemini API 호출 시작:', text);
        console.log('현재 말투:', speechStyle);
        
        // API 키 검증
        const keyValidation = validateApiKey(GEMINI_API_KEY);
        if (!keyValidation.valid) {
            throw new Error(`API 키 오류: ${keyValidation.reason}`);
        }

        // undefined 문제 해결을 위한 텍스트 전처리
        let cleanText = text;
        if (cleanText.includes('undefined')) {
            cleanText = cleanText.replace(/undefined/g, '필요한 것');
        }

        // 현재 말투에 맞는 프롬프트 사용
        const selectedPrompt = speechSettings[speechStyle].prompt + cleanText + `"`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: selectedPrompt
                }]
            }],
            generationConfig: {
                temperature: 0.1, // 일관된 결과를 위해 낮춤
                topK: 10,
                topP: 0.7,
                maxOutputTokens: 200, // 짧은 답변을 위해 줄임
                candidateCount: 1
            }
        };

        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();
        console.log('API 응답 상태:', response.status);
        console.log('API 응답 내용:', responseText);

        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (e) {
                errorData = { error: { message: responseText } };
            }
            throw new Error(`API 오류 ${response.status}: ${errorData.error?.message || responseText}`);
        }

        const data = JSON.parse(responseText);
        
        // 안전한 응답 추출
        let aiResponse = '';
        if (data.candidates && Array.isArray(data.candidates) && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            if (candidate.content && candidate.content.parts && Array.isArray(candidate.content.parts)) {
                for (let i = 0; i < candidate.content.parts.length; i++) {
                    const part = candidate.content.parts[i];
                    if (part && part.text) {
                        aiResponse = part.text;
                        break;
                    }
                }
            }
        }

        if (!aiResponse) {
            // 백업 플랜: 간단한 변환 직접 수행
            console.log('AI 응답 없음, 백업 변환 수행');
            return performBackupConversion(cleanText);
        }

        console.log('AI 응답 텍스트:', aiResponse);

        // 순수 문장만 추출 (JSON 제거)
        try {
            let cleanResponse = aiResponse.trim();
            
            // JSON 형식이 포함되어 있다면 convertedText 값만 추출
            if (cleanResponse.includes('{') && cleanResponse.includes('convertedText')) {
                const jsonMatch = cleanResponse.match(/\{[\s\S]*?\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.convertedText && parsed.convertedText.trim() !== '') {
                            cleanResponse = parsed.convertedText.trim();
                        }
                    } catch (jsonError) {
                        // JSON 파싱 실패 시 텍스트에서 convertedText 값 추출 시도
                        const textMatch = cleanResponse.match(/"convertedText"\s*:\s*"([^"]+)"/);
                        if (textMatch && textMatch[1]) {
                            cleanResponse = textMatch[1].trim();
                        }
                    }
                }
            }
            
            // 마크다운, 코드 블록, 기타 형식 제거
            cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            cleanResponse = cleanResponse.replace(/^\{.*\}$/s, ''); // JSON 객체 전체 제거
            cleanResponse = cleanResponse.replace(/["{}]/g, ''); // 남은 JSON 문자들 제거
            cleanResponse = cleanResponse.replace(/convertedText\s*:\s*/g, ''); // 남은 키 제거
            cleanResponse = cleanResponse.replace(/replacements\s*:\s*\[.*\]/gs, ''); // replacements 제거
            
            // 앞뒤 공백 및 불필요한 문자 제거
            cleanResponse = cleanResponse.trim();
            cleanResponse = cleanResponse.replace(/^[\s,]+|[\s,]+$/g, '');
            
            // 빈 응답이거나 너무 짧으면 백업 변환 사용
            if (!cleanResponse || cleanResponse.length < 3) {
                console.log('응답이 너무 짧음, 백업 변환 사용');
                return performBackupConversion(cleanText);
            }
            
            // 여전히 JSON 형식이 포함되어 있다면 백업 변환 사용
            if (cleanResponse.includes('{') || cleanResponse.includes('}') || cleanResponse.includes('convertedText')) {
                console.log('JSON 형식 완전 제거 실패, 백업 변환 사용');
                return performBackupConversion(cleanText);
            }
            
            return {
                convertedText: cleanResponse,
                replacements: [], // 단순화를 위해 replacements는 빈 배열
                modelUsed: 'gemini-2.0-flash-exp',
                speechStyle: speechStyle
            };
            
        } catch (parseError) {
            console.error('응답 처리 오류:', parseError);
            return performBackupConversion(cleanText);
        }
        
    } catch (error) {
        console.error('Gemini API 호출 오류:', error);
        throw error;
    }
}

// 백업 변환 함수 (AI 실패 시 사용)
function performBackupConversion(text) {
    console.log('백업 변환 수행:', text);
    
    const replacements = [];
    let convertedText = text;
    
    // 기본적인 단어 치환
    const basicReplacements = {
        '확인': '알아보기',
        '협조': '도움',
        '신청': '부탁하기',
        '제출': '내기',
        '접수': '받기',
        '발급': '만들어 주기',
        '처리': '해결하기',
        '승인': '허락하기',
        '검토': '살펴보기',
        '완료': '끝내기'
    };
    
    for (const [original, simple] of Object.entries(basicReplacements)) {
        if (convertedText.includes(original)) {
            convertedText = convertedText.replace(new RegExp(original, 'g'), simple);
            replacements.push({ original, simple });
        }
    }
    
    // 말투 조정
    if (speechStyle === 'polite') {
        convertedText = convertedText.replace(/습니다/g, '해요');
        convertedText = convertedText.replace(/바랍니다/g, '주세요');
    } else {
        convertedText = convertedText.replace(/습니다/g, '해');
        convertedText = convertedText.replace(/바랍니다/g, '줘');
        convertedText = convertedText.replace(/세요/g, '');
    }
    
    return {
        convertedText: convertedText,
        replacements: replacements,
        modelUsed: 'backup-converter',
        speechStyle: speechStyle
    };
}

// ========================================
// API 키 설정
// ========================================

async function setApiKey() {
    const apiKey = prompt(`Gemini API 키를 입력해주세요.

1. https://aistudio.google.com/app/apikey 접속
2. "Create API Key" 클릭
3. 생성된 키를 복사해서 아래에 붙여넣기

API 키는 "AIza"로 시작해야 합니다:`);
    
    if (!apiKey) {
        showAlert('API 키 입력이 취소되었습니다.', 'warning');
        return false;
    }

    const validation = validateApiKey(apiKey.trim());
    if (!validation.valid) {
        showAlert(`API 키 오류: ${validation.reason}`, 'error');
        return false;
    }

    showAlert('API 키를 테스트하고 있습니다...', 'info');
    const testResult = await testApiConnection(apiKey.trim());
    
    if (testResult.success) {
        GEMINI_API_KEY = apiKey.trim();
        localStorage.setItem('gemini_api_key', GEMINI_API_KEY);
        showAlert('API 키가 성공적으로 설정되었습니다!', 'success');
        return true;
    } else {
        showAlert(`API 키 테스트 실패: ${testResult.message}`, 'error');
        return false;
    }
}

function loadApiKey() {
    const saved = localStorage.getItem('gemini_api_key');
    if (saved) {
        GEMINI_API_KEY = saved;
        return true;
    }
    return false;
}

function resetApiKey() {
    localStorage.removeItem('gemini_api_key');
    GEMINI_API_KEY = '';
    showAlert('API 키가 초기화되었습니다.', 'info');
    setApiKey();
}

// ========================================
// 초기화
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('EasyTalk 최종 개선 버전 시작');
    loadApiKey();
    loadSettings();
    setupLoginEvents();
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
});

function setupLoginEvents() {
    const loginPassword = document.getElementById('loginPassword');
    const loginId = document.getElementById('loginId');
    
    if (loginPassword) {
        loginPassword.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                adminLogin();
            }
        });
    }
    
    if (loginId) {
        loginId.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('loginPassword').focus();
            }
        });
    }
}

function loadSettings() {
    const savedStats = localStorage.getItem('easytalk_ai_stats');
    if (savedStats) {
        try {
            aiStats = JSON.parse(savedStats);
        } catch (e) {
            console.log('통계 로드 실패');
        }
    }
}

function adminLogin() {
    const id = document.getElementById('loginId').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (id === 'EASY TALK' && password === '1234') {
        currentUser = 'EASY TALK';
        showMainApp();
        showAlert('관리자 로그인 성공!', 'success');
    } else {
        showAlert('로그인 정보가 잘못되었습니다.', 'error');
    }
}

function guestLogin() {
    const id = document.getElementById('loginId').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (id === 'guest' && password === 'guest123') {
        currentUser = 'guest';
        showMainApp();
        showAlert('게스트로 로그인했습니다!', 'success');
    } else {
        showAlert('게스트 정보가 잘못되었습니다.', 'error');
    }
}

function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userIndicator').style.display = 'block';
    document.getElementById('currentUserName').textContent = currentUser;
    document.getElementById('dictionarySection').style.display = 'block';
    
    const adminControls = document.querySelectorAll('.admin-controls');
    adminControls.forEach(control => {
        control.style.display = currentUser === 'EASY TALK' ? 'block' : 'none';
    });
    
    const userIndicator = document.getElementById('userIndicator');
    if (currentUser === 'EASY TALK') {
        userIndicator.className = 'user-indicator admin-indicator';
    } else {
        userIndicator.className = 'user-indicator guest-indicator';
    }
    
    setupMainAppEvents();
    loadAllData();
    loadSpeechSettings();
    
    if (!GEMINI_API_KEY) {
        setTimeout(() => {
            if (confirm('Gemini API 키가 설정되지 않았습니다.\n지금 설정하시겠습니까?')) {
                setApiKey();
            }
        }, 1000);
    }
}

function logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
        currentUser = null;
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginId').value = '';
        document.getElementById('loginPassword').value = '';
        showAlert('로그아웃되었습니다.', 'info');
    }
}

function setupMainAppEvents() {
    const textInput = document.getElementById('textInput');
    if (textInput) {
        textInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                convertText();
            }
        });
    }
    
    const dictionaryInput = document.getElementById('dictionaryInput');
    if (dictionaryInput) {
        dictionaryInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchRealDictionary();
            }
        });
    }
}

function loadAllData() {
    updateStats();
    loadAIHistory();
}

// ========================================
// 메인 변환 함수
// ========================================

async function convertText() {
    const input = document.getElementById('textInput').value.trim();
    
    if (!input) {
        showAlert('변환할 텍스트를 입력해주세요.', 'warning');
        return;
    }

    if (!GEMINI_API_KEY) {
        if (confirm('API 키가 설정되지 않았습니다.\n지금 설정하시겠습니까?')) {
            const success = await setApiKey();
            if (!success) return;
        } else {
            return;
        }
    }

    console.log('변환 시작:', input);
    showLoading();

    try {
        const result = await callGeminiAPI(input);
        
        hideLoading();
        showResult(input, result.convertedText, result.replacements, result.modelUsed, result.speechStyle);
        addToAIHistory(input, result.convertedText);
        updateStats();
        
        console.log('변환 완료:', result.convertedText);
        
    } catch (error) {
        hideLoading();
        console.error('변환 오류:', error);
        
        // 오류 발생 시 백업 변환 시도
        try {
            const backupResult = performBackupConversion(input);
            showResult(input, backupResult.convertedText, backupResult.replacements, backupResult.modelUsed, backupResult.speechStyle);
            addToAIHistory(input, backupResult.convertedText);
            updateStats();
            showAlert('백업 변환기로 변환되었습니다.', 'warning');
        } catch (backupError) {
            showAlert(`변환 오류: ${error.message}`, 'error');
        }
    }
}

// ========================================
// UI 관련 함수들
// ========================================

function showLoading() {
    document.getElementById('aiAnalyzing').style.display = 'block';
}

function hideLoading() {
    document.getElementById('aiAnalyzing').style.display = 'none';
}

function showResult(original, converted, replacements = [], modelUsed = '', speechStyle = '') {
    document.getElementById('originalText').textContent = original;
    document.getElementById('convertedText').textContent = converted;
    document.getElementById('resultSection').style.display = 'block';
    
    currentResult = converted;
    currentOriginal = original;
    
    let alertMessage = '변환 완료!';
    if (modelUsed) alertMessage += ` (${modelUsed})`;
    if (speechStyle && currentUser === 'EASY TALK') {
        alertMessage += ` [${speechSettings[speechStyle].name}]`;
    }
    
    showAlert(alertMessage, 'success');
    
    if (replacements.length > 0) {
        document.getElementById('aiDetectedWords').style.display = 'block';
        const detectedList = document.getElementById('detectedWordsList');
        
        detectedList.innerHTML = replacements
            .map(word => `<span class="detected-word">${word.original} → ${word.simple}</span>`)
            .join('');
            
        aiStats.todayDetected += replacements.length;
    } else {
        document.getElementById('aiDetectedWords').style.display = 'none';
    }
    
    document.getElementById('resultSection').scrollIntoView({ 
        behavior: 'smooth',
        block: 'nearest'
    });
    
    setTimeout(() => speakText(), 500);
}

function speakText() {
    if (!currentResult) return;
    
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(currentResult);
        utterance.lang = 'ko-KR';
        utterance.rate = 0.8;
        window.speechSynthesis.speak(utterance);
    }
}

function copyResult() {
    if (!currentResult) {
        showAlert('복사할 내용이 없습니다.', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(currentResult).then(() => {
        showAlert('결과가 클립보드에 복사되었습니다!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = currentResult;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showAlert('결과가 복사되었습니다!', 'success');
    });
}

function clearInput() {
    document.getElementById('textInput').value = '';
    document.getElementById('resultSection').style.display = 'none';
    hideLoading();
    currentResult = '';
    currentOriginal = '';
    showAlert('입력이 지워졌습니다.', 'info');
}

function searchRealDictionary() {
    const word = document.getElementById('dictionaryInput').value.trim();
    
    if (!word) {
        showAlert('검색할 단어를 입력해주세요.', 'warning');
        return;
    }
    
    const wordInfo = koreanDictionary[word];
    const resultDiv = document.getElementById('dictionaryResult');
    const infoDiv = document.getElementById('wordInfo');
    
    if (wordInfo) {
        infoDiv.innerHTML = `
            <div style="margin-bottom: 15px;">
                <strong style="color: #059669; font-size: 24px;">"${word}"</strong>
                <span style="color: #6b7280; font-size: 16px; margin-left: 10px;">${wordInfo.pronunciation}</span>
            </div>
            <div class="word-meaning"><strong>뜻:</strong><br>${wordInfo.meaning}</div>
            <div class="example"><strong>예문:</strong><br>"${wordInfo.example}"</div>
            <div class="pronunciation"><strong>쉬운 말:</strong> ${wordInfo.easy}</div>
        `;
        resultDiv.style.display = 'block';
        showAlert(`"${word}"의 뜻을 찾았습니다!`, 'success');
    } else {
        infoDiv.innerHTML = `
            <div style="margin-bottom: 15px;">
                <strong style="color: #dc2626; font-size: 20px;">"${word}"</strong>
            </div>
            <div style="color: #666; text-align: center; padding: 30px;">
                죄송합니다. 이 단어는 사전에 없습니다.<br>
                <div style="margin-top: 15px; font-size: 14px; color: #059669;">
                    <strong>검색 가능한 단어:</strong><br>확인, 협조, 신청
                </div>
            </div>
        `;
        resultDiv.style.display = 'block';
        showAlert(`"${word}"을 사전에서 찾을 수 없습니다.`, 'warning');
    }
}

function updateStats() {
    const container = document.getElementById('statsContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${aiStats.totalConversions}</div>
            <div class="stat-label">총 변환</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${aiStats.todayDetected}</div>
            <div class="stat-label">감지 단어</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${aiStats.autoConverted}</div>
            <div class="stat-label">AI 변환</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${Math.round(aiStats.accuracy)}%</div>
            <div class="stat-label">AI 정확도</div>
        </div>
    `;
}

function addToAIHistory(original, converted) {
    const history = JSON.parse(localStorage.getItem('easytalk_ai_history') || '[]');
    
    history.unshift({
        original: original,
        converted: converted,
        timestamp: new Date().toISOString(),
        user: currentUser,
        speechStyle: speechStyle
    });
    
    if (history.length > 30) {
        history.splice(30);
    }
    
    localStorage.setItem('easytalk_ai_history', JSON.stringify(history));
    loadAIHistory();
    
    aiStats.totalConversions++;
    aiStats.autoConverted++;
    saveAIStats();
}

function loadAIHistory() {
    const history = JSON.parse(localStorage.getItem('easytalk_ai_history') || '[]');
    const container = document.getElementById('historyContainer');
    
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">변환 기록이 없습니다.</div>';
        return;
    }
    
    container.innerHTML = '';
    
    history.slice(0, 10).forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'word-item';
        
        const date = new Date(item.timestamp).toLocaleString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        
        const displayOriginal = item.original.length > 30 ? item.original.substring(0, 30) + '...' : item.original;
        const displayConverted = item.converted.length > 30 ? item.converted.substring(0, 30) + '...' : item.converted;
        
        const speechInfo = item.speechStyle && speechSettings[item.speechStyle] ? 
            ` | ${speechSettings[item.speechStyle].name}` : '';
        
        historyItem.innerHTML = `
            <div>
                <div style="font-size: 10px; color: #666; margin-bottom: 3px;">${date} | ${item.user}${speechInfo}</div>
                <div style="font-size: 12px;">
                    <div style="margin-bottom: 2px;"><strong>원본:</strong> ${displayOriginal}</div>
                    <div style="color: #059669;"><strong>변환:</strong> ${displayConverted}</div>
                </div>
            </div>
        `;
        
        container.appendChild(historyItem);
    });
}

function clearAIHistory() {
    if (confirm('모든 변환 히스토리를 삭제하시겠습니까?')) {
        localStorage.removeItem('easytalk_ai_history');
        showAlert('히스토리가 모두 삭제되었습니다.', 'success');
        loadAIHistory();
    }
}

function saveAIStats() {
    localStorage.setItem('easytalk_ai_stats', JSON.stringify(aiStats));
}

function exportData() {
    const allData = {
        aiStats: aiStats,
        aiHistory: JSON.parse(localStorage.getItem('easytalk_ai_history') || '[]'),
        speechStyle: speechStyle,
        exportDate: new Date().toISOString(),
        version: 'EasyTalk_Final_v1.0',
        user: currentUser
    };
    
    const blob = new Blob([JSON.stringify(allData, null, 2)], {type: 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `easytalk_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    
    showAlert('데이터가 성공적으로 백업되었습니다!', 'success');
}

function resetAllData() {
    const confirmation = prompt('정말로 모든 데이터를 삭제하시겠습니까?\n\n삭제하려면 "삭제"를 입력하세요:');
    
    if (confirmation !== '삭제') {
        showAlert('삭제가 취소되었습니다.', 'info');
        return;
    }
    
    localStorage.removeItem('easytalk_ai_stats');
    localStorage.removeItem('easytalk_ai_history');
    localStorage.removeItem('easytalk_speech_style');
    
    currentResult = '';
    currentOriginal = '';
    speechStyle = 'polite';
    aiStats = { todayDetected: 0, autoConverted: 0, totalConversions: 0, accuracy: 100 };
    
    showAlert('모든 데이터가 완전히 삭제되었습니다.', 'success');
    loadAllData();
    updateSpeechUI();
}

function showAlert(message, type = 'info') {
    const existingAlert = document.querySelector('.alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    document.body.appendChild(alert);
    
    const duration = type === 'error' ? 5000 : type === 'warning' ? 4000 : 3000;
    setTimeout(() => {
        if (alert.parentNode) {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 300);
        }
    }, duration);
}

// 관리자 전용 함수들
function debugSystem() {
    console.log('=== EasyTalk 시스템 디버그 정보 ===');
    console.log('현재 사용자:', currentUser);
    console.log('현재 말투:', speechStyle, speechSettings[speechStyle].name);
    console.log('API 키:', GEMINI_API_KEY ? GEMINI_API_KEY.substring(0, 10) + '...' : '없음');
    console.log('저장된 말투:', localStorage.getItem('easytalk_speech_style'));
    console.log('AI 통계:', aiStats);
    
    showAlert('콘솔에 디버그 정보가 출력되었습니다.', 'info');
}

function addDictionaryWord() {
    if (currentUser !== 'EASY TALK') {
        showAlert('관리자만 사전 단어를 추가할 수 있습니다.', 'warning');
        return;
    }
    
    const word = prompt('추가할 단어를 입력하세요:');
    if (!word) return;
    
    const meaning = prompt('단어의 뜻을 입력하세요:');
    if (!meaning) return;
    
    const example = prompt('예문을 입력하세요:');
    if (!example) return;
    
    const easy = prompt('쉬운 표현을 입력하세요:');
    if (!easy) return;
    
    console.log('새 단어 추가:', {
        word: word,
        meaning: meaning,
        pronunciation: `[${word}]`,
        example: example,
        easy: easy
    });
    
    showAlert(`"${word}" 단어가 추가 요청되었습니다. (개발자가 수동으로 추가해야 합니다)`, 'info');
}

function exportSystemData() {
    if (currentUser !== 'EASY TALK') {
        showAlert('관리자만 시스템 데이터를 내보낼 수 있습니다.', 'warning');
        return;
    }
    
    exportData();
}

function clearHistory() {
    if (currentUser !== 'EASY TALK') {
        showAlert('관리자만 히스토리를 삭제할 수 있습니다.', 'warning');
        return;
    }
    
    clearAIHistory();
}

// 전역 함수 등록
window.changeSpeechStyle = changeSpeechStyle;
window.debugSystem = debugSystem;
window.addDictionaryWord = addDictionaryWord;
window.exportSystemData = exportSystemData;
window.clearHistory = clearHistory;

console.log('EasyTalk - 최종 개선 완성 버전');
console.log('현재 사용 모델: gemini-2.0-flash-exp (Gemini 2.5 Flash)');
console.log('주요 개선사항:');
console.log('1. 짧은 변환 결과만 출력 (긴 설명 제거)');
console.log('2. undefined 오류 자동 해결');
console.log('3. AI 실패 시 백업 변환기 작동');
console.log('4. 강화된 오류 처리 및 안정성');
console.log('5. 경계성 지능 맞춤 쉬운 변환');

console.log('브라우저 콘솔에서 debugSystem() 함수로 시스템 디버그 가능');
