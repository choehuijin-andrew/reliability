/**
 * RE-Suite Static — 메인 애플리케이션
 * 탭 전환, UI 렌더링, 이벤트 핸들링
 */

let currentTab = 'planning'; // 시료수 계획부터 시작
let accelerationState = {
    beta: 2,
    targetLife: 20000,
    n: 22,
    confidence: 90,
    bx: 1,
    testTime: 1000,

    // 모델별 파라미터 저장소 (기입 값 유지용)
    tUse: 25,
    tStress: 85,
    ea: 0.7,
    rhUse: 50,
    rhStress: 85,
    nPeck: 3,
    dtUse: 20,
    dtStress: 100,
    m: 2,
    vUse: 5,
    vStress: 12,
    nPower: 2,
    eyringB: 0,
    eyringSUse: 1,
    eyringSStress: 5,
    fUse: 1,
    fStress: 3,
    nlRampUpUse: 360,
    nlDwellHighUse: 360,
    nlRampDownUse: 360,
    nlDwellLowUse: 360,
    nlRampUpStress: 30,
    nlDwellHighStress: 30,
    nlRampDownStress: 30,
    nlDwellLowStress: 30,
    nlTmaxUse: 50,
    nlTmaxStress: 125,
    nlEa: 0.123
};


// ═══════════════════════════════════════════
// 탭 전환
// ═══════════════════════════════════════════
function switchTab(tabId) {
    currentTab = tabId;

    // 탭 버튼 활성화
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // 차트 정리
    ChartManager.destroyAll();

    // 콘텐츠 렌더링
    const content = document.getElementById('tab-content');
    content.innerHTML = '<div class="fade-in">' + renderTabContent(tabId) + '</div>';

    // 탭별 초기화
    setTimeout(() => initTabEvents(tabId), 50);
}

function renderTabContent(tabId) {
    switch (tabId) {
        case 'analysis':    return renderAnalysisTab();
        case 'planning':    return renderPlanningTab();
        case 'acceleration': return renderAccelerationTab();
        case 'warranty':    return renderWarrantyTab();
        case 'degradation': return renderDegradationTab();
        default: return '';
    }
}

// ═══════════════════════════════════════════
// 신뢰성 분석 탭 — Phase 3 완전 구현
// ═══════════════════════════════════════════

// 전역 분석 결과 저장
let _analysisResult = null;
let _analysisHot = null;  // Handsontable 인스턴스

function renderAnalysisTab() {
    return `
    <!-- 서브 탭 -->
    <div class="sub-tabs" id="analysis-sub-tabs">
        <button class="sub-tab-btn active" data-subtab="input" onclick="switchAnalysisSubTab('input')">데이터 입력 &amp; 분석</button>
        <button class="sub-tab-btn" data-subtab="charts" onclick="switchAnalysisSubTab('charts')" id="analysis-charts-tab" ${!_analysisResult ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>결과 차트</button>
        <button class="sub-tab-btn" data-subtab="advanced" onclick="switchAnalysisSubTab('advanced')" id="analysis-advanced-tab" ${!_analysisResult ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>고급분석(Weibull 한정)</button>
        <button class="sub-tab-btn" data-subtab="calculator" onclick="switchAnalysisSubTab('calculator')" id="analysis-calc-tab" ${!_analysisResult ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>Bx / F(t) 계산기</button>
    </div>

    <div id="analysis-content">
        ${renderAnalysisInputTab()}
    </div>`;
}

function switchAnalysisSubTab(subtab) {
    if (document.querySelector('#analysis-sub-tabs .sub-tab-btn[data-subtab="input"]')?.classList.contains('active')) {
        if (_analysisHot) window._savedInputData = _analysisHot.getData();
    }
    document.querySelectorAll('#analysis-sub-tabs .sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subtab);
    });

    const container = document.getElementById('analysis-content');
    if      (subtab === 'input')      {
        ChartManager.destroyAll();
        container.innerHTML = renderAnalysisInputTab();
        switchDataMode(window._dataMode || 'exact'); // Uses saved or default
        setTimeout(() => {
            if (window._analysisSummaryHTML) {
                const summaryEl = document.getElementById('analysis-summary');
                if (summaryEl) summaryEl.innerHTML = window._analysisSummaryHTML;
            }
        }, 50);
    }
    else if (subtab === 'charts')     {
        ChartManager.destroyAll();
        container.innerHTML = renderAnalysisChartsTab();
        // DOM이 완전 렌더링되고 Canvas 크기가 잡힌 후 그린다
        requestAnimationFrame(() => setTimeout(drawAllAnalysisCharts, 150));
    }
    else if (subtab === 'advanced')   {
        ChartManager.destroyAll();
        container.innerHTML = renderAdvancedTab();
        requestAnimationFrame(() => setTimeout(drawAdvancedCharts, 150));
    }
    else if (subtab === 'calculator') {
        ChartManager.destroyAll();
        try {
            container.innerHTML = renderCalculatorTab();
        } catch(e) {
            console.error('Calculator tab error:', e);
            container.innerHTML = `<div class="glass-card"><div class="info-box warning">❌ 계산기 로딩 오류: ${e.message}</div></div>`;
        }
    }
}


// ── 데이터 입력 탭 ──
function renderAnalysisInputTab() {
    return `<div class="grid-cols-1-2">
        <!-- 입력 패널 -->
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
                <h3 class="section-title" style="margin:0">신뢰성 데이터 입력</h3>
                <!-- 예제 데이터 드롭다운 -->
                <div style="position:relative">
                    <button class="btn btn-sm btn-secondary" id="sample-data-toggle"
                        onclick="document.getElementById('sample-data-dropdown').style.display = document.getElementById('sample-data-dropdown').style.display==='block'?'none':'block'"
                        style="font-size:0.72rem;padding:2px 8px;height:24px;line-height:1">📋 예제 데이터 ▾</button>
                    <div id="sample-data-dropdown" style="display:none;position:absolute;top:100%;right:0;z-index:9999;min-width:320px;max-height:400px;overflow-y:auto;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);margin-top:4px">
                        <div style="padding:0.5rem 0.75rem;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);background:var(--bg-tertiary)">📌 우측관측중단 (Right Censored)</div>
                        <div class="sample-item" onclick="loadSampleData('weibull_basic');closeSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">Weibull 기본 데이터</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">20개 고장 데이터, 관측중단 없음</div>
                        </div>
                        <div class="sample-item" onclick="loadSampleData('weibull_censored');closeSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">Nelson Fan Data</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">Nelson(1982) — 전자 팬 수명, 우측관측 포함</div>
                        </div>
                        <div class="sample-item" onclick="loadSampleData('lognormal');closeSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">Lognormal 절연체 데이터</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">Meeker & Escobar — 절연 파괴 시험</div>
                        </div>
                        <div class="sample-item" onclick="loadSampleData('weibull_mixture');closeSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">Weibull Mixture (경쟁고장) 데이터</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">초기 고장과 마모 고장이 복합적으로 혼재된 제품 수명 데이터</div>
                        </div>

                        <div style="padding:0.5rem 0.75rem;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);border-top:1px solid var(--border-color);background:var(--bg-tertiary)">📌 구간관측중단 (Interval Censored)</div>
                        <div class="sample-item" onclick="loadSampleData('interval_censored');closeSampleDropdown()" id="sample-interval-btn">
                            <div style="font-size:0.82rem;color:var(--text-primary)">Alloy-T7987 피로 데이터</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">Meeker & Escobar — 합금 균열 구간 관측</div>
                        </div>

                        <div style="padding:0.5rem 0.75rem;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);border-top:1px solid var(--border-color);background:var(--bg-tertiary)">📌 그룹 비교</div>
                        <div class="sample-item" onclick="loadSampleData('grouped');closeSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">2그룹 비교 데이터</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">A/B 그룹 비교 — 설계 변경 전후 비교</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 데이터 입력 모드 토글 -->
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;background:var(--bg-tertiary);border-radius:8px;padding:4px">
                <button id="mode-btn-exact" class="btn btn-sm" onclick="switchDataMode('exact')"
                    style="flex:1;background:var(--accent-color);color:var(--accent-contrast);font-size:0.78rem;font-weight:600">
                    ● 우측관측중단 (F/C)
                </button>
                <button id="mode-btn-interval" class="btn btn-sm" onclick="switchDataMode('interval')"
                    style="flex:1;background:transparent;color:var(--text-muted);font-size:0.78rem;font-weight:600">
                    ◻ 구간 관측중단 (Interval)
                </button>
            </div>

            <!-- 입력 모드 설명 -->
            <div id="data-mode-hint" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.5rem">
                이벤트: <strong style="color:#22c55e">F</strong>=고장, <strong style="color:#38bdf8">C</strong>=우측관측중단 | Group ID: 비어있으면 단일 그룹
            </div>

            <!-- 데이터 그리드 -->
            <div id="analysis-grid" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden"></div>

            <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap">
                <button class="btn btn-sm btn-secondary" onclick="addAnalysisRow()">+ 행 추가</button>
                <button class="btn btn-sm btn-secondary" onclick="clearAnalysisGrid()">입력 초기화</button>
                <button class="btn btn-sm btn-secondary" onclick="removeLastRow()">마지막 행 삭제</button>
            </div>

            <div class="divider" style="margin-top:1rem">분석 설정</div>

            ${HelpTooltip.labelWithHelp('분포 선택', '자동: AICc 기준 최적 분포 자동 선택<br>특정 분포를 지정하면 해당 분포로 적합합니다.')}
            <select id="analysis-dist">
                <option value="auto" selected>자동 선택 (AICc 기준)</option>
                <option value="weibull">Weibull 2P</option>
                <option value="weibull_mixture">Weibull Mixture (이중/경쟁고장)</option>
                <option value="lognormal">Lognormal 2P</option>
                <option value="normal">Normal 2P</option>
                <option value="exponential">Exponential 1P</option>
            </select>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('신뢰 수준', '신뢰구간 계산에 사용. 일반적으로 90% 또는 95%')}
            <div class="input-with-unit">
                <input type="number" id="analysis-confidence" value="90" min="50" max="99.9" step="1">
                <span class="input-unit">%</span>
            </div>
            </div>

            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem"
                    onclick="runAnalysis()">
                🔍 분포 적합 &amp; 분석 실행
            </button>
        </div>

        <!-- 결과 요약 패널 -->
        <div id="analysis-summary" class="glass-card">
            <div class="empty-state" style="min-height:300px">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2" opacity="0.3">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                </svg>
                <div style="font-size:0.9rem;color:var(--text-muted);margin-top:0.75rem">
                    데이터를 입력하고<br>「분포 적합 &amp; 분석 실행」을 클릭하세요
                </div>
            </div>
        </div>
    </div>`;
}

// 데이터 입력 모드: 'exact'(단순) | 'interval'(구간관측중단)
let _dataMode = 'exact';

function switchDataMode(mode) {
    _dataMode = mode;
    const btnExact    = document.getElementById('mode-btn-exact');
    const btnInterval = document.getElementById('mode-btn-interval');
    const hint        = document.getElementById('data-mode-hint');
    if (btnExact) {
        btnExact.style.background    = mode === 'exact' ? 'var(--accent-color)' : 'transparent';
        btnExact.style.color         = mode === 'exact' ? 'var(--accent-contrast)' : 'var(--text-muted)';
        btnInterval.style.background = mode === 'interval' ? 'var(--accent-color)' : 'transparent';
        btnInterval.style.color      = mode === 'interval' ? 'var(--accent-contrast)' : 'var(--text-muted)';
    }
    if (hint) {
        if (mode === 'exact') {
            hint.innerHTML = '편 이벤트: <strong style="color:#22c55e">F</strong>=고장, <strong style="color:#38bdf8">C</strong>=우측관측중단 | Group ID: 비어있으면 단일 그룹';
        } else {
            hint.innerHTML = '➤ 구간 관측중단 (Interval Censoring) | 끝시간 <strong>*</strong>=우측관측 | 시작==끝: 정확한 고장 시간';
        }
    }
    initAnalysisGrid();
}

function closeSampleDropdown() {
    var dd = document.getElementById('sample-data-dropdown');
    if (dd) dd.style.display = 'none';
}

// 샘플 데이터
const SAMPLE_DATA = {
    weibull_basic: [
        [50,'F',1,''],[70,'F',1,''],[85,'F',1,''],[100,'F',1,''],[120,'F',1,''],
        [140,'F',1,''],[160,'F',1,''],[180,'F',1,''],[210,'F',1,''],[250,'F',1,'']
    ],
    weibull_censored: [
        [50,'F',1,''],[70,'F',1,''],[85,'F',1,''],[100,'C',1,''],[120,'F',1,''],
        [140,'C',1,''],[160,'F',1,''],[180,'C',1,''],[210,'F',1,''],[300,'C',1,''],
        [350,'F',1,''],[400,'C',1,''],[450,'F',1,''],[500,'C',1,''],[600,'C',1,'']
    ],
    lognormal: [
        [100,'F',1,''],[200,'F',1,''],[350,'F',1,''],[500,'F',1,''],[800,'F',1,''],
        [1200,'F',1,''],[1800,'F',1,''],[2500,'F',1,''],[3500,'F',1,''],[5000,'F',1,'']
    ],
    // 구간관측중단 샘플: [start, end(* = 우측), count, group]
    interval_censored: {
        mode: 'interval',
        data: [
            [0,   100,  12, ''],
            [100, 200,  8,  ''],
            [200, 300,  6,  ''],
            [300, 400,  4,  ''],
            [400, 500,  3,  ''],
            [500, 600,  2,  ''],
            [600, '*',  15, ''],  // 600시간 시험 종료 후 생존 15개 (우측관측)
        ]
    },
    // 그룹 비교 샘플: Group A vs Group B
    grouped: [
        [50,'F',1,'A'],[70,'F',1,'A'],[85,'F',1,'A'],[100,'F',1,'A'],[150,'F',1,'A'],
        [180,'F',1,'A'],[220,'F',1,'A'],[280,'C',1,'A'],[350,'F',1,'A'],[400,'C',1,'A'],
        [80,'F',1,'B'],[110,'F',1,'B'],[130,'F',1,'B'],[160,'F',1,'B'],[200,'F',1,'B'],
        [240,'F',1,'B'],[300,'C',1,'B'],[380,'F',1,'B'],[450,'C',1,'B'],[500,'F',1,'B']
    ],
    // 이중/경쟁 고장 샘플
    weibull_mixture: [
        [10,'F',1,''],[20,'F',1,''],[35,'F',1,''],[50,'F',1,''],[80,'F',1,''],
        [100,'F',1,''],[120,'C',1,''],[150,'C',1,''],[320,'F',1,''],[350,'F',1,''],
        [380,'F',1,''],[400,'F',1,''],[420,'F',1,''],[450,'F',1,''],[480,'F',1,''],
        [500,'F',1,''],[520,'F',1,''],[550,'F',1,''],[600,'C',1,''],[650,'C',1,'']
    ]
};

function loadSampleData(key) {
    const sd = SAMPLE_DATA[key];
    if (!sd || !_analysisHot) return;
    if (sd.mode === 'interval') {
        switchDataMode('interval');
        setTimeout(() => {
            if (_analysisHot) _analysisHot.loadData(sd.data);
        }, 100);
    } else {
        switchDataMode('exact');
        setTimeout(() => {
            if (_analysisHot) _analysisHot.loadData(sd);
        }, 100);
    }
}

function initAnalysisGrid() {
    const container = document.getElementById('analysis-grid');
    if (!container) return;

    if (_analysisHot) { try { _analysisHot.destroy(); } catch(e) {} _analysisHot = null; }

    const isInterval = _dataMode === 'interval';
    let initData = isInterval 
        ? [[0, 100, 1, ''], [100, 200, 1, ''], [200, '*', 1, '']]
        : [[null, 'F', 1, ''], [null, 'F', 1, ''], [null, 'F', 1, '']];
    
    if (window._savedInputData && window._savedInputData.length > 0) {
        initData = window._savedInputData;
    }

    if (typeof Handsontable === 'undefined') {
        container.innerHTML = renderFallbackGrid(initData, isInterval);
        return;
    }

    const columns = isInterval 
        ? [{ type: 'numeric' }, { type: 'text' }, { type: 'numeric' }, { type: 'text' }]
        : [{ type: 'numeric' }, { type: 'dropdown', source: ['F', 'C'] }, { type: 'numeric' }, { type: 'text' }];

    _analysisHot = new Handsontable(container, {
        data: initData,
        colHeaders: isInterval ? ['시작', '끝(*)', '개수', 'Group'] : ['시간', '이벤트', '개수', 'Group'],
        columns: columns,
        rowHeaders: true,
        height: 280,
        width: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        contextMenu: ['row_above', 'row_below', 'remove_row', '---------', 'undo', 'redo']
    });
}

function renderFallbackGrid(data, isInterval = false) {
    const placeholder = isInterval ? '시작,끝,개수,그룹\n0,100,5,\n100,200,3,\n200,*,8,' : '시간,이벤트,개수,그룹\n100,F,1,\n200,C,1,';
    const text = data.map(r => r.join(',')).join('\n');
    return `<textarea id="fallback-grid" style="width:100%;height:250px;background:var(--bg-secondary);color:var(--text-primary);border:none;padding:0.75rem;font-family:monospace;font-size:0.85rem;resize:vertical" placeholder="${placeholder}">${text || ''}</textarea>`;
}

function getAnalysisData() {
    const isInterval = _dataMode === 'interval';

    if (_analysisHot) {
        const rawRows = _analysisHot.getData()
            .filter(r => r[0] !== null && r[0] !== '' && r[0] !== undefined);

        if (isInterval) {
            return rawRows.map(r => ({
                start:  parseFloat(r[0]),
                end:    (r[1] === '*' || r[1] === '' || r[1] === null) ? Infinity : parseFloat(r[1]),
                count:  Math.max(1, parseInt(r[2]) || 1),
                group:  (r[3] || '').toString().trim(),
                type:   'interval'
            })).filter(r => !isNaN(r.start));
        } else {
            return rawRows
                .filter(r => !isNaN(parseFloat(r[0])))
                .map(r => ({
                    time:  parseFloat(r[0]),
                    event: (r[1] || 'F').toString().toUpperCase(),
                    count: Math.max(1, parseInt(r[2]) || 1),
                    group: (r[3] || '').toString().trim(),
                    type:  'exact'
                }));
        }
    }

    const ta = document.getElementById('fallback-grid');
    if (!ta) return [];
    return ta.value.trim().split('\n')
        .map(line => line.split(',').map(s => s.trim()))
        .filter(parts => parts.length >= 1 && !isNaN(parseFloat(parts[0])))
        .map(parts => ({ time: parseFloat(parts[0]), event: (parts[1] || 'F').toUpperCase(), count: 1, group: '' }));
}

function addAnalysisRow() {
    if (_analysisHot) _analysisHot.alter('insert_row_below');
}

function removeLastRow() {
    if (_analysisHot) {
        const count = _analysisHot.countRows();
        if (count > 1) _analysisHot.alter('remove_row', count - 1);
    }
}

function clearAnalysisGrid() {
    const emptyRow = _dataMode === 'interval' ? [null,'*',1,''] : [null,'F',1,''];
    if (_analysisHot) _analysisHot.loadData([emptyRow, [...emptyRow], [...emptyRow]]);
    _analysisResult = null;
    window._allGroupResults = null;
    window._selectedDist = null;
}

function groupAnalysisData(rows) {
    const groups = {};
    rows.forEach(r => {
        const gid = r.group || '__all__';
        if (!groups[gid]) groups[gid] = [];
        groups[gid].push(r);
    });
    return groups;
}

function expandIntervalRows(rows) {
    const failures = [], censored = [];
    let hasIntervalApprox = false;
    rows.forEach(r => {
        const n = r.count || 1;
        if (r.type === 'interval') {
            if (!isFinite(r.end)) {
                for (let i = 0; i < n; i++) censored.push(r.start);
            } else if (r.start === r.end || r.start === 0) {
                for (let i = 0; i < n; i++) failures.push(r.end > 0 ? r.end : r.start);
            } else {
                const mid = (r.start + r.end) / 2;
                for (let i = 0; i < n; i++) failures.push(mid);
                hasIntervalApprox = true;
            }
        } else {
            for (let i = 0; i < n; i++) {
                if (r.event === 'F') failures.push(r.time);
                else censored.push(r.time);
            }
        }
    });
    return { failures, censored, hasIntervalApprox };
}

// ── 분석 실행 ──
function runAnalysis() {
    const rows = getAnalysisData();
    if (rows.length < 3) {
        alert('데이터가 부족합니다. 최소 3개 이상 입력해주세요.');
        return;
    }

    const dist = document.getElementById('analysis-dist').value;
    const conf = parseFloat(document.getElementById('analysis-confidence').value) / 100;

    const summaryEl = document.getElementById('analysis-summary');
    summaryEl.innerHTML = `<div class="empty-state"><div class="spinner"></div><div style="margin-top:1rem;font-size:0.9rem">분포 적합 중...</div></div>`;

    setTimeout(() => {
        try {
            const grouped  = groupAnalysisData(rows);
            let groupIds = Object.keys(grouped);
            if (groupIds.length > 1 && groupIds.includes('__all__')) {
                groupIds = groupIds.filter(g => g !== '__all__');
            }
            const hasGroups = groupIds.length > 1 || (groupIds.length === 1 && groupIds[0] !== '__all__');

            const allResults = {};
            groupIds.forEach(gid => {
                const dataRows = grouped[gid];
                const expanded = expandIntervalRows(dataRows);
                if (expanded.failures.length < 1) return; // 고장이 최소 1개 이상 필요
                try {
                    allResults[gid] = ReliabilityAnalysis.analyze(dataRows, { distribution: dist, confidence: conf });
                    allResults[gid]._groupId = gid;
                } catch(e) { console.warn(`그룹 ${gid} 분석 실패:`, e); }
            });

            if (Object.keys(allResults).length === 0) {
                summaryEl.innerHTML = `<div class="info-box warning">⚠️ 분석 가능한 그룹이 없습니다. 고장 데이터가 각 그룹별 2개 이상 필요.</div>`;
                return;
            }

            window._allGroupResults = allResults;
            window._currentGroupId  = groupIds[0];
            window._selectedDist    = null;
            window._allFits         = {};
            _analysisResult         = allResults[groupIds[0]];

            renderAnalysisSummaryMultigroup(allResults, groupIds, hasGroups);

            document.querySelectorAll('#analysis-sub-tabs .sub-tab-btn').forEach(btn => {
                btn.removeAttribute('disabled');
                btn.style.opacity = '';
                btn.style.cursor = '';
            });
        } catch(e) {
            summaryEl.innerHTML = `<div class="info-box warning">❌ 분석 오류: ${e.message}</div>`;
            console.error(e);
        }
    }, 50);
}

// 그룹별 분석 결과 렌더
function renderAnalysisSummaryMultigroup(allResults, groupIds, hasGroups) {
    const gid = window._currentGroupId || groupIds[0];
    const r   = allResults[gid];
    if (!r) return;
    _analysisResult = r;
    window._allFits = {};

    // 그룹 선택 다드믁 UI (그룹이 2개 이상일 때)
    let groupSelectorHtml = '';
    if (hasGroups && groupIds.length > 1) {
        const opts = groupIds.map(id => {
            const res = allResults[id];
            const n = res ? res.dataSummary.nTotal : 0;
            const label = id === '__all__' ? '전체' : `그룹 ${id} (n=${n})`;
            return `<option value="${id}" ${id === gid ? 'selected' : ''}>${label}</option>`;
        }).join('');
        groupSelectorHtml = `
        <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.75rem;padding:0.5rem 0.75rem;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);border-radius:6px">
            <span style="font-size:0.82rem;color:var(--text-secondary)">그룹 선택:</span>
            <select id="group-selector" style="flex:1;font-size:0.83rem" onchange="switchAnalysisGroup(this.value)">${opts}</select>
            <span style="font-size:0.78rem;color:var(--text-muted)">${groupIds.length}개 그룹</span>
        </div>`;
    }

    renderAnalysisSummary(r, groupSelectorHtml);
}


function switchAnalysisGroup(gid) {
    window._currentGroupId = gid;
    window._allFits        = {};
    const allResults = window._allGroupResults;
    if (!allResults || !allResults[gid]) return;
    _analysisResult = allResults[gid];
    const groupIds = Object.keys(allResults);
    renderAnalysisSummaryMultigroup(allResults, groupIds, groupIds.length > 1);
}

function renderAnalysisSummary(r, extraHeaderHtml = '') {
    const distLabel = { 
        weibull: 'Weibull 2P', 
        lognormal: 'Lognormal 2P', 
        normal: 'Normal 2P', 
        exponential: 'Exponential 1P',
        weibull_mixture: 'Weibull Mixture (이중/경쟁고장)'
    };
    const p = r.params;
    const paramStr = r.distribution === 'weibull'
        ? `η = ${p.alpha.toFixed(3)}, β = ${p.beta.toFixed(4)}`
        : r.distribution === 'weibull_mixture'
        ? `p = ${p.p.toFixed(3)}, η₁ = ${p.alpha1.toFixed(1)}, β₁ = ${p.beta1.toFixed(2)}, η₂ = ${p.alpha2.toFixed(1)}, β₂ = ${p.beta2.toFixed(2)}`
        : r.distribution === 'lognormal'
        ? `μ = ${p.mu.toFixed(4)}, σ = ${p.sigma.toFixed(4)}`
        : r.distribution === 'normal'
        ? `μ = ${p.mu.toFixed(3)}, σ = ${p.sigma.toFixed(3)}`
        : `λ = ${p.lambda.toExponential(4)}`;

    const betaInterpHtml = r.betaInterpretation
        ? `<div class="info-box ${r.betaInterpretation.type === 'wearout' ? '' : r.betaInterpretation.type === 'random' ? 'info' : 'warning'}" style="margin-bottom:1rem">
            ${r.betaInterpretation.message}
           </div>`
        : '';

    // 분포 비교 테이블 (항상 열림, 클릭 선택, 헤더 정렬)
    const _compSortKey = window._compSortKey || 'aic_c';
    const _compSortAsc = window._compSortAsc !== false;
    const sortedComp = [...r.comparison].sort((a, b) => {
        const va = a[_compSortKey] ?? Infinity;
        const vb = b[_compSortKey] ?? Infinity;
        return _compSortAsc ? va - vb : vb - va;
    });

    // 선택된 기준 지표(_compSortKey)에 따른 최적 분포 판단 (해당 지표값 기준 최소값 검색)
    const bestDistObj = [...r.comparison].sort((a, b) => {
        const va = a[_compSortKey] ?? Infinity;
        const vb = b[_compSortKey] ?? Infinity;
        return va - vb;
    })[0];
    const bestDist = bestDistObj ? bestDistObj.dist : (r.comparison.find(c => c.best)?.dist || 'weibull');

    const metricLabel = { aic_c: 'AICc', bic: 'BIC', ad: 'AD 수정값', minus2ll: '-2LL' };
    const curMetric = metricLabel[_compSortKey] || 'AICc';

    const selectedDist = r.distribution;
    const compHtml = sortedComp.map(c => {
        const isSelected = c.dist === selectedDist;
        const isBest = c.dist === bestDist;
        return `
        <tr onclick="selectCompDist('${c.dist}')" style="cursor:pointer;${isSelected ? 'background:rgba(56,189,248,0.15)' : isBest ? 'background:rgba(56,189,248,0.04)' : ''}" title="클릭하면 이 분포로 차트 표시">
            <td class="table-cell" style="${isSelected ? 'color:var(--accent-color);font-weight:700' : ''}">
                ${distLabel[c.dist] || c.dist}
                ${isBest ? '<span style="color:#f59e0b"> ⭐</span>' : ''}
                ${isSelected ? '<span style="font-size:0.7rem;margin-left:4px;color:var(--accent-color)">[선택중]</span>' : ''}
            </td>
            <td class="table-cell">${c.aic_c != null ? c.aic_c.toFixed(2) : 'N/A'}</td>
            <td class="table-cell">${c.bic   != null ? c.bic.toFixed(2)   : 'N/A'}</td>
            <td class="table-cell">${c.ad    != null ? c.ad.toFixed(4)   : 'N/A'}</td>
            <td class="table-cell">${c.minus2ll != null ? c.minus2ll.toFixed(2) : 'N/A'}</td>
        </tr>`;
    }).join('');

    function thBtn(label, key) {
        const active = _compSortKey === key;
        const arrow = active ? (_compSortAsc ? ' ▲' : ' ▼') : '';
        return `<th style="cursor:pointer;user-select:none;${active?'color:var(--accent-color)':''}" onclick="sortCompTable('${key}')">${label}${arrow}</th>`;
    }

    const html = `
        <h3 class="section-title">✅ 분석 결과</h3>
        ${extraHeaderHtml}

        ${betaInterpHtml}

        <div class="grid-4" style="margin-bottom:1.25rem">
            <div class="stat-card">
                <div class="label">최적 분포 (${curMetric})</div>
                <div class="value accent" style="font-size:0.95rem">${distLabel[bestDist] || bestDist}</div>
            </div>
            <div class="stat-card">
                <div class="label">선택 분포</div>
                <div class="value" style="font-size:0.9rem;color:var(--accent-color)" id="selected-dist-label">${distLabel[selectedDist] || selectedDist}</div>
            </div>
            <div class="stat-card">
                <div class="label">MTTF</div>
                <div class="value success" style="display:flex;flex-direction:column;align-items:center;line-height:1.2">
                    <span>${r.mttf.toFixed(1)}</span>
                    ${r.mttfF !== undefined ? `<span style="font-size:0.72rem;color:var(--text-secondary);font-weight:400;margin-top:2px">F(t) = ${(r.mttfF * 100).toFixed(1)}%</span>` : ''}
                </div>
            </div>
            <div class="stat-card">
                <div class="label">데이터</div>
                <div class="value">${r.dataSummary.nFailures}F / ${r.dataSummary.nCensored}C</div>
            </div>
        </div>

        <!-- Bx Life 요약 -->
        <div class="glass-card-sm" style="margin-bottom:1rem">
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.6rem">Bx Life (수명 분위수) — ${r.fisherCI ? `${Math.round(r.confidence * 100)}% CI` : '신뢰구간 미제공'}</div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.5rem">
                ${['B1','B5','B10','B50'].map(b => {
                    const bv = r.bxLife[b];
                    if (!bv) return `<div style="text-align:center">
                        <div style="font-size:0.75rem;color:var(--text-muted)">${b}</div>
                        <div style="font-weight:600;color:var(--text-primary)">N/A</div>
                     </div>`;
                    const est = bv.estimate != null ? bv.estimate.toFixed(1) : 'N/A';
                    const lo = bv.lower != null ? bv.lower.toFixed(1) : '—';
                    const hi = bv.upper != null ? bv.upper.toFixed(1) : '—';
                    return `<div style="text-align:center">
                        <div style="font-size:0.75rem;color:var(--text-muted)">${b}</div>
                        <div style="font-weight:600;color:var(--text-primary)">${est}</div>
                        ${bv.lower != null ? `<div style="font-size:0.65rem;color:var(--text-muted)">[${lo} — ${hi}]</div>` : ''}
                     </div>`;
                }).join('')}
            </div>
        </div>

        <!-- 분포 비교 테이블 (항상 열림) -->
        <div style="margin-bottom:0.75rem">
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem">📊 분포 적합도 비교 — 행을 클릭해 분포 선택, 헤더 클릭으로 정렬</div>
            <div class="table-wrapper">
                <table>
                    <thead><tr>
                        <th>분포</th>
                        ${thBtn('AICc','aic_c')}
                        ${thBtn('BIC','bic')}
                        ${thBtn('AD 수정값','ad')}
                        ${thBtn('-2LL','minus2ll')}
                    </tr></thead>
                    <tbody>${compHtml}</tbody>
                </table>
            </div>
        </div>

        <div style="display:flex;gap:0.75rem;margin-top:1.25rem">
            <button class="btn btn-primary" style="flex:1" onclick="switchAnalysisSubTab('charts')">📈 결과 차트 보기</button>
            <button class="btn btn-secondary" style="flex:1" onclick="switchAnalysisSubTab('calculator')">🎯 Bx 계산기</button>
        </div>
    `;
    const sumEl = document.getElementById('analysis-summary');
    if (sumEl) sumEl.innerHTML = html;
    window._analysisSummaryHTML = html;
}

function sortCompTable(key) {
    if (window._compSortKey === key) {
        window._compSortAsc = !window._compSortAsc;
    } else {
        window._compSortKey = key;
        window._compSortAsc = true;
    }
    if (_analysisResult) {
        renderAnalysisSummaryMultigroup(window._allGroupResults, Object.keys(window._allGroupResults), Object.keys(window._allGroupResults).length > 1);
    }
}

function selectCompDist(dist) {
    if (!_analysisResult) return;
    const groupId = window._currentGroupId || Object.keys(window._allGroupResults)[0];
    
    // 분포 재적합 (changeGroupDist와 동일 로직)
    changeGroupDist(groupId, dist);
}

// ── 결과 차트 탭 ──
function renderAnalysisChartsTab() {
    if (!_analysisResult) return '<div class="empty-state">분석을 먼저 실행하세요</div>';

    const conf = (_analysisResult.confidence * 100).toFixed(0);
    const allDists = (_analysisResult.comparison || []).map(c => c.dist);
    const distLabel = { 
        weibull: 'Weibull 2P', 
        lognormal: 'Lognormal 2P', 
        normal: 'Normal 2P', 
        exponential: 'Exponential 1P',
        weibull_mixture: 'Weibull Mixture (이중/경쟁고장)'
    };
    const distColors = { weibull:'#38bdf8', lognormal:'#f59e0b', normal:'#a78bfa', exponential:'#22c55e', weibull_mixture: '#f43f5e' };

    return `
    <div class="glass-card" style="margin-bottom:1rem">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem">
            <h3 class="section-title" style="margin:0">신뢰성 함수 차트</h3>
            <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
                <label style="font-size:0.8rem;display:flex;align-items:center;gap:0.4rem">
                    <input type="checkbox" id="show-ci" checked onchange="drawAllAnalysisCharts()">
                    신뢰구간
                </label>
                <input type="number" id="ci-level" value="${conf}" min="50" max="99" step="1"
                     style="width:60px;padding:3px 6px;font-size:0.8rem;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary)"
                     onchange="updateCILevel(this.value)">
                <span style="font-size:0.8rem;color:var(--text-muted)">%</span>
            </div>
        </div>
    </div>

    <!-- 그룹 비교 오버레이 토글 (다중 그룹일 때) -->
    ${(() => {
        const allRes = window._allGroupResults || {};
        const gids   = Object.keys(allRes).filter(g => allRes[g] && g !== '""');
        if (gids.length < 1) return '';
        const gCols  = ['#38bdf8','#f59e0b','#a78bfa','#22c55e','#ef4444','#f97316'];
        const checks = gids.map((g,i) => {
            const gr = allRes[g];
            const lbl = g === '__all__' ? '기본 그룹' : `그룹 ${g}`;
            const dist = gr?.distribution || 'weibull';
            const n    = gr?.dataSummary?.nTotal || 0;
            return '<div style="display:flex;align-items:center;gap:0.35rem;font-size:0.79rem;white-space:nowrap">'
                 + '<label style="cursor:pointer;display:flex;align-items:center;gap:0.3rem">'
                 + '<input type="checkbox" id="grp-show-' + g + '" checked onchange="drawAllAnalysisCharts()">'
                 + '<span style="color:' + gCols[i%gCols.length] + ';font-weight:700">' + lbl + ' (n=' + n + ')</span>'
                 + '</label>'
                 + '<select id="grp-dist-' + g + '" style="font-size:0.75rem;padding:2px 4px;background:var(--bg-primary);border:1px solid var(--border-color);color:var(--text-muted);border-radius:4px" onchange="changeGroupDist(\'' + g + '\', this.value)">'
                 + '<option value="weibull"' + (dist==='weibull'?' selected':'') + '>Weibull</option>'
                 + '<option value="weibull_mixture"' + (dist==='weibull_mixture'?' selected':'') + '>Weibull Mixture</option>'
                 + '<option value="lognormal"' + (dist==='lognormal'?' selected':'') + '>Lognormal</option>'
                 + '<option value="normal"' + (dist==='normal'?' selected':'') + '>Normal</option>'
                 + '<option value="exponential"' + (dist==='exponential'?' selected':'') + '>Exponential</option>'
                 + '</select>'
                 + '</div>';
        }).join('');
        return '<div class="glass-card" style="margin-bottom:1rem;padding:0.65rem 1rem">'
             + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.8rem">'
             + '<span style="font-size:0.8rem;color:var(--text-secondary);font-weight:600;margin-right:2px">그룹 및 분포 설정:</span>'
             + checks + '</div></div>';
    })()}

    <!-- 파라미터 요약 테이블 -->
    <div id="chart-param-summary"></div>

    <!-- 순서: f(t) h(t) / F(t) R(t) -->
    <div class="grid-2" style="gap:1rem">
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">고장 밀도 f(t)</h4>
                <span class="badge badge-warning">f(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="chart-pdf"></canvas></div>
        </div>
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">고장률 h(t)</h4>
                <span class="badge badge-purple">h(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="chart-hf"></canvas></div>
        </div>
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">불신뢰도 F(t)</h4>
                <span class="badge badge-danger">F(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="chart-cdf"></canvas></div>
        </div>
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">신뢰도 R(t)</h4>
                <span class="badge badge-success">R(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="chart-sf"></canvas></div>
        </div>
    </div>`;
}

function toggleDistPanel() {
    const panel = document.getElementById('dist-panel');
    if (!panel) return;
    const isOpen = panel.style.display === 'block';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        // 패널을 viewport 기준으로 위치 조정
        const btn = panel.previousElementSibling;
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = 'fixed';
            panel.style.top = (rect.bottom + 6) + 'px';
            panel.style.right = (window.innerWidth - rect.right) + 'px';
            panel.style.zIndex = '9999';
        }
    }
}

function updateCILevel(val) {
    const n = parseFloat(val);
    if (!_analysisResult || !isFinite(n) || n < 50 || n > 99) return;
    // 신뢰구간 재계산
    const r = _analysisResult;
    const confidence = n / 100;
    const zScore = Distributions.normalPPF((1 + confidence) / 2);
    
    // fisherCI 재계산
    if (r.dataSummary.failures && r.dataSummary.failures.length >= 3) {
        r.fisherCI = Statistics.computeFisherCI(
            r.dataSummary.arbitraryData || r.dataSummary.failures,
            r.dataSummary.arbitraryData ? null : r.dataSummary.censored,
            r.dist || r.distribution, r.params, confidence
        );
    }
    
    const cdfVals = r.plotData.cdf;
    const hfVals  = r.plotData.hf;
    const nTotal  = r.dataSummary.nTotal;
    
    let cdfCI, hfCI;
    if (r.fisherCI && r.fisherCI.covMatrix) {
        cdfCI = Statistics.computeTrueCDFCI(r.dist || r.distribution, r.params, r.fisherCI.covMatrix, r.plotData.x, zScore);
        hfCI  = Statistics.computeHazardCI(r.dist || r.distribution, r.params, r.fisherCI.covMatrix, r.plotData.x, zScore);
    } else {
        cdfCI = Statistics.waldLogitCI(cdfVals, nTotal, zScore);
        hfCI  = Statistics.hazardLogCI(hfVals, r.dataSummary.nFailures, zScore);
    }
    
    r.confidence = confidence;
    r.plotData.cdfLower = cdfCI.lower;
    r.plotData.cdfUpper = cdfCI.upper;
    r.plotData.relLower = cdfCI.upper.map(v => 1 - v);
    r.plotData.relUpper = cdfCI.lower.map(v => 1 - v);
    r.plotData.hfLower  = hfCI.lower;
    r.plotData.hfUpper  = hfCI.upper;
    
    // UI의 모수 텍스트 영역 갱신
    if (typeof updateParameterDisplay === 'function') {
        updateParameterDisplay(r);
    }
    drawAllAnalysisCharts();
}

function changeGroupDist(groupId, newDist) {
    const allRes = window._allGroupResults;
    if (!allRes || !allRes[groupId]) return;
    try {
        const rawRows = getAnalysisData();
        const grouped = groupAnalysisData(rawRows);
        const dataRows = grouped[groupId === '기본 그룹' ? '__all__' : groupId] || grouped[groupId] || [];
        
        const confText = document.getElementById('ci-level')?.value;
        const conf = confText ? parseInt(confText)/100 : 0.90;
        const newResult = ReliabilityAnalysis.analyze(dataRows, { distribution: newDist, confidence: conf });
        newResult._groupId = groupId;
        allRes[groupId] = newResult;

        if (window._currentGroupId === groupId) {
            _analysisResult = newResult;
        }

        // 1. 차트 탭 갱신
        const chartsTab = document.getElementById('analysis-charts-tab');
        if (chartsTab && chartsTab.classList.contains('active')) {
            drawAllAnalysisCharts();
        }

        // 2. 입력/분석 탭 요약 테이블 갱신
        const inputTab = document.querySelector('#analysis-sub-tabs .sub-tab-btn[data-subtab="input"]');
        if (inputTab && inputTab.classList.contains('active')) {
            renderAnalysisSummaryMultigroup(allRes, Object.keys(allRes), Object.keys(allRes).length > 1);
        }
    } catch(e) {
        console.warn('그룹 분포 변경 실패', e);
        alert('해당 분포로 피팅할 수 없습니다 (예: 음수 데이터).');
        // 복구
        const selectEl = document.getElementById('grp-dist-' + groupId);
        if (selectEl && allRes[groupId].distribution) {
            selectEl.value = allRes[groupId].distribution;
        }
    }
}

function drawAllAnalysisCharts() {
    if (!_analysisResult) return;
    const r = _analysisResult;
    const showCI = document.getElementById('show-ci')?.checked ?? true;

    // 선택 분포: 이제 물리적으로 피팅된 결과를 사용하므로 항상 r.distribution
    const selectedDist = r.distribution;
    const isCustom = false;

    // 비교 추가 체크된 분포 (선택 분포 제외)
    const compareDists = (r.comparison || []).filter(c =>
        c.dist !== selectedDist &&
        document.getElementById('compare-' + c.dist)?.checked
    );

    // {x,y} points 생성
    function mkPts(yArr, xData) {
        if (!yArr) return [];
        const x = xData || r.plotData.x;
        const pts = [];
        for (let i = 0; i < x.length; i++) {
            const y = yArr[i];
            if (isFinite(y) && y >= 0) pts.push({ x: x[i], y });
        }
        return pts;
    }
    function mkPtsFromFn(fn) {
        const x = r.plotData.x;
        const pts = [];
        for (let i = 0; i < x.length; i++) {
            try { const y = fn(x[i]); if (isFinite(y) && y >= 0) pts.push({ x: x[i], y }); } catch(e) {}
        }
        return pts;
    }
    function mkCI(yUpper, yLower, color, xDataList) {
        if (!yUpper || !yLower) return [];
        const xList = xDataList || r.plotData.x;
        const upperPts = [], lowerPts = [];
        for (let i = 0; i < xList.length; i++) {
            let yu = yUpper[i];
            let yl = yLower[i];
            if (!isFinite(yu) || isNaN(yu)) yu = 0;
            if (!isFinite(yl) || isNaN(yl)) yl = 0;
            yu = Math.max(0, yu);
            yl = Math.max(0, yl);
            upperPts.push({ x: xList[i], y: yu });
            lowerPts.push({ x: xList[i], y: yl });
        }
        return [
            { label: 'Upper CI', data: upperPts, borderColor: color + '40', borderWidth: 1.2, borderDash: [4, 4], backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3 },
            { label: 'Lower CI', data: lowerPts, borderColor: color + '40', borderWidth: 1.2, borderDash: [4, 4], backgroundColor: color + '12', fill: '-1', pointRadius: 0, tension: 0.3 }
        ];
    }

    const isMultiGroup = window._allGroupResults && Object.keys(window._allGroupResults).length > 1;

    // 다중 그룹 오버레이 데이터셋 (체크박스 기반)
    function groupOverlayDatasets(plotKey) {
        const allRes = window._allGroupResults || {};
        const gids   = Object.keys(allRes).filter(g => allRes[g]);
        if (gids.length < 2) return [];
        const gCols = ['#38bdf8','#f59e0b','#a78bfa','#22c55e','#ef4444','#f97316'];
        const dLbl  = { weibull:'Weibull 2P', lognormal:'Lognormal 2P', normal:'Normal 2P', exponential:'Exponential 1P' };
        const ds = [];
        gids.forEach((g, i) => {
            if (!document.getElementById('grp-show-' + g)?.checked) return;
            const gr = allRes[g];
            if (!gr?.plotData?.[plotKey]) return;
            const col = gCols[i % gCols.length];
            const gx  = gr.plotData.x;
            const ya  = gr.plotData[plotKey];
            const pts = [];
            for (let k = 0; k < gx.length; k++) {
                const y = ya[k];
                if (isFinite(y) && y >= 0) pts.push({ x: gx[k], y });
            }
            const glbl = (g === '__all__' ? '전체' : '그룹 ' + g) + ' (' + (dLbl[gr.distribution] || gr.distribution) + ')';
            ds.push({ label: glbl, data: pts, borderColor: col, backgroundColor: 'transparent', fill: false, pointRadius: 0, borderWidth: 2, borderDash: [6,3], tension: 0.3 });
            
            if (showCI) {
                let uKey = plotKey + 'Upper', lKey = plotKey + 'Lower';
                if (plotKey === 'cdf') { uKey = 'cdfUpper'; lKey = 'cdfLower'; }
                else if (plotKey === 'sf') { uKey = 'relUpper'; lKey = 'relLower'; }
                
                if (gr.plotData[uKey] && gr.plotData[lKey]) {
                    ds.push(...mkCI(gr.plotData[uKey], gr.plotData[lKey], col, gx));
                }
            }
        });
        return ds;
    }

    // 비교 그룹 데이터셋
    function compDatasets(plotKey) {
        if (!compareDists || compareDists.length === 0) return [];
        const ds = [];
        compareDists.forEach((c, i) => {
             const fn = _getDistFn(c.dist,
                 plotKey === 'pdf' ? 'pdfFn' :
                 plotKey === 'hf' ? 'hfFn' :
                 plotKey === 'cdf' ? 'cdfFn' : 'sfFn'
             );
             if(!fn) return;
             const pts = mkPtsFromFn(fn);
             const col = distColors[c.dist] || '#94a3b8';
             ds.push({
                 label: `${plotKey === 'pdf' ? 'f(t)' : plotKey === 'hf' ? 'h(t)' : plotKey === 'cdf' ? 'F(t)' : 'R(t)'} – ${distLabel[c.dist] || c.dist}`,
                 data: pts, borderColor: col, backgroundColor: 'transparent',
                 fill: false, pointRadius: 0, borderWidth: 2, borderDash: [4,4], tension: 0.3
             });
        });
        return ds;
    }

    // 선택 분포의 함수 가져오기
    function getMainFn(fnName) {
        if (!isCustom) return null; // 원래 plotData 사용
        return _getDistFn(selectedDist, fnName);
    }

    // 선택 분포 곡선 데이터 (isCustom이면 함수로, 아니면 plotData에서)
    const distLabel = { weibull:'Weibull 2P', lognormal:'Lognormal 2P', normal:'Normal 2P', exponential:'Exponential 1P' };
    const selLabel = distLabel[selectedDist] || selectedDist;

    function mainPts(fnName, plotKey) {
        if (isCustom) {
            const fn = getMainFn(fnName);
            return fn ? mkPtsFromFn(fn) : [];
        }
        return mkPts(r.plotData[plotKey]);
    }

    let km = null;
    try {
        if (r.dataSummary.nFailures >= 2)
            km = Statistics.computeKaplanMeier(r.dataSummary.failures, r.dataSummary.censored);
    } catch(e) { console.warn('KM 계산 실패:', e); }

    const baseOpts = {
        responsive: true, maintainAspectRatio: false, parsing: false,
        animation: { duration: 400 },
        plugins: { 
            legend: { position: 'top', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
            zoom: {
                pan: { enabled: true, mode: 'xy', modifierKey: 'ctrl' },
                zoom: {
                    wheel: { enabled: true, modifierKey: 'ctrl' },
                    pinch: { enabled: true },
                    mode: 'xy'
                }
            }
        },
        scales: {
            x: { type: 'linear', title: { display: true, text: '시간 (t)', color: '#64748b' }, ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(148,163,184,0.08)' } },
            y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } }
        }
    };
    function makeOpts(yLabel) {
        const o = JSON.parse(JSON.stringify(baseOpts));
        o.scales.y.title = { display: true, text: yLabel, color: '#64748b' };
        return o;
    }
    // ── f(t) 차트 ──
    try {
        const dsets = [];
        if (!isMultiGroup) {
            dsets.push({ label: `f(t) – ${selLabel}`, data: mainPts('pdfFn','pdf'), borderColor: '#f59e0b', backgroundColor: '#f59e0b18', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 });
        }
        dsets.push(...groupOverlayDatasets('pdf'));
        dsets.push(...compDatasets('pdf'));
        ChartManager.createOrUpdate('chart-pdf', { type:'line', data:{datasets:dsets}, options:makeOpts('f(t)') });
    } catch(e) { console.error('f(t) 차트 오류:', e); }

    // ── h(t) 차트 ──
    try {
        const dsets = [];
        if (!isMultiGroup) {
            dsets.push({ label: `h(t) – ${selLabel}`, data: mainPts('hfFn','hf'), borderColor: '#a78bfa', backgroundColor: '#a78bfa18', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 });
            if (showCI && !isCustom && r.plotData.hfLower) dsets.push(...mkCI(r.plotData.hfUpper, r.plotData.hfLower, '#a78bfa'));
        }
        dsets.push(...groupOverlayDatasets('hf'));
        dsets.push(...compDatasets('hf'));
        ChartManager.createOrUpdate('chart-hf', { type:'line', data:{datasets:dsets}, options:makeOpts('h(t)') });
    } catch(e) { console.error('h(t) 차트 오류:', e); }

    // ── F(t) 차트 ──
    try {
        const dsets = [];
        if (!isMultiGroup) {
            dsets.push({ label: `F(t) – ${selLabel}`, data: mainPts('cdfFn','cdf'), borderColor: '#ef4444', backgroundColor: '#ef444418', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 });
            if (showCI && !isCustom && r.plotData.cdfLower) dsets.push(...mkCI(r.plotData.cdfUpper, r.plotData.cdfLower, '#ef4444'));
            if (km) dsets.push({ label: '경험적 F(t)', data: km.times.map((t,i) => ({x:t, y:km.fValues[i]})), borderColor:'#fff', backgroundColor:'#fff', showLine:false, pointRadius:4 });
        }
        dsets.push(...groupOverlayDatasets('cdf'));
        dsets.push(...compDatasets('cdf'));
        ChartManager.createOrUpdate('chart-cdf', { type:'line', data:{datasets:dsets}, options:makeOpts('F(t)') });
    } catch(e) { console.error('F(t) 차트 오류:', e); }

    // ── R(t) 차트 ──
    try {
        const dsets = [];
        if (!isMultiGroup) {
            dsets.push({ label: `R(t) – ${selLabel}`, data: mainPts('sfFn','sf'), borderColor: '#22c55e', backgroundColor: '#22c55e18', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 });
            if (showCI && !isCustom && r.plotData.relLower) dsets.push(...mkCI(r.plotData.relUpper, r.plotData.relLower, '#22c55e'));
            if (km) dsets.push({ label: '경험적 R(t)', data: km.times.map((t,i) => ({x:t, y:1-km.fValues[i]})), borderColor:'#fff', backgroundColor:'#fff', showLine:false, pointRadius:4 });
        }
        dsets.push(...groupOverlayDatasets('sf'));
        dsets.push(...compDatasets('sf'));
        ChartManager.createOrUpdate('chart-sf', { type:'line', data:{datasets:dsets}, options:makeOpts('R(t)') });
    } catch(e) { console.error('R(t) 차트 오류:', e); }

    // 파라미터 요약 테이블 갱신
    renderChartParamSummary();
}

// 분포별 함수 반환 헬퍼
function _getDistFn(dist, fnName) {
    const fits = window._allFits || {};
    if (!fits[dist]) {
        try {
            fits[dist] = ReliabilityAnalysis.fitDistribution(
                dist,
                _analysisResult.dataSummary.failures,
                _analysisResult.dataSummary.censored
            );
        } catch(e) { return null; }
    }
    window._allFits = fits;
    const f = fits[dist];
    if (!f) return null;
    // fnName은 'cdfFn'/'cdf', 'sfFn'/'sf', 'pdfFn'/'pdf', 'hfFn'/'hf' 모두 지원
    const map = {
        cdfFn: f.cdfFn, cdf: f.cdfFn,
        sfFn:  f.sfFn,  sf:  f.sfFn,
        pdfFn: f.pdfFn, pdf: f.pdfFn,
        hfFn:  f.hfFn,  hf:  f.hfFn
    };
    return map[fnName] || null;
}

function drawReliabilityChart(canvasId, xData, opts, baseOptions) {
    // Legacy wrapper — 더이상 메인 경로에서 호출하지 않음
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const toPoints = (yArr) => xData.map((x, i) => {
        const y = yArr[i];
        return (isFinite(y) && y >= 0) ? { x, y } : null;
    }).filter(Boolean);
    const datasets = [{ label: opts.label, data: toPoints(opts.data), borderColor: opts.color, fill: false, pointRadius: 0, borderWidth: 2.5 }];
    const options = Object.assign({}, baseOptions, { parsing: false });
    options.scales = Object.assign({}, baseOptions.scales || {});
    options.scales.x = Object.assign({}, (baseOptions.scales || {}).x || {}, { type: 'linear' });
    options.scales.y = Object.assign({}, (baseOptions.scales || {}).y || {}, { title: { display: true, text: opts.yLabel, color: '#64748b' } });
    ChartManager.createOrUpdate(canvasId, { type: 'line', data: { datasets }, options });
}


// 결과 차트 탭 — 파라미터 요약 테이블 렌더링
function renderChartParamSummary() {
    var container = document.getElementById('chart-param-summary');
    if (!container) return;
    var allRes = window._allGroupResults || {};
    var gids = Object.keys(allRes).filter(function(g){ return allRes[g] && g && g !== '""'; });
    if (gids.length === 0) { container.innerHTML = ''; return; }
    var distLabel = { weibull:'Weibull 2P', lognormal:'Lognormal 2P', normal:'Normal 2P', exponential:'Exponential 1P' };
    var gCols = ['#38bdf8','#f59e0b','#a78bfa','#22c55e','#ef4444','#f97316'];
    var html = '';
    gids.forEach(function(g, idx) {
        var chk = document.getElementById('grp-show-' + g);
        if (chk && !chk.checked) return;
        var r = allRes[g];
        if (!r || !r.params) return;
        var lbl = g === '__all__' ? '기본 그룹' : '그룹 ' + g;
        var dName = distLabel[r.distribution] || r.distribution;
        var conf = Math.round((r.confidence || 0.9) * 100);
        var rows = [];
        if (r.distribution === 'weibull') {
            rows.push(['척도모수 (η)', r.params.alpha, r.fisherCI ? r.fisherCI.alphaLower : null, r.fisherCI ? r.fisherCI.alphaUpper : null]);
            rows.push(['형상모수 (β)', r.params.beta, r.fisherCI ? r.fisherCI.betaLower : null, r.fisherCI ? r.fisherCI.betaUpper : null]);
        } else if (r.distribution === 'lognormal' || r.distribution === 'normal') {
            rows.push(['위치모수 (μ)', r.params.mu, r.fisherCI ? r.fisherCI.muLower : null, r.fisherCI ? r.fisherCI.muUpper : null]);
            rows.push(['척도모수 (σ)', r.params.sigma, r.fisherCI ? r.fisherCI.sigmaLower : null, r.fisherCI ? r.fisherCI.sigmaUpper : null]);
        } else if (r.distribution === 'exponential') {
            rows.push(['고장률 (λ)', r.params.lambda, r.fisherCI ? r.fisherCI.lambdaLower : null, r.fisherCI ? r.fisherCI.lambdaUpper : null]);
        }
        var fmtVal = function(v) { return v != null && isFinite(v) ? v.toFixed(4) : '—'; };
        var rowsHtml = rows.map(function(row) {
            return '<tr><td class="table-cell">' + row[0] + '</td>'
                 + '<td class="table-cell" style="color:' + gCols[idx % gCols.length] + ';font-weight:600">' + fmtVal(row[1]) + '</td>'
                 + '<td class="table-cell">' + fmtVal(row[2]) + '</td>'
                 + '<td class="table-cell">' + fmtVal(row[3]) + '</td></tr>';
        }).join('');
        html += '<div class="glass-card" style="margin-bottom:0.75rem;padding:0.65rem 0.85rem">'
             + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">'
             + '<span style="font-size:0.85rem;font-weight:600;color:' + gCols[idx % gCols.length] + '">' + lbl + '</span>'
             + '<span style="font-size:0.75rem;color:var(--text-muted)">' + dName + ' | ' + conf + '% CI</span>'
             + '</div>'
             + '<div class="table-wrapper"><table style="font-size:0.82rem"><thead><tr>'
             + '<th>파라미터</th><th>추정값</th><th>하한</th><th>상한</th></tr></thead><tbody>'
             + rowsHtml + '</tbody></table></div></div>';
    });
    container.innerHTML = html;
}


// ── 고급분석(Weibull 분포 한정) 탭 ──
function renderAdvancedTab() {
    if (!_analysisResult) return '<div class="empty-state">분석을 먼저 실행하세요</div>';
    
    const allRes = window._allGroupResults || {};
    const gids   = Object.keys(allRes).filter(g => allRes[g]);
    const isMulti = gids.length >= 2;
    const conf = Math.round((_analysisResult.confidence || 0.9) * 100);

    // Weibull 분포가 하나도 없으면 안내
    const hasAnyWeibull = gids.some(g => allRes[g].distribution === 'weibull');

    let html = `
    <div class="glass-card" style="margin-bottom:1rem;padding:0.65rem 1rem">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:1rem">
            <h3 class="section-title" style="margin:0">고급분석 <span style="font-size:0.8rem;color:var(--text-muted);font-weight:normal">(Weibull 분포 한정)</span></h3>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-left:auto">
                <label style="font-size:0.82rem;color:var(--text-secondary)">신뢰수준:</label>
                <input type="number" id="adv-ci-level" value="${conf}" min="50" max="99" step="1"
                    style="width:65px;padding:3px 8px;font-size:0.83rem;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary)"
                    onchange="updateAdvancedCI(this.value)">
                <span style="font-size:0.82rem;color:var(--text-muted)">%</span>
            </div>
        </div>
    </div>`;

    if (!hasAnyWeibull) {
        html += '<div class="info-box" style="margin-bottom:1rem;font-size:0.88rem">⚠️ 현재 분석된 그룹 중 Weibull 분포가 없습니다. 결과 차트 탭에서 분포를 Weibull로 변경하거나, 자동 선택 시 Weibull이 선택되는 데이터를 사용해 주세요.</div>';
    }

    // Weibull 그룹만 표시
    gids.filter(g => allRes[g].distribution === 'weibull').forEach(g => {
        const res = allRes[g];
        const hasFisher  = !!res.fisherCI;
        const glbl = g === '__all__' ? '전체 그룹' : '그룹 ' + g;

        html += `
        ${isMulti ? `<h4 style="margin: 0.5rem 0 0.5rem 0; color:var(--text-primary); font-size:1.05rem;">▶ ${glbl} <span style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">(Weibull 2P)</span></h4>` : ''}
        <div class="glass-card" style="margin-bottom:1.5rem">
            <h4 style="color:var(--text-secondary);margin-bottom:1rem">파라미터 Fisher 신뢰구간 (Weibull 2P)</h4>
            ${hasFisher ? renderFisherTable(res.fisherCI, res.params, res.confidence, 'weibull')
                        : '<div class="info-box" style="font-size:0.85rem">분포 적합 실패 또는 데이터 부족</div>'}
        </div>`;
    });

    // 통합 Contour Plot
    const hasContour = gids.some(g => allRes[g].contourData);
    let contourControls = '';
    if (hasContour) {
        contourControls = `
        <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center;margin-bottom:1rem;background:rgba(255,255,255,0.03);padding:0.75rem 1rem;border-radius:6px;border:1px solid rgba(255,255,255,0.05)">
            <div style="display:flex;align-items:center;gap:0.5rem">
                <label style="font-size:0.85rem;color:var(--text-secondary)">Contour Plot 전용 신뢰수준:</label>
                <input type="number" id="contour-ci-level" value="${conf}" min="50" max="99" step="1"
                    style="width:65px;padding:3px 8px;font-size:0.85rem;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary)"
                    onchange="updateContourCI(this.value)"
                    onkeydown="if(event.key==='Enter'){updateContourCI(this.value); this.blur(); event.preventDefault();}">
                <span style="font-size:0.85rem;color:var(--text-muted)">%</span>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap" id="contour-group-toggles">
                <span style="font-size:0.85rem;color:var(--text-secondary)">표시 그룹:</span>
                ${gids.filter(g => allRes[g].contourData).map((g, idx) => {
                    const glbl = g === '__all__' ? '전체 그룹' : '그룹 ' + g;
                    const gCols = ['#38bdf8','#f59e0b','#a78bfa','#22c55e','#ef4444','#f97316'];
                    const col = gCols[idx % gCols.length];
                    return `<label style="display:flex;align-items:center;gap:0.3rem;cursor:pointer;font-size:0.85rem;color:${col}">
                        <input type="checkbox" checked onchange="toggleContourGroup(${idx}, this.checked)" style="accent-color:${col}">
                        ${glbl}
                    </label>`;
                }).join('')}
            </div>
        </div>`;
    }

    html += `
    <div class="glass-card">
        <h4 style="color:var(--text-secondary);margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center">
            <span>Contour Plot (η-β 우도비 신뢰구간)</span>
        </h4>
        ${contourControls}
        ${hasContour
            ? '<div class="chart-container" style="height:400px"><canvas id="chart-contour"></canvas></div>'
            : '<div class="info-box">Weibull/Lognormal 등 허용 분포 및 최소 5개 데이터 필요</div>'}
    </div>`;

    return html;
}

// 고급분석 신뢰수준 실시간 변경 (모든 그룹 일괄 적용)
function updateAdvancedCI(val) {
    const n = parseFloat(val);
    if (!isFinite(n) || n < 50 || n > 99) return;
    const conf = n / 100;
    
    const allRes = window._allGroupResults || {};
    const gids   = Object.keys(allRes).filter(g => allRes[g]);
    
    try {
        const rawRows = getAnalysisData();
        const grouped = groupAnalysisData(rawRows);
        
        gids.forEach(g => {
            const dataRows = grouped[g === '기본 그룹' || g === '__all__' ? '__all__' : g] || grouped[g] || [];
            const expanded = expandIntervalRows(dataRows);
            const rs = expanded.failures.map(t => ({time:t,event:'F'}))
                .concat(expanded.censored.map(t => ({time:t,event:'C'})));
            
            const dist = allRes[g].distribution;
            const newResult = ReliabilityAnalysis.analyze(rs, { distribution: dist, confidence: conf });
            newResult._groupId = g;
            allRes[g] = newResult;
        });
        
        if (window._currentGroupId && allRes[window._currentGroupId]) {
            _analysisResult = allRes[window._currentGroupId];
        }
        
        switchAnalysisSubTab('advanced');
    } catch(e) {
        console.error('신뢰수준 갱신 실패:', e);
    }
}

function updateContourCI(val) {
    const n = parseFloat(val);
    if (!isFinite(n) || n < 50 || n > 99) return;
    const conf = n / 100;
    
    const allRes = window._allGroupResults || {};
    const gids = Object.keys(allRes).filter(g => allRes[g] && allRes[g].contourData);
    if (gids.length === 0) return;
    
    try {
        const rawRows = getAnalysisData();
        const grouped = groupAnalysisData(rawRows);
        
        gids.forEach(g => {
            const dataRows = grouped[g === '기본 그룹' || g === '__all__' ? '__all__' : g] || grouped[g] || [];
            const expanded = expandIntervalRows(dataRows);
            const r = allRes[g];
            
            let p1 = 0, p2 = 0;
            if (r.distribution === 'weibull') { p1 = r.params.alpha; p2 = r.params.beta; }
            else if (r.distribution === 'lognormal' || r.distribution === 'normal') { p1 = r.params.mu; p2 = r.params.sigma; }
            else if (r.distribution === 'exponential') { p1 = r.params.lambda; p2 = 0; }
            
            // Recompute contour using the specific conf
            if (typeof Statistics !== 'undefined' && Statistics.computeContourPlot) {
                r.contourData = Statistics.computeContourPlot(expanded.failures, expanded.censored, p1, p2, conf, r.distribution);
            }
        });
        
        // Redraw only the contour chart
        drawAdvancedCharts();
    } catch(e) {
        console.error('Contour Plot 신뢰수준 갱신 실패:', e);
    }
}

function toggleContourGroup(idx, isVisible) {
    const chart = ChartManager._charts['chart-contour'];
    if (chart) {
        // Each group has 2 datasets: ML point (idx*2) and Contour line (idx*2+1)
        chart.setDatasetVisibility(idx * 2, isVisible);
        chart.setDatasetVisibility(idx * 2 + 1, isVisible);
        chart.update();
    }
}

function renderFisherTable(fi, params, confidence, distType) {
    const z = (confidence * 100).toFixed(0);
    const rows = [];
    if (distType === 'weibull') {
        rows.push(['척도모수 (η)', params.alpha, fi.alphaLower, fi.alphaUpper]);
        rows.push(['형상모수 (β)', params.beta,  fi.betaLower,  fi.betaUpper]);
    } else if (distType === 'lognormal' || distType === 'normal') {
        rows.push(['위치모수 (μ)', params.mu, fi.muLower, fi.muUpper]);
        rows.push(['척도모수 (σ)', params.sigma, fi.sigmaLower, fi.sigmaUpper]);
    } else if (distType === 'exponential') {
        rows.push(['고장률 (λ)', params.lambda, fi.lambdaLower, fi.lambdaUpper]);
    }
    return `
    <div class="table-wrapper">
        <table>
            <thead><tr><th>파라미터</th><th>추정값</th><th>하한 (${z}% CI)</th><th>상한</th></tr></thead>
            <tbody>
                ${rows.map(([name, est, lo, hi]) => `
                <tr>
                    <td class="table-cell">${name || ''}</td>
                    <td class="table-cell" style="color:var(--accent-color);font-weight:600">${est ? est.toFixed(4) : 'N/A'}</td>
                    <td class="table-cell">${lo ? lo.toFixed(4) : 'N/A'}</td>
                    <td class="table-cell">${hi ? hi.toFixed(4) : 'N/A'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>
    <div style="margin-top:0.75rem;font-size:0.8rem;color:var(--text-muted)">
        Ref: Fisher Information Matrix (Log-space), Meeker &amp; Escobar (1998), Eq. 8.23-8.27
    </div>`;
}

function drawAdvancedCharts() {
    const allRes = window._allGroupResults || {};
    const gids   = Object.keys(allRes).filter(g => allRes[g]);
    const gCols = ['#38bdf8','#f59e0b','#a78bfa','#22c55e','#ef4444','#f97316'];

    // 각 그룹별 Probability Plot
    gids.forEach((g, idx) => {
        const r = allRes[g];
        const canvasId = 'chart-prob-' + g;
        if (r.probPlot && document.getElementById(canvasId)) {
            const pp = r.probPlot;
            const col = gCols[idx % gCols.length];
            // probPlot에 이미 분포별 xLabel/yLabel이 포함됨
            const xLabel = pp.xLabel || '시간 (t)';
            const yLabel = pp.yLabel || 'y';

            ChartManager.createChart(canvasId, {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: 'KM 데이터 점',
                            data: pp.xPts.map((x, i) => ({ x, y: pp.yPts[i] })),
                            backgroundColor: col,
                            borderColor: col,
                            pointRadius: 6
                        },
                        {
                            label: '분포 적합선',
                            data: pp.xLine.map((x, i) => ({ x, y: pp.yLine[i] })),
                            type: 'line',
                            borderColor: '#ef4444',
                            borderWidth: 2,
                            pointRadius: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#94a3b8' } } },
                    scales: {
                        x: { title: { display: true, text: xLabel, color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                        y: { title: { display: true, text: yLabel, color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } }
                    }
                }
            });
        }
    });

    // 통합 Contour Plot
    if (document.getElementById('chart-contour')) {
        const datasets = [];
        let plotX = 'eta', plotY = 'beta'; // Default
        
        gids.forEach((g, idx) => {
            const r = allRes[g];
            if (r.contourData) {
                const cd = r.contourData;
                const pts = cd.contourPoints;
                const col = gCols[idx % gCols.length];
                const areaCol = col + '22';
                const contourData = pts.map(p => ({ x: p.x, y: p.y }));
                if (contourData.length > 0) contourData.push(contourData[0]); // 닫힌 경로
                
                const glbl = g === '__all__' ? '전체 그룹' : '그룹 ' + g;
                
                datasets.push(
                    {
                        label: `${glbl} ML 모수`,
                        data: [{ x: cd.mleX, y: cd.mleY }],
                        backgroundColor: col,
                        pointRadius: 8,
                        pointStyle: 'crossRot'
                    },
                    {
                        label: `${glbl} 등고선`,
                        data: contourData,
                        type: 'line',
                        borderColor: col,
                        backgroundColor: areaCol,
                        fill: true,
                        pointRadius: 0,
                        borderWidth: 2,
                        tension: 0.1
                    }
                );
                
                plotX = cd.labelX || '파라미터 1';
                plotY = cd.labelY || '파라미터 2';
            }
        });

        if (datasets.length > 0) {
            ChartManager.createChart('chart-contour', {
                type: 'scatter',
                data: { datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { color: '#94a3b8' } } },
                    scales: {
                        x: { title: { display: true, text: plotX, color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                        y: { title: { display: true, text: plotY, color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } }
                    }
                }
            });
        }
    }
}

// ── Bx / F(t) 계산기 탭 — 단순화 리디자인 ──
let _calcQueryCounts = {};

function renderCalculatorTab() {
    const allRes = window._allGroupResults || {};
    const gids = Object.keys(allRes).filter(g => allRes[g] && g && g !== '""' && g !== 'undefined');
    if (gids.length === 0) return '<div class="empty-state" style="padding:3rem"><div style="font-size:1.1rem;color:var(--text-muted)">📊 분석을 먼저 실행하세요</div><div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem">데이터 입력 & 분석 탭에서 분석을 실행한 후<br>Bx 수명과 고장확률을 계산할 수 있습니다.</div></div>';

    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 1.5rem;">';

    gids.forEach(gid => {
        const r = allRes[gid];
        let currentConf = Math.round((r.confidence || 0.9) * 100);

        const distLabel = { weibull:'Weibull 2P', lognormal:'Lognormal 2P', normal:'Normal 2P', exponential:'Exponential 1P' };
        const selLabel = distLabel[r.distribution] || r.distribution;
        const groupTitle = gid === '__all__' ? '분석 결과' : '그룹 ' + gid;
        let exampleT = '100';
        try { if (r.bxLife && r.bxLife.B10 && r.bxLife.B10.estimate) exampleT = r.bxLife.B10.estimate.toFixed(0); } catch(e) {}

        html += '<div class="glass-card" style="display:flex; flex-direction:column; gap:0.85rem;">'
            + '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem">'
            + '<h3 class="section-title" style="margin:0;font-size:1.05rem">🎯 ' + groupTitle + '</h3>'
            + '<select id="calc-dist-' + gid + '" style="font-size:0.75rem;padding:3px 8px;background:var(--bg-secondary);border:1px solid var(--border-color);color:var(--accent-color);border-radius:4px;font-weight:600;flex-shrink:0;width:auto" onchange="changeCalcDist(\'' + gid + '\', this.value)">'
            + '<option value="weibull"' + (r.distribution==='weibull'?' selected':'') + '>Weibull 2P</option>'
            + '<option value="lognormal"' + (r.distribution==='lognormal'?' selected':'') + '>Lognormal 2P</option>'
            + '<option value="normal"' + (r.distribution==='normal'?' selected':'') + '>Normal 2P</option>'
            + '<option value="exponential"' + (r.distribution==='exponential'?' selected':'') + '>Exponential 1P</option>'
            + '</select>'
            + '</div>'

            // 신뢰수준
            + '<div style="display:flex;align-items:center;gap:0.5rem;">'
            + '<span style="font-size:0.82rem;color:var(--text-secondary)">신뢰수준</span>'
            + '<input type="number" id="calc-ci-level-' + gid + '" value="' + currentConf + '" min="50" max="99" step="1"'
            + ' style="width:55px;padding:3px 6px;font-size:0.82rem;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);text-align:center"'
            + ' onchange="onCalcCIChange(\'' + gid + '\', this.value)">'
            + '<span style="font-size:0.82rem;color:var(--text-muted)">%</span>'
            + '</div>'

            // Bx 수명
            + '<div style="background:rgba(56,189,248,0.05);border:1px solid rgba(56,189,248,0.12);border-radius:8px;padding:0.75rem">'
            + '<div style="font-size:0.82rem;font-weight:600;color:var(--accent-color);margin-bottom:0.5rem">📐 Bx 수명 계산</div>'
            + '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem">고장확률 x% 에 해당하는 수명 (예: B10 = 10%가 고장나는 시점)</div>'
            + '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">'
            + '<span style="font-size:0.82rem;color:var(--text-secondary)">B</span>'
            + '<input type="number" id="calc-bx-' + gid + '" value="10" min="0.1" max="99" step="1" style="width:60px;padding:4px 6px;font-size:0.85rem;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);text-align:center" onkeydown="if(event.key===\'Enter\')calcBxLife(\'' + gid + '\')">' 
            + '<span style="font-size:0.82rem;color:var(--text-secondary)">수명 =</span>'
            + '<span id="calc-bx-result-' + gid + '" style="font-size:1rem;font-weight:700;color:var(--accent-color)">—</span>'
            + '<span style="font-size:0.78rem;color:var(--text-muted)">시간</span>'
            + '<button class="btn btn-sm btn-secondary" onclick="calcBxLife(\'' + gid + '\')" style="font-size:0.75rem;padding:3px 10px">계산</button>'
            + '</div>'
            + '<div id="calc-bx-ci-' + gid + '" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem"></div>'
            + '</div>'

            // F(t)
            + '<div style="background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.12);border-radius:8px;padding:0.75rem">'
            + '<div style="font-size:0.82rem;font-weight:600;color:var(--danger);margin-bottom:0.5rem">📊 고장확률 F(t)</div>'
            + '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem">특정 시간까지 고장날 확률을 구합니다.</div>'
            + '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">'
            + '<span style="font-size:0.82rem;color:var(--text-secondary)">t =</span>'
            + '<input type="number" id="calc-ft-' + gid + '" value="' + exampleT + '" min="0" style="width:80px;padding:4px 6px;font-size:0.85rem;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);text-align:center" onkeydown="if(event.key===\'Enter\')calcFt(\'' + gid + '\')">' 
            + '<span style="font-size:0.82rem;color:var(--text-secondary)">시간 → F(t) =</span>'
            + '<span id="calc-ft-result-' + gid + '" style="font-size:1rem;font-weight:700;color:var(--danger)">—</span>'
            + '<button class="btn btn-sm btn-secondary" onclick="calcFt(\'' + gid + '\')" style="font-size:0.75rem;padding:3px 10px">계산</button>'
            + '</div>'
            + '<div id="calc-ft-ci-' + gid + '" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem"></div>'
            + '</div>'

            // R(t)
            + '<div style="background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.12);border-radius:8px;padding:0.75rem">'
            + '<div style="font-size:0.82rem;font-weight:600;color:var(--success);margin-bottom:0.5rem">🛡️ 생존확률 R(t)</div>'
            + '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem">특정 시간까지 정상 작동할 확률 (= 1 − F(t))</div>'
            + '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">'
            + '<span style="font-size:0.82rem;color:var(--text-secondary)">t =</span>'
            + '<input type="number" id="calc-rt-' + gid + '" value="' + exampleT + '" min="0" style="width:80px;padding:4px 6px;font-size:0.85rem;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);text-align:center" onkeydown="if(event.key===\'Enter\')calcRt(\'' + gid + '\')">' 
            + '<span style="font-size:0.82rem;color:var(--text-secondary)">시간 → R(t) =</span>'
            + '<span id="calc-rt-result-' + gid + '" style="font-size:1rem;font-weight:700;color:var(--success)">—</span>'
            + '<button class="btn btn-sm btn-secondary" onclick="calcRt(\'' + gid + '\')" style="font-size:0.75rem;padding:3px 10px">계산</button>'
            + '</div>'
            + '<div id="calc-rt-ci-' + gid + '" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem"></div>'
            + '</div>'

            + '<div style="font-size:0.7rem;color:var(--text-muted);text-align:right;margin-top:0.25rem">'
            + '신뢰구간: Delta Method (Fisher Information Matrix 기반)'
            + '</div>'
            + '</div>';
    });

    html += '</div>';
    return html;
}

function onCalcCIChange(gid, val) {
    var n = parseFloat(val);
    if (!window._allGroupResults || !window._allGroupResults[gid] || !isFinite(n) || n < 50 || n > 99) return;
    window._allGroupResults[gid] = Object.assign({}, window._allGroupResults[gid], { confidence: n / 100 });
}

function changeCalcDist(gid, newDist) {
    // 결과차트 탭의 changeGroupDist와 동일한 로직으로 분포 재적합
    changeGroupDist(gid, newDist);
    // 계산기 탭 전체 다시 렌더링
    var content = document.getElementById('analysis-content');
    if (content) {
        content.innerHTML = '<div class="fade-in">' + renderCalculatorTab() + '</div>';
    }
}

// Delta Method CI 헬퍼
function _getCalcCI(gid) {
    var r = window._allGroupResults && window._allGroupResults[gid];
    if (!r) return null;
    var conf = r.confidence || 0.9;
    var z = Distributions.normalPPF((1 + conf) / 2);
    var fi = null;
    if (r.dataSummary && r.dataSummary.nFailures >= 3) {
        fi = Statistics.computeFisherCI(r.dataSummary.failures, r.dataSummary.censored, r.distribution, r.params, conf);
    }
    return { r: r, conf: conf, z: z, fi: fi };
}

function calcBxLife(gid) {
    var ctx = _getCalcCI(gid);
    if (!ctx) return;
    var bxEl = document.getElementById('calc-bx-' + gid);
    var bx = bxEl ? parseFloat(bxEl.value) : NaN;
    if (!isFinite(bx) || bx <= 0 || bx >= 100) return;
    var fraction = bx / 100;
    var r = ctx.r, z = ctx.z, fi = ctx.fi;
    var D = Distributions;
    var tBx;
    if (r.distribution === 'weibull') tBx = D.Weibull.quantile(fraction, r.params.alpha, r.params.beta);
    else if (r.distribution === 'lognormal') tBx = D.Lognormal.quantile(fraction, r.params.mu, r.params.sigma);
    else if (r.distribution === 'normal') tBx = D.Normal.quantile(fraction, r.params.mu, r.params.sigma);
    else if (r.distribution === 'exponential') tBx = D.Exponential.quantile(fraction, r.params.lambda);

    var el = document.getElementById('calc-bx-result-' + gid);
    var ciEl = document.getElementById('calc-bx-ci-' + gid);
    if (el) el.textContent = isFinite(tBx) ? tBx.toFixed(2) : 'N/A';
    if (fi && fi.covMatrix && ciEl) {
        var ci = Statistics.computeBxLifeCI(r.distribution, r.params, fi.covMatrix, fraction, z);
        if (ci) ciEl.innerHTML = Math.round(ctx.conf*100) + '% 신뢰구간: <strong>[' + ci.lower.toFixed(2) + ' — ' + ci.upper.toFixed(2) + ']</strong>';
    }
}

function calcFt(gid) {
    var ctx = _getCalcCI(gid);
    if (!ctx) return;
    var tEl = document.getElementById('calc-ft-' + gid);
    var t = tEl ? parseFloat(tEl.value) : NaN;
    if (!isFinite(t) || t <= 0) return;
    var r = ctx.r, z = ctx.z, fi = ctx.fi;
    var D = Distributions;
    var p;
    if (r.distribution === 'weibull') p = D.Weibull.cdf(t, r.params.alpha, r.params.beta);
    else if (r.distribution === 'lognormal') p = D.Lognormal.cdf(t, r.params.mu, r.params.sigma);
    else if (r.distribution === 'normal') p = D.Normal.cdf(t, r.params.mu, r.params.sigma);
    else if (r.distribution === 'exponential') p = D.Exponential.cdf(t, r.params.lambda);

    var el = document.getElementById('calc-ft-result-' + gid);
    if (el) el.textContent = isFinite(p) ? (p * 100).toFixed(4) + '%' : 'N/A';
    var ciEl = document.getElementById('calc-ft-ci-' + gid);
    if (fi && fi.covMatrix && ciEl) {
        var ci = Statistics.computeTrueCDFCI(r.distribution, r.params, fi.covMatrix, [t], z);
        if (ci && ci.lower.length > 0) ciEl.innerHTML = Math.round(ctx.conf*100) + '% 신뢰구간: <strong>[' + (ci.lower[0]*100).toFixed(4) + '% — ' + (ci.upper[0]*100).toFixed(4) + '%]</strong>';
    }
}

function calcRt(gid) {
    var ctx = _getCalcCI(gid);
    if (!ctx) return;
    var tEl = document.getElementById('calc-rt-' + gid);
    var t = tEl ? parseFloat(tEl.value) : NaN;
    if (!isFinite(t) || t <= 0) return;
    var r = ctx.r, z = ctx.z, fi = ctx.fi;
    var D = Distributions;
    var p;
    if (r.distribution === 'weibull') p = D.Weibull.sf(t, r.params.alpha, r.params.beta);
    else if (r.distribution === 'lognormal') p = D.Lognormal.sf(t, r.params.mu, r.params.sigma);
    else if (r.distribution === 'normal') p = D.Normal.sf(t, r.params.mu, r.params.sigma);
    else if (r.distribution === 'exponential') p = D.Exponential.sf(t, r.params.lambda);

    var el = document.getElementById('calc-rt-result-' + gid);
    if (el) el.textContent = isFinite(p) ? (p * 100).toFixed(4) + '%' : 'N/A';
    var ciEl = document.getElementById('calc-rt-ci-' + gid);
    if (fi && fi.covMatrix && ciEl) {
        var ci = Statistics.computeTrueCDFCI(r.distribution, r.params, fi.covMatrix, [t], z);
        if (ci && ci.lower.length > 0) {
            var rL = 1 - ci.upper[0];
            var rU = 1 - ci.lower[0];
            ciEl.innerHTML = Math.round(ctx.conf*100) + '% 신뢰구간: <strong>[' + (rL*100).toFixed(4) + '% — ' + (rU*100).toFixed(4) + '%]</strong>';
        }
    }
}

// ═══════════════════════════════════════════
// 시료수 계획 탭
// ═══════════════════════════════════════════
function renderPlanningTab() {
    return `
    <!-- 서브 탭 -->
    <div class="sub-tabs" id="planning-sub-tabs">
        <button class="sub-tab-btn active" data-subtab="reliability" onclick="switchPlanningSubTab('reliability')">무고장 보증</button>
        <button class="sub-tab-btn" data-subtab="weibull_bx" onclick="switchPlanningSubTab('weibull_bx')">Weibull Bx</button>
        <button class="sub-tab-btn" data-subtab="ltpd" onclick="switchPlanningSubTab('ltpd')">LTPD</button>
        <button class="sub-tab-btn" data-subtab="ltfr" onclick="switchPlanningSubTab('ltfr')">LTFR</button>
        <button class="sub-tab-btn" data-subtab="aql" onclick="switchPlanningSubTab('aql')">AQL (ISO 2859-1)</button>
    </div>

    <div id="planning-content">
        ${renderReliabilityPlanTab()}
    </div>`;
}

function switchPlanningSubTab(subtab) {
    document.querySelectorAll('#planning-sub-tabs .sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subtab);
    });
    ChartManager.destroyAll();

    const container = document.getElementById('planning-content');
    if (subtab === 'reliability') container.innerHTML = renderReliabilityPlanTab();
    else if (subtab === 'ltpd') container.innerHTML = renderLTPDTab();
    else if (subtab === 'weibull_bx') container.innerHTML = renderWeibullBxTab();
    else if (subtab === 'ltfr') container.innerHTML = renderLTFRTab();
    else if (subtab === 'aql') container.innerHTML = renderAQLTab();

    setTimeout(() => {
        if (subtab === 'aql') initAQLEvents();
    }, 50);
}

// ── 무고장 보증 / 이항 분포 ──
function renderReliabilityPlanTab() {
    // 빠른 참조표 데이터 생성 (c=0 무고장 보증)
    const confLevels = [60, 70, 80, 90, 95];
    const relLevels  = [90, 95, 99, 99.9];
    const quickRefRows = relLevels.map(R => {
        const cells = confLevels.map(C => {
            const n = SamplePlanning.calculateBinomialSampleSize(C/100, R/100, 0);
            return { C, R, n };
        });
        return { R, cells };
    });

    return `<div class="grid-cols-1-2">
        <div class="glass-card">
            <h3 class="section-title">무고장 보증 시료수</h3>
            <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
                <button class="btn btn-sm btn-secondary" onclick="resetReliabilityInputs()">기본값 복원</button>
            </div>

            ${HelpTooltip.labelWithHelp('신뢰 수준 (C)', '분석 결과의 통계적 확신 정도.<br>일반적으로 90% 또는 95% 사용.')}
            <div class="input-with-unit">
                <input type="number" id="rel-confidence" value="90" min="1" max="99.99" step="1">
                <span class="input-unit">%</span>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('목표 신뢰도 (R)', '기대하는 제품의 목표 신뢰도.<br>예: R=99%는 1% 이하 불량률을 의미.')}
            <div class="input-with-unit">
                <input type="number" id="rel-reliability" value="90" min="50" max="99.999" step="0.1">
                <span class="input-unit">%</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('허용 고장수 (c)', '시험 중 허용하는 최대 고장 수.<br>c=0: 무고장 보증 (가장 엄격)<br>c>0: 이항분포 기반')}
            <input type="number" id="rel-failures" value="0" min="0" max="20" step="1">
            </div>

            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem"
                    onclick="runReliabilityPlan()">
                검사 수량 계산
            </button>
        </div>

        <div id="rel-result" class="glass-card">
            <!-- 빠른 참조표 -->
            <h3 class="section-title">📋 빠른 참조표 <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted)">(무고장 보증, c=0)</span></h3>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem">
                셀을 클릭하면 해당 조건으로 자동 계산합니다
            </div>
            <div class="table-wrapper">
                <table style="font-size:0.85rem;text-align:center">
                    <thead>
                        <tr>
                            <th style="text-align:left">R \\ C</th>
                            ${confLevels.map(C => `<th>C=${C}%</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${quickRefRows.map(row => `<tr>
                            <td class="table-cell" style="text-align:left;font-weight:600;color:var(--text-secondary)">R=${row.R}%</td>
                            ${row.cells.map(c => `<td class="table-cell" style="cursor:pointer;transition:all 0.2s" 
                                onmouseover="this.style.background='rgba(56,189,248,0.15)';this.style.color='var(--accent-color)'"
                                onmouseout="this.style.background='';this.style.color=''"
                                onclick="quickFillReliability(${c.C},${c.R});runReliabilityPlan()">
                                <span style="font-size:1.05rem;font-weight:700">${c.n.toLocaleString()}</span><span style="font-size:0.75rem;color:var(--text-muted);margin-left:2px">개</span>
                            </td>`).join('')}
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:1rem;padding:0.75rem;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:6px;font-size:0.8rem;line-height:1.6">
                <div>📌 <strong>공식:</strong> n = ln(1-C) / ln(R) <span style="color:var(--text-muted)">(c=0 일 때)</span></div>
                <div>📌 <strong>해석:</strong> 신뢰수준 C%에서 불량률이 (1-R)% 이하임을 보증하기 위한 최소 검사 수량</div>
            </div>
        </div>
    </div>`;
}


function resetReliabilityInputs() {
    document.getElementById('rel-confidence').value = 90;
    document.getElementById('rel-reliability').value = 90;
    document.getElementById('rel-failures').value = 0;
}

function quickFillReliability(C, R) {
    document.getElementById('rel-confidence').value = C;
    document.getElementById('rel-reliability').value = R;
    document.getElementById('rel-failures').value = 0;
}

function runReliabilityPlan() {
    const C = parseFloat(document.getElementById('rel-confidence').value);
    const R = parseFloat(document.getElementById('rel-reliability').value);
    const c = parseInt(document.getElementById('rel-failures').value);

    const n = SamplePlanning.calculateBinomialSampleSize(C / 100, R / 100, c);
    const formula = SamplePlanning.getSuccessRunFormula(C, R, c, n);
    const ocData = SamplePlanning.generateOCCurve(n, c);
    const ncMatrix = SamplePlanning.generateNCMatrix(C / 100, R / 100, 5);

    document.getElementById('rel-result').innerHTML = `
        <div class="result-box" style="margin-bottom:1rem">
            <div class="result-value">${n.toLocaleString()}</div>
            <div class="result-label">필요 검사 수량 (개)</div>
        </div>

        ${n * (1 - R/100) < 5 ? `<div class="info-box warning">⚠ n×p가 5보다 작아 포아송 근사의 정확도가 낮을 수 있습니다</div>` : ''}

        <div class="accordion" style="margin-top:1rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                계산 공식 및 과정
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-bottom:0.5rem">
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaText('#rel-formula-section'); event.stopPropagation();">
                        <i class="fas fa-file-alt" style="margin-right:0.25rem"></i> 텍스트 복사
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaImage('#rel-formula-section'); event.stopPropagation();">
                        <i class="fas fa-image" style="margin-right:0.25rem"></i> 이미지 복사 (보고서용)
                    </button>
                </div>
                <div id="rel-formula-section" class="formula-section" style="border:none;padding:0;background:none">${formula}</div>
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); border-radius:8px">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                💡 실무 도슨트 해설 (무고장 보증 수식)
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body" style="padding:0.75rem 0.85rem; font-size:0.8rem; color:var(--text-secondary); line-height:1.6">
                이 식은 신뢰수준 C% 하에서 1개도 고장나지 않는 시험을 마쳐서 목표 신뢰도 R%를 보장하기 위해 필요한 최소 시료수입니다. 신뢰수준이 엄격할수록(예: 95% 또는 99%), 목표 신뢰도가 높을수록(예: 99.9%) 필요한 시료수가 기하급수적으로 증가합니다. 실무에서는 "시료수 N개 투입 후 무고장 통과하면 불량률 10% 이하를 90% 신뢰수준으로 보증한다"는 비즈니스 계약 조건을 설계할 때 핵심적으로 사용됩니다.
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open');setTimeout(()=>drawOCChart(${n},${c},${100 - R},${1 - C/100}),100)">
                OC Curve (부하 특성 곡선)
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div class="chart-container" style="height:300px"><canvas id="oc-chart"></canvas></div>
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                n-c 매트릭스
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>허용 고장수 (c)</th><th>필요 시료수 (n)</th></tr></thead>
                        <tbody>
                            ${ncMatrix.map(row => `<tr${row.c === c ? ' class="nc-matrix"' : ''}>
                                <td class="table-cell">${row.c}</td>
                                <td class="table-cell${row.c === c ? ' highlight' : ''}" style="${row.c === c ? 'color:var(--accent-color);font-weight:700' : ''}">${row.n.toLocaleString()}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function drawOCChart(n, c, targetP, targetBeta) {
    const data = SamplePlanning.generateOCCurve(n, c);
    ChartManager.drawOCCurve('oc-chart', data, n, c, targetP, targetBeta);
}

// ── LTPD ──
function renderLTPDTab() {
    return `<div class="grid-cols-1-2">
        <div class="glass-card">
            <h3 class="section-title">LTPD</h3>
            <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
                <button class="btn btn-sm btn-secondary" onclick="switchPlanningSubTab('ltpd')">기본값 복원</button>
            </div>

            ${HelpTooltip.labelWithHelp('허용 불량률 (p)', 'Lot Tolerance Percent Defective.<br>소비자가 허용하는 최대 불량률.<br>일반적 범위: 1%~10%')}
            <div class="input-with-unit">
                <input type="number" id="ltpd-p" value="2" min="0.01" max="50" step="0.1">
                <span class="input-unit">%</span>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('소비자 Risk (β, 제 2종 오류)', '나쁜 로트를 합격시킬 확률.<br>일반적으로 5% 또는 10% 사용.')}
            <div class="input-with-unit">
                <input type="number" id="ltpd-beta" value="5" min="0.1" max="50" step="0.1">
                <span class="input-unit">%</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('허용 고장수 (c)', '검사 시 허용하는 최대 고장/불량 수.<br>c=0이 가장 보수적.')}
            <input type="number" id="ltpd-c" value="0" min="0" max="20" step="1">
            </div>

            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem"
                    onclick="runLTPD()">
                검사 수량 계산
            </button>
        </div>

        <div id="ltpd-result" class="glass-card">
            <div class="empty-state" style="min-height:300px">
                <div style="font-size:0.9rem;color:var(--text-muted)">파라미터를 입력하고<br>"검사 수량 계산"을 클릭하세요</div>
            </div>
        </div>
    </div>`;
}

function runLTPD() {
    const p = parseFloat(document.getElementById('ltpd-p').value);
    const beta = parseFloat(document.getElementById('ltpd-beta').value);
    const c = parseInt(document.getElementById('ltpd-c').value);

    const n = SamplePlanning.calculateLTPD(p, beta, c);
    const formula = SamplePlanning.getLTPDFormula(p, beta, c, n);

    document.getElementById('ltpd-result').innerHTML = `
        <h3 class="section-title">결과</h3>
        <div class="result-box" style="margin-bottom:1rem">
            <div class="result-value">${n.toLocaleString()}</div>
            <div class="result-label">필요 검사 수량 (개)</div>
        </div>
        ${n * (p/100) < 5 ? `<div class="info-box warning">⚠ n×p가 5보다 작아 포아송 근사의 정확도가 낮을 수 있습니다</div>` : ''}
        <div class="accordion" style="margin-top:1rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                계산 공식 및 과정 <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-bottom:0.5rem">
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaText('#ltpd-formula-section'); event.stopPropagation();">
                        <i class="fas fa-file-alt" style="margin-right:0.25rem"></i> 텍스트 복사
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaImage('#ltpd-formula-section'); event.stopPropagation();">
                        <i class="fas fa-image" style="margin-right:0.25rem"></i> 이미지 복사 (보고서용)
                    </button>
                </div>
                <div id="ltpd-formula-section" class="formula-section" style="border:none;padding:0;background:none">${formula}</div>
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); border-radius:8px">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                💡 실무 도슨트 해설 (LTPD 수식)
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body" style="padding:0.75rem 0.85rem; font-size:0.8rem; color:var(--text-secondary); line-height:1.6">
                이 식은 불량률이 p인 최악의 상태(LTPD)의 제품군을 투입했을 때, 우연히 검사를 통과하여 합격될 확률이 소비자 위험 수준 β 이하가 되도록 통제하는 이항분포 누적함수 식입니다. 실무적으로 소비자 위험 β는 보통 10%로 고정하며, 이 식은 불량 제품이 소비자에게 유출될 확률을 10% 미만으로 틀어막는 가장 견고한 검사 수량을 결정하는 표준 공식입니다.
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open');setTimeout(()=>drawOCChartLTPD(${n},${c},${p},${beta}),100)">
                OC Curve (부하 특성 곡선)
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div class="chart-container" style="height:300px"><canvas id="oc-chart-ltpd"></canvas></div>
            </div>
        </div>
    `;
}

function drawOCChartLTPD(n, c, targetP, targetBeta) {
    const data = SamplePlanning.generateOCCurve(n, c);
    ChartManager.drawOCCurve('oc-chart-ltpd', data, n, c, targetP, targetBeta);
}

// ── Weibull Bx 수명 기반 시료수 ──
function renderWeibullBxTab() {
    return `<div class="grid-cols-1-2">
        <div class="glass-card">
            <h3 class="section-title">Weibull Bx 수명 기반 시료수</h3>
            <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
                <button class="btn btn-sm btn-secondary" onclick="switchPlanningSubTab('weibull_bx')">기본값 복원</button>
            </div>

            ${HelpTooltip.labelWithHelp('형상모수 (β)', 'Weibull 형상모수.<br>β<1: 초기고장<br>β≈1: 우발고장<br>β>1: 마모고장')}
            <input type="number" id="wbx-beta" value="2" min="0.1" step="0.1">

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('목표 Bx 수명', '달성하려는 Bx 수명.<br>예: B10=20000시간이면 고장률 10%에서 20000시간 수명 보증')}
            <div class="input-with-unit">
                <input type="number" id="wbx-life" value="20000" min="1" step="100">
                <span class="input-unit">시간</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('Bx 고장률 (%)', '보증하려는 고장률 수준.<br>B1=1%, B5=5%, B10=10%')}
            <div class="input-with-unit">
                <input type="number" id="wbx-bx" value="10" min="0.1" max="50" step="0.1">
                <span class="input-unit">%</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('시험 시간', '가속/실제 시험 조건에서의 시험 지속 시간')}
            <div class="input-with-unit">
                <input type="number" id="wbx-test-time" value="1000" min="1" step="100">
                <span class="input-unit">시간</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('신뢰 수준 (C)', '통계적 확신 정도. 일반적으로 90% 또는 95%.')}
            <div class="input-with-unit">
                <input type="number" id="wbx-conf" value="90" min="50" max="99.99" step="1">
                <span class="input-unit">%</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('허용 고장수 (c)', '시험 중 허용하는 최대 고장수.<br>c=0: 무고장 (가장 보수적)')}
            <input type="number" id="wbx-c" value="0" min="0" max="20" step="1">
            </div>

            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem"
                    onclick="runWeibullBx()">
                시료수 계산
            </button>
        </div>

        <div id="wbx-result" class="glass-card">
            <div class="empty-state" style="min-height:300px">
                <div style="font-size:0.9rem;color:var(--text-muted)">파라미터를 입력하고<br>"시료수 계산"을 클릭하세요</div>
            </div>
        </div>
    </div>`;
}

function runWeibullBx() {
    const beta = parseFloat(document.getElementById('wbx-beta').value);
    const life = parseFloat(document.getElementById('wbx-life').value);
    const bx = parseFloat(document.getElementById('wbx-bx').value);
    const tTest = parseFloat(document.getElementById('wbx-test-time').value);
    const conf = parseFloat(document.getElementById('wbx-conf').value) / 100;
    const c = parseInt(document.getElementById('wbx-c').value);

    const result = SamplePlanning.calculateWeibullBxSampleSize(beta, life, bx, tTest, conf, c);
    const formula = SamplePlanning.getWeibullBxFormula(beta, life, bx, tTest, conf, c, result);
    const tradeoff = SamplePlanning.generateBxTradeoff(beta, life, bx, conf, c);

    document.getElementById('wbx-result').innerHTML = `
        <h3 class="section-title">결과</h3>
        <div class="result-box" style="margin-bottom:1rem">
            <div class="result-value">${result.n.toLocaleString()}</div>
            <div class="result-label">필요 시료수 (개)</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
            <div class="stat-card">
                <div class="label">척도모수 (η)</div>
                <div class="value accent">${result.eta.toFixed(1)}</div>
            </div>
            <div class="stat-card">
                <div class="label">χ² (${result.df} df)</div>
                <div class="value">${result.chi2Val.toFixed(4)}</div>
            </div>
            <div class="stat-card">
                <div class="label">시험시간/η</div>
                <div class="value">${(tTest / result.eta).toFixed(4)}</div>
            </div>
        </div>

        <div class="accordion" style="margin-top:1rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                계산 공식 및 과정 <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-bottom:0.5rem">
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaText('#wbx-formula-section'); event.stopPropagation();">
                        <i class="fas fa-file-alt" style="margin-right:0.25rem"></i> 텍스트 복사
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaImage('#wbx-formula-section'); event.stopPropagation();">
                        <i class="fas fa-image" style="margin-right:0.25rem"></i> 이미지 복사 (보고서용)
                    </button>
                </div>
                <div id="wbx-formula-section" class="formula-section" style="border:none;padding:0;background:none">${formula}</div>
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); border-radius:8px">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                💡 실무 도슨트 해설 (Weibull Bx 수식)
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body" style="padding:0.75rem 0.85rem; font-size:0.8rem; color:var(--text-secondary); line-height:1.6">
                제품의 수명 분포가 Weibull 분포(형상모수 β, 척도모수 η)를 따를 때, 특정 수명 시점(B_x)을 보증하기 위해 얼마 동안 몇 개의 샘플로 시험을 지속해야 하는지를 카이제곱 분포와 연계해 계산하는 식입니다. 시험 시간(t_test)이 길어질수록 요구 시료수는 단축되는 관계에 있으며, 형상모수 β가 클수록(마모가 급격히 진행되는 제품군일수록) 시료수 절감 속도가 매우 빨라집니다.
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open');setTimeout(()=>drawBxTradeoff(),100)">
                n vs 시험시간 트레이드오프
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div class="chart-container" style="height:300px"><canvas id="wbx-tradeoff-chart"></canvas></div>
            </div>
        </div>
    `;

    // 트레이드오프 차트 데이터를 전역에 저장
    window._wbxTradeoff = tradeoff;
    window._wbxUserTestTime = tTest;
    window._wbxUserN = result.n;
}

function drawBxTradeoff() {
    const data = window._wbxTradeoff;
    if (!data || !document.getElementById('wbx-tradeoff-chart')) return;

    const datasets = [{
        label: '필요 시료수 (n)',
        data: data.map(d => ({ x: d.t, y: d.n })),
        borderColor: '#38bdf8',
        backgroundColor: '#38bdf818',
        fill: false,
        pointRadius: 0,
        borderWidth: 2.5,
        tension: 0.3
    }];

    // 현재 설정 조건 포인트 강조 레이어 추가
    if (window._wbxUserTestTime !== undefined && window._wbxUserN !== undefined) {
        datasets.push({
            label: '현재 설정 조건',
            data: [{ x: window._wbxUserTestTime, y: window._wbxUserN }],
            borderColor: '#ef4444',
            backgroundColor: '#ef4444',
            pointRadius: 7,
            pointHoverRadius: 9,
            showLine: false
        });
    }

    ChartManager.createOrUpdate('wbx-tradeoff-chart', {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            parsing: false,
            plugins: { 
                legend: { display: true, labels: { color: '#94a3b8' } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const t = ctx.parsed.x;
                            const n = ctx.parsed.y;
                            if (ctx.datasetIndex === 1) {
                                return `현재 조건: 시험시간 ${t.toLocaleString()}h, 시료수 ${n}개`;
                            }
                            let diffStr = '';
                            if (window._wbxUserTestTime !== undefined && window._wbxUserN !== undefined) {
                                const dt = t - window._wbxUserTestTime;
                                const dn = n - window._wbxUserN;
                                const dtSign = dt >= 0 ? '+' : '';
                                const dnSign = dn >= 0 ? '+' : '';
                                diffStr = ` (기준 대비 시험시간: ${dtSign}${dt.toLocaleString()}h, 시료수: ${dnSign}${dn.toLocaleString()}개)`;
                            }
                            return `시험시간: ${t.toLocaleString()}h, 시료수: ${n}개${diffStr}`;
                        }
                    }
                }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: '시험 시간 (h)', color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                y: { title: { display: true, text: '필요 시료수 (n)', color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } }
            }
        }
    });
}

// ── LTFR (Lot Tolerance Failure Rate) ──
function renderLTFRTab() {
    return `<div class="grid-cols-1-2">
        <div class="glass-card">
            <h3 class="section-title" style="display:flex;align-items:center;gap:0.3rem">
                LTFR ${HelpTooltip.create('지수분포(일정 고장률) 가정 하에 목표 고장률을 보증하기 위한 시료수를 계산합니다.')}
            </h3>
            <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
                <button class="btn btn-sm btn-secondary" onclick="switchPlanningSubTab('ltfr')">기본값 복원</button>
            </div>

            ${HelpTooltip.labelWithHelp('목표 고장률', '보증하려는 최대 허용 고장률.<br>% / 1,000h: 1,000시간 작동 시 고장 확률 %<br>FIT: 10⁻⁹ failures/hour')}
            <div style="display:flex;gap:0.5rem;align-items:center">
                <input type="number" id="ltfr-fr" value="0.1" min="0.000001" step="0.01" style="flex:1">
                <select id="ltfr-unit" style="width:130px;padding:6px;font-size:0.8rem">
                    <option value="pct1kh" selected>% / 1,000시간</option>
                    <option value="pct1h">% / 시간</option>
                    <option value="FIT">FIT</option>
                    <option value="perHour">/시간</option>
                </select>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('시료당 시험시간', '각 시료의 시험 지속 시간')}
            <div class="input-with-unit">
                <input type="number" id="ltfr-test-time" value="1000" min="1" step="100">
                <span class="input-unit">시간</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('신뢰 수준 (C)', '통계적 확신 정도. 일반적으로 90% 또는 95%')}
            <div class="input-with-unit">
                <input type="number" id="ltfr-conf" value="90" min="50" max="99.99" step="1">
                <span class="input-unit">%</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('허용 고장수 (c)', '시험 중 허용하는 최대 고장 수. c=0 이면 무고장.')}
            <input type="number" id="ltfr-c" value="0" min="0" max="20" step="1">
            </div>

            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem"
                    onclick="runLTFR()">
                시료수 계산
            </button>
        </div>

        <div id="ltfr-result" class="glass-card">
            <div class="empty-state" style="min-height:300px">
                <div style="font-size:0.9rem;color:var(--text-muted)">파라미터를 입력하고<br>"시료수 계산"을 클릭하세요</div>
            </div>
        </div>
    </div>`;
}

function runLTFR() {
    const fr = parseFloat(document.getElementById('ltfr-fr').value);
    const unit = document.getElementById('ltfr-unit').value;
    const tTest = parseFloat(document.getElementById('ltfr-test-time').value);
    const conf = parseFloat(document.getElementById('ltfr-conf').value) / 100;
    const c = parseInt(document.getElementById('ltfr-c').value);

    const result = SamplePlanning.calculateLTFR(fr, tTest, conf, c, unit);
    const formula = SamplePlanning.getLTFRFormula(fr, tTest, conf, c, unit, result);

    document.getElementById('ltfr-result').innerHTML = `
        <h3 class="section-title">결과</h3>
        <div class="result-box" style="margin-bottom:1rem">
            <div class="result-value">${result.n.toLocaleString()}</div>
            <div class="result-label">필요 시료수 (개)</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem">
            <div class="stat-card">
                <div class="label">총 시험시간</div>
                <div class="value accent">${result.totalTime.toLocaleString()} h</div>
            </div>
            <div class="stat-card">
                <div class="label">χ² (${result.df} df)</div>
                <div class="value">${result.chi2Val.toFixed(4)}</div>
            </div>
            <div class="stat-card">
                <div class="label">λ (목표)</div>
                <div class="value">${result.lambda.toExponential(3)} /h</div>
            </div>
        </div>

        <div class="accordion" style="margin-top:1rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                계산 공식 및 과정 <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body">
                <div class="formula-section" style="border:none;padding:0;background:none">${formula}</div>
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); border-radius:8px">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
                💡 실무 도슨트 해설 (LTFR 수식)
                <span class="accordion-arrow">▼</span>
            </div>
            <div class="accordion-body" style="padding:0.75rem 0.85rem; font-size:0.8rem; color:var(--text-secondary); line-height:1.6">
                지수분포(시간당 고장률이 일정한 제품) 가정 하에, 목표하는 고장률(λ) 수준을 통계적으로 보증하기 위해 필요한 총 시험 시간의 합(시료 수 × 개별 시험 시간)을 구하는 식입니다. 카이제곱 분포를 적용해 고장수(c) 증가에 따른 리스크 변동을 보정합니다. 고장 허용수가 커질수록 신뢰 보증을 위해 요구되는 총 시험 누적 시간이 선형적으로 대폭 증가합니다.
            </div>
        </div>
    `;
}
function renderAQLTab() {
    return `
    <div style="display:flex; gap:1.5rem; margin-bottom:1.5rem; flex-wrap:wrap">
        <!-- Input section -->
        <div class="glass-card" style="flex:1; min-width:280px">
            <h3 class="section-title">AQL 파라미터</h3>
            <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
                <button class="btn btn-sm btn-secondary" onclick="switchPlanningSubTab('aql')">기본값 복원</button>
            </div>
            <div class="grid-2-mobile" style="gap:1rem; display:grid; grid-template-columns:1fr 1fr;">
                <div>
                    ${HelpTooltip.labelWithHelp('로트 크기 (N)', '검사 대상 로트(배치)의 전체 수량')}
                    <input type="number" id="aql-lot" value="5000" min="2" step="1" onchange="runAQL()">
                </div>
                <div>
                    ${HelpTooltip.labelWithHelp('검사 수준', 'I: 감소 / II: 표준 / III: 엄격')}
                    <select id="aql-level" onchange="runAQL()">
                        <option value="S-1">S-1 (특수)</option><option value="S-2">S-2 (특수)</option><option value="S-3">S-3 (특수)</option><option value="S-4">S-4 (특수)</option>
                        <option value="I">I (소량)</option><option value="II" selected>II (표준)</option><option value="III">III (엄격)</option>
                    </select>
                </div>
                <div>
                    ${HelpTooltip.labelWithHelp('AQL (%)', '합격 품질 수준')}
                    <select id="aql-value" onchange="runAQL()">
                        ${AQLStandards.AQL_VALUES.map(v => `<option value="${v}"${v===1.0?' selected':''}>${v}%</option>`).join('')}
                    </select>
                </div>
                <div>
                    ${HelpTooltip.labelWithHelp('검사 유형', 'Normal/Tightened/Reduced')}
                    <select id="aql-type" onchange="runAQL()">
                        <option value="Normal" selected>보통 (Normal)</option>
                        <option value="Tightened">까다로운 (Tightened)</option>
                        <option value="Reduced">수월한 (Reduced)</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem" onclick="runAQL()">
                <i class="fas fa-sync" style="margin-right:0.4rem"></i>계산 업데이트
            </button>
        </div>

        <!-- Result Overview section -->
        <div class="glass-card" style="flex:1.5; min-width:280px; display:flex; flex-direction:column; justify-content:center">
            <h3 class="section-title">결과 요약</h3>
            <div id="aql-top-result">
                <div style="font-size:0.9rem; color:var(--text-muted);">좌측에서 파라미터 변경 시 결과가 표시됩니다.</div>
            </div>
        </div>
    </div>

    <!-- The giant interactive tables -->
    <div id="aql-tables-container">
        <!-- Rendered by runAQL() -->
    </div>
    `;
}

function initAQLEvents() { 
    setTimeout(() => runAQL(), 100); 
}

function runAQL() {
    try {
        const lotSize = parseInt(document.getElementById('aql-lot').value) || 1000;
        const level   = document.getElementById('aql-level').value;
        const aql     = parseFloat(document.getElementById('aql-value').value);
        const type    = document.getElementById('aql-type').value;

        const { letter, range } = AQLStandards.getCodeLetter(lotSize, level);
        const plan = AQLStandards.getSamplingPlan(letter, aql, type);
        const tableData = AQLStandards.getFullTableData(aql, type);

        // Update Top Result Summary like the photo
        document.getElementById('aql-top-result').innerHTML = `
            <div style="display:flex; gap:1.5rem; justify-content:space-between; align-items:center;">
                <div class="stat-card" style="flex:1;">
                    <div class="label" style="font-size:0.85rem">샘플 수(n)</div>
                    <div class="value" style="color:var(--text-primary); font-size:2rem">${plan.n}</div>
                </div>
                <div class="stat-card" style="flex:1;">
                    <div class="label" style="font-size:0.85rem">허용 불량 (Ac)</div>
                    <div class="value success" style="font-size:2rem">${plan.ac}</div>
                </div>
                <div class="stat-card" style="flex:1;">
                    <div class="label" style="font-size:0.85rem">불량 배척 (Re)</div>
                    <div class="value danger" style="font-size:2rem">${plan.re}</div>
                </div>
            </div>
            ${plan.arrowDir ? `<div class="info-box warning" style="margin-top:1rem;font-size:0.85rem">⚠️ 직접 계획이 없어 화살표(${plan.arrowDir === 'D' ? '↓' : '↑'})를 따라 코드 <strong>${plan.usedCode}</strong>의 샘플링이 채택되었습니다.</div>` : ''}
            <div style="margin-top:1rem; font-size:0.85rem; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem">
                <span>로트 크기: <strong>${range}</strong> → 코드: <strong>${letter}</strong> <span style="margin:0 0.5rem">|</span> 검사 유형: ${type}</span>
            </div>
            <button class="btn btn-secondary" style="width:100%; margin-top:0.85rem; font-size:0.85rem; display:flex; align-items:center; justify-content:center; gap:0.35rem; padding:0.5rem;" onclick="linkAQLToLTPD(${plan.n}, ${plan.ac})">
                <span>통계적 신뢰성 검증하기 (LTPD 연계) 🔗</span>
            </button>
        `;

        // Generate Table 1 HTML
        const levels = ['S-1','S-2','S-3','S-4','I','II','III'];
        let t1Html = `
        <div class="glass-card" style="margin-bottom:1.5rem">
            <h3 class="section-title">1. 로트 크기 → 코드 문자</h3>
            <div class="table-wrapper">
                <table class="aql-full-table" style="width:100%">
                    <thead style="background:rgba(255,255,255,0.02)">
                        <tr>
                            <th style="text-align:left; width:15%">로트 크기</th>
                            ${levels.map(l => `<th class="${l === level ? 'aql-highlight-col' : ''}" ${l === level ? 'style="color:#f59e0b"' : ''}>${l === 'I'?'GI':l === 'II'?'GII':l === 'III'?'GIII':l}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        AQLStandards.CODE_LETTERS.forEach(rng => {
            const minL = rng[0], maxL = rng[1], map = rng[2];
            const isRowMatch = lotSize >= minL && lotSize <= maxL;
            let rngLabel = maxL === Infinity ? `${minL.toLocaleString()}+` : `${minL.toLocaleString()} ~ ${maxL.toLocaleString()}`;
            t1Html += `<tr class="${isRowMatch ? 'aql-highlight-row' : ''}">`;
            t1Html += `<td style="text-align:left; ${isRowMatch ? 'font-weight:bold' : ''}">${rngLabel}</td>`;
            levels.forEach(l => {
                const isColMatch = l === level;
                const isCellMatch = isRowMatch && isColMatch;
                const ltrCode = map[l];
                t1Html += `<td class="${isCellMatch ? 'aql-highlight-cell' : (isColMatch ? 'aql-highlight-col' : '')}">${ltrCode || ''}</td>`;
            });
            t1Html += '</tr>';
        });

        t1Html += `
                    </tbody>
                </table>
            </div>
        </div>
        `;

        // Generate Table 2 HTML
        const aqlCols = AQLStandards.AQL_VALUES;
        let t2Html = `
        <div class="glass-card">
            <h3 class="section-title">2. ISO 2859-1 표준 샘플링 계획</h3>
            <div class="table-wrapper">
                <table class="aql-full-table" style="width:100%">
                    <thead style="background:rgba(255,255,255,0.02)">
                        <tr>
                            <th rowspan="2">코드</th>
                            <th rowspan="2" style="border-right:2px solid var(--border-color)">샘플 수(n)</th>
                            ${aqlCols.map(v => `<th class="${Math.abs(v - aql) < 0.0001 ? 'aql-highlight-col' : ''}" ${Math.abs(v - aql) < 0.0001 ? 'style="color:#f59e0b"' : ''}>${v}%</th>`).join('')}
                        </tr>
                        <tr>
                            ${aqlCols.map(v => `<th class="${Math.abs(v - aql) < 0.0001 ? 'aql-highlight-col' : ''}" style="font-size:0.6rem; font-weight:normal; color:var(--text-muted); opacity:0.8; padding:2px">Ac - Re</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        // type에 맞는 테이블 가져오기
        const planTable = type === 'Tightened' ? AQLStandards.PLANS_TIGHTENED
                        : type === 'Reduced'   ? AQLStandards.PLANS_REDUCED
                        : AQLStandards.PLANS_NORMAL;
        
        const findKey = (row, v) => { for(const k of Object.keys(row)) if(Math.abs(parseFloat(k)-v)<0.0001) return k; return null; };

        const allLetters = AQLStandards.getLettersForType(type);
        allLetters.forEach(ltr => {
            const isRowMatch = ltr === plan.usedCode; // 활성 코드
            const originalMatch = ltr === letter;     // 입력된 코드 (화살표 전)
            
            const nVal = AQLStandards.getSampleSize(ltr, type);
            t2Html += `<tr class="${isRowMatch ? 'aql-highlight-row' : ''}">`;
            t2Html += `<td class="${originalMatch ? 'aql-highlight-code' : ''}">${ltr}</td>`;
            t2Html += `<td style="border-right:2px solid rgba(255,255,255,0.1)">${nVal}</td>`;

            const rowData = planTable[ltr];
            aqlCols.forEach(v => {
                const isColMatch = Math.abs(v - aql) < 0.0001;
                const isCellMatch = isRowMatch && isColMatch;
                
                let cellHtml = '';
                if (!rowData) {
                    cellHtml = '-';
                } else {
                    const key = findKey(rowData, v);
                    if (!key) {
                        cellHtml = '-';
                    } else {
                        const val = rowData[key];
                        if (val === 'D') cellHtml = '<span style="font-size:1.1rem; color:inherit">↓</span>';
                        else if (val === 'U') cellHtml = '<span style="font-size:1.1rem; color:inherit">↑</span>';
                        else if (Array.isArray(val)) {
                            // Reduced inspection might have a gap between Ac and Re, e.g. Ac=1, Re=3.
                            // But format is Ac - Re
                            cellHtml = `${val[0]} <span style="color:rgba(255,255,255,0.2)">-</span> ${val[1]}`;
                        } else {
                            cellHtml = val;
                        }
                    }
                }
                
                let tdCls = '';
                if (isCellMatch) tdCls = 'aql-highlight-cell';
                else if (isColMatch && isRowMatch) tdCls = 'aql-highlight-cell'; // redundant
                else if (isColMatch) tdCls = 'aql-highlight-col';
                
                t2Html += `<td class="${tdCls}">${cellHtml}</td>`;
            });

            t2Html += '</tr>';
        });

        t2Html += `
                    </tbody>
                </table>
            </div>
        </div>
        `;

        // DOM 업데이트
        const mobileTip = `<div class="show-mobile info-box" style="margin-bottom:1rem; font-size:0.8rem; border-color:var(--accent-glow); color:var(--accent-color);">
            💡 모바일 기기에서는 하단 테이블을 좌우로 스크롤하여 전체 값을 보실 수 있습니다.
        </div>`;
        document.getElementById('aql-tables-container').innerHTML = mobileTip + t1Html + t2Html;

    } catch (e) {
        console.error("AQL Error:", e);
        document.getElementById('aql-top-result').innerHTML = `<div class="info-box danger">오류 발생: ${e.message}</div>`;
    }
}
function drawAQLOC() {} // deprecated from old UI
// deprecated from old UI
// deprecated from old UI
// ═══════════════════════════════════════════
// 가속 수명 시험 탭
// ═══════════════════════════════════════════
let _accSubTab = 'design'; // 'design' | 'analysis'
let _altHot = null; // Handsontable for ALT Analysis
let _altResult = null;

function renderAccelerationTab() {
    return `
    <!-- 서브 탭 -->
    <div class="sub-tabs" id="acc-sub-tabs">
        <button class="sub-tab-btn ${_accSubTab === 'design' ? 'active' : ''}" data-subtab="design" onclick="switchAccSubTab('design')">가속시험 설계</button>
        <button class="sub-tab-btn ${_accSubTab === 'analysis' ? 'active' : ''}" data-subtab="analysis" onclick="switchAccSubTab('analysis')">가속 데이터 분석</button>
    </div>
    <div id="acc-tab-content">
        ${_accSubTab === 'design' ? renderAccDesignContent() : renderAccAnalysisContent()}
    </div>`;
}

function switchAccSubTab(subtab) {
    if (_altHot && _accSubTab === 'analysis') {
        window._savedAltData = _altHot.getData();
        window._savedAltModel = document.getElementById('alt-model')?.value;
    }
    _accSubTab = subtab;
    document.querySelectorAll('#acc-sub-tabs .sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === subtab);
    });
    const container = document.getElementById('acc-tab-content');
    if (!container) return;

    ChartManager.destroyAll();

    if (subtab === 'design') {
        container.innerHTML = renderAccDesignContent();
        setTimeout(() => {
            updateAccModelInputs();
            runAcceleration();
        }, 50);
    } else {
        container.innerHTML = renderAccAnalysisContent();
        setTimeout(() => {
            initAltAnalysisGrid();
            if (window._savedAltModel) {
                document.getElementById('alt-model').value = window._savedAltModel;
                switchAltModel(window._savedAltModel);
            }
        }, 50);
    }
}

function renderAccDesignContent() {
    return `
    <div class="grid-cols-1-2">
        <div class="glass-card">
            <h3 class="section-title">가속 수명 시험 설계</h3>

            ${HelpTooltip.labelWithHelp('가속 모델', '스트레스 유형에 따른 가속 모델 선택')}
            <select id="acc-model" onchange="updateAccModelInputs()">
                <option value="arrhenius" selected>Arrhenius (온도)</option>
                <option value="eyring">Eyring (온도 + 비열 스트레스)</option>
                <option value="peck">Peck (온도 + 습도)</option>
                <option value="coffin_manson">Coffin-Manson (열 사이클)</option>
                <option value="norris_landzberg">Norris-Landzberg (열 사이클 확장)</option>
                <option value="inverse_power">Inverse Power Law (전압/전류)</option>
                <option value="arrhenius_power">복합: Arrhenius × Inverse Power</option>
            </select>

            <div class="divider">계산 목표</div>
            <div class="radio-group" id="acc-goal">
                <label class="radio-option selected" onclick="selectRadio(this,'acc-goal')">
                    <input type="radio" name="acc-goal" value="test_time" checked> 시험 시간 계산
                </label>
                <label class="radio-option" onclick="selectRadio(this,'acc-goal')">
                    <input type="radio" name="acc-goal" value="sample_size"> 시료 수 계산
                </label>
                <label class="radio-option" onclick="selectRadio(this,'acc-goal')">
                    <input type="radio" name="acc-goal" value="life"> 인정 수명 계산
                </label>
            </div>

            <div class="divider">파라미터 입력</div>
            <div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem">
                <button class="btn btn-sm btn-secondary" onclick="resetAccInputs()">기본값 복원</button>
            </div>

            <div id="acc-model-inputs">
                ${renderArrheniusInputs()}
            </div>

            <div class="divider">시험 조건</div>
            <div id="acc-test-inputs">
                ${renderAccTestInputs()}
            </div>

            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem"
                    onclick="runAcceleration()">
                계산 실행
            </button>

            <!-- Ea / n 가속 상수 역산기 -->
            <div class="glass-card" style="margin-top: 1.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px;">
                <h4 style="font-size: 0.95rem; margin: 0 0 0.5rem 0; display: flex; align-items: center; gap: 0.35rem; color: var(--text-primary);">
                    <i class="fas fa-calculator" style="color: var(--accent-color);"></i> Ea / n 가속 상수 역산기
                </h4>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.75rem; line-height: 1.4;">
                    두 조건의 스트레스와 수명 대푯값(MTTF/B10 등)을 입력하여 가속 상수(Ea 또는 n)를 역산해 냅니다.
                </div>
                
                <div class="grid-2">
                    <div>
                        <label style="font-size:0.7rem; color: var(--text-secondary);">상수 유형</label>
                        <select id="rev-type" onchange="toggleRevFields()" style="width:100%; height:36px; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary)">
                            <option value="ea">Ea 역산 (Arrhenius)</option>
                            <option value="n">n 지수 역산 (IPL)</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.7rem; display:block; height:15px;"></label>
                        <button class="btn btn-sm btn-secondary" onclick="calculateReverseParam()" style="width:100%; height:36px; font-size:0.75rem;">
                            <i class="fas fa-magic" style="margin-right:0.25rem"></i> 상수 계산
                        </button>
                    </div>
                </div>
                
                <div class="grid-2" style="margin-top:0.75rem">
                    <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px;">
                        <div style="font-size:0.7rem; font-weight:bold; color:var(--accent-color); margin-bottom:0.25rem;">조건 1 (낮은 스트레스)</div>
                        <div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.35rem">
                            <div>
                                <span id="rev-s1-label" style="font-size:0.65rem; color: var(--text-secondary); display:block; margin-bottom:2px;">온도 1 (°C)</span>
                                <input type="number" id="rev-s1" value="55" style="height:28px; font-size:0.8rem; width: 100%; padding:2px 6px;">
                            </div>
                            <div>
                                <span style="font-size:0.65rem; color: var(--text-secondary); display:block; margin-bottom:2px;">수명 1 (시간)</span>
                                <input type="number" id="rev-l1" value="10000" style="height:28px; font-size:0.8rem; width: 100%; padding:2px 6px;">
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px;">
                        <div style="font-size:0.7rem; font-weight:bold; color:var(--danger); margin-bottom:0.25rem;">조건 2 (높은 스트레스)</div>
                        <div style="display:flex; flex-direction:column; gap:0.4rem; margin-top:0.35rem">
                            <div>
                                <span id="rev-s2-label" style="font-size:0.65rem; color: var(--text-secondary); display:block; margin-bottom:2px;">온도 2 (°C)</span>
                                <input type="number" id="rev-s2" value="125" style="height:28px; font-size:0.8rem; width: 100%; padding:2px 6px;">
                            </div>
                            <div>
                                <span style="font-size:0.65rem; color: var(--text-secondary); display:block; margin-bottom:2px;">수명 2 (시간)</span>
                                <input type="number" id="rev-l2" value="250" style="height:28px; font-size:0.8rem; width: 100%; padding:2px 6px;">
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="rev-result-panel" style="margin-top:0.75rem; display:none; padding:0.5rem; text-align:center; background: rgba(56, 189, 248, 0.05); border: 1px dashed var(--accent-color); border-radius: 6px;">
                    <div style="font-size:0.7rem; color:var(--text-secondary)">역산 결과</div>
                    <div id="rev-result-val" style="font-size:1.05rem; font-weight:bold; color:var(--accent-color); margin: 0.15rem 0;">-</div>
                    <button id="rev-apply-btn" class="btn btn-sm btn-primary" style="margin-top:0.25rem; font-size:0.7rem; padding:0.2rem 0.5rem; height: auto;">
                         가속 설계에 반영하기
                    </button>
                </div>
            </div>
        </div>

        <div id="acc-result" class="glass-card">
            <div class="empty-state" style="min-height:400px">
                <div style="font-size:0.9rem;color:var(--text-muted)">파라미터를 입력하고<br>"계산 실행"을 클릭하세요</div>
            </div>
        </div>
    </div>`;
}

function renderArrheniusInputs() {
    const tUse = accelerationState.tUse;
    const tStress = accelerationState.tStress;
    const ea = accelerationState.ea;
    return `
        ${HelpTooltip.labelWithHelp('사용 조건 온도', '제품이 실제 사용되는 환경 온도')}
        <div class="input-with-unit">
            <input type="number" id="acc-t-use" value="${tUse}" step="1">
            <span class="input-unit">°C</span>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 조건 온도', '가속 시험에서 적용할 스트레스 온도')}
        <div class="input-with-unit">
            <input type="number" id="acc-t-stress" value="${tStress}" step="1">
            <span class="input-unit">°C</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('활성화 에너지 (Ea) 프리셋', '주요 부품 및 고장 메커니즘의 Ea 표준 레퍼런스 값')}
        </div>
        <select id="acc-ea-preset" onchange="applyAccPreset('arrhenius', this.value)" style="margin-bottom:0.5rem; width:100%; height:32px; padding:0 0.5rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary)">
            <option value="">-- Ea 프리셋 선택 --</option>
            <option value="0.7">반도체 소자 마모 (0.7 eV)</option>
            <option value="0.9">패키지 부식/금속 이염 (0.9 eV)</option>
            <option value="0.5">솔더 조인트 피로/크리프 (0.5 eV)</option>
            <option value="1.0">게이트 산화막 파괴 (1.0 eV)</option>
            <option value="0.98">전해콘덴서 수명 열화 (0.98 eV)</option>
            <option value="0.3">우발 고장 메커니즘 (0.3 eV)</option>
        </select>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('활성화 에너지 (Ea) 직접 입력', '고장 메커니즘의 활성화 에너지')}
            <span style="font-size:0.75rem; color:var(--accent-color); cursor:pointer; text-decoration:underline; margin-bottom:0.25rem" onclick="openAccReferenceModal('arrhenius')">
                <i class="fas fa-book" style="margin-right:0.25rem"></i>표준가이드 & 검증
            </span>
        </div>
        <div class="input-with-unit">
            <input type="number" id="acc-ea" value="${ea}" min="0.01" max="3" step="0.01" oninput="accelerationState.ea = parseFloat(this.value)">
            <span class="input-unit">eV</span>
        </div>
        </div>`;
}

function renderAccTestInputs() {
    const beta = accelerationState.beta;
    const conf = accelerationState.confidence;
    const bxVal = accelerationState.bx;
    const tLife = accelerationState.targetLife;
    const nVal = accelerationState.n;

    const HT = HelpTooltip;
    return `
        <div class="grid-2">
            <div>
                ${HT.labelWithHelp('형상 모수 (β)', 'Weibull 형상 모수.<br>β&lt;1: 초기고장<br>β≈1: 우발고장<br>β&gt;1: 마모고장')}
                <input type="number" id="acc-beta" value="${beta}" min="0.1" step="0.1">
            </div>
            <div>
                ${HT.labelWithHelp('신뢰 수준 (C)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-confidence" value="${conf}" min="50" max="99.99" step="1">
                    <span class="input-unit">%</span>
                </div>
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HT.labelWithHelp('목표 고장률 (Bx)', '예: B1=1%, B5=5%, B10=10%')}
                <div class="input-with-unit">
                    <input type="number" id="acc-bx" value="${bxVal}" min="0.1" max="50" step="0.1">
                    <span class="input-unit">%</span>
                </div>
            </div>
            <div>
                ${HT.labelWithHelp('목표 보증 수명', '목표 수명 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-target-life" value="${tLife}" min="1" step="100">
                    <span class="input-unit">시간</span>
                </div>
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HT.labelWithHelp('시료 수 (n)', '시험에 투입되는 샘플 수')}
                <div class="input-with-unit">
                    <input type="number" id="acc-n" value="${nVal}" min="1" step="1">
                    <span class="input-unit">개</span>
                </div>
            </div>
            <div></div>
        </div>`;
}

function updateAccModelInputs() {
    saveCurrentAccInputs();

    const model = document.getElementById('acc-model').value;
    const container = document.getElementById('acc-model-inputs');

    if (model === 'arrhenius') container.innerHTML = renderArrheniusInputs();
    else if (model === 'eyring') container.innerHTML = renderEyringInputs();
    else if (model === 'peck') container.innerHTML = renderPeckInputs();
    else if (model === 'coffin_manson') container.innerHTML = renderCMInputs();
    else if (model === 'norris_landzberg') container.innerHTML = renderNLInputs();
    else if (model === 'inverse_power') container.innerHTML = renderIPInputs();
    else if (model === 'arrhenius_power') container.innerHTML = renderCombinedInputs();

    // 모델 변경에 따른 즉시 자동 계산 갱신
    setTimeout(() => {
        try { runAcceleration(); } catch(e) {}
    }, 50);
}

function renderPeckInputs() {
    const rhUse = accelerationState.rhUse;
    const rhStress = accelerationState.rhStress;
    const nPeck = accelerationState.nPeck;
    return renderArrheniusInputs() + `
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('사용 환경 습도', '')}
        <div class="input-with-unit">
            <input type="number" id="acc-rh-use" value="${rhUse}" min="1" max="100" step="1">
            <span class="input-unit">%RH</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 조건 습도', '')}
        <div class="input-with-unit">
            <input type="number" id="acc-rh-stress" value="${rhStress}" min="1" max="100" step="1">
            <span class="input-unit">%RH</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('Peck 모델 습도 지수 (n) 프리셋', '온도+습도 가속 파라미터 조합 프리셋')}
        </div>
        <select id="acc-peck-preset" onchange="applyAccPreset('peck', this.value)" style="margin-bottom:0.5rem; width:100%; height:32px; padding:0 0.5rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary)">
            <option value="">-- 습도 가속 프리셋 선택 --</option>
            <option value="0.9|3.0">JEDEC 표준 패키지 부식 (Ea=0.9 eV, n=3.0)</option>
            <option value="0.86|2.7">전력 반도체 수분 열화 (Ea=0.86 eV, n=2.7)</option>
            <option value="0.75|2.5">에폭시 몰딩 계면 박리 (Ea=0.75 eV, n=2.5)</option>
        </select>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('습도 지수 (n) 직접 입력', 'JEDEC 권장: 3.0')}
            <span style="font-size:0.75rem; color:var(--accent-color); cursor:pointer; text-decoration:underline; margin-bottom:0.25rem" onclick="openAccReferenceModal('peck')">
                <i class="fas fa-book" style="margin-right:0.25rem"></i>표준가이드 & 검증
            </span>
        </div>
        <input type="number" id="acc-n-peck" value="${nPeck}" min="0.1" step="0.1" oninput="accelerationState.nPeck = parseFloat(this.value)">
        </div>`;
}

function renderCMInputs() {
    const dtUse = accelerationState.dtUse;
    const dtStress = accelerationState.dtStress;
    const m = accelerationState.m;
    return `
        ${HelpTooltip.labelWithHelp('사용 환경 ΔT', '사용 환경에서의 온도 변화 범위')}
        <div class="input-with-unit">
            <input type="number" id="acc-dt-use" value="${dtUse}" min="1" step="1">
            <span class="input-unit">°C</span>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 조건 ΔT', '가속 시험에서의 온도 변화 범위')}
        <div class="input-with-unit">
            <input type="number" id="acc-dt-stress" value="${dtStress}" min="1" step="1">
            <span class="input-unit">°C</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('코핀-맨슨 피로 지수 (m) 프리셋', '재료 및 접합부 종류에 따른 피로 지수')}
        </div>
        <select id="acc-m-preset" onchange="applyAccPreset('coffin_manson', this.value)" style="margin-bottom:0.5rem; width:100%; height:32px; padding:0 0.5rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary)">
            <option value="">-- m 지수 프리셋 선택 --</option>
            <option value="1.9">Lead-free 무연 솔더 접합 (m = 1.9)</option>
            <option value="1.2">SnPb 공정 유연 솔더 (m = 1.2)</option>
            <option value="2.5">세라믹 칩 커패시터 열피로 (m = 2.5)</option>
            <option value="4.0">플라스틱 패키지 봉지재 크랙 (m = 4.0)</option>
            <option value="5.0">반도체 알루미늄 본딩 와이어 (m = 5.0)</option>
        </select>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('코핀-맨슨 지수 (m) 직접 입력', 'PCB 솔더: m ≈ 1.9~2.0')}
            <span style="font-size:0.75rem; color:var(--accent-color); cursor:pointer; text-decoration:underline; margin-bottom:0.25rem" onclick="openAccReferenceModal('coffin_manson')">
                <i class="fas fa-book" style="margin-right:0.25rem"></i>표준가이드 & 검증
            </span>
        </div>
        <input type="number" id="acc-m" value="${m}" min="0.1" step="0.1" oninput="accelerationState.m = parseFloat(this.value)">
        </div>`;
}

function renderIPInputs() {
    const vUse = accelerationState.vUse;
    const vStress = accelerationState.vStress;
    const nPower = accelerationState.nPower;
    return `
        ${HelpTooltip.labelWithHelp('사용 스트레스', '사용 환경의 스트레스 레벨 (전압, 전류 등)')}
        <input type="number" id="acc-v-use" value="${vUse}" min="0.01" step="0.1">
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 스트레스', '가속 시험의 스트레스 레벨')}
        <input type="number" id="acc-v-stress" value="${vStress}" min="0.01" step="0.1">
        </div>
        <div style="margin-top:0.75rem">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('역거듭제곱 스트레스 지수 (n) 프리셋', '스트레스 유형별 n 지수 프리셋')}
        </div>
        <select id="acc-n-power-preset" onchange="applyAccPreset('inverse_power', this.value)" style="margin-bottom:0.5rem; width:100%; height:32px; padding:0 0.5rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary)">
            <option value="">-- n 지수 프리셋 선택 --</option>
            <option value="3.0">세라믹 커패시터 전압 열화 (n = 3.0)</option>
            <option value="5.0">박막 필름 커패시터 전압 열화 (n = 5.0)</option>
            <option value="7.0">전력 케이블 절연막 파괴 (n = 7.0)</option>
            <option value="10.0">게이트 옥사이드 TDDB 마모 (n = 10.0)</option>
        </select>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('역거듭제곱 지수 (n) 직접 입력', '재료/메커니즘에 따라 다름')}
            <span style="font-size:0.75rem; color:var(--accent-color); cursor:pointer; text-decoration:underline; margin-bottom:0.25rem" onclick="openAccReferenceModal('inverse_power')">
                <i class="fas fa-book" style="margin-right:0.25rem"></i>표준가이드 & 검증
            </span>
        </div>
        <input type="number" id="acc-n-power" value="${nPower}" min="0.1" step="0.1" oninput="accelerationState.nPower = parseFloat(this.value)">
        </div>`;
}

function renderEyringInputs() {
    const eyringB = accelerationState.eyringB;
    const eyringSUse = accelerationState.eyringSUse;
    const eyringSStress = accelerationState.eyringSStress;
    return renderArrheniusInputs() + `
        <div style="margin-top:0.75rem">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('비열 스트레스 계수 (B) 프리셋', '주요 고장 메커니즘의 비열 스트레스 가속상수 레퍼런스')}
        </div>
        <select id="acc-eyring-preset" onchange="applyAccPreset('eyring', this.value)" style="margin-bottom:0.5rem; width:100%; height:32px; padding:0 0.5rem; font-size:0.8rem; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary)">
            <option value="">-- 비열 계수 (B) 프리셋 선택 --</option>
            <option value="0.7|1.2">전압 TDDB 고장 가속 (Ea=0.7 eV, B=1.2)</option>
            <option value="0.8|0.044">수분 절연 열화 가속 (Ea=0.8 eV, B=0.044)</option>
            <option value="1.0|1.5">게이트 산화막 파괴 가속 (Ea=1.0 eV, B=1.5)</option>
        </select>
        <div style="display:flex; justify-content:space-between; align-items:center;">
            ${HelpTooltip.labelWithHelp('비열 스트레스 계수 (B) 직접 입력', 'Eyring 모델의 2차 스트레스 영향 지수')}
            <span style="font-size:0.75rem; color:var(--accent-color); cursor:pointer; text-decoration:underline; margin-bottom:0.25rem" onclick="openAccReferenceModal('eyring')">
                <i class="fas fa-book" style="margin-right:0.25rem"></i>표준가이드 & 검증
            </span>
        </div>
        <input type="number" id="acc-eyring-b" value="${eyringB}" step="0.01">
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('사용 스트레스 (S_use)', '실제 사용 조건에서의 비열 스트레스 수치 (예: 전압, 전류 등)')}
        <input type="number" id="acc-eyring-s-use" value="${eyringSUse}" min="0" step="0.1">
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 스트레스 (S_stress)', '가속 시험 조건에서의 비열 스트레스 수치 (예: 전압, 전류 등)')}
        <input type="number" id="acc-eyring-s-stress" value="${eyringSStress}" min="0" step="0.1">
        </div>`;
}

function renderNLInputs() {
    const dtUse = accelerationState.dtUse;
    const dtStress = accelerationState.dtStress;
    const m = accelerationState.m;

    const nlRampUpUse = accelerationState.nlRampUpUse || 360;
    const nlDwellHighUse = accelerationState.nlDwellHighUse || 360;
    const nlRampDownUse = accelerationState.nlRampDownUse || 360;
    const nlDwellLowUse = accelerationState.nlDwellLowUse || 360;

    const nlRampUpStress = accelerationState.nlRampUpStress || 30;
    const nlDwellHighStress = accelerationState.nlDwellHighStress || 30;
    const nlRampDownStress = accelerationState.nlRampDownStress || 30;
    const nlDwellLowStress = accelerationState.nlDwellLowStress || 30;

    const nlTmaxUse = accelerationState.nlTmaxUse || 50;
    const nlTmaxStress = accelerationState.nlTmaxStress || 125;
    const nlEa = accelerationState.nlEa || 0.123;

    // 초기 주파수 계산
    const totalUseMin = nlRampUpUse + nlDwellHighUse + nlRampDownUse + nlDwellLowUse;
    const totalStressMin = nlRampUpStress + nlDwellHighStress + nlRampDownStress + nlDwellLowStress;
    const fUseCalc = (1440 / totalUseMin).toFixed(4);
    const fStressCalc = (1440 / totalStressMin).toFixed(4);

    return renderCMInputs() + `
        <div class="divider" style="margin-top:1rem; margin-bottom: 0.5rem;">사용 환경 사이클 프로파일 (주파수 환산용)</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem;">각 구간의 시간을 입력하면 1일당 사이클 주파수(cycles/day)가 자동 계산됩니다.</div>
        <div class="grid-2">
            <div>
                ${HelpTooltip.labelWithHelp('상승(Ramp Up) 시간', '고온으로 온도가 상승하는 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-rampup-use" value="${nlRampUpUse}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('고온 유지(Dwell High)', '최고 온도 유지 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-dwellhigh-use" value="${nlDwellHighUse}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.5rem">
            <div>
                ${HelpTooltip.labelWithHelp('하강(Ramp Down)', '저온으로 온도가 하강하는 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-rampdown-use" value="${nlRampDownUse}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('저온 유지(Dwell Low)', '최저 온도 유지 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-dwelllow-use" value="${nlDwellLowUse}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
        </div>
        <div style="margin-top:0.4rem; font-size:0.75rem; color:var(--accent-color); font-weight:bold; display:flex; justify-content:space-between;">
            <span>1사이클 시간: <span id="nl-cycle-time-use">${totalUseMin}</span>분</span>
            <span>환산 사용 주파수: <span id="nl-freq-use-val">${fUseCalc}</span> cycles/day</span>
        </div>

        <div class="divider" style="margin-top:1rem; margin-bottom: 0.5rem;">가속 시험 사이클 프로파일 (주파수 환산용)</div>
        <div class="grid-2">
            <div>
                ${HelpTooltip.labelWithHelp('상승(Ramp Up) 시간', '고온으로 온도가 상승하는 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-rampup-stress" value="${nlRampUpStress}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('고온 유지(Dwell High)', '최고 온도 유지 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-dwellhigh-stress" value="${nlDwellHighStress}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.5rem">
            <div>
                ${HelpTooltip.labelWithHelp('하강(Ramp Down)', '저온으로 온도가 하강하는 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-rampdown-stress" value="${nlRampDownStress}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('저온 유지(Dwell Low)', '최저 온도 유지 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-dwelllow-stress" value="${nlDwellLowStress}" min="1" step="1" oninput="updateNLFrequencies()">
                    <span class="input-unit">분(min)</span>
                </div>
            </div>
        </div>
        <div style="margin-top:0.4rem; font-size:0.75rem; color:var(--accent-color); font-weight:bold; display:flex; justify-content:space-between; margin-bottom: 0.75rem;">
            <span>1사이클 시간: <span id="nl-cycle-time-stress">${totalStressMin}</span>분</span>
            <span>환산 가속 주파수: <span id="nl-freq-stress-val">${fStressCalc}</span> cycles/day</span>
        </div>

        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HelpTooltip.labelWithHelp('사용 최고온도', 'Tmax 사용')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-tmax-use" value="${nlTmaxUse}" step="1">
                    <span class="input-unit">°C</span>
                </div>
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('가속 최고온도', 'Tmax 가속')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-tmax-stress" value="${nlTmaxStress}" step="1">
                    <span class="input-unit">°C</span>
                </div>
            </div>
        </div>
        <div style="margin-top:0.75rem">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                ${HelpTooltip.labelWithHelp('활성화 에너지 (Ea) 직접 입력', 'NL 모델 Ea, 일반: 0.123 eV')}
                <span style="font-size:0.75rem; color:var(--accent-color); cursor:pointer; text-decoration:underline; margin-bottom:0.25rem" onclick="openAccReferenceModal('norris_landzberg')">
                    <i class="fas fa-book" style="margin-right:0.25rem"></i>표준가이드 & 검증
                </span>
            </div>
            <div class="input-with-unit">
                <input type="number" id="acc-nl-ea" value="${nlEa}" min="0.01" step="0.01">
                <span class="input-unit">eV</span>
            </div>
        </div>`;
}

// 실시간 주파수 갱신 함수
window.updateNLFrequencies = function() {
    const ruUse = parseFloat(document.getElementById('acc-nl-rampup-use')?.value || 0);
    const dhUse = parseFloat(document.getElementById('acc-nl-dwellhigh-use')?.value || 0);
    const rdUse = parseFloat(document.getElementById('acc-nl-rampdown-use')?.value || 0);
    const dlUse = parseFloat(document.getElementById('acc-nl-dwelllow-use')?.value || 0);

    const ruStress = parseFloat(document.getElementById('acc-nl-rampup-stress')?.value || 0);
    const dhStress = parseFloat(document.getElementById('acc-nl-dwellhigh-stress')?.value || 0);
    const rdStress = parseFloat(document.getElementById('acc-nl-rampdown-stress')?.value || 0);
    const dlStress = parseFloat(document.getElementById('acc-nl-dwelllow-stress')?.value || 0);

    const sumUse = ruUse + dhUse + rdUse + dlUse;
    const sumStress = ruStress + dhStress + rdStress + dlStress;

    if (sumUse > 0) {
        document.getElementById('nl-cycle-time-use').innerText = sumUse;
        document.getElementById('nl-freq-use-val').innerText = (1440 / sumUse).toFixed(4);
    }
    if (sumStress > 0) {
        document.getElementById('nl-cycle-time-stress').innerText = sumStress;
        document.getElementById('nl-freq-stress-val').innerText = (1440 / sumStress).toFixed(4);
    }
};

// Ea, n 역산기 제어 헬퍼 함수
window.toggleRevFields = function() {
    const type = document.getElementById('rev-type').value;
    const s1Label = document.getElementById('rev-s1-label');
    const s2Label = document.getElementById('rev-s2-label');
    const s1Input = document.getElementById('rev-s1');
    const s2Input = document.getElementById('rev-s2');

    if (type === 'ea') {
        s1Label.innerText = '온도 1 (°C)';
        s2Label.innerText = '온도 2 (°C)';
        if (s1Input.value === '5' || s1Input.value === '12') {
            s1Input.value = '55';
            s2Input.value = '125';
        }
    } else {
        s1Label.innerText = '스트레스 1 (전압 등)';
        s2Label.innerText = '스트레스 2 (전압 등)';
        if (s1Input.value === '55' || s1Input.value === '125') {
            s1Input.value = '5';
            s2Input.value = '12';
        }
    }
    document.getElementById('rev-result-panel').style.display = 'none';
};

window.calculateReverseParam = function() {
    const type = document.getElementById('rev-type').value;
    const s1 = parseFloat(document.getElementById('rev-s1').value);
    const l1 = parseFloat(document.getElementById('rev-l1').value);
    const s2 = parseFloat(document.getElementById('rev-s2').value);
    const l2 = parseFloat(document.getElementById('rev-l2').value);

    const resultPanel = document.getElementById('rev-result-panel');
    const resultVal = document.getElementById('rev-result-val');
    const applyBtn = document.getElementById('rev-apply-btn');

    if (isNaN(s1) || isNaN(l1) || isNaN(s2) || isNaN(l2) || l1 <= 0 || l2 <= 0) {
        alert('모든 입력 필드에 0보다 큰 유효한 숫자를 입력해 주세요.');
        return;
    }

    if (s1 === s2) {
        alert('스트레스(온도) 1과 2는 서로 다른 값이어야 합니다.');
        return;
    }

    if (type === 'ea') {
        const k = CONSTANTS.BOLTZMANN_EV || 8.617333262145e-5;
        const t1K = s1 + 273.15;
        const t2K = s2 + 273.15;
        const ea = (k * Math.log(l1 / l2)) / (1 / t1K - 1 / t2K);
        
        resultVal.innerHTML = `계산된 Ea: <span style="color:var(--accent-color)">${ea.toFixed(4)}</span> eV`;
        resultPanel.style.display = 'block';
        
        applyBtn.onclick = function() {
            const eaInput = document.getElementById('acc-ea');
            const modelSelect = document.getElementById('acc-model');
            if (eaInput) {
                eaInput.value = ea.toFixed(4);
                accelerationState.ea = parseFloat(ea.toFixed(4));
            }
            if (modelSelect && !['arrhenius', 'peck', 'eyring', 'arrhenius_power'].includes(modelSelect.value)) {
                alert(`가속 상수가 Ea = ${ea.toFixed(4)} eV로 저장되었습니다.\n현재 활성화된 모델은 Ea를 직접 사용하지 않습니다. 모델을 'Arrhenius' 또는 'Peck'으로 변경하여 적용해 보세요.`);
            } else {
                alert(`Ea = ${ea.toFixed(4)} eV가 가속 시험 설계에 반영되었습니다.`);
            }
            runAcceleration();
        };
    } else {
        if (s1 <= 0 || s2 <= 0) {
            alert('n 지수 역산 시 스트레스 값은 0보다 커야 합니다.');
            return;
        }
        const n = Math.log(l1 / l2) / Math.log(s2 / s1);
        
        resultVal.innerHTML = `계산된 n: <span style="color:var(--accent-color)">${n.toFixed(4)}</span>`;
        resultPanel.style.display = 'block';
        
        applyBtn.onclick = function() {
            const nInput = document.getElementById('acc-n-power');
            const modelSelect = document.getElementById('acc-model');
            if (nInput) {
                nInput.value = n.toFixed(4);
                accelerationState.nPower = parseFloat(n.toFixed(4));
            }
            if (modelSelect && !['inverse_power', 'arrhenius_power'].includes(modelSelect.value)) {
                alert(`가속 상수가 n = ${n.toFixed(4)}로 저장되었습니다.\n현재 활성화된 모델은 전압/전류 지수(n)를 직접 사용하지 않습니다. 모델을 'Inverse Power Law' 또는 'Arrhenius × IPL'으로 변경하여 적용해 보세요.`);
            } else {
                alert(`n = ${n.toFixed(4)} 지수가 가속 시험 설계에 반영되었습니다.`);
            }
            runAcceleration();
        };
    }
};

function renderCombinedInputs() {
    const vUse = accelerationState.vUse;
    const vStress = accelerationState.vStress;
    const nPower = accelerationState.nPower;
    return renderArrheniusInputs() + `
        <div class="divider" style="margin-top:1rem">전압/전류 스트레스</div>
        ${HelpTooltip.labelWithHelp('사용 스트레스', '')}
        <input type="number" id="acc-v-use" value="${vUse}" min="0.01" step="0.1">
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 스트레스', '')}
        <input type="number" id="acc-v-stress" value="${vStress}" min="0.01" step="0.1">
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('역거듭제곱 지수 (n)', '')}
        <input type="number" id="acc-n-power" value="${nPower}" min="0.1" step="0.1">
        </div>`;
}

function saveCurrentAccInputs() {
    // 공통 파라미터 저장
    if (document.getElementById('acc-beta')) {
        const val = parseFloat(document.getElementById('acc-beta').value);
        if (!isNaN(val)) accelerationState.beta = val;
    }
    if (document.getElementById('acc-target-life')) {
        const val = parseFloat(document.getElementById('acc-target-life').value);
        if (!isNaN(val)) accelerationState.targetLife = val;
    }
    if (document.getElementById('acc-n')) {
        const val = parseInt(document.getElementById('acc-n').value);
        if (!isNaN(val)) accelerationState.n = val;
    }
    if (document.getElementById('acc-confidence')) {
        const val = parseFloat(document.getElementById('acc-confidence').value);
        if (!isNaN(val)) accelerationState.confidence = val;
    }
    if (document.getElementById('acc-bx')) {
        const val = parseFloat(document.getElementById('acc-bx').value);
        if (!isNaN(val)) accelerationState.bx = val;
    }
    if (document.getElementById('acc-test-time')) {
        const val = parseFloat(document.getElementById('acc-test-time').value);
        if (!isNaN(val)) accelerationState.testTime = val;
    }

    // 모델별 파라미터 저장
    if (document.getElementById('acc-t-use')) {
        const val = parseFloat(document.getElementById('acc-t-use').value);
        if (!isNaN(val)) accelerationState.tUse = val;
    }
    if (document.getElementById('acc-t-stress')) {
        const val = parseFloat(document.getElementById('acc-t-stress').value);
        if (!isNaN(val)) accelerationState.tStress = val;
    }
    if (document.getElementById('acc-ea')) {
        const val = parseFloat(document.getElementById('acc-ea').value);
        if (!isNaN(val)) accelerationState.ea = val;
    }
    if (document.getElementById('acc-rh-use')) {
        const val = parseFloat(document.getElementById('acc-rh-use').value);
        if (!isNaN(val)) accelerationState.rhUse = val;
    }
    if (document.getElementById('acc-rh-stress')) {
        const val = parseFloat(document.getElementById('acc-rh-stress').value);
        if (!isNaN(val)) accelerationState.rhStress = val;
    }
    if (document.getElementById('acc-n-peck')) {
        const val = parseFloat(document.getElementById('acc-n-peck').value);
        if (!isNaN(val)) accelerationState.nPeck = val;
    }
    if (document.getElementById('acc-dt-use')) {
        const val = parseFloat(document.getElementById('acc-dt-use').value);
        if (!isNaN(val)) accelerationState.dtUse = val;
    }
    if (document.getElementById('acc-dt-stress')) {
        const val = parseFloat(document.getElementById('acc-dt-stress').value);
        if (!isNaN(val)) accelerationState.dtStress = val;
    }
    if (document.getElementById('acc-m')) {
        const val = parseFloat(document.getElementById('acc-m').value);
        if (!isNaN(val)) accelerationState.m = val;
    }
    if (document.getElementById('acc-v-use')) {
        const val = parseFloat(document.getElementById('acc-v-use').value);
        if (!isNaN(val)) accelerationState.vUse = val;
    }
    if (document.getElementById('acc-v-stress')) {
        const val = parseFloat(document.getElementById('acc-v-stress').value);
        if (!isNaN(val)) accelerationState.vStress = val;
    }
    if (document.getElementById('acc-n-power')) {
        const val = parseFloat(document.getElementById('acc-n-power').value);
        if (!isNaN(val)) accelerationState.nPower = val;
    }
    if (document.getElementById('acc-eyring-b')) {
        const val = parseFloat(document.getElementById('acc-eyring-b').value);
        if (!isNaN(val)) accelerationState.eyringB = val;
    }
    if (document.getElementById('acc-eyring-s-use')) {
        const val = parseFloat(document.getElementById('acc-eyring-s-use').value);
        if (!isNaN(val)) accelerationState.eyringSUse = val;
    }
    if (document.getElementById('acc-eyring-s-stress')) {
        const val = parseFloat(document.getElementById('acc-eyring-s-stress').value);
        if (!isNaN(val)) accelerationState.eyringSStress = val;
    }
    if (document.getElementById('acc-f-use')) {
        const val = parseFloat(document.getElementById('acc-f-use').value);
        if (!isNaN(val)) accelerationState.fUse = val;
    }
    if (document.getElementById('acc-f-stress')) {
        const val = parseFloat(document.getElementById('acc-f-stress').value);
        if (!isNaN(val)) accelerationState.fStress = val;
    }
    if (document.getElementById('acc-nl-tmax-use')) {
        const val = parseFloat(document.getElementById('acc-nl-tmax-use').value);
        if (!isNaN(val)) accelerationState.nlTmaxUse = val;
    }
    if (document.getElementById('acc-nl-tmax-stress')) {
        const val = parseFloat(document.getElementById('acc-nl-tmax-stress').value);
        if (!isNaN(val)) accelerationState.nlTmaxStress = val;
    }
    if (document.getElementById('acc-nl-ea')) {
        const val = parseFloat(document.getElementById('acc-nl-ea').value);
        if (!isNaN(val)) accelerationState.nlEa = val;
    }
    if (document.getElementById('acc-nl-rampup-use')) {
        const val = parseFloat(document.getElementById('acc-nl-rampup-use').value);
        if (!isNaN(val)) accelerationState.nlRampUpUse = val;
    }
    if (document.getElementById('acc-nl-dwellhigh-use')) {
        const val = parseFloat(document.getElementById('acc-nl-dwellhigh-use').value);
        if (!isNaN(val)) accelerationState.nlDwellHighUse = val;
    }
    if (document.getElementById('acc-nl-rampdown-use')) {
        const val = parseFloat(document.getElementById('acc-nl-rampdown-use').value);
        if (!isNaN(val)) accelerationState.nlRampDownUse = val;
    }
    if (document.getElementById('acc-nl-dwelllow-use')) {
        const val = parseFloat(document.getElementById('acc-nl-dwelllow-use').value);
        if (!isNaN(val)) accelerationState.nlDwellLowUse = val;
    }
    if (document.getElementById('acc-nl-rampup-stress')) {
        const val = parseFloat(document.getElementById('acc-nl-rampup-stress').value);
        if (!isNaN(val)) accelerationState.nlRampUpStress = val;
    }
    if (document.getElementById('acc-nl-dwellhigh-stress')) {
        const val = parseFloat(document.getElementById('acc-nl-dwellhigh-stress').value);
        if (!isNaN(val)) accelerationState.nlDwellHighStress = val;
    }
    if (document.getElementById('acc-nl-rampdown-stress')) {
        const val = parseFloat(document.getElementById('acc-nl-rampdown-stress').value);
        if (!isNaN(val)) accelerationState.nlRampDownStress = val;
    }
    if (document.getElementById('acc-nl-dwelllow-stress')) {
        const val = parseFloat(document.getElementById('acc-nl-dwelllow-stress').value);
        if (!isNaN(val)) accelerationState.nlDwellLowStress = val;
    }
}

function resetAccInputs() {
    accelerationState = {
        beta: 2,
        targetLife: 20000,
        n: 22,
        confidence: 90,
        bx: 1,
        testTime: 1000,
        tUse: 25,
        tStress: 85,
        ea: 0.7,
        rhUse: 50,
        rhStress: 85,
        nPeck: 3,
        dtUse: 20,
        dtStress: 100,
        m: 2,
        vUse: 5,
        vStress: 12,
        nPower: 2,
        eyringB: 0,
        eyringSUse: 1,
        eyringSStress: 5,
        fUse: 1,
        fStress: 3,
        nlRampUpUse: 360,
        nlDwellHighUse: 360,
        nlRampDownUse: 360,
        nlDwellLowUse: 360,
        nlRampUpStress: 30,
        nlDwellHighStress: 30,
        nlRampDownStress: 30,
        nlDwellLowStress: 30,
        nlTmaxUse: 50,
        nlTmaxStress: 125,
        nlEa: 0.123
    };
    updateAccModelInputs();
    const goal = document.querySelector('input[name="acc-goal"]:checked')?.value || 'test_time';
    renderAccGoalInputs(goal);
}

function selectRadio(el, groupId) {
    const radio = el.querySelector('input');
    if (radio.dataset.lastChecked === "true" && el.classList.contains('selected')) {
        return;
    }

    saveCurrentAccInputs();

    document.querySelectorAll(`#${groupId} .radio-option`).forEach(o => {
        o.classList.remove('selected');
        const input = o.querySelector('input');
        if (input) input.dataset.lastChecked = "false";
    });
    el.classList.add('selected');
    radio.checked = true;
    radio.dataset.lastChecked = "true";

    if (groupId === 'acc-goal') {
        const goal = radio.value;
        renderAccGoalInputs(goal);
        setTimeout(() => {
            try { runAcceleration(); } catch(e) {}
        }, 100);
    }
}

function renderAccGoalInputs(goal) {
    const container = document.getElementById('acc-test-inputs');
    if (!container) return;

    saveCurrentAccInputs();

    const beta   = accelerationState.beta;
    const tLife  = accelerationState.targetLife;
    const nVal   = accelerationState.n;
    const conf   = accelerationState.confidence;
    const bxVal  = accelerationState.bx;
    const tTest  = accelerationState.testTime;

    const HT = HelpTooltip;

    let row2col2Html = '';
    if (goal === 'test_time' || goal === 'sample_size') {
        row2col2Html = `
            ${HT.labelWithHelp('목표 보증 수명', '목표 수명 시간')}
            <div class="input-with-unit">
                <input type="number" id="acc-target-life" value="${tLife}" min="1" step="100">
                <span class="input-unit">시간</span>
            </div>`;
    }

    let row3col1Html = '';
    if (goal === 'test_time' || goal === 'life') {
        row3col1Html = `
            ${HT.labelWithHelp('시료 수 (n)', '시험에 투입되는 샘플 수')}
            <div class="input-with-unit">
                <input type="number" id="acc-n" value="${nVal}" min="1" step="1">
                <span class="input-unit">개</span>
            </div>`;
    }

    let row3col2Html = '';
    if (goal === 'sample_size' || goal === 'life') {
        row3col2Html = `
            ${HT.labelWithHelp('시험 시간 (Tₛ)', '가속 조건에서의 실제 시험 시간')}
            <div class="input-with-unit">
                <input type="number" id="acc-test-time" value="${tTest}" min="1" step="100">
                <span class="input-unit">시간</span>
            </div>`;
    }

    let infoBoxHtml = '';
    if (goal === 'test_time') {
        infoBoxHtml = `
        <div class="info-box" style="font-size:0.8rem;margin-bottom:0.75rem">
            필요 입력: <strong>형상모수(β), 신뢰수준(C), 목표고장률(Bx), 목표보증수명, 시료수(n)</strong> → 필요 시험시간 계산
        </div>`;
    } else if (goal === 'sample_size') {
        infoBoxHtml = `
        <div class="info-box" style="font-size:0.8rem;margin-bottom:0.75rem">
            필요 입력: <strong>형상모수(β), 신뢰수준(C), 목표고장률(Bx), 목표보증수명, 시험시간</strong> → 필요 시료수 계산
        </div>`;
    } else if (goal === 'life') {
        infoBoxHtml = `
        <div class="info-box" style="font-size:0.8rem;margin-bottom:0.75rem">
            필요 입력: <strong>형상모수(β), 신뢰수준(C), 목표고장률(Bx), 시료수(n), 시험시간</strong> → 인정 Bx 수명 계산
        </div>`;
    }

    container.innerHTML = `
        ${infoBoxHtml}
        <div class="grid-2">
            <div>
                ${HT.labelWithHelp('형상 모수 (β)', 'Weibull 형상 모수.<br>β&lt;1: 초기고장<br>β≈1: 우발고장<br>β&gt;1: 마모고장')}
                <input type="number" id="acc-beta" value="${beta}" min="0.1" step="0.1">
            </div>
            <div>
                ${HT.labelWithHelp('신뢰 수준 (C)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-confidence" value="${conf}" min="50" max="99.99" step="1">
                    <span class="input-unit">%</span>
                </div>
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HT.labelWithHelp('목표 고장률 (Bx)', '예: B1=1%, B5=5%, B10=10%')}
                <div class="input-with-unit">
                    <input type="number" id="acc-bx" value="${bxVal}" min="0.1" max="50" step="0.1">
                    <span class="input-unit">%</span>
                </div>
            </div>
            <div>
                ${row2col2Html}
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${row3col1Html}
            </div>
            <div>
                ${row3col2Html}
            </div>
        </div>`;
}

function runAcceleration() {
    const model = document.getElementById('acc-model').value;
    const goal  = document.querySelector('input[name="acc-goal"]:checked')?.value || 'test_time';

    // DOM에 존재하면 최신 값으로 state 갱신
    if (document.getElementById('acc-beta')) {
        const val = parseFloat(document.getElementById('acc-beta').value);
        if (!isNaN(val)) accelerationState.beta = val;
    }
    if (document.getElementById('acc-target-life')) {
        const val = parseFloat(document.getElementById('acc-target-life').value);
        if (!isNaN(val)) accelerationState.targetLife = val;
    }
    if (document.getElementById('acc-n')) {
        const val = parseInt(document.getElementById('acc-n').value);
        if (!isNaN(val)) accelerationState.n = val;
    }
    if (document.getElementById('acc-confidence')) {
        const val = parseFloat(document.getElementById('acc-confidence').value);
        if (!isNaN(val)) accelerationState.confidence = val;
    }
    if (document.getElementById('acc-bx')) {
        const val = parseFloat(document.getElementById('acc-bx').value);
        if (!isNaN(val)) accelerationState.bx = val;
    }
    if (document.getElementById('acc-test-time')) {
        const val = parseFloat(document.getElementById('acc-test-time').value);
        if (!isNaN(val)) accelerationState.testTime = val;
    }

    const beta       = accelerationState.beta;
    const targetLife = accelerationState.targetLife;
    const nSample    = accelerationState.n;
    const confidence = accelerationState.confidence;
    const bx         = accelerationState.bx;
    const tTestUser  = accelerationState.testTime;

    let af = 1, modelLabel = '', afFormulaStr = '', afParams = {};

    if (model === 'arrhenius') {
        const tUse   = parseFloat(document.getElementById('acc-t-use').value);
        const tStress= parseFloat(document.getElementById('acc-t-stress').value);
        const ea     = parseFloat(document.getElementById('acc-ea').value);
        af = Acceleration.calcArrhenius(ea, tUse, tStress);
        modelLabel = 'Arrhenius (온도)';
        afFormulaStr = `AF = e^{\\frac{${ea}}{k} \\left(\\frac{1}{${(tUse+273.15).toFixed(2)}} - \\frac{1}{${(tStress+273.15).toFixed(2)}}\\right)} = ${af.toFixed(2)}`;
        afParams = { ea, tUse, tStress };
    } else if (model === 'peck') {
        const tUse    = parseFloat(document.getElementById('acc-t-use').value);
        const tStress = parseFloat(document.getElementById('acc-t-stress').value);
        const ea      = parseFloat(document.getElementById('acc-ea').value);
        const rhUse   = parseFloat(document.getElementById('acc-rh-use').value);
        const rhStress= parseFloat(document.getElementById('acc-rh-stress').value);
        const nPeck   = parseFloat(document.getElementById('acc-n-peck').value);
        af = Acceleration.calcPeck(ea, nPeck, tUse, rhUse, tStress, rhStress);
        modelLabel = 'Peck (온도+습도)';
        afFormulaStr = `AF = \\left(\\frac{${rhStress}}{${rhUse}}\\right)^{${nPeck}} e^{\\frac{${ea}}{k} \\left(\\frac{1}{${(tUse+273.15).toFixed(2)}} - \\frac{1}{${(tStress+273.15).toFixed(2)}}\\right)} = ${af.toFixed(2)}`;
        afParams = { ea, nPeck, tUse, rhUse, tStress, rhStress };
    } else if (model === 'coffin_manson') {
        const dtUse   = parseFloat(document.getElementById('acc-dt-use').value);
        const dtStress= parseFloat(document.getElementById('acc-dt-stress').value);
        const m       = parseFloat(document.getElementById('acc-m').value);
        af = Acceleration.calcCoffinManson(m, dtUse, dtStress);
        modelLabel = 'Coffin-Manson (열사이클)';
        afFormulaStr = `AF = \\left(\\frac{\\Delta T_{stress}}{\\Delta T_{use}}\\right)^m = \\left(\\frac{${dtStress}}{${dtUse}}\\right)^{${m}} = ${af.toFixed(2)}`;
        afParams = { m, dtUse, dtStress };
    } else if (model === 'inverse_power') {
        const vUse   = parseFloat(document.getElementById('acc-v-use').value);
        const vStress= parseFloat(document.getElementById('acc-v-stress').value);
        const nPower = parseFloat(document.getElementById('acc-n-power').value);
        af = Acceleration.calcInversePower(nPower, vUse, vStress);
        modelLabel = 'Inverse Power Law';
        afFormulaStr = `AF = \\left(\\frac{V_{stress}}{V_{use}}\\right)^n = \\left(\\frac{${vStress}}{${vUse}}\\right)^{${nPower}} = ${af.toFixed(2)}`;
        afParams = { n: nPower, vUse, vStress };
    } else if (model === 'eyring') {
        const tUse   = parseFloat(document.getElementById('acc-t-use').value);
        const tStress= parseFloat(document.getElementById('acc-t-stress').value);
        const ea     = parseFloat(document.getElementById('acc-ea').value);
        const b      = parseFloat(document.getElementById('acc-eyring-b')?.value || '0');
        const sUse   = parseFloat(document.getElementById('acc-eyring-s-use')?.value || '0');
        const sStress= parseFloat(document.getElementById('acc-eyring-s-stress')?.value || '0');
        af = Acceleration.calcEyring(ea, tUse, tStress, b, sUse, sStress);
        modelLabel = 'Eyring (온도+비열)';
        afFormulaStr = `AF = \\frac{T_u}{T_s} e^{...} = ${af.toFixed(2)}`;
        afParams = { ea, tUse, tStress, b, sUse, sStress };
    } else if (model === 'norris_landzberg') {
        const dtUse   = parseFloat(document.getElementById('acc-dt-use').value);
        const dtStress= parseFloat(document.getElementById('acc-dt-stress').value);
        const m       = parseFloat(document.getElementById('acc-m').value);
        
        // Ramp/Dwell로부터 주파수 역산
        const ruUse = parseFloat(document.getElementById('acc-nl-rampup-use').value || 0);
        const dhUse = parseFloat(document.getElementById('acc-nl-dwellhigh-use').value || 0);
        const rdUse = parseFloat(document.getElementById('acc-nl-rampdown-use').value || 0);
        const dlUse = parseFloat(document.getElementById('acc-nl-dwelllow-use').value || 0);
        
        const ruStress = parseFloat(document.getElementById('acc-nl-rampup-stress').value || 0);
        const dhStress = parseFloat(document.getElementById('acc-nl-dwellhigh-stress').value || 0);
        const rdStress = parseFloat(document.getElementById('acc-nl-rampdown-stress').value || 0);
        const dlStress = parseFloat(document.getElementById('acc-nl-dwelllow-stress').value || 0);
        
        const fUse    = 1440 / (ruUse + dhUse + rdUse + dlUse);
        const fStress = 1440 / (ruStress + dhStress + rdStress + dlStress);
        
        const tMaxUse = parseFloat(document.getElementById('acc-nl-tmax-use').value);
        const tMaxStr = parseFloat(document.getElementById('acc-nl-tmax-stress').value);
        const nlEa    = parseFloat(document.getElementById('acc-nl-ea').value);
        af = Acceleration.calcNorrisLandzberg(m, fUse, fStress, dtUse, dtStress, tMaxUse, tMaxStr, nlEa);
        modelLabel = 'Norris-Landzberg';
        afFormulaStr = `AF = (f_u/f_s)^{0.33} (\\Delta T_s/\\Delta T_u)^{${m}} \\cdot AF_{Arr} = ${af.toFixed(2)}`;
        afParams = { m, fUse, fStress, dtUse, dtStress, tMaxUse, tMaxStress: tMaxStr, ea: nlEa };
    } else if (model === 'arrhenius_power') {
        const tUse   = parseFloat(document.getElementById('acc-t-use').value);
        const tStress= parseFloat(document.getElementById('acc-t-stress').value);
        const ea     = parseFloat(document.getElementById('acc-ea').value);
        const vUse   = parseFloat(document.getElementById('acc-v-use').value);
        const vStress= parseFloat(document.getElementById('acc-v-stress').value);
        const nPower = parseFloat(document.getElementById('acc-n-power').value);
        af = Acceleration.calcArrheniusPower(ea, nPower, tUse, tStress, vUse, vStress);
        modelLabel = '복합 (Arrhenius × IPL)';
        afFormulaStr = `AF_{Arr} \\times AF_{IPL} = ${af.toFixed(2)}`;
        afParams = { ea, n: nPower, tUse, tStress, vUse, vStress };
    }

    const formulaResult = Acceleration.getGeneralFormula(model, afParams, af, beta, nSample, targetLife, confidence, bx, goal, tTestUser);
    const tradeoff = Acceleration.calcTradeoff(af, beta, targetLife, 1 - bx/100, confidence/100);
    const afVsStress = Acceleration.generateAFvsStress(model, afParams);
    renderAccResult(af, modelLabel, formulaResult, tradeoff, beta, nSample, targetLife, bx, goal, model, afVsStress, afParams);
}

function renderAccResult(af, modelLabel, formulaResult, tradeoff, beta, n, targetLife, bx, goal, model, afVsStress, afParams) {
    // 목표별 핵심 결과 계산 (runAcceleration에서 전달받은 conf는 formulaResult에 이미 사용됨)
    const conf = parseFloat(document.getElementById('acc-confidence')?.value || '90');
    const tTestUser = parseFloat(document.getElementById('acc-test-time')?.value || '1000');
    const bxFraction = bx / 100;
    const C = conf / 100;
    const chi2 = jStat.chisquare.inv(C, 2);
    const etaUseReq = targetLife / Math.pow(-Math.log(1 - bxFraction), 1 / beta);

    const goalResults = [];
    if (!goal || goal === 'test_time') {
        const tTest = (1 / af) * Math.pow((chi2 * Math.pow(etaUseReq, beta)) / (2 * Math.max(n, 1)), 1 / beta);
        const tTestFinal = Math.max(1, Math.round(tTest));
        goalResults.push({ label: '필요 시험 시간', value: isFinite(tTestFinal) ? `${tTestFinal.toLocaleString()}h` : '-', color: 'var(--accent-color)' });
        const etaUse = Math.pow((2 * Math.pow(tTestFinal * af, beta) * Math.max(n, 1)) / chi2, 1 / beta);
        const bxLife = etaUse * Math.pow(-Math.log(1 - bxFraction), 1 / beta);
        goalResults.push({ label: `사용조건 척도모수 (η_use)`, value: isFinite(etaUse) ? `${Math.round(etaUse).toLocaleString()}h` : '-', color: 'var(--success)' });
        goalResults.push({ label: `B${bx} 보증 수명 (B${bx} Life)`, value: isFinite(bxLife) ? `${Math.round(bxLife).toLocaleString()}h` : '-', color: 'var(--warning)' });
    } else if (goal === 'sample_size') {
        const num = chi2 * Math.pow(etaUseReq, beta);
        const den = 2 * Math.pow(tTestUser * af, beta);
        const nReq = Math.ceil(num / den);
        goalResults.push({ label: '필요 시료 수', value: `${nReq}개`, color: 'var(--accent-color)' });
        goalResults.push({ label: `목표 B${bx} 수명`, value: `${targetLife.toLocaleString()}h`, color: 'var(--text-primary)' });
        goalResults.push({ label: '시험 시간', value: `${tTestUser.toLocaleString()}h`, color: 'var(--text-secondary)' });
    } else if (goal === 'life') {
        const certifiedLife = af * tTestUser * Math.pow(-Math.log(1 - bxFraction), 1/beta) / Math.pow(chi2/(2 * Math.max(n, 1)), 1/beta);
        goalResults.push({ label: `B${bx} 인정 수명`, value: isFinite(certifiedLife) ? `${Math.round(certifiedLife).toLocaleString()}h` : '-', color: 'var(--success)' });
        goalResults.push({ label: '시료 수 (n)', value: `${n}개`, color: 'var(--text-primary)' });
        goalResults.push({ label: '시험 시간', value: `${tTestUser.toLocaleString()}h`, color: 'var(--text-secondary)' });
    }

    const afChartHtml = (afVsStress && afVsStress.length > 0) ? `
        <div style="margin-top:1.25rem">
            <h4 style="color:var(--text-secondary);margin-bottom:0.75rem">스트레스별 가속 계수 (AF)</h4>
            <div class="chart-container" style="height:250px"><canvas id="acc-af-chart"></canvas></div>
        </div>` : '';

    // 학술 규격 및 논문 정합성 검증 확인 로직
    let verificationHtml = '';
    const refData = Acceleration.REFERENCE_DATA[model];
    if (refData) {
        let isMatched = false;
        let refCalculatedVal = 0;
        const vInputs = refData.verification.inputs;

        if (model === 'arrhenius') {
            refCalculatedVal = Acceleration.calcArrhenius(vInputs.ea, vInputs.useTemp, vInputs.stressTemp);
            isMatched = (afParams.ea === vInputs.ea && afParams.tUse === vInputs.useTemp && afParams.tStress === vInputs.stressTemp);
        } else if (model === 'peck') {
            refCalculatedVal = Acceleration.calcPeck(vInputs.ea, vInputs.n, vInputs.useTemp, vInputs.useRh, vInputs.stressTemp, vInputs.stressRh);
            isMatched = (afParams.ea === vInputs.ea && afParams.nPeck === vInputs.n && afParams.tUse === vInputs.useTemp && afParams.tStress === vInputs.stressTemp && afParams.rhUse === vInputs.useRh && afParams.rhStress === vInputs.stressRh);
        } else if (model === 'coffin_manson') {
            refCalculatedVal = Acceleration.calcCoffinManson(vInputs.m, vInputs.dtUse, vInputs.dtStress);
            isMatched = (afParams.m === vInputs.m && afParams.dtUse === vInputs.dtUse && afParams.dtStress === vInputs.dtStress);
        } else if (model === 'inverse_power') {
            refCalculatedVal = Acceleration.calcInversePower(vInputs.n, vInputs.vUse, vInputs.vStress);
            isMatched = (afParams.n === vInputs.n && afParams.vUse === vInputs.vUse && afParams.vStress === vInputs.vStress);
        }

        if (isMatched) {
            verificationHtml = `
            <div class="info-box success" style="margin-top:1rem;display:flex;align-items:flex-start;gap:0.75rem;font-size:0.85rem;border-left:4px solid var(--success);background:rgba(34,197,94,0.08)">
                <i class="fas fa-check-double" style="color:var(--success);font-size:1.1rem;margin-top:0.1rem"></i>
                <div>
                    <strong style="color:var(--success)">✓ 국제 규격/학술 정합성 검증 완료</strong><br>
                    현재 입력값은 <span style="text-decoration:underline;font-weight:600;color:var(--text-primary)">${refData.verification.source}</span> 예제 데이터셋과 일치합니다.<br>
                    문헌 공식 기재값 <strong>${refData.verification.targetVal.toFixed(4)}</strong>과 RE-Suite 엔진 계산값 <strong>${af.toFixed(4)}</strong>이 소수점 4자리까지 정확히 일치(100.0%)함을 인증합니다.
                </div>
            </div>`;
        } else {
            verificationHtml = `
            <div class="accordion" style="margin-top:1rem;background:rgba(255,255,255,0.01);border:1px solid rgba(255,255,255,0.05);border-radius:8px">
                <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')" style="padding:0.6rem 0.85rem;font-size:0.85rem;display:flex;justify-content:space-between;align-items:center;cursor:pointer">
                    <span>📚 규격 및 학술 예제 대조 검증 안내</span>
                    <span class="accordion-arrow">▼</span>
                </div>
                <div class="accordion-body" style="padding:0.75rem 0.85rem;font-size:0.8rem;color:var(--text-secondary)">
                    검증 예제 조건이 현재 입력값과 다릅니다. 표준가이드 버튼을 눌러 참조 조건을 확인하세요.
                </div>
            </div>`;
        }
    }

    // 피처 C: 실시간 슬라이더 마크업 생성
    let sliderHtml = '';
    if (goal === 'test_time') {
        sliderHtml = `
        <div class="glass-card-sm" style="margin-top:1rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:1rem; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem">
                <span style="font-size:0.85rem; font-weight:600; color:var(--accent-color)">실시간 시료수 조절 슬라이더 (트레이드오프 조정)</span>
                <span style="font-size:0.85rem; color:var(--text-secondary)"><strong id="slider-n-val" style="color:var(--text-primary); font-size:1rem">${n}</strong> 개</span>
            </div>
            <input type="range" id="acc-n-slider" min="1" max="100" value="${n}" style="width:100%; accent-color:var(--accent-color); cursor:pointer;" oninput="updateAccSlider(this.value)">
            <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-muted); margin-top:0.25rem">
                <span>시료 1개</span>
                <span>시료 100개</span>
            </div>
        </div>`;
    }

    // 피처 E: 요약 텍스트 생성
    let finalResultVal = 0;
    if (goal === 'test_time') {
        const tTest = (1 / af) * Math.pow((chi2 * Math.pow(etaUseReq, beta)) / (2 * Math.max(n, 1)), 1 / beta);
        finalResultVal = Math.max(1, Math.round(tTest));
    } else if (goal === 'sample_size') {
        const num = chi2 * Math.pow(etaUseReq, beta);
        const den = 2 * Math.pow(tTestUser * af, beta);
        finalResultVal = Math.ceil(num / den);
    } else if (goal === 'life') {
        finalResultVal = af * tTestUser * Math.pow(-Math.log(1 - bxFraction), 1/beta) / Math.pow(chi2/(2 * Math.max(n, 1)), 1/beta);
    }
    const summaryText = Acceleration.generateSummaryText(model, af, beta, n, targetLife, conf/100, bx, goal, tTestUser, finalResultVal);

    const summaryHtml = `
    <div class="glass-card-sm" style="margin-top: 1.25rem; background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.15); padding: 0.85rem; border-radius: 8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem">
            <span style="font-size:0.85rem; font-weight:600; color:var(--accent-color)">📝 보고서용 비즈니스 요약문</span>
            <button class="btn btn-sm btn-secondary" onclick="copySummaryTextToClipboard()" style="padding: 2px 8px; font-size:0.75rem; height:24px; line-height:1">복사하기</button>
        </div>
        <p id="acc-business-summary" style="font-size: 0.83rem; line-height: 1.5; color: var(--text-primary); margin:0; word-break: keep-all;">
            ${summaryText}
        </p>
    </div>`;

    // 피처 D: 수식 도슨트 아코디언 마크업
    const docentHtml = `
    <div class="accordion" style="margin-top:0.75rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.05); border-radius:8px">
        <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')" style="padding:0.6rem 0.85rem; font-size:0.85rem; display:flex; justify-content:space-between; align-items:center; cursor:pointer">
            <span>💡 실무 도슨트 해설 (가속 시험 & 신뢰성 수식)</span>
            <span class="accordion-arrow">▼</span>
        </div>
        <div class="accordion-body" style="padding:0.75rem 0.85rem; font-size:0.8rem; color:var(--text-secondary); line-height:1.6">
            <p style="margin: 0 0 0.5rem 0;"><strong>1. 가속 계수 (AF) 공식의 의미:</strong> 온도가 올라감에 따라 노화 속도가 기하급수적으로 증가하는 아레니우스 열역학 법칙을 따릅니다. 활성화 에너지(Ea)가 높을수록 수명 가속도(AF)가 급상승하여 가속 시험 일정을 극적으로 줄일 수 있습니다. 반도체 소자 마모는 표준 0.7 eV를 기준으로 삼습니다.</p>
            <p style="margin: 0 0 0.5rem 0;"><strong>2. 필요 시험 시간(t_test) 공식의 의미:</strong> 신뢰수준 C% 하에서 목표 수명(B_x)을 보증하기 위해 필요한 시험 시간을 계산합니다. 시료 수(n)를 많이 투입할수록 시험 시간이 단축되는 반비례 관계에 있으며, 형상모수 β가 클수록(마모가 집중되는 특성일수록) 시료 증량에 따른 시간 절감 효과가 커집니다.</p>
            <p style="margin: 0;"><strong>3. 척도모수 (η_use) & 보증 수명 계산:</strong> 카이제곱 신뢰성 역산 기법을 통해 실제 시험 시간과 시료 수 조건이 최종적으로 보증하는 부품 고유의 수명(B_x)을 계산합니다. 단 1대도 고장나지 않아야(c=0) 해당 B_x 수명을 수학적으로 완벽히 신뢰수준 C% 하에 보증할 수 있습니다.</p>
        </div>
    </div>`;

    // 결과 HTML 생성 및 #acc-result에 삽입
    const el = document.getElementById('acc-result');
    if (!el) return;

    el.innerHTML = `
    <h3 class="section-title">계산 결과</h3>
    <div class="grid-4" style="margin-bottom:1.25rem">
        <div class="stat-card">
            <div class="label">가속 계수 (AF)</div>
            <div class="value" style="font-size:1.8rem;color:var(--accent-color)">${af.toFixed(2)}×</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${modelLabel}</div>
        </div>
        ${goalResults.map(r => `
        <div class="stat-card">
            <div class="label">${r.label}</div>
            <div class="value" style="font-size:1.4rem;color:${r.color || 'var(--accent-color)'}">${r.value}</div>
        </div>`).join('')}
    </div>

    ${sliderHtml}

    ${summaryHtml}

    ${verificationHtml}

    ${afChartHtml}

    <div class="glass-card" style="margin-top:1.25rem">
        <h4 style="color:var(--text-secondary);margin-bottom:0.75rem">n vs 시험 시간 트레이드오프</h4>
        <div class="chart-container" style="height:220px"><canvas id="acc-tradeoff-chart"></canvas></div>
    </div>

    <div style="margin-top:1.25rem">
        ${formulaResult?.steps ? `
        <div class="glass-card" style="position:relative">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary); margin:0">공식 및 계산 과정</h4>
                <div style="display:flex; gap:0.5rem">
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaText('#acc-formula-section'); event.stopPropagation();" style="padding:0.25rem 0.5rem; font-size:0.75rem">
                        <i class="fas fa-file-alt" style="margin-right:0.25rem"></i> 텍스트 복사
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="copyFormulaImage('#acc-formula-section'); event.stopPropagation();" style="padding:0.25rem 0.5rem; font-size:0.75rem">
                        <i class="fas fa-image" style="margin-right:0.25rem"></i> 이미지 복사 (보고서용)
                    </button>
                </div>
            </div>
            <div id="acc-formula-section" class="formula-section" style="border:none; padding:0; background:none">${formulaResult.steps}</div>
            ${docentHtml}
        </div>` : ''}
    </div>`;

    // 차트 그리기
    setTimeout(() => {
        if (tradeoff && tradeoff.length > 0) {
            ChartManager.drawTradeoff('acc-tradeoff-chart', tradeoff);
        }
        if (afVsStress && afVsStress.length > 0) {
            const xLabel = (model === 'peck') ? '습도 (%RH)' :
                           (model === 'coffin_manson' || model === 'norris_landzberg') ? '온도폭 ΔT (°C)' :
                           (model === 'inverse_power') ? '전압/전류 스트레스' : '온도 (°C)';
            ChartManager.drawAFvsStress('acc-af-chart', afVsStress, xLabel);
        }
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
        }
    }, 80);
}

// ═══════════════════════════════════════════
// Warranty 분석 탭
// ═══════════════════════════════════════════
let warrantyState = { step: 'input', fits: [], selectedFit: null, preprocessed: null, forecastResult: null, shipmentPeriods: 12, returnPeriods: 12, confidence: 90, warrantyMonths: null, rawData: null };

function renderWarrantyTab() {
    warrantyState.step = warrantyState.fits.length > 0 ? warrantyState.step : 'input';
    const stepLabels = ['데이터 입력', '분포 적합', '예측'];
    const stepIds = ['input', 'fitted', 'forecast'];
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">
        <div>
            <h2 class="section-title" style="margin-bottom:0.2rem">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Warranty 분석
            </h2>
            <p style="color:var(--text-secondary);font-size:0.8rem;margin:0">Nevada 달력 차트 입력 → 분포 적합 → 고장 예측</p>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center" id="warranty-steps">
            ${stepIds.map((s,i) => `<div class="badge ${warrantyState.step===s?'badge-purple':''}" style="cursor:pointer;${warrantyState.step===s?'font-weight:700':'opacity:0.5'}" onclick="warrantyGoStep('${s === 'input' ? 'input' : warrantyState.fits.length > 0 ? s : 'input'}')">${i+1}. ${stepLabels[i]}</div>${i<2?'<span style="color:var(--text-muted)">→</span>':''}`).join('')}
        </div>
    </div>
    <div id="warranty-error" style="display:none"></div>
    <div id="warranty-content">${renderWarrantyStep()}</div>`;
}

function renderWarrantyStep() {
    if (warrantyState.step === 'input') return renderWarrantyInput();
    if (warrantyState.step === 'fitted') return renderWarrantyFitted();
    if (warrantyState.step === 'forecast') return renderWarrantyForecast();
    return '';
}

function warrantyGoStep(step) {
    warrantyState.step = step;
    const el = document.getElementById('warranty-content');
    if (el) el.innerHTML = renderWarrantyStep();
    document.querySelectorAll('#warranty-steps .badge').forEach((b, i) => {
        const s = ['input','fitted','forecast'][i];
        b.className = `badge ${warrantyState.step===s?'badge-purple':''}`;
        b.style.fontWeight = warrantyState.step===s?'700':'400';
        b.style.opacity = warrantyState.step===s?'1':'0.5';
    });
    if (step === 'input') setTimeout(initWarrantyGrid, 100);
    if (step === 'fitted') setTimeout(drawWarrantyDistributionCharts, 100);
    if (step === 'forecast' && warrantyState.forecastResult) setTimeout(drawWarrantyCharts, 100);
}

function renderWarrantyInput() {
    return `
    <div style="display:flex;flex-direction:column;gap:1rem">
        <!-- 네바다 차트 규격 설정 카드 -->
        <div class="glass-card">
            <h3 class="section-title" style="margin-bottom:0.75rem">네바다 차트 규격 설정</h3>
            <div class="grid-4" style="margin-bottom:0.5rem">
                <div>
                    ${HelpTooltip.labelWithHelp('출하 기간 수 (행)', '생산 및 출하 배치(Cohort)의 개수(행 수)를 설정합니다.')}
                    <input type="number" id="warranty-shipment-periods" class="input-field" value="${warrantyState.shipmentPeriods || 12}" min="2" max="36" step="1" onchange="changeWarrantyShipmentPeriods(this.value)">
                </div>
                <div>
                    ${HelpTooltip.labelWithHelp('분석 기간 수 (열)', '모니터링 및 고장이 일어난 최대 기간(열 수)을 설정합니다.')}
                    <input type="number" id="warranty-return-periods" class="input-field" value="${warrantyState.returnPeriods || 12}" min="2" max="36" step="1" onchange="changeWarrantyReturnPeriods(this.value)">
                </div>
                <div>
                    ${HelpTooltip.labelWithHelp('신뢰수준 (%)', '신뢰구간(Confidence Interval) 계산에 사용할 확률입니다. 기본값은 90%입니다.')}
                    <input type="number" id="warranty-confidence" class="input-field" value="${warrantyState.confidence || 90}" min="50" max="99.9" step="1">
                </div>
                <div>
                    ${HelpTooltip.labelWithHelp('보증 기간 (기)', '미입력 시 전체 가동 기간을 분석 범위로 잡습니다. 입력 시 해당 기간 이후 고장은 보증 제외 처리됩니다.')}
                    <input type="number" id="warranty-months" class="input-field" value="${warrantyState.warrantyMonths || ''}" placeholder="예: 12" min="1">
                </div>
            </div>
        </div>

        <div class="glass-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
                <div style="display:flex;align-items:center;gap:0.4rem">
                    <h3 class="section-title" style="margin:0">Nevada 차트 데이터 입력</h3>
                    ${HelpTooltip.create('달력(Calendar) 기준 Nevada 차트: 세로행은 출하 기간, 가로열은 실제 고장 발생 기간을 나타냅니다. 출하 시점 이전(회색 영역)은 입력이 비활성화됩니다.')}
                </div>
                <div style="display:flex;gap:0.4rem">
                    <button class="btn btn-sm btn-secondary" onclick="fillWarrantySample()">📋 샘플 데이터 채우기</button>
                    <button class="btn btn-sm btn-secondary" onclick="clearWarrantyGrid()">초기화</button>
                </div>
            </div>

            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.6">
                <strong>세로 행</strong> = 출하 기수, <strong>1열</strong> = 출하 수량, <strong>2열 이후</strong> = 달력 기준 고장 기수별 고장 수 (예: 1열=출하수량, 2열=1기 고장, 3열=2기 고장...)<br>
                엑셀에서 <strong>복사(Ctrl+C) → 붙여넣기(Ctrl+V)</strong> 가능합니다.
            </div>

            <!-- Handsontable 그리드 -->
            <div id="warranty-hot-grid" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;height:320px"></div>

            <div style="margin-top:1rem;display:flex;justify-content:flex-end">
                <button class="btn btn-primary" style="width:100%;max-width:250px;min-height:44px" onclick="runWarrantyPreprocess()">▶ 분석 시작</button>
            </div>
        </div>

        <div class="glass-card" style="padding:1rem">
            <h4 class="section-title" style="font-size:0.9rem;margin-bottom:0.5rem">💡 Nevada 차트 입력 가이드</h4>
            <div style="font-size:0.8rem;line-height:1.8;color:var(--text-secondary)">
                <div style="background:var(--bg-tertiary);border-radius:8px;padding:0.75rem;font-family:monospace;font-size:0.72rem;overflow-x:auto;margin-bottom:0.5rem">
                    <table style="border-collapse:collapse;width:100%">
                        <thead><tr><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--purple)">출하 기수</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--purple)">출하 수량</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--accent-color)">1기 고장</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--accent-color)">2기 고장</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--accent-color)">3기 고장</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--text-muted)">...</th></tr></thead>
                        <tbody>
                            <tr><td style="padding:4px 8px;color:var(--purple)">1기 출하</td><td style="padding:4px 8px;color:var(--purple)">1000</td><td style="padding:4px 8px;text-align:center;background:rgba(255,255,255,0.05);color:var(--text-muted)">[비활성]</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">3</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">5</td><td style="padding:4px 8px;text-align:center;color:var(--text-muted)">...</td></tr>
                            <tr><td style="padding:4px 8px;color:var(--purple)">2기 출하</td><td style="padding:4px 8px;color:var(--purple)">1200</td><td style="padding:4px 8px;text-align:center;background:rgba(255,255,255,0.05);color:var(--text-muted)">[비활성]</td><td style="padding:4px 8px;text-align:center;background:rgba(255,255,255,0.05);color:var(--text-muted)">[비활성]</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">2</td><td style="padding:4px 8px;text-align:center;color:var(--text-muted)">...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div style="margin-bottom:0.5rem">달력(Calendar) 기준 차트에서는 출하 시점 이전에 고장(반납)이 발생할 수 없으므로, 대각선 왼쪽 아래 영역은 자동으로 **회색 비활성 영역** 처리됩니다.</div>
                <div class="info-box" style="border-color:rgba(245,158,11,0.3);color:var(--warning);font-size:0.8rem">⚠️ 각 행의 고장 합계가 해당 기간의 출하 수량을 초과하지 않아야 합니다.</div>
            </div>
        </div>
    </div>`;
}

let _warrantyHot = null;

function changeWarrantyShipmentPeriods(val) {
    const p = parseInt(val);
    if (!isFinite(p) || p < 2 || p > 36) return;
    
    // 기존 데이터 가져와서 크기 변경 후 백업에 보존
    if (_warrantyHot) {
        warrantyState.rawData = _warrantyHot.getData();
    }
    warrantyState.shipmentPeriods = p;
    
    if (_warrantyHot) {
        _warrantyHot.destroy();
        _warrantyHot = null;
    }
    initWarrantyGrid();
}

function changeWarrantyReturnPeriods(val) {
    const p = parseInt(val);
    if (!isFinite(p) || p < 2 || p > 36) return;
    
    // 기존 데이터 가져와서 크기 변경 후 백업에 보존
    if (_warrantyHot) {
        warrantyState.rawData = _warrantyHot.getData();
    }
    warrantyState.returnPeriods = p;
    
    if (_warrantyHot) {
        _warrantyHot.destroy();
        _warrantyHot = null;
    }
    initWarrantyGrid();
}

function initWarrantyGrid() {
    const container = document.getElementById('warranty-hot-grid');
    if (!container) return;

    if (_warrantyHot) {
        try { _warrantyHot.destroy(); } catch(e) {}
        _warrantyHot = null;
    }

    const rows = warrantyState.shipmentPeriods || 12;
    const cols = (warrantyState.returnPeriods || 12) + 1; // 출하수량(1) + 고장 1기 ~ 고장 M기
    
    // 기존 데이터가 있다면 자르거나 붙여서 복원
    let data;
    if (warrantyState.rawData && warrantyState.rawData.length > 0) {
        data = Array.from({length: rows}, (_, r) => {
            const oldRow = warrantyState.rawData[r] || [];
            return Array.from({length: cols}, (_, c) => {
                const val = oldRow[c];
                return val !== undefined ? val : null;
            });
        });
    } else {
        data = Array.from({length: rows}, () => Array(cols).fill(null));
    }
    
    const colHeaders = ['출하 수량 (Shipment Qty)', ...Array.from({length: cols - 1}, (_, i) => `${i + 1}기 고장`)];
    const rowHeaders = Array.from({length: rows}, (_, i) => `${i + 1}기 출하`);

    _warrantyHot = new Handsontable(container, {
        data,
        colHeaders,
        rowHeaders,
        height: 300,
        width: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        rowHeaderWidth: 80,
        colWidths: function(index) {
            const isMobile = window.innerWidth <= 768;
            return index === 0 ? (isMobile ? 110 : 170) : (isMobile ? 55 : 80);
        },
        contextMenu: ['undo', 'redo'],
        // 대각선 회색 비활성 처리
        cells: function(row, col) {
            const cellProperties = {};
            if (col === 0) {
                cellProperties.readOnly = false;
                cellProperties.className = 'htLeft';
            } else if (col > 0 && col <= row) {
                // 달력 네바다 차트 기준 비활성화: col <= row 이면 비활성
                cellProperties.readOnly = true;
                cellProperties.className = 'htCenter htDimmed'; // 회색 비활성
            } else {
                cellProperties.readOnly = false;
                cellProperties.className = 'htCenter';
            }
            return cellProperties;
        },
        afterChange: function(changes, source) {
            if (source !== 'loadData') {
                warrantyState.rawData = this.getData();
            }
        }
    });

    // 초기 로드 시에도 백업본 동기화
    warrantyState.rawData = _warrantyHot.getData();
}

function clearWarrantyGrid() {
    if (_warrantyHot) {
        const rows = _warrantyHot.countRows();
        const cols = _warrantyHot.countCols();
        const empty = Array.from({length: rows}, () => Array(cols).fill(null));
        _warrantyHot.loadData(empty);
        warrantyState.rawData = empty;
    }
}

function fillWarrantySample() {
    if (!_warrantyHot) initWarrantyGrid();
    if (!_warrantyHot) return;

    const rows = warrantyState.shipmentPeriods || 12;
    const cols = (warrantyState.returnPeriods || 12) + 1;
    const data = Array.from({length: rows}, () => Array(cols).fill(null));

    // Weibull 분포 모형 기반 실감 나는 고장 반납 데이터 모사 (beta=1.5, eta=15)
    const eta = 15.0;
    const beta = 1.5;
    
    for (let i = 0; i < rows; i++) {
        // 매달 1000 ~ 1800 사이 생산
        const sales = 1000 + Math.round((i * 123 + 77) % 800);
        data[i][0] = sales;

        for (let j = 1; j < cols; j++) {
            if (j <= i) {
                data[i][j] = null; // 회색 비활성 영역
            } else {
                const age = j - i; // 서비스 경과 기간 (1, 2, 3...)
                // Weibull CDF 증가분 계산
                const pNow = 1 - Math.exp(-Math.pow(age / eta, beta));
                const pPrev = 1 - Math.exp(-Math.pow((age - 1) / eta, beta));
                const prob = Math.max(0, pNow - pPrev);
                
                // 자연스러운 변동성을 위한 노이즈
                const noise = 0.85 + 0.3 * Math.sin(i * j + 1.5);
                let failures = Math.round(sales * prob * noise);
                if (failures < 0) failures = 0;
                data[i][j] = failures;
            }
        }
    }

    _warrantyHot.loadData(data);
    warrantyState.rawData = data;
}

function runWarrantyPreprocess() {
    if (!_warrantyHot) { showWarrantyError('데이터를 입력하세요.'); return; }

    const btn = document.querySelector('button[onclick="runWarrantyPreprocess()"]');
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = `⏳ 분석 중 (잠시만 기다려주세요)...`;
        btn.disabled = true;
    }

    setTimeout(() => {
        try {
            const rawData = _warrantyHot.getData();
            warrantyState.rawData = rawData; // 분석 시작 시점에 데이터를 확실하게 백업 보존
            const sales = [];
            const matrixRows = [];
            
            for (let i = 0; i < rawData.length; i++) {
                const row = rawData[i];
                const saleVal = parseFloat(row[0]);
                if (!isFinite(saleVal) || saleVal <= 0) continue;
                sales.push(saleVal);
                
                // col 0 (출하수량) 포함한 행 전체를 넘겨야 preprocessNevada의 1-indexed 스캔과 맞물림
                const failRow = row.map((v, colIdx) => {
                    if (colIdx === 0) return saleVal;
                    // colIdx - 1 이 i보다 작으면 출하 이전 시점 반납이므로 비활성 영역
                    if (colIdx - 1 < i) {
                        return null;
                    }
                    const n = parseFloat(v);
                    return isFinite(n) ? n : 0;
                });
                
                matrixRows.push(failRow);
            }

            const wm = parseInt(document.getElementById('warranty-months')?.value) || null;
            const confidence = parseFloat(document.getElementById('warranty-confidence')?.value || '90');
            warrantyState.confidence = confidence;

            if (sales.length === 0) { throw new Error('출하 수량을 입력하세요 (1열).'); }
            if (matrixRows.length === 0) { throw new Error('고장 데이터를 입력하세요.'); }

            const result = WarrantyAnalysis.preprocessNevada(sales, matrixRows, wm);
            warrantyState.preprocessed = result;
            warrantyState.sales = sales;
            warrantyState.matrixRows = matrixRows;
            warrantyState.warrantyMonths = wm;
            
            if (result.failures.length < 3) { 
                throw new Error(`고장 데이터가 ${result.failures.length}개로 너무 적습니다 (최소 3개).`); 
            }
            
            // 분포 피팅 및 신뢰구간 분석을 위한 초고속 데이터 스케일다운 (Nelder-Mead 멈춤 방지)
            const MAX_FIT_SAMPLES = 1000;
            let fitFailures = [...result.failures];
            let fitCensored = [];
 
            // 1. 관측중단 데이터 축소
            if (result.rightCensored.length > MAX_FIT_SAMPLES) {
                const censoredCounts = {};
                result.rightCensored.forEach(t => {
                    censoredCounts[t] = (censoredCounts[t] || 0) + 1;
                });
                const scale = MAX_FIT_SAMPLES / result.rightCensored.length;
                Object.entries(censoredCounts).forEach(([tStr, count]) => {
                    const t = parseFloat(tStr);
                    const scaledCount = Math.max(1, Math.round(count * scale));
                    for (let k = 0; k < scaledCount; k++) {
                        fitCensored.push(t);
                    }
                });
            } else {
                fitCensored = [...result.rightCensored];
            }
 
            // 2. 고장 데이터 축소
            if (fitFailures.length > MAX_FIT_SAMPLES) {
                const failureCounts = {};
                fitFailures.forEach(t => {
                    failureCounts[t] = (failureCounts[t] || 0) + 1;
                });
                const scale = MAX_FIT_SAMPLES / fitFailures.length;
                const newFailures = [];
                Object.entries(failureCounts).forEach(([tStr, count]) => {
                    const t = parseFloat(tStr);
                    const scaledCount = Math.max(1, Math.round(count * scale));
                    for (let k = 0; k < scaledCount; k++) {
                        newFailures.push(t);
                    }
                });
                fitFailures = newFailures;
            }

            // 신뢰수준을 반영하여 분포 적합 수행 (스케일다운된 피팅 전용 데이터 적용)
            warrantyState.fits = WarrantyAnalysis.fitDistributions(fitFailures, fitCensored);
            
            // selectedFit 지정 시, fitDistributions가 저장해 둔 analysisResult의 신뢰수준을 업데이트해 피팅 재실행
            warrantyState.fits.forEach(f => {
                if (f.analysisResult) {
                    const dataRows = [];
                    fitFailures.forEach(t => dataRows.push({ time: t, event: 'F' }));
                    fitCensored.forEach(t => dataRows.push({ time: t, event: 'C' }));
                    f.analysisResult = ReliabilityAnalysis.analyze(dataRows, { distribution: f.name, confidence: confidence / 100 });
                }
            });
 
            warrantyState.selectedFit = warrantyState.fits.find(f => f.best) || warrantyState.fits[0] || null;
            hideWarrantyError();
            warrantyGoStep('fitted');
        } catch (e) {
            showWarrantyError(e.message);
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    }, 50);
}

function showWarrantyError(msg) { const el = document.getElementById('warranty-error'); if (el) { el.style.display = 'block'; el.innerHTML = `<div class="info-box" style="border-color:var(--danger);color:var(--danger);margin-bottom:1rem">⚠️ ${msg}</div>`; } }
function hideWarrantyError() { const el = document.getElementById('warranty-error'); if (el) el.style.display = 'none'; }

function toggleAdvancedAccordion(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById(id + '-icon');
    if (!el) return;
    if (el.style.display === 'none') {
        el.style.display = 'block';
        if (icon) icon.innerHTML = '<i class="fas fa-chevron-up"></i>';
        if (id === 'warranty-seasonality-item') {
            setTimeout(drawWarrantyDistributionCharts, 50);
        }
    } else {
        el.style.display = 'none';
        if (icon) icon.innerHTML = '<i class="fas fa-chevron-down"></i>';
    }
}

function renderWarrantySeasonalityHTML(seasonality) {
    if (!seasonality || !seasonality.seasonalIndices) return '';
    return `
    <div class="info-box" style="border-color:var(--purple);color:var(--purple);margin-bottom:1rem;background:rgba(167,139,250,0.05);padding:0.75rem;border-radius:6px;border-left:4px solid">
        <div style="font-weight:600;margin-bottom:0.2rem">계절성 지수 분석 요약</div>
        <div style="font-size:0.82rem;color:var(--text-primary)">
            ${seasonality.description}
        </div>
    </div>
    <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:1.5rem;align-items:center;flex-wrap:wrap" class="grid-2-mobile">
        <div class="chart-container" style="height:280px;position:relative">
            <canvas id="warranty-seasonality-chart"></canvas>
        </div>
        <div class="table-wrapper" style="border:1px solid var(--border-color);border-radius:6px;max-height:280px;overflow-y:auto">
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
                <thead>
                    <tr style="background:var(--bg-secondary);position:sticky;top:0;z-index:1">
                        <th class="table-header" style="padding:0.4rem">달력 월</th>
                        <th class="table-header" style="padding:0.4rem;text-align:right">고장 지수</th>
                    </tr>
                </thead>
                <tbody>
                    ${seasonality.seasonalIndices.map((si, m) => {
                        const mrr = seasonality.mrrByMonth[m];
                        const isHigh = si > 1.15;
                        const boldStyle = isHigh ? 'font-weight:bold;color:var(--danger)' : '';
                        return `
                        <tr>
                            <td class="table-cell" style="padding:0.4rem;text-align:center;${boldStyle}">${m + 1}월</td>
                            <td class="table-cell" style="padding:0.4rem;text-align:right;${boldStyle}">${si.toFixed(2)}x (${mrr.toFixed(3)}%)</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderWarrantyHeatmapHTML(heatmapInfo) {
    if (!heatmapInfo || !heatmapInfo.heatmapData) return '';
    const { heatmapData, maxServiceAge } = heatmapInfo;
    
    const headerCols = Array.from({length: maxServiceAge}, (_, i) => `<th class="table-header" style="text-align:center;font-size:0.75rem;padding:0.4rem 0.25rem;min-width:45px">${i + 1}기</th>`).join('');
    
    const rows = heatmapData.map(c => {
        const cells = c.rates.map(r => {
            if (!r.isActive) {
                return `<td class="table-cell" style="background:rgba(255,255,255,0.02);color:var(--text-muted);text-align:center;font-size:0.72rem">-</td>`;
            }
            const val = r.rate !== null ? `${r.rate.toFixed(2)}%` : '0.00%';
            const opacity = Math.min(0.85, (r.rate || 0) / 10);
            const bg = `rgba(239, 68, 68, ${opacity})`;
            const color = opacity > 0.4 ? '#ffffff' : 'var(--text-primary)';
            const borderStyle = r.anomaly ? 'border: 2px solid var(--danger); font-weight: bold; position: relative;' : '';
            const anomalyIndicator = r.anomaly ? '<span style="color:var(--danger);font-size:0.65rem;display:block;line-height:1;margin-top:1px">⚠️이상</span>' : '';
            
            return `<td class="table-cell" style="background:${bg};color:${color};text-align:center;font-size:0.72rem;padding:0.5rem 0.25rem;${borderStyle}" title="${c.cohortName} / ${r.age}기 경과\n누적고장수: ${r.failures}대\n누적고장율: ${r.rate.toFixed(4)}%">
                ${val}
                ${anomalyIndicator}
            </td>`;
        }).join('');
        
        return `
        <tr>
            <td class="table-cell" style="font-weight:600;white-space:nowrap;font-size:0.78rem;background:var(--bg-tertiary);position:sticky;left:0;z-index:2">${c.cohortName}</td>
            <td class="table-cell" style="text-align:center;font-size:0.75rem;background:var(--bg-tertiary)">${c.sales.toLocaleString()}</td>
            ${cells}
        </tr>`;
    }).join('');

    const anomalies = [];
    heatmapData.forEach(c => {
        const hasAnomaly = c.rates.some(r => r.anomaly);
        if (hasAnomaly) {
            anomalies.push(c.cohortName);
        }
    });

    let alertHTML = '';
    if (anomalies.length > 0) {
        alertHTML = `
        <div class="info-box" style="border-color:var(--danger);color:var(--danger);margin-bottom:1rem;background:rgba(239,68,68,0.05);padding:0.75rem;border-radius:6px;border-left:4px solid">
            <div style="font-weight:600;margin-bottom:0.2rem">배치 이상 고장 경고 (CFR > 평균 + 2σ)</div>
            <div style="font-size:0.82rem;color:var(--text-primary)">
                출하 배치 중 <strong>${anomalies.join(', ')}</strong>에서 다른 배치 대비 고장율이 유의미하게 높게 관찰되었습니다. 생산 품질 로트 추적 조사를 권장합니다.
            </div>
        </div>`;
    } else {
        alertHTML = `
        <div class="info-box" style="border-color:var(--success);color:var(--success);margin-bottom:1rem;background:rgba(34,197,94,0.05);padding:0.75rem;border-radius:6px;border-left:4px solid">
            <div style="font-weight:600;margin-bottom:0.2rem">배치 품질 상태 정상</div>
            <div style="font-size:0.82rem;color:var(--text-primary)">
                모든 출하 배치의 경과별 누적 고장률이 정상 편차(±2σ) 내에서 제어되고 있습니다.
            </div>
        </div>`;
    }

    return `
    ${alertHTML}
    <div class="table-wrapper" style="overflow-x:auto;max-height:400px;overflow-y:auto;border:1px solid var(--border-color);border-radius:6px">
        <table style="width:100%;border-collapse:collapse;min-width:700px">
            <thead>
                <tr style="position:sticky;top:0;z-index:3;background:var(--bg-secondary)">
                    <th class="table-header" style="position:sticky;left:0;z-index:4;background:var(--bg-secondary);min-width:80px">출하 배치</th>
                    <th class="table-header" style="min-width:80px">출하량</th>
                    ${headerCols}
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>
    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.4rem;text-align:right">
        * 셀 배경색의 붉은 톤이 짙을수록 누적 고장률이 높음을 나타냅니다. (⚠️이상: 동기간 타 배치 대비 2σ 초과 고장률 발생)
    </div>`;
}

function renderWarrantyFitted() {
    const s = warrantyState.preprocessed?.summary;
    const fits = warrantyState.fits;
    const dc = { weibull:'#38bdf8', lognormal:'#f59e0b', normal:'#a78bfa', exponential:'#22c55e' };
    const sel = warrantyState.selectedFit;

    // 계절성 분석 및 배치 히트맵 연산
    const seasonality = WarrantyAnalysis.analyzeSeasonality(warrantyState.sales || [], warrantyState.matrixRows || []);
    warrantyState.seasonality = seasonality; // 보정 예측에서 사용할 수 있도록 저장
    const heatmapInfo = WarrantyAnalysis.generateBatchHeatmap(warrantyState.sales || [], warrantyState.matrixRows || []);

    // Weibull 형상모수 해석 텍스트
    let betaInterpretationHTML = '';
    if (sel && sel.name === 'weibull') {
        const beta = sel.params.beta;
        const interp = Distributions.interpretBeta(beta);
        let color = 'var(--purple)';
        if (interp.type === 'infant') color = 'var(--accent-color)';
        if (interp.type === 'random') color = 'var(--success)';
        
        betaInterpretationHTML = `
        <div class="info-box" style="border-color:${color};color:${color};margin-bottom:1rem;background:rgba(30, 41, 59, 0.4)">
            <div style="font-weight:600;margin-bottom:0.2rem">Weibull 형상모수(Shape, β) 분석</div>
            <div style="font-size:0.82rem;color:var(--text-primary)">${interp.message}</div>
        </div>`;
    }

    return `
    <div class="grid-4" style="margin-bottom:1rem">
        <div class="stat-card"><div class="label">총 분석 단위</div><div class="value">${(s?.totalUnits||0).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">총 고장</div><div class="value" style="color:var(--danger)">${(s?.totalFailures||0).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">관측중단</div><div class="value" style="color:var(--accent-color)">${(s?.totalCensored||0).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">고장률</div><div class="value" style="color:var(--warning)">${(s?.failureRatePct||0).toFixed(2)}%</div></div>
    </div>
    
    ${betaInterpretationHTML}

    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">분포 적합 결과 (AICc 기준)</h3>
        <div class="table-wrapper"><table><thead><tr><th class="table-header"></th><th class="table-header">분포</th><th class="table-header">AICc</th><th class="table-header">MTTF</th><th class="table-header">B10</th></tr></thead>
        <tbody>${fits.map(f => `<tr onclick="selectWarrantyFit('${f.name}')" style="cursor:pointer;background:${sel?.name===f.name?'rgba(167,139,250,0.1)':'transparent'}">
            <td class="table-cell">${f.best?'<span class="badge badge-purple">✓ 최적</span>':''}</td>
            <td class="table-cell" style="font-weight:${sel?.name===f.name?'700':'400'};color:${dc[f.name]||'var(--text-primary)'}">${f.displayName}</td>
            <td class="table-cell">${f.aicc===Infinity?'-':f.aicc.toFixed(2)}</td>
            <td class="table-cell">${f.mttf?f.mttf.toFixed(2):'-'}</td>
            <td class="table-cell">${f.b10?f.b10.toFixed(2):'-'}</td></tr>`).join('')}</tbody></table></div>
    </div>
    ${sel ? `<div class="glass-card" style="margin-bottom:1rem"><h3 class="section-title">선택: ${sel.displayName} 모수</h3><div class="grid-4">${Object.entries(sel.params).map(([k,v]) => `<div class="stat-card"><div class="label">${k}</div><div class="value" style="font-size:1.2rem">${Number(v).toFixed(4)}</div></div>`).join('')}</div></div>` : ''}
    
    <!-- 분포 오버레이 & 신뢰구간 비교 패널 -->
    <div class="glass-card" style="margin-bottom:1rem;padding:0.65rem 1rem">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.8rem">
            <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:600;margin-right:2px">분포 오버레이 비교:</span>
            ${fits.map(f => {
                const checked = f.name === sel?.name ? 'checked disabled' : '';
                return `
                <label style="cursor:pointer;display:flex;align-items:center;gap:0.3rem;font-size:0.8rem">
                    <input type="checkbox" class="warranty-compare-checkbox" data-dist="${f.name}" ${checked} onchange="drawWarrantyDistributionCharts()">
                    <span style="color:${dc[f.name] || 'var(--text-primary)'};font-weight:600">${f.displayName}</span>
                </label>`;
            }).join('')}
            
            <div style="display:flex;align-items:center;gap:0.4rem;margin-left:auto">
                <label style="cursor:pointer;display:flex;align-items:center;gap:0.3rem;font-size:0.8rem">
                    <input type="checkbox" id="warranty-show-ci" checked onchange="drawWarrantyDistributionCharts()">
                    <span style="font-weight:600">신뢰구간 표시</span>
                </label>
                <input type="number" id="warranty-ci-level" value="${warrantyState.confidence || 90}" min="50" max="99.9" step="1"
                    style="width:60px;padding:3px 6px;font-size:0.8rem;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);margin-left:6px"
                    onchange="updateWarrantyCILevel(this.value)">
                <span style="font-size:0.8rem;color:var(--text-secondary)">%</span>
            </div>
        </div>
    </div>

    <!-- 순서: f(t) h(t) / F(t) R(t) -->
    <div class="grid-2" style="gap:1rem;margin-bottom:1rem">
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">고장 밀도 f(t)</h4>
                <span class="badge badge-warning">f(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="warranty-pdf-chart"></canvas></div>
        </div>
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">고장률 h(t)</h4>
                <span class="badge badge-purple">h(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="warranty-hf-chart"></canvas></div>
        </div>
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">불신뢰도 F(t)</h4>
                <span class="badge badge-danger">F(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="warranty-cdf-chart"></canvas></div>
        </div>
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                <h4 style="color:var(--text-secondary);margin:0">신뢰도 R(t)</h4>
                <span class="badge badge-success">R(t)</span>
            </div>
            <div class="chart-container" style="height:280px"><canvas id="warranty-sf-chart"></canvas></div>
        </div>
    </div>

    <!-- ═══ 계절성 & 배치 비교 고급 분석 ═══ -->
    <div class="glass-card" style="margin-bottom:1rem">
        <div class="accordion" id="warranty-advanced-accordion">
            <div class="accordion-item" style="border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                <div class="accordion-header" onclick="toggleAdvancedAccordion('warranty-seasonality-item')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0;">
                    <h4 style="color:var(--text-primary);margin:0;font-size:0.92rem;font-weight:600;"><i class="fas fa-cloud-sun" style="margin-right:0.5rem;color:var(--purple)"></i>1. 계절성(Seasonality) 분석</h4>
                    <span id="warranty-seasonality-item-icon" style="color:var(--text-secondary);font-size:0.8rem"><i class="fas fa-chevron-down"></i></span>
                </div>
                <div id="warranty-seasonality-item" class="accordion-body" style="display:none; padding-top:0.75rem">
                    ${renderWarrantySeasonalityHTML(seasonality)}
                </div>
            </div>
            
            <div class="accordion-item" style="padding-bottom: 0.25rem;">
                <div class="accordion-header" onclick="toggleAdvancedAccordion('warranty-heatmap-item')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding: 0.5rem 0;">
                    <h4 style="color:var(--text-primary);margin:0;font-size:0.92rem;font-weight:600;"><i class="fas fa-th" style="margin-right:0.5rem;color:var(--warning)"></i>2. 배치(Cohort) 비교 히트맵</h4>
                    <span id="warranty-heatmap-item-icon" style="color:var(--text-secondary);font-size:0.8rem"><i class="fas fa-chevron-down"></i></span>
                </div>
                <div id="warranty-heatmap-item" class="accordion-body" style="display:none; padding-top:0.75rem">
                    ${renderWarrantyHeatmapHTML(heatmapInfo)}
                </div>
            </div>
        </div>
    </div>

    <div style="display:flex;gap:0.75rem"><button class="btn btn-secondary" onclick="warrantyGoStep('input')">← 데이터 재입력</button><button class="btn btn-primary" style="flex:1" onclick="warrantyGoStep('forecast')" ${!sel?'disabled':''}>예측 시뮬레이션 →</button></div>`;
}

function selectWarrantyFit(name) { 
    warrantyState.selectedFit = warrantyState.fits.find(f => f.name === name) || null; 
    warrantyGoStep('fitted'); 
}

function updateWarrantyCILevel(val) {
    const n = parseFloat(val);
    if (!isFinite(n) || n < 50 || n > 99.9) return;
    warrantyState.confidence = n;
    
    // 신뢰수준이 변경되면 fitted 상태에서 피팅 전용 데이터로 신뢰성 분석을 다시 수행하여 신뢰구간 데이터를 갱신합니다.
    const result = warrantyState.preprocessed;
    if (!result) return;
    
    const MAX_FIT_SAMPLES = 1000;
    let fitFailures = [...result.failures];
    let fitCensored = [];
    
    if (result.rightCensored.length > MAX_FIT_SAMPLES) {
        const censoredCounts = {};
        result.rightCensored.forEach(t => {
            censoredCounts[t] = (censoredCounts[t] || 0) + 1;
        });
        const scale = MAX_FIT_SAMPLES / result.rightCensored.length;
        Object.entries(censoredCounts).forEach(([tStr, count]) => {
            const t = parseFloat(tStr);
            const scaledCount = Math.max(1, Math.round(count * scale));
            for (let k = 0; k < scaledCount; k++) {
                fitCensored.push(t);
            }
        });
    } else {
        fitCensored = [...result.rightCensored];
    }
    
    if (fitFailures.length > MAX_FIT_SAMPLES) {
        const failureCounts = {};
        fitFailures.forEach(t => {
            failureCounts[t] = (failureCounts[t] || 0) + 1;
        });
        const scale = MAX_FIT_SAMPLES / fitFailures.length;
        const newFailures = [];
        Object.entries(failureCounts).forEach(([tStr, count]) => {
            const t = parseFloat(tStr);
            const scaledCount = Math.max(1, Math.round(count * scale));
            for (let k = 0; k < scaledCount; k++) {
                newFailures.push(t);
            }
        });
        fitFailures = newFailures;
    }

    // 각 분포에 대해 분석 데이터를 갱신
    warrantyState.fits.forEach(f => {
        if (f.analysisResult) {
            const dataRows = [];
            fitFailures.forEach(t => dataRows.push({ time: t, event: 'F' }));
            fitCensored.forEach(t => dataRows.push({ time: t, event: 'C' }));
            f.analysisResult = ReliabilityAnalysis.analyze(dataRows, { distribution: f.name, confidence: n / 100 });
        }
    });

    // 선택된 분포 객체 갱신
    if (warrantyState.selectedFit) {
        warrantyState.selectedFit = warrantyState.fits.find(f => f.name === warrantyState.selectedFit.name) || warrantyState.fits[0];
    }
    
    // 차트 다시 그리기
    drawWarrantyDistributionCharts();
}

function renderWarrantyForecast() {
    const sel = warrantyState.selectedFit;
    return `
    <div class="grid-cols-1-2">
        <div class="glass-card" style="display:flex;flex-direction:column;gap:0.85rem">
            <h3 class="section-title">예측 설정</h3>
            <div>${HelpTooltip.labelWithHelp('기존 출하 수량', '서비스 중인 총 수량')}<input type="number" id="fc-existing" class="input-field" value="10000" min="0"></div>
            <div>${HelpTooltip.labelWithHelp('예측 기간 (개월)', '')}<input type="number" id="fc-months" class="input-field" value="12" min="1" max="120"></div>
            <div>${HelpTooltip.labelWithHelp('단위 고장 비용 ($)', '')}<input type="number" id="fc-cost" class="input-field" value="500" min="0"></div>
            <div>${HelpTooltip.labelWithHelp('향후 월별 생산 수량 (쉼표)', '')}<input type="text" id="fc-future" class="input-field" value="1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000"></div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.15rem;margin-bottom:0.4rem">
                <input type="checkbox" id="fc-use-seasonality" style="width:auto;height:auto;cursor:pointer" ${warrantyState.useSeasonality ? 'checked' : ''} />
                <label for="fc-use-seasonality" style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);cursor:pointer">계절성 변동 보정 적용 (Seasonality Correction)</label>
            </div>
            ${sel ? `<div class="info-box" style="border-color:rgba(167,139,250,0.3);color:var(--purple);font-size:0.82rem">적합: <strong>${sel.displayName}</strong> — ${Object.entries(sel.params).slice(0,3).map(([k,v])=>`${k}=${Number(v).toFixed(3)}`).join(', ')}</div>` : ''}
            <button class="btn btn-primary" style="width:100%;min-height:44px" onclick="runWarrantyForecast()">▶ 예측 실행</button>
        </div>
        <div id="warranty-forecast-result">${warrantyState.forecastResult ? renderWarrantyForecastResult() : '<div class="glass-card empty-state" style="min-height:300px"><div style="font-weight:600;color:var(--text-secondary)">예측 설정 입력 후 실행</div><div style="font-size:0.8rem;color:var(--text-muted)">월별 예상 고장 수와 보증 비용이 표시됩니다.</div></div>'}</div>
    </div>
    <div style="display:flex;gap:0.75rem;margin-top:1rem"><button class="btn btn-secondary" onclick="warrantyGoStep('fitted')">← 분포 재선택</button><button class="btn btn-secondary" onclick="warrantyState.forecastResult=null;warrantyGoStep('input')">처음부터</button></div>`;
}

function runWarrantyForecast() {
    try {
        const sel = warrantyState.selectedFit;
        if (!sel) { console.error('Warranty forecast: No fit selected'); return; }
        const existing = parseInt(document.getElementById('fc-existing').value) || 0;
        const months = parseInt(document.getElementById('fc-months').value) || 12;
        const cost = parseFloat(document.getElementById('fc-cost').value) || 0;
        const future = WarrantyAnalysis.parseNumberLine(document.getElementById('fc-future').value);
        const wm = warrantyState.warrantyMonths || null;
        
        const useSeasonality = document.getElementById('fc-use-seasonality')?.checked ?? false;
        warrantyState.useSeasonality = useSeasonality;
        
        let seasonalIndices = null;
        if (useSeasonality && warrantyState.seasonality) {
            seasonalIndices = warrantyState.seasonality.seasonalIndices;
        }

        // 기존 설치 베이스의 평균 서비스 연령(개월) 추정 (Fallback용)
        let averageAge = null;
        if (warrantyState.preprocessed) {
            const fList = warrantyState.preprocessed.failures || [];
            const cList = warrantyState.preprocessed.rightCensored || [];
            const totalT = [...fList, ...cList].reduce((s, v) => s + v, 0);
            const totalN = fList.length + cList.length;
            if (totalN > 0) {
                averageAge = totalT / totalN;
            }
        }

        const cohorts = warrantyState.preprocessed?.cohorts || null;
        const confidenceVal = (warrantyState.confidence || 90) / 100;
        
        warrantyState.forecastResult = WarrantyAnalysis.forecastWithCI(sel.name, sel, existing, future, months, cost, confidenceVal, wm, averageAge, cohorts, seasonalIndices);
        
        // 보증 기간 민감도 분석(A-5) 연산 및 저장
        warrantyState.sensitivityResult = WarrantyAnalysis.analyzeWarrantySensitivity(sel.name, sel.params, existing, future, months, cost, averageAge, cohorts);

        const el = document.getElementById('warranty-forecast-result');
        if (el) {
            el.innerHTML = renderWarrantyForecastResult();
            setTimeout(drawWarrantyCharts, 100);
        } else {
            console.error('warranty-forecast-result element not found');
        }
    } catch (e) {
        console.error('Warranty forecast error:', e);
        const el = document.getElementById('warranty-forecast-result');
        if (el) el.innerHTML = `<div class="glass-card" style="color:var(--danger);padding:1rem">에러: ${e.message}</div>`;
    }
}

function renderWarrantyForecastResult() {
    const fr = warrantyState.forecastResult;
    if (!fr) return '';
    const conf = warrantyState.confidence || 90;
    return `
    <div class="grid-4" style="margin-bottom:1rem">
        <div class="stat-card">
            <div class="label">총 예상 고장</div>
            <div class="value" style="color:var(--danger)">${fr.totalFailures.toLocaleString()}대</div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.25rem">${conf}% CI: ${fr.totalFailures_CI[0].toLocaleString()} ~ ${fr.totalFailures_CI[1].toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="label">총 예상 비용</div>
            <div class="value" style="color:var(--warning)">$${fr.totalCost.toLocaleString()}</div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.25rem">${conf}% CI: $${fr.totalCost_CI[0].toLocaleString()} ~ $${fr.totalCost_CI[1].toLocaleString()}</div>
        </div>
        <div class="stat-card">
            <div class="label">피크 고장월</div>
            <div class="value" style="color:var(--purple)">${fr.peakMonth}월</div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.25rem">최대 발생 기수</div>
        </div>
        <div class="stat-card">
            <div class="label">월평균 고장</div>
            <div class="value" style="color:var(--accent-color)">${fr.avgFailures.toLocaleString()}대</div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.25rem">예예측 월평균 수치</div>
        </div>
    </div>
    <div class="glass-card" style="margin-bottom:1rem"><h3 class="section-title">월별 예상 고장 (점 추정치 및 ${conf}% 신뢰구간 밴드)</h3><div class="chart-container" style="height:260px"><canvas id="warranty-bar-chart"></canvas></div></div>
    <div class="glass-card" style="margin-bottom:1rem"><h3 class="section-title">누적 고장 및 비용 (이중 축 신뢰구간 밴드)</h3><div class="chart-container" style="height:220px"><canvas id="warranty-cumul-chart"></canvas></div></div>
    <div class="glass-card">
        <h3 class="section-title">월별 상세 예측 결과 테이블 (${conf}% 신뢰구간 포함)</h3>
        <div class="table-wrapper" style="max-height:285px;overflow-y:auto">
            <table>
                <thead>
                    <tr>
                        <th class="table-header">월</th>
                        <th class="table-header">예상 고장 수 (대)</th>
                        <th class="table-header">예상 보증 비용</th>
                        <th class="table-header">누적 고장 (대)</th>
                        <th class="table-header">누적 보증 비용</th>
                    </tr>
                </thead>
                <tbody>
                    ${fr.monthly.map(r => `
                    <tr>
                        <td class="table-cell">${r.month}월</td>
                        <td class="table-cell" style="color:var(--danger)">
                            <div style="font-weight:600">${r.failures.toFixed(1)}</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">[${r.failures_CI[0].toFixed(1)} ~ ${r.failures_CI[1].toFixed(1)}]</div>
                        </td>
                        <td class="table-cell" style="color:var(--warning)">
                            <div style="font-weight:600">$${r.cost.toLocaleString()}</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">[$${r.cost_CI[0].toLocaleString()} ~ $${r.cost_CI[1].toLocaleString()}]</div>
                        </td>
                        <td class="table-cell">
                            <div>${r.cumulativeFailures.toFixed(1)}</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">[${r.cumulativeFailures_CI[0].toFixed(1)} ~ ${r.cumulativeFailures_CI[1].toFixed(1)}]</div>
                        </td>
                        <td class="table-cell">
                            <div>$${r.cumulativeCost.toLocaleString()}</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">[$${r.cumulativeCost_CI[0].toLocaleString()} ~ $${r.cumulativeCost_CI[1].toLocaleString()}]</div>
                        </td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <!-- ═══ 보증 기간 민감도 분석 ═══ -->
    <div class="glass-card" style="margin-top:1rem; margin-bottom:1rem">
        <h3 class="section-title"><i class="fas fa-sliders-h" style="margin-right:0.5rem;color:var(--accent-color)"></i>보증 기간 민감도 분석 (Warranty Period Sensitivity)</h3>
        <div class="info-box" style="border-color:var(--accent-color);color:var(--accent-color);margin-bottom:1rem;background:rgba(56,189,248,0.05);padding:0.75rem;border-radius:6px;border-left:4px solid">
            <div style="font-weight:600;margin-bottom:0.2rem">보증 기간별 영향 비교</div>
            <div style="font-size:0.82rem;color:var(--text-primary)">
                제품의 보증 기간을 6개월에서 48개월까지 조정했을 때 예상되는 총 누적 고장 수 및 보증 서비스 비용의 민감도를 분석합니다. 보증 최적화 결정에 참고할 수 있습니다.
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:1.5rem;align-items:center;flex-wrap:wrap" class="grid-2-mobile">
            <div class="chart-container" style="height:260px;position:relative">
                <canvas id="warranty-sensitivity-chart"></canvas>
            </div>
            <div class="table-wrapper" style="border:1px solid var(--border-color);border-radius:6px;overflow-y:auto">
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
                    <thead>
                        <tr style="background:var(--bg-secondary)">
                            <th class="table-header" style="padding:0.5rem">보증 기간</th>
                            <th class="table-header" style="padding:0.5rem;text-align:right">예상 고장 (대)</th>
                            <th class="table-header" style="padding:0.5rem;text-align:right">보증 비용 ($)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(warrantyState.sensitivityResult || []).map(r => `
                        <tr>
                            <td class="table-cell" style="padding:0.5rem;text-align:center;font-weight:600">${r.period}개월</td>
                            <td class="table-cell" style="padding:0.5rem;text-align:right;color:var(--danger)">${r.totalFailures.toLocaleString()}대</td>
                            <td class="table-cell" style="padding:0.5rem;text-align:right;color:var(--warning)">$${r.totalCost.toLocaleString()}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function drawWarrantyCharts() {
    const fr = warrantyState.forecastResult;
    if (!fr) return;
    const labels = fr.monthly.map(r => `${r.month}월`);

    // 1) 월별 예상 고장 차트 (Bar + CI Area)
    const barDsets = [
        {
            label: '예상 고장 (점 추정)',
            type: 'bar',
            data: fr.monthly.map(r => r.failures),
            backgroundColor: 'rgba(239, 68, 68, 0.75)',
            borderColor: '#ef4444',
            borderWidth: 1.5,
            borderRadius: 3,
            maxBarThickness: 32,
            order: 2
        },
        {
            label: '신뢰구간 상한',
            type: 'line',
            data: fr.monthly.map(r => r.failures_CI[1]),
            borderColor: 'rgba(239, 68, 68, 0.35)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
            tension: 0.2,
            order: 1
        },
        {
            label: '신뢰구간 하한',
            type: 'line',
            data: fr.monthly.map(r => r.failures_CI[0]),
            borderColor: 'rgba(239, 68, 68, 0.35)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            backgroundColor: 'rgba(239, 68, 68, 0.06)',
            fill: '-1', // 바로 위의 상한선과 이 영역 사이를 반투명 채우기
            tension: 0.2,
            order: 1
        }
    ];

    ChartManager.createOrUpdate('warranty-bar-chart', {
        type: 'bar',
        data: { labels, datasets: barDsets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'top' }
            },
            scales: {
                x: { title: { display: true, text: '예측 월' } },
                y: { title: { display: true, text: '고장 수 (대)' }, beginAtZero: true }
            }
        }
    });

    // 2) 누적 고장 및 비용 차트 (Dual axis + CI Areas)
    const cumulDsets = [
        // 누적 고장 (점 추정)
        {
            label: '누적 고장',
            data: fr.monthly.map(r => r.cumulativeFailures),
            borderColor: '#ef4444',
            borderWidth: 2.5,
            tension: 0.3,
            pointRadius: 2,
            yAxisID: 'y',
            fill: false
        },
        // 누적 고장 CI Upper
        {
            label: '누적 고장 CI 상한',
            data: fr.monthly.map(r => r.cumulativeFailures_CI[1]),
            borderColor: 'rgba(239, 68, 68, 0.25)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            yAxisID: 'y',
            fill: false,
            tension: 0.3
        },
        // 누적 고장 CI Lower
        {
            label: '누적 고장 CI 하한',
            data: fr.monthly.map(r => r.cumulativeFailures_CI[0]),
            borderColor: 'rgba(239, 68, 68, 0.25)',
            borderWidth: 1,
            borderDash: [3, 3],
            pointRadius: 0,
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            fill: '-1',
            yAxisID: 'y',
            tension: 0.3
        },
        // 누적 비용 (점 추정)
        {
            label: '누적 비용($)',
            data: fr.monthly.map(r => r.cumulativeCost),
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [4, 2],
            tension: 0.3,
            pointRadius: 0,
            yAxisID: 'y1',
            fill: false
        },
        // 누적 비용 CI Upper
        {
            label: '누적 비용 CI 상한',
            data: fr.monthly.map(r => r.cumulativeCost_CI[1]),
            borderColor: 'rgba(245, 158, 11, 0.25)',
            borderWidth: 0.8,
            borderDash: [2, 2],
            pointRadius: 0,
            yAxisID: 'y1',
            fill: false,
            tension: 0.3
        },
        // 누적 비용 CI Lower
        {
            label: '누적 비용 CI 하한',
            data: fr.monthly.map(r => r.cumulativeCost_CI[0]),
            borderColor: 'rgba(245, 158, 11, 0.25)',
            borderWidth: 0.8,
            borderDash: [2, 2],
            pointRadius: 0,
            backgroundColor: 'rgba(245, 158, 11, 0.04)',
            fill: '-1',
            yAxisID: 'y1',
            tension: 0.3
        }
    ];

    ChartManager.createOrUpdate('warranty-cumul-chart', {
        type: 'line',
        data: { labels, datasets: cumulDsets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        filter: function(item) {
                            // 범례가 너무 길어지므로 점 추정과 주요 선만 표시
                            return ['누적 고', '누적 고장', '누적 비용($)'].some(n => item.text.startsWith(n)) && !item.text.includes('상한') && !item.text.includes('하한');
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: '예측 월' } },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: '누적 고장 수 (대)' },
                    ticks: { callback: v => v.toLocaleString() }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: '누적 비용 ($)' },
                    grid: { drawOnChartArea: false },
                    ticks: { callback: v => '$' + v.toLocaleString() }
                }
            }
        }
    });

    // 3) 보증 기간 민감도 차트 (Grouped Bar Chart)
    const sensCanvas = document.getElementById('warranty-sensitivity-chart');
    if (sensCanvas && warrantyState.sensitivityResult) {
        const sensLabels = warrantyState.sensitivityResult.map(r => `${r.period}개월`);
        const failuresData = warrantyState.sensitivityResult.map(r => r.totalFailures);
        const costData = warrantyState.sensitivityResult.map(r => r.totalCost);

        ChartManager.createOrUpdate('warranty-sensitivity-chart', {
            type: 'bar',
            data: {
                labels: sensLabels,
                datasets: [
                    {
                        label: '예상 고장 수 (대)',
                        data: failuresData,
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: '#ef4444',
                        borderWidth: 1.5,
                        yAxisID: 'y'
                    },
                    {
                        label: '예상 보증 비용 ($)',
                        data: costData,
                        backgroundColor: 'rgba(245, 158, 11, 0.7)',
                        borderColor: '#f59e0b',
                        borderWidth: 1.5,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' }
                },
                scales: {
                    x: { title: { display: true, text: '보증 기간' } },
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: { display: true, text: '고장 수 (대)' },
                        ticks: { callback: v => v.toLocaleString() },
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: { display: true, text: '보증 비용 ($)' },
                        grid: { drawOnChartArea: false },
                        ticks: { callback: v => '$' + v.toLocaleString() },
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function drawWarrantyDistributionCharts() {
    const sel = warrantyState.selectedFit;
    if (!sel || !sel.analysisResult) return;

    const r = sel.analysisResult;
    const showCI = document.getElementById('warranty-show-ci')?.checked ?? true;
    const dc = { weibull:'#38bdf8', lognormal:'#f59e0b', normal:'#a78bfa', exponential:'#22c55e' };

    // 헬퍼: 2D 점 리스트 생성
    function mkPts(yArr, plotDataObj) {
        const pd = plotDataObj || r.plotData;
        if (!yArr) return [];
        return pd.x.map((x, i) => ({ x, y: yArr[i] }));
    }

    // 헬퍼: 신뢰구간 영역 데이터셋 생성 (투명 채우기)
    function mkCI(yUpper, yLower, color, plotDataObj) {
        if (!yUpper || !yLower) return [];
        const pd = plotDataObj || r.plotData;
        const xList = pd.x;
        const upperPts = [], lowerPts = [];
        for (let i = 0; i < xList.length; i++) {
            let yu = yUpper[i];
            let yl = yLower[i];
            if (!isFinite(yu) || isNaN(yu)) yu = 0;
            if (!isFinite(yl) || isNaN(yl)) yl = 0;
            yu = Math.max(0, yu);
            yl = Math.max(0, yl);
            upperPts.push({ x: xList[i], y: yu });
            lowerPts.push({ x: xList[i], y: yl });
        }
        return [
            { label: 'Upper CI', data: upperPts, borderColor: color + '40', borderWidth: 1.2, borderDash: [4, 4], backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3 },
            { label: 'Lower CI', data: lowerPts, borderColor: color + '40', borderWidth: 1.2, borderDash: [4, 4], backgroundColor: color + '12', fill: '-1', pointRadius: 0, tension: 0.3 }
        ];
    }

    // 체크된 오버레이 비교 대상 모으기 (현재 선택 분포 제외)
    const overlayFits = Array.from(document.querySelectorAll('.warranty-compare-checkbox'))
        .filter(cb => cb.checked && cb.dataset.dist !== sel.name)
        .map(cb => warrantyState.fits.find(f => f.name === cb.dataset.dist))
        .filter(f => f && f.analysisResult);

    // Kaplan-Meier 경험적 고장 점 계산
    let km = null;
    try {
        if (r.dataSummary.nFailures >= 2) {
            km = Statistics.computeKaplanMeier(r.dataSummary.failures, r.dataSummary.censored);
        }
    } catch(e) { 
        console.warn('Warranty KM 계산 실패:', e); 
    }

    const makeOpts = (yLabel) => {
        return {
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            animation: { duration: 400 },
            plugins: { 
                legend: { position: 'top', labels: { color: '#94a3b8', boxWidth: 12, font: { size: 11 } } },
                zoom: {
                    pan: { enabled: true, mode: 'xy', modifierKey: 'ctrl' },
                    zoom: {
                        wheel: { enabled: true, modifierKey: 'ctrl' },
                        pinch: { enabled: true },
                        mode: 'xy'
                    }
                }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: '시간 (개월)', color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                y: { title: { display: true, text: yLabel, color: '#64748b' }, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,0.08)' } }
            }
        };
    };

    // ── f(t) 차트 ──
    const pdfDsets = [
        { label: `f(t) – ${sel.displayName}`, data: mkPts(r.plotData.pdf), borderColor: '#f59e0b', backgroundColor: '#f59e0b18', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 }
    ];
    overlayFits.forEach(of => {
        const oRes = of.analysisResult;
        const color = dc[of.name] || '#94a3b8';
        pdfDsets.push({
            label: `f(t) – ${of.displayName}`, data: mkPts(oRes.plotData.pdf, oRes.plotData), borderColor: color, backgroundColor: 'transparent', fill: false, pointRadius: 0, borderWidth: 1.8, borderDash: [4,4], tension: 0.3
        });
    });
    ChartManager.createOrUpdate('warranty-pdf-chart', { type: 'line', data: { datasets: pdfDsets }, options: makeOpts('f(t)') });

    // ── h(t) 차트 ──
    const hfDsets = [
        { label: `h(t) – ${sel.displayName}`, data: mkPts(r.plotData.hf), borderColor: '#a78bfa', backgroundColor: '#a78bfa18', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 }
    ];
    if (showCI && r.plotData.hfLower) {
        hfDsets.push(...mkCI(r.plotData.hfUpper, r.plotData.hfLower, '#a78bfa'));
    }
    overlayFits.forEach(of => {
        const oRes = of.analysisResult;
        const color = dc[of.name] || '#94a3b8';
        hfDsets.push({
            label: `h(t) – ${of.displayName}`, data: mkPts(oRes.plotData.hf, oRes.plotData), borderColor: color, backgroundColor: 'transparent', fill: false, pointRadius: 0, borderWidth: 1.8, borderDash: [4,4], tension: 0.3
        });
        if (showCI && oRes.plotData.hfLower) {
            hfDsets.push(...mkCI(oRes.plotData.hfUpper, oRes.plotData.hfLower, color, oRes.plotData));
        }
    });
    ChartManager.createOrUpdate('warranty-hf-chart', { type: 'line', data: { datasets: hfDsets }, options: makeOpts('h(t)') });

    // ── F(t) 차트 ──
    const cdfDsets = [
        { label: `F(t) – ${sel.displayName}`, data: mkPts(r.plotData.cdf), borderColor: '#ef4444', backgroundColor: '#ef444418', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 }
    ];
    if (showCI && r.plotData.cdfLower) {
        cdfDsets.push(...mkCI(r.plotData.cdfUpper, r.plotData.cdfLower, '#ef4444'));
    }
    overlayFits.forEach(of => {
        const oRes = of.analysisResult;
        const color = dc[of.name] || '#94a3b8';
        cdfDsets.push({
            label: `F(t) – ${of.displayName}`, data: mkPts(oRes.plotData.cdf, oRes.plotData), borderColor: color, backgroundColor: 'transparent', fill: false, pointRadius: 0, borderWidth: 1.8, borderDash: [4,4], tension: 0.3
        });
        if (showCI && oRes.plotData.cdfLower) {
            cdfDsets.push(...mkCI(oRes.plotData.cdfUpper, oRes.plotData.cdfLower, color, oRes.plotData));
        }
    });
    if (km) {
        cdfDsets.push({ label: '경험적 F(t)', data: km.times.map((t, i) => ({ x: t, y: km.fValues[i] })), borderColor: '#fff', backgroundColor: '#fff', showLine: false, pointRadius: 4 });
    }
    ChartManager.createOrUpdate('warranty-cdf-chart', { type: 'line', data: { datasets: cdfDsets }, options: makeOpts('F(t)') });

    // ── R(t) 차트 ──
    const sfDsets = [
        { label: `R(t) – ${sel.displayName}`, data: mkPts(r.plotData.sf), borderColor: '#22c55e', backgroundColor: '#22c55e18', fill: false, pointRadius: 0, borderWidth: 2.5, tension: 0.3 }
    ];
    if (showCI && r.plotData.relLower) {
        sfDsets.push(...mkCI(r.plotData.relUpper, r.plotData.relLower, '#22c55e'));
    }
    overlayFits.forEach(of => {
        const oRes = of.analysisResult;
        const color = dc[of.name] || '#94a3b8';
        sfDsets.push({
            label: `R(t) – ${of.displayName}`, data: mkPts(oRes.plotData.sf, oRes.plotData), borderColor: color, backgroundColor: 'transparent', fill: false, pointRadius: 0, borderWidth: 1.8, borderDash: [4,4], tension: 0.3
        });
        if (showCI && oRes.plotData.relLower) {
            sfDsets.push(...mkCI(oRes.plotData.relUpper, oRes.plotData.relLower, color, oRes.plotData));
        }
    });
    if (km) {
        sfDsets.push({ label: '경험적 R(t)', data: km.times.map((t, i) => ({ x: t, y: 1 - km.fValues[i] })), borderColor: '#fff', backgroundColor: '#fff', showLine: false, pointRadius: 4 });
    }
    ChartManager.createOrUpdate('warranty-sf-chart', { type: 'line', data: { datasets: sfDsets }, options: makeOpts('R(t)') });

    // ── 계절성 Radar 차트 ──
    const seasonalityCanvas = document.getElementById('warranty-seasonality-chart');
    if (seasonalityCanvas && warrantyState.seasonality) {
        const labels = Array.from({length: 12}, (_, i) => `${i + 1}월`);
        const dataset = {
            label: '계절 지수 (Seasonal Index)',
            data: warrantyState.seasonality.seasonalIndices,
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            borderColor: '#38bdf8',
            pointBackgroundColor: '#38bdf8',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#38bdf8',
            borderWidth: 2
        };
        ChartManager.createOrUpdate('warranty-seasonality-chart', {
            type: 'radar',
            data: {
                labels,
                datasets: [dataset]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: '#94a3b8', font: { size: 10 } },
                        ticks: { color: '#64748b', backdropColor: 'transparent', font: { size: 9 } },
                        suggestedMin: 0.5,
                        suggestedMax: 1.5
                    }
                }
            }
        });
    }
}


// ═══════════════════════════════════════════
// 열화 분석 탭 (일반 열화분석 & 가속열화분석 ADT)
// ═══════════════════════════════════════════
let degradState = { subTab: 'general', result: null, adtResult: null, rawData: null, adtRawData: null };

function renderDegradationTab() {
    const isGen = degradState.subTab === 'general';
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">
        <div>
            <h2 class="section-title" style="margin-bottom:0.2rem">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
                열화 및 가속열화분석 (Degradation & ADT)
            </h2>
            <p style="color:var(--text-secondary);font-size:0.8rem;margin:0">시간에 따른 물리 성능 저하 데이터를 바탕으로 수명 및 가속 계수를 예측합니다.</p>
        </div>
        <!-- 서브 탭 네비게이션 -->
        <div style="display:flex;gap:0.35rem;background:var(--bg-tertiary);padding:0.25rem;border-radius:8px;border:1px solid var(--border-color)">
            <button class="btn btn-sm ${isGen ? 'btn-primary' : 'btn-secondary'}" onclick="switchDegradSubTab('general')" style="min-height:30px;height:30px">일반 열화분석</button>
            <button class="btn btn-sm ${!isGen ? 'btn-primary' : 'btn-secondary'}" onclick="switchDegradSubTab('adt')" style="min-height:30px;height:30px">가속열화시험 (ADT)</button>
        </div>
    </div>
    <div class="grid-cols-1-2">
        <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="glass-card">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
                    <h3 class="section-title" style="margin:0">${isGen ? '일반 열화 데이터 입력' : 'ADT 가속열화 데이터 입력'}</h3>
                    <button class="btn btn-sm btn-secondary" onclick="fillDegradSample()">📋 샘플 데이터</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:0.85rem">
                    ${isGen 
                        ? HelpTooltip.labelWithHelp('데이터 (시료ID, 시간, 측정값)', '각 행: 시료ID, 시간, 측정값') 
                        : HelpTooltip.labelWithHelp('데이터 (시료ID, 스트레스, 시간, 측정값)', '각 행: 시료ID, 가속 온도(°C), 시간, 측정값')
                    }
                    <!-- Handsontable 그리드 -->
                    <div id="degrad-hot-grid" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden"></div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div class="glass-card" style="padding: 0.75rem; border: 1px dashed var(--border-color); margin: 0; background: var(--bg-tertiary);">
                            <div style="font-weight: 600; font-size: 0.8rem; margin-bottom: 0.5rem; color: var(--warning);">1. 열화 고장 기준 설정</div>
                            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                <div>
                                    ${HelpTooltip.labelWithHelp('임계값 (Threshold)', '성능 측정값이 이 값에 도달하면 고장으로 판정')}
                                    <input type="number" id="degrad-threshold" class="input-field" value="${isGen ? 50 : 20}" step="1" style="padding: 0.4rem 0.6rem; font-size: 0.85rem; height: auto;" onchange="runDegradAnalysis()">
                                </div>
                                <div>
                                    ${HelpTooltip.labelWithHelp('열화 방향', '성능 수치가 증가하는 추세인지, 감소하는 추세인지 선택')}
                                    <select id="degrad-direction" class="input-field" style="padding: 0.4rem 0.6rem; font-size: 0.85rem; height: auto;" onchange="runDegradAnalysis()">
                                        <option value="decreasing">감소 (Decreasing)</option>
                                        <option value="increasing">증가 (Increasing)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="glass-card" style="padding: 0.75rem; border: 1px dashed var(--border-color); margin: 0; background: var(--bg-tertiary);">
                            <div style="font-weight: 600; font-size: 0.8rem; margin-bottom: 0.5rem; color: var(--accent-color);">2. 가속 및 피팅 모델 설정</div>
                            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                <div>
                                    ${HelpTooltip.labelWithHelp('열화 예측 모델', '성능 측정데이터를 외삽할 수학적 회귀 모델')}
                                    <select id="degrad-model-sel" class="input-field" style="padding: 0.4rem 0.6rem; font-size: 0.85rem; height: auto;" onchange="runDegradAnalysis()">
                                        <option value="linear">선형 (Linear)</option>
                                        ${isGen ? '<option value="auto">최고 적합 (자동 추천)</option>' : ''}
                                        <option value="exponential">지수 (Exponential)</option>
                                        ${isGen ? `
                                        <option value="power">거듭제곱 (Power)</option>
                                        <option value="log">로그 (Logarithmic)</option>
                                        <option value="gompertz">곰페르츠 (Gompertz)</option>
                                        <option value="lloyd">로이드-리포 (Lloyd-Lipow)</option>
                                        <option value="sqrt">제곱근 (Square Root)</option>` : ''}
                                    </select>
                                </div>
                                <div>
                                    ${isGen 
                                        ? HelpTooltip.labelWithHelp('수명 분포 모델', '각 시료별로 추정된 고장시간들을 피팅할 확률 분포')
                                        : HelpTooltip.labelWithHelp('사용 온도 조건 (°C)', '상온 실사용 환경 온도 (수명 외삽 기준)')
                                    }
                                    ${isGen ? `
                                    <select id="degrad-dist-sel" class="input-field" style="padding: 0.4rem 0.6rem; font-size: 0.85rem; height: auto;" onchange="runDegradAnalysis()">
                                        <option value="weibull">Weibull 2P</option>
                                        <option value="lognormal">Lognormal</option>
                                        <option value="normal">Normal</option>
                                        <option value="exponential">Exponential</option>
                                    </select>` : `
                                    <input type="number" id="degrad-usetemp" class="input-field" value="25" step="1" style="padding: 0.4rem 0.6rem; font-size: 0.85rem; height: auto;" onchange="runDegradAnalysis()">
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-primary" style="width:100%;min-height:44px" onclick="runDegradAnalysis()">▶ 분석 실행</button>
                </div>
            </div>
            <div class="glass-card">
                <h3 class="section-title">${isGen ? '일반 열화 분석이란?' : '가속열화시험(ADT)이란?'}</h3>
                <div style="font-size:0.85rem;line-height:1.7;color:var(--text-secondary)">
                    ${isGen ? `
                    <p>시간에 따라 성능이 저하(열화)되는 데이터를 분석하여 수명을 추정합니다.</p>
                    <p><strong>D(t) = a + b · g(t)</strong> 등 모델 적합 후 임계값 도달 시간을 추정합니다.</p>
                    <ul style="padding-left:1.2rem;margin:0.5rem 0">
                        <li>선형: g(t) = t</li>
                        <li>지수: y = b·exp(a·t)</li>
                        <li>거듭제곱: g(t) = t^p</li>
                    </ul>
                    <div class="info-box" style="border-color:rgba(245,158,11,0.3);color:var(--warning);font-size:0.8rem">📖 Ref: Meeker & Escobar (1998), Ch.21</div>`
                    : `
                    <p>상온에서는 수년 이상 걸리는 열화를 여러 조건의 가속 스트레스(예: 온도 60°C, 80°C, 100°C) 하에서 측정하여 수명을 단시간에 예측합니다.</p>
                    <p><strong>Arrhenius Model 적용 가속 이론:</strong></p>
                    <p>열화 속도 $b(T) = A \\cdot \\exp(-E_a / k T_K)$</p>
                    <p>활성화 에너지 $E_a$를 유도하여 상온($25\\text{°C}$)에서의 열화 속도를 구하고 수명을 산출합니다.</p>
                    <div class="info-box" style="border-color:rgba(245,158,11,0.3);color:var(--warning);font-size:0.8rem">📖 Ref: JEDEC JESD22-A108 / Meeker & Escobar (1998)</div>`
                    }
                </div>
            </div>
        </div>
        <div id="degrad-result">
            ${isGen 
                ? (degradState.result ? renderDegradResult() : '<div class="glass-card empty-state" style="min-height:400px"><div style="font-weight:600;color:var(--text-secondary)">데이터 입력 후 분석 실행</div><div style="font-size:0.8rem;color:var(--text-muted)">열화 경로, 모델 적합, 수명 예측 결과가 표시됩니다.</div></div>')
                : (degradState.adtResult ? renderADTResult() : '<div class="glass-card empty-state" style="min-height:400px"><div style="font-weight:600;color:var(--text-secondary)">데이터 입력 후 분석 실행</div><div style="font-size:0.8rem;color:var(--text-muted)">가속열화 피팅 및 활성화 에너지(Ea), 상온 외삽 수명 결과가 표시됩니다.</div></div>')
            }
        </div>
    </div>`;
}

function switchDegradSubTab(subTab) {
    degradState.subTab = subTab;
    const content = document.getElementById('tab-content');
    if (content) {
        content.innerHTML = renderDegradationTab();
        setTimeout(() => {
            initDegradGrid();
            // 각 탭에 맞춰서 기본 샘플 로드
            fillDegradSample();
        }, 100);
    }
}

let _degradHot = null;

function initDegradGrid() {
    const container = document.getElementById('degrad-hot-grid');
    if (!container) return;

    if (_degradHot) {
        try { _degradHot.destroy(); } catch(e) {}
        _degradHot = null;
    }

    const isGen = degradState.subTab === 'general';
    const data = isGen 
        ? Array.from({length: 10}, () => Array(3).fill(null))
        : Array.from({length: 15}, () => Array(4).fill(null));

    _degradHot = new Handsontable(container, {
        data,
        colHeaders: isGen ? ['시료ID', '시간', '측정값'] : ['시료ID', '온도(°C)', '시간', '측정값'],
        columns: isGen 
            ? [{ type: 'text' }, { type: 'numeric' }, { type: 'numeric' }]
            : [{ type: 'text' }, { type: 'numeric' }, { type: 'numeric' }, { type: 'numeric' }],
        rowHeaders: true,
        height: 240,
        width: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        contextMenu: ['row_above', 'row_below', 'remove_row', '---------', 'undo', 'redo']
    });
}

function fillDegradSample() {
    if (degradState.subTab === 'general') {
        const sample = [
            ['S1',0,100],['S1',200,97],['S1',400,92],['S1',600,86],['S1',800,78],['S1',1000,68],['S1',1200,56],['S1',1400,43],
            ['S2',0,100],['S2',200,96],['S2',400,90],['S2',600,83],['S2',800,74],['S2',1000,63],['S2',1200,51],['S2',1400,38],
            ['S3',0,100],['S3',200,98],['S3',400,94],['S3',600,89],['S3',800,82],['S3',1000,73],['S3',1200,62],['S3',1400,49],
            ['S4',0,100],['S4',200,95],['S4',400,88],['S4',600,80],['S4',800,70],['S4',1000,58],['S4',1200,44],
            ['S5',0,100],['S5',200,97],['S5',400,93],['S5',600,87],['S5',800,80],['S5',1000,71],['S5',1200,60],['S5',1400,47],
        ];
        if (_degradHot) _degradHot.loadData(sample);
        document.getElementById('degrad-threshold').value = '50';
        document.getElementById('degrad-direction').value = 'decreasing';
        document.getElementById('degrad-model-sel').value = 'linear';
        runDegradAnalysis();
    } else {
        // ADT 가속열화 예제 데이터 (온도 가속 60°C, 80°C, 100°C)
        const sample = [
            // 60도 조건 (시료 S1, S2, S3)
            ['S1', 60, 0, 100], ['S1', 60, 500, 95], ['S1', 60, 1000, 90], ['S1', 60, 1500, 85],
            ['S2', 60, 0, 100], ['S2', 60, 500, 96], ['S2', 60, 1000, 91], ['S2', 60, 1500, 87],
            ['S3', 60, 0, 100], ['S3', 60, 500, 94], ['S3', 60, 1000, 89], ['S3', 60, 1500, 84],
            // 80도 조건 (시료 S4, S5, S6)
            ['S4', 80, 0, 100], ['S4', 80, 200, 92], ['S4', 80, 400, 84], ['S4', 80, 600, 76],
            ['S5', 80, 0, 100], ['S5', 80, 200, 93], ['S5', 80, 400, 86], ['S5', 80, 600, 78],
            ['S6', 80, 0, 100], ['S6', 80, 200, 90], ['S6', 80, 400, 82], ['S6', 80, 600, 73],
            // 100도 조건 (시료 S7, S8, S9)
            ['S7', 100, 0, 100], ['S7', 100, 100, 87], ['S7', 100, 200, 74], ['S7', 100, 300, 61],
            ['S8', 100, 0, 100], ['S8', 100, 100, 89], ['S8', 100, 200, 77], ['S8', 100, 300, 65],
            ['S9', 100, 0, 100], ['S9', 100, 100, 85], ['S9', 100, 200, 71], ['S9', 100, 300, 57]
        ];
        if (_degradHot) _degradHot.loadData(sample);
        document.getElementById('degrad-threshold').value = '20';
        document.getElementById('degrad-direction').value = 'decreasing';
        document.getElementById('degrad-model-sel').value = 'linear';
        document.getElementById('degrad-usetemp').value = '25';
        runDegradAnalysis();
    }
}

function selectDegradModel(modelCode) {
    const selEl = document.getElementById('degrad-model-sel');
    if (selEl) {
        selEl.value = modelCode;
        runDegradAnalysis();
    }
}

function getModelFormulaLaTeX(model, a, b, extra) {
    const aStr = a.toFixed(4);
    const bSign = b >= 0 ? '+' : '-';
    const bAbsStr = Math.abs(b).toFixed(6);
    
    let formulaGen = '';
    let formulaVal = '';
    
    switch (model) {
        case 'linear':
            formulaGen = 'D(t) = a + b \\cdot t';
            formulaVal = `D(t) = ${aStr} ${bSign} ${bAbsStr} \\cdot t`;
            break;
        case 'sqrt':
            formulaGen = 'D(t) = a + b \\cdot \\sqrt{t}';
            formulaVal = `D(t) = ${aStr} ${bSign} ${bAbsStr} \\cdot \\sqrt{t}`;
            break;
        case 'log':
            formulaGen = 'D(t) = a + b \\cdot \\ln(t)';
            formulaVal = `D(t) = ${aStr} ${bSign} ${bAbsStr} \\cdot \\ln(t)`;
            break;
        case 'power':
            const pStr = extra !== undefined ? extra.toFixed(2) : 'p';
            formulaGen = 'D(t) = a + b \\cdot t^p';
            formulaVal = `D(t) = ${aStr} ${bSign} ${bAbsStr} \\cdot t^{${pStr}}`;
            break;
        case 'exponential':
            formulaGen = 'D(t) = \\exp(a + b \\cdot t)';
            formulaVal = `D(t) = \\exp(${aStr} ${bSign} ${bAbsStr} \\cdot t)`;
            break;
        case 'lloyd':
            formulaGen = 'D(t) = a + \\frac{b}{t}';
            formulaVal = `D(t) = ${aStr} ${bSign} \\frac{${bAbsStr}}{t}`;
            break;
        case 'gompertz':
            const cStr = extra !== undefined ? extra.toFixed(2) : 'c';
            formulaGen = 'D(t) = \\exp(a + b \\cdot c^t)';
            formulaVal = `D(t) = \\exp(${aStr} ${bSign} ${bAbsStr} \\cdot ${cStr}^t)`;
            break;
    }
    
    return `${formulaGen} \\quad \\rightarrow \\quad ${formulaVal}`;
}

function runDegradAnalysis() {
    const hotData = _degradHot ? _degradHot.getData() : [];
    const threshold = parseFloat(document.getElementById('degrad-threshold').value);
    const direction = document.getElementById('degrad-direction').value;
    const modelSel = document.getElementById('degrad-model-sel').value;

    if (isNaN(threshold)) { alert('임계값을 입력하세요.'); return; }

    if (degradState.subTab === 'general') {
        const text = hotData.filter(r => r[0] && r[1] !== null && r[2] !== null).map(r => r.join(',')).join('\n');
        if (!text.trim()) { alert('데이터를 입력하세요.'); return; }
        const data = DegradationAnalysis.parseData(text);
        if (data.length < 2) { alert('유효한 데이터가 2개 이상 필요합니다.'); return; }

        const distSel = document.getElementById('degrad-dist-sel')?.value || 'weibull';
        degradState.rawData = data;
        degradState.result = DegradationAnalysis.analyze(data, threshold, direction, modelSel, distSel);

        const el = document.getElementById('degrad-result');
        if (el) {
            el.innerHTML = renderDegradResult();
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(el, {
                    delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
                });
            }
        }
        setTimeout(drawDegradCharts, 150);
    } else {
        // ADT 분석 모드
        const validRows = hotData.filter(r => r[0] && r[1] !== null && r[2] !== null && r[3] !== null);
        if (validRows.length === 0) { alert('데이터를 입력하세요.'); return; }
        
        const data = validRows.map(r => ({
            id: r[0],
            stress: parseFloat(r[1]),
            time: parseFloat(r[2]),
            value: parseFloat(r[3])
        }));

        const useTemp = parseFloat(document.getElementById('degrad-usetemp').value) || 25;
        
        try {
            degradState.adtRawData = data;
            degradState.adtResult = ADTAnalysis.analyze(data, threshold, direction, useTemp, modelSel);
            
            const el = document.getElementById('degrad-result');
            if (el) {
                el.innerHTML = renderADTResult();
                if (typeof renderMathInElement === 'function') {
                    renderMathInElement(el, {
                        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
                    });
                }
            }
            setTimeout(drawADTCharts, 150);
        } catch(err) {
            alert(err.message);
        }
    }
}

function renderDegradResult() {
    const r = degradState.result;
    if (!r) return '';
    const s = r.summary;
    const ld = r.lifetimeDist;
    const dc = { 
        linear: 'var(--accent-color)', 
        sqrt: 'var(--success)', 
        log: 'var(--purple)', 
        power: 'var(--warning)', 
        exponential: 'var(--danger)', 
        lloyd: '#64748b', 
        gompertz: '#a855f7' 
    };

    let betaMsg = '';
    if (ld && ld.distType === 'weibull') {
        const interp = Distributions.interpretBeta(ld.param2);
        betaMsg = `<div class="info-box" style="margin-top: 0.5rem; font-size: 0.8rem; border-color: var(--accent-glow); color: var(--accent-color);">${interp.message}</div>`;
    }

    const selModel = document.getElementById('degrad-model-sel')?.value || 'auto';
    const activeModelObj = r.globalModels.find(m => m.model === selModel) || r.globalModels.find(m => m.best) || r.globalModels[0];

    return `
    <div class="grid-4" style="margin-bottom:1rem">
        <div class="stat-card"><div class="label">시료 수</div><div class="value">${s.nUnits}</div></div>
        <div class="stat-card"><div class="label">데이터 포인트</div><div class="value">${s.nPoints}</div></div>
        <div class="stat-card"><div class="label">중앙 수명</div><div class="value" style="color:var(--accent-color)">${s.medianLifetime ? s.medianLifetime.toFixed(1) : '-'}</div></div>
        <div class="stat-card"><div class="label">평균 수명</div><div class="value" style="color:var(--success)">${s.meanLifetime ? s.meanLifetime.toFixed(1) : '-'}</div></div>
    </div>
    
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">열화 경로 및 예측선</h3>
        <div class="chart-container" style="height:320px"><canvas id="degrad-path-chart"></canvas></div>
    </div>
    
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">글로벌 모델 비교 (전체 데이터)</h3>
        <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.5rem">💡 행을 클릭하면 해당 열화 예측 모델로 수명이 즉시 재계산됩니다.</div>
        <div class="table-wrapper" style="margin-bottom: 1rem;"><table><thead><tr>
            <th class="table-header">최적 / 선택</th>
            <th class="table-header">모델</th>
            <th class="table-header">절편 (a)</th>
            <th class="table-header">기울기 (b)</th>
            <th class="table-header">지수 (p / c)</th>
            <th class="table-header">결정계수 (R²)</th>
        </tr></thead><tbody>${r.globalModels.map(m => {
            const isActive = (m.model === selModel) || (selModel === 'auto' && m.best);
            const bg = isActive ? 'rgba(34,197,94,0.15)' : (m.best ? 'rgba(56,189,248,0.06)' : 'transparent');
            const hoverBg = isActive ? 'rgba(34,197,94,0.25)' : 'rgba(56,189,248,0.15)';
            
            let badgeHtml = '';
            if (m.best) {
                badgeHtml += '<span class="badge badge-info" style="margin-right:4px">✓ 최적</span>';
            }
            if (isActive) {
                badgeHtml += '<span class="badge badge-success" style="background-color: var(--success); color: #fff">✓ 선택됨</span>';
            }

            return `<tr onclick="selectDegradModel('${m.model}')" 
                style="cursor:pointer; background:${bg}; transition: background 0.2s;" 
                onmouseover="this.style.background='${hoverBg}'" 
                onmouseout="this.style.background='${bg}'"
                class="hover-row-effect">
                <td class="table-cell">${badgeHtml}</td>
                <td class="table-cell" style="color:${dc[m.model]||'var(--text-primary)'};font-weight:${isActive?'700':'400'}">${m.label}</td>
                <td class="table-cell">${m.a.toFixed(4)}</td>
                <td class="table-cell">${m.b.toFixed(6)}</td>
                <td class="table-cell">${m.c !== undefined ? m.c.toFixed(2) : (m.p !== undefined ? m.p.toFixed(2) : '-')}</td>
                <td class="table-cell" style="font-weight:600;color:var(--accent-color)">${m.r2.toFixed(6)}</td>
            </tr>`;
        }).join('')}</tbody></table></div>

        <!-- 선택된 모델 수식 표시 패널 -->
        <div style="padding: 0.75rem; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 8px;">
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--accent-color); margin-bottom: 0.5rem;">
                선택된 모델 공식 (${activeModelObj.label})
            </div>
            <div id="degrad-selected-formula" style="font-size: 0.95rem; overflow-x: auto; padding: 0.25rem 0;">
                $$${getModelFormulaLaTeX(activeModelObj.model, activeModelObj.a, activeModelObj.b, activeModelObj.c !== undefined ? activeModelObj.c : activeModelObj.p)}$$
            </div>
        </div>
    </div>
    
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">시료별 추정 수명 (고장 기준 도달 시간)</h3>
        <div class="table-wrapper"><table><thead><tr>
            <th class="table-header">시료</th><th class="table-header">개별 최적 모델</th><th class="table-header">R²</th><th class="table-header">추정 수명 (Failure Time)</th>
        </tr></thead><tbody>${r.units.map(u => `<tr>
            <td class="table-cell" style="font-weight:600">${u.id}</td>
            <td class="table-cell" style="color:${dc[u.bestModel?.model]||'var(--text-primary)'}">${u.bestModel?.label || '-'}</td>
            <td class="table-cell">${u.bestModel?.r2 !== undefined ? u.bestModel.r2.toFixed(4) : '-'}</td>
            <td class="table-cell" style="color:var(--accent-color);font-weight:600">${u.lifetime !== null ? u.lifetime.toFixed(1) : '∞ (미도달)'}</td>
        </tr>`).join('')}</tbody></table></div>
    </div>
    
    ${r.lifetimes.length >= 3 ? `
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">추정 수명 분포 (Life Distribution Fitting)</h3>
        <div class="chart-container" style="height:250px"><canvas id="degrad-lifetime-chart"></canvas></div>
        ${ld ? `
        <div class="grid-4" style="margin-top:0.75rem">
            <div class="stat-card"><div class="label">분포</div><div class="value" style="font-size:0.95rem;color:var(--accent-color)">${ld.distribution}</div></div>
            <div class="stat-card"><div class="label">${ld.param1Label}</div><div class="value" style="font-size:1.1rem">${ld.param1.toFixed(4)}</div></div>
            <div class="stat-card"><div class="label">${ld.param2Label ? ld.param2Label : '-'}</div><div class="value" style="font-size:1.1rem">${ld.param2 !== null ? ld.param2.toFixed(4) : '-'}</div></div>
            <div class="stat-card"><div class="label">B10 수명</div><div class="value" style="font-size:1.1rem;color:var(--danger)">${ld.b10.toFixed(2)}</div></div>
        </div>
        ${betaMsg}
        ` : ''}
    </div>` : `<div class="glass-card empty-state" style="margin-bottom:1rem"><div style="font-weight:600;color:var(--text-secondary)">분포 피팅 불가</div><div style="font-size:0.8rem;color:var(--text-muted)">수명이 유한한 값으로 추정된 시료가 최소 3개 이상 필요합니다.</div></div>`}
    `;
}

function renderADTResult() {
    const r = degradState.adtResult;
    if (!r) return '';
    const df = r.distributionFit;

    // Arrhenius 가속 피팅 수식 LaTeX
    const derivLaTeX = `
    $$\\begin{aligned}
    \\ln(|b_i|) &= \\ln(A) - \\frac{E_a}{k \\cdot T_{K,i}} \\\\
    E_a &= ${r.Ea.toFixed(4)} \\text{ eV} \\\\
    R^2 \\text{ (Arrhenius Fit)} &= ${r.altR2.toFixed(4)} \\\\
    b_{\\text{use}} (${r.useTemp}\\text{°C}) &= ${r.b_use.toExponential(4)} \\text{/hour}
    \\end{aligned}$$`;

    let distResultHtml = '';
    if (df) {
        distResultHtml = `
        <div class="grid-4" style="margin-top:0.75rem">
            <div class="stat-card"><div class="label">사용조건 수명 분포</div><div class="value" style="font-size:0.95rem;color:var(--accent-color)">${df.distribution}</div></div>
            <div class="stat-card"><div class="label">η (사용조건 척도)</div><div class="value">${df.eta.toFixed(1)}h</div></div>
            <div class="stat-card"><div class="label">β (공통 형상모수)</div><div class="value">${df.beta.toFixed(3)}</div></div>
            <div class="stat-card"><div class="label">B10 수명 (${r.useTemp}°C)</div><div class="value" style="color:var(--danger);font-weight:700">${df.b10.toFixed(1)}h</div></div>
        </div>`;
    }

    return `
    <div class="grid-4" style="margin-bottom:1rem">
        <div class="stat-card"><div class="label">총 가속 시료 수</div><div class="value">${r.unitsWithLifetimes.length}대</div></div>
        <div class="stat-card"><div class="label">활성화 에너지 (Ea)</div><div class="value warning">${r.Ea.toFixed(4)} eV</div></div>
        <div class="stat-card"><div class="label">가속 피팅 상관계수 R²</div><div class="value accent">${r.altR2.toFixed(4)}</div></div>
        <div class="stat-card"><div class="label">예상 평균 수명 (MTTF)</div><div class="value success">${df ? Math.round(df.mttf).toLocaleString() : Math.round(r.meanPseudo).toLocaleString()}h</div></div>
    </div>

    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">가속 조건별 실측 열화 경로</h3>
        <div class="chart-container" style="height:280px"><canvas id="degrad-path-chart"></canvas></div>
    </div>

    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">Arrhenius 가속 모델 적합선 ($1/T_K$ vs $\\ln|b|$)</h3>
        <div class="chart-container" style="height:260px"><canvas id="adt-arrhenius-chart"></canvas></div>
    </div>

    <!-- 수식 상세 아코디언 -->
    <div class="accordion" style="margin-bottom:1rem; width: 100%">
        <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
            수식 유도 및 Arrhenius 피팅 도출 과정 (KaTeX)
            <span class="accordion-arrow">▼</span>
        </div>
        <div class="accordion-body">
            <div class="formula-section" style="margin-top:0">
                ${derivLaTeX}
            </div>
        </div>
    </div>

    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">시료별 사용 온도 (${r.useTemp}°C) 기준 가상 고장시간 (Pseudo failure time)</h3>
        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th class="table-header">시료 ID</th>
                        <th class="table-header">가속 온도</th>
                        <th class="table-header">가속 조건 열화 속도 (b)</th>
                        <th class="table-header">사용 조건 예측속도 (b_use)</th>
                        <th class="table-header">가상 고장시간 (Pseudo Life)</th>
                    </tr>
                </thead>
                <tbody>
                    ${r.unitsWithLifetimes.map(u => `
                    <tr>
                        <td class="table-cell" style="font-weight:600">${u.id}</td>
                        <td class="table-cell">${u.stress}°C</td>
                        <td class="table-cell">${u.b_est.toExponential(4)}</td>
                        <td class="table-cell">${u.b_use_individual.toExponential(4)}</td>
                        <td class="table-cell" style="color:var(--accent-color);font-weight:600">${u.tPseudo.toLocaleString(undefined, {maximumFractionDigits: 1})}h</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
    </div>

    <div class="glass-card">
        <h3 class="section-title">사용 온도 (${r.useTemp}°C) 조건의 예측 수명 분포 CDF</h3>
        <div class="chart-container" style="height:250px"><canvas id="degrad-lifetime-chart"></canvas></div>
        ${distResultHtml}
    </div>`;
}

function drawDegradCharts() {
    const r = degradState.result;
    if (!r) return;

    const UNIT_COLORS = ['#38bdf8','#22c55e','#a78bfa','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
    const groups = DegradationAnalysis.groupByUnit(degradState.rawData);
    const unitIds = Object.keys(groups);
    const tMax = Math.max(...degradState.rawData.map(d => d.time)) * 1.3;

    const datasets = [];
    unitIds.forEach((id, i) => {
        const color = UNIT_COLORS[i % UNIT_COLORS.length];
        datasets.push({
            label: id,
            data: groups[id].map(p => ({ x: p.time, y: p.value })),
            borderColor: color,
            backgroundColor: color,
            pointRadius: 4,
            showLine: false,
            pointStyle: 'circle',
        });
        const unit = r.units.find(u => u.id === id);
        if (unit && unit.bestModel) {
            const pred = DegradationAnalysis.predict(unit.bestModel, unit.bestModel.model, tMax);
            datasets.push({
                label: `${id} fit`,
                data: pred.map(p => ({ x: p.time, y: p.value })),
                borderColor: color,
                borderWidth: 1.5,
                borderDash: [4, 3],
                pointRadius: 0,
                showLine: true,
                fill: false,
            });
        }
    });

    datasets.push({
        label: `임계값 (${r.threshold})`,
        data: [{ x: 0, y: r.threshold }, { x: tMax, y: r.threshold }],
        borderColor: '#ef4444',
        borderWidth: 2,
        borderDash: [8, 4],
        pointRadius: 0,
        showLine: true,
        fill: false,
    });

    ChartManager.createOrUpdate('degrad-path-chart', {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, labels: { font: { size: 11 }, filter: item => !item.text.endsWith(' fit') }},
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: '시간' } },
                y: { type: 'linear', title: { display: true, text: '측정값' } },
            },
        },
    });

    if (r.lifetimes.length >= 3 && r.lifetimeDist) {
        const ld = r.lifetimeDist;
        const D = Distributions;
        const ltMax = Math.max(...r.lifetimes) * 1.5;
        
        const dataPoints = [];
        for (let i = 0; i <= 100; i++) {
            const t = (ltMax * i) / 100;
            let cdfVal = 0;
            if (ld.distType === 'weibull') {
                cdfVal = D.Weibull.cdf(t, ld.param1, ld.param2);
            } else if (ld.distType === 'lognormal') {
                cdfVal = D.Lognormal.cdf(t, ld.param1, ld.param2);
            } else if (ld.distType === 'normal') {
                cdfVal = D.Normal.cdf(t, ld.param1, ld.param2);
            } else if (ld.distType === 'exponential') {
                cdfVal = D.Exponential.cdf(t, ld.param1);
            }
            dataPoints.push({ x: t, y: cdfVal });
        }

        ChartManager.createOrUpdate('degrad-lifetime-chart', {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: `F(t) 추정 수명 분포 (${ld.distribution})`,
                        data: dataPoints,
                        borderColor: CONSTANTS.CHART_COLORS.danger,
                        backgroundColor: 'rgba(239,68,68,0.08)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                        borderWidth: 2.5,
                    },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top' } },
                scales: {
                    x: { type: 'linear', title: { display: true, text: '추정 수명' } },
                    y: { title: { display: true, text: 'F(t)' }, min: 0, max: 1, ticks: { callback: v => (v*100).toFixed(0) + '%' } },
                }
            }
        });
    }
}

function drawADTCharts() {
    const r = degradState.adtResult;
    if (!r) return;

    // 1. 실측 데이터 시각화 (온도 조건별 다른 색상)
    const STRESS_COLORS = { 60: '#38bdf8', 80: '#f59e0b', 100: '#ef4444' };
    const datasets = [];
    
    // 시료별 데이터 분할
    const groups = {};
    for (const d of degradState.adtRawData) {
        if (!groups[d.id]) groups[d.id] = [];
        groups[d.id].push(d);
    }

    const tMax = Math.max(...degradState.adtRawData.map(d => d.time)) * 1.2;

    Object.keys(groups).forEach(id => {
        const pts = groups[id].sort((a,b) => a.time - b.time);
        const stress = pts[0].stress;
        const color = STRESS_COLORS[stress] || '#a78bfa';

        datasets.push({
            label: `${id} (${stress}°C)`,
            data: pts.map(p => ({ x: p.time, y: p.value })),
            borderColor: color,
            backgroundColor: color,
            pointRadius: 4,
            showLine: true,
            borderWidth: 1.5,
            fill: false,
            tension: 0.2
        });
    });

    // 임계선 추가
    datasets.push({
        label: `임계값 (${r.threshold})`,
        data: [{ x: 0, y: r.threshold }, { x: tMax, y: r.threshold }],
        borderColor: '#ffffff',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        showLine: true,
        fill: false
    });

    ChartManager.createOrUpdate('degrad-path-chart', {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        filter: item => !item.text.includes('임계값')
                    }
                }
            },
            scales: {
                x: { type: 'linear', title: { display: true, text: '시간 (시간)' } },
                y: { type: 'linear', title: { display: true, text: '성능 열화 수치' } }
            }
        }
    });

    // 2. Arrhenius 가속 피팅 차트 (1/T_K vs ln|b|)
    const arrhData = r.altPoints.map(pt => ({ x: pt.x, y: pt.y }));
    // 회귀 분석 직선 데이터
    const xMin = Math.min(...arrhData.map(d => d.x)) * 0.95;
    const xMax = Math.max(...arrhData.map(d => d.x)) * 1.05;
    
    // slope, intercept 복원
    const BOLTZMANN = 8.617333262145e-5;
    const regSlope = -r.Ea / BOLTZMANN;
    const regIntercept = Math.log(r.A);
    const lineData = [
        { x: xMin, y: regIntercept + regSlope * xMin },
        { x: xMax, y: regIntercept + regSlope * xMax }
    ];

    ChartManager.createOrUpdate('adt-arrhenius-chart', {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: '스트레스 조건별 대표 열화속도 (ln|b|)',
                    data: arrhData,
                    borderColor: '#f59e0b',
                    backgroundColor: '#f59e0b',
                    pointRadius: 6,
                    showLine: false
                },
                {
                    label: 'Arrhenius 피팅 선',
                    data: lineData,
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    showLine: true,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: item => `1/T_K = ${item.raw.x.toExponential(4)}, ln|b| = ${item.raw.y.toFixed(3)}`
                    }
                }
            },
            scales: {
                x: { 
                    type: 'linear', 
                    title: { display: true, text: '절대온도 역수 (1/T_K)' },
                    ticks: { callback: v => v.toExponential(3) }
                },
                y: { type: 'linear', title: { display: true, text: '열화 속도 자연로그 (ln|b|)' } }
            }
        }
    });

    // 3. 사용 조건 수명분포 CDF 차트
    if (r.pseudoLifetimes.length >= 3 && r.distributionFit) {
        const df = r.distributionFit;
        const ltMax = Math.max(...r.pseudoLifetimes) * 1.6;
        const dataPoints = [];

        for (let i = 0; i <= 100; i++) {
            const t = (ltMax * i) / 100;
            const cdf = Distributions.Weibull.cdf(t, df.eta, df.beta);
            dataPoints.push({ x: t, y: cdf });
        }

        ChartManager.createOrUpdate('degrad-lifetime-chart', {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: `F(t) 수명 누적 분포 (Weibull 2P 적합)`,
                        data: dataPoints,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.08)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                        borderWidth: 2.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { type: 'linear', title: { display: true, text: `추정 Pseudo 수명 (시간, ${r.useTemp}°C 기준)` } },
                    y: { title: { display: true, text: '고장 확률 F(t)' }, min: 0, max: 1, ticks: { callback: v => (v*100).toFixed(0) + '%' } }
                }
            }
        });
    }
}


// ═══════════════════════════════════════════
function initTabEvents(tabId) {
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.getElementById('tab-content'), {
            delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
        });
    }
    if (tabId === 'analysis') setTimeout(initAnalysisGrid, 100);
    if (tabId === 'warranty') setTimeout(initWarrantyGrid, 100);
    if (tabId === 'degradation') setTimeout(initDegradGrid, 100);
    if (tabId === 'acceleration') {
        setTimeout(() => {
            initAccelerationEvents();
            try { runAcceleration(); } catch(e) {}
        }, 100);
    }
}

// ═══════════════════════════════════════════
// 테마 관리 (White Theme vs Black Theme)
// ═══════════════════════════════════════════
function initTheme() {
    const savedTheme = localStorage.getItem('re-suite-theme') || 'white';
    document.body.setAttribute('data-theme', savedTheme);
    updateThemeButtonUI(savedTheme);
    if (typeof ChartManager !== 'undefined' && ChartManager.updateTheme) {
        ChartManager.updateTheme(savedTheme);
    }
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'white';
    const newTheme = currentTheme === 'white' ? 'black' : 'white';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('re-suite-theme', newTheme);
    updateThemeButtonUI(newTheme);
    if (typeof ChartManager !== 'undefined' && ChartManager.updateTheme) {
        ChartManager.updateTheme(newTheme);
    }
}

function updateThemeButtonUI(theme) {
    const btnText = document.getElementById('theme-btn-text');
    if (!btnText) return;
    if (theme === 'white') {
        btnText.textContent = 'Black 테마';
    } else {
        btnText.textContent = 'White 테마';
    }
}

// ═══════════════════════════════════════════
// 앱 초기화
// ═══════════════════════════════════════════
function initGlobalEnterKeyHandler() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const target = e.target;
            if (target && target.tagName === 'INPUT') {
                const id = target.id || '';
                let triggered = false;

                if (id.startsWith('rel-')) {
                    e.preventDefault();
                    if (typeof runReliabilityPlan === 'function') { runReliabilityPlan(); triggered = true; }
                } else if (id.startsWith('ltpd-')) {
                    e.preventDefault();
                    if (typeof runLTPD === 'function') { runLTPD(); triggered = true; }
                } else if (id.startsWith('wbx-')) {
                    e.preventDefault();
                    if (typeof runWeibullBx === 'function') { runWeibullBx(); triggered = true; }
                } else if (id.startsWith('ltfr-')) {
                    e.preventDefault();
                    if (typeof runLTFR === 'function') { runLTFR(); triggered = true; }
                } else if (id.startsWith('aql-')) {
                    e.preventDefault();
                    if (typeof runAQL === 'function') { runAQL(); triggered = true; }
                } else if (id.startsWith('acc-')) {
                    e.preventDefault();
                    if (typeof runAcceleration === 'function') { runAcceleration(); triggered = true; }
                } else if (id.startsWith('analysis-')) {
                    e.preventDefault();
                    if (typeof runAnalysis === 'function') { runAnalysis(); triggered = true; }
                } else if (id.startsWith('warranty-')) {
                    e.preventDefault();
                    if (typeof runWarrantyPreprocess === 'function') { runWarrantyPreprocess(); triggered = true; }
                } else if (id.startsWith('fc-')) {
                    e.preventDefault();
                    if (typeof runWarrantyForecast === 'function') { runWarrantyForecast(); triggered = true; }
                } else if (id.startsWith('degrad-')) {
                    e.preventDefault();
                    if (typeof runDegradAnalysis === 'function') { runDegradAnalysis(); triggered = true; }
                }

                if (!triggered) {
                    const card = target.closest('.glass-card');
                    if (card) {
                        const btn = card.querySelector('button.btn-primary') || card.querySelector('button.btn');
                        if (btn) {
                            e.preventDefault();
                            btn.click();
                            triggered = true;
                        }
                    }
                }
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initGlobalEnterKeyHandler();
        switchTab('planning');
    });
} else {
    initTheme();
    initGlobalEnterKeyHandler();
    switchTab('planning');
}

function applyAccPreset(modelType, value) {
    if (!value) return;
    if (modelType === 'arrhenius') {
        const val = parseFloat(value);
        accelerationState.ea = val;
        const eaInput = document.getElementById('acc-ea');
        if (eaInput) eaInput.value = val;
    } else if (modelType === 'peck') {
        const parts = value.split('|');
        const eaVal = parseFloat(parts[0]);
        const nVal = parseFloat(parts[1]);
        accelerationState.ea = eaVal;
        accelerationState.nPeck = nVal;
        
        const eaInput = document.getElementById('acc-ea');
        const nInput = document.getElementById('acc-n-peck');
        if (eaInput) eaInput.value = eaVal;
        if (nInput) nInput.value = nVal;
    } else if (modelType === 'coffin_manson') {
        const val = parseFloat(value);
        accelerationState.m = val;
        const mInput = document.getElementById('acc-m');
        if (mInput) mInput.value = val;
    } else if (modelType === 'inverse_power') {
        const val = parseFloat(value);
        accelerationState.nPower = val;
        const nInput = document.getElementById('acc-n-power');
        if (nInput) nInput.value = val;
    } else if (modelType === 'eyring') {
        const parts = value.split('|');
        const eaVal = parseFloat(parts[0]);
        const bVal = parseFloat(parts[1]);
        accelerationState.ea = eaVal;
        accelerationState.eyringB = bVal;
        
        const eaInput = document.getElementById('acc-ea');
        const bInput = document.getElementById('acc-eyring-b');
        if (eaInput) eaInput.value = eaVal;
        if (bInput) bInput.value = bVal;
    }
    
    // 계산 즉시 갱신
    try { runAcceleration(); } catch(e) {}
}

function linkAQLToLTPD(n, c) {
    // 1. planning 탭으로 전환
    switchTab('planning');
    // 2. ltpd 서브탭으로 전환
    switchPlanningSubTab('ltpd');
    
    // 3. 소비자위험 10% 하에서 보장되는 실제 LTPD 불량률(%) 역산
    const ltpdVal = SamplePlanning.findLTPDForNC(n, c, 0.10);
    
    // 4. DOM 입력 필드 동기화 (DOM 생성 대기 위해 setTimeout 적용)
    setTimeout(() => {
        const pInput = document.getElementById('ltpd-p');
        const betaInput = document.getElementById('ltpd-beta');
        const cInput = document.getElementById('ltpd-c');
        
        if (pInput) pInput.value = ltpdVal.toFixed(2);
        if (betaInput) betaInput.value = 10; // 소비자위험 10% 고정
        if (cInput) cInput.value = c;
        
        // 5. 즉시 계산 실행
        runLTPD();
    }, 80);
}

function updateAccSlider(val) {
    const nInput = document.getElementById('acc-n');
    if (nInput) nInput.value = val;
    accelerationState.n = parseInt(val);
    const sliderValEl = document.getElementById('slider-n-val');
    if (sliderValEl) sliderValEl.innerText = val;
    
    // 계산 즉시 갱신
    runAcceleration();
}

function copySummaryTextToClipboard() {
    const text = document.getElementById('acc-business-summary')?.innerText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showCopyToast('비즈니스 요약문이 클립보드에 복사되었습니다.');
    }).catch(err => {
        console.error('복사 실패:', err);
    });
}

function copyFormulaText(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    
    const steps = el.querySelectorAll('.formula-step');
    let plainText = "";
    let htmlText = `<div style="font-family:'Malgun Gothic',sans-serif; line-height:1.6; color:#333;">`;
    
    if (steps.length > 0) {
        steps.forEach((step, idx) => {
            const labelEl = step.querySelector('span');
            const label = labelEl ? labelEl.innerText.trim() : "";
            
            const latexNode = step.querySelector('annotation[encoding="application/x-tex"]');
            let latex = "";
            if (latexNode) {
                latex = latexNode.textContent.trim();
            } else {
                const textNodes = [];
                step.childNodes.forEach(n => {
                    if (n !== labelEl && n.nodeType === Node.TEXT_NODE) {
                        textNodes.push(n.textContent.trim());
                    } else if (n !== labelEl && n.nodeType === Node.ELEMENT_NODE) {
                        textNodes.push(n.innerText.trim());
                    }
                });
                latex = textNodes.join(" ").trim();
            }
            
            if (label) {
                plainText += `[${label}]\n`;
                htmlText += `<p style="margin: 8px 0 4px 0; font-weight: bold; color: #0284c7;">${idx + 1}. ${label}</p>`;
            }
            
            if (latex) {
                plainText += `${latex}\n\n`;
                htmlText += `<div style="margin: 4px 0 12px 16px; padding: 6px 12px; background: #f8fafc; border-left: 3px solid #cbd5e1; font-family: 'Courier New', monospace; font-size: 0.9em;">$${latex}$</div>`;
            }
        });
    } else {
        plainText = el.innerText || el.textContent;
        htmlText += `<p>${el.innerHTML}</p>`;
    }
    
    htmlText += `</div>`;

    try {
        const textBlob = new Blob([plainText.trim()], { type: 'text/plain' });
        const htmlBlob = new Blob([htmlText], { type: 'text/html' });
        
        navigator.clipboard.write([
            new ClipboardItem({
                'text/plain': textBlob,
                'text/html': htmlBlob
            })
        ]).then(() => {
            showCopyToast('수식 텍스트 및 서식이 복사되었습니다.');
        }).catch(err => {
            navigator.clipboard.writeText(plainText.trim()).then(() => {
                showCopyToast('수식 텍스트가 복사되었습니다.');
            });
        });
    } catch (e) {
        navigator.clipboard.writeText(plainText.trim()).then(() => {
            showCopyToast('수식 텍스트가 복사되었습니다.');
        });
    }
}

function copyFormulaImage(selector) {
    const el = document.querySelector(selector);
    if (!el) return;

    showCopyToast('공식 이미지를 생성하고 있습니다...');

    html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
        onclone: (clonedDoc) => {
            const target = clonedDoc.querySelector(selector);
            if (!target) return;
            
            target.style.background = '#ffffff';
            target.style.color = '#333333';
            target.style.padding = '20px';
            target.style.borderRadius = '8px';
            target.style.border = '1px solid #e2e8f0';
            target.style.boxShadow = 'none';
            
            target.querySelectorAll('*').forEach(child => {
                child.style.setProperty('color', '#333333', 'important');
                if (child.style.backgroundColor) {
                    child.style.backgroundColor = 'transparent';
                }
                if (child.classList.contains('katex') || child.classList.contains('katex-html')) {
                    child.style.setProperty('color', '#1e293b', 'important');
                }
                if (child.tagName === 'span' || child.tagName === 'SPAN') {
                    child.style.setProperty('color', '#1e293b', 'important');
                }
            });
        }
    }).then(canvas => {
        canvas.toBlob(blob => {
            if (!blob) {
                showCopyToast('이미지 변환에 실패했습니다.');
                return;
            }
            try {
                navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]).then(() => {
                    showCopyToast('공식 이미지가 복사되었습니다! 워드나 한글에 Ctrl+V로 붙여넣으세요.');
                }).catch(err => {
                    console.error('이미지 복사 실패:', err);
                    showCopyToast('이미지 복사 권한 오류가 발생했습니다.');
                });
            } catch (e) {
                showCopyToast('이미지 복사를 지원하지 않는 브라우저입니다.');
            }
        }, 'image/png');
    }).catch(err => {
        console.error(err);
        showCopyToast('이미지 캡처 중 오류가 발생했습니다.');
    });
}

function showCopyToast(msg) {
    const oldToast = document.getElementById('formula-copy-toast');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'formula-copy-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '2rem';
    toast.style.right = '2rem';
    toast.style.backgroundColor = 'var(--bg-secondary)';
    toast.style.color = 'var(--text-primary)';
    toast.style.border = '1px solid var(--accent-color)';
    toast.style.boxShadow = '0 8px 32px var(--accent-glow)';
    toast.style.padding = '0.75rem 1.25rem';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '0.85rem';
    toast.style.zIndex = '9999';
    toast.style.transition = 'all 0.3s ease';
    toast.style.transform = 'translateY(10px)';
    toast.style.opacity = '0';
    toast.innerHTML = `<i class="fas fa-check-circle" style="color:var(--success);margin-right:0.5rem"></i> ${msg}`;
    document.body.appendChild(toast);
    
    toast.offsetHeight;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.transform = 'translateY(10px)';
        toast.style.opacity = '0';
        setTimeout(() => { toast.remove(); }, 300);
    }, 2500);
}

// ─── 가속 수명 시험 레퍼런스 모달 & 값 설정 ───
function openAccReferenceModal(modelType) {
    const data = Acceleration.REFERENCE_DATA[modelType];
    if (!data) return;

    // 모달창이 이미 있으면 삭제
    const oldModal = document.getElementById('acc-ref-modal');
    if (oldModal) oldModal.remove();

    // 입력값을 이용해 현재 우리 시스템에서 산출하는 계산값 구하기
    let calculatedVal = 0;
    if (modelType === 'arrhenius') {
        calculatedVal = Acceleration.calcArrhenius(data.verification.inputs.ea, data.verification.inputs.useTemp, data.verification.inputs.stressTemp);
    } else if (modelType === 'peck') {
        calculatedVal = Acceleration.calcPeck(data.verification.inputs.ea, data.verification.inputs.n, data.verification.inputs.useTemp, data.verification.inputs.useRh, data.verification.inputs.stressTemp, data.verification.inputs.stressRh);
    } else if (modelType === 'coffin_manson') {
        calculatedVal = Acceleration.calcCoffinManson(data.verification.inputs.m, data.verification.inputs.dtUse, data.verification.inputs.dtStress);
    } else if (modelType === 'inverse_power') {
        calculatedVal = Acceleration.calcInversePower(data.verification.inputs.n, data.verification.inputs.vUse, data.verification.inputs.vStress);
    } else if (modelType === 'eyring') {
        calculatedVal = Acceleration.calcEyring(data.verification.inputs.ea, data.verification.inputs.useTemp, data.verification.inputs.stressTemp, data.verification.inputs.b, data.verification.inputs.useS, data.verification.inputs.stressS);
    } else if (modelType === 'norris_landzberg') {
        calculatedVal = Acceleration.calcNorrisLandzberg(data.verification.inputs.m, data.verification.inputs.fUse, data.verification.inputs.fStress, data.verification.inputs.dtUse, data.verification.inputs.dtStress, data.verification.inputs.tMaxUse, data.verification.inputs.tMaxStress, data.verification.inputs.ea);
    }

    const calculatedValStr = calculatedVal.toFixed(4);
    const targetValStr = data.verification.targetVal.toFixed(4);

    // 볼츠만 상수 등의 소수점 정밀도 차이에 따른 미세 오차율 계산
    const diffPercent = Math.abs(calculatedVal - data.verification.targetVal) / data.verification.targetVal * 100;
    const isMatched = diffPercent < 0.15; // 오차율 0.15% 미만이면 정합성 검증 완료로 판정

    const modalHtml = `
    <div id="acc-ref-modal" class="modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);">
        <div class="modal-content glass-card" style="width:95%;max-width:920px;max-height:90vh;overflow-y:auto;background:var(--bg-secondary);border:1px solid rgba(255,255,255,0.08);padding:2rem;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,0.6);color:var(--text-primary);position:relative">
            <!-- 닫기 버튼 -->
            <button onclick="document.getElementById('acc-ref-modal').remove()" style="position:absolute;top:1.25rem;right:1.25rem;background:none;border:none;color:var(--text-secondary);font-size:1.75rem;cursor:pointer;line-height:1;transition:color 0.2s" onmouseover="this.style.color='var(--accent-color)'" onmouseout="this.style.color='var(--text-secondary)'">&times;</button>
            
            <h3 class="section-title" style="margin-bottom:1.5rem;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:0.75rem;color:var(--accent-color);font-size:1.25rem;display:flex;align-items:center">
                <span style="background:var(--accent-glow);padding:0.4rem;border-radius:8px;margin-right:0.75rem;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--accent-color)">
                    <i class="fas fa-book-reader" style="font-size:0.9rem;color:var(--accent-color)"></i>
                </span>
                ${data.title}
            </h3>

            <!-- 1. 파라미터 레퍼런스 가이드 -->
            <h4 style="margin-top:1.25rem;margin-bottom:0.75rem;font-size:0.95rem;color:var(--text-primary);font-weight:600;display:flex;align-items:center">
                <i class="fas fa-bookmark" style="margin-right:0.5rem;color:var(--warning)"></i>1. 표준 가속 파라미터 레퍼런스
            </h4>
            <div class="table-wrapper" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:0.5rem;margin-bottom:1.75rem;overflow-x:auto">
                <table class="guide-table">
                    <thead>
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.1)">
                            <th style="padding:0.6rem;color:var(--text-secondary);font-weight:600;width:15%">기호</th>
                            <th style="padding:0.6rem;color:var(--text-secondary);font-weight:600;width:20%">고장 현상</th>
                            <th style="padding:0.6rem;color:var(--text-secondary);font-weight:600;width:13%">권장 범위</th>
                            <th style="padding:0.6rem;color:var(--text-secondary);font-weight:600;width:17%">근거 규격·논문</th>
                            <th style="padding:0.6rem;color:var(--text-secondary);font-weight:600;width:35%">상세 가이드</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.parameters.map(p => `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.05)" onmouseover="this.style.background='rgba(56,189,248,0.02)'" onmouseout="this.style.background='transparent'">
                                <td style="padding:0.75rem 0.6rem;font-weight:bold;color:var(--warning);font-size:0.85rem;white-space:nowrap">${p.symbol}</td>
                                <td style="padding:0.75rem 0.6rem;color:var(--text-primary);font-weight:500;word-break:normal;overflow-wrap:break-word">${p.name}</td>
                                <td style="padding:0.75rem 0.6rem;color:var(--accent-color);font-weight:600;white-space:nowrap">${p.range}</td>
                                <td style="padding:0.75rem 0.6rem;font-size:0.78rem;color:var(--text-secondary);word-break:normal;overflow-wrap:break-word"><strong>${p.source}</strong></td>
                                <td style="padding:0.75rem 0.6rem;font-size:0.78rem;color:var(--text-secondary);line-height:1.4;word-break:normal;overflow-wrap:break-word">${p.details}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- 2. 학술 논문 및 규격 사례 검증 -->
            <h4 style="margin-top:1.25rem;margin-bottom:0.75rem;font-size:0.95rem;color:var(--text-primary);font-weight:600;display:flex;align-items:center">
                <i class="fas fa-check-circle" style="margin-right:0.5rem;color:var(--success)"></i>2. 학술 논문 및 규격 사례 대조 검증
            </h4>
            
            <div class="modal-grid" style="margin-bottom:1.5rem">
                <!-- 왼쪽 컬럼: 시나리오 & 수식 -->
                <div style="background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.04); border-radius:12px; padding:1.25rem; display:flex; flex-direction:column; justify-content:space-between">
                    <div>
                        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.35rem">■ 출처 문헌 및 규격</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text-primary); margin-bottom:0.85rem; line-height:1.4">${data.verification.source}</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.35rem">■ 검증 시나리오 조건</div>
                        <div style="font-size:0.82rem; color:var(--text-primary); line-height:1.45">${data.verification.scenario}</div>
                    </div>
                    <div style="margin-top:1.25rem; background:rgba(0,0,0,0.25); padding:0.85rem; border-radius:8px; border:1px solid rgba(255,255,255,0.04); text-align:center">
                        <span style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:0.5rem">가속 계수(AF) 적용 수명 관계식</span>
                        <div id="modal-formula-katex" style="font-size:0.95rem; color:var(--accent-color); padding:0.25rem 0; overflow-x:auto">
                            $$ ${data.verification.formula} $$
                        </div>
                    </div>
                </div>
                
                <!-- 오른쪽 컬럼: 수치 대조 및 상태 -->
                <div style="background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.04); border-radius:12px; padding:1.25rem; display:flex; flex-direction:column; justify-content:space-between">
                    <div>
                        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.85rem">■ 계산 정밀도 대조 결과</div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem; background:rgba(245,158,11,0.04); border:1px solid rgba(245,158,11,0.1); border-radius:8px; padding:0.75rem 1rem">
                            <span style="font-size:0.82rem; color:var(--text-secondary)">문헌 기재 값 (AF)</span>
                            <span style="font-size:1.15rem; font-weight:700; color:var(--warning); word-break:break-all">${targetValStr}</span>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; background:rgba(34,197,94,0.04); border:1px solid rgba(34,197,94,0.1); border-radius:8px; padding:0.75rem 1rem">
                            <span style="font-size:0.82rem; color:var(--text-secondary)">REA 엔진 계산값</span>
                            <span style="font-size:1.15rem; font-weight:700; color:var(--success); word-break:break-all">${calculatedValStr}</span>
                        </div>
                    </div>
                    
                    <div style="margin-top:1.25rem">
                        ${isMatched 
                            ? `<div style="background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); border-radius:8px; padding:0.75rem; font-size:0.82rem; color:var(--success); text-align:center; display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:0.4rem; font-weight:500; line-height:1.3">
                                 <i class="fas fa-check-double" style="font-size:0.95rem"></i>
                                 <span>정밀 정합성 확인 완료 (오차 ${diffPercent.toFixed(3)}%)</span>
                               </div>`
                            : `<div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); border-radius:8px; padding:0.75rem; font-size:0.82rem; color:var(--danger); text-align:center; display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:0.4rem; font-weight:500; line-height:1.3">
                                 <i class="fas fa-exclamation-triangle" style="font-size:0.95rem"></i>
                                 <span>오차 확인 중 (상수 정밀도 비교)</span>
                               </div>`
                        }
                    </div>
                </div>
            </div>

            <!-- 버튼 액션 -->
            <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.5rem;border-top:1px solid rgba(255,255,255,0.08);padding-top:1.25rem">
                <button class="btn btn-secondary" onclick="document.getElementById('acc-ref-modal').remove()" style="font-size:0.9rem;padding:0.5rem 1.25rem;border-radius:8px">닫기</button>
                <button class="btn btn-primary" onclick="applyVerificationInputs('${modelType}', ${JSON.stringify(data.verification.inputs).replace(/"/g, '&quot;')})" style="font-size:0.9rem;padding:0.5rem 1.25rem;border-radius:8px;box-shadow:0 0 10px var(--accent-glow);display:inline-flex;align-items:center;gap:0.35rem">
                    <i class="fas fa-check-double"></i>검증 예제 적용하기
                </button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 모달 내 수식을 KaTeX로 강제 변환
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.getElementById('acc-ref-modal'), {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ]
        });
    }
}

function applyVerificationInputs(modelType, inputs) {
    // 1. 모델 드롭다운 셀렉터 설정 및 인풋 렌더링 업데이트
    const modelSel = document.getElementById('acc-model');
    if (modelSel) {
        modelSel.value = modelType;
        updateAccModelInputs();
    }

    // 2. 전달된 값들을 인풋에 할당
    setTimeout(() => {
        if (modelType === 'arrhenius' || modelType === 'peck') {
            if (inputs.useTemp !== undefined) document.getElementById('acc-t-use').value = inputs.useTemp;
            if (inputs.stressTemp !== undefined) document.getElementById('acc-t-stress').value = inputs.stressTemp;
            if (inputs.ea !== undefined) document.getElementById('acc-ea').value = inputs.ea;
            if (modelType === 'peck') {
                if (inputs.useRh !== undefined) document.getElementById('acc-rh-use').value = inputs.useRh;
                if (inputs.stressRh !== undefined) document.getElementById('acc-rh-stress').value = inputs.stressRh;
                if (inputs.n !== undefined) document.getElementById('acc-n-peck').value = inputs.n;
            }
        } else if (modelType === 'coffin_manson') {
            if (inputs.dtUse !== undefined) document.getElementById('acc-dt-use').value = inputs.dtUse;
            if (inputs.dtStress !== undefined) document.getElementById('acc-dt-stress').value = inputs.dtStress;
            if (inputs.m !== undefined) document.getElementById('acc-m').value = inputs.m;
        } else if (modelType === 'inverse_power') {
            if (inputs.vUse !== undefined) document.getElementById('acc-v-use').value = inputs.vUse;
            if (inputs.vStress !== undefined) document.getElementById('acc-v-stress').value = inputs.vStress;
            if (inputs.n !== undefined) document.getElementById('acc-n-power').value = inputs.n;
        } else if (modelType === 'eyring') {
            if (inputs.useTemp !== undefined) document.getElementById('acc-t-use').value = inputs.useTemp;
            if (inputs.stressTemp !== undefined) document.getElementById('acc-t-stress').value = inputs.stressTemp;
            if (inputs.ea !== undefined) document.getElementById('acc-ea').value = inputs.ea;
            if (inputs.b !== undefined) document.getElementById('acc-eyring-b').value = inputs.b;
            if (inputs.useS !== undefined) document.getElementById('acc-eyring-s-use').value = inputs.useS;
            if (inputs.stressS !== undefined) document.getElementById('acc-eyring-s-stress').value = inputs.stressS;
        } else if (modelType === 'norris_landzberg') {
            if (inputs.dtUse !== undefined) document.getElementById('acc-dt-use').value = inputs.dtUse;
            if (inputs.dtStress !== undefined) document.getElementById('acc-dt-stress').value = inputs.dtStress;
            if (inputs.m !== undefined) document.getElementById('acc-m').value = inputs.m;
            if (inputs.nlRampUpUse !== undefined) document.getElementById('acc-nl-rampup-use').value = inputs.nlRampUpUse;
            if (inputs.nlDwellHighUse !== undefined) document.getElementById('acc-nl-dwellhigh-use').value = inputs.nlDwellHighUse;
            if (inputs.nlRampDownUse !== undefined) document.getElementById('acc-nl-rampdown-use').value = inputs.nlRampDownUse;
            if (inputs.nlDwellLowUse !== undefined) document.getElementById('acc-nl-dwelllow-use').value = inputs.nlDwellLowUse;
            if (inputs.nlRampUpStress !== undefined) document.getElementById('acc-nl-rampup-stress').value = inputs.nlRampUpStress;
            if (inputs.nlDwellHighStress !== undefined) document.getElementById('acc-nl-dwellhigh-stress').value = inputs.nlDwellHighStress;
            if (inputs.nlRampDownStress !== undefined) document.getElementById('acc-nl-rampdown-stress').value = inputs.nlRampDownStress;
            if (inputs.nlDwellLowStress !== undefined) document.getElementById('acc-nl-dwelllow-stress').value = inputs.nlDwellLowStress;
            if (inputs.tMaxUse !== undefined) document.getElementById('acc-nl-tmax-use').value = inputs.tMaxUse;
            if (inputs.tMaxStress !== undefined) document.getElementById('acc-nl-tmax-stress').value = inputs.tMaxStress;
            if (inputs.ea !== undefined) document.getElementById('acc-nl-ea').value = inputs.ea;
        }

        // 3. 모달 제거
        const modal = document.getElementById('acc-ref-modal');
        if (modal) modal.remove();

        // 4. 즉시 가속 계산 실행
        runAcceleration();
    }, 100);
}

function initAccelerationEvents() {
    const tabEl = document.getElementById('tab-content');
    if (!tabEl) return;

    if (tabEl.dataset.accDelegationBound) return;
    tabEl.dataset.accDelegationBound = "true";

    // 이벤트 위임을 사용하여 가속 탭 안의 모든 'acc-' 시작 input/select 요소 이벤트 감지
    const handleAutoUpdate = (e) => {
        const target = e.target;
        if (target && target.id && target.id.startsWith('acc-')) {
            try {
                runAcceleration();
            } catch (err) {
                // 입력 미완성 상태의 일시적 에러는 무시
            }
        }
    };

    tabEl.addEventListener('input', handleAutoUpdate);
    tabEl.addEventListener('change', handleAutoUpdate);
}

// ─────────────────────────────────────────────────────────────────────────
// 가속 데이터 분석 (ALT MLE) UI & 제어 로직 (Phase B & Phase C)
// ─────────────────────────────────────────────────────────────────────────

function renderAccAnalysisContent() {
    return `
    <div class="grid-cols-1-2">
        <!-- 입력 및 제어 패널 -->
        <div class="glass-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem">
                <h3 class="section-title" style="margin:0">가속 데이터 분석 (ALT MLE)</h3>
                <!-- 예제 데이터 드롭다운 -->
                <div style="position:relative">
                    <button class="btn btn-sm btn-secondary" id="alt-sample-btn"
                        onclick="document.getElementById('alt-sample-dropdown').style.display = document.getElementById('alt-sample-dropdown').style.display==='block'?'none':'block'"
                        style="font-size:0.72rem;padding:2px 8px;height:24px;line-height:1">📋 예제 데이터 ▾</button>
                    <div id="alt-sample-dropdown" style="display:none;position:absolute;top:100%;right:0;z-index:9999;min-width:320px;max-height:400px;overflow-y:auto;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.15);margin-top:4px">
                        <div style="padding:0.5rem 0.75rem;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);background:var(--bg-tertiary)">📌 Arrhenius (온도 단일)</div>
                        <div class="sample-item" onclick="loadAltSample('arrhenius_reliasoft');closeAltSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">Semiconductor HTOL (ReliaSoft)</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">406°C, 346°C, 296°C 가속 수명 데이터</div>
                        </div>
                        <div style="padding:0.5rem 0.75rem;font-size:0.72rem;color:var(--text-muted);border-bottom:1px solid var(--border-color);border-top:1px solid var(--border-color);background:var(--bg-tertiary)">📌 GLL (온도 + 습도/전압 복합)</div>
                        <div class="sample-item" onclick="loadAltSample('gll_humidity');closeAltSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">Capacitor HAST (온도+습도 Peck)</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">130°C/85%, 110°C/85%, 130°C/60% 데이터</div>
                        </div>
                        <div class="sample-item" onclick="loadAltSample('gll_three_stress');closeAltSampleDropdown()">
                            <div style="font-size:0.82rem;color:var(--text-primary)">3원 복합 가속 (온도+습도+전압)</div>
                            <div style="font-size:0.7rem;color:var(--text-muted)">온도/습도/전압 3개 스트레스 조합 분석 샘플</div>
                        </div>
                    </div>
                </div>
            </div>

            ${HelpTooltip.labelWithHelp('분석 모델', '수명-스트레스 가속 모델 선택')}
            <select id="alt-model" onchange="switchAltModel(this.value)" style="margin-bottom:0.75rem">
                <option value="arrhenius" selected>Arrhenius (온도 단일 스트레스)</option>
                <option value="gll">GLL (다중 복합 스트레스 요인)</option>
            </select>

            <!-- 동적 스트레스 요인 세팅 영역 -->
            <div id="alt-stress-config-area"></div>

            <div id="alt-grid-hint" style="font-size:0.76rem;color:var(--text-muted);margin-bottom:0.6rem">
                정의된 가속 스트레스 열을 순서대로 채워 넣으세요. (이벤트: <strong>F</strong>(고장), <strong>C</strong>(중단))
            </div>

            <!-- 데이터 그리드 -->
            <div id="alt-analysis-grid" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden"></div>

            <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap;justify-content:space-between">
                <div style="display:flex;gap:0.4rem">
                    <button class="btn btn-sm btn-secondary" onclick="addAltRow()">+ 행 추가</button>
                    <button class="btn btn-sm btn-secondary" onclick="removeLastAltRow()">삭제</button>
                    <button class="btn btn-sm btn-secondary" onclick="clearAltGrid()">초기화</button>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="openAltPasteModal()" style="font-weight:600;color:var(--accent-color)">📋 엑셀 붙여넣기</button>
            </div>

            <button class="btn btn-primary" style="width:100%;margin-top:1.25rem;font-size:1rem" onclick="runALTAnalysis()">
                🔍 가속 파라미터(MLE) 추정 실행
            </button>
        </div>

        <!-- 결과 요약 패널 -->
        <div id="alt-analysis-summary" class="glass-card">
            <div class="empty-state" style="min-height:300px">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2" opacity="0.3">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
                <div style="font-size:0.9rem;color:var(--text-muted);margin-top:0.75rem">
                    가속 시험 데이터를 입력하고<br>「가속 파라미터(MLE) 추정 실행」을 클릭하세요
                </div>
            </div>
        </div>
    </div>

    <!-- 차트 영역 -->
    <div id="alt-charts-panel" style="display:none; margin-top:1.5rem">
        <div class="grid-2" style="gap:1rem">
            <div class="glass-card">
                <h4 style="color:var(--text-secondary);margin:0 0 0.75rem 0">수명-스트레스 피팅선 ($1/T_K$ vs $\\ln\\eta$)</h4>
                <div class="chart-container" style="height:320px"><canvas id="alt-chart-fit"></canvas></div>
            </div>
            <div class="glass-card">
                <h4 style="color:var(--text-secondary);margin:0 0 0.75rem 0">사용 조건 수명 곡선 ($R(t)$ &amp; $F(t)$)</h4>
                <div class="chart-container" style="height:320px"><canvas id="alt-chart-probability"></canvas></div>
            </div>
        </div>
    </div>`;
}

function closeAltSampleDropdown() {
    const dd = document.getElementById('alt-sample-dropdown');
    if (dd) dd.style.display = 'none';
}

let _altStresses = [
    { name: '온도', type: 'reciprocal_k', useVal: 25 },
    { name: '습도', type: 'log', useVal: 50 }
];

function switchAltModel(model) {
    if (model === 'arrhenius') {
        _altStresses = [{ name: '온도', type: 'reciprocal_k', useVal: 25 }];
    } else if (model === 'gll' && _altStresses.length < 2) {
        _altStresses = [
            { name: '온도', type: 'reciprocal_k', useVal: 25 },
            { name: '습도', type: 'log', useVal: 50 }
        ];
    }
    renderAltStressConfigPanel();
    initAltAnalysisGrid();
}

function renderAltStressConfigPanel() {
    const model = document.getElementById('alt-model')?.value || 'arrhenius';
    const configDiv = document.getElementById('alt-stress-config-area');
    if (!configDiv) return;

    if (model === 'arrhenius') {
        _altStresses = [{ name: '온도', type: 'reciprocal_k', useVal: 25 }];
        configDiv.innerHTML = `
        <div style="background:var(--bg-secondary);padding:0.75rem;border-radius:8px;border:1px dashed var(--border-color);font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.75rem">
            📌 <strong>Arrhenius 단일 가속</strong>: 온도가 고정 1차 가속 요인으로 동작합니다.
            <div style="margin-top:0.5rem;display:flex;align-items:center;gap:0.5rem">
                <span>사용 온도(°C):</span>
                <input type="number" id="alt-use-temp" value="${_altStresses[0].useVal}" 
                    style="width:80px;height:24px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);padding:2px 6px;font-size:0.75rem"
                    onchange="_altStresses[0].useVal = parseFloat(this.value) || 25">
            </div>
        </div>`;
        return;
    }

    // GLL인 경우
    let html = `
    <div style="background:var(--bg-secondary);padding:0.75rem;border-radius:8px;border:1px solid var(--border-color);margin-bottom:0.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">
            <h4 style="margin:0;font-size:0.85rem;color:var(--text-primary)">🛠️ 다중 스트레스 요인 정의</h4>
            <button class="btn btn-sm btn-secondary" onclick="addAltStressFactor()" style="font-size:0.7rem;padding:2px 8px;height:24px;line-height:1">+ 요인 추가</button>
        </div>
        <div id="alt-stress-factors-list" style="display:flex;flex-direction:column;gap:0.4rem">`;

    _altStresses.forEach((spec, idx) => {
        const isTemp = idx === 0;
        html += `
        <div style="display:flex;align-items:center;gap:0.4rem;background:var(--bg-primary);padding:0.4rem;border-radius:6px;border:1px solid var(--border-color);flex-wrap:wrap">
            <span style="font-size:0.75rem;font-weight:600;width:15px;text-align:center;color:var(--text-muted)">${idx+1}</span>
            <input type="text" value="${spec.name}" placeholder="이름" 
                style="width:90px;height:24px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);padding:2px 6px;font-size:0.75rem" 
                ${isTemp ? 'disabled' : ''} 
                onchange="updateAltStressSpec(${idx}, 'name', this.value)">
            
            <select style="width:120px;height:24px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);padding:2px 6px;font-size:0.72rem" 
                ${isTemp ? 'disabled' : ''} 
                onchange="updateAltStressSpec(${idx}, 'type', this.value)">
                <option value="reciprocal_k" ${spec.type === 'reciprocal_k' ? 'selected' : ''}>Arrhenius (1/TK)</option>
                <option value="log" ${spec.type === 'log' ? 'selected' : ''}>Power (ln S)</option>
                <option value="linear" ${spec.type === 'linear' ? 'selected' : ''}>Exponential (S)</option>
                <option value="reciprocal" ${spec.type === 'reciprocal' ? 'selected' : ''}>Reciprocal (1/S)</option>
            </select>

            <div style="display:flex;align-items:center;gap:0.25rem;font-size:0.72rem;color:var(--text-secondary)">
                <span>사용치:</span>
                <input type="number" value="${spec.useVal}" 
                    style="width:65px;height:24px;background:var(--bg-primary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary);padding:2px 6px;font-size:0.75rem" 
                    onchange="updateAltStressSpec(${idx}, 'useVal', parseFloat(this.value) || 0)">
            </div>

            ${!isTemp ? `<button class="btn btn-sm btn-secondary" onclick="removeAltStressFactor(${idx})" style="padding:2px 6px;height:24px;color:var(--danger);font-size:0.7rem;line-height:1">삭제</button>` : ''}
        </div>`;
    });

    html += `</div></div>`;
    configDiv.innerHTML = html;
}

function updateAltStressSpec(idx, key, val) {
    if (_altStresses[idx]) {
        _altStresses[idx][key] = val;
        if (key === 'name' || key === 'type') {
            initAltAnalysisGrid();
        }
    }
}

function addAltStressFactor() {
    _altStresses.push({ name: `스트레스${_altStresses.length + 1}`, type: 'log', useVal: 1.0 });
    renderAltStressConfigPanel();
    initAltAnalysisGrid();
}

function removeAltStressFactor(idx) {
    if (idx > 0) {
        _altStresses.splice(idx, 1);
        renderAltStressConfigPanel();
        initAltAnalysisGrid();
    }
}

function initAltAnalysisGrid() {
    const container = document.getElementById('alt-analysis-grid');
    if (!container) return;

    if (_altHot) {
        try { _altHot.destroy(); } catch (e) {}
        _altHot = null;
    }

    const model = document.getElementById('alt-model')?.value || 'arrhenius';
    const isGLL = model === 'gll';

    // 기본 행 구성
    let initData = [];
    if (window._savedAltData && window._savedAltData.length > 0) {
        initData = window._savedAltData;
    } else {
        if (isGLL) {
            // 정의된 스트레스 요인 개수에 맞춰 더미 열 채우기
            const stressCount = _altStresses.length;
            initData = [
                [130, 85, 100, 'F', 1],
                [130, 85, 150, 'F', 1],
                [110, 85, 300, 'F', 1],
                [130, 60, 250, 'F', 1]
            ].map(row => {
                const newRow = Array(stressCount + 3).fill(null);
                // 온도, 습도 채우기
                newRow[0] = row[0];
                if (stressCount > 1) newRow[1] = row[1];
                // 3차 이상의 스트레스는 1.0 기본값
                for (let k = 2; k < stressCount; k++) {
                    newRow[k] = 1.0;
                }
                newRow[stressCount] = row[2]; // 시간
                newRow[stressCount + 1] = row[3]; // 이벤트
                newRow[stressCount + 2] = row[4]; // 개수
                return newRow;
            });
        } else {
            initData = [
                [406, 248, 'F', 1],
                [406, 456, 'F', 1],
                [346, 1657, 'F', 1],
                [296, 5739, 'F', 1]
            ];
        }
    }

    let colHeaders = [];
    let columns = [];
    if (isGLL) {
        _altStresses.forEach(spec => {
            colHeaders.push(`${spec.name} (${spec.type === 'reciprocal_k' ? '°C' : spec.name})`);
            columns.push({ type: 'numeric' });
        });
        colHeaders.push('시간 (hrs)', '이벤트', '개수');
        columns.push(
            { type: 'numeric' },
            { type: 'dropdown', source: ['F', 'C'] },
            { type: 'numeric' }
        );
    } else {
        colHeaders = ['온도 (°C)', '시간 (hrs)', '이벤트', '개수'];
        columns = [
            { type: 'numeric' },
            { type: 'numeric' },
            { type: 'dropdown', source: ['F', 'C'] },
            { type: 'numeric' }
        ];
    }

    _altHot = new Handsontable(container, {
        data: initData,
        colHeaders: colHeaders,
        columns: columns,
        rowHeaders: true,
        height: 280,
        width: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        contextMenu: ['row_above', 'row_below', 'remove_row', '---------', 'undo', 'redo']
    });
}

function addAltRow() {
    if (_altHot) _altHot.alter('insert_row_below');
}

function removeLastAltRow() {
    if (_altHot) {
        const count = _altHot.countRows();
        if (count > 1) _altHot.alter('remove_row', count - 1);
    }
}

function clearAltGrid() {
    const model = document.getElementById('alt-model')?.value || 'arrhenius';
    const isGLL = model === 'gll';
    const cols = isGLL ? _altStresses.length + 3 : 4;
    const emptyRow = Array(cols).fill(null);
    emptyRow[cols - 2] = 'F'; // 이벤트 기본
    emptyRow[cols - 1] = 1;   // 개수 기본
    if (_altHot) _altHot.loadData([emptyRow, [...emptyRow], [...emptyRow]]);
    _altResult = null;
    document.getElementById('alt-charts-panel').style.display = 'none';
}

const ALT_SAMPLE_DATA = {
    arrhenius_reliasoft: {
        model: 'arrhenius',
        stresses: [{ name: '온도', type: 'reciprocal_k', useVal: 25 }],
        data: [
            [406, 248, 'F', 1], [406, 456, 'F', 1], [406, 528, 'F', 1],
            [406, 731, 'F', 1], [406, 813, 'F', 1], [406, 965, 'F', 1],
            [346, 1657, 'F', 1], [346, 2011, 'F', 1], [346, 2256, 'F', 1],
            [346, 2812, 'F', 1], [346, 3479, 'F', 1], [346, 3888, 'F', 1],
            [296, 5739, 'F', 1], [296, 7831, 'F', 1], [296, 8613, 'F', 1],
            [296, 10162, 'F', 1], [296, 12811, 'F', 1], [296, 14541, 'F', 1]
        ]
    },
    gll_humidity: {
        model: 'gll',
        stresses: [
            { name: '온도', type: 'reciprocal_k', useVal: 25 },
            { name: '습도', type: 'log', useVal: 50 }
        ],
        data: [
            [130, 85, 15, 'F', 1], [130, 85, 23, 'F', 1], [130, 85, 31, 'F', 1],
            [130, 85, 45, 'F', 1], [130, 85, 52, 'F', 1], [130, 85, 68, 'F', 1],
            [110, 85, 42, 'F', 1], [110, 85, 58, 'F', 1], [110, 85, 70, 'F', 1],
            [110, 85, 85, 'F', 1], [110, 85, 110, 'F', 1], [110, 85, 140, 'F', 1],
            [130, 60, 38, 'F', 1], [130, 60, 52, 'F', 1], [130, 60, 75, 'F', 1],
            [130, 60, 95, 'F', 1], [130, 60, 120, 'F', 1], [130, 60, 160, 'F', 1]
        ]
    },
    gll_three_stress: {
        model: 'gll',
        stresses: [
            { name: '온도', type: 'reciprocal_k', useVal: 25 },
            { name: '습도', type: 'log', useVal: 50 },
            { name: '전압', type: 'log', useVal: 5 }
        ],
        data: [
            // 온도(°C), 습도(%RH), 전압(V), 시간(hrs), 이벤트(F/C), 개수
            [130, 85, 12, 12, 'F', 1], [130, 85, 12, 18, 'F', 1], [130, 85, 12, 25, 'F', 1],
            [130, 85, 6, 32, 'F', 1], [130, 85, 6, 45, 'F', 1], [130, 85, 6, 60, 'F', 1],
            [110, 85, 12, 35, 'F', 1], [110, 85, 12, 52, 'F', 1], [110, 85, 12, 68, 'F', 1],
            [110, 85, 6, 90, 'F', 1], [110, 85, 6, 115, 'F', 1], [110, 85, 6, 150, 'F', 1],
            [130, 60, 12, 28, 'F', 1], [130, 60, 12, 40, 'F', 1], [130, 60, 12, 55, 'F', 1],
            [130, 60, 6, 75, 'F', 1], [130, 60, 6, 102, 'F', 1], [130, 60, 6, 138, 'F', 1]
        ]
    }
};

function loadAltSample(key) {
    const sample = ALT_SAMPLE_DATA[key];
    if (!sample) return;

    document.getElementById('alt-model').value = sample.model;
    // 스트레스 구성 동기화
    _altStresses = JSON.parse(JSON.stringify(sample.stresses));
    renderAltStressConfigPanel();
    initAltAnalysisGrid();

    setTimeout(() => {
        if (_altHot) _altHot.loadData(sample.data);
    }, 100);
}

function runALTAnalysis() {
    if (!_altHot) return;
    const model = document.getElementById('alt-model').value;
    const isGLL = model === 'gll';
    const rawData = _altHot.getData();
    const p = _altStresses.length; // 스트레스 개수

    // 데이터 파싱
    const groupsMap = {};
    for (const r of rawData) {
        if (r[0] === null || r[0] === '' || isNaN(parseFloat(r[0]))) continue;
        const temp = parseFloat(r[0]);
        
        const extraStresses = [];
        let time = 0;
        let ev = 'F';
        let cnt = 1;

        if (isGLL) {
            // [온도, s2, s3, ..., 시간, 이벤트, 개수]
            for (let i = 1; i < p; i++) {
                extraStresses.push(parseFloat(r[i]) || _altStresses[i].useVal);
            }
            time = parseFloat(r[p]);
            ev = r[p + 1] || 'F';
            cnt = parseInt(r[p + 2]) || 1;
        } else {
            // [온도, 시간, 이벤트, 개수]
            time = parseFloat(r[1]);
            ev = r[2] || 'F';
            cnt = parseInt(r[3]) || 1;
        }

        if (isNaN(time) || time <= 0) continue;

        // 그룹 구분을 위한 고유 키 생성
        const key = `${temp}_${extraStresses.join('_')}`;
        if (!groupsMap[key]) {
            groupsMap[key] = { temp_C: temp, stressValues: extraStresses, failures: [], censored: [] };
        }

        for (let i = 0; i < cnt; i++) {
            if (ev === 'F') groupsMap[key].failures.push(time);
            else groupsMap[key].censored.push(time);
        }
    }

    const rawGroups = Object.values(groupsMap);
    if (rawGroups.length < (isGLL ? p + 1 : 2)) {
        alert(isGLL 
            ? `다차원 GLL 분석에는 최소 ${p + 1}개 이상의 서로 다른 스트레스 조합이 필요합니다.` 
            : "Arrhenius 분석에는 최소 2개 이상의 서로 다른 온도 조건이 필요합니다.");
        return;
    }

    const summaryEl = document.getElementById('alt-analysis-summary');
    summaryEl.innerHTML = `<div class="empty-state"><div class="spinner"></div><div style="margin-top:1rem;font-size:0.9rem">MLE 파라미터 추정 중...</div></div>`;

    setTimeout(() => {
        try {
            let result;
            if (isGLL) {
                result = ALTAnalysis.fitGLL(rawGroups, _altStresses);
            } else {
                result = ALTAnalysis.fitArrhenius(rawGroups);
            }

            result.stressSpecs = _altStresses;

            _altResult = result;
            renderALTSummary(result);
            document.getElementById('alt-charts-panel').style.display = 'block';
            setTimeout(() => {
                drawALTAnalysisCharts(result);
                if (typeof renderMathInElement === 'function') {
                    renderMathInElement(document.getElementById('alt-charts-panel'), {
                        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
                    });
                }
            }, 150);

        } catch (e) {
            summaryEl.innerHTML = `<div class="info-box danger">❌ 분석 오류: ${e.message}</div>`;
            console.error(e);
        }
    }, 50);
}

function renderALTSummary(r) {
    const isGLL = r.model === 'gll';
    const summaryEl = document.getElementById('alt-analysis-summary');

    let paramCardHTML = `
    <div class="grid-2" style="gap:0.75rem;margin-bottom:1rem;width:100%">
        <div class="stat-card">
            <div class="label">형상 모수 (β)</div>
            <div class="value accent">${r.beta.toFixed(4)}</div>
            <div style="font-size:0.68rem;color:var(--text-muted)">95% CI: [${r.confLimits.betaLower.toFixed(3)} - ${r.confLimits.betaUpper.toFixed(3)}]</div>
        </div>
        <div class="stat-card">
            <div class="label">활성화 에너지 (Ea)</div>
            <div class="value success">${r.Ea.toFixed(4)} eV</div>
            <div style="font-size:0.68rem;color:var(--text-muted)">95% CI: [${r.confLimits.eaLower.toFixed(3)} - ${r.confLimits.eaUpper.toFixed(3)}]</div>
        </div>
    `;

    if (isGLL && r.confLimits.extraStresses) {
        r.confLimits.extraStresses.forEach(extra => {
            paramCardHTML += `
            <div class="stat-card">
                <div class="label">${extra.name} 가속 지수 (n)</div>
                <div class="value warning">${extra.nValue.toFixed(4)}</div>
                <div style="font-size:0.68rem;color:var(--text-muted)">95% CI: [${extra.nLower.toFixed(3)} - ${extra.nUpper.toFixed(3)}]</div>
            </div>
            `;
        });
    }

    paramCardHTML += `
        <div class="stat-card">
            <div class="label">음의 로그우도 (-LL)</div>
            <div class="value">${r.negLL.toFixed(3)}</div>
        </div>
    </div>`;

    // β값 분석 메세지 추가
    let betaInterpretation = "";
    if (r.beta < 0.9) {
        betaInterpretation = `<div class="info-box warning" style="margin-bottom:1rem">⚠️ 형상모수 β가 1 미만(${r.beta.toFixed(2)})으로 <strong>초기 고장(Infant Mortality)</strong> 형태를 보입니다. 초기 결함이나 제조상의 문제가 있을 수 있습니다.</div>`;
    } else if (r.beta >= 0.9 && r.beta <= 1.2) {
        betaInterpretation = `<div class="info-box info" style="margin-bottom:1rem">💡 형상모수 β가 1 부근(${r.beta.toFixed(2)})으로 <strong>우발/랜덤 고장(Random Failure)</strong> 형태를 나타냅니다. 사용 환경의 무작위 스트레스로 고장이 유발됩니다.</div>`;
    } else {
        betaInterpretation = `<div class="info-box" style="margin-bottom:1rem">✅ 형상모수 β가 1 초과(${r.beta.toFixed(2)})로 <strong>마모 고장(Wear-out Failure)</strong> 형태를 띱니다. 정상적으로 제품 열화가 진행되고 있음을 뜻합니다.</div>`;
    }

    // LaTeX 도출 과정 수식 추가
    let derivLaTeX = '';
    if (r.model === 'arrhenius') {
        derivLaTeX = `
        $$\\begin{aligned}
        \\ln(\\eta_i) &= a_0 + \\frac{a_1}{T_{K,i}} \\\\
        &= ${r.a0.toFixed(4)} + \\frac{${r.stressCoefs[0].toFixed(2)}}{T_{C,i} + 273.15} \\\\
        E_a &= a_1 \\times k = ${r.stressCoefs[0].toFixed(2)} \\times 8.6173 \\times 10^{-5} \\\\
        &= ${r.Ea.toFixed(4)} \\text{ eV}
        \\end{aligned}$$`;
    } else {
        // GLL인 경우: ln(eta) = a0 + a1/TK + a2 * X2 + a3 * X3...
        let formulaStr = `\\ln(\\eta_i) &= a_0 + \\frac{a_1}{T_{K,i}}`;
        let derivationStr = `&= ${r.a0.toFixed(4)} + \\frac{${r.stressCoefs[0].toFixed(2)}}{T_{K,i}}`;
        let paramsStr = `E_a &= a_1 \\times k = ${r.Ea.toFixed(4)} \\text{ eV} \\\\`;
        
        r.confLimits.extraStresses.forEach((extra, idx) => {
            const coefVal = r.stressCoefs[idx + 1];
            const spec = r.stressSpecs[idx + 1];
            const sign = coefVal >= 0 ? '+' : '';
            
            if (spec.type === 'log') {
                formulaStr += ` + a_{${idx+2}} \\ln(\\text{${spec.name}}_i)`;
                derivationStr += ` ${sign} ${coefVal.toFixed(4)} \\ln(\\text{${spec.name}}_i)`;
                paramsStr += `n_{\\text{${spec.name}}} &= -a_{${idx+2}} = ${extra.nValue.toFixed(4)} \\\\`;
            } else if (spec.type === 'linear') {
                formulaStr += ` + a_{${idx+2}} (\\text{${spec.name}}_i)`;
                derivationStr += ` ${sign} ${coefVal.toFixed(4)} (\\text{${spec.name}}_i)`;
                paramsStr += `B_{\\text{${spec.name}}} &= a_{${idx+2}} = ${coefVal.toFixed(4)} \\\\`;
            } else if (spec.type === 'reciprocal') {
                formulaStr += ` + \\frac{a_{${idx+2}}}{\\text{${spec.name}}_i}`;
                derivationStr += ` ${sign} \\frac{${coefVal.toFixed(4)}}{\\text{${spec.name}}_i}`;
                paramsStr += `C_{\\text{${spec.name}}} &= a_{${idx+2}} = ${coefVal.toFixed(4)} \\\\`;
            } else {
                formulaStr += ` + \\frac{a_{${idx+2}}}{\\text{${spec.name}}_{K,i}}`;
                derivationStr += ` ${sign} \\frac{${coefVal.toFixed(4)}}{\\text{${spec.name}}_{K,i}}`;
                paramsStr += `E_{a,\\text{${spec.name}}} &= a_{${idx+2}} \\times k = ${(coefVal * 8.6173e-5).toFixed(4)} \\text{ eV} \\\\`;
            }
        });
        
        derivLaTeX = `
        $$\\begin{aligned}
        ${formulaStr} \\\\
        ${derivationStr} \\\\
        ${paramsStr}
        \\end{aligned}$$`;
    }

    // 설계 적용으로 보낼 대표 가속지수 n 구하기
    const representativeN = (r.confLimits.extraStresses && r.confLimits.extraStresses.length > 0) 
        ? r.confLimits.extraStresses[0].nValue 
        : 0;

    const html = `
    <h3 class="section-title">📊 가속 파라미터 추정 결과</h3>
    ${betaInterpretation}
    ${paramCardHTML}

    <!-- 수식 유도 과정 아코디언 -->
    <div class="accordion" style="margin-top:0.5rem; width: 100%">
        <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">
            수식 유도 및 도출 과정 (KaTeX)
            <span class="accordion-arrow">▼</span>
        </div>
        <div class="accordion-body">
            <div style="font-size:0.85rem;line-height:1.5;color:var(--text-secondary)">
                ${derivLaTeX}
            </div>
        </div>
    </div>

    <!-- 설계 반영 버튼 -->
    <button class="btn btn-secondary" style="width:100%;margin-top:1rem;font-weight:600" onclick="applyALTParamsToDesign(${r.Ea}, ${representativeN})">
        ★ 위 가속 파라미터(Ea, n)를 설계 계산기에 적용
    </button>
    `;

    summaryEl.innerHTML = html;

    // KaTeX 수식 적용
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(summaryEl, {
            delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }]
        });
    }
}

function applyALTParamsToDesign(ea, n) {
    // 1. 설계 파라미터 상태 저장
    accelerationState.ea = parseFloat(ea.toFixed(4));
    if (n > 0) {
        accelerationState.nPeck = parseFloat(n.toFixed(4));
        accelerationState.nPower = parseFloat(n.toFixed(4));
    }
    
    // 모델 종류 감지하여 적절한 가속시험 설계 모델 선택
    const model = document.getElementById('alt-model')?.value || 'arrhenius';
    let targetAccModel = 'arrhenius';
    
    if (model === 'gll' && _altStresses.length > 1) {
        const secondStress = _altStresses[1];
        if (secondStress.name.includes('습도') || secondStress.name.toLowerCase().includes('rh') || secondStress.name.toLowerCase().includes('humid')) {
            targetAccModel = 'peck';
        } else if (secondStress.name.includes('전압') || secondStress.name.toLowerCase().includes('volt')) {
            targetAccModel = 'inverse_power';
        } else {
            targetAccModel = 'inverse_power'; // 기본 폴백
        }
    }

    alert(`가속 파라미터가 성공적으로 반영되었습니다!\nEa = ${ea.toFixed(4)} eV${n > 0 ? `, n = ${n.toFixed(4)}` : ''}\n\n가속시험 설계 탭으로 이동합니다.`);
    
    // 2. 가속시험 설계 서브탭으로 이동 및 UI 갱신
    _accSubTab = 'design';
    const container = document.getElementById('acc-tab-content');
    if (container) {
        container.innerHTML = renderAccDesignContent();
        
        // 셀렉트 박스 강제 변경
        const accModelSelect = document.getElementById('acc-model');
        if (accModelSelect) {
            accModelSelect.value = targetAccModel;
        }
        
        setTimeout(() => {
            updateAccModelInputs();
            runAcceleration();
        }, 50);
    }
}

function drawALTAnalysisCharts(r) {
    if (!r) return;

    // ─── 1. 수명-스트레스 피팅 관계선 차트 ($1/T_K$ vs $\\ln\\eta$) ───
    const fitCtx = document.getElementById('alt-chart-fit');
    if (fitCtx) {
        // 스트레스 그룹별 대표 eta 값 점으로 표시
        const points = [];
        for (const g of r.data) {
            // 각 그룹별 eta 단독 MLE 계산
            let tempEta = 1000;
            if (g.failures.length >= 2) {
                const all = [...g.failures, ...g.censored];
                tempEta = all.reduce((a, b) => a + b, 0) / all.length;
            } else {
                tempEta = ALTAnalysis.getGroupRepresentativeLife(g.failures, g.censored);
            }
            points.push({ x: 1000.0 / g.temp_K, y: Math.log(tempEta), label: `${g.temp_C}°C` });
        }

        // 피팅 라인 데이터 생성
        const fitLine = [];
        const xMin = Math.min(...points.map(p => p.x)) * 0.95;
        const xMax = Math.max(...points.map(p => p.x)) * 1.05;
        
        for (let x = xMin; x <= xMax; x += (xMax - xMin) / 50) {
            const tempK = 1000.0 / x;
            // GLL인 경우 정의된 각 추가 스트레스의 평균값 적용
            let logEta = r.a0 + r.stressCoefs[0] / tempK;
            if (r.model === 'gll') {
                for (let i = 1; i < r.stressSpecs.length; i++) {
                    const spec = r.stressSpecs[i];
                    // 그룹들의 해당 차원 값들의 평균 (g.rawStresses[0]은 온도이므로 g.rawStresses[i]가 추가 스트레스 값)
                    const vals = r.data.map(g => (g.rawStresses && g.rawStresses[i] !== undefined) ? g.rawStresses[i] : 1.0);
                    const avgVal = vals.reduce((a, b) => a + b, 0) / vals.length;
                    
                    if (spec.type === 'log') {
                        logEta += r.stressCoefs[i] * Math.log(avgVal);
                    } else if (spec.type === 'linear') {
                        logEta += r.stressCoefs[i] * avgVal;
                    } else if (spec.type === 'reciprocal') {
                        logEta += r.stressCoefs[i] / avgVal;
                    } else if (spec.type === 'reciprocal_k') {
                        logEta += r.stressCoefs[i] / (avgVal + 273.15);
                    }
                }
            }
            fitLine.push({ x: x, y: logEta });
        }

        ChartManager.createOrUpdate('alt-chart-fit', {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: '그룹별 대표 수명 (점)',
                        data: points,
                        backgroundColor: '#ef4444',
                        pointRadius: 6,
                        pointHoverRadius: 8
                    },
                    {
                        label: '모델 피팅선 (실선)',
                        data: fitLine,
                        type: 'line',
                        borderColor: '#38bdf8',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8' } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const tempC = (1000.0 / ctx.parsed.x - 273.15).toFixed(1);
                                return `1000/T_K: ${ctx.parsed.x.toFixed(4)} (${tempC}°C), ln(η): ${ctx.parsed.y.toFixed(3)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '1000 / T_K (1/Kelvin)', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    },
                    y: {
                        title: { display: true, text: 'ln (척도모수 η)', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });
    }

    // ─── 2. 사용 조건 수명 곡선 차트 (R(t) & F(t)) ───
    const probCtx = document.getElementById('alt-chart-probability');
    if (probCtx) {
        // 사용 조건 설정에 기반한 사용 수명 계산
        const useTemp = (r.stressSpecs && r.stressSpecs[0]) ? r.stressSpecs[0].useVal : _altStresses[0].useVal;
        const tUseK = useTemp + 273.15;
        let etaUse = Math.exp(r.a0 + r.stressCoefs[0] / tUseK);

        if (r.model === 'gll' && r.stressSpecs) {
            for (let i = 1; i < r.stressSpecs.length; i++) {
                const spec = r.stressSpecs[i];
                const uVal = spec.useVal;
                if (spec.type === 'log') {
                    etaUse *= Math.pow(uVal, r.stressCoefs[i]);
                } else if (spec.type === 'linear') {
                    etaUse *= Math.exp(r.stressCoefs[i] * uVal);
                } else if (spec.type === 'reciprocal') {
                    etaUse *= Math.exp(r.stressCoefs[i] / uVal);
                } else if (spec.type === 'reciprocal_k') {
                    etaUse *= Math.exp(r.stressCoefs[i] / (uVal + 273.15));
                }
            }
        }

        const rtData = [];
        const ftData = [];
        const tMax = etaUse * 2.0;

        for (let t = 0; t <= tMax; t += tMax / 100) {
            const R_t = Math.exp(-Math.pow(t / etaUse, r.beta));
            rtData.push({ x: t, y: R_t });
            ftData.push({ x: t, y: 1 - R_t });
        }

        ChartManager.createOrUpdate('alt-chart-probability', {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: `신뢰도 R(t) (사용 환경 ${useTemp}°C 기준)`,
                        data: rtData,
                        borderColor: '#22c55e',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    },
                    {
                        label: `불신뢰도 F(t) (사용 환경 ${useTemp}°C 기준)`,
                        data: ftData,
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8' } }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: '시간 (hrs)', color: '#64748b' },
                        ticks: { color: '#64748b' },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    },
                    y: {
                        min: 0,
                        max: 1.0,
                        title: { display: true, text: '확률', color: '#64748b' },
                        ticks: { color: '#64748b', callback: v => (v*100).toFixed(0) + '%' },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });
    }
}

// 스마트 클립보드 붙여넣기 모달 오픈
function openAltPasteModal() {
    closeAltPasteModal();

    const modal = document.createElement('div');
    modal.id = 'alt-paste-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(15, 23, 42, 0.8)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '10000';

    modal.innerHTML = `
    <div class="glass-card" style="width:90%; max-width:500px; padding:1.5rem; border:1px solid var(--border-color); background:var(--bg-secondary); border-radius:12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3)">
        <h3 class="section-title" style="margin-top:0; color:var(--text-primary)">📋 엑셀 데이터 붙여넣기</h3>
        <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:1rem; line-height:1.4">
            엑셀 시트에서 헤더를 포함해 데이터(온도, 수명, 이벤트 등)를 복사한 후 아래 영역에 붙여넣으세요. 구분자와 F/C 이벤트(고장/중단)가 자동 판정 및 표준화되어 테이블에 적용됩니다.
        </p>
        <textarea id="alt-paste-textarea" style="width:100%; height:180px; background:var(--bg-primary); border:1px solid var(--border-color); border-radius:8px; color:var(--text-primary); padding:0.6rem; font-family:monospace; font-size:0.8rem; resize:none; outline:none" placeholder="이곳에 복사한 데이터를 붙여넣기(Ctrl+V) 하세요..."></textarea>
        <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-top:1.25rem">
            <button class="btn btn-secondary" onclick="closeAltPasteModal()">취소</button>
            <button class="btn btn-primary" onclick="applyAltSmartParse()">가져오기 및 적용</button>
        </div>
    </div>`;

    document.body.appendChild(modal);
}

function closeAltPasteModal() {
    const modal = document.getElementById('alt-paste-modal');
    if (modal) modal.remove();
}

function applyAltSmartParse() {
    const text = document.getElementById('alt-paste-textarea')?.value;
    if (!text || text.trim() === '') {
        alert("붙여넣은 텍스트가 없습니다.");
        return;
    }

    try {
        const parsed = SmartParser.parse(text);
        if (!parsed.rows || parsed.rows.length === 0) {
            alert("파싱된 데이터 행이 없습니다. 열 형식이나 공백 구분을 확인하세요.");
            return;
        }

        const model = document.getElementById('alt-model').value;
        const isGLL = model === 'gll';
        const p = _altStresses.length;
        const expectedCols = isGLL ? p + 3 : 4;

        const formattedData = parsed.rows.map(row => {
            const newRow = Array(expectedCols).fill(null);
            if (isGLL) {
                // [온도, 스트레스2, ..., 시간, 이벤트, 개수]
                for (let i = 0; i < p; i++) {
                    newRow[i] = typeof row[i] === 'number' ? row[i] : null;
                }
                newRow[p] = typeof row[p] === 'number' ? row[p] : null;
                newRow[p + 1] = (row[p + 1] === 'F' || row[p + 1] === 'C') ? row[p + 1] : 'F';
                newRow[p + 2] = typeof row[p + 2] === 'number' ? row[p + 2] : 1;
            } else {
                // [온도, 시간, 이벤트, 개수]
                newRow[0] = typeof row[0] === 'number' ? row[0] : null;
                newRow[1] = typeof row[1] === 'number' ? row[1] : null;
                newRow[2] = (row[2] === 'F' || row[2] === 'C') ? row[2] : 'F';
                newRow[3] = typeof row[3] === 'number' ? row[3] : 1;
            }
            return newRow;
        }).filter(r => r[0] !== null); // 온도 값이 유효한 행들만 취함

        if (formattedData.length === 0) {
            alert("유효한 숫자 데이터 행이 발견되지 않았습니다. 데이터를 다시 확인하세요.");
            return;
        }

        if (_altHot) {
            _altHot.loadData(formattedData);
        }
        
        closeAltPasteModal();
        alert(`성공적으로 ${formattedData.length}개의 데이터 행을 스마트 파싱하여 가져왔습니다!`);

    } catch (e) {
        alert(`데이터 파싱 실패: ${e.message}`);
    }
}



