/**
 * RE-Suite Static — 메인 애플리케이션
 * 탭 전환, UI 렌더링, 이벤트 핸들링
 */

let currentTab = 'planning'; // 시료수 계획부터 시작

// ═══════════════════════════════════════════
// 탭 전환
// ═══════════════════════════════════════════
function switchTab(tabId) {
    currentTab = tabId;

    // 탭 버튼 활성화
    document.querySelectorAll('.tab-btn, .nav-item').forEach(btn => {
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
        <button class="sub-tab-btn" data-subtab="advanced" onclick="switchAnalysisSubTab('advanced')" id="analysis-advanced-tab" ${!_analysisResult ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>고급 분석</button>
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
            <h3 class="section-title">신뢰성 데이터 입력</h3>

            <!-- 데이터 입력 모드 토글 -->
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;background:var(--bg-secondary);border-radius:8px;padding:4px">
                <button id="mode-btn-exact" class="btn btn-sm" onclick="switchDataMode('exact')"
                    style="flex:1;background:var(--accent-color);color:#fff;font-size:0.78rem">
                    ● 단순 입력 (F/C)
                </button>
                <button id="mode-btn-interval" class="btn btn-sm" onclick="switchDataMode('interval')"
                    style="flex:1;background:transparent;color:var(--text-muted);font-size:0.78rem">
                    ◻ 구간 관측중단 (Interval)
                </button>
            </div>

            <!-- 샘플 데이터 버튼 -->
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.75rem">
                <button class="btn btn-sm btn-secondary" onclick="loadSampleData('weibull_basic')">샘플: Weibull</button>
                <button class="btn btn-sm btn-secondary" onclick="loadSampleData('weibull_censored')">샘플: 우측관측</button>
                <button class="btn btn-sm btn-secondary" onclick="loadSampleData('lognormal')">샘플: Lognormal</button>
                <button class="btn btn-sm btn-secondary" onclick="loadSampleData('interval_censored')" id="sample-interval-btn">샘플: 구간관측</button>
                <button class="btn btn-sm btn-secondary" onclick="loadSampleData('grouped')">샘플: 그룹비교</button>
            </div>

            <!-- 입력 모드 설명 -->
            <div id="data-mode-hint" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.5rem">
                편 이벤트: <strong style="color:#22c55e">F</strong>=고장, <strong style="color:#38bdf8">C</strong>=우측관측중단 | Group ID: 비어있으면 단일 그룹
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
        btnExact.style.color         = mode === 'exact' ? '#fff' : 'var(--text-muted)';
        btnInterval.style.background = mode === 'interval' ? 'var(--accent-color)' : 'transparent';
        btnInterval.style.color      = mode === 'interval' ? '#fff' : 'var(--text-muted)';
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
                const expanded = expandIntervalRows(grouped[gid]);
                if (expanded.failures.length < 2) return;
                try {
                    const rs = expanded.failures.map(t => ({time:t,event:'F'}))
                        .concat(expanded.censored.map(t => ({time:t,event:'C'})));
                    allResults[gid] = ReliabilityAnalysis.analyze(rs, { distribution: dist, confidence: conf });
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
    const distLabel = { weibull:'Weibull 2P', lognormal:'Lognormal 2P', normal:'Normal 2P', exponential:'Exponential 1P' };
    const p = r.params;
    const paramStr = r.distribution === 'weibull'
        ? `η = ${p.alpha.toFixed(3)}, β = ${p.beta.toFixed(4)}`
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

    const selectedDist = r.distribution;
    const compHtml = sortedComp.map(c => {
        const isSelected = c.dist === selectedDist;
        return `
        <tr onclick="selectCompDist('${c.dist}')" style="cursor:pointer;${isSelected ? 'background:rgba(56,189,248,0.15)' : c.best ? 'background:rgba(56,189,248,0.04)' : ''}" title="클릭하면 이 분포로 차트 표시">
            <td class="table-cell" style="${isSelected ? 'color:var(--accent-color);font-weight:700' : ''}">
                ${distLabel[c.dist] || c.dist}
                ${c.best ? '<span style="color:#f59e0b"> ⭐</span>' : ''}
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
                <div class="label">최적 분포 (AICc)</div>
                <div class="value accent" style="font-size:0.95rem">${distLabel[r.distribution] || r.distribution}</div>
            </div>
            <div class="stat-card">
                <div class="label">선택 분포</div>
                <div class="value" style="font-size:0.9rem;color:var(--accent-color)" id="selected-dist-label">${distLabel[selectedDist] || selectedDist}</div>
            </div>
            <div class="stat-card">
                <div class="label">MTTF</div>
                <div class="value success">${r.mttf.toFixed(1)}</div>
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
    const distLabel = { weibull:'Weibull 2P', lognormal:'Lognormal 2P', normal:'Normal 2P', exponential:'Exponential 1P' };
    const distColors = { weibull:'#38bdf8', lognormal:'#f59e0b', normal:'#a78bfa', exponential:'#22c55e' };

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
                <!-- 기존 "분포 비교 추가" 패널 제거: 그룹별 인라인 드롭다운으로 대체됨 -->
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
    const zScore = Distributions.normalPPF((1 + n/100) / 2);
    const cdfVals = r.plotData.cdf;
    const hfVals  = r.plotData.hf;
    const nTotal  = r.dataSummary.nTotal;
    const cdfCI = Statistics.waldLogitCI(cdfVals, nTotal, zScore);
    const hfCI  = Statistics.hazardLogCI(hfVals, r.dataSummary.nFailures, zScore);
    r.plotData.cdfLower = cdfCI.lower;
    r.plotData.cdfUpper = cdfCI.upper;
    r.plotData.relLower = cdfCI.upper.map(v => 1 - v);
    r.plotData.relUpper = cdfCI.lower.map(v => 1 - v);
    r.plotData.hfLower  = hfCI.lower;
    r.plotData.hfUpper  = hfCI.upper;
    drawAllAnalysisCharts();
}

function changeGroupDist(groupId, newDist) {
    const allRes = window._allGroupResults;
    if (!allRes || !allRes[groupId]) return;
    try {
        const rawRows = getAnalysisData();
        const grouped = groupAnalysisData(rawRows);
        const dataRows = grouped[groupId === '기본 그룹' ? '__all__' : groupId] || grouped[groupId] || [];
        const expanded = expandIntervalRows(dataRows);
        const rs = expanded.failures.map(t => ({time:t,event:'F'}))
            .concat(expanded.censored.map(t => ({time:t,event:'C'})));
        
        const confText = document.getElementById('ci-level')?.value;
        const conf = confText ? parseInt(confText)/100 : 0.90;
        const newResult = ReliabilityAnalysis.analyze(rs, { distribution: newDist, confidence: conf });
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
            if (isFinite(yUpper[i]) && yUpper[i] >= 0) upperPts.push({ x: xList[i], y: yUpper[i] });
            if (isFinite(yLower[i]) && yLower[i] >= 0) lowerPts.push({ x: xList[i], y: yLower[i] });
        }
        return [
            { label: 'Upper CI', data: upperPts, borderColor: 'transparent', backgroundColor: 'transparent', fill: false, pointRadius: 0 },
            { label: 'Lower CI', data: lowerPts, borderColor: 'transparent', backgroundColor: color + '25', fill: '-1', pointRadius: 0 }
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




// ── 고급 분석 탭 (Contour Plot + Probability Plot) ──
function renderAdvancedTab() {
    if (!_analysisResult) return '<div class="empty-state">분석을 먼저 실행하세요</div>';
    
    const allRes = window._allGroupResults || {};
    const gids   = Object.keys(allRes).filter(g => allRes[g]);
    const isMulti = gids.length >= 2;
    const conf = Math.round((_analysisResult.confidence || 0.9) * 100);

    let html = `
    <div class="glass-card" style="margin-bottom:1rem;padding:0.65rem 1rem">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:1rem">
            <h3 class="section-title" style="margin:0">고급 분석</h3>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-left:auto">
                <label style="font-size:0.82rem;color:var(--text-secondary)">신뢰수준:</label>
                <input type="number" id="adv-ci-level" value="${conf}" min="50" max="99" step="1"
                    style="width:65px;padding:3px 8px;font-size:0.83rem;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary)"
                    onchange="updateAdvancedCI(this.value)">
                <span style="font-size:0.82rem;color:var(--text-muted)">%</span>
            </div>
        </div>
    </div>`;

    // 그룹별 그리드
    gids.forEach(g => {
        const res = allRes[g];
        const hasFisher  = !!res.fisherCI;
        const hasProb    = !!res.probPlot;
        const glbl = g === '__all__' ? '전체 그룹' : '그룹 ' + g;

        html += `
        ${isMulti ? `<h4 style="margin: 0.5rem 0 0.5rem 0; color:var(--text-primary); font-size:1.05rem;">▶ ${glbl} <span style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">(${res.distribution})</span></h4>` : ''}
        <div class="grid-2" style="gap:1rem;margin-bottom:1.5rem">
            <div class="glass-card">
                <h4 style="color:var(--text-secondary);margin-bottom:1rem">파라미터 Fisher 신뢰구간</h4>
                ${hasFisher ? renderFisherTable(res.fisherCI, res.params, res.confidence, res.distribution)
                            : '<div class="info-box" style="font-size:0.85rem">분포 적합 실패 또는 데이터 부족</div>'}
            </div>
            <div class="glass-card">
                <h4 style="color:var(--text-secondary);margin-bottom:0.75rem">Probability Plot</h4>
                ${hasProb ? `<div class="chart-container" style="height:260px"><canvas id="chart-prob-${g}"></canvas></div>`
                          : '<div class="info-box" style="font-size:0.85rem">적합되지 않은 분포 또는 최소 2개 고장 데이터 필요</div>'}
            </div>
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
                    onchange="updateContourCI(this.value)">
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

// ── Bx / F(t) 계산기 탭 ──
let _calcQueryCounts = {};

function renderCalculatorTab() {
    const allRes = window._allGroupResults || {};
    const gids = Object.keys(allRes).filter(g => allRes[g] && g && g !== '""' && g !== 'undefined');
    if (gids.length === 0) return '<div class="empty-state" style="padding:3rem"><div style="font-size:1.1rem;color:var(--text-muted)">📊 분석을 먼저 실행하세요</div><div style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem">데이터 입력 & 분석 탭에서 데이터를 입력하고 분석을 실행하면<br>Bx Life, F(t), R(t) 계산기를 사용할 수 있습니다.</div></div>';

    // Grid layout: responsive columns for each group
    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 1.5rem;">';

    gids.forEach(gid => {
        const r = allRes[gid];
        let currentConf = Math.round((r.confidence || 0.9) * 100);
        // 기본 쿼리 갯수 초기화
        if (!_calcQueryCounts[gid]) _calcQueryCounts[gid] = 3;

        const distLabel = { weibull:'Weibull 2P', lognormal:'Lognormal 2P', normal:'Normal 2P', exponential:'Exponential 1P' };
        const selLabel = distLabel[r.distribution] || r.distribution;
        const groupTitle = gid === '__all__' ? '기본 그룹' : `그룹 ${gid}`;

        let exampleT = (r.bxLife?.B10?.estimate) ? r.bxLife.B10.estimate.toFixed(0) : (r.bxLife?.B10 ? Number(r.bxLife.B10).toFixed(0) : '100');

        html += `
        <div class="glass-card" style="display:flex; flex-direction:column; gap:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 class="section-title" style="margin:0">${groupTitle} 커스텀 계산기</h3>
                <span class="badge badge-primary">${selLabel}</span>
            </div>

            <!-- 신뢰수준 변경 -->
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <label style="font-size:0.83rem;color:var(--text-secondary)">신뢰수준:</label>
                <input type="number" id="calc-ci-level-${gid}" value="${currentConf}" min="50" max="99" step="1"
                    style="width:65px;padding:3px 8px;font-size:0.83rem;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:4px;color:var(--text-primary)"
                    onchange="onCalcCIChange('${gid}', this.value)">
                <span style="font-size:0.83rem;color:var(--text-muted)">%</span>
            </div>

            <div style="background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:6px;padding:0.6rem 0.85rem;font-size:0.8rem;line-height:1.6">
                <div>📌 <strong>Bx Life</strong> ― 고장 확률 x% 일 때 수명 <em>t</em> 역산</div>
                <div>📌 <strong>F(t) / R(t)</strong> ― 시간 <em>t</em> 일 때 고장/생존 확률 계산</div>
            </div>

            <div id="calc-queries-${gid}">`;
        
        // 렌더링 시 기존에 추가된 쿼리 개수만큼 렌더링
        for (let i = 1; i <= _calcQueryCounts[gid]; i++) {
            let type = 'B-life', val = 10;
            if (i === 2) { type = 'Probability'; val = exampleT; }
            if (i === 3) { type = 'Reliability'; val = exampleT; }
            html += renderCalcQueryRow(gid, i, type, val);
        }

        html += `
            </div>

            <button class="btn btn-sm btn-secondary" onclick="addCalcQuery('${gid}')">+ 쿼리 추가</button>
            <button class="btn btn-primary" onclick="runCustomCalc('${gid}')">계산 실행</button>

            <div id="calc-result-${gid}" style="margin-top:1rem">
                <div class="empty-state" style="min-height:150px; padding:2rem">
                    <div style="font-size:0.85rem;color:var(--text-muted)">계산을 실행하세요</div>
                </div>
            </div>
        </div>`;
    });

    html += '</div>';
    return html;
}

function onCalcCIChange(gid, val) {
    const n = parseFloat(val);
    if (!window._allGroupResults || !window._allGroupResults[gid] || !isFinite(n) || n < 50 || n > 99) return;
    
    // update analysis confidence temporarily for calculation
    window._allGroupResults[gid] = Object.assign({}, window._allGroupResults[gid], { confidence: n / 100 });
    
    // auto-run if table exists
    const resultEl = document.getElementById(`calc-result-${gid}`);
    if (resultEl && resultEl.querySelector('table')) runCustomCalc(gid);
}

function renderCalcQueryRow(gid, id, type, val) {
    const unitMap = { 'B-life': '% (고장률)', 'Probability': 'h (시간)', 'Reliability': 'h (시간)' };
    const placeholderMap = { 'B-life': 'ex) 10 → B10', 'Probability': '시간 t 입력', 'Reliability': '시간 t 입력' };
    return `<div class="glass-card-sm" style="margin-bottom:0.6rem; padding:0.5rem" id="calc-row-${gid}-${id}">
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">
            <select id="calc-type-${gid}-${id}" style="flex:1;min-width:140px;font-size:0.75rem;padding:4px" onchange="updateCalcUnit('${gid}', ${id})">
                <option value="B-life"      ${type==='B-life'?'selected':''}>Bx Life — F(x%)=t 역산</option>
                <option value="Probability" ${type==='Probability'?'selected':''}>F(t) — 시간→고장확률</option>
                <option value="Reliability" ${type==='Reliability'?'selected':''}>R(t) — 시간→생존확률</option>
            </select>
            <input type="number" id="calc-val-${gid}-${id}" value="${val}" style="width:80px;font-size:0.8rem;padding:4px" placeholder="${placeholderMap[type] || ''}">
            <span id="calc-unit-${gid}-${id}" style="font-size:0.75rem;color:var(--text-muted);width:60px">${unitMap[type] || ''}</span>
            <button onclick="document.getElementById('calc-row-${gid}-${id}').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem;padding:2px 4px" title="삭제">✕</button>
        </div>
    </div>`;
}

function updateCalcUnit(gid, id) {
    const t = document.getElementById(`calc-type-${gid}-${id}`)?.value;
    const u = document.getElementById(`calc-unit-${gid}-${id}`);
    if (!u) return;
    const map = { 'B-life': '% (고장률)', 'Probability': 'h (시간)', 'Reliability': 'h (시간)' };
    u.textContent = map[t] || '';
}

function addCalcQuery(gid) {
    if (!_calcQueryCounts[gid]) _calcQueryCounts[gid] = 0;
    _calcQueryCounts[gid]++;
    const container = document.getElementById(`calc-queries-${gid}`);
    if (!container) return;
    const div = document.createElement('div');
    div.innerHTML = renderCalcQueryRow(gid, _calcQueryCounts[gid], 'B-life', 50);
    container.appendChild(div.firstElementChild);
}

function runCustomCalc(gid) {
    const container = document.getElementById(`calc-queries-${gid}`);
    if (!container) return;
    const count = _calcQueryCounts[gid] || 0;
    const queries = [];
    for (let i = 1; i <= count; i++) {
        const typeEl = document.getElementById(`calc-type-${gid}-${i}`);
        const valEl  = document.getElementById(`calc-val-${gid}-${i}`);
        if (typeEl && valEl && valEl.value) {
            queries.push({ type: typeEl.value, value: parseFloat(valEl.value) });
        }
    }
    if (queries.length === 0) return;

    const calcResult = window._allGroupResults[gid];
    if (!calcResult) return;

    const results = ReliabilityAnalysis.customCalculate(calcResult, queries);

    const rows = results.map(res => {
        if (res.error || res.result === null) {
            return `<tr><td class="table-cell">${res.type}</td><td class="table-cell">${res.input}</td><td class="table-cell" style="color:var(--danger)">계산 실패</td><td class="table-cell">—</td><td class="table-cell">—</td></tr>`;
        }
        const isPercentage = (res.type === 'Probability' || res.type === 'Reliability');
        const fmt = (v) => isPercentage ? (v * 100).toFixed(4) + '%' : v.toFixed(4);
        const mainFmt = isPercentage ? (res.result * 100).toFixed(4) + '%' : res.result.toFixed(4);
        const loFmt = res.lower != null ? fmt(res.lower) : '—';
        const hiFmt = res.upper != null ? fmt(res.upper) : '—';
        const typeLabel = res.type === 'B-life' ? `B${res.input} Life` : res.type === 'Probability' ? `F(${res.input}h)` : `R(${res.input}h)`;
        const inputStr = res.type === 'B-life' ? `${res.input}%` : `${res.input} h`;
        return `<tr>
            <td class="table-cell">${typeLabel}</td>
            <td class="table-cell">${inputStr}</td>
            <td class="table-cell" style="color:var(--accent-color);font-weight:600">${mainFmt}</td>
            <td class="table-cell">${loFmt}</td>
            <td class="table-cell">${hiFmt}</td>
        </tr>`;
    }).join('');

    document.getElementById(`calc-result-${gid}`).innerHTML = `
        <div class="table-wrapper">
            <table style="font-size:0.8rem">
                <thead><tr><th>항목</th><th>입력</th><th>결과</th><th>하한 ${(calcResult.confidence*100).toFixed(0)}% CI</th><th>상한</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div style="margin-top:0.4rem;font-size:0.75rem;color:var(--text-muted);text-align:right">
            Wald Logit 변환 CI
        </div>
    `;
}

// ═══════════════════════════════════════════
// 시료수 계획 탭
// ═══════════════════════════════════════════
function renderPlanningTab() {
    return `
    <!-- 서브 탭 -->
    <div class="sub-tabs" id="planning-sub-tabs">
        <button class="sub-tab-btn active" data-subtab="reliability" onclick="switchPlanningSubTab('reliability')">무고장 보증</button>
        <button class="sub-tab-btn" data-subtab="ltpd" onclick="switchPlanningSubTab('ltpd')">LTPD</button>
        <button class="sub-tab-btn" data-subtab="weibull_bx" onclick="switchPlanningSubTab('weibull_bx')">Weibull Bx</button>
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
    const confLevels = [90, 95, 99];
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
                                <span style="font-size:1.05rem;font-weight:700">${c.n.toLocaleString()}</span><br>
                                <span style="font-size:0.7rem;color:var(--text-muted)">개</span>
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
                <div class="formula-section" style="border:none;padding:0;background:none">${formula}</div>
            </div>
        </div>

        <div class="accordion" style="margin-top:0.75rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open');setTimeout(()=>drawOCChart(${n},${c}),100)">
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

function drawOCChart(n, c) {
    const data = SamplePlanning.generateOCCurve(n, c);
    ChartManager.drawOCCurve('oc-chart', data, n, c);
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
                <div class="formula-section" style="border:none;padding:0;background:none">${formula}</div>
            </div>
        </div>
    `;
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
                <div class="formula-section" style="border:none;padding:0;background:none">${formula}</div>
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
}

function drawBxTradeoff() {
    const data = window._wbxTradeoff;
    if (!data || !document.getElementById('wbx-tradeoff-chart')) return;
    ChartManager.createOrUpdate('wbx-tradeoff-chart', {
        type: 'line',
        data: {
            datasets: [{
                label: '시료수 (n)',
                data: data.map(d => ({ x: d.t, y: d.n })),
                borderColor: '#38bdf8',
                backgroundColor: '#38bdf818',
                fill: false,
                pointRadius: 0,
                borderWidth: 2.5,
                tension: 0.3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            parsing: false,
            plugins: { legend: { labels: { color: '#94a3b8' } } },
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
            <h3 class="section-title">LTFR (Lot Tolerance Failure Rate)</h3>
            <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
                <button class="btn btn-sm btn-secondary" onclick="switchPlanningSubTab('ltfr')">기본값 복원</button>
            </div>

            <div class="info-box" style="font-size:0.8rem;margin-bottom:1rem">
                지수분포(일정 고장률) 가정 하에 목표 고장률을 보증하기 위한 시료수를 계산합니다.
            </div>

            ${HelpTooltip.labelWithHelp('목표 고장률', '보증하려는 최대 고장률.<br>FIT = 10⁻⁹ failures/hour')}
            <div style="display:flex;gap:0.5rem;align-items:center">
                <input type="number" id="ltfr-fr" value="100" min="0.01" step="1" style="flex:1">
                <select id="ltfr-unit" style="width:100px;padding:6px">
                    <option value="FIT" selected>FIT</option>
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
            ${HelpTooltip.labelWithHelp('신뢰 수준 (C)', '통계적 확신 정도.')}
            <div class="input-with-unit">
                <input type="number" id="ltfr-conf" value="90" min="50" max="99.99" step="1">
                <span class="input-unit">%</span>
            </div>
            </div>

            <div style="margin-top:0.85rem">
            ${HelpTooltip.labelWithHelp('허용 고장수 (c)', '시험 중 허용하는 최대 고장 수.')}
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
    `;
}
function renderAQLTab() {
    return `
    <div style="display:flex; gap:1.5rem; margin-bottom:1.5rem; flex-wrap:wrap">
        <!-- Input section -->
        <div class="glass-card" style="flex:1; min-width:300px">
            <h3 class="section-title">AQL 파라미터</h3>
            <div class="grid-2-mobile" style="gap:1rem; display:grid; grid-template-columns:1fr 1fr;">
                <div>
                    ${HelpTooltip.labelWithHelp('로트 크기 (N)', '검사 대상 로트(배치)의 전체 수량')}
                    <input type="number" id="aql-lot" value="1000" min="2" step="1" onchange="runAQL()">
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
        <div class="glass-card" style="flex:1.5; min-width:300px; display:flex; flex-direction:column; justify-content:center">
            <h3 class="section-title">결과 요약</h3>
            <div id="aql-top-result">
                <div style="font-size:0.9rem; color:var(--text-muted);">좌측에서 파라미터 변경 시 결과가 표시됩니다.</div>
            </div>
        </div>
    </div>

    <!-- The giant interactive tables -->
    <div id="aql-tables-container" class="hide-on-mobile">
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
            <div style="margin-top:1rem; font-size:0.85rem; color:var(--text-secondary)">
                로트 크기: <strong>${range}</strong> → 코드: <strong>${letter}</strong> <span style="margin:0 0.5rem">|</span> 검사 유형: ${type}
            </div>
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
        document.getElementById('aql-tables-container').innerHTML = t1Html + t2Html;

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
function renderAccelerationTab() {
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
        </div>

        <div id="acc-result" class="glass-card">
            <div class="empty-state" style="min-height:400px">
                <div style="font-size:0.9rem;color:var(--text-muted)">파라미터를 입력하고<br>"계산 실행"을 클릭하세요</div>
            </div>
        </div>
    </div>`;
}

function renderArrheniusInputs() {
    return `
        ${HelpTooltip.labelWithHelp('사용 조건 온도', '제품이 실제 사용되는 환경 온도')}
        <div class="input-with-unit">
            <input type="number" id="acc-t-use" value="25" step="1">
            <span class="input-unit">°C</span>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 조건 온도', '가속 시험에서 적용할 스트레스 온도')}
        <div class="input-with-unit">
            <input type="number" id="acc-t-stress" value="85" step="1">
            <span class="input-unit">°C</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('활성화 에너지 (Ea)', '고장 메커니즘의 활성화 에너지.<br>반도체: 0.5~1.0 eV<br>솔더 접합: 0.4~0.7 eV<br>부식/금속이동: 0.9~1.0 eV')}
        <div class="input-with-unit">
            <input type="number" id="acc-ea" value="0.7" min="0.01" max="3" step="0.01">
            <span class="input-unit">eV</span>
        </div>
        </div>`;
}

function renderAccTestInputs() {
    return `
        <div class="grid-2">
            <div>
                ${HelpTooltip.labelWithHelp('형상 모수 (β)', 'Weibull 형상 모수.<br>β<1: 초기고장<br>β≈1: 우발고장<br>β>1: 마모고장')}
                <input type="number" id="acc-beta" value="2" min="0.1" step="0.1">
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('목표 보증 수명 (Bx)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-target-life" value="20000" min="1" step="100">
                    <span class="input-unit">시간</span>
                </div>
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HelpTooltip.labelWithHelp('시료 수 (n)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-n" value="22" min="1" step="1">
                    <span class="input-unit">개</span>
                </div>
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('신뢰 수준 (C)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-confidence" value="90" min="50" max="99.99" step="1">
                    <span class="input-unit">%</span>
                </div>
            </div>
        </div>
        <div style="margin-top:0.75rem">
            ${HelpTooltip.labelWithHelp('목표 고장률 (Bx)', '예: B1=1%, B5=5%, B10=10%')}
            <div class="input-with-unit">
                <input type="number" id="acc-bx" value="1" min="0.1" max="50" step="0.1">
                <span class="input-unit">%</span>
            </div>
        </div>`;
}

function updateAccModelInputs() {
    const model = document.getElementById('acc-model').value;
    const container = document.getElementById('acc-model-inputs');

    if (model === 'arrhenius') container.innerHTML = renderArrheniusInputs();
    else if (model === 'eyring') container.innerHTML = renderEyringInputs();
    else if (model === 'peck') container.innerHTML = renderPeckInputs();
    else if (model === 'coffin_manson') container.innerHTML = renderCMInputs();
    else if (model === 'norris_landzberg') container.innerHTML = renderNLInputs();
    else if (model === 'inverse_power') container.innerHTML = renderIPInputs();
    else if (model === 'arrhenius_power') container.innerHTML = renderCombinedInputs();
}

function renderPeckInputs() {
    return renderArrheniusInputs() + `
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('사용 환경 습도', '')}
        <div class="input-with-unit">
            <input type="number" id="acc-rh-use" value="50" min="1" max="100" step="1">
            <span class="input-unit">%RH</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 조건 습도', '')}
        <div class="input-with-unit">
            <input type="number" id="acc-rh-stress" value="85" min="1" max="100" step="1">
            <span class="input-unit">%RH</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('습도 지수 (n)', 'JEDEC 권장: 3.0')}
        <input type="number" id="acc-n-peck" value="3" min="0.1" step="0.1">
        </div>`;
}

function renderCMInputs() {
    return `
        ${HelpTooltip.labelWithHelp('사용 환경 ΔT', '사용 환경에서의 온도 변화 범위')}
        <div class="input-with-unit">
            <input type="number" id="acc-dt-use" value="20" min="1" step="1">
            <span class="input-unit">°C</span>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 조건 ΔT', '가속 시험에서의 온도 변화 범위')}
        <div class="input-with-unit">
            <input type="number" id="acc-dt-stress" value="100" min="1" step="1">
            <span class="input-unit">°C</span>
        </div>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('코핀-맨슨 지수 (m)', 'PCB 솔더: m ≈ 1.9~2.0')}
        <input type="number" id="acc-m" value="2" min="0.1" step="0.1">
        </div>`;
}

function renderIPInputs() {
    return `
        ${HelpTooltip.labelWithHelp('사용 스트레스', '사용 환경의 스트레스 레벨 (전압, 전류 등)')}
        <input type="number" id="acc-v-use" value="5" min="0.01" step="0.1">
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 스트레스', '가속 시험의 스트레스 레벨')}
        <input type="number" id="acc-v-stress" value="12" min="0.01" step="0.1">
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('역거듭제곱 지수 (n)', '재료/메커니즘에 따라 다름')}
        <input type="number" id="acc-n-power" value="2" min="0.1" step="0.1">
        </div>`;
}

function renderEyringInputs() {
    return renderArrheniusInputs() + `
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('비열 스트레스 계수 (B)', 'Eyring 모델의 2차 스트레스 파라미터.<br>0이면 순수 Arrhenius와 동일')}
        <input type="number" id="acc-eyring-b" value="0" step="0.01">
        </div>
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HelpTooltip.labelWithHelp('사용 스트레스 (S_use)', '비열 스트레스 사용 수준')}
                <input type="number" id="acc-eyring-s-use" value="1" min="0" step="0.1">
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('가속 스트레스 (S_stress)', '비열 스트레스 가속 수준')}
                <input type="number" id="acc-eyring-s-stress" value="5" min="0" step="0.1">
            </div>
        </div>`;
}

function renderNLInputs() {
    return renderCMInputs() + `
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HelpTooltip.labelWithHelp('사용 주파수 (f_use)', '사용 환경에서의 사이클 주파수 (cycles/day)')}
                <input type="number" id="acc-f-use" value="1" min="0.01" step="0.1">
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('가속 주파수 (f_stress)', '가속 시험 사이클 주파수')}
                <input type="number" id="acc-f-stress" value="3" min="0.01" step="0.1">
            </div>
        </div>
        <div class="grid-2" style="margin-top:0.75rem">
            <div>
                ${HelpTooltip.labelWithHelp('사용 최고온도', 'Tmax 사용')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-tmax-use" value="50" step="1">
                    <span class="input-unit">°C</span>
                </div>
            </div>
            <div>
                ${HelpTooltip.labelWithHelp('가속 최고온도', 'Tmax 가속')}
                <div class="input-with-unit">
                    <input type="number" id="acc-nl-tmax-stress" value="125" step="1">
                    <span class="input-unit">°C</span>
                </div>
            </div>
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('활성화 에너지 (Ea)', 'NL 모델 Ea, 일반: 0.123 eV')}
        <div class="input-with-unit">
            <input type="number" id="acc-nl-ea" value="0.123" min="0.01" step="0.01">
            <span class="input-unit">eV</span>
        </div>
        </div>`;
}

function renderCombinedInputs() {
    return renderArrheniusInputs() + `
        <div class="divider" style="margin-top:1rem">전압/전류 스트레스</div>
        ${HelpTooltip.labelWithHelp('사용 스트레스', '')}
        <input type="number" id="acc-v-use" value="5" min="0.01" step="0.1">
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('가속 스트레스', '')}
        <input type="number" id="acc-v-stress" value="12" min="0.01" step="0.1">
        </div>
        <div style="margin-top:0.75rem">
        ${HelpTooltip.labelWithHelp('역거듭제곱 지수 (n)', '')}
        <input type="number" id="acc-n-power" value="2" min="0.1" step="0.1">
        </div>`;
}

function resetAccInputs() {
    updateAccModelInputs();
    document.getElementById('acc-beta').value = 2;
    document.getElementById('acc-target-life').value = 20000;
    document.getElementById('acc-n').value = 22;
    document.getElementById('acc-confidence').value = 90;
    document.getElementById('acc-bx').value = 1;
}

function selectRadio(el, groupId) {
    document.querySelectorAll(`#${groupId} .radio-option`).forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input').checked = true;
    // 가속 계산 목표 변경 시 파라미터 동적 업데이트
    if (groupId === 'acc-goal') {
        const goal = el.querySelector('input').value;
        renderAccGoalInputs(goal);
    }
}

// 가속 시험 목표별 동적 입력 필드 렌더
function renderAccGoalInputs(goal) {
    const container = document.getElementById('acc-test-inputs');
    if (!container) return;
    const beta   = document.getElementById('acc-beta')?.value || '2';
    const tLife  = document.getElementById('acc-target-life')?.value || '20000';
    const nVal   = document.getElementById('acc-n')?.value || '22';
    const conf   = document.getElementById('acc-confidence')?.value || '90';
    const bxVal  = document.getElementById('acc-bx')?.value || '1';
    const tTest  = document.getElementById('acc-test-time')?.value || '1000';

    const HT = HelpTooltip;
    if (goal === 'test_time') {
        // 필요 시험 시간 계산: 시만, n, C, 목표수명, 목표고장률 필요
        container.innerHTML = `
        <div class="info-box" style="font-size:0.8rem;margin-bottom:0.75rem">
            필요 입력: <strong>시만(n), 신뢰수준(C), 목표수명, 목표측의</strong> → 필요 시험시간 계산
        </div>
        ${renderAccTestCommonInputs(beta, tLife, nVal, conf, bxVal)}`;
    } else if (goal === 'sample_size') {
        // 필요 시료 수 계산: 시험시간, C, 목표수명, 목표측의 필요
        container.innerHTML = `
        <div class="info-box" style="font-size:0.8rem;margin-bottom:0.75rem">
            필요 입력: <strong>시험시간, 신뢰수준(C), 목표수명, 목표측의</strong> → 필요 시료수 계산
        </div>
        <div class="grid-2" style="margin-bottom:0.75rem">
            <div>
                ${HT.labelWithHelp('시험 시간 (Tₛ)', '가속 조건에서의 실제 시험 지속 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-test-time" value="${tTest}" min="1" step="100">
                    <span class="input-unit">시간</span>
                </div>
            </div>
            <div>
                ${HT.labelWithHelp('신뢰 수준 (C)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-confidence" value="${conf}" min="50" max="99.99" step="1">
                    <span class="input-unit">%</span>
                </div>
            </div>
        </div>
        <div class="grid-2">
            <div>
                ${HT.labelWithHelp('형상 모수 (β)', 'Weibull 형상 모수')}
                <input type="number" id="acc-beta" value="${beta}" min="0.1" step="0.1">
            </div>
            <div>
                ${HT.labelWithHelp('목표 보증 수명', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-target-life" value="${tLife}" min="1" step="100">
                    <span class="input-unit">시간</span>
                </div>
            </div>
        </div>
        <div style="margin-top:0.75rem">
            ${HT.labelWithHelp('목표 고장률 (Bx)', '예: B1=1%, B5=5%, B10=10%')}
            <div class="input-with-unit">
                <input type="number" id="acc-bx" value="${bxVal}" min="0.1" max="50" step="0.1">
                <span class="input-unit">%</span>
            </div>
        </div>`;
    } else if (goal === 'life') {
        // 인정 수명 계산: n, 시험시간, C, 형상모수, 목표 Bx 필요
        container.innerHTML = `
        <div class="info-box" style="font-size:0.8rem;margin-bottom:0.75rem">
            필요 입력: <strong>시료수(n), 시험시간, 신뢰수준(C), 형상모수</strong> → 인정 Bx 수명 계산
        </div>
        <div class="grid-2" style="margin-bottom:0.75rem">
            <div>
                ${HT.labelWithHelp('시료 수 (n)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-n" value="${nVal}" min="1" step="1">
                    <span class="input-unit">개</span>
                </div>
            </div>
            <div>
                ${HT.labelWithHelp('시험 시간 (Tₛ)', '가속 조건에서의 실제 시험 시간')}
                <div class="input-with-unit">
                    <input type="number" id="acc-test-time" value="${tTest}" min="1" step="100">
                    <span class="input-unit">시간</span>
                </div>
            </div>
        </div>
        <div class="grid-2">
            <div>
                ${HT.labelWithHelp('신뢰 수준 (C)', '')}
                <div class="input-with-unit">
                    <input type="number" id="acc-confidence" value="${conf}" min="50" max="99.99" step="1">
                    <span class="input-unit">%</span>
                </div>
            </div>
            <div>
                ${HT.labelWithHelp('형상 모수 (β)', 'Weibull 형상 모수')}
                <input type="number" id="acc-beta" value="${beta}" min="0.1" step="0.1">
            </div>
        </div>
        <div style="margin-top:0.75rem">
            ${HT.labelWithHelp('목표 고장률 (Bx)', '예: B1=1%, B5=5%, B10=10%')}
            <div class="input-with-unit">
                <input type="number" id="acc-bx" value="${bxVal}" min="0.1" max="50" step="0.1">
                <span class="input-unit">%</span>
            </div>
        </div>`;
    }
}

function renderAccTestCommonInputs(beta, tLife, nVal, conf, bxVal) {
    const HT = HelpTooltip;
    return `
    <div class="grid-2">
        <div>
            ${HT.labelWithHelp('형상 모수 (β)', 'Weibull 형상 모수.<br>β<1: 초기측정<br>β=1: 우발적<br>β>1: 마모')}
            <input type="number" id="acc-beta" value="${beta}" min="0.1" step="0.1">
        </div>
        <div>
            ${HT.labelWithHelp('목표 보증 수명', '')}
            <div class="input-with-unit">
                <input type="number" id="acc-target-life" value="${tLife}" min="1" step="100">
                <span class="input-unit">시간</span>
            </div>
        </div>
    </div>
    <div class="grid-2" style="margin-top:0.75rem">
        <div>
            ${HT.labelWithHelp('시료 수 (n)', '')}
            <div class="input-with-unit">
                <input type="number" id="acc-n" value="${nVal}" min="1" step="1">
                <span class="input-unit">개</span>
            </div>
        </div>
        <div>
            ${HT.labelWithHelp('신뢰 수준 (C)', '')}
            <div class="input-with-unit">
                <input type="number" id="acc-confidence" value="${conf}" min="50" max="99.99" step="1">
                <span class="input-unit">%</span>
            </div>
        </div>
    </div>
    <div style="margin-top:0.75rem">
        ${HT.labelWithHelp('목표 고장률 (Bx)', '예: B1=1%, B5=5%, B10=10%')}
        <div class="input-with-unit">
            <input type="number" id="acc-bx" value="${bxVal}" min="0.1" max="50" step="0.1">
            <span class="input-unit">%</span>
        </div>
    </div>`;
}

function runAcceleration() {
    const model      = document.getElementById('acc-model').value;
    const beta       = parseFloat(document.getElementById('acc-beta')?.value || '2');
    const targetLife = parseFloat(document.getElementById('acc-target-life')?.value || '20000');
    const nSample    = parseInt(document.getElementById('acc-n')?.value || '22');
    const confidence = parseFloat(document.getElementById('acc-confidence')?.value || '90');
    const bx         = parseFloat(document.getElementById('acc-bx')?.value || '1');
    const goal       = document.querySelector('input[name="acc-goal"]:checked')?.value || 'test_time';
    const tTestUser  = parseFloat(document.getElementById('acc-test-time')?.value || '1000');

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
        const fUse    = parseFloat(document.getElementById('acc-f-use').value);
        const fStress = parseFloat(document.getElementById('acc-f-stress').value);
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

    const formulaResult = Acceleration.getGeneralFormula(modelLabel, afFormulaStr, af, beta, nSample, targetLife, confidence, bx, goal, tTestUser);
    const tradeoff = Acceleration.calcTradeoff(af, beta, targetLife, 1 - bx/100, confidence/100);
    const afVsStress = Acceleration.generateAFvsStress(model, afParams);
    renderAccResult(af, modelLabel, formulaResult, tradeoff, beta, nSample, targetLife, bx, goal, model, afVsStress, afParams);
}

function renderAccResult(af, modelLabel, formulaResult, tradeoff, beta, n, targetLife, bx, goal, model, afVsStress, afParams) {
    const goalResults = calcGoalResults(af, beta, n, targetLife, confidence_from_ui(), bx, goal);
    const afChartHtml = (afVsStress && afVsStress.length > 0) ? `
        <div style="margin-top:1.25rem">
            <h4 style="color:var(--text-secondary);margin-bottom:0.75rem">스트레스별 가속 계수 (AF)</h4>
            <div class="chart-container" style="height:250px"><canvas id="acc-af-chart"></canvas></div>
        </div>` : '';
    document.getElementById('acc-result').innerHTML = `
        <h3 class="section-title">계산 결과 — ${modelLabel}</h3>
        ${renderDynamicCards(af, goal, goalResults, bx)}
        <div class="accordion" style="margin-top:1rem">
            <div class="accordion-header" onclick="this.parentElement.classList.toggle('open')">📐 계산 과정 (수식 참조) <span class="accordion-arrow">▼</span></div>
            <div class="accordion-body">
                <div class="info-box" style="margin-bottom:0.5rem;font-size:0.8rem">
                    입력된 파라미터 기반 가속 수명 역산 도출 과정입니다.
                </div>
                <div class="formula-section" style="border:none;padding:0;background:none">\n${formulaResult.steps}</div>
            </div>
        </div>
        <div style="margin-top:1.25rem">
            <h4 style="color:var(--text-secondary);margin-bottom:0.75rem">시료수 vs 시험 시간 트레이드오프</h4>
            <div class="chart-container" style="height:300px"><canvas id="acc-tradeoff-chart"></canvas></div>
        </div>
        ${afChartHtml}`;
    setTimeout(() => {
        ChartManager.drawTradeoff('acc-tradeoff-chart', tradeoff);
        if (afVsStress && afVsStress.length > 0) {
            const xLabels = { arrhenius:'온도 (°C)', eyring:'온도 (°C)', peck:'습도 (%RH)', coffin_manson:'ΔT (°C)', norris_landzberg:'ΔT (°C)', inverse_power:'스트레스 레벨', arrhenius_power:'온도 (°C)' };
            const cs = afParams?.tStress || afParams?.dtStress || afParams?.vStress || null;
            ChartManager.drawAFvsStress('acc-af-chart', afVsStress, xLabels[model] || '스트레스', cs);
        }
    }, 100);
}

function renderDynamicCards(af, goal, gr, bx) {
    let topCards = '';
    if (goal === 'test_time') {
        topCards = `
            <div class="stat-card"><div class="label">B${bx} 보증 수명</div><div class="value">${gr.bxLife.toLocaleString()} h</div></div>
            <div class="stat-card" style="border-left:4px solid var(--warning)"><div class="label" style="font-weight:700">필요 시험 시간</div><div class="value warning" style="font-size:1.3rem">${gr.tTest.toLocaleString()} h</div></div>
        `;
    } else if (goal === 'sample_size') {
        topCards = `
            <div class="stat-card"><div class="label">B${bx} 보증 수명</div><div class="value">${gr.bxLife.toLocaleString()} h</div></div>
            <div class="stat-card" style="border-left:4px solid var(--warning)"><div class="label" style="font-weight:700">필요 시료 수</div><div class="value warning" style="font-size:1.3rem">${gr.nReq} 개</div></div>
        `;
    } else if (goal === 'life') {
        topCards = `
            <div class="stat-card"><div class="label">사용 시료 수</div><div class="value">${gr.nReq} 개</div></div>
            <div class="stat-card" style="border-left:4px solid var(--success)"><div class="label" style="font-weight:700">보증 가능 수명 B${bx}</div><div class="value success" style="font-size:1.3rem">${gr.bxLife.toLocaleString()} h</div></div>
        `;
    }

    return `
        <div class="grid-4" style="margin-bottom:1.25rem">
            <div class="stat-card"><div class="label">가속 계수 (AF)</div><div class="value accent">${af.toFixed(3)}</div></div>
            <div class="stat-card"><div class="label">척도모수 η<sub>use</sub></div><div class="value">${gr.etaUse.toLocaleString()}</div></div>
            ${topCards}
        </div>
    `;
}

function confidence_from_ui() {
    const el = document.getElementById('acc-confidence');
    return el ? parseFloat(el.value) : 90;
}

// ── 계산 목표별 결과 계산 ──
function calcGoalResults(af, beta, n, targetLife, confidence, bx, goal) {
    const C = confidence / 100;
    // chi-square (p, df=2) - JStat or fallback 5.991
    const chi2 = (typeof jStat !== 'undefined') ? jStat.chisquare.inv(C, 2) : 5.991;
    const bxFrac = bx / 100;
    
    // UI에서 "시험 시간" 텍스트박스 값 추출. (목표가 sample_size/life일 때 존재, 아니면 1000 fallback)
    const tTestUser = parseFloat(document.getElementById('acc-test-time')?.value || '1000');
    // η_use 계산
    const etaUse = targetLife / Math.pow(-Math.log(1 - bxFrac), 1/beta);

    let resOpts = { tTest: 0, etaUse: 0, bxLife: 0, nReq: n };

    if (goal === 'test_time') {
        resOpts.etaUse = Math.round(etaUse);
        resOpts.tTest = Math.round((1/af) * Math.pow((chi2 * Math.pow(etaUse, beta)) / (2 * Math.max(n, 1)), 1/beta));
        resOpts.bxLife = targetLife; // test_time 목표 시 보증 수명은 사용자의 입력(targetLife)과 정확히 매치됨
        resOpts.nReq = n;
    } else if (goal === 'sample_size') {
        resOpts.etaUse = Math.round(etaUse);
        const numerator = chi2 * Math.pow(etaUse, beta);
        const denominator = 2 * Math.pow(tTestUser * af, beta);
        resOpts.nReq = Math.ceil(numerator / denominator);
        resOpts.bxLife = targetLife;
        resOpts.tTest = tTestUser;
    } else if (goal === 'life') {
        const certifiedLife = af * tTestUser * Math.pow(-Math.log(1 - bxFrac), 1/beta) / Math.pow(chi2/(2 * Math.max(n, 1)), 1/beta);
        resOpts.bxLife = Math.round(certifiedLife);
        resOpts.etaUse = Math.round(certifiedLife / Math.pow(-Math.log(1 - bxFrac), 1/beta));
        resOpts.tTest = tTestUser;
        resOpts.nReq = n;
    }

    return resOpts;
}



// ═══════════════════════════════════════════
// Warranty 분석 탭
// ═══════════════════════════════════════════
let warrantyState = { step: 'input', fits: [], selectedFit: null, preprocessed: null, forecastResult: null };

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
            <p style="color:var(--text-secondary);font-size:0.8rem;margin:0">Nevada 차트 입력 → 분포 적합 → 고장 예측</p>
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
    if (step === 'forecast' && warrantyState.forecastResult) setTimeout(drawWarrantyCharts, 100);
}

function renderWarrantyInput() {
    return `
    <div style="display:flex;flex-direction:column;gap:1rem">
        <div class="glass-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;flex-wrap:wrap;gap:0.5rem">
                <h3 class="section-title" style="margin:0">Nevada 차트 데이터 입력</h3>
                <div style="display:flex;gap:0.4rem">
                    <button class="btn btn-sm btn-secondary" onclick="fillWarrantySample()">📋 샘플 데이터</button>
                    <button class="btn btn-sm btn-secondary" onclick="clearWarrantyGrid()">초기화</button>
                </div>
            </div>

            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;line-height:1.6">
                <strong>행</strong> = 코호트(생산월), <strong>1열</strong> = 판매 수량, <strong>2열~</strong> = 서비스 개월별 고장 수<br>
                엑셀에서 <strong>복사(Ctrl+C) → 붙여넣기(Ctrl+V)</strong> 가능합니다.
            </div>

            <!-- Handsontable 그리드 -->
            <div id="warranty-hot-grid" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;height:260px"></div>

            <div class="grid-2" style="margin-top:0.85rem">
                <div>
                    ${HelpTooltip.labelWithHelp('보증 기간 (개월)', '미입력 시 전체 기간')}
                    <input type="number" id="warranty-months" class="input-field" placeholder="예: 24" min="1">
                </div>
                <div style="display:flex;align-items:flex-end">
                    <button class="btn btn-primary" style="width:100%;min-height:44px" onclick="runWarrantyPreprocess()">▶ 분석 시작</button>
                </div>
            </div>
        </div>

        <div class="glass-card" style="padding:1rem">
            <h4 class="section-title" style="font-size:0.9rem;margin-bottom:0.5rem">💡 입력 가이드</h4>
            <div style="font-size:0.8rem;line-height:1.8;color:var(--text-secondary)">
                <div style="background:rgba(0,0,0,0.3);border-radius:8px;padding:0.75rem;font-family:monospace;font-size:0.72rem;overflow-x:auto;margin-bottom:0.5rem">
                    <table style="border-collapse:collapse;width:100%">
                        <thead><tr><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--purple)">판매수량</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--accent-color)">1개월</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--accent-color)">2개월</th><th style="padding:4px 8px;border-bottom:1px solid var(--border-color);color:var(--accent-color)">3개월</th></tr></thead>
                        <tbody>
                            <tr><td style="padding:4px 8px;color:var(--purple)">1623</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">7</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">11</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">12</td></tr>
                            <tr><td style="padding:4px 8px;color:var(--purple)">3723</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">2</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">7</td><td style="padding:4px 8px;text-align:center;color:var(--danger)">11</td></tr>
                        </tbody>
                    </table>
                </div>
                <div class="info-box" style="border-color:rgba(245,158,11,0.3);color:var(--warning);font-size:0.8rem">⚠️ 각 행의 고장 합계가 해당 기간의 판매 수량을 초과하지 않아야 합니다.</div>
            </div>
        </div>
    </div>`;
}

let _warrantyHot = null;

function initWarrantyGrid() {
    const container = document.getElementById('warranty-hot-grid');
    if (!container || _warrantyHot) return;

    // 초기 데이터: 7행 12열 (판매수량 + 11개월)
    const cols = 12;
    const rows = 7;
    const data = Array.from({length: rows}, () => Array(cols).fill(null));
    const colHeaders = ['판매수량', ...Array.from({length: cols - 1}, (_, i) => `${i + 1}개월`)];

    _warrantyHot = new Handsontable(container, {
        data,
        colHeaders,
        rowHeaders: true,
        height: 240,
        width: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        contextMenu: ['row_above', 'row_below', 'remove_row', '---------', 'undo', 'redo']
    });
}

function clearWarrantyGrid() {
    if (_warrantyHot) {
        const rows = _warrantyHot.countRows();
        const cols = _warrantyHot.countCols();
        const empty = Array.from({length: rows}, () => Array(cols).fill(null));
        _warrantyHot.loadData(empty);
    }
}

function fillWarrantySample() {
    if (!_warrantyHot) initWarrantyGrid();
    if (!_warrantyHot) return;

    const sampleData = [
        [1623, 7,11,12,15,18,20,27,29,24,27,29],
        [3723, 2, 7,11,17,20,25,30,33,38,42,46],
        [1319, 1, 4, 6, 7, 9,11,14,14,17,10,null],
        [3600, 2, 6,12,15,20,25,28,33,36,41,null],
        [3298, 0, 6,10,14,19,22,26,30,40,43,null],
        [1333, 0, 3, 4, 6, 7, 9,11,12,13,null,null],
        [1584, 0, 0, 3, 4, 6, 5, 7, 9,11,null,null],
    ];
    _warrantyHot.loadData(sampleData);
    const wm = document.getElementById('warranty-months');
    if (wm) wm.value = '24';
}

function runWarrantyPreprocess() {
    if (!_warrantyHot) { showWarrantyError('데이터를 입력하세요.'); return; }

    const rawData = _warrantyHot.getData();
    // 유효한 행만 추출 (판매수량이 있는 행)
    const sales = [];
    const matrixRows = [];
    for (const row of rawData) {
        const saleVal = parseFloat(row[0]);
        if (!isFinite(saleVal) || saleVal <= 0) continue;
        sales.push(saleVal);
        const failRow = row.slice(1).map(v => {
            const n = parseFloat(v);
            return isFinite(n) ? n : 0;
        });
        // 끝의 0 제거
        while (failRow.length > 0 && failRow[failRow.length - 1] === 0 && !row[failRow.length]) failRow.pop();
        matrixRows.push(failRow);
    }

    const wm = parseInt(document.getElementById('warranty-months')?.value) || null;
    if (sales.length === 0) { showWarrantyError('판매 수량을 입력하세요 (1열).'); return; }
    if (matrixRows.length === 0) { showWarrantyError('고장 데이터를 입력하세요.'); return; }

    const result = WarrantyAnalysis.preprocessNevada(sales, matrixRows, wm);
    warrantyState.preprocessed = result;
    warrantyState.warrantyMonths = wm;
    if (result.failures.length < 3) { showWarrantyError(`고장 데이터가 ${result.failures.length}개로 너무 적습니다 (최소 3개).`); return; }
    warrantyState.fits = WarrantyAnalysis.fitDistributions(result.failures, result.rightCensored);
    warrantyState.selectedFit = warrantyState.fits.find(f => f.best) || warrantyState.fits[0] || null;
    hideWarrantyError();
    warrantyGoStep('fitted');
}

function showWarrantyError(msg) { const el = document.getElementById('warranty-error'); if (el) { el.style.display = 'block'; el.innerHTML = `<div class="info-box" style="border-color:var(--danger);color:var(--danger);margin-bottom:1rem">⚠️ ${msg}</div>`; } }
function hideWarrantyError() { const el = document.getElementById('warranty-error'); if (el) el.style.display = 'none'; }

function renderWarrantyFitted() {
    const s = warrantyState.preprocessed?.summary;
    const fits = warrantyState.fits;
    const dc = { weibull:'var(--accent-color)', lognormal:'var(--success)', normal:'var(--purple)', exponential:'var(--warning)' };
    return `
    <div class="grid-4" style="margin-bottom:1rem">
        <div class="stat-card"><div class="label">총 분석 단위</div><div class="value">${(s?.totalUnits||0).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">총 고장</div><div class="value" style="color:var(--danger)">${(s?.totalFailures||0).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">관측중단</div><div class="value" style="color:var(--accent-color)">${(s?.totalCensored||0).toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">고장률</div><div class="value" style="color:var(--warning)">${(s?.failureRatePct||0).toFixed(2)}%</div></div>
    </div>
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">분포 적합 결과 (AICc 기준)</h3>
        <div class="table-wrapper"><table><thead><tr><th class="table-header"></th><th class="table-header">분포</th><th class="table-header">AICc</th><th class="table-header">MTTF</th><th class="table-header">B10</th></tr></thead>
        <tbody>${fits.map(f => `<tr onclick="selectWarrantyFit('${f.name}')" style="cursor:pointer;background:${warrantyState.selectedFit?.name===f.name?'rgba(167,139,250,0.1)':'transparent'}">
            <td class="table-cell">${f.best?'<span class="badge badge-purple">✓ 최적</span>':''}</td>
            <td class="table-cell" style="font-weight:${warrantyState.selectedFit?.name===f.name?'700':'400'};color:${dc[f.name]||'var(--text-primary)'}">${f.displayName}</td>
            <td class="table-cell">${f.aicc===Infinity?'-':f.aicc.toFixed(2)}</td>
            <td class="table-cell">${f.mttf?f.mttf.toFixed(2):'-'}</td>
            <td class="table-cell">${f.b10?f.b10.toFixed(2):'-'}</td></tr>`).join('')}</tbody></table></div>
    </div>
    ${warrantyState.selectedFit ? `<div class="glass-card" style="margin-bottom:1rem"><h3 class="section-title">선택: ${warrantyState.selectedFit.displayName}</h3><div class="grid-4">${Object.entries(warrantyState.selectedFit.params).map(([k,v]) => `<div class="stat-card"><div class="label">${k}</div><div class="value" style="font-size:1.2rem">${Number(v).toFixed(4)}</div></div>`).join('')}</div></div>` : ''}
    <div style="display:flex;gap:0.75rem"><button class="btn btn-secondary" onclick="warrantyGoStep('input')">← 데이터 재입력</button><button class="btn btn-primary" style="flex:1" onclick="warrantyGoStep('forecast')" ${!warrantyState.selectedFit?'disabled':''}>예측 시뮬레이션 →</button></div>`;
}

function selectWarrantyFit(name) { warrantyState.selectedFit = warrantyState.fits.find(f => f.name === name) || null; warrantyGoStep('fitted'); }

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
        warrantyState.forecastResult = WarrantyAnalysis.forecast(sel.name, sel.params, existing, future, months, cost, wm);
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
    return `
    <div class="grid-2" style="margin-bottom:1rem">
        <div class="stat-card"><div class="label">총 예상 고장</div><div class="value" style="color:var(--danger)">${fr.totalFailures.toLocaleString()}대</div></div>
        <div class="stat-card"><div class="label">총 예상 비용</div><div class="value" style="color:var(--warning)">$${fr.totalCost.toLocaleString()}</div></div>
    </div>
    <div class="glass-card" style="margin-bottom:1rem"><h3 class="section-title">월별 예상 고장</h3><div class="chart-container" style="height:260px"><canvas id="warranty-bar-chart"></canvas></div></div>
    <div class="glass-card" style="margin-bottom:1rem"><h3 class="section-title">누적 고장/비용</h3><div class="chart-container" style="height:220px"><canvas id="warranty-cumul-chart"></canvas></div></div>
    <div class="glass-card"><h3 class="section-title">월별 상세</h3><div class="table-wrapper" style="max-height:250px;overflow-y:auto"><table><thead><tr><th class="table-header">월</th><th class="table-header">고장</th><th class="table-header">비용</th><th class="table-header">누적 고장</th><th class="table-header">누적 비용</th></tr></thead><tbody>${fr.monthly.map(r=>`<tr><td class="table-cell">${r.month}월</td><td class="table-cell" style="color:var(--danger)">${r.failures.toFixed(1)}</td><td class="table-cell" style="color:var(--warning)">$${r.cost.toLocaleString()}</td><td class="table-cell">${r.cumulativeFailures.toFixed(1)}</td><td class="table-cell">$${r.cumulativeCost.toLocaleString()}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function drawWarrantyCharts() {
    const fr = warrantyState.forecastResult;
    if (!fr) return;
    const labels = fr.monthly.map(r => `${r.month}월`);
    ChartManager.drawBar('warranty-bar-chart', labels, [{ label: '예상 고장', data: fr.monthly.map(r => r.failures), color: CONSTANTS.CHART_COLORS.danger }], '예측 월', '고장 수');
    ChartManager.drawDualAxis('warranty-cumul-chart', labels, { label: '누적 고장', data: fr.monthly.map(r => r.cumulativeFailures), color: CONSTANTS.CHART_COLORS.danger }, { label: '누적 비용($)', data: fr.monthly.map(r => r.cumulativeCost), color: CONSTANTS.CHART_COLORS.warning }, '예측 월');
}


// ═══════════════════════════════════════════
// 열화 분석 탭
// ═══════════════════════════════════════════
let degradState = { result: null, rawData: null };

function renderDegradationTab() {
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1rem">
        <div>
            <h2 class="section-title" style="margin-bottom:0.2rem">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
                열화 분석 (Degradation Analysis)
            </h2>
            <p style="color:var(--text-secondary);font-size:0.8rem;margin:0">시간에 따른 열화 경로 → 모델 적합 → 수명 예측</p>
        </div>
    </div>
    <div class="grid-cols-1-2">
        <div style="display:flex;flex-direction:column;gap:1rem">
            <div class="glass-card">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
                    <h3 class="section-title" style="margin:0">열화 데이터 입력</h3>
                    <button class="btn btn-sm btn-secondary" onclick="fillDegradSample()">📋 샘플 데이터</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:0.85rem">
                    ${HelpTooltip.labelWithHelp('데이터 (시료ID, 시간, 측정값)', '각 행: 시료ID, 시간, 측정값')}
                    <!-- Handsontable 그리드 -->
                    <div id="degrad-hot-grid" style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden"></div>
                    <div class="grid-3">
                        <div>
                            ${HelpTooltip.labelWithHelp('적합 모델', '수명 예측에 사용할 열화 모델')}
                            <select id="degrad-model-sel" class="input-field">
                                <option value="auto">최고 적합 (자동 추천)</option>
                                <option value="linear">선형 (Linear)</option>
                                <option value="exponential">지수 (Exponential)</option>
                                <option value="power">거듭제곱 (Power)</option>
                                <option value="log">로그 (Logarithmic)</option>
                                <option value="gompertz">곰페르츠 (Gompertz)</option>
                                <option value="lloyd">로이드-리포 (Lloyd-Lipow)</option>
                                <option value="sqrt">제곱근 (Square Root)</option>
                            </select>
                        </div>
                        <div>
                            ${HelpTooltip.labelWithHelp('임계값 (Threshold)', '열화가 이 값에 도달하면 고장으로 판정')}
                            <input type="number" id="degrad-threshold" class="input-field" value="50" step="1">
                        </div>
                        <div>
                            ${HelpTooltip.labelWithHelp('열화 방향', '측정값이 증가하면서 열화? 감소하면서 열화?')}
                            <select id="degrad-direction" class="input-field">
                                <option value="decreasing">감소 (값이 줄어듦)</option>
                                <option value="increasing">증가 (값이 늘어남)</option>
                            </select>
                        </div>
                    </div>
                    <button class="btn btn-primary" style="width:100%;min-height:44px" onclick="runDegradAnalysis()">▶ 분석 실행</button>
                </div>
            </div>
            <div class="glass-card">
                <h3 class="section-title">열화 분석이란?</h3>
                <div style="font-size:0.85rem;line-height:1.7;color:var(--text-secondary)">
                    <p>시간에 따라 성능이 저하(열화)되는 데이터를 분석하여 수명을 추정합니다.</p>
                    <p><strong>D(t) = a + b · g(t)</strong> 등 모델 적합 후 임계값 도달 시간을 추정합니다.</p>
                    <ul style="padding-left:1.2rem;margin:0.5rem 0">
                        <li>선형: g(t) = t</li>
                        <li>지수: y = b·exp(a·t)</li>
                        <li>거듭제곱: g(t) = t^p</li>
                        <li>로그/제곱근: ln(t), √t</li>
                        <li>곰페르츠/로이드-리포: 비선형/특수 패턴</li>
                    </ul>
                    <div class="info-box" style="border-color:rgba(245,158,11,0.3);color:var(--warning);font-size:0.8rem">📖 Ref: Meeker & Escobar (1998), Ch.21</div>
                </div>
            </div>
        </div>
        <div id="degrad-result">${degradState.result ? renderDegradResult() : '<div class="glass-card empty-state" style="min-height:400px"><div style="font-weight:600;color:var(--text-secondary)">데이터 입력 후 분석 실행</div><div style="font-size:0.8rem;color:var(--text-muted)">열화 경로, 모델 적합, 수명 예측 결과가 표시됩니다.</div></div>'}</div>
    </div>`;
}

let _degradHot = null;

function initDegradGrid() {
    const container = document.getElementById('degrad-hot-grid');
    if (!container || _degradHot) return;

    const data = Array.from({length: 10}, () => Array(3).fill(null));

    _degradHot = new Handsontable(container, {
        data,
        colHeaders: ['시료ID', '시간', '측정값'],
        columns: [{ type: 'text' }, { type: 'numeric' }, { type: 'numeric' }],
        rowHeaders: true,
        height: 240,
        width: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        stretchH: 'all',
        contextMenu: ['row_above', 'row_below', 'remove_row', '---------', 'undo', 'redo']
    });
}

function fillDegradSample() {
    // 전형적 절연 저항 열화 데이터 (감소 방향)
    const sample = [
        ['S1',0,100],['S1',200,97],['S1',400,92],['S1',600,86],['S1',800,78],['S1',1000,68],['S1',1200,56],['S1',1400,43],
        ['S2',0,100],['S2',200,96],['S2',400,90],['S2',600,83],['S2',800,74],['S2',1000,63],['S2',1200,51],['S2',1400,38],
        ['S3',0,100],['S3',200,98],['S3',400,94],['S3',600,89],['S3',800,82],['S3',1000,73],['S3',1200,62],['S3',1400,49],
        ['S4',0,100],['S4',200,95],['S4',400,88],['S4',600,80],['S4',800,70],['S4',1000,58],['S4',1200,44],
        ['S5',0,100],['S5',200,97],['S5',400,93],['S5',600,87],['S5',800,80],['S5',1000,71],['S5',1200,60],['S5',1400,47],
    ];
    if (_degradHot) {
        _degradHot.loadData(sample);
    }
    document.getElementById('degrad-threshold').value = '50';
    document.getElementById('degrad-direction').value = 'decreasing';
}

function runDegradAnalysis() {
    const hotData = _degradHot ? _degradHot.getData() : [];
    const text = hotData.filter(r => r[0] && r[1] !== null && r[2] !== null).map(r => r.join(',')).join('\n');
    const threshold = parseFloat(document.getElementById('degrad-threshold').value);
    const direction = document.getElementById('degrad-direction').value;
    const modelSel = document.getElementById('degrad-model-sel').value;

    if (!text.trim()) { alert('데이터를 입력하세요.'); return; }
    if (isNaN(threshold)) { alert('임계값을 입력하세요.'); return; }

    const data = DegradationAnalysis.parseData(text);
    if (data.length < 2) { alert('유효한 데이터가 2개 이상 필요합니다.'); return; }

    degradState.rawData = data;
    degradState.result = DegradationAnalysis.analyze(data, threshold, direction, modelSel);

    document.getElementById('degrad-result').innerHTML = renderDegradResult();
    setTimeout(drawDegradCharts, 150);
}

function renderDegradResult() {
    const r = degradState.result;
    if (!r) return '';
    const s = r.summary;
    const ld = r.lifetimeDist;
    const dc = { linear: 'var(--accent-color)', sqrt: 'var(--success)', log: 'var(--purple)', power: 'var(--warning)' };

    return `
    <div class="grid-4" style="margin-bottom:1rem">
        <div class="stat-card"><div class="label">시료 수</div><div class="value">${s.nUnits}</div></div>
        <div class="stat-card"><div class="label">데이터 포인트</div><div class="value">${s.nPoints}</div></div>
        <div class="stat-card"><div class="label">중앙 수명</div><div class="value" style="color:var(--accent-color)">${s.medianLifetime ? s.medianLifetime.toFixed(1) : '-'}</div></div>
        <div class="stat-card"><div class="label">평균 수명</div><div class="value" style="color:var(--success)">${s.meanLifetime ? s.meanLifetime.toFixed(1) : '-'}</div></div>
    </div>
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">열화 경로</h3>
        <div class="chart-container" style="height:300px"><canvas id="degrad-path-chart"></canvas></div>
    </div>
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">시료별 추정 수명</h3>
        <div class="table-wrapper"><table><thead><tr>
            <th class="table-header">시료</th><th class="table-header">최적 모델</th><th class="table-header">R²</th><th class="table-header">추정 수명</th>
        </tr></thead><tbody>${r.units.map(u => `<tr>
            <td class="table-cell" style="font-weight:600">${u.id}</td>
            <td class="table-cell" style="color:${dc[u.bestModel?.model]||'var(--text-primary)'}">${u.bestModel?.label || '-'}</td>
            <td class="table-cell">${u.bestModel?.r2 !== undefined ? u.bestModel.r2.toFixed(4) : '-'}</td>
            <td class="table-cell" style="color:var(--accent-color);font-weight:600">${u.lifetime !== null ? u.lifetime.toFixed(1) : '∞'}</td>
        </tr>`).join('')}</tbody></table></div>
    </div>
    ${r.lifetimes.length >= 3 ? `
    <div class="glass-card" style="margin-bottom:1rem">
        <h3 class="section-title">추정 수명 분포</h3>
        <div class="chart-container" style="height:220px"><canvas id="degrad-lifetime-chart"></canvas></div>
        ${ld ? `<div class="grid-4" style="margin-top:0.75rem">
            <div class="stat-card"><div class="label">분포</div><div class="value" style="font-size:1rem">${ld.distribution}</div></div>
            <div class="stat-card"><div class="label">β (형상)</div><div class="value" style="font-size:1.1rem">${ld.beta.toFixed(4)}</div></div>
            <div class="stat-card"><div class="label">η (척도)</div><div class="value" style="font-size:1.1rem">${ld.eta.toFixed(2)}</div></div>
            <div class="stat-card"><div class="label">B10</div><div class="value" style="font-size:1.1rem;color:var(--accent-color)">${ld.b10.toFixed(2)}</div></div>
        </div>` : ''}
    </div>` : ''}
    <div class="glass-card">
        <h3 class="section-title">글로벌 모델 비교 (전체 데이터)</h3>
        <div class="table-wrapper"><table><thead><tr>
            <th class="table-header"></th><th class="table-header">모델</th><th class="table-header">a</th><th class="table-header">b</th><th class="table-header">R²</th>
        </tr></thead><tbody>${r.globalModels.map(m => `<tr style="background:${m.best?'rgba(56,189,248,0.08)':'transparent'}">
            <td class="table-cell">${m.best?'<span class="badge badge-info">✓ 최적</span>':''}</td>
            <td class="table-cell" style="color:${dc[m.model]||'var(--text-primary)'};font-weight:${m.best?'700':'400'}">${m.label}</td>
            <td class="table-cell">${m.a.toFixed(4)}</td>
            <td class="table-cell">${m.b.toFixed(6)}</td>
            <td class="table-cell" style="font-weight:600">${m.r2.toFixed(6)}</td>
        </tr>`).join('')}</tbody></table></div>
    </div>`;
}

function drawDegradCharts() {
    const r = degradState.result;
    if (!r) return;

    // 열화 경로 차트: 시료별 실측 + 최적 모델 예측선
    const UNIT_COLORS = ['#38bdf8','#22c55e','#a78bfa','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
    const groups = DegradationAnalysis.groupByUnit(degradState.rawData);
    const unitIds = Object.keys(groups);
    const tMax = Math.max(...degradState.rawData.map(d => d.time)) * 1.3;

    const datasets = [];
    unitIds.forEach((id, i) => {
        const color = UNIT_COLORS[i % UNIT_COLORS.length];
        // 실측 데이터 (점)
        datasets.push({
            label: id,
            data: groups[id].map(p => ({ x: p.time, y: p.value })),
            borderColor: color,
            backgroundColor: color,
            pointRadius: 4,
            showLine: false,
            pointStyle: 'circle',
        });
        // 적합 모델 (선) — 해당 시료의 최적 모델
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

    // 임계선
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

    const ctx = document.getElementById('degrad-path-chart');
    if (ctx) {
        ChartManager.destroy('degrad-path-chart');
        const chart = new Chart(ctx, {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 }, filter: item => !item.text.endsWith(' fit') }},
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: '시간', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' }},
                    y: { title: { display: true, text: '측정값', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' }},
                },
            },
        });
        ChartManager._charts['degrad-path-chart'] = chart;
    }

    // 추정 수명 분포 차트
    if (r.lifetimes.length >= 3 && r.lifetimeDist) {
        const ld = r.lifetimeDist;
        const D = Distributions;
        const ltMax = Math.max(...r.lifetimes) * 1.5;
        const xVals = Array.from({ length: 100 }, (_, i) => ltMax * (i + 1) / 100);
        const cdfVals = xVals.map(t => D.Weibull.cdf(t, ld.eta, ld.beta));


        ChartManager.createOrUpdate('degrad-lifetime-chart', {
            type: 'line',
            data: {
                labels: xVals.map(v => v.toFixed(0)),
                datasets: [
                    {
                        label: 'F(t) 추정 수명 분포',
                        data: cdfVals,
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
                    x: { title: { display: true, text: '추정 수명' }, ticks: { maxTicksLimit: 12 } },
                    y: { title: { display: true, text: 'F(t)' }, min: 0, max: 1, ticks: { callback: v => (v*100).toFixed(0) + '%' } },
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
}

// ═══════════════════════════════════════════
// 앱 초기화
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    switchTab('analysis');
});
